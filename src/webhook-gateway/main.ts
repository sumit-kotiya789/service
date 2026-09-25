import { Queue } from 'bullmq';
import { parseEnv } from '../config/env.js';
import { producerRedis } from '../config/redis.js';
import { INBOUND_QUEUE, JOB_OPTIONS, type InboundJob } from '../shared-types/jobs.js';
import { createGatewayApp } from './app.js';

const env = parseEnv(process.env);
const redis = producerRedis(env.REDIS_URL);
const inboundQueue = new Queue<InboundJob>(INBOUND_QUEUE, {
  connection: redis,
  defaultJobOptions: JOB_OPTIONS,
});
await inboundQueue.waitUntilReady();

const server = createGatewayApp({
  inboundQueue,
  appSecret: env.WHATSAPP_APP_SECRET,
  verifyToken: env.WHATSAPP_VERIFY_TOKEN,
}).listen(env.WEBHOOK_PORT, () => {
  console.log(`[webhook-gateway] listening on :${String(env.WEBHOOK_PORT)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void inboundQueue
        .close()
        .then(() => redis.quit())
        .then(() => process.exit(0));
    });
  });
}
