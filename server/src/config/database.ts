import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../observability/logger.js';

export type DatabaseState = { mode: 'mongodb' | 'demo-in-memory' | 'unavailable' | 'test'; error?: string };

export const databaseState: DatabaseState = { mode: 'unavailable' };

let memoryServer: { getUri: () => string; stop: () => Promise<boolean> } | null = null;

export const isDatabaseReady = () => mongoose.connection.readyState === 1;

/** Connection errors can contain credentials embedded in MONGO_URI; never expose them. */
const redact = (message: string) => message.replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, 'mongodb$1://***@');

export const connectDatabase = async () => {
  if (env.nodeEnv === 'test') {
    databaseState.mode = 'test';
    return;
  }

  if (env.demoMode) {
    if (env.isProduction) throw new Error('DEMO_MODE is not allowed in production.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri(), { dbName: 'resumefit-demo' });
    databaseState.mode = 'demo-in-memory';
    logger.warn('database.demo_mode', { message: 'Using an in-memory MongoDB. All data is lost when the server stops.' });
    return;
  }

  try {
    const started = performance.now();
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    databaseState.mode = 'mongodb';
    logger.info('database.connected', { durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    databaseState.mode = 'unavailable';
    databaseState.error = redact(error instanceof Error ? error.message : String(error));
    logger.error('database.unavailable', {
      error: databaseState.error,
      hint: 'Data routes will respond with 503. Set MONGO_URI to a reachable database, or for a local demo start with DEMO_MODE=true.',
    });
  }
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
};
