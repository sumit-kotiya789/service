import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/connecthub',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
  WHATSAPP_APP_SECRET: 'y'.repeat(16),
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
};

describe('parseEnv', () => {
  it('applies defaults and coerces PORT', () => {
    expect(parseEnv(valid)).toMatchObject({ NODE_ENV: 'development', PORT: 3000 });
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects the placeholder JWT secret', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'change_me' })).toThrow(/JWT_SECRET/);
  });

  it('rejects wrong URL schemes', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
  });

  it('does not leak secret values in errors', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'supersecret' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'supersecret' })).not.toThrow(/supersecret/);
  });
});
