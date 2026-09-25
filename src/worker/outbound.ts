import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../db/client.js';

export type Sender = (to: string, body: string) => Promise<{ externalId: string }>;

/** Phase 1 stand-in for the Cloud API: logs instead of calling Meta. */
export const fakeSender: Sender = (to, body) => {
  console.log(`[fake-whatsapp] to=***${to.slice(-4)} body=${JSON.stringify(body)}`);
  return Promise.resolve({ externalId: `fake.${randomUUID()}` });
};

/**
 * Sends a queued outbound message. No-op unless the message is still `queued`, so job retries
 * after a successful send don't resend.
 * ponytail: at-least-once, a crash between send() and the status update resends on retry.
 * Revisit with the real sender (Phase 2).
 */
export async function processOutbound(
  prisma: PrismaClient,
  messageId: string,
  send: Sender,
  isLastAttempt: boolean,
): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { include: { contact: true } } },
  });
  if (message?.status !== 'queued' || message.direction !== 'out') return;
  try {
    const { externalId } = await send(message.conversation.contact.phone, message.body ?? '');
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'sent', externalId, error: null },
    });
  } catch (err) {
    if (isLastAttempt) {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'failed', error: String(err).slice(0, 500) },
      });
    }
    throw err;
  }
}
