import { parseEnv } from '../config/env.js';
import { workerRedis } from '../config/redis.js';
import { createPrisma } from '../db/client.js';
import { fakeSender } from './outbound.js';
import { createWorkers } from './workers.js';

const env = parseEnv(process.env);
const prisma = createPrisma(env.DATABASE_URL);
const redis = workerRedis(env.REDIS_URL);
const workers = createWorkers(prisma, redis, fakeSender);
console.log(`[worker] running: ${workers.map((w) => w.name).join(', ')}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void Promise.all(workers.map((w) => w.close()))
      .then(() => Promise.all([prisma.$disconnect(), redis.quit()]))
      .then(() => process.exit(0));
  });
}
