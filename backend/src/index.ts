import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { logger } from './common/logger';
import { errorHandler } from './common/middleware/errorHandler';
import { rateLimiter } from './common/middleware/rateLimiter';
import { prisma } from './common/db/prisma';
import { redis } from './common/db/redis';
import { neo4jDriver } from './common/db/neo4j';

// Route imports
import authRoutes from './auth/auth.routes';
import userRoutes from './auth/user.routes';
import propertyRoutes from './marketplace/property.routes';
import preferenceRoutes from './marketplace/preference.routes';
import adminRoutes from './admin/admin.routes';
import brokerRoutes from './broker/broker.routes';
import heatmapRoutes from './heatmap/heatmap.routes';
import chainRoutes from './matching/chain.routes';
import notificationRoutes from './notifications/notification.routes';

// Queue workers
import { startMatchingEngine } from './matching/matching.worker';
import { startHeatmapWorker } from './heatmap/heatmap.worker';

const app = express();
const httpServer = createServer(app);

// Socket.io for real-time admin notifications
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach io to app for use in routes
app.set('io', io);

// ─── Middleware ───────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(rateLimiter);

// ─── Health Check ─────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        postgres: 'up',
        redis: 'up',
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: String(err) });
  }
});

// ─── API Routes ───────────────────────────────
const api = express.Router();

api.use('/auth', authRoutes);
api.use('/users', userRoutes);
api.use('/properties', propertyRoutes);
api.use('/preferences', preferenceRoutes);
api.use('/admin', adminRoutes);
api.use('/brokers', brokerRoutes);
api.use('/heatmap', heatmapRoutes);
api.use('/chains', chainRoutes);
api.use('/notifications', notificationRoutes);

app.use('/api/v1', api);

// ─── Error Handler ────────────────────────────
app.use(errorHandler);

// ─── Socket.io ───────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join:admin', (adminId: string) => {
    socket.join(`admin:${adminId}`);
    logger.info(`Admin ${adminId} joined notification room`);
  });

  socket.on('join:broker', (brokerId: string) => {
    socket.join(`broker:${brokerId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Startup ──────────────────────────────────
const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    // Test DB connections
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    await redis.ping();
    logger.info('✅ Redis connected');

    await neo4jDriver.verifyConnectivity();
    logger.info('✅ Neo4j connected');

    // Start background workers
    await startMatchingEngine();
    logger.info('✅ Matching Engine started');

    await startHeatmapWorker();
    logger.info('✅ Heatmap Worker started');

    httpServer.listen(PORT, () => {
      logger.info(`🏠 Homelink Backend running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  await redis.quit();
  await neo4jDriver.close();
  process.exit(0);
});

bootstrap();

export { io };
