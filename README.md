# PredictionMarketLitigation

Public repo for PredictionMarketLitigation.com — the open, data-driven source of record for U.S. prediction-market litigation, and a public demonstration of trustworthy autonomous AI (built by AI, governed and approved by a human).

## Development

Cloudflare Workers app scaffolded from [`cloudflare/agents-starter`](https://github.com/cloudflare/agents-starter) (TypeScript + React/Vite + Agents SDK/Durable Objects).

**Requirements:** Node ≥ 20.12 (`nvm use 24`), a Cloudflare account (`npx wrangler login`).

```bash
npm install       # install dependencies
npm run dev       # local dev server (Vite + Workers runtime) → http://localhost:5173
npm test          # Vitest (runs inside workerd via @cloudflare/vitest-pool-workers)
npm run check     # format check + lint + typecheck
npm run types     # regenerate env.d.ts after wrangler.jsonc changes
```

Deploys, environments (dev/staging/prod), and custom domains arrive in Story 1.5 — `npm run deploy` is not yet wired to CI.

Planning artifacts live in `_bmad-output/` (BMAD method); the architecture decision record is at `_bmad-output/planning-artifacts/architecture.md`.
