import app from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './observability/logger.js';

const startServer = async () => {
  const problems = validateEnv();
  if (problems.length) {
    problems.forEach((problem) => logger.error('config.invalid', { problem }));
    process.exit(1);
  }

  await connectDatabase();

  const server = app.listen(env.port, () => {
    logger.info('server.started', { port: env.port, env: env.nodeEnv, serveClient: env.serveClient });
  });

  const shutdown = (signal: string) => {
    logger.info('server.stopping', { signal });
    server.close(() => {
      disconnectDatabase().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
