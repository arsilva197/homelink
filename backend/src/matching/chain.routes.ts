import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../common/db/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../common/middleware/auth';
import { triggerManualRun } from './matching.worker';
import { NotFoundError } from '../common/middleware/errorHandler';

const router = Router();

// GET /chains - List opportunities (admin)
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const where = status ? { status: status as any } : {};

    const [total, chains] = await Promise.all([
      prisma.chainOpportunity.count({ where }),
      prisma.chainOpportunity.findMany({
        where,
        include: {
          participants: {
            include: {
              property: {
                include: {
                  images: { take: 1 },
                  owner: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          priceBridge: true,
          assignedBroker: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: [{ cpsScore: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: chains,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// GET /chains/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const chain = await prisma.chainOpportunity.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          orderBy: { position: 'asc' },
          include: {
            property: {
              include: {
                images: { orderBy: { displayOrder: 'asc' } },
                owner: { select: { id: true, firstName: true, lastName: true, phone: true } },
              },
            },
          },
        },
        priceBridge: true,
        assignedBroker: {
          include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
    });

    if (!chain) throw new NotFoundError('Chain opportunity');
    res.json({ success: true, data: chain });
  } catch (err) { next(err); }
});

// PATCH /chains/:id/approve
router.patch('/:id/approve', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const chain = await prisma.chainOpportunity.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    res.json({ success: true, data: chain });
  } catch (err) { next(err); }
});

// PATCH /chains/:id/reject
router.patch('/:id/reject', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    const chain = await prisma.chainOpportunity.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    res.json({ success: true, data: chain });
  } catch (err) { next(err); }
});

// PATCH /chains/:id/assign-broker
router.patch('/:id/assign-broker', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { brokerId } = z.object({ brokerId: z.string().uuid() }).parse(req.body);

    // Verify broker is approved
    const broker = await prisma.brokerProfile.findUnique({ where: { id: brokerId } });
    if (!broker || broker.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Broker not found or not approved' });
    }

    const chain = await prisma.chainOpportunity.update({
      where: { id: req.params.id },
      data: {
        status: 'ASSIGNED_TO_BROKER',
        assignedBrokerId: brokerId,
        assignedAt: new Date(),
      },
    });

    // Notify broker
    await prisma.notification.create({
      data: {
        userId: broker.userId,
        type: 'OPPORTUNITY_ASSIGNED',
        title: 'New Opportunity Assigned',
        message: `You have been assigned a ${chain.chainSize}-party transaction chain in ${chain.region}.`,
        chainId: chain.id,
      },
    });

    res.json({ success: true, data: chain });
  } catch (err) { next(err); }
});

// POST /chains/trigger-run (admin only - manual trigger)
router.post('/trigger-run', authenticate, requireAdmin, async (_req, res: Response, next: NextFunction) => {
  try {
    const job = await triggerManualRun();
    res.json({ success: true, data: { jobId: job.id, message: 'Matching cycle triggered' } });
  } catch (err) { next(err); }
});

export default router;
