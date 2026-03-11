import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../common/db/prisma';
import { runQuery } from '../common/db/neo4j';
import { authenticate, AuthRequest } from '../common/middleware/auth';
import { PropertyType } from '@prisma/client';

const router = Router();

const preferenceSchema = z.object({
  label: z.string().max(100).optional(),
  preferredCity: z.string().min(2),
  preferredState: z.string().min(2).max(2),
  preferredRegion: z.string().optional(),
  propertyType: z.nativeEnum(PropertyType).optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  minSizeM2: z.number().positive().optional(),
  maxSizeM2: z.number().positive().optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().optional(),
});

// GET /preferences
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const preferences = await prisma.buyingPreference.findMany({
      where: { userId: req.user!.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: preferences });
  } catch (err) { next(err); }
});

// POST /preferences
router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = preferenceSchema.parse(req.body);

    const pref = await prisma.buyingPreference.create({
      data: { ...data, userId: req.user!.id },
    });

    // Sync to Neo4j
    await runQuery(
      `MERGE (pref:Preference {id: $id})
       SET pref.userId = $userId,
           pref.preferredCity = $city,
           pref.preferredState = $state,
           pref.minPrice = $minPrice,
           pref.maxPrice = $maxPrice,
           pref.propertyType = $propertyType
       WITH pref
       MATCH (u:User {id: $userId})
       MERGE (u)-[:HAS_PREFERENCE]->(pref)`,
      {
        id: pref.id,
        userId: req.user!.id,
        city: data.preferredCity,
        state: data.preferredState,
        minPrice: data.minPrice || 0,
        maxPrice: data.maxPrice || 999999999,
        propertyType: data.propertyType || 'ANY',
      }
    ).catch(() => {}); // Neo4j sync is non-critical

    res.status(201).json({ success: true, data: pref });
  } catch (err) { next(err); }
});

// PATCH /preferences/:id
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = preferenceSchema.partial().parse(req.body);
    const pref = await prisma.buyingPreference.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data,
    });
    res.json({ success: true, data: pref });
  } catch (err) { next(err); }
});

// DELETE /preferences/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.buyingPreference.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { isActive: false },
    });
    res.json({ success: true, message: 'Preference removed' });
  } catch (err) { next(err); }
});

export default router;
