import { UnrecoverableError, Worker } from 'bullmq';
import { ZodError } from 'zod';
import type { PrismaClient } from '../db/client.js';
import {
  INBOUND_QUEUE,
  OUTBOUND_QUEUE,
  type InboundJob,
  type OutboundJob,
} from '../shared-types/jobs.js';
import { processInbound } from './inbound.js';
import { processOutbound, type Sender } from './outbound.js';

export function createWorkers(prisma: PrismaClient, redisUrl: string, send: Sender) {
  const connection = { url: redisUrl };

  const inbound = new Worker<InboundJob>(
    INBOUND_QUEUE,
    async (job) => {
      try {
        await processInbound(prisma, job.data.payload);
      } catch (err) {
        // A malformed payload won't get better on retry.
        if (err instanceof ZodError)
          throw new UnrecoverableError(`invalid payload: ${err.message}`);
        throw err;
      }
    },
    { connection, concurrency: 10 },
  );

  const outbound = new Worker<OutboundJob>(
    OUTBOUND_QUEUE,
    (job) =>
      processOutbound(
        prisma,
        job.data.messageId,
        send,
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      ),
    { connection, concurrency: 5 },
  );

  for (const worker of [inbound, outbound]) {
    worker.on('failed', (job, err) => {
      console.error(`[${worker.name}] job ${job?.id ?? '?'} failed: ${err.message}`);
    });
  }
  return [inbound, outbound];
}
