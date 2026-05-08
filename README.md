# ai-agent-council

Standalone web app for the **LLM Council** — three frontier models answer the same task in parallel, debate each other across N rounds (anonymised), and a chairman synthesises the final answer with its reasoning. Pay-per-call against your [llm4agents.com](https://llm4agents.com) agent balance.

## Features

- 3 plan presets: **🪶 Lite** (~$0.02/run), **⚡ Pro** (~$0.45/run), **🚀 Power** (~$2.20/run) with frontier models.
- **2–5 debate rounds** configurable per run (defaults: Lite 2, Pro 3, Power 4).
- Per-slot model override via picker (309+ models).
- **Streaming** drafts, debates and synthesis token-by-token.
- **Chairman reasoning toggle** — see why the chairman picked what it picked.
- **History** of last 5 runs per plan, per agent, persisted in localStorage.
- **Onboarding wizard**: bring your own API key OR register a new agent inline + funding guide.
- Bilingual UI (EN / ES neutral Latin American).
- **Real billed cost** reported via balance diff (not SDK estimate).

## Stack

- React 19 + Vite 8 + TypeScript ~6 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- Tailwind v4 + shadcn primitives
- Zustand (state, persisted to localStorage) + TanStack Query (balance/models)
- `@llmforagents/sdk@2.3.2` for backend calls

## Requirements

- Node 20+
- Access to `https://api.llm4agents.com`
- An llm4agents.com agent (the app helps you create one if you don't have it)

## Quick start

```bash
npm install
npm run dev      # http://localhost:4302
```

The dev server proxies `/proxy/api` → `https://api.llm4agents.com` to avoid CORS. In production the SDK hits the API directly.

## Scripts

- `npm run dev` — Vite dev server on port 4302.
- `npm run build` — `tsc --noEmit && vite build`.
- `npm run preview` — serve `dist/` on port 4312.
- `npm test` — Vitest watch.
- `npm run test:ci` — Vitest single run (28 tests).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint (`no-floating-promises` and `no-explicit-any` are errors).

## Architecture

Clean Architecture (4 layers):

```
src/
├── domain/         types & branded values (Model, ApiKey, AgentId, UsdCents)
│                   council config, events, prompts (no IO)
├── application/    runCouncilChat orchestrator + prompt builders
│                   ports: RestApiPort
├── infrastructure/ RestApiClient + sdkClient (5 min timeout)
└── presentation/   routes / components / hooks (React)
    composition/    DI: composeApp(env) → AppContainer
```

Key invariants kept identical to the playground:

- `MAX_DEBATE_ROUNDS = 5`, `MIN_DEBATE_ROUNDS = 2`.
- Per-call hard timeout: 5 min. Per-call **idle** timeout: 60 s of silence = abort.
- The SDK's per-chunk cost ignores backend minimums and fees, so the council reports the **billed total via balance diff** (`balanceBefore − balanceAfter`) on the `council_done` event.
- Chairman emits `===COUNCIL_REASONING===` marker; UI splits inline during streaming so the marker never reaches the answer card.
- Snapshots persisted to localStorage drop `*_delta` events (~18× storage reduction).
- Cap of 5 runs per plan (15 total per agent).

## Deploy

Cloudflare Pages via `wrangler.toml`:

```bash
npm run build
npx wrangler pages deploy dist/
```

Set `VITE_API_BASE` only if you want to point at a non-prod backend. Defaults to `https://api.llm4agents.com`.

## Onboarding flow

1. **Welcome** — single screen with title + body + "Next".
2. **¿Tienes agente?** — two buttons.
3a. **Sí**: paste API key, the wizard hits `GET /v1/wallets/balance` to validate before storing. If the agent already has a balance, funding is skipped and you go straight to `/council`.
3b. **No**: ask for a name, hit `POST /api/v1/agents/register`, store the returned `apiKey + uuid`, then move to funding.
4. **Funding** — generate a Solana USDC deposit address, copy, refresh balance, continue.
5. → `/council`.

Settings has a **"Cambiar agente"** action that wipes the stored key and bounces you back to onboarding.

## Difference vs the playground's `/council` route

This app is a strict subset:

- Single-agent (no agent switcher; sign out + back in to change).
- No `/scrapers`, `/search`, `/images`, `/chat`. Only the council, plus a minimal Wallet, Transactions and Settings.
- No Dexie/IndexedDB; everything lives in `localStorage`.
- No `/agents` UI — registration is handled inside onboarding.
- The shared logic of the council itself (`runCouncilChat`, prompts, store, stream hook) is a copy of the playground's, kept feature-equivalent.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
