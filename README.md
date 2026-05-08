<h1 align="center">🏛️ AI Agent Council</h1>

<p align="center">
  <strong>Three frontier LLMs debate. One chairman synthesises. You get a sharper answer than any single model produces alone.</strong>
</p>

<p align="center">
  <em>Powered by <a href="https://llm4agents.com">llm4agents.com</a> — pay-per-call against your agent balance.</em>
</p>

---

## Why a council instead of one model?

A single LLM bakes its blind spots into the answer. Council runs three frontier models on the same task in parallel, has them **debate each other anonymously** across N rounds, and a chairman synthesises the final answer with its reasoning.

Disagreements surface, weak arguments get pruned, and the consensus you see is one all three models had to defend — not one model's confidence theatre. The chairman doesn't just pick a winner: it folds in the points the debate forced into the open. You consistently end up with **agreements grounded in evidence and new angles a single model would have skipped**.

Use it when the answer matters more than the latency, when a single model would paper over real trade-offs, or when you want to *see* where the strongest minds disagree before you decide.

## Example prompts

Try these to feel the difference between a single-model answer and a debated one. Each one is the kind of question where three perspectives produce something stronger than any one model on its own.

### 🏗️ System architecture
> Recommend a database stack for a fintech platform that needs 99.99% uptime, strict consistency, and 50k writes/second. Compare PostgreSQL with sharding, CockroachDB, and managed DynamoDB. Cover ops cost, vendor lock-in, and the realistic migration path if we outgrow the choice.

### 📈 Strategic business decision
> I run a 15-person B2B SaaS at $1.2M ARR with 18 months of runway. Should I raise a Series A in a tough market, or push for default-alive profitability first? Pressure-test the assumptions behind each path and give me the conditions under which each one becomes the wrong call.

### 🛡️ Security & code review
> Audit the authentication flow below for subtle vulnerabilities — race conditions, token leakage, timing attacks, replay surface. Rank findings by realistic exploitability rather than CVSS theatre, and propose the minimal patch set. [paste code]

### 🩺 Health trade-off framing
> I'm 38, sedentary, BMI 29, recently diagnosed with prediabetes. Lay out the case for (a) low-carb / keto, (b) Mediterranean diet + cardio, (c) GLP-1 + behavioural coaching. Weigh 12-month efficacy, sustainability, and side effects, and end with a decision framework — not a single recommendation.

### 👥 Hiring under uncertainty
> We have two finalists for VP Engineering: a brilliant 10x IC who has never managed, and a competent manager from a slower-moving company. Steelman each hire, then surface the failure modes our specific team would tolerate worst. Settle on the questions to ask in a final round to break the tie.

## Features

- 3 plan presets: **🪶 Lite** (≈$0.02/run), **⚡ Pro** (≈$0.45/run), **🚀 Power** (≈$2.20/run) with frontier models.
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
