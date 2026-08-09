---
baseline_commit: 9ddc455967997d76d8d0e96104055ade57e08197
---

# Story 1.1: Scaffold Cloudflare Agents Starter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer (Patrick),
I want the repo initialized from the Cloudflare Agents Starter,
So that we have a TypeScript + React/Vite + Agents/DO foundation to build PML on.

## Acceptance Criteria

1. **Given** a clean workspace for PML, **when** the project is scaffolded with the Cloudflare Agents Starter template (in-repo init — see Dev Notes for the exact validated procedure), **then** the app runs locally via the starter's `npm run dev` / Wrangler flow
2. TypeScript, Vite, `@cloudflare/vite-plugin`, and Agents SDK wiring are present
3. The starter's default UI is replaceable (not treated as brand lock)
4. Wrangler config is ready for later D1 / Access / multi-domain bindings (stubs OK)
5. Vitest is configured (with Cloudflare Workers/Workflows test patterns per architecture) and at least one sample test passes via `npm test` (readiness M1)

## Tasks / Subtasks

- [x] Task 1: Environment preflight (AC: 1)
  - [x] Use Node ≥ 20.12 — **this machine's default `node` is v16.20.2 and WILL FAIL**. Prefix all commands: `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"` (verified installed) or `nvm use 24`
  - [x] Verify Cloudflare auth: `npx wrangler whoami`. If unauthenticated, HALT and ask Patrick to run `npx wrangler login` (interactive browser flow — do not attempt to script credentials)
- [x] Task 2: Scaffold via create-cloudflare into a subdirectory, then merge to repo root (AC: 1, 2)
  - [x] `npm create cloudflare@latest pml -- --template cloudflare/agents-starter --no-git --no-deploy` (repo root is non-empty; c3 must NOT git-init or deploy — we are inside an existing git repo)
  - [x] Move scaffold contents from `pml/` into repo root: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `tsconfig.json`, `src/`, `public/`, any dotfiles the starter ships EXCEPT `.gitignore` (see Task 3). Delete the emptied `pml/` dir
  - [x] Do NOT overwrite existing root files: `README.md` (keep ours or append starter run instructions under a "Development" section), `.gitignore` (merge — Task 3), `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/`, `docs/`
  - [x] `npm install` at repo root
- [x] Task 3: Merge `.gitignore` (AC: 1)
  - [x] APPEND starter ignore entries to the EXISTING root `.gitignore` (`node_modules/`, `.wrangler/`, `dist/`, `.dev.vars*`, `.env*` as the starter defines them)
  - [x] NEVER remove existing rules — especially `_bmad-output/**/.decision-log.md`, `_bmad-output/**/addendum.md`, `.claude/settings.local.json` (deliberate privacy rules on this PUBLIC repo)
  - [x] Confirm `.dev.vars` is ignored before creating any local vars file
- [x] Task 4: Verify dev flow (AC: 1, 2, 3)
  - [x] `npm run dev` boots (Vite + `@cloudflare/vite-plugin`); starter chat UI loads on the local URL
  - [x] Starter default model path is **Workers AI with `ai: { remote: true }`** in `wrangler.jsonc` — no OpenAI/Anthropic key required; remote binding needs the wrangler auth from Task 1
  - [x] Confirm the Agents SDK Durable Object class in `src/server.ts` matches its `durable_objects` binding + migration (`new_sqlite_classes`) in `wrangler.jsonc`
  - [x] Run `npm run cf-typegen` (or starter equivalent) so `Env` types are generated; re-run after any config change
- [x] Task 5: Wrangler config readiness stubs (AC: 4)
  - [x] Set `name` to `pml`; keep the scaffold-current `compatibility_date` and `nodejs_compat`
  - [x] Add a commented/stub shape showing where later bindings land, noting Wrangler env semantics: bindings (`d1_databases`, `vars`) are **non-inheritable and must be defined per env**; `routes` use `{ pattern, custom_domain: true }` (Stories 1.4/1.5/2.1 fill these — do NOT create real D1/Access/domains now)
- [x] Task 6: Vitest setup + sample test (AC: 5)
  - [x] Add dev deps: `vitest@~4.1.10` + `@cloudflare/vitest-pool-workers` (Workers pool per architecture testing standard)
  - [x] Create `vitest.config.ts` using the Workers pool wired to `wrangler.jsonc`
  - [x] Add one co-located sample test (`src/*.test.ts`) — e.g., Worker fetch returns a response / trivial unit — passing via `npm test` script
- [x] Task 7: Finalize (AC: all)
  - [x] Full check: `npm test` green, `npm run dev` boots, TypeScript compiles
  - [x] Update Dev Agent Record (below) + File List; set story status `review`
  - [x] Commit with message `story 1.1: scaffold cloudflare agents-starter foundation` (single commit; do not push)

## Dev Notes

### Validated environment facts (checked 2026-08-09 — do not re-derive)

- **Node:** machine default is v16.20.2 (too old; installer/tooling needs ≥20.12). nvm has v20.19.3–v24.11.0; use **v24.11.0**
- **Current versions (live npm):** `create-cloudflare` 2.70.18 · `agents` 0.20.1 · `wrangler` 4.120.0 · `@cloudflare/vite-plugin` 1.51.1 · `vitest` 4.1.10 (architecture-pinned) · `zod` 4.4.3 (architecture-pinned — **NOT used in this story**; arrives with schemas in Story 2.1)
- **Starter stack today (verified via cloudflare/agents-starter):** TypeScript, React via Vite, Tailwind + Kumo UI styles, Agents SDK + Durable Objects (SQLite), demo chat agent with tools/scheduling/HITL-style tool approval. Defaults to **Workers AI (`remote: true`)** — no third-party API keys
- **c3 gotchas (from Cloudflare skill):** scaffolds into a NEW subdirectory (hence Task 2's merge step); `--no-git --no-deploy` required inside this repo; placeholder binding IDs must be replaced with real ones only when bindings actually get created (later stories); avoid duplicate lockfiles (npm only)

### Architecture requirements binding this story

- **Platform LOCKED: Cloudflare** (Workers + Agents SDK + Workflows + AI Gateway + D1 + Access). Starter choice LOCKED: `cloudflare/agents-starter`. [Source: _bmad-output/planning-artifacts/architecture.md#Starter-Template-Evaluation]
- **This story = scaffold only.** The target structure (`src/surfaces/{apex,ops,admin}`, `src/pipeline/`, `src/shared/`) is where code MIGRATES in later stories — do NOT restructure now; keep starter layout (`src/server.ts`, `src/app.tsx`, `src/client.tsx`). [Source: architecture.md#Complete-Project-Directory-Structure]
- **Naming going forward:** PascalCase components, camelCase functions, `PascalCase + Schema` Zod types, DO/Workflow classes PascalCase (`DailyRunWorkflow`, `ApprovalGateAgent`). Starter files may not comply — leave them; apply to NEW code from 1.2 onward. [Source: architecture.md#Naming-Patterns]
- **Testing standard:** Vitest 4.1.10 + Workers vitest patterns, co-located `*.test.ts(x)`. This story installs it (readiness M1). [Source: architecture.md#Frontend-Architecture; epics.md Additional Requirements]
- **Secrets:** only via Wrangler/Secrets Store; never `.env` committed; `.dev.vars` local-only. [Source: architecture.md#File-Structure-Patterns]

### Scope boundaries (do NOT do in this story)

- No D1 database creation, no migrations dir, no Zod schemas → Story 2.1 / 3.1
- No Cloudflare Access, no admin gating → Story 1.4
- No CI/CD (Workers Builds), no envs (dev/staging/prod), no custom domains → Story 1.5
- No PML branding/design tokens (starter UI stays; it is explicitly replaceable) → Story 1.2
- No deploy (`--no-deploy`; `npm run deploy` untested until 1.5)
- No AI Gateway wiring / OpenRouter / role→model config → Story 3.2
- Never touch `_bmad/`, `_bmad-output/` (except this story file's Dev Agent Record), `.claude/`, `.agents/`, `docs/`, or the `Prediction Market Litigation scoping.zip` at root

### Project Structure Notes

- Post-merge root layout = starter layout + existing repo dirs side by side (`src/`, `public/`, `wrangler.jsonc`, `vite.config.ts`, `package.json` at root; `_bmad*`/`docs`/`.claude`/`.agents` untouched)
- `wrangler.jsonc` at repo root is the future home of env blocks (`env.staging`, `env.production`) — remember bindings are non-inheritable per env (validated against current Wrangler docs)
- Starter may ship Prettier/Oxlint config — keep them; they apply to `src/` only

### Testing standards summary

- Runner: Vitest ~4.1.10, pool: `@cloudflare/vitest-pool-workers` (runs tests inside workerd against `wrangler.jsonc`)
- Location: co-located `src/**/*.test.ts(x)`
- This story's bar: ≥1 passing sample test via `npm test`; real coverage obligations begin 3.3/3.6/3.11 (Run lifecycle, enforcement fixtures, gate write-path)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.1] — story + ACs (readiness-amended, incl. Vitest AC)
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter-Template-Evaluation] — starter lock + rationale + init command
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns-Consistency-Rules] — naming/format/write-path rules
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-09.md] — M1 (Vitest), M2 (CI/CD deferred to 1.5)
- [Source: Cloudflare skill references c3/gotchas.md, agents-sdk/*, wrangler/configuration.md — validated 2026-08-09]
- [Source: github.com/cloudflare/agents-starter README — fetched 2026-08-09]

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session

### Debug Log References

- c3 (create-cloudflare 2.70.18) added a new interactive "add AGENTS.md?" prompt not covered by `--no-git --no-deploy`; EOF-cancelled after template copy + dependency install had completed — scaffold was complete, AGENTS.md simply not created (not needed)
- `@cloudflare/vitest-pool-workers@0.20.3` no longer exports `defineWorkersConfig` from `/config` (vitest-4-aligned line, peer `vitest ^4.1.0`) — current docs pattern is the `cloudflareTest()` **Vite plugin** with `defineConfig` from `vitest/config`; verified against developers.cloudflare.com
- First test run failed with `SyntaxError` importing `src/server.ts` — `@callable()` decorators (server.ts:39,44) need the `agents/vite` plugin transform; adding `agents()` to vitest.config plugins (mirroring vite.config.ts) fixed it
- `npm run check` (oxfmt) initially scanned `_bmad-output/` design-handoff HTML and errored — added `ignorePatterns` (`_bmad/**`, `_bmad-output/**`, `.claude/**`, `.agents/**`, `docs/**`) to `.oxfmtrc.json`

### Completion Notes List

- Scaffolded `cloudflare/agents-starter` via c3 into `pml/`, merged to repo root, `pml/` removed. Starter stack landed: TS + React 19 + Vite 8 + Tailwind 4 + Kumo UI, Agents SDK 0.17.4 + DO (SQLite), Workers AI (`remote: true` — no third-party API keys), TypeScript 6, oxlint/oxfmt
- **Exclusions (deliberate):** starter `.github/` CI workflows (CI/CD is Story 1.5), template `LICENSE` (Cloudflare's MIT — project licensing is an open FR-38 decision for Patrick), starter README + banner svg (kept ours; appended Development section)
- `.gitignore`: appended Node/Cloudflare block (root had NO `node_modules/` rule); all 3 protected privacy rules verified intact; `.wrangler`/`.dev.vars*`/`.env*` ignored
- `wrangler.jsonc`: `name` → `pml`; commented stub map for future bindings documenting non-inheritable-per-env semantics (D1 → 2.1, envs/domains → 1.5, Access → 1.4, AI Gateway → 3.2); validated via `wrangler deploy --dry-run` (bindings: ChatAgent DO + AI)
- **Wrangler upgraded 4.113.0 → 4.120.0** (template lockfile was behind; requested by Patrick mid-story); `npm run types` regenerated `env.d.ts` after config changes
- Vitest wired red→green: failing `npm test` first (no framework), then vitest 4.1.10 + pool-workers 0.20.3 + `vitest.config.ts` (cloudflareTest plugin + agents transform); sample smoke test passes **inside workerd** against `wrangler.jsonc`
- `package.json`: name `pml`, version 0.1.0, PML description, `test` script added
- README: fixed pre-existing name typo (Predictive→Prediction), added product one-liner + Development section
- Noted: template already ships `zod ^4.4.3` — exactly the architecture pin (schemas still arrive in Story 2.1)
- Final verification: `npm run check` (format+lint+tsc) ✅ · `npm test` 1/1 ✅ · `npm run dev` boots, GET / → 200 ✅ · dry-run deploy ✅

### Change Log

- 2026-08-09: Story implemented end-to-end (scaffold → merge → gitignore → dev-verify → config stubs → wrangler upgrade → vitest red/green → check suite). Status → review.

### File List

New (from starter template):
- package.json (renamed pml, +test script, wrangler bumped)
- package-lock.json
- wrangler.jsonc (renamed + future-binding stubs)
- vite.config.ts
- tsconfig.json
- index.html
- env.d.ts (generated by `npm run types`)
- src/server.ts
- src/app.tsx
- src/client.tsx
- src/styles.css
- public/favicon.ico
- .oxlintrc.json
- .prettierignore

New (authored this story):
- vitest.config.ts
- src/server.test.ts

Modified:
- .oxfmtrc.json (from starter + ignorePatterns for planning/tooling dirs)
- .gitignore (Node/Cloudflare block appended)
- README.md (typo fix + Development section)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status transitions)
- _bmad-output/implementation-artifacts/1-1-scaffold-cloudflare-agents-starter.md (this file)

Not adopted from starter (deliberate): .github/workflows (sanity-check.yml, semgrep.yml), LICENSE (later added in code review), README.md, npm-agents-banner.svg

Code review follow-ups (2026-08-09):
- LICENSE (MIT)
- .nvmrc
- package.json (engines + @cloudflare/vite-plugin bump)
- package-lock.json (lockfile after vite-plugin bump)
- .gitignore (`!.env.example`)
- src/server.ts (`calculate` modulo-by-zero guard)

### Review Findings

- [x] [Review][Patch] Add root MIT `LICENSE` (decision: keep `"license": "MIT"` + ship LICENSE now) [`LICENSE`]
- [x] [Review][Patch] Align Wrangler toolchain — top-level `wrangler@^4.120.0` nests under `@cloudflare/vite-plugin@1.46.0` as `wrangler@4.113.0` [`package.json`:38]
- [x] [Review][Patch] Pin Node ≥20.12 via `engines` and/or `.nvmrc` — machine default Node 16 fails install; README/story document the requirement but nothing enforces it [`package.json`]
- [x] [Review][Patch] `.gitignore` `.env.*` also ignores `.env.example` — conflicts with architecture’s planned root `.env.example` [`.gitignore`:249]
- [x] [Review][Patch] `calculate` guards `/` by zero but not `%` [`src/server.ts`:120]
- [x] [Review][Defer] Unauthenticated starter agent surface (chat + Workers AI + `@callable` MCP add/remove) [`src/server.ts`:39] — deferred, pre-existing
- [x] [Review][Defer] Starter HTML still titled “Agent Starter” [`index.html`:10] — deferred, pre-existing
- [x] [Review][Defer] Starter UI edge cases (blob URL leak on unmount, silent approval no-op, send/attachment races, unguarded mediaType/text) [`src/app.tsx`] — deferred, pre-existing
