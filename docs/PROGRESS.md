# Progress — ConnectHub

Source of truth for scope: [PHASES.md](PHASES.md). This file tracks status + phase summaries.

| Phase | Name                         | Status      |
| ----- | ---------------------------- | ----------- |
| 0     | Foundation                   | in progress |
| 1     | WhatsApp Core (no real Meta) | not started |
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

## Phase summaries
