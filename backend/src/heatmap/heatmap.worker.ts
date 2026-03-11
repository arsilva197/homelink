import { prisma } from '../common/db/prisma';
import { cache } from '../common/db/redis';
import { logger } from '../common/logger';
import Bull from 'bull';

const GRID_SIZE_KM = 5;
const EARTH_RADIUS_KM = 6371;

function latToGridY(lat: number): number {
  return Math.floor((lat + 90) / (GRID_SIZE_KM / EARTH_RADIUS_KM * (180 / Math.PI)));
}

function lngToGridX(lng: number): number {
  return Math.floor((lng + 180) / (GRID_SIZE_KM / EARTH_RADIUS_KM * (180 / Math.PI)));
}

export class HeatmapService {
  async recomputeHeatmap(): Promise<void> {
    logger.info('🗺️  Recomputing liquidity heatmap...');

    const properties = await prisma.property.findMany({
      where: { isActive: true },
      select: { latitude: true, longitude: true, city: true, state: true },
    });

    // Group by grid cell
    const cellMap = new Map<string, {
      gridX: number; gridY: number; centerLat: number; centerLng: number;
      propertiesCount: number;
    }>();

    for (const prop of properties) {
      const gridX = latToGridY(prop.latitude);
      const gridY = lngToGridX(prop.longitude);
      const key = `${gridX}:${gridY}`;

      if (!cellMap.has(key)) {
        cellMap.set(key, {
          gridX, gridY,
          centerLat: prop.latitude,
          centerLng: prop.longitude,
          propertiesCount: 0,
        });
      }
      cellMap.get(key)!.propertiesCount++;
    }

    // Count edges per cell
    const edges = await prisma.graphEdge.findMany({
      select: { sourcePropertyId: true },
    });

    // Count chains per region
    const chains = await prisma.chainOpportunity.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'APPROVED', 'ASSIGNED_TO_BROKER'] } },
      select: { region: true },
    });

    // Upsert heatmap cells
    const updates = [];
    for (const [, cell] of cellMap) {
      const edgesCount = edges.filter(() => true).length; // simplified
      const chainCount = 0; // simplified

      const liquidityScore =
        cell.propertiesCount * 1.0 +
        edgesCount * 0.5 +
        chainCount * 2.0;

      updates.push(
        prisma.heatmapCell.upsert({
          where: { gridX_gridY: { gridX: cell.gridX, gridY: cell.gridY } },
          create: {
            gridX: cell.gridX,
            gridY: cell.gridY,
            centerLat: cell.centerLat,
            centerLng: cell.centerLng,
            gridSizeKm: GRID_SIZE_KM,
            propertiesCount: cell.propertiesCount,
            edgesCount,
            chainCount,
            liquidityScore,
          },
          update: {
            propertiesCount: cell.propertiesCount,
            edgesCount,
            chainCount,
            liquidityScore,
          },
        })
      );
    }

    await Promise.all(updates);
    await cache.del('heatmap:data');
    logger.info(`✅ Heatmap updated: ${cellMap.size} cells`);
  }

  async getHeatmapData(bounds?: {
    swLat: number; swLng: number; neLat: number; neLng: number;
  }) {
    const cacheKey = bounds
      ? `heatmap:bounded:${JSON.stringify(bounds)}`
      : 'heatmap:data';

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const cells = await prisma.heatmapCell.findMany({
      orderBy: { liquidityScore: 'desc' },
      take: 10000,
    });

    const maxScore = Math.max(...cells.map((c) => c.liquidityScore), 1);

    const data = cells.map((cell) => ({
      lat: cell.centerLat,
      lng: cell.centerLng,
      intensity: cell.liquidityScore / maxScore,
      propertiesCount: cell.propertiesCount,
      edgesCount: cell.edgesCount,
      chainCount: cell.chainCount,
      liquidityScore: cell.liquidityScore,
    }));

    await cache.set(cacheKey, data, 300); // 5-min cache
    return data;
  }
}

export const heatmapService = new HeatmapService();

// ─── Heatmap Worker ──────────────────────────────────────────────────────────

const heatmapQueue = new Bull('heatmap', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
});

heatmapQueue.process(async () => {
  await heatmapService.recomputeHeatmap();
});

export async function startHeatmapWorker(): Promise<void> {
  await heatmapQueue.add({}, {
    repeat: { every: 10 * 60 * 1000 }, // every 10 minutes
    jobId: 'heatmap-recurring',
  });
  logger.info('Heatmap worker scheduled every 10 minutes');
}
