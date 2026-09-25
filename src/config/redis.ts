import { Redis } from 'ioredis';

// BullMQ 6 needs a constructed client under ESM. Passed-in clients are not closed by
// queue/worker.close(), so callers quit() them on shutdown.

/** Producers fail fast when Redis is down instead of buffering (webhook must ack or error in <5s). */
export function producerRedis(url: string): Redis {
  return new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
}

/** Workers block on Redis; BullMQ requires maxRetriesPerRequest: null. */
export function workerRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
