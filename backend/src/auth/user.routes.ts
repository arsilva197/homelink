import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../common/db/prisma';
import { authenticate, AuthRequest } from '../common/middleware/auth';

const router = Router();

// GET /users/me/properties - Current user's properties
router.get('/me/properties', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const properties = await prisma.property.findMany({
      where: { ownerId: req.user!.id },
      include: {
        images: { take: 1, orderBy: { displayOrder: 'asc' } },
        _count: { select: { chainParticipants: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add "chain pulse" - how many active chains include this property
    const propertiesWithPulse = await Promise.all(
      properties.map(async (p) => {
        const activeChains = await prisma.chainParticipant.count({
          where: {
            propertyId: p.id,
            chain: { status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
          },
        });
        return { ...p, activeChainsCount: activeChains };
      })
    );

    res.json({ success: true, data: propertiesWithPulse });
  } catch (err) { next(err); }
});

// PATCH /users/me - Update profile
router.patch('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

export default router;
