import { describe, expect, it } from 'vitest';
import { safeEqual, signBody, verifySignature } from './signature.js';

const secret = 'test-app-secret-123';
const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

describe('verifySignature', () => {
  it('accepts a correct signature', () => {
    expect(verifySignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifySignature(body, signBody(body, 'wrong-secret-456'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = signBody(body, secret);
    expect(verifySignature(Buffer.from(`${body.toString()} `), sig, secret)).toBe(false);
  });

  it('rejects missing, unprefixed, truncated and non-hex headers', () => {
    const hex = signBody(body, secret).slice('sha256='.length);
    for (const header of [undefined, '', hex, `sha256=${hex.slice(0, 10)}`, 'sha256=zz']) {
      expect(verifySignature(body, header, secret)).toBe(false);
    }
  });
});

describe('safeEqual', () => {
  it('compares strings of any length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
