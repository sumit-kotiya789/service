import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;
const ISSUER = 'connecthub';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function scryptAsync(password: string, salt: Buffer, opts: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, opts, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Format: scrypt$N$r$p$salt$key (base64url). Params stored so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, key] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const AccessClaims = z.object({ sub: z.uuid(), role: z.enum(['admin', 'agent']) });
export type AccessClaims = z.infer<typeof AccessClaims>;

const keyFor = (secret: string) => new TextEncoder().encode(secret);

export function signAccessToken(secret: string, claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${String(ACCESS_TTL_SECONDS)}s`)
    .sign(keyFor(secret));
}

/** Throws on bad signature, wrong alg, expiry, or unexpected claims. */
export async function verifyAccessToken(secret: string, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, keyFor(secret), {
    algorithms: ['HS256'],
    issuer: ISSUER,
  });
  return AccessClaims.parse(payload);
}

/** Opaque refresh token; only its sha256 is stored. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
