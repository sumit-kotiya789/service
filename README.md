# ConnectHub

WhatsApp + Calls business communication platform. See [docs/](docs/) — `PHASES.md` (scope), `ARCHITECTURE.md` (stack), `PROJECT_STANDARDS.md` (rules), `PROGRESS.md` (status).

## Local setup

Requires Node 22+, pnpm 10, Docker.

```sh
pnpm install
cp .env.example .env        # then set JWT_SECRET (openssl rand -hex 32)
docker compose up -d --wait # postgres:5432, redis:6379 on 127.0.0.1
```

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm build`

## Folder structure (locked)

Phases 0-2 are a single app. `src/` mirrors the monorepo layout in PROJECT_STANDARDS.md; at Phase 3 each folder moves to `apps/*` / `packages/*` under pnpm workspaces. Folders are created when their first file lands.

```
src/
├── api/              # Express API server            -> apps/api
├── worker/           # BullMQ workers                -> apps/worker
├── webhook-gateway/  # thin webhook receiver         -> apps/webhook-gateway
├── db/               # schema + client               -> packages/db
├── shared-types/     # zod schemas, shared TS types  -> packages/shared-types
└── config/           # env loading, constants        -> packages/config
```

Web frontend (`apps/web`) arrives in Phase 3.
