import { Queue } from 'bullmq';
import { parseEnv } from '../config/env.js';
import {
  INBOUND_QUEUE,
  JOB_OPTIONS,
  producerConnection,
  type InboundJob,
} from '../shared-types/jobs.js';
import { createGatewayApp } from './app.js';

const env = parseEnv(process.env);
const inboundQueue = new Queue<InboundJob>(INBOUND_QUEUE, {
  connection: producerConnection(env.REDIS_URL),
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
      void inboundQueue.close().then(() => process.exit(0));
    });
  });
}
