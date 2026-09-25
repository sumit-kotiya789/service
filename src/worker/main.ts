import { parseEnv } from '../config/env.js';
import { createPrisma } from '../db/client.js';
import { fakeSender } from './outbound.js';
import { createWorkers } from './workers.js';

const env = parseEnv(process.env);
const prisma = createPrisma(env.DATABASE_URL);
const workers = createWorkers(prisma, env.REDIS_URL, fakeSender);
console.log(`[worker] running: ${workers.map((w) => w.name).join(', ')}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void Promise.all(workers.map((w) => w.close()))
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
}
