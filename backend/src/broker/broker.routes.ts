// broker/broker.routes.ts
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../common/db/prisma';
import { authenticate, AuthRequest } from '../common/middleware/auth';

const router = Router();

const brokerRegistrationSchema = z.object({
  creciNumber: z.string().min(3),
  creciState: z.string().min(2).max(2),
  bio: z.string().max(1000).optional(),
  specializations: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
});

// POST /brokers/register - Register as broker
router.post('/register', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = brokerRegistrationSchema.parse(req.body);

    const existing = await prisma.brokerProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Broker profile already exists' });
    }

    const profile = await prisma.brokerProfile.create({
      data: {
        userId: req.user!.id,
        creciNumber: data.creciNumber,
        creciState: data.creciState,
        bio: data.bio,
        specializations: (data.specializations || []) as any,
        regions: data.regions || [],
        status: 'PENDING_APPROVAL',
      },
    });

    // Add BROKER role to user
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { roles: { push: 'BROKER' } },
    });

    res.status(201).json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// GET /brokers/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.brokerProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        opportunities: {
          where: { status: { in: ['ASSIGNED_TO_BROKER', 'IN_NEGOTIATION'] } },
          orderBy: { assignedAt: 'desc' },
          take: 10,
        },
        _count: { select: { listings: true, opportunities: true } },
      },
    });
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// GET /brokers/opportunities - Broker's assigned opportunities
router.get('/opportunities', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const broker = await prisma.brokerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!broker) return res.status(404).json({ success: false, message: 'Broker profile not found' });

    const opportunities = await prisma.chainOpportunity.findMany({
      where: { assignedBrokerId: broker.id },
      include: {
        participants: {
          include: {
            property: {
              include: {
                images: { take: 1 },
                owner: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
          },
        },
        priceBridge: true,
      },
      orderBy: { assignedAt: 'desc' },
    });

    res.json({ success: true, data: opportunities });
  } catch (err) { next(err); }
});

export default router;
