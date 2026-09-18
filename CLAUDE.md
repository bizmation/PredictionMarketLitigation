# PML — agent instructions

## Library documentation: use Context7 first

Before writing or changing code that touches an open-source library, fetch current docs through the Context7 MCP server (`resolve-library-id` → `query-docs`; project config in `.mcp.json`). Training data is stale for this stack — several dependencies moved major versions in 2026. Do not answer API/config questions for these from memory:

- Cloudflare: `wrangler` 4, `@cloudflare/vitest-pool-workers`, `@cloudflare/vite-plugin`, Workers AI (`env.AI.run` model ids), D1, Workflows, Durable Objects, `agents` SDK, `@cloudflare/ai-chat`, `workers-ai-provider`
- App: `react` 19, `zod` 4, `ai` 6, `jose` 6, `echarts` 5, `d3-geo` / `d3-selection`, `topojson-client`, `tailwindcss` 4
- Tooling: `vite` 8, `vitest` 4, `jsdom` 30, `@testing-library/react` 16, `typescript` 6, `oxlint` / `oxfmt`

Cite the Context7 source in the spec's Implementation Notes or the PR body when a doc lookup changed a decision. If Context7 has no entry for a library, say so and fall back to the installed package's `node_modules` types/README — never to memory alone.

## Verification

Story files and agent reports claim green builds that do not always reproduce. Re-run `npm run check` and `npm test` yourself and read the exit codes before calling anything done.
