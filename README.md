# wbot

NestJS-based WhatsApp webhook listener scaffold.

## First pass

- Meta-style webhook verification on `GET /api/webhooks/whatsapp`
- Signed webhook intake on `POST /api/webhooks/whatsapp`
- In-memory dedupe and per-conversation lock
- Warm session registry and idle reaper stubs
- Health endpoint on `GET /api/health`

## Local setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start the service with `npm run start:dev`.
4. Expose port `3000` with `npm run ngrok:http`.

## Current scope

This build is the intake layer only. It does not send outbound WhatsApp replies yet and it keeps session state in memory.
