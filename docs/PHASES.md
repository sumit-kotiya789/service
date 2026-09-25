# Build Phases — ConnectHub

Rule: finish a phase fully (working, tested locally) before starting next. No skipping ahead.

---

## Phase 0 — Foundation

- [x] Repo init, TypeScript config, lint/prettier, Docker Compose (postgres, redis)
- [x] CI: run typecheck + lint on push
- [x] `.env.example`, secrets never committed
- [x] Base folder structure locked (see ARCHITECTURE.md)

## Phase 1 — WhatsApp Core (no real Meta yet)

- [x] DB schema: users, agents, contacts, conversations, messages, templates
- [x] Auth: JWT login for agents
- [x] Webhook receiver, stubbed WhatsApp sender (console log only)
- [x] Redis + BullMQ queue for outbound sends
- [x] Seed data, local smoke test

## Phase 2 — Real WhatsApp Integration

- [ ] Meta Business Manager + WhatsApp Business Platform app setup
- [ ] Either become BSP or integrate via existing BSP (Gupshup / 360dialog / Twilio) — pick one, document why in ARCHITECTURE.md
- [ ] Real webhook verification + signature check
- [ ] Template submission + approval flow (Meta review is manual, expect delay)
- [ ] Real send via Cloud API, rate limit respecting Meta's tier
- [ ] Delivery/read receipt handling

## Phase 3 — Agent Inbox UI

- [ ] Frontend (React or Vue) — shared inbox, conversation list, chat window
- [ ] Multi-agent assignment, "typing"/online status via websockets
- [ ] Contact profile panel (history, tags, notes)

## Phase 4 — Campaigns & Broadcast

- [ ] CSV/contact-list upload
- [ ] Broadcast sender respecting Meta rate limits + opt-out handling
- [ ] Campaign analytics: sent/delivered/read/replied

## Phase 5 — No-Code Chatbot Builder

- [ ] Flow schema (nodes: message, condition, API call, handoff-to-human)
- [ ] Visual builder (drag-drop) — can defer to JSON editor for MVP
- [ ] Bot execution engine, session/state per contact

## Phase 6 — AI Layer

- [ ] LLM-based auto-reply (function calling into CRM data)
- [ ] STT/TTS pipeline if adding voicebot (Whisper/Deepgram + ElevenLabs/Azure)
- [ ] Escalation-to-human logic (confidence threshold / explicit ask)

## Phase 7 — Call/IVR Suite (optional, heavy lift)

- [ ] SIP trunk or Twilio Voice/Exotel integration (don't build a switch)
- [ ] IVR flow builder (reuse Phase 5 engine if possible)
- [ ] Call recording → S3, routing, live call dashboard via websocket

## Phase 8 — CRM Integrations & Analytics

- [ ] Zoho/Freshdesk/Shopify webhook + OAuth integrations
- [ ] Unified analytics dashboard: response time, conversion, volume
- [ ] Export/reporting

## Phase 9 — Compliance & Hardening

- [ ] DLT registration (India, if sending SMS)
- [ ] Data retention/privacy policy, GDPR-style export/delete
- [ ] Load testing on webhook + queue paths
- [ ] Pen test / security review before public launch

---

## Suggested solo-dev order

Phase 0 → 1 → 2 → 3 → 4 → 6 (skip 5's UI, use JSON flows) → 8 → 7 (last, hardest, optional) → 9.
