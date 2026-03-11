import { runQuery } from '../common/db/neo4j';
import { prisma } from '../common/db/prisma';
import { logger } from '../common/logger';
import { io } from '../index';
import { NotificationType } from '@prisma/client';

const MIN_CPS = 0.60;
const MAX_CHAIN_SIZE = 5;
const MIN_CHAIN_SIZE = 2;
const CHAIN_TTL_DAYS = 30;

interface DetectedChain {
  propertyIds: string[];
  size: number;
  avgScore: number;
}

interface CPSComponents {
  priceScore: number;
  preferenceScore: number;
  userCommitment: number;
  liquidityScore: number;
  stabilityScore: number;
}

export class ChainMatchingEngine {
  /**
   * Detect cycles (transaction chains) in the graph using Neo4j
   * Uses variable-length path matching with APOC cycle detection
   */
  async detectChains(): Promise<DetectedChain[]> {
    const chains: DetectedChain[] = [];

    // Detect chains of size 2–5 using Neo4j path queries
    for (let size = MIN_CHAIN_SIZE; size <= MAX_CHAIN_SIZE; size++) {
      try {
        const result = await runQuery(
          `MATCH path = (start:Property)-[:INTERESTED_IN*${size}]->(start)
           WHERE ALL(r IN relationships(path) WHERE r.score >= 0.4)
           WITH nodes(path)[0..${size}] AS chain,
                [r IN relationships(path) | r.score] AS scores
           WITH chain, scores, reduce(s = 0, x IN scores | s + x) / size(scores) AS avgScore
           WHERE avgScore >= $minScore
           RETURN [p IN chain | p.id] AS propertyIds, avgScore
           ORDER BY avgScore DESC
           LIMIT 500`,
          { minScore: 0.4, size }
        );

        for (const record of result.records) {
          const propertyIds: string[] = record.get('propertyIds');
          const avgScore: number = record.get('avgScore');

          // Deduplicate (same chain, different starting node)
          const normalizedKey = [...propertyIds].sort().join('|');
          const isDuplicate = chains.some(
            (c) => [...c.propertyIds].sort().join('|') === normalizedKey
          );

          if (!isDuplicate) {
            chains.push({ propertyIds, size, avgScore });
          }
        }

        logger.info(`Detected ${chains.filter(c => c.size === size).length} chains of size ${size}`);
      } catch (err) {
        logger.error(`Chain detection error for size ${size}:`, err);
      }
    }

    return chains;
  }

  /**
   * Calculate Chain Probability Score
   */
  async calculateCPS(chain: DetectedChain): Promise<{ cps: number; components: CPSComponents }> {
    const properties = await prisma.property.findMany({
      where: { id: { in: chain.propertyIds } },
      include: {
        owner: {
          include: { buyingPreferences: { where: { isActive: true } } },
        },
      },
    });

    if (properties.length !== chain.propertyIds.length) {
      return { cps: 0, components: { priceScore: 0, preferenceScore: 0, userCommitment: 0, liquidityScore: 0, stabilityScore: 0 } };
    }

    // Price Compatibility Score: how well prices balance across the chain
    const prices = properties.map((p) => p.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const maxDeviation = Math.max(...prices.map((p) => Math.abs(p - avgPrice) / avgPrice));
    const priceScore = Math.max(0, 1 - maxDeviation);

    // Preference Match Score: % of participants whose preferences match their target
    let preferenceMatches = 0;
    for (let i = 0; i < properties.length; i++) {
      const current = properties[i];
      const next = properties[(i + 1) % properties.length];
      const prefs = current.owner.buyingPreferences;
      const matches = prefs.some(
        (p) =>
          p.preferredCity.toLowerCase() === next.city.toLowerCase() &&
          (!p.minPrice || next.price >= p.minPrice) &&
          (!p.maxPrice || next.price <= p.maxPrice)
      );
      if (matches) preferenceMatches++;
    }
    const preferenceScore = preferenceMatches / properties.length;

    // User Commitment Score: avg commitment level
    const commitmentValues: Record<string, number> = {
      READY_TO_CLOSE: 1.0,
      SERIOUS: 0.7,
      EXPLORING: 0.3,
    };
    const userCommitment =
      properties.reduce((sum, p) => sum + (commitmentValues[p.commitmentLevel] || 0.3), 0) /
      properties.length;

    // Liquidity Score: based on heatmap data for the region
    const cities = [...new Set(properties.map((p) => p.city))];
    const heatmapCells = await prisma.heatmapCell.findMany({ take: 10 });
    const liquidityScore = Math.min(1, heatmapCells.length > 0
      ? heatmapCells.reduce((sum, c) => sum + c.liquidityScore, 0) / heatmapCells.length / 100
      : 0.5);

    // Chain Stability Score: based on how long properties have been listed
    const avgAgeDays =
      properties.reduce((sum, p) => {
        const ageDays = (Date.now() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + ageDays;
      }, 0) / properties.length;
    const stabilityScore = Math.min(1, avgAgeDays / 30); // Penalize very new listings

    const cps =
      0.30 * priceScore +
      0.25 * preferenceScore +
      0.20 * userCommitment +
      0.15 * liquidityScore +
      0.10 * stabilityScore;

    return {
      cps: Math.round(cps * 1000) / 1000,
      components: { priceScore, preferenceScore, userCommitment, liquidityScore, stabilityScore },
    };
  }

  /**
   * Calculate Dynamic Price Bridge adjustments
   */
  calculatePriceBridge(properties: { id: string; price: number }[]): {
    adjustments: Array<{ fromId: string; toId: string; amount: number; direction: 'pay' | 'receive' }>;
    netByProperty: Record<string, number>;
  } {
    const avgPrice = properties.reduce((s, p) => s + p.price, 0) / properties.length;
    const adjustments = [];
    const netByProperty: Record<string, number> = {};

    for (let i = 0; i < properties.length; i++) {
      const current = properties[i];
      const next = properties[(i + 1) % properties.length];
      const diff = current.price - next.price;
      netByProperty[current.id] = (netByProperty[current.id] || 0) + diff;

      adjustments.push({
        fromId: current.id,
        toId: next.id,
        amount: Math.abs(diff),
        direction: diff > 0 ? 'receive' as const : 'pay' as const,
      });
    }

    return { adjustments, netByProperty };
  }

  /**
   * Process a detected chain and create an opportunity if CPS qualifies
   */
  async processChain(chain: DetectedChain): Promise<boolean> {
    const { cps, components } = await this.calculateCPS(chain);

    if (cps < MIN_CPS) {
      logger.debug(`Chain rejected (CPS ${cps} < ${MIN_CPS})`);
      return false;
    }

    const properties = await prisma.property.findMany({
      where: { id: { in: chain.propertyIds } },
      select: { id: true, price: true, city: true, state: true },
    });

    // Check if this exact chain already exists as a pending opportunity
    const existingChain = await prisma.chainOpportunity.findFirst({
      where: {
        status: { in: ['PENDING_REVIEW', 'APPROVED'] },
        participants: {
          every: { propertyId: { in: chain.propertyIds } },
        },
        chainSize: chain.size,
      },
    });

    if (existingChain) return false; // Already queued

    const priceBridge = this.calculatePriceBridge(properties);
    const totalValue = properties.reduce((s, p) => s + p.price, 0);
    const region = [...new Set(properties.map((p) => `${p.city}–${p.state}`))].join(', ');
    const expiresAt = new Date(Date.now() + CHAIN_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Create opportunity in DB
    const opportunity = await prisma.chainOpportunity.create({
      data: {
        chainSize: chain.size,
        cpsScore: cps,
        status: 'PENDING_REVIEW',
        region,
        totalValue,
        expiresAt,
        participants: {
          create: chain.propertyIds.map((propertyId, position) => ({ propertyId, position })),
        },
        priceBridge: {
          create: priceBridge.adjustments.map((adj) => ({
            fromPropertyId: adj.fromId,
            toPropertyId: adj.toId,
            adjustment: adj.amount,
            direction: adj.direction,
          })),
        },
      },
    });

    // Notify all admins via WebSocket
    await this.notifyAdmins(opportunity.id, cps, chain.size, region);

    logger.info(`✅ Opportunity created: ${opportunity.id} (CPS: ${cps}, size: ${chain.size})`);
    return true;
  }

  private async notifyAdmins(opportunityId: string, cps: number, chainSize: number, region: string) {
    // Find all admins
    const admins = await prisma.user.findMany({
      where: { roles: { hasSome: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.NEW_OPPORTUNITY,
          title: 'New Transaction Chain Detected',
          message: `A ${chainSize}-party chain in ${region} with CPS ${(cps * 100).toFixed(0)}% is ready for review.`,
          chainId: opportunityId,
        },
      });
    }

    // Real-time push via Socket.io
    try {
      io.to('admin-room').emit('new:opportunity', {
        opportunityId,
        cps,
        chainSize,
        region,
      });
    } catch {
      // io may not be available during startup
    }
  }

  async runFullMatchingCycle(): Promise<{
    chainsDetected: number;
    opportunitiesCreated: number;
    durationMs: number;
  }> {
    const start = Date.now();
    logger.info('🔄 Starting chain matching cycle...');

    const run = await prisma.matchingEngineRun.create({
      data: { startedAt: new Date() },
    });

    try {
      // Step 1: Build/refresh graph edges
      const { graphEdgeBuilder } = await import('../graph/edgeBuilder.service');
      const { edgesCreated, propertiesProcessed } = await graphEdgeBuilder.buildAllEdges();

      // Step 2: Detect cycles
      const chains = await this.detectChains();

      // Step 3: Score and create opportunities
      let opportunitiesCreated = 0;
      for (const chain of chains) {
        const created = await this.processChain(chain);
        if (created) opportunitiesCreated++;
      }

      const durationMs = Date.now() - start;

      await prisma.matchingEngineRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          propertiesScanned: propertiesProcessed,
          edgesCreated,
          chainsDetected: chains.length,
          opportunitiesCreated,
          durationMs,
          status: 'completed',
        },
      });

      logger.info(`✅ Matching cycle complete: ${chains.length} chains, ${opportunitiesCreated} opportunities (${durationMs}ms)`);
      return { chainsDetected: chains.length, opportunitiesCreated, durationMs };
    } catch (err) {
      await prisma.matchingEngineRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: String(err), completedAt: new Date() },
      });
      throw err;
    }
  }
}

export const chainMatchingEngine = new ChainMatchingEngine();
