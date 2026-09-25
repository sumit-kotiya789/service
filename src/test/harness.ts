import { randomInt, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Queue } from 'bullmq';
import { createApiApp } from '../api/app.js';
import { parseEnv } from '../config/env.js';
import { producerRedis, workerRedis } from '../config/redis.js';
import { createPrisma } from '../db/client.js';
import {
  INBOUND_QUEUE,
  JOB_OPTIONS,
  OUTBOUND_QUEUE,
  type InboundJob,
  type OutboundJob,
} from '../shared-types/jobs.js';
import { createGatewayApp } from '../webhook-gateway/app.js';
import type { Sender } from '../worker/outbound.js';
import { createWorkers } from '../worker/workers.js';

/** Boots API + gateway on random ports and workers in-process, like production but in one process. */
export async function startStack(send: Sender) {
  const env = parseEnv(process.env);
  const prisma = createPrisma(env.DATABASE_URL);
  const connection = producerRedis(env.REDIS_URL);
  const workerConnection = workerRedis(env.REDIS_URL);
  const inboundQueue = new Queue<InboundJob>(INBOUND_QUEUE, {
    connection,
    defaultJobOptions: JOB_OPTIONS,
  });
  const outboundQueue = new Queue<OutboundJob>(OUTBOUND_QUEUE, {
    connection,
    defaultJobOptions: { ...JOB_OPTIONS, backoff: { type: 'fixed', delay: 50 } },
  });
  await Promise.all([inboundQueue.waitUntilReady(), outboundQueue.waitUntilReady()]);

  const listen = (app: { listen: (port: number) => Server }) => {
    const server = app.listen(0);
    return new Promise<{ server: Server; url: string }>((resolve) =>
      server.once('listening', () => {
        resolve({
          server,
          url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
        });
      }),
    );
  };
  const api = await listen(createApiApp({ prisma, outboundQueue, jwtSecret: env.JWT_SECRET }));
  const gateway = await listen(
    createGatewayApp({
      inboundQueue,
      appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    }),
  );
  const workers = createWorkers(prisma, workerConnection, send);

  return {
    env,
    prisma,
    inboundQueue,
    apiUrl: api.url,
    gatewayUrl: gateway.url,
    async stop() {
      await Promise.all(workers.map((w) => w.close()));
      api.server.close();
      gateway.server.close();
      await Promise.all([inboundQueue.close(), outboundQueue.close()]);
      await prisma.$disconnect();
      await Promise.all([connection.quit(), workerConnection.quit()]);
    },
  };
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Unique per run, so tests never collide with data from earlier runs. */
export const uniquePhone = () => `91${String(randomInt(1e9, 1e10))}`;
export const uniqueId = () => randomUUID();

export async function queueDrained(queue: Queue) {
  const c = await queue.getJobCounts('waiting', 'active', 'delayed');
  return (c['waiting'] ?? 0) + (c['active'] ?? 0) + (c['delayed'] ?? 0) === 0;
}
