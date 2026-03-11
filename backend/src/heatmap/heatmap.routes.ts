import { Router, Response, NextFunction } from 'express';
import { heatmapService } from './heatmap.worker';
import { authenticate, requireAdmin } from '../common/middleware/auth';

const router = Router();

// GET /heatmap - Public heatmap data
router.get('/', async (req, res: Response, next: NextFunction) => {
  try {
    const bounds = req.query.swLat ? {
      swLat: Number(req.query.swLat),
      swLng: Number(req.query.swLng),
      neLat: Number(req.query.neLat),
      neLng: Number(req.query.neLng),
    } : undefined;

    const data = await heatmapService.getHeatmapData(bounds);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /heatmap/recompute (admin trigger)
router.post('/recompute', authenticate, requireAdmin, async (_req, res: Response, next: NextFunction) => {
  try {
    await heatmapService.recomputeHeatmap();
    res.json({ success: true, message: 'Heatmap recomputed' });
  } catch (err) { next(err); }
});

export default router;
