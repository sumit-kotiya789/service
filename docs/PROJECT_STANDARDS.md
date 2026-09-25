# Project Standards — ConnectHub

## Folder structure

```
connecthub/
├── docs/
│   ├── PHASES.md
│   ├── ARCHITECTURE.md
│   └── PROJECT_STANDARDS.md
├── apps/
│   ├── api/              # Express API server
│   ├── worker/           # BullMQ workers (send, bot-exec, ai-reply)
│   ├── webhook-gateway/  # thin webhook receiver
│   └── web/              # React frontend
├── packages/
│   ├── db/               # Prisma/Drizzle schema + client, shared
│   ├── shared-types/     # zod schemas, shared TS types
│   └── config/           # env loading, constants
├── docker-compose.yml
├── .env.example
└── README.md
```

Monorepo (pnpm workspaces or turborepo) once you hit Phase 3+ with a separate frontend. Single app is fine for Phase 0-2.

## Git workflow

- `main` — always deployable
- `phase/N-name` branches per phase, merge via PR to self (review your own diff before merge)
- Commit message format: `[phase-N] short description`
- Never commit `.env`, `node_modules`, `*.pem`, `*.key`

## .env.example (fill real values in `.env`, never commit it)

```
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://user:pass@localhost:5432/connecthub
REDIS_URL=redis://localhost:6379

JWT_SECRET=change_me

# WhatsApp (Phase 2+)
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=

# LLM (Phase 6+)
ANTHROPIC_API_KEY=

# Voice (Phase 7, optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

## Security checklist (before any public deploy)

- [ ] Webhook signature verification enabled and tested with wrong signature (must reject)
- [ ] Rate limiting on all public endpoints
- [ ] JWT expiry + refresh flow, not infinite tokens
- [ ] SQL via ORM/parameterized queries only, no string concat
- [ ] Input validation (zod) on every route, reject unknown fields
- [ ] Secrets in env vars or secret manager, never hardcoded
- [ ] HTTPS enforced, HSTS header set
- [ ] Contact data encrypted at rest if storing sensitive fields
- [ ] Audit log for agent actions (who sent what, when)
- [ ] Opt-out/unsubscribe honored on every broadcast send (legal requirement for WhatsApp marketing)

## Compliance notes (India-specific, since you're building from India)

- DLT registration mandatory for SMS/voice OTP at scale (TRAI requirement)
- WhatsApp Business Platform: Meta reviews template messages, rejects promotional content disguised as utility
- Data localization: check RBI/MeitY rules if handling payment-adjacent data

## Testing

- Unit tests: business logic in workers (bot flow engine, message formatting)
- Integration tests: webhook → queue → DB round trip, using test DB
- Manual smoke test checklist per phase before marking phase done
