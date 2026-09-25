// Local smoke test against the running stack (api + webhook-gateway + worker) and seed data.
// Usage: pnpm build && pnpm db:seed && start the three processes && pnpm smoke
import { randomInt, randomUUID } from 'node:crypto';
import { parseEnv } from './config/env.js';
import { signBody } from './webhook-gateway/signature.js';
import { textPayload } from './worker/fixtures.js';

const env = parseEnv(process.env);
const api = `http://127.0.0.1:${String(env.PORT)}`;
const gateway = `http://127.0.0.1:${String(env.WEBHOOK_PORT)}`;

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function expectStatus(res: Response, status: number) {
  if (res.status !== status)
    throw new Error(`expected ${String(status)}, got ${String(res.status)}`);
}

async function poll<T>(fn: () => Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('timed out waiting');
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

interface Tokens {
  accessToken: string;
  refreshToken: string;
}
interface Conversation {
  id: string;
  contact: { phone: string };
}
interface Message {
  id: string;
  status: string;
  direction: string;
  body: string | null;
}

let tokens: Tokens = { accessToken: '', refreshToken: '' };
let conversationId = '';
const phone = `91${String(randomInt(1e9, 1e10))}`;

console.log('ConnectHub smoke test');

await check('api + gateway healthy', async () => {
  expectStatus(await fetch(`${api}/health`), 200);
  expectStatus(await fetch(`${gateway}/health`), 200);
});

await check('seeded agent can log in', async () => {
  const res = await fetch(
    `${api}/auth/login`,
    json({ email: 'agent@connecthub.local', password: 'connecthub-dev-password' }),
  );
  expectStatus(res, 200);
  tokens = (await res.json()) as Tokens;
});

await check('webhook rejects a bad signature', async () => {
  const body = Buffer.from(JSON.stringify(textPayload(phone, `wamid.${randomUUID()}`, 'x')));
  const res = await fetch(`${gateway}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'x-hub-signature-256': signBody(body, 'wrong-secret') },
    body,
  });
  expectStatus(res, 401);
});

await check('signed inbound message shows up in the inbox', async () => {
  const body = Buffer.from(
    JSON.stringify(textPayload(phone, `wamid.${randomUUID()}`, 'Smoke hello', 'Smoke Test')),
  );
  const res = await fetch(`${gateway}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'x-hub-signature-256': signBody(body, env.WHATSAPP_APP_SECRET) },
    body,
  });
  expectStatus(res, 200);
  conversationId = await poll(async () => {
    const list = (await (
      await fetch(`${api}/conversations`, auth(tokens.accessToken))
    ).json()) as Conversation[];
    return list.find((c) => c.contact.phone === phone)?.id;
  });
});

await check('agent reply is queued, then sent by the worker', async () => {
  const res = await fetch(`${api}/conversations/${conversationId}/messages`, {
    ...json({ body: 'Smoke reply' }),
    headers: { 'content-type': 'application/json', ...auth(tokens.accessToken).headers },
  });
  expectStatus(res, 202);
  const { id } = (await res.json()) as Message;
  await poll(async () => {
    const msgs = (await (
      await fetch(`${api}/conversations/${conversationId}/messages`, auth(tokens.accessToken))
    ).json()) as Message[];
    return msgs.find((m) => m.id === id && m.status === 'sent');
  });
});

await check('unknown fields are rejected', async () => {
  const res = await fetch(`${api}/conversations/${conversationId}/messages`, {
    ...json({ body: 'x', status: 'sent' }),
    headers: { 'content-type': 'application/json', ...auth(tokens.accessToken).headers },
  });
  expectStatus(res, 400);
});

await check('refresh rotates; replaying the old token fails', async () => {
  const old = tokens.refreshToken;
  const res = await fetch(`${api}/auth/refresh`, json({ refreshToken: old }));
  expectStatus(res, 200);
  expectStatus(await fetch(`${api}/auth/refresh`, json({ refreshToken: old })), 401);
});

console.log('All smoke checks passed.');
