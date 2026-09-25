import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, uniqueId, uniquePhone, waitFor } from '../test/harness.js';
import type { Sender } from '../worker/outbound.js';
import { hashPassword } from './auth.js';

const sent: { to: string; body: string }[] = [];
const recordingSender: Sender = (to, body) => {
  sent.push({ to, body });
  return Promise.resolve({ externalId: `test.${String(sent.length)}` });
};

let stack: Awaited<ReturnType<typeof startStack>>;
let conversationId: string;
const email = `int-${uniqueId()}@connecthub.local`;
const phone = uniquePhone();
const password = 'int-test-password';

beforeAll(async () => {
  stack = await startStack(recordingSender);
  await stack.prisma.user.create({
    data: { email, name: 'Int Agent', passwordHash: await hashPassword(password) },
  });
  const contact = await stack.prisma.contact.create({ data: { phone } });
  conversationId = (await stack.prisma.conversation.create({ data: { contactId: contact.id } })).id;
});
afterAll(() => stack.stop());

function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  return fetch(`${stack.apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function login(): Promise<Tokens> {
  const res = await call('/auth/login', { method: 'POST', body: { email, password } });
  expect(res.status).toBe(200);
  return (await res.json()) as Tokens;
}

describe('auth', () => {
  it('rejects bad credentials and unknown fields', async () => {
    const bad = await call('/auth/login', { method: 'POST', body: { email, password: 'nope' } });
    expect(bad.status).toBe(401);
    const extra = await call('/auth/login', {
      method: 'POST',
      body: { email, password, isAdmin: true },
    });
    expect(extra.status).toBe(400);
  });

  it('requires a valid bearer token', async () => {
    expect((await call('/conversations')).status).toBe(401);
    expect((await call('/conversations', { token: 'garbage' })).status).toBe(401);
  });

  it('rotates refresh tokens and revokes everything on reuse', async () => {
    const first = await login();
    const res = await call('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: first.refreshToken },
    });
    expect(res.status).toBe(200);
    const second = (await res.json()) as Tokens;

    // Replaying the rotated token is treated as theft: it fails and kills the new one too.
    const replay = { method: 'POST', body: { refreshToken: first.refreshToken } };
    expect((await call('/auth/refresh', replay)).status).toBe(401);
    const afterReuse = { method: 'POST', body: { refreshToken: second.refreshToken } };
    expect((await call('/auth/refresh', afterReuse)).status).toBe(401);
  });
});

describe('sending', () => {
  it('queues the message, returns 202, and the worker marks it sent', async () => {
    const { accessToken } = await login();
    const res = await call(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: accessToken,
      body: { body: 'Your order has shipped' },
    });
    expect(res.status).toBe(202);
    const { id, status } = (await res.json()) as { id: string; status: string };
    expect(status).toBe('queued');

    const message = await waitFor(async () => {
      const m = await stack.prisma.message.findUnique({ where: { id } });
      return m?.status === 'sent' ? m : null;
    });
    expect(message.externalId).toMatch(/^test\./);
    expect(sent).toContainEqual({ to: phone, body: 'Your order has shipped' });

    const audit = await stack.prisma.auditLog.findFirst({
      where: { action: 'message.send', entityId: id },
    });
    expect(audit).not.toBeNull();
  });

  it('validates the body and conversation id', async () => {
    const { accessToken } = await login();
    const path = `/conversations/${conversationId}/messages`;
    const empty = await call(path, { method: 'POST', token: accessToken, body: { body: '  ' } });
    expect(empty.status).toBe(400);
    const extra = await call(path, {
      method: 'POST',
      token: accessToken,
      body: { body: 'hi', status: 'sent' },
    });
    expect(extra.status).toBe(400);
    const badId = await call('/conversations/not-a-uuid/messages', { token: accessToken });
    expect(badId.status).toBe(400);
  });

  it('lists conversations and messages', async () => {
    const { accessToken } = await login();
    const list = (await (await call('/conversations', { token: accessToken })).json()) as {
      id: string;
    }[];
    expect(list.map((c) => c.id)).toContain(conversationId);
    const msgs = await call(`/conversations/${conversationId}/messages`, { token: accessToken });
    expect(msgs.status).toBe(200);
  });
});
