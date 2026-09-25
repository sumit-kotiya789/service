import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Queue } from 'bullmq';
import type { InboundJob } from '../shared-types/jobs.js';
import { safeEqual, verifySignature } from './signature.js';

export interface GatewayDeps {
  inboundQueue: Queue<InboundJob>;
  appSecret: string;
  verifyToken: string;
}

const VerifyQuery = z.strictObject({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().max(256),
});

/**
 * Thin by design: verify signature -> enqueue -> 200. No DB, no parsing beyond JSON.
 * The POST body is not zod-validated here: it is authenticated by HMAC, and Meta adds fields
 * over time, so the worker parses it leniently (known fields only).
 */
export function createGatewayApp({ inboundQueue, appSecret, verifyToken }: GatewayDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // ponytail: in-memory limit, generous so Meta bursts pass; Redis store when >1 instance.
  app.use(rateLimit({ windowMs: 60_000, limit: 3000 }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Meta subscription handshake.
  app.get('/webhooks/whatsapp', (req, res) => {
    const q = VerifyQuery.safeParse(req.query);
    if (
      !q.success ||
      q.data['hub.mode'] !== 'subscribe' ||
      !safeEqual(q.data['hub.verify_token'], verifyToken)
    ) {
      res.sendStatus(403);
      return;
    }
    res.type('text/plain').send(q.data['hub.challenge']);
  });

  app.post(
    '/webhooks/whatsapp',
    express.raw({ type: () => true, limit: '1mb' }),
    async (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!verifySignature(raw, req.get('x-hub-signature-256'), appSecret)) {
        res.sendStatus(401);
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        res.sendStatus(400);
        return;
      }
      await inboundQueue.add('inbound', { payload, receivedAt: new Date().toISOString() });
      res.sendStatus(200);
    },
  );

  app.use((_req, res) => {
    res.sendStatus(404);
  });

  // Enqueue failure -> 500 so Meta retries delivery.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    if (status >= 500) console.error(err);
    res.sendStatus(status);
  });

  return app;
}
