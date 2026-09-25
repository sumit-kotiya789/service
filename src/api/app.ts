import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import type { Queue } from 'bullmq';
import type { PrismaClient, User } from '../db/client.js';
import type { OutboundJob } from '../shared-types/jobs.js';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_MS,
  hashPassword,
  hashToken,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
  type AccessClaims,
} from './auth.js';

export interface ApiDeps {
  prisma: PrismaClient;
  outboundQueue: Queue<OutboundJob>;
  jwtSecret: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Every body/query/params schema is strict: unknown fields are rejected.
const LoginBody = z.strictObject({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(200),
});
const RefreshBody = z.strictObject({ refreshToken: z.string().min(1).max(200) });
const IdParams = z.strictObject({ id: z.uuid() });
const ListConversationsQuery = z.strictObject({ status: z.enum(['open', 'closed']).optional() });
const EmptyQuery = z.strictObject({});
const SendMessageBody = z.strictObject({ body: z.string().trim().min(1).max(4096) });

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const dummyHash = hashPassword('timing-equalizer');

export function createApiApp({ prisma, outboundQueue, jwtSecret }: ApiDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet()); // sets HSTS among others; HTTPS itself is terminated at the proxy
  // ponytail: in-memory rate limit store, move to Redis store when running >1 API instance.
  app.use(rateLimit({ windowMs: 60_000, limit: 300 }));
  app.use(express.json({ limit: '100kb' }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10 });

  async function audit(
    userId: string | null,
    action: string,
    req: Request,
    entity?: { type: string; id: string },
  ) {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: entity?.type ?? null,
        entityId: entity?.id ?? null,
        ip: req.ip ?? null,
      },
    });
  }

  async function issueTokens(user: User) {
    const refreshToken = newRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const accessToken = await signAccessToken(jwtSecret, { sub: user.id, role: user.role });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }

  // ponytail: stateless check, a deactivated user keeps access until the token expires (15 min).
  async function authUser(req: Request): Promise<AccessClaims> {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
    try {
      return await verifyAccessToken(jwtSecret, header.slice(7));
    } catch {
      throw new HttpError(401, 'unauthorized');
    }
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = LoginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok || !user.isActive) {
      if (user) await audit(user.id, 'auth.login_failed', req);
      throw new HttpError(401, 'invalid_credentials');
    }
    const tokens = await issueTokens(user);
    await audit(user.id, 'auth.login', req);
    res.json(tokens);
  });

  // Rotation: each refresh token works once. Presenting a revoked one = likely theft, so every
  // session of that user is revoked.
  app.post('/auth/refresh', loginLimiter, async (req, res) => {
    const { refreshToken } = RefreshBody.parse(req.body);
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!row) throw new HttpError(401, 'invalid_token');
    const now = new Date();
    if (row.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await audit(row.userId, 'auth.refresh_reuse', req);
      throw new HttpError(401, 'invalid_token');
    }
    if (row.expiresAt <= now || !row.user.isActive) throw new HttpError(401, 'invalid_token');
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) throw new HttpError(401, 'invalid_token'); // lost a race with a parallel refresh
    res.json(await issueTokens(row.user));
  });

  app.post('/auth/logout', async (req, res) => {
    const { refreshToken } = RefreshBody.parse(req.body);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.sendStatus(204);
  });

  // ponytail: fixed page of 100, add cursor pagination with the inbox UI (Phase 3).
  app.get('/conversations', async (req, res) => {
    await authUser(req);
    const { status } = ListConversationsQuery.parse(req.query);
    const conversations = await prisma.conversation.findMany({
      where: status ? { status } : {},
      include: { contact: true },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
    });
    res.json(conversations);
  });

  app.get('/conversations/:id/messages', async (req, res) => {
    await authUser(req);
    const { id } = IdParams.parse(req.params);
    EmptyQuery.parse(req.query);
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(messages.reverse());
  });

  // Never sends inline: persist as queued, hand off to the outbound worker.
  app.post('/conversations/:id/messages', async (req, res) => {
    const user = await authUser(req);
    const { id } = IdParams.parse(req.params);
    const { body } = SendMessageBody.parse(req.body);
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new HttpError(404, 'not_found');

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: { conversationId: id, direction: 'out', body, status: 'queued', sentById: user.sub },
      });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: m.createdAt } });
      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'message.send',
          entityType: 'message',
          entityId: m.id,
          ip: req.ip ?? null,
        },
      });
      return m;
    });

    try {
      await outboundQueue.add('send', { messageId: message.id }, { jobId: message.id });
    } catch (err) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: 'failed', error: 'enqueue_failed' },
      });
      throw err;
    }
    res.status(202).json(message);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'invalid_request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (isClientError(err)) {
      res.status(err.status).json({ error: 'bad_request' }); // e.g. malformed JSON, body too large
    } else {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  return app;
}

function isClientError(err: unknown): err is { status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}
