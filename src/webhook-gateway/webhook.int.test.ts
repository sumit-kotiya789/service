import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueDrained, startStack, uniqueId, uniquePhone, waitFor } from '../test/harness.js';
import { textPayload } from '../worker/fixtures.js';
import { fakeSender } from '../worker/outbound.js';
import { signBody } from './signature.js';

let stack: Awaited<ReturnType<typeof startStack>>;
beforeAll(async () => {
  stack = await startStack(fakeSender);
});
afterAll(() => stack.stop());

function post(body: Buffer, signature: string | undefined) {
  return fetch(`${stack.gatewayUrl}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    body,
  });
}

describe('webhook -> queue -> DB', () => {
  it('stores a signed inbound message and dedupes Meta retries', async () => {
    const phone = uniquePhone();
    const wamid = `wamid.${uniqueId()}`;
    const body = Buffer.from(JSON.stringify(textPayload(phone, wamid, 'hello')));
    const sig = signBody(body, stack.env.WHATSAPP_APP_SECRET);

    expect((await post(body, sig)).status).toBe(200);
    expect((await post(body, sig)).status).toBe(200); // retry

    const message = await waitFor(() =>
      stack.prisma.message.findUnique({
        where: { externalId: wamid },
        include: { conversation: { include: { contact: true } } },
      }),
    );
    expect(message).toMatchObject({ direction: 'in', status: 'received', body: 'hello' });
    expect(message.conversation.contact).toMatchObject({ phone, name: 'Asha' });

    await waitFor(() => queueDrained(stack.inboundQueue));
    expect(await stack.prisma.message.count({ where: { externalId: wamid } })).toBe(1);
  });

  it('rejects wrong, missing and tampered signatures without enqueueing', async () => {
    const before = await stack.inboundQueue.count();
    const body = Buffer.from(
      JSON.stringify(textPayload(uniquePhone(), `wamid.${uniqueId()}`, 'x')),
    );
    expect((await post(body, signBody(body, 'not-the-app-secret'))).status).toBe(401);
    expect((await post(body, undefined)).status).toBe(401);
    const tampered = Buffer.from(body.toString().replace('"x"', '"y"'));
    expect((await post(tampered, signBody(body, stack.env.WHATSAPP_APP_SECRET))).status).toBe(401);
    expect(await stack.inboundQueue.count()).toBe(before);
  });

  it('answers the Meta verification handshake only with the right token', async () => {
    const url = (token: string) =>
      `${stack.gatewayUrl}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;
    const ok = await fetch(url(stack.env.WHATSAPP_VERIFY_TOKEN));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('12345');
    expect((await fetch(url('wrong'))).status).toBe(403);
  });
});
