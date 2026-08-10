---
baseline_commit: fd41218cde90ad0483cf0a296c3ca8dc33b1e4c1
---

# Story 1.5: Deploy Pipeline & Environments

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Patrick),
I want CI/CD, three environments, and the real custom domains wired,
So that every later story ships somewhere real instead of accumulating an undeployed local build.

## ⚠️ Two-part story — read this before anything else

**Most of this story's original ACs require Patrick's Cloudflare account.** Connecting Workers Builds, creating D1 databases, binding custom domains to a zone, running `wrangler secret put`, and creating the Zero Trust Access application are all dashboard/CLI actions against a live account. A dev agent cannot do them and must not pretend to.

**Decision (Patrick, 2026-08-10): the agent ships everything code-side; the dashboard steps become an operator runbook Patrick executes.**

| Part A — dev agent, this story | Part B — Patrick, from the runbook |
|---|---|
| `env.staging` / `env.production` blocks with placeholder `database_id` | `wrangler d1 create` ×3, paste real ids |
| `workers_dev: false`, `preview_urls: false` | Connect Workers Builds to the repo |
| `.gitattributes` + working-tree renormalization | Bind apex + `ops.` custom domains |
| Dev server boots with no `CLOUDFLARE_API_TOKEN` | `wrangler secret put --env` per environment |
| `build` / `deploy:staging` / `deploy:production` scripts | Create the Access application per the 1.4 runbook |
| `/agents/*` gated behind `requireOperator` | Verify both production domains in a browser |
| CI-runnable bundle-secret assertion | |
| README deploy flow + environment matrix | |

**AC7 (end-to-end deploy verified) cannot be satisfied by the dev agent.** It is written below as explicitly pending Patrick's run. Do not check it off. Do not fabricate a deploy. Marking this story `review` with AC7 open is the correct outcome.

**Also decided (2026-08-10):**
- **`/agents/*` gets gated**, not deleted — reuse 1.4's `requireOperator`. The `ChatAgent` DO and its Agents/DO wiring survive for Epic 3; anonymous callers do not.
- **Google Fonts stays.** The ledger's open question is closed as a deliberate decision: keep the CDN load. Remove the entry from `deferred-work.md`; do not self-host in this story.

## Acceptance Criteria

1. **Given** the repo at `fd41218`, **when** Wrangler environments are added, **then** `env.staging` and `env.production` each declare their **own** copy of every non-inheritable binding (`ai`, `durable_objects`, `d1_databases`, `vars`) — a forgotten binding is a *warning*, not an error, and deploys a Worker that fails at runtime
2. **And** `workers_dev: false` and `preview_urls: false` are set at the top level so every environment inherits them — these are the hostnames `access.ts` names as the reason JWT verification exists
3. **And** `/agents/*` requires a verified operator: an unauthenticated request gets `403` with the same envelope `/api/admin/*` returns, asserted by test — this closes the surface ledgered since Story 1.1
4. **And** `npm run check` passes on a clean Windows checkout: `.gitattributes` pins LF, the working tree is renormalized, and `oxfmt --check .` reports zero issues across all 48 files (currently 18 fail)
5. **And** `npm run dev` starts with **no** `CLOUDFLARE_API_TOKEN` present, without altering what `vite build` emits
6. **And** a committed test asserts no Access config name (`TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS`, `cloudflareaccess`) appears in the built client bundle — replacing the one-time manual grep from Story 1.4 (AC6)
7. **And** *(Patrick, Part B — pending, do not check off in Part A)* a push to the production branch builds and deploys automatically; three environments exist with separate D1 databases; apex and `ops.` resolve to the deployed Worker; `/admin` challenges via Access while `/`, `ops.` and `POST /api/poll/votes` stay public
8. **And** `README.md` documents the deploy flow and the environment matrix (readiness M2), and `docs/deploy-runbook.md` gives Patrick the ordered dashboard steps

## Tasks / Subtasks

- [ ] Task 1: Preflight (AC: all)
  - [ ] Node ≥ 20.12 (`.nvmrc` = 24). Confirm baseline: `npm test` → **160 tests, 7 files, exit 0, no cloud credentials**. That invariant is load-bearing — nothing in this story may require credentials to test
  - [ ] Confirm `npm ci` exits 0. It was broken during 1.4 and is now fixed; if it regresses, stop and fix the lockfile before anything else, because Workers Builds runs `npm clean-install`
  - [ ] Note the current failure you are fixing: `npx oxfmt --check .` → "Format issues found in above 18 files"
- [ ] Task 2: `.gitattributes` and renormalization (AC: 4)
  - [ ] **Do this first and commit it alone.** Every later task's diff is unreadable if line endings churn underneath it
  - [ ] Create `.gitattributes` at repo root, written with **LF** endings:
    ```gitattributes
    # oxfmt has no endOfLine option and always expects LF. Without this,
    # core.autocrlf=true checks the tree out as CRLF on Windows and
    # `oxfmt --check` fails on every file. eol=lf overrides core.autocrlf.
    * text=auto eol=lf

    *.bat  text eol=crlf
    *.cmd  text eol=crlf
    *.ps1  text eol=crlf

    *.png  binary
    *.jpg  binary
    *.jpeg binary
    *.gif  binary
    *.webp binary
    *.ico  binary
    *.woff binary
    *.woff2 binary
    *.zip  binary
    *.pdf  binary

    package-lock.json -diff linguist-generated=true
    ```
  - [ ] Renormalize. **The index is already LF** (`git ls-files --eol` shows `i/lf w/crlf`), so step 2 below stages nothing and there is no whole-tree history diff — the churn people fear only happens when CRLF is committed. Verify that claim rather than assuming it:
    ```bash
    git status --porcelain          # MUST be empty before starting
    git add .gitattributes && git commit -m "chore: pin LF line endings"
    git add --renormalize .
    git status --porcelain          # expect empty; commit if not
    git rm --cached -r . --quiet
    git reset --hard
    git ls-files --eol package.json vite.config.ts   # expect i/lf w/lf
    ```
  - [ ] `npm run check` must now pass end to end. If `oxfmt` still reports files, run `npm run format` and commit that separately with a message saying it is mechanical
  - [ ] Do **not** also set `core.autocrlf false` in the repo — `.gitattributes` wins, and a second source of truth invites confusion
- [ ] Task 3: Dev server without a Cloudflare token (AC: 5)
  - [ ] Problem: `wrangler.jsonc`'s `ai` binding is `remote: true`. Workers AI has **no local simulation** — `remote: false` is an *error*, and omitting `remote` connects remotely anyway. So the only way to boot tokenless is to drop the binding in serve mode
  - [ ] Use the Vite plugin's programmatic `config` option, gated on Vite's `command` so `vite build` is untouched:
    ```ts
    export default defineConfig(({ command }) => ({
      plugins: [
        agents(),
        react(),
        cloudflare(
          command === "serve" ? { config: (c) => { delete c.ai; } } : undefined
        ),
        tailwindcss()
      ]
    }));
    ```
  - [ ] The **mutating function form is required** — the plugin merges config with `defu`, so an override object cannot delete a key
  - [ ] `env.AI` is `undefined` in dev as a result. `src/server.ts:51` reads it inside `ChatAgent.onChatMessage`. After Task 5 that path is operator-gated, but add a clear guard or comment so the failure is legible rather than a mystery `undefined` crash
  - [ ] Verify BOTH halves: `npm run dev` boots with no token in the environment, **and** `vite build` still emits `ai` into `dist/pml/wrangler.json`. Grep the built file — this is the regression that would silently ship a Worker with no AI binding
  - [ ] Do **not** solve this with a third wrangler config file. `wrangler.test.jsonc` already carries a hand-sync burden; a `wrangler.dev.jsonc` would add another drift surface
  - [ ] Document in `README.md` that anyone needing the real AI path puts `CLOUDFLARE_API_TOKEN` in `.env` (already gitignored)
- [ ] Task 4: Environments and deploy scripts (AC: 1, 2)
  - [ ] Add `"workers_dev": false` and `"preview_urls": false` at the **top level** — both are inheritable, so all environments get them. State them explicitly; do not rely on the inference from `routes`, and note the default flipped twice in wrangler 4.34/4.44
  - [ ] Add `env.staging` and `env.production`. **Every binding must be redeclared in each env** — `ai`, `durable_objects`, `d1_databases`, `vars`. Wrangler emits a *warning*, not an error, for a top-level binding missing from an env, so a forgotten `durable_objects` deploys clean and fails at runtime
  - [ ] `database_id` values are placeholders until Part B. Use an obvious sentinel like `"<created-in-part-b>"` and say so in a comment — **do not leave the field absent.** Wrangler's automatic provisioning is on by default and would create a database and write the id back, which in a Workers Builds run is not persisted to the repo — silent prod drift
  - [ ] Routes: production gets `predictionmarketlitigation.com` and `ops.predictionmarketlitigation.com`, both `custom_domain: true`. Staging gets `staging.` and `ops-staging.` equivalents. Custom Domains point **all paths** at the Worker, which is what a whole site needs; a route pattern is the wrong tool
  - [ ] **`ACCESS_DEV_BYPASS` must not appear in any env block.** `src/shared/lib/wranglerConfig.test.tsx` asserts this and will fail if it does. That test's second case also asserts no `vars` block exists at all — you are adding `vars` per env, so **narrow that assertion rather than deleting it**: the invariant that matters is the bypass never becoming deployable
  - [ ] `package.json`: add `"build": "vite build"`. Replace the bare `"deploy"` with `"deploy:staging"` and `"deploy:production"`. **Delete the env-less `deploy` script** — with named envs defined, a bare `wrangler deploy` publishes a *third* Worker named `pml` with its own Durable Object namespace (DO storage is keyed by script name, so agent state silently forks) and no D1 binding
  - [ ] With the Vite plugin the environment is selected at **build** time via `CLOUDFLARE_ENV`, not at deploy time; `wrangler deploy --env` then validates the match:
    ```jsonc
    "deploy:staging":    "cross-env CLOUDFLARE_ENV=staging vite build && wrangler deploy --env staging",
    "deploy:production": "cross-env CLOUDFLARE_ENV=production vite build && wrangler deploy --env production"
    ```
  - [ ] `cross-env` is needed for Windows (`VAR=x cmd` is not valid in PowerShell/cmd). Add it as a devDependency — this is the one new dependency this story is authorised to add
  - [ ] Run `npx wrangler deploy --env production --dry-run` to validate config shape without deploying. Read the warning output carefully: any "exists at the top level, but not on env.production" line is a missing binding
- [ ] Task 5: Gate `/agents/*` (AC: 3)
  - [ ] Reuse `requireOperator` from `src/shared/lib/adminGuard.ts`. Do **not** write a second auth path
  - [ ] Add `isAgentsPath(pathname)` alongside `isAdminApiPath`, matching `/agents` and `/agents/...` with the same normalization (decode, collapse slashes) — the encoding bypasses that applied to the admin prefix apply identically here
  - [ ] In `src/server.ts`, guard before `routeAgentRequest`. Same 403 envelope, same `ADMIN_CACHE_HEADERS`, same silence about why
  - [ ] Leave `ChatAgent` itself untouched. Epic 3 builds on this Agents/DO wiring — the door gets a lock, the room stays
  - [ ] Tests: unauthenticated `/agents/chat-agent/x` → 403; `/agents` bare → 403; encoded/double-slash variants → 403; operator (dev bypass on loopback) → not 403; `/agentsomething` → **not** guarded
  - [ ] Update `deferred-work.md`: strike the `/agents/*` entries from the 1.1 and 1.4 sections with a **RESOLVED 2026-08-10 (Story 1.5)** note, matching how 1.3 retired its predecessors
- [ ] Task 6: Bundle-secret assertion (AC: 6)
  - [ ] Story 1.4 verified this with a one-time manual grep recorded in prose. Replace it with something that runs
  - [ ] Add to `src/shared/lib/wranglerConfig.test.tsx` (the `ui` project — plain node, has `fs`): if `dist/client/` exists, assert no file contains `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS`, or `cloudflareaccess`
  - [ ] **Skip cleanly when `dist/` is absent** rather than failing — a fresh clone has no build output, and a test that fails on a clean checkout will be deleted by the next person. Use `it.skipIf`, and log why it skipped
  - [ ] Document in README that `npm run build && npm test` is the full-fidelity check
- [ ] Task 7: Operator runbook (AC: 7, 8)
  - [ ] Create `docs/deploy-runbook.md` — Patrick's ordered checklist. Write it for someone with the dashboard open, in the order the dependencies actually require:
    1. `npx wrangler d1 create pml-dev|pml-staging|pml-production`; paste the three ids into `wrangler.jsonc`, replacing the sentinels
    2. Bootstrap each env once from the laptop: `npx wrangler deploy --env staging --secrets-file .env.staging` (gitignored). **Secrets cannot be set for a Worker that does not exist yet** — `wrangler secret put --env staging` on an undeployed env returns API error 10007, a genuine chicken-and-egg
    3. Bind custom domains. Prerequisite: an active zone, and **no pre-existing CNAME** on the hostname. Cloudflare creates the DNS record and manages the certificate
    4. Connect Workers Builds — one connection per env-Worker, since Builds has no environment concept. Build command `CLOUDFLARE_ENV=production npm run build`, deploy command `npx wrangler deploy --env production`. The dashboard Worker name must match the config's resolved name or the build fails
    5. **Leave non-production branch builds OFF.** They mint preview URLs, which is exactly the surface Task 4 disables
    6. Then the Access application, per the existing `docs/access-runbook.md` checklist — it already has the destination list and the AUD-tag step
  - [ ] Cross-link, do not duplicate: `docs/access-runbook.md` already owns the Access half. Reference it
  - [ ] Record the deferred config values as they land: the three `database_id`s, `TEAM_DOMAIN`, and per-environment `POLICY_AUD`. **Staging and production have different Access applications and therefore different AUD tags** — reusing one silently accepts staging tokens in production
  - [ ] `README.md`: deploy flow, the environment matrix (env → Worker name → D1 → domains), the tokenless-dev note from Task 3, and that `npm run deploy` no longer exists
- [ ] Task 8: Tests and validation (AC: all in Part A)
  - [ ] `npm test` green — expect 160 plus your additions, still with **zero cloud credentials**
  - [ ] `npm run check` green **end to end**, including `oxfmt --check .`. This is the first story where that can actually pass; it is AC4
  - [ ] `npx wrangler deploy --env production --dry-run` and `--env staging --dry-run` both succeed with no missing-binding warnings
  - [ ] `npm run dev` boots with `CLOUDFLARE_API_TOKEN` unset
  - [ ] `npm ci` exits 0
- [ ] Task 9: Finalize (AC: all in Part A)
  - [ ] Update Dev Agent Record + File List (build the File List from `git diff --name-only`, not memory — two prior stories got this wrong)
  - [ ] Set status `review`. **Leave AC7 explicitly unchecked** with a one-line note that it awaits Patrick's Part B run
  - [ ] Commit `story 1.5: environments, deploy pipeline, envelope` (single commit; do not push). The `.gitattributes` renormalization from Task 2 may be a separate earlier commit — that is expected and correct

## Dev Notes

### Inherited scope — what this story actually closes

Verified against the working tree at `fd41218`, not taken from the ledger's word:

| Item | Ledgered by | State | This story |
|---|---|---|---|
| `/agents/*` unauthenticated | 1.1, 1.4 | **still true** — `src/server.ts:236` falls straight through | Task 5 |
| `workers_dev` / `preview_urls` not disabled | 1.4 | **still true** — neither key exists | Task 4 |
| No `.gitattributes`, `oxfmt` fails repo-wide | 1.3 | **still true** — 18 files (ledger says ~40; stale, 1.4 formatted its own) | Task 2 |
| AC6 rests on a manual grep | 1.4 | **still true** — no committed guard | Task 6 |
| Dev server needs a token | 1.4 Debug Log (not in ledger) | **still true** | Task 3 |
| `npm ci` fails | 1.4 traps | **ALREADY FIXED** — exits 0, lockfile committed in `08ec412` | none — verify only |
| Google Fonts CDN | 1.2 | open question | **closed by decision** — keep; remove ledger entry |
| Admin session display name (AC4 half) | 1.4 | still true | **not this story** — needs a real Access session; leave for a follow-up once Part B lands |
| JWKS spray, `shared/lib` boundary, `access-env.d.ts` fragility | 1.4 | still true | **not 1.5** — no owner assigned; leave in the ledger |

Do not write tasks for the rows marked ALREADY FIXED or not-this-story. Two prior stories wasted review cycles on dead work.

### Wrangler environments — the part that bites

**The published non-inheritable list is incomplete.** The docs omit `ai`, `d1_databases`, `hyperdrive`, `browser`, `images`, `analytics_engine_datasets` and more. The authoritative list comes from wrangler's own `notInheritable()` call sites. **Treat every binding as non-inheritable** and redeclare all of them per env. `wrangler.jsonc:9-11` already says this; it is right.

**The failure mode is a warning, not an error:**
> `"<field>" exists at the top level, but not on "env.<name>". This is not what you probably want…`

So a missing `durable_objects` in `env.production` deploys successfully and fails at runtime. Read the dry-run output.

**Inheritable, safe at top level:** `name`, `main`, `compatibility_date`, `compatibility_flags`, `workers_dev`, `preview_urls`, `routes`, `assets`, `observability`, `migrations`, `limits`, `placement`, `logpush`, `triggers`.

**Named envs deploy as `<name>-<env>`** → `pml-staging`, `pml-production`. The unnamed top-level env remains independently deployable as `pml` — which is why Task 4 deletes the bare `deploy` script.

### The dev-server token problem, precisely

There is no local Workers AI at all: *"There is no current local simulation for Workers AI"*, and using it *"always accesses your Cloudflare account … even in local development"*. `remote: false` is rejected outright; omitting `remote` connects remotely with a warning. So the options are supply a token, omit the binding in dev, or fake it. Task 3 omits it.

The `config` option is documented as *"primarily designed for use by frameworks and plugin developers"* — it works, but it is lightly trodden. Two mitigations are already in the task: gate on `command` so build output is unchanged, and verify the built `wrangler.json` still contains `ai`.

Note the plugin's config is deliberately excluded from `wrangler types` and resource commands, so `Env.AI` stays typed from `wrangler.jsonc`. That is the behaviour you want.

### Current code state (verified at `fd41218`)

- `src/server.ts` — `ChatAgent` DO (~200 lines, untouched since 1.1) plus a `fetch` that guards `isAdminApiPath` then delegates to `routeAgentRequest`. Task 5 adds one more guarded prefix in the same shape; nothing else in this file changes
- `src/shared/lib/adminGuard.ts` — `isAdminApiPath`, `normalizePath`, `requireOperator`, `ADMIN_CACHE_HEADERS`. All four are reusable; `normalizePath` is not exported yet and will need to be, or `isAgentsPath` lives in the same file (prefer the latter — one module owning path matching)
- `src/shared/lib/wranglerConfig.test.tsx` — asserts `ACCESS_DEV_BYPASS` is in no Wrangler config, that no `vars` block exists, and that `.dev.vars` is gitignored. **Task 4 breaks the second assertion on purpose**; narrow it, do not delete it
- `wrangler.jsonc` — 71 lines, single unnamed env, no `env` block, no `d1_databases`, `observability` enabled (landed in 1.4's review). Lines 14-24 are a commented-out sketch of exactly the env block Task 4 writes — read it, it is a hint from a prior session
- `vite.config.ts` — 9 lines, static plugin array. Task 3 converts it to the function form
- `package.json` — no `build` script; `deploy` conflates build and deploy. Both change in Task 4
- No `.github/`, no CI config of any kind. Workers Builds is dashboard-configured; this story adds **no** GitHub Actions workflow

### Architecture requirements binding this story

- **CI/CD (LOCKED):** "Workers Builds (GitHub) → production; Wrangler envs for dev/staging/prod with separate D1 databases" [Source: architecture.md#Infrastructure-&-Deployment, line 262]
- **Domains (LOCKED):** `predictionmarketlitigation.com` + `ops.predictionmarketlitigation.com` [Source: architecture.md, line 261]
- **Secrets (LOCKED):** "Secrets only via Wrangler/Secrets Store — never `.env` committed" [Source: architecture.md#File-Structure-Patterns, line 333]
- **IaC (LOCKED):** "Wrangler-first; Terraform deferred" — do not introduce Terraform or Pulumi [Source: architecture.md, line 266]
- **Migrations:** "D1 SQL migrations in `migrations/` (Wrangler default)" [Source: architecture.md, line 328]. This story creates **no** migrations — Story 2.1 owns the schema. It only binds the databases
- **Observability:** "Workers Observability + AI Gateway (private)" [Source: architecture.md, line 264]. Already enabled at `wrangler.jsonc:33`; confirm it survives into each env
- **Config location:** `wrangler.jsonc` at repo root; env overrides via Wrangler environments [Source: architecture.md, line 332]

### What later stories need from this one

| Story | Needs |
|---|---|
| 2.1 F1 data model | A bound D1 per environment to migrate into |
| 2.9 Reader poll | "not localStorage-only **in production**" [epics.md:518] — a real production D1 |
| 3.3 Daily run | A cron trigger, which only fires on a deployed Worker |
| 3.12 Operator controls | "routine loop operation does not require redeploy (NFR8)" [epics.md:744] — presupposes a pipeline |
| 3.13 Autonomous mode | "non-operator identities cannot change mode" [epics.md:761] — needs the real Access application and a real `POLICY_AUD`; 1.4 shipped the verifier against no AUD |
| 1.3 (retroactive) | "shell pages from 1.3 reachable on both production domains" [epics.md:371] — AC7 |

### Scope boundaries (do NOT do in this story)

- No D1 schema, no migrations, no Zod contracts — Story 2.1
- No GitHub Actions workflow. Workers Builds is configured in the dashboard; adding a parallel CI would mean two deploy paths
- No Terraform, Pulumi, or any IaC beyond Wrangler
- Do not create the Access application or edit Zero Trust — Part B, and `docs/access-runbook.md` already owns those steps
- Do not self-host fonts — decided against; just close the ledger entry
- Do not wire the admin session display name — it needs a real Access session and belongs after Part B
- Do not touch `ChatAgent`'s internals, `src/shared/ui/`, or any surface component
- Do not reformat the repo as part of a feature commit — Task 2 is its own commit, deliberately
- Never touch `_bmad/`, `.claude/`, `.agents/`, or `_bmad-output/` except this story file and `sprint-status.yaml`

### Previous story intelligence (1.4)

- **1.4's review found three real security holes in confident code.** The pattern: the dev bypass was gated on a var but not a hostname; cookies authorized mutations; `alg` was unpinned. Expect the same scrutiny here — Task 5's guard is the security-critical one, and "it looks like the admin guard" is not the same as "it is tested like the admin guard"
- **Write the File List from `git diff --name-only`.** Stories 1.2 and 1.4 both claimed files that were not in their commits
- **Disclose every deviation, and count them.** 1.4's notes claimed one deviation when there were two
- **`.dev.vars` is loaded into the Vitest environment.** It silently disarmed five 1.4 tests by turning the dev bypass on. Any test asserting rejection must construct its own env rather than using the ambient one — see `src/server.test.ts:29`
- **Verify claims by running them.** 1.3 claimed 61 green tests and a passing `check`; neither reproduced. Read exit codes, not summary lines — vitest prints a passing count above its own errors
- **Two Vitest projects:** `workers` for `*.test.ts` (workerd, no fs), `ui` for `*.test.tsx` (node, has fs). Task 6's bundle test needs fs, so it goes in the `ui` project — that is why `wranglerConfig.test.tsx` has a `.tsx` extension despite containing no JSX

### Git intelligence

`fd41218` (1.4 review decisions) ← `394bc4d` (1.4 review, 15 patches) ← `08ec412` (1.4 impl) ← `d7ab66a` (1.2 review). Epic 1 is 4/5 done. Conventions to continue: file-level comments explaining *why*; documented exclusions over silent omissions; red-green test order; a single unpushed commit per story; review findings recorded in the story file rather than lost.

Working tree is clean at story start. Six commits are unpushed on `main`.

### Project Structure Notes

```
.gitattributes                     # NEW — LF pinning (Task 2, own commit)
docs/deploy-runbook.md             # NEW — Patrick's Part B checklist
docs/access-runbook.md             # MODIFIED — cross-link only
README.md                          # MODIFIED — deploy flow + env matrix
vite.config.ts                     # MODIFIED — tokenless dev server
wrangler.jsonc                     # MODIFIED — envs, routes, workers_dev/preview_urls
package.json                       # MODIFIED — build + per-env deploy scripts, cross-env
src/server.ts                      # MODIFIED — /agents/* guard
src/server.test.ts                 # MODIFIED — /agents/* guard tests
src/shared/lib/adminGuard.ts       # MODIFIED — isAgentsPath
src/shared/lib/adminGuard.test.ts  # MODIFIED — isAgentsPath cases
src/shared/lib/wranglerConfig.test.tsx  # MODIFIED — narrowed vars assertion, bundle grep
_bmad-output/implementation-artifacts/deferred-work.md  # MODIFIED — retire resolved entries
```

No new source directories. No variance from the architecture tree.

### Testing standards summary

- Vitest ~4.1.10, two projects; baseline **160 tests / 7 files / exit 0 / zero cloud credentials** — that last clause is the invariant, do not regress it
- This story's bar: the `/agents/*` guard gets the same negative-path treatment the admin guard got (encoding bypasses, double slashes, bare prefix, lookalike paths), plus the config invariants in `wranglerConfig.test.tsx`
- `wrangler deploy --dry-run` is the validation tool for config correctness — it catches missing bindings without touching the account
- No test may require network or credentials

### References

- [Source: epics.md#Story-1.5] lines 357-372 — story + original ACs
- [Source: epics.md] 518 (2.9 production D1), 744 (3.12 no-redeploy), 761 (3.13 identity), 156 (CI/CD requirement)
- [Source: architecture.md] 157, 261-266, 328, 332-333, 573, 721
- [Source: implementation-readiness-report-2026-08-09.md] 305 + 363 — finding M2, why this story exists
- [Source: docs/access-runbook.md] 103-126 — the Access half of Part B, already written
- [Source: _bmad-output/implementation-artifacts/1-4-admin-access-protection.md] 25-32 (scope split), 301 (dev-server gap), 149-155 (deferred rows)
- [Cloudflare: Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) · [Workers Builds config](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Vite plugin environments](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/) · [Programmatic config](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/) · [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) · [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/) · [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## Open Questions for Patrick (do not block implementation)

1. **Staging hostnames.** The story assumes `staging.predictionmarketlitigation.com` and `ops-staging.predictionmarketlitigation.com` on the same zone — cheapest and shares the TLS/Access story. A separate zone is the alternative. Confirm before Part B step 3.
2. **Session duration display.** Still open from 1.4: the handoff shows `· session 41m` and there is now a real Access session to source it from once Part B lands. Want it, or drop it permanently?
3. **Break-glass IdP.** Adding one-time PIN as a second Access login method is ~3 clicks and guards against Cloudflare account lockout. Worth doing during Part B?
4. **Production branch name.** Workers Builds needs one. `main` is the working assumption.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
