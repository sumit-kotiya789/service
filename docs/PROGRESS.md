# Progress — ConnectHub

Source of truth for scope: [PHASES.md](PHASES.md). This file tracks status + phase summaries.

| Phase | Name                         | Status      |
| ----- | ---------------------------- | ----------- |
| 0     | Foundation                   | complete    |
| 1     | WhatsApp Core (no real Meta) | in progress |
| 2     | Real WhatsApp Integration    | not started |
| 3     | Agent Inbox UI               | not started |
| 4     | Campaigns & Broadcast        | not started |
| 5     | No-Code Chatbot Builder      | not started |
| 6     | AI Layer                     | not started |
| 7     | Call/IVR Suite (optional)    | not started |
| 8     | CRM Integrations & Analytics | not started |
| 9     | Compliance & Hardening       | not started |

## Decisions log

- 2026-09-25 — Phase 0-2 run as a single app (PROJECT_STANDARDS allows it); `src/` mirrors the future monorepo split so Phase 3 move to pnpm workspaces is mechanical.
- 2026-09-25 — Package manager: pnpm. Module system: ESM (`"type": "module"`, NodeNext). Tests: vitest. `.env` loaded via Node's built-in `--env-file`, no dotenv.
- 2026-09-25 — TypeScript pinned to 6.x: typescript-eslint 8.70 refuses TS 7.0. Revisit when typescript-eslint supports TS 7.
- 2026-09-25 — Compose postgres host port is `POSTGRES_PORT` (default 5432). On the dev machine 5432 = native Postgres, 5433 = VS Code, so local `.env` uses 5434.
- 2026-09-25 — ORM: Prisma (user choice). Pinned 7.10.0: npm `latest` tag points at 8.0.0-rc.17, not taking an RC.
- 2026-09-25 — No separate `agents` table: agents are `users` with `role=agent` (ARCHITECTURE.md data model defines users as "dashboard/agent logins"). PHASES.md lists `agents` separately; flagged to user.
- 2026-09-25 — Message status adds `received` (inbound) and `queued` (outbound, pre-send) to ARCHITECTURE's sent/delivered/read/failed.
- 2026-09-25 — Meta webhook body is not strict-validated at the gateway (HMAC-authenticated; Meta adds fields). Worker parses known fields leniently. Every API route is strict.
- 2026-09-25 — Integration tests use `prisma migrate deploy` + unique data per run, not `migrate reset` (Prisma blocks AI-run resets; non-destructive is better anyway).

## Phase summaries

### Phase 0 complete — 2026-09-25

**Built**

- Git repo, `main` + `phase/0-foundation` branch, LF line endings enforced (`.gitattributes`).
- TypeScript strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESM/NodeNext.
- ESLint (typescript-eslint `strictTypeChecked`, `no-explicit-any` = error), Prettier, vitest.
- `src/config/env.ts`: zod env loader, fail-fast, rejects JWT_SECRET < 32 chars, never echoes values in errors. 4 tests.
- `docker-compose.yml`: postgres 16 + redis 7 (AOF on), healthchecks, bound to 127.0.0.1 only.
- `.env.example` committed; `.env`, `*.pem`, `*.key` gitignored (verified with `git check-ignore`).
- CI (`.github/workflows/ci.yml`): typecheck, lint, format check, tests on push/PR.
- Folder structure locked + documented in README (single app, `src/` mirrors future monorepo).

**Verified**: clean `pnpm install --frozen-lockfile`, typecheck, lint, format:check, test (4/4), build — all green. Both containers healthy, reachable from host.

**Not verified**: CI has never run on GitHub — no remote exists yet.

**Stubbed / deferred**: no app code beyond env loader. `src/api`, `src/worker`, etc. get created in Phase 1 when first file lands.

**Needed from you before Phase 1**

- ORM choice: Prisma or Drizzle (ARCHITECTURE.md lists both).
- (Optional) GitHub remote so CI runs + PR-to-self workflow works.
- No API keys/accounts needed for Phase 1 (fake WhatsApp sender).
