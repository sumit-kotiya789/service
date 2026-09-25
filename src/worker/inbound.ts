import { z } from 'zod';
import type { PrismaClient } from '../db/client.js';

// Lenient on purpose: z.object strips unknown fields, Meta adds new ones over time.
const MetaMessage = z.object({
  from: z.string().regex(/^\d{6,15}$/),
  id: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
});

const WebhookPayload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
            messages: z.array(MetaMessage).optional(),
            // statuses (delivered/read receipts) handled in Phase 2
          }),
        }),
      ),
    }),
  ),
});

export interface InboundMessage {
  from: string;
  name: string | undefined;
  externalId: string;
  type: string;
  body: string | null;
  sentAt: Date;
}

/** Throws ZodError if the payload isn't a WhatsApp webhook. */
export function extractMessages(payload: unknown): InboundMessage[] {
  const { entry } = WebhookPayload.parse(payload);
  return entry.flatMap(({ changes }) =>
    changes
      .filter((c) => c.field === 'messages')
      .flatMap(({ value }) =>
        (value.messages ?? []).map((m) => ({
          from: m.from,
          name: value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
          externalId: m.id,
          type: m.type,
          body: m.text?.body ?? null,
          sentAt: new Date(Number(m.timestamp) * 1000),
        })),
      ),
  );
}

/** Idempotent: Meta retries are deduped by the unique external_id. */
export async function processInbound(prisma: PrismaClient, payload: unknown): Promise<number> {
  const messages = extractMessages(payload);
  for (const m of messages) {
    const contact = await prisma.contact.upsert({
      where: { phone: m.from },
      create: { phone: m.from, name: m.name ?? null },
      update: m.name ? { name: m.name } : {},
    });
    const conversation = await prisma.conversation.upsert({
      where: { contactId: contact.id },
      create: { contactId: contact.id, lastMessageAt: m.sentAt },
      update: { status: 'open', lastMessageAt: m.sentAt },
    });
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          direction: 'in',
          type: m.type,
          body: m.body,
          status: 'received',
          externalId: m.externalId,
          createdAt: m.sentAt,
        },
      ],
      skipDuplicates: true,
    });
  }
  return messages.length;
}
