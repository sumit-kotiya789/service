import { Queue } from 'bullmq';
import { parseEnv } from '../config/env.js';
import { createPrisma } from '../db/client.js';
import {
  JOB_OPTIONS,
  OUTBOUND_QUEUE,
  producerConnection,
  type OutboundJob,
} from '../shared-types/jobs.js';
import { createApiApp } from './app.js';

const env = parseEnv(process.env);
const prisma = createPrisma(env.DATABASE_URL);
const outboundQueue = new Queue<OutboundJob>(OUTBOUND_QUEUE, {
  connection: producerConnection(env.REDIS_URL),
  defaultJobOptions: JOB_OPTIONS,
});
await outboundQueue.waitUntilReady();

const server = createApiApp({ prisma, outboundQueue, jwtSecret: env.JWT_SECRET }).listen(
  env.PORT,
  () => {
    console.log(`[api] listening on :${String(env.PORT)}`);
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void Promise.all([outboundQueue.close(), prisma.$disconnect()]).then(() => process.exit(0));
    });
  });
}
