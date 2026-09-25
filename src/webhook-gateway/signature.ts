import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Meta's X-Hub-Signature-256: "sha256=" + hex HMAC-SHA256 of the raw body, keyed by the app secret. */
export function signBody(raw: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

export function verifySignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(raw).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Constant-time string compare (hash first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}
