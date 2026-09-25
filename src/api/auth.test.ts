import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from './auth.js';

const secret = 's'.repeat(32);
const claims = { sub: '5f0c7c2e-3b1a-4a51-9d0e-2b8f6a1e9c11', role: 'agent' as const };

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const token = await signAccessToken(secret, claims);
    expect(await verifyAccessToken(secret, token)).toEqual(claims);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signAccessToken('t'.repeat(32), claims);
    await expect(verifyAccessToken(secret, token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ role: 'agent' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('connecthub')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(secret));
    await expect(verifyAccessToken(secret, token)).rejects.toThrow();
  });
});
