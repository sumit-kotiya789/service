# ConnectHub

WhatsApp + Calls business communication platform. See [docs/](docs/) — `PHASES.md` (scope), `ARCHITECTURE.md` (stack), `PROJECT_STANDARDS.md` (rules), `PROGRESS.md` (status).

## Local setup

Requires Node 22+, pnpm 10, Docker.

```sh
pnpm install                # also generates the Prisma client
cp .env.example .env        # set JWT_SECRET, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN (openssl rand -hex 32)
docker compose up -d --wait # postgres:5432, redis:6379 on 127.0.0.1
pnpm db:migrate             # apply migrations
pnpm build && pnpm db:seed  # seed runs from dist/
```

Run each in its own terminal (all read `.env`):

```sh
pnpm start:api       # :PORT
pnpm start:gateway   # :WEBHOOK_PORT, POST /webhooks/whatsapp
pnpm start:worker    # inbound + outbound queues; fake WhatsApp sender logs to console
pnpm smoke           # end-to-end check against the running stack
```

Seed login: `agent@connecthub.local` / `connecthub-dev-password` (dev only; seed refuses `NODE_ENV=production`).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` (unit) · `pnpm test:int` (needs docker; uses `connecthub_test` DB + Redis db 1) · `pnpm build`

## API (Phase 1)

| Method | Path                          | Auth   | Notes                                  |
| ------ | ----------------------------- | ------ | -------------------------------------- |
| POST   | `/auth/login`                 | —      | `{email, password}` → access + refresh |
| POST   | `/auth/refresh`               | —      | rotates; replayed token revokes all    |
| POST   | `/auth/logout`                | —      | revokes the refresh token              |
| GET    | `/conversations?status=`      | Bearer | latest 100                             |
| GET    | `/conversations/:id/messages` | Bearer | latest 100, oldest first               |
| POST   | `/conversations/:id/messages` | Bearer | `{body}` → 202, sent by worker         |

Gateway: `GET /webhooks/whatsapp` (Meta handshake), `POST /webhooks/whatsapp` (`X-Hub-Signature-256` required).

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
