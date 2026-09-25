import { describe, expect, it } from 'vitest';
import { textPayload } from './fixtures.js';
import { extractMessages } from './inbound.js';

describe('extractMessages', () => {
  it('extracts a text message with contact name, ignoring unknown fields', () => {
    const p = textPayload('919800000001', 'wamid.1', 'hi');
    const ts = p.entry[0]?.changes[0]?.value.messages[0]?.timestamp;
    expect(extractMessages(p)).toEqual([
      {
        from: '919800000001',
        name: 'Asha',
        externalId: 'wamid.1',
        type: 'text',
        body: 'hi',
        sentAt: new Date(Number(ts) * 1000),
      },
    ]);
  });

  it('keeps non-text messages with a null body', () => {
    const p = textPayload('919800000001', 'wamid.2', '');
    const msg = p.entry[0]?.changes[0]?.value.messages[0];
    if (!msg) throw new Error('fixture');
    Object.assign(msg, { type: 'image', text: undefined, image: { id: 'MEDIA' } });
    expect(extractMessages(p)[0]).toMatchObject({ type: 'image', body: null });
  });

  it('returns nothing for status-only payloads', () => {
    const p = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }],
    };
    expect(extractMessages(p)).toEqual([]);
  });

  it('throws on non-WhatsApp payloads', () => {
    expect(() => extractMessages({ object: 'page', entry: [] })).toThrow();
    expect(() => extractMessages(textPayload('not-a-phone', 'wamid.3', 'x'))).toThrow();
  });
});
