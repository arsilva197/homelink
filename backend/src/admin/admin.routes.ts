import { Router, Response, NextFunction } from 'express';
import { prisma } from '../common/db/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../common/middleware/auth';
import { cache } from '../common/db/redis';

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ─── Platform Metrics ────────────────────────────────────────────────────────

// GET /admin/metrics
router.get('/metrics', async (_req, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'admin:metrics';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const [
      totalUsers,
      totalProperties,
      totalActiveProperties,
      totalEdges,
      totalChains,
      pendingOpportunities,
      approvedOpportunities,
      avgCpsResult,
      recentRuns,
      brokersPending,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.property.count({ where: { isActive: true } }),
      prisma.graphEdge.count(),
      prisma.chainOpportunity.count(),
      prisma.chainOpportunity.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.chainOpportunity.count({ where: { status: 'APPROVED' } }),
      prisma.chainOpportunity.aggregate({ _avg: { cpsScore: true } }),
      prisma.matchingEngineRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { startedAt: true, durationMs: true, chainsDetected: true, status: true },
      }),
      prisma.brokerProfile.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);

    const metrics = {
      users: { total: totalUsers },
      properties: { total: totalProperties, active: totalActiveProperties },
      graph: { edges: totalEdges },
      chains: {
        total: totalChains,
        pending: pendingOpportunities,
        approved: approvedOpportunities,
        avgCps: avgCpsResult._avg.cpsScore || 0,
      },
      engine: { recentRuns },
      brokers: { pendingApproval: brokersPending },
    };

    await cache.set(cacheKey, metrics, 60); // 1-minute cache
    res.json({ success: true, data: metrics });
  } catch (err) { next(err); }
});

// ─── User Monitoring ────────────────────────────────────────────────────────

// GET /admin/users
router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const search = req.query.search as string;

    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          roles: true, isActive: true, isEmailVerified: true,
          createdAt: true, _count: { select: { properties: true } },
          brokerProfile: { select: { status: true, creciNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ success: true, data: users, pagination: { total, page, limit } });
  } catch (err) { next(err); }
});

// PATCH /admin/users/:id/suspend
router.patch('/users/:id/suspend', async (req, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true, data: { id: user.id, isActive: user.isActive } });
  } catch (err) { next(err); }
});

// PATCH /admin/users/:id/activate
router.patch('/users/:id/activate', async (req, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });
    res.json({ success: true, data: { id: user.id, isActive: user.isActive } });
  } catch (err) { next(err); }
});

// ─── Broker Management ───────────────────────────────────────────────────────

// GET /admin/brokers
router.get('/brokers', async (req, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const where = status ? { status: status as any } : {};

    const [total, brokers] = await Promise.all([
      prisma.brokerProfile.count({ where }),
      prisma.brokerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          agency: { select: { agencyName: true } },
          _count: { select: { listings: true, opportunities: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({ success: true, data: brokers, pagination: { total, page, limit } });
  } catch (err) { next(err); }
});

// PATCH /admin/brokers/:id/approve
router.patch('/brokers/:id/approve', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const broker = await prisma.brokerProfile.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: req.user!.id,
      },
    });

    // Notify broker
    await prisma.notification.create({
      data: {
        userId: broker.userId,
        type: 'BROKER_APPROVED',
        title: 'Broker Account Approved',
        message: 'Your broker profile has been approved. You can now receive transaction opportunities.',
      },
    });

    res.json({ success: true, data: broker });
  } catch (err) { next(err); }
});

// PATCH /admin/brokers/:id/suspend
router.patch('/brokers/:id/suspend', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const broker = await prisma.brokerProfile.update({
      where: { id: req.params.id },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
    });

    await prisma.notification.create({
      data: {
        userId: broker.userId,
        type: 'BROKER_SUSPENDED',
        title: 'Broker Account Suspended',
        message: reason || 'Your broker account has been suspended. Contact support for more information.',
      },
    });

    res.json({ success: true, data: broker });
  } catch (err) { next(err); }
});

// ─── Agency Management ───────────────────────────────────────────────────────

// GET /admin/agencies
router.get('/agencies', async (req, res: Response, next: NextFunction) => {
  try {
    const agencies = await prisma.agencyProfile.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { brokers: true, listings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: agencies });
  } catch (err) { next(err); }
});

// ─── Engine Control ──────────────────────────────────────────────────────────

// GET /admin/engine/runs
router.get('/engine/runs', async (_req, res: Response, next: NextFunction) => {
  try {
    const runs = await prisma.matchingEngineRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: runs });
  } catch (err) { next(err); }
});

export default router;
