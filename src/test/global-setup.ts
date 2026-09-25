import { execSync } from 'node:child_process';

// Apply migrations to the test database. Non-destructive: tests use unique data per run.
export default function setup() {
  const db = new URL(process.env['DATABASE_URL'] ?? '').pathname;
  if (!db.endsWith('_test')) throw new Error(`Refusing to use non-test database "${db}"`);
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
