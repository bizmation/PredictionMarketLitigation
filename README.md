# PredictionMarketLitigation

Public repo for PredictionMarketLitigation.com — the open, data-driven source of record for U.S. prediction-market litigation, and a public demonstration of trustworthy autonomous AI (built by AI, governed and approved by a human).

## Development

Cloudflare Workers app scaffolded from [`cloudflare/agents-starter`](https://github.com/cloudflare/agents-starter) (TypeScript + React/Vite + Agents SDK/Durable Objects).

**Requirements:** Node ≥ 20.12 (`nvm use 24`). No Cloudflare account needed for local development or tests.

```bash
npm install       # install dependencies
npm run dev       # local dev server (Vite + Workers runtime) → http://localhost:5173
npm test          # Vitest (workers project in workerd, ui project in node)
npm run check     # format check + lint + typecheck
npm run build     # production build
npm run types     # regenerate env.d.ts after wrangler.jsonc changes
```

**Neither `npm run dev` nor `npm test` requires a `CLOUDFLARE_API_TOKEN.`** Workers AI has no local simulation, so the `ai` binding is dropped in serve mode (`vite.config.ts`) and omitted from the test config (`wrangler.test.jsonc`). `vite build` is unaffected — the deployed Worker keeps the binding, and a test pins that.

If you need the real Workers AI path locally, put `CLOUDFLARE_API_TOKEN=...` in `.env` (gitignored) and remove the `command === "serve"` gate temporarily.

For the full check including the client-bundle secret scan:

```bash
npm run build && npm test
```

## Surfaces

One Worker serves three surfaces, resolved from the URL (`src/shared/lib/surface.ts`):

| Surface | Where                                | Auth                                   |
| ------- | ------------------------------------ | -------------------------------------- |
| apex    | `predictionmarketlitigation.com`     | public                                 |
| ops.    | `ops.predictionmarketlitigation.com` | public                                 |
| admin   | `/admin` on either host              | Cloudflare Access + operator allowlist |

`/api/admin/*` and `/agents/*` require a verified operator — the Worker validates the Access JWT itself (signature, issuer, audience) rather than trusting the edge, because `workers.dev` and preview URLs are doors the edge policy does not cover. See [`docs/access-runbook.md`](docs/access-runbook.md).

## Deployment

| Environment | Worker           | D1               | Domains                     | Command                     |
| ----------- | ---------------- | ---------------- | --------------------------- | --------------------------- |
| local       | — (miniflare)    | `pml-dev`        | `localhost:5173`            | `npm run dev`               |
| staging     | `pml-staging`    | `pml-staging`    | `staging.` + `ops-staging.` | `npm run deploy:staging`    |
| production  | `pml-production` | `pml-production` | apex + `ops.`               | `npm run deploy:production` |

Pushes to `main` build and deploy via Cloudflare Workers Builds. `workers_dev` and `preview_urls` are disabled in every environment so no unintended public hostname exists.

**There is no bare `npm run deploy`, deliberately.** With named environments defined, an env-less `wrangler deploy` publishes a third Worker called `pml` with its own Durable Object namespace — agent state would fork from production's — and no D1 binding.

Every binding is redeclared inside each `env` block in `wrangler.jsonc`. Wrangler treats a top-level binding missing from an environment as a _warning_, not an error, so a forgotten one deploys clean and fails at runtime. Run `npx wrangler deploy --env <env> --dry-run` and read the output before deploying.

One-time account setup — D1 creation, domain binding, secrets, Workers Builds, Access — is in [`docs/deploy-runbook.md`](docs/deploy-runbook.md).

## Documentation

- [`docs/deploy-runbook.md`](docs/deploy-runbook.md) — one-time Cloudflare account setup
- [`docs/access-runbook.md`](docs/access-runbook.md) — how operator auth works, and the Zero Trust checklist
- `_bmad-output/planning-artifacts/architecture.md` — architecture decision record
- `_bmad-output/` — planning and implementation artifacts (BMAD method)
