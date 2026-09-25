import { defineConfig } from 'prisma/config';

// Local dev reads .env; CI sets env vars directly (no file).
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export default defineConfig({
  schema: 'src/db/schema.prisma',
  migrations: { path: 'src/db/migrations', seed: 'node --env-file-if-exists=.env dist/db/seed.js' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
