import Bull from 'bull';
import { chainMatchingEngine } from './chainMatching.service';
import { logger } from '../common/logger';

const CYCLE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export const matchingQueue = new Bull('matching-engine', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
  },
});

matchingQueue.process('run-cycle', 1, async (job) => {
  logger.info(`Matching engine job ${job.id} started`);
  try {
    const result = await chainMatchingEngine.runFullMatchingCycle();
    logger.info(`Matching engine job ${job.id} completed:`, result);
    return result;
  } catch (err) {
    logger.error(`Matching engine job ${job.id} failed:`, err);
    throw err;
  }
});

matchingQueue.on('completed', (job, result) => {
  logger.info(`Matching cycle completed in ${result.durationMs}ms - ${result.opportunitiesCreated} opportunities`);
});

matchingQueue.on('failed', (job, err) => {
  logger.error(`Matching cycle failed:`, err);
});

export async function startMatchingEngine(): Promise<void> {
  // Clear any stuck jobs from previous runs
  await matchingQueue.empty();

  // Schedule recurring job
  await matchingQueue.add('run-cycle', {}, {
    repeat: { every: CYCLE_INTERVAL_MS },
    jobId: 'matching-engine-recurring',
  });

  // Run immediately on startup
  await matchingQueue.add('run-cycle', {}, { delay: 10000 }); // 10s delay for DB to be ready

  logger.info(`Matching engine scheduled every ${CYCLE_INTERVAL_MS / 1000}s`);
}

export async function triggerManualRun(): Promise<Bull.Job> {
  return matchingQueue.add('run-cycle', { manual: true, triggeredAt: new Date().toISOString() });
}
