import { defineConfig } from 'vitest/config';

// Integration tests hit real Postgres + Redis (docker compose). They run against a separate
// database and Redis db index so they never touch dev data.
try {
  process.loadEnvFile(); // local .env; CI provides env vars directly
} catch {
  // no .env file
}
const base = process.env;
const dbUrl = new URL(base['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/connecthub');
dbUrl.pathname = '/connecthub_test';
const redisUrl = new URL(base['REDIS_URL'] ?? 'redis://localhost:6379');
redisUrl.pathname = '/1';

const env = {
  NODE_ENV: 'test',
  DATABASE_URL: dbUrl.toString(),
  REDIS_URL: redisUrl.toString(),
  JWT_SECRET: 'integration-test-jwt-secret-32-chars!!',
  WHATSAPP_APP_SECRET: 'integration-test-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'integration-verify',
};
Object.assign(process.env, env); // for globalSetup (prisma migrate)

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    env,
    globalSetup: ['src/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
