# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

PML (PredictionMarketLitigation) is a **Cloudflare Workers** app scaffolded from
`cloudflare/agents-starter` (TypeScript + React 19 + Vite + Tailwind + Agents SDK +
Durable Objects). It is early in implementation: the current app is the starter's
demo **chat agent** (`src/server.ts` `ChatAgent`, `src/app.tsx` UI). The product's
real surfaces (litigation Tracker / Ops / Admin) are not built yet — the intended
designs live as self-contained static HTML prototypes under
`_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/*.html`. Planning
artifacts and per-story files live under `_bmad-output/`; `sprint-status.yaml`
tracks story state.

### Commands

Standard commands are defined in `package.json` `scripts` (`dev`, `test`, `deploy`,
`types`, `format`, `lint`, `check`) — use those. `npm run check` runs
`oxfmt --check . && oxlint src/ && tsc`.

### Cloudflare credentials are REQUIRED to run or test (non-obvious)

The `ai` binding in `wrangler.jsonc` is **Workers AI with `remote: true`**, and
Workers AI has no local model. As a result, both `npm run dev` (`@cloudflare/vite-plugin`)
and `npm test` (`@cloudflare/vitest-pool-workers`) open a **remote proxy session** on
startup and fail immediately in a non-interactive VM with:

> In a non-interactive environment, it's necessary to set a `CLOUDFLARE_API_TOKEN`
> environment variable for wrangler to work.

To run the dev server, tests, or the chat, set Cursor secrets `CLOUDFLARE_API_TOKEN`
(and `CLOUDFLARE_ACCOUNT_ID` if the token can access more than one account). This is
the non-interactive equivalent of `npx wrangler login`. Removing `remote: true` does
**not** help — Workers AI still proxies remotely — so do not edit `wrangler.jsonc` to
work around this; add the credentials instead. The chat model is
`@cf/moonshotai/kimi-k2.7-code` and consumes Workers AI usage on the linked account.

### What works WITHOUT credentials

`npm install`, `npm run lint` (oxlint), `npx tsc` (typecheck), `oxfmt --check .`, and
`npx vite build` all succeed offline. Use these for verification when no Cloudflare
token is present.

### Node version note

The VM's Node is v22.14.0. Some transitive `@babel/*` dev deps print
`EBADENGINE` warnings wanting `^22.18.0 || >=24.11.0`. These are **warnings only** —
install, lint, typecheck, and build all work on v22.14.0. `nvm` is available if a
newer Node is ever required.
