import { prisma } from '../common/db/prisma';
import { runQuery } from '../common/db/neo4j';
import { logger } from '../common/logger';
import { Property, BuyingPreference } from '@prisma/client';

const PRICE_TOLERANCE = 0.30; // ±30% price range
const LOCATION_MAX_KM = 50;   // Max distance for location match

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPriceScore(priceA: number, priceB: number, preferences: BuyingPreference[]): number {
  // Check if property A's owner's preferences match property B's price
  const matchingPref = preferences.find(
    (p) =>
      (!p.minPrice || priceB >= p.minPrice) &&
      (!p.maxPrice || priceB <= p.maxPrice)
  );
  if (matchingPref) return 1.0;

  // Fallback: score by relative difference
  const diff = Math.abs(priceA - priceB) / Math.max(priceA, priceB);
  if (diff <= 0.10) return 0.9;
  if (diff <= 0.20) return 0.7;
  if (diff <= 0.30) return 0.5;
  if (diff <= 0.50) return 0.3;
  return 0.0;
}

function calcLocationScore(
  prop: Property,
  preferences: BuyingPreference[]
): number {
  const cityMatch = preferences.some(
    (p) => p.preferredCity.toLowerCase() === prop.city.toLowerCase()
  );
  if (cityMatch) return 1.0;

  const stateMatch = preferences.some(
    (p) => p.preferredState.toLowerCase() === prop.state.toLowerCase()
  );
  return stateMatch ? 0.5 : 0.0;
}

function calcPropertyTypeScore(
  prop: Property,
  preferences: BuyingPreference[]
): number {
  const typeMatch = preferences.some(
    (p) => !p.propertyType || p.propertyType === prop.propertyType
  );
  return typeMatch ? 1.0 : 0.3;
}

function calcCommitmentBonus(commitmentLevel: string): number {
  switch (commitmentLevel) {
    case 'READY_TO_CLOSE': return 1.0;
    case 'SERIOUS': return 0.7;
    case 'EXPLORING': return 0.3;
    default: return 0.3;
  }
}

export class GraphEdgeBuilder {
  async buildEdgesForProperty(propertyId: string): Promise<number> {
    const sourceProperty = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        owner: {
          include: { buyingPreferences: { where: { isActive: true } } },
        },
      },
    });

    if (!sourceProperty?.isActive) return 0;

    const ownerPreferences = sourceProperty.owner.buyingPreferences;
    if (!ownerPreferences.length) return 0;

    // Find candidate target properties
    const preferredCities = [...new Set(ownerPreferences.map((p) => p.preferredCity))];
    const candidateTargets = await prisma.property.findMany({
      where: {
        id: { not: propertyId },
        isActive: true,
        city: { in: preferredCities },
      },
      take: 1000, // Batch size
    });

    let edgesCreated = 0;

    for (const target of candidateTargets) {
      const priceScore = calcPriceScore(sourceProperty.price, target.price, ownerPreferences);
      if (priceScore === 0) continue; // Price incompatible, skip

      const locationScore = calcLocationScore(target, ownerPreferences);
      const propertyTypeScore = calcPropertyTypeScore(target, ownerPreferences);
      const userPreferenceScore = (priceScore + locationScore + propertyTypeScore) / 3;
      const likeSignal = 0; // Populated via like events
      const commitmentBonus = calcCommitmentBonus(sourceProperty.commitmentLevel);

      const totalScore =
        priceScore * 0.35 +
        locationScore * 0.30 +
        propertyTypeScore * 0.20 +
        userPreferenceScore * 0.10 +
        likeSignal * 0.05;

      if (totalScore < 0.3) continue; // Not worth creating edge

      // Upsert edge in PostgreSQL
      await prisma.graphEdge.upsert({
        where: {
          sourcePropertyId_targetPropertyId: {
            sourcePropertyId: propertyId,
            targetPropertyId: target.id,
          },
        },
        create: {
          sourcePropertyId: propertyId,
          targetPropertyId: target.id,
          priceMatchScore: priceScore,
          locationMatchScore: locationScore,
          propertyTypeScore,
          userPreferenceScore,
          likeSignal,
          totalScore,
        },
        update: {
          priceMatchScore: priceScore,
          locationMatchScore: locationScore,
          propertyTypeScore,
          userPreferenceScore,
          totalScore,
        },
      });

      // Sync to Neo4j
      await this.syncEdgeToNeo4j(propertyId, target.id, totalScore);
      edgesCreated++;
    }

    logger.debug(`Built ${edgesCreated} edges for property ${propertyId}`);
    return edgesCreated;
  }

  async buildAllEdges(): Promise<{ edgesCreated: number; propertiesProcessed: number }> {
    const BATCH_SIZE = 500;
    let skip = 0;
    let totalEdges = 0;
    let propertiesProcessed = 0;

    while (true) {
      const batch = await prisma.property.findMany({
        where: { isActive: true },
        select: { id: true },
        take: BATCH_SIZE,
        skip,
      });

      if (!batch.length) break;

      for (const { id } of batch) {
        const edges = await this.buildEdgesForProperty(id);
        totalEdges += edges;
        propertiesProcessed++;
      }

      skip += BATCH_SIZE;
      logger.info(`Edge building progress: ${propertiesProcessed} properties processed`);
    }

    return { edgesCreated: totalEdges, propertiesProcessed };
  }

  private async syncEdgeToNeo4j(fromId: string, toId: string, score: number): Promise<void> {
    try {
      await runQuery(
        `MATCH (a:Property {id: $fromId}), (b:Property {id: $toId})
         MERGE (a)-[r:INTERESTED_IN]->(b)
         SET r.score = $score, r.updatedAt = datetime()`,
        { fromId, toId, score }
      );
    } catch (err) {
      logger.warn(`Failed to sync edge to Neo4j: ${fromId} -> ${toId}`);
    }
  }
}

export const graphEdgeBuilder = new GraphEdgeBuilder();
