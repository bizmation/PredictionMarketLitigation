---
baseline_commit: fd41218cde90ad0483cf0a296c3ca8dc33b1e4c1
---

# Story 1.5: Deploy Pipeline & Environments

Status: done

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
| ~~`env.staging` / `env.production` blocks with placeholder `database_id`~~ single flat config, `d1_databases` bound | ~~`wrangler d1 create` ×3~~ done — `d1_database_create` via MCP, id already in `wrangler.jsonc` |
| `workers_dev: false`, `preview_urls: false` | ~~Connect Workers Builds to the repo~~ **dropped 2026-08-10 — no CI/CD; see AC7** |
| `.gitattributes` + working-tree renormalization | Bind apex + `ops.` custom domains |
| Dev server boots with no `CLOUDFLARE_API_TOKEN` | `wrangler secret put` (one environment) |
| ~~`build` / `deploy:staging` / `deploy:production` scripts~~ `build` / `deploy` (single environment, revised 2026-08-10) | Create the Access application per the 1.4 runbook |
| `/agents/*` gated behind `requireOperator` | Verify the domains in a browser |
| CI-runnable bundle-secret assertion | |
| README deploy flow + environment matrix | |

**AC7 (end-to-end deploy verified) cannot be satisfied by the dev agent.** It is written below as explicitly pending Patrick's run. Do not check it off. Do not fabricate a deploy. Marking this story `review` with AC7 open is the correct outcome.

**Also decided (2026-08-10):**
- **`/agents/*` gets gated**, not deleted — reuse 1.4's `requireOperator`. The `ChatAgent` DO and its Agents/DO wiring survive for Epic 3; anonymous callers do not.
- **Google Fonts stays.** The ledger's open question is closed as a deliberate decision: keep the CDN load. Remove the entry from `deferred-work.md`; do not self-host in this story.

## ⚠️ Scope revised 2026-08-10 (post-review): single environment, not two

**Patrick, after the code review landed: "We are not doing any multi environment here - just one."** Everything below that describes `env.staging`/`env.production` as two separate environments is superseded — it's left in place as the historical record of what Part A originally built, not current truth. Where it matters, later sections are marked.

**What actually shipped now:** one Wrangler environment (the unnamed top-level config), one Worker (`pml`, not `pml-production`), one D1 database (`pml` — created 2026-08-10 via the Cloudflare D1 API, id `d07713fe-d0f1-4708-a174-394b04fc01b9`, already in `wrangler.jsonc`), one Access application, one set of secrets, one Workers Builds connection, one `deploy` script (`npm run deploy`, no `--env`). `docs/deploy-runbook.md` and `docs/access-runbook.md` are updated to match.

**Why:** for a solo operator, the real safety net against bad content is the human-in-the-loop approval queue (Epic 3), not environment isolation — and two environments doubled every remaining Part B step (2 databases, 2 domain pairs, 2 Access apps with 2 AUD tags, 2 secret sets, 2 Builds connections) for a project where nothing yet depends on that isolation. Nothing stops a later story from reintroducing `env.staging` the same way it was built the first time, if it's ever actually needed.

**Corrected by this revision:** AC1 (now single-environment, not "env.staging and env.production each declare"), AC7 (now "one environment," not "three environments... separate D1 databases"). Both are marked below with a note rather than silently rewritten.

## Acceptance Criteria

1. ~~**Given** the repo at `fd41218`, **when** Wrangler environments are added, **then** `env.staging` and `env.production` each declare their **own** copy of every non-inheritable binding (`ai`, `durable_objects`, `d1_databases`, `vars`) — a forgotten binding is a *warning*, not an error, and deploys a Worker that fails at runtime~~ **REVISED 2026-08-10 — single environment.** `wrangler.jsonc` declares one flat config: `ai`, `durable_objects`, `d1_databases` all at the top level, no `env` block. There is nothing left to forget between environments because there is only one.
2. **And** `workers_dev: false` and `preview_urls: false` are set at the top level so every environment inherits them — these are the hostnames `access.ts` names as the reason JWT verification exists
3. **And** `/agents/*` requires a verified operator: an unauthenticated request gets `403` with the same envelope `/api/admin/*` returns, asserted by test — this closes the surface ledgered since Story 1.1
4. **And** `npm run check` passes on a clean Windows checkout: `.gitattributes` pins LF, the working tree is renormalized, and `oxfmt --check .` reports zero issues across all 48 files (currently 18 fail)
5. **And** `npm run dev` starts with **no** `CLOUDFLARE_API_TOKEN` present, without altering what `vite build` emits
6. **And** a committed test asserts no Access config name (`TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS`, `cloudflareaccess`) appears in the built client bundle — replacing the one-time manual grep from Story 1.4 (AC6)
7. ☑ **SATISFIED 2026-08-10**, after its auto-deploy clause was revised away by decision (below). **REVISED 2026-08-10 twice — single environment, not three; and no CI/CD.** Clause by clause, against a live run (see `docs/deploy-runbook.md` §6):
   - ~~*a push to `main` builds and deploys automatically*~~ — **REVISED AWAY 2026-08-10. Patrick: "i don't think we do."** Workers Builds is dropped; releases are `npm run deploy` from the laptop. This supersedes `architecture.md:262`'s LOCKED CI/CD line, the same way the single-environment revision superseded its dev/staging/prod line. Rationale and the replacement test gate are in `docs/deploy-runbook.md` §5 — in short, Builds deploys from GitHub's `main`, which was 11 commits behind local and missing the `/agents/*` auth-bypass fix, so connecting it would have automatically deployed the vulnerable build over the fixed one. **The one thing Builds was genuinely providing — running `npm test` before a deploy — was moved into the `deploy` script rather than dropped with it.**
   - ☑ *one Worker (`pml`) exists with its D1 database bound* — deployed, version `44d951f2-a214-4b83-86bb-040041c7923d`, bindings `ChatAgent` / `DB (pml)` / `AI` confirmed on upload
   - ☑ *apex and `ops.` resolve to the deployed Worker* — both `200`; Cloudflare created both proxied `AAAA` records itself
   - ☑ *`/admin` challenges via Access* — `302` to `bizmation.cloudflareaccess.com`, whose `kid` matches the deployed `POLICY_AUD`
   - ☑ *`/`, `ops.` and the public surfaces stay public* — `200` unauthenticated, including the SPA fallback. `POST /api/poll/votes` returns `405`, not `403`: the route is Story 2.9's and does not exist yet, so this confirms only that nothing *auth-gates* it. Re-verify properly when 2.9 lands.
8. **And** `README.md` documents the deploy flow and the environment matrix (readiness M2), and `docs/deploy-runbook.md` gives Patrick the ordered dashboard steps

## Tasks / Subtasks

- [x] Task 1: Preflight (AC: all)
  - [x] Node ≥ 20.12 (`.nvmrc` = 24). Confirm baseline: `npm test` → **160 tests, 7 files, exit 0, no cloud credentials**. That invariant is load-bearing — nothing in this story may require credentials to test
  - [x] Confirm `npm ci` exits 0. It was broken during 1.4 and is now fixed; if it regresses, stop and fix the lockfile before anything else, because Workers Builds runs `npm clean-install`
  - [x] Note the current failure you are fixing: `npx oxfmt --check .` → "Format issues found in above 18 files"
- [x] Task 2: `.gitattributes` and renormalization (AC: 4)
  - [x] **Do this first and commit it alone.** Every later task's diff is unreadable if line endings churn underneath it
  - [x] Create `.gitattributes` at repo root, written with **LF** endings:
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
  - [x] Renormalize. **The index is already LF** (`git ls-files --eol` shows `i/lf w/crlf`), so step 2 below stages nothing and there is no whole-tree history diff — the churn people fear only happens when CRLF is committed. Verify that claim rather than assuming it:
    ```bash
    git status --porcelain          # MUST be empty before starting
    git add .gitattributes && git commit -m "chore: pin LF line endings"
    git add --renormalize .
    git status --porcelain          # expect empty; commit if not
    git rm --cached -r . --quiet
    git reset --hard
    git ls-files --eol package.json vite.config.ts   # expect i/lf w/lf
    ```
  - [x] `npm run check` must now pass end to end. If `oxfmt` still reports files, run `npm run format` and commit that separately with a message saying it is mechanical
  - [x] Do **not** also set `core.autocrlf false` in the repo — `.gitattributes` wins, and a second source of truth invites confusion
- [x] Task 3: Dev server without a Cloudflare token (AC: 5)
  - [x] Problem: `wrangler.jsonc`'s `ai` binding is `remote: true`. Workers AI has **no local simulation** — `remote: false` is an *error*, and omitting `remote` connects remotely anyway. So the only way to boot tokenless is to drop the binding in serve mode
  - [x] Use the Vite plugin's programmatic `config` option, gated on Vite's `command` so `vite build` is untouched:
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
  - [x] The **mutating function form is required** — the plugin merges config with `defu`, so an override object cannot delete a key
  - [x] `env.AI` is `undefined` in dev as a result. `src/server.ts:51` reads it inside `ChatAgent.onChatMessage`. After Task 5 that path is operator-gated, but add a clear guard or comment so the failure is legible rather than a mystery `undefined` crash
  - [x] Verify BOTH halves: `npm run dev` boots with no token in the environment, **and** `vite build` still emits `ai` into `dist/pml/wrangler.json`. Grep the built file — this is the regression that would silently ship a Worker with no AI binding
  - [x] Do **not** solve this with a third wrangler config file. `wrangler.test.jsonc` already carries a hand-sync burden; a `wrangler.dev.jsonc` would add another drift surface
  - [x] Document in `README.md` that anyone needing the real AI path puts `CLOUDFLARE_API_TOKEN` in `.env` (already gitignored)
- [x] Task 4: Environments and deploy scripts (AC: 1, 2)
  - [x] Add `"workers_dev": false` and `"preview_urls": false` at the **top level** — both are inheritable, so all environments get them. State them explicitly; do not rely on the inference from `routes`, and note the default flipped twice in wrangler 4.34/4.44
  - [x] Add `env.staging` and `env.production`. **Every binding must be redeclared in each env** — `ai`, `durable_objects`, `d1_databases`, `vars`. Wrangler emits a *warning*, not an error, for a top-level binding missing from an env, so a forgotten `durable_objects` deploys clean and fails at runtime
  - [x] `database_id` values are placeholders until Part B. Use an obvious sentinel like `"<created-in-part-b>"` and say so in a comment — **do not leave the field absent.** Wrangler's automatic provisioning is on by default and would create a database and write the id back, which in a Workers Builds run is not persisted to the repo — silent prod drift
  - [x] Routes: production gets `predictionmarketlitigation.com` and `ops.predictionmarketlitigation.com`, both `custom_domain: true`. Staging gets `staging.` and `ops-staging.` equivalents. Custom Domains point **all paths** at the Worker, which is what a whole site needs; a route pattern is the wrong tool
  - [x] **`ACCESS_DEV_BYPASS` must not appear in any env block.** `src/shared/lib/wranglerConfig.test.tsx` asserts this and will fail if it does. That test's second case also asserts no `vars` block exists at all — you are adding `vars` per env, so **narrow that assertion rather than deleting it**: the invariant that matters is the bypass never becoming deployable
  - [x] `package.json`: add `"build": "vite build"`. Replace the bare `"deploy"` with `"deploy:staging"` and `"deploy:production"`. **Delete the env-less `deploy` script** — with named envs defined, a bare `wrangler deploy` publishes a *third* Worker named `pml` with its own Durable Object namespace (DO storage is keyed by script name, so agent state silently forks) and no D1 binding
  - [x] With the Vite plugin the environment is selected at **build** time via `CLOUDFLARE_ENV`, not at deploy time; `wrangler deploy --env` then validates the match:
    ```jsonc
    "deploy:staging":    "cross-env CLOUDFLARE_ENV=staging vite build && wrangler deploy --env staging",
    "deploy:production": "cross-env CLOUDFLARE_ENV=production vite build && wrangler deploy --env production"
    ```
  - [x] `cross-env` is needed for Windows (`VAR=x cmd` is not valid in PowerShell/cmd). Add it as a devDependency — this is the one new dependency this story is authorised to add
  - [x] Run `npx wrangler deploy --env production --dry-run` to validate config shape without deploying. Read the warning output carefully: any "exists at the top level, but not on env.production" line is a missing binding
- [x] Task 5: Gate `/agents/*` (AC: 3)
  - [x] Reuse `requireOperator` from `src/shared/lib/adminGuard.ts`. Do **not** write a second auth path
  - [x] Add `isAgentsPath(pathname)` alongside `isAdminApiPath`, matching `/agents` and `/agents/...` with the same normalization (decode, collapse slashes) — the encoding bypasses that applied to the admin prefix apply identically here
  - [x] In `src/server.ts`, guard before `routeAgentRequest`. Same 403 envelope, same `ADMIN_CACHE_HEADERS`, same silence about why
  - [x] Leave `ChatAgent` itself untouched. Epic 3 builds on this Agents/DO wiring — the door gets a lock, the room stays
  - [x] Tests: unauthenticated `/agents/chat-agent/x` → 403; `/agents` bare → 403; encoded/double-slash variants → 403; operator (dev bypass on loopback) → not 403; `/agentsomething` → **not** guarded
  - [x] Update `deferred-work.md`: strike the `/agents/*` entries from the 1.1 and 1.4 sections with a **RESOLVED 2026-08-10 (Story 1.5)** note, matching how 1.3 retired its predecessors
- [x] Task 6: Bundle-secret assertion (AC: 6)
  - [x] Story 1.4 verified this with a one-time manual grep recorded in prose. Replace it with something that runs
  - [x] Add to `src/shared/lib/wranglerConfig.test.tsx` (the `ui` project — plain node, has `fs`): if `dist/client/` exists, assert no file contains `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS`, or `cloudflareaccess`
  - [x] **Skip cleanly when `dist/` is absent** rather than failing — a fresh clone has no build output, and a test that fails on a clean checkout will be deleted by the next person. Use `it.skipIf`, and log why it skipped
  - [x] Document in README that `npm run build && npm test` is the full-fidelity check
- [x] Task 7: Operator runbook (AC: 7, 8)
  - [x] Create `docs/deploy-runbook.md` — Patrick's ordered checklist. Write it for someone with the dashboard open, in the order the dependencies actually require:
    1. `npx wrangler d1 create pml-dev|pml-staging|pml-production`; paste the three ids into `wrangler.jsonc`, replacing the sentinels
    2. Bootstrap each env once from the laptop: `npx wrangler deploy --env staging --secrets-file .env.staging` (gitignored). **Secrets cannot be set for a Worker that does not exist yet** — `wrangler secret put --env staging` on an undeployed env returns API error 10007, a genuine chicken-and-egg
    3. Bind custom domains. Prerequisite: an active zone, and **no pre-existing CNAME** on the hostname. Cloudflare creates the DNS record and manages the certificate
    4. Connect Workers Builds — one connection per env-Worker, since Builds has no environment concept. Build command `CLOUDFLARE_ENV=production npm run build`, deploy command `npx wrangler deploy --env production`. The dashboard Worker name must match the config's resolved name or the build fails
    5. **Leave non-production branch builds OFF.** They mint preview URLs, which is exactly the surface Task 4 disables
    6. Then the Access application, per the existing `docs/access-runbook.md` checklist — it already has the destination list and the AUD-tag step
  - [x] Cross-link, do not duplicate: `docs/access-runbook.md` already owns the Access half. Reference it
  - [x] Record the deferred config values as they land: the three `database_id`s, `TEAM_DOMAIN`, and per-environment `POLICY_AUD`. **Staging and production have different Access applications and therefore different AUD tags** — reusing one silently accepts staging tokens in production
  - [x] `README.md`: deploy flow, the environment matrix (env → Worker name → D1 → domains), the tokenless-dev note from Task 3, and that `npm run deploy` no longer exists
- [x] Task 8: Tests and validation (AC: all in Part A)
  - [x] `npm test` green — expect 160 plus your additions, still with **zero cloud credentials**
  - [x] `npm run check` green **end to end**, including `oxfmt --check .`. This is the first story where that can actually pass; it is AC4
  - [x] `npx wrangler deploy --env production --dry-run` and `--env staging --dry-run` both succeed with no missing-binding warnings
  - [x] `npm run dev` boots with `CLOUDFLARE_API_TOKEN` unset
  - [x] `npm ci` exits 0
- [x] Task 9: Finalize (AC: all in Part A)
  - [x] Update Dev Agent Record + File List (build the File List from `git diff --name-only`, not memory — two prior stories got this wrong)
  - [x] Set status `review`. **Leave AC7 explicitly unchecked** with a one-line note that it awaits Patrick's Part B run
  - [x] Commit `story 1.5: environments, deploy pipeline, envelope` (single commit; do not push). The `.gitattributes` renormalization from Task 2 may be a separate earlier commit — that is expected and correct

### Review Findings

- [x] [Review][Decision] `/oauth/*` is left completely outside the new `/agents`/`/api/admin` guards — `run_worker_first` in `wrangler.jsonc`/`wrangler.test.jsonc` routes it to the Worker, `adminGuard.test.ts` explicitly tests it as a "does not guard %s" case for `isAgentsPath`, so this is deliberate, not an oversight — but there was zero comment anywhere explaining why. **Resolved 2026-08-10: documented, behavior unchanged (the recommended, lower-risk option).** Added a comment in `src/server.ts` explaining that `/oauth/*` is `ChatAgent`'s MCP OAuth callback target, reachable only after an operator's own gated `addServer` call initiates the connection — and honestly flagging that whether the callback itself would also carry a valid Access JWT is unconfirmed, since this review had no live MCP server connection to exercise that round trip. Revisit once Part B's Access application exists [`src/server.ts`]
- [x] [Review][Patch] **CRITICAL, confirmed by direct reproduction — the `/agents/*` (and `/api/admin/*`) guard has a live bypass. FIXED.** `normalizePath()` treats a malformed percent-escape (e.g. `%zz`) anywhere in the path as "un-routable" and returns a sentinel that makes `isAgentsPath`/`isAdminApiPath` return `false` — but the actual downstream router (`routePartykitRequest` in `agents`/`partyserver`) never decodes anything; it matches on the raw, undecoded path. A request to `/agents/chat-agent/%zz` therefore fails the guard's match (403 never fires, falls through to the unguarded tail of `src/server.ts`'s `fetch`) while the router still routes it to a live `ChatAgent` Durable Object. Reproduced: read `routePartykitRequest`'s source directly (`parts = new URL(req.url).pathname.split("/").filter(Boolean)`, no decode), then ran a live request through the real worker — it reached the DO (`onRequest hasn't been implemented on ChatAgent:%zz`), not a 403. This is exactly the unauthenticated `addServer`/MCP-attachment-drives-`env.AI` vulnerability this story exists to close, and it isn't closed. Fix: on decode failure, `normalizePath` should fail closed against what the raw path actually matches (e.g. return the raw `pathname` instead of a guaranteed-non-match sentinel), not fail open. Existing tests only cover encodings that decode successfully (`%61gents`) and duplicate slashes — never a decode failure under `/agents` or `/api/admin` (only `isAdminApiPath` has one, and it *asserts the bypass as correct behavior*: `adminGuard.test.ts:50-53`) [`src/shared/lib/adminGuard.ts:26-38`]. **Fixed exactly as proposed:** `normalizePath`'s catch branch now returns the raw, undecoded `pathname` (collapsing duplicate slashes) instead of a guaranteed-non-match sentinel — so the guard matches whenever the raw-splitting router would, on any decode failure. Re-verified with the same live-request method that found it: the same `/agents/chat-agent/%zz` request now returns 403, not the DO's "Not implemented". Added regression tests at both layers: `adminGuard.test.ts` (unit, both `isAdminApiPath` and `isAgentsPath`, including the "raw prefix doesn't match either" negative case) and `server.test.ts` (end-to-end through the real fetch handler — the level that actually caught this, since the unit-level assumption "decode failure = unroutable" was never itself tested against the real router).
- [x] [Review][Patch] Every build (dev or production) writes `.dev.vars` — containing `ACCESS_DEV_BYPASS=true`, `OPERATOR_EMAIL`, `OPERATOR_DISPLAY_NAME` — into `dist/pml/.dev.vars`. **Investigated, no code change — confirmed not a real risk, and no meaningful test to add.** Traced to root cause in `@cloudflare/vite-plugin`'s own source: this is deliberate, to support previewing a build locally against `wrangler dev`, and the plugin already excludes it from `dist/client`'s served assets via a generated `.assetsignore`. Confirmed NOT consumed by `wrangler deploy` (`--dry-run`'s binding table lists only `PML_ENV`), and the dev bypass is independently hostname-gated. Tried extending AC6's bundle scan to also walk `dist/pml` for defense-in-depth — reverted it: `dist/pml/index.js` is the compiled Worker bundle, which *necessarily* contains the literal strings `ACCESS_DEV_BYPASS`, `TEAM_DOMAIN` etc. as the variable names its own code reads at runtime (`env.ACCESS_DEV_BYPASS`) — scanning for those name strings there is a guaranteed false positive, not a check for a leaked value. The client-only scan (which has no legitimate reason to ever reference these names) is the correct place for this check, and stays as-is [`src/shared/lib/wranglerConfig.test.tsx`]
- [x] [Review][Patch] README.md and `vite.config.ts`'s own comment both claim "a test pins" the invariant that `vite build` still emits the `ai` binding into `dist/pml/wrangler.json` — no such test exists anywhere (zero matches for `dist/pml` in any test file). The invariant currently holds (verified empirically: built `dist/pml/wrangler.json` and the `--dry-run` binding table both show `env.AI`) but was completely unguarded against regression. **Fixed:** added the actual test to `wranglerConfig.test.tsx` (`skipIf` when no server build, same pattern as the client scan); the comments now correctly claim it [`README.md:20`, `vite.config.ts`, `src/shared/lib/wranglerConfig.test.tsx`]
- [x] [Review][Patch] `docs/deploy-runbook.md` instructs creating three D1 databases (`pml-dev`, `pml-staging`, `pml-production`) and pasting all three ids into `wrangler.jsonc`, but `wrangler.jsonc` only has placeholder slots for two (`env.staging`, `env.production`) — no top-level/local `d1_databases` block exists for a `pml-dev` id to go into. **Fixed:** added the third top-level `d1_databases` block (same placeholder-sentinel convention as the other two) to both `wrangler.jsonc` and `wrangler.test.jsonc` (kept in sync per that file's own policy). Verified `env.DB` is referenced nowhere in current source (Story 2.1 owns the schema), so this binds ahead of that story without depending on it; verified both dry-runs and the full test suite still pass with the addition [`docs/deploy-runbook.md:19-31,142-148`, `wrangler.jsonc`, `wrangler.test.jsonc`]
- [x] [Review][Patch] AC7's own residual-door verification checks `pml.<subdomain>.workers.dev` — the unnamed top-level Worker, which `deploy:staging`/`deploy:production` never deploy — instead of the two hostnames that actually get deployed (`pml-staging.*.workers.dev`, `pml-production.*.workers.dev`). The check "passes" for a trivial, unrelated reason (that Worker name was never going to exist) and verifies nothing about the actual residual-door risk `workers_dev: false` exists to close. **Fixed:** the runbook now checks `pml-staging.*.workers.dev` and `pml-production.*.workers.dev` — the hostnames that actually correspond to what gets deployed [`docs/deploy-runbook.md:134-136`]
- [x] [Review][Patch] The stale-build-produces-a-silently-wrong-dry-run trap that the story's own Debug Log says bit the implementing agent ("A dry run against a stale build is a green light that means nothing") isn't passed on to the runbook — worth one warning line before the dry-run/deploy commands in `docs/deploy-runbook.md`. **Fixed:** added the warning. Ran into a live instance of it myself while verifying this story — ran a staging dry-run right after a production build, which this time errored loudly ("does not match the target environment") rather than silently under-reporting; the warning covers both outcomes and says to always rebuild for the target environment immediately before dry-running or deploying
- [x] [Review][Patch] AC6's bundle-secret scan never actually runs in the configured deploy pipeline — `docs/deploy-runbook.md`'s Workers Builds table sets Build command to `CLOUDFLARE_ENV=<env> npm run build` with no test step, so the scan (which `skipIf`s cleanly when `dist/` is absent) only fires if a human manually runs `npm run build && npm test` before pushing — the same manual-discipline dependency AC6 was written to eliminate. **Fixed:** the runbook's Build command is now `CLOUDFLARE_ENV=<env> npm run build && npm test`, with a note explaining why (and that trimming it back would silently stop gating deploys) [`docs/deploy-runbook.md:98-99`]
- [x] [Review][Patch] No test protects `workers_dev: false` / `preview_urls: false` themselves from regressing — confirmed zero matches for either string anywhere in `src/`, despite `wranglerConfig.test.tsx` already demonstrating exactly this "read `wrangler.jsonc` as text, assert on it" pattern for other invariants. **Fixed:** added the test (`wrangler.jsonc` only — `wrangler.test.jsonc` is never deployed, so the setting doesn't apply there) [`src/shared/lib/wranglerConfig.test.tsx`]
- [x] [Review][Patch] `wranglerConfig.test.tsx`'s vars-allowlist test checks only keys, never values — `PML_ENV` could be wrong (e.g. `"production"` copy-pasted into `env.staging`) and this test would stay green. **Partially fixed:** the test now also checks each value against an allowed shape (`PML_ENV` must be `"staging"` or `"production"`, not anything else) — this catches a wrong/typo'd/empty value but, being regex-based rather than a real per-environment parse, does not tie a specific value to *which* env block it came from, so the exact staging↔production copy-paste scenario in the original finding could still slip through. Flagged rather than silently left; a full fix means parsing the JSONC into an object and walking `env.staging.vars.PML_ENV` / `env.production.vars.PML_ENV` directly, which felt disproportionate to a low-severity gap [`src/shared/lib/wranglerConfig.test.tsx:26-42`]
- [x] [Review][Patch] `wranglerConfig.test.tsx`'s `hasBuild` check is `existsSync(distClient)` only — an existing-but-empty `dist/client` (interrupted build, stray `mkdir`) makes every secret-scan assertion pass vacuously, giving false confidence that nothing was found when nothing was actually scanned. **Fixed:** `hasBuild` now also requires `readdirSync(distClient).length > 0` [`src/shared/lib/wranglerConfig.test.tsx:60`]
- [x] ~~[Review][Patch] `wranglerConfig.test.tsx`'s vars-block regex (`/"vars"\s*:\s*\{([^}]*)\}/g`) truncates early if a var's string value ever contains a literal `}`, silently missing any keys declared after it.~~ **MOOT — verified 2026-08-11, not merely assumed.** The single-environment revision deleted the per-environment `vars` blocks this regex existed to parse, and the assertion was rewritten to `expect(source).not.toMatch(/"vars"\s*:/)` — a presence check with no brace matching, so there is no truncation behaviour left to be wrong. Checked against the current file rather than trusting the earlier "moot" note: the described regex appears nowhere in `src/`. Closing the box, because an open item describing code that no longer exists is how dead work gets re-opened [`src/shared/lib/wranglerConfig.test.tsx:34`]
- [x] [Review][Patch] `wranglerConfig.test.tsx`'s own header comment says a top-level var "would ship straight to production" via `npm run deploy` (a bare `wrangler deploy`) — but Task 4 of this very story deleted that script. The comment refers to a command that no longer exists. **Fixed:** updated to describe the actual current risk (a bare `wrangler deploy`/`npx wrangler deploy` with no `--env`, shipping to the unnamed top-level Worker) [`src/shared/lib/wranglerConfig.test.tsx:14`]
- [x] [Review][Patch] Task 3's checklist item ("add a clear guard or comment so `env.AI` undefined in dev is legible, not a mystery crash") is checked `[x]` complete, but `src/server.ts:58`'s `createWorkersAI({ binding: this.env.AI })` call is untouched by this diff — no comment or guard was actually added. **Fixed:** added the comment [`src/server.ts:58`]
- [x] [Review][Patch] The dev-mode AI-binding deletion in `vite.config.ts` is unconditional on `command === "serve"`, regardless of whether `CLOUDFLARE_API_TOKEN` is actually set — a developer who *does* supply a token still loses the binding and, per the README's own escape hatch, has to temporarily hand-edit tracked source (remove the gate) to get it back, rather than the config respecting an available token on its own. **Fixed:** now also checks `loadEnv(mode, cwd, "").CLOUDFLARE_API_TOKEN` (Vite's own `.env`-loading helper, not bare `process.env`, so a token in `.env` is picked up the same way the rest of Vite's env handling works) and only drops the binding when there's no token. README updated to match — no source edit needed anymore [`vite.config.ts`, `README.md:22`]
- [x] [Review][Patch] README's "For the full check including the client-bundle secret scan: `npm run build && npm test`" doesn't restate that this still needs no `CLOUDFLARE_API_TOKEN` — verified empirically that it doesn't (both commands ran token-free throughout this review), but the wording leaves it genuinely ambiguous next to the token-heavy paragraph just above it. **Fixed:** added the clarification inline [`README.md:24-27`]

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

1. ~~**Staging hostnames.**~~ **MOOT** — staging was cut in the single-environment revision. No staging hostnames exist or are planned.
2. **Session duration display.** Still open from 1.4: the handoff shows `· session 41m`, and there is now a real Access session to source it from — the application is configured with a 24h session. Want it, or drop it permanently?
3. **Break-glass IdP — REOPENED 2026-08-11, and now a real decision rather than a free win.** Briefly recorded as resolved on 2026-08-10 (the account already had a `onetimepin` IdP, and it was in the application's `allowed_idps`). **That is no longer true for this application.** Removing one-time PIN was the price of skipping the account-wide login page, which is branded King of the Floor and cannot be styled per-application — `login_design` is organization-level, confirmed against the OpenAPI spec. So: PML admin currently has **no** break-glass login, and if Cloudflare account login breaks, restoring it needs Cloudflare account access — the same credential that failed. Restore commands are in `docs/access-runbook.md` → Deviations 3. **Worth an explicit call:** accept the lockout risk, or accept the borrowed branding and put PIN back?
4. ~~**Production branch name.**~~ **MOOT** — Workers Builds is dropped, so nothing needs a nominated production branch. `main` remains the working branch; it is simply no longer a deploy trigger.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session

### Debug Log References

- **`-text` is the wrong tool for excluding vendored trees, and it fails loudly.** The first `.gitattributes` attempt marked `.claude/**`, `.agents/**` and `_bmad/**` as `-text` to keep four CRLF-carrying BMAD CSVs out of the renormalization. `-text` tells git the files are *binary*, so git wanted to store the working-tree CRLF for the entire vendored tree — `git add --renormalize .` staged thousands of files. Reverted, and the four CSVs were simply renormalized instead (line endings only, no content change) in their own commit.
- **The renormalization produced no whole-tree diff, exactly as the story predicted.** `git ls-files --eol` showed `i/lf w/crlf` beforehand: the index was already LF and only the checkout was CRLF. `git add --renormalize .` staged 4 files, not 48. The feared history churn only happens when CRLF is actually committed.
- **`wrangler deploy --dry-run` silently validated nothing on the first attempt.** It reported only `ChatAgent` and `AI` bindings for `--env production` — no D1, no vars, no routes. Cause: with `@cloudflare/vite-plugin` the environment is resolved at **build** time and written to `dist/pml/wrangler.json`, which `wrangler deploy` then follows via `.wrangler/deploy/config.json`. My earlier plain `vite build` had baked the env-less config. Rebuilding with `CLOUDFLARE_ENV=production` first produced the correct `pml-production` with all four bindings. **A dry run against a stale build is a green light that means nothing** — always rebuild with the env first.
- **`npm run check` regressed late and quietly.** It passed after Task 2, then failed at Task 8 because `oxfmt` also formats `README.md` and `package.json`, both of which I had rewritten. Fixed by formatting them. Worth knowing: `oxfmt` covers markdown and JSON, not just source.

### Completion Notes List

- **`npm run check` exits 0 for the first time in the project's history** — 48 files, all correctly formatted. This is AC4 and it closes a defect that had been live since before Story 1.1. `.gitattributes` pins `* text=auto eol=lf`, which overrides `core.autocrlf` for the working tree, not just the index.
- **The dev server boots with no `CLOUDFLARE_API_TOKEN` (AC5).** Verified empirically with the variable unset: `vite dev` started, `GET /` returned 200, and the admin API reached its guard. The `ai` binding is deleted in serve mode only, via the plugin's programmatic `config` option gated on `command === "serve"`. The mutating-function form is required — the plugin merges with `defu`, so an override object can add but never remove.
- **Both halves of Task 3 were verified, not just the convenient one.** `vite build` still emits `"ai": { "binding": "AI", "remote": true }` into `dist/pml/wrangler.json`. Silently shipping a Worker with no AI binding was the obvious failure mode of this change, so it was checked directly rather than assumed.
- **Environments resolve correctly and completely.** `CLOUDFLARE_ENV=production vite build` → `pml-production` with all four bindings (`ChatAgent` DO, `DB`/`pml-production`, `AI`, `PML_ENV`), both custom domains, `workers_dev` and `preview_urls` false. Staging likewise. No "exists at the top level, but not on env" warnings in either dry run — which is the check that matters, because that condition is a warning and would otherwise deploy clean and fail at runtime.
- **`/agents/*` is closed (AC3).** It now runs through the same `requireOperator` guard as `/api/admin/*`, with the same opaque 403 envelope and the same `normalizePath` treatment, so `/%61gents/...` and `//agents/...` cannot walk around it. This surface had been ledgered since Story 1.1 and was the most serious open hole in the repo: `@callable() addServer` let an anonymous caller attach an arbitrary MCP server whose tools then execute against `env.AI` on Patrick's account. Confirmed live before the change — a `curl` to `/agents/x` on the dev server returned 404, not 403. `ChatAgent` itself is untouched; Epic 3 builds on that wiring.
- **The bare `deploy` script is gone, deliberately.** With named environments defined, an env-less `wrangler deploy` publishes a *third* Worker called `pml` with its own Durable Object namespace — DO storage is keyed by script name, so agent state would fork from production's — and no D1 binding at all. Replaced with `deploy:staging` and `deploy:production`, both setting `CLOUDFLARE_ENV` at build time via `cross-env` (the one new dependency, needed because Windows shells reject `VAR=x cmd`).
- **D1 `database_id`s are explicit sentinels, not absent fields.** Wrangler's automatic provisioning is on by default: a binding with no id makes it create a database and write the id back — and from a Workers Builds run that write never reaches the repo, so production silently diverges from source. The placeholder text names the runbook that replaces it.
- **AC6's manual grep became a real test.** `wranglerConfig.test.tsx` now walks `dist/client/` and asserts no bundled file mentions `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS` or `cloudflareaccess`. It skips cleanly when `dist/` is absent — a test that fails on a fresh clone gets deleted by the next person who hits it — and the README documents `npm run build && npm test` as the full-fidelity check.
- **The `vars` assertion was narrowed, not deleted.** Story 1.4 asserted no `vars` block existed anywhere; this story adds one per environment. It now allowlists `PML_ENV` and fails on anything else, preserving the invariant that matters: no dev-only or secret-shaped value becomes deployable. `ACCESS_DEV_BYPASS` still appears in no Wrangler config, and that test still passes.
- **Five ledger entries retired** with struck-through RESOLVED notes matching the convention Story 1.3 established: `/agents/*`, `workers_dev`/`preview_urls`, the AC6 grep, the `.gitattributes`/oxfmt failure, and Google Fonts (closed by Patrick's decision to keep the CDN, recorded so it is not re-raised as a defect).
- **185 tests across 7 files, exit 0, zero cloud credentials** (was 160/7). 13 new `isAgentsPath` cases, 7 new `/agents/*` perimeter cases, 5 new bundle-scan cases. `npm run check` exit 0, `npm ci` exit 0, both dry runs exit 0.
- **AC7 is deliberately NOT satisfied.** Nothing was deployed, no D1 database exists, no domain is bound, no Access application was created — those need Patrick's Cloudflare account. `docs/deploy-runbook.md` is the ordered checklist, sequenced so the chicken-and-egg cases do not bite: secrets cannot be set for a Worker that has never been deployed (API error 10007), so they are uploaded with the first deploy via `--secrets-file`.
- **Not done, and deliberately out of scope:** the admin session display name (needs a real Access session, so it follows Part B), the D1 schema and migrations (Story 2.1), and the three unowned ledger items (JWKS spray, `shared/lib` import boundary, `access-env.d.ts` fragility) which remain in the ledger with no assignee.

### File List

New:

- .gitattributes
- docs/deploy-runbook.md

Modified:

- vite.config.ts (drop `ai` binding in serve mode)
- wrangler.jsonc (env blocks, routes, workers_dev/preview_urls, run_worker_first gains /agents)
- wrangler.test.jsonc (kept in sync — run_worker_first)
- package.json / package-lock.json (build + per-env deploy scripts, bare deploy removed, cross-env added)
- src/server.ts (/agents/* guard before agent routing)
- src/server.test.ts (/agents/* perimeter tests)
- src/shared/lib/adminGuard.ts (isAgentsPath)
- src/shared/lib/adminGuard.test.ts (isAgentsPath cases)
- src/shared/lib/wranglerConfig.test.tsx (narrowed vars assertion; client-bundle secret scan)
- README.md (surfaces, deployment, environment matrix, tokenless dev)
- docs/access-runbook.md (cross-link to deploy-runbook; 1.5 split now config-done / account-to-do)
- _bmad-output/implementation-artifacts/deferred-work.md (5 entries retired)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status transitions)
- _bmad-output/implementation-artifacts/1-5-deploy-pipeline-environments.md (this file)

Renormalized (line endings only, separate commit, no content change):

- .agents/skills/bmad-brainstorming/analysis/method-matrix.csv
- .agents/skills/bmad-brainstorming/assets/brain-methods.csv
- .claude/skills/bmad-brainstorming/analysis/method-matrix.csv
- .claude/skills/bmad-brainstorming/assets/brain-methods.csv

Modified by code review (2026-08-10) — fixing the critical `/agents/*` bypass, resolving the `/oauth/*` decision, and applying the remaining 12 patches:

- src/shared/lib/adminGuard.ts (`normalizePath` fails closed on a decode failure instead of open — the critical fix)
- src/shared/lib/adminGuard.test.ts (regression tests for the fix, both `isAdminApiPath` and `isAgentsPath`)
- src/server.ts (end-to-end `/agents/*` bypass regression tests; `/oauth/*` decision documented; `env.AI`-undefined-in-dev comment added)
- src/server.test.ts (end-to-end bypass regression tests)
- wrangler.jsonc (added top-level `d1_databases` for local dev's `pml-dev`)
- wrangler.test.jsonc (kept in sync — same `d1_databases` addition)
- vite.config.ts (AI-binding deletion now conditional on an available `CLOUDFLARE_API_TOKEN`, via `loadEnv`; comments corrected)
- src/shared/lib/wranglerConfig.test.tsx (ai-binding-survives-build test added; vars-allowlist now checks values too; `hasBuild` requires non-empty; `workers_dev`/`preview_urls` test added; stale comment fixed)
- README.md (corrected the false "test pins" claim; clarified the token-free full-check wording; token escape hatch no longer requires a source edit)
- docs/deploy-runbook.md (fixed the `pml-dev` D1 gap; fixed AC7's residual-door hostnames; added the stale-build warning; Build command now includes `npm test` so AC6 actually gates deploys)

~~Left as an open, low-priority item — not fixed, effort felt disproportionate to a currently-unreachable, low-severity gap:~~

~~- `wranglerConfig.test.tsx`'s vars-block regex could truncate early on a value containing a literal `}` (see Review Findings)~~

**Moot as of the single-environment revision below** — the per-environment `vars` blocks this regex parsed no longer exist; the test now just asserts no `vars` block is present at all.

## Scope revision (2026-08-10, after the code review above)

Patrick: "We are not doing any multi environment here - just one." Cut `env.staging`/`env.production` down to a single flat config:

- `wrangler.jsonc` / `wrangler.test.jsonc`: no `env` block; `ai`, `durable_objects`, `d1_databases`, `routes` all at the top level; D1 database renamed `pml-dev` → `pml`
- `package.json`: `deploy:staging` + `deploy:production` → one `deploy` script (`vite build && wrangler deploy`, no `--env`); removed the now-unused `cross-env` dependency
- `src/shared/lib/wranglerConfig.test.tsx`: the vars-allowlist test reverted to "no vars block at all" (nothing left to distinguish per environment); the ai-binding-survives-build and workers_dev/preview_urls tests are unaffected
- `docs/deploy-runbook.md` / `docs/access-runbook.md`: rewritten for one database, one domain pair, one Access application, one secrets set, one Builds connection
- **D1 database created for real**, via the Cloudflare MCP tool (`d1_database_create`) rather than asking Patrick to run the CLI command himself: name `pml`, id `d07713fe-d0f1-4708-a174-394b04fc01b9`, already in `wrangler.jsonc`

Re-verified after the revision: oxlint + tsc clean, 188/194 tests passing (6 skip without a build present, as before), `wrangler deploy --dry-run` (no `--env` now) shows exactly the three expected bindings (`ChatAgent`, `DB (pml)`, `AI`) with no warnings.

Attempted an actual `wrangler deploy` at Patrick's request: confirmed cleanly that this machine has no Cloudflare CLI credentials at all (`wrangler whoami` → not authenticated; a real deploy attempt dies immediately on `CLOUDFLARE_API_TOKEN` missing, no partial deploy). Separate from the MCP tool's own auth. Real deploy stays Patrick's to run — see `docs/deploy-runbook.md` for how to provide a token safely if he wants it run from here instead.

## File List — scope revision (2026-08-10)

Modified, on top of the code-review File List above:

- wrangler.jsonc (env blocks removed; single flat config; real D1 id)
- wrangler.test.jsonc (kept in sync)
- package.json / package-lock.json (`deploy:staging`/`deploy:production` → one `deploy`; `cross-env` removed)
- src/shared/lib/wranglerConfig.test.tsx (vars-allowlist reverted to "none at all")
- docs/deploy-runbook.md (rewritten for one environment)
- docs/access-runbook.md ("The 1.5 checklist" → one Access application)
- _bmad-output/implementation-artifacts/1-5-deploy-pipeline-environments.md (this file — AC1/AC7 marked revised, not silently rewritten)

## Change Log

- 2026-08-10: Part A implemented — line-ending normalization (own commits), tokenless dev server, Wrangler environments with per-env bindings and custom domains, public hostnames disabled, `/agents/*` gated, client-bundle secret scan, deploy runbook and README. AC7 (end-to-end deploy) left open pending Patrick's Part B account setup. Status → review.
- 2026-08-10: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 1 decision-needed, 14 patch, 0 defer, 2 dismissed. **Found and fixed a critical, live authentication bypass**: a malformed percent-escape (`%zz`) made the new `/agents/*` guard fail open while the real router still routed the request to a live `ChatAgent` Durable Object, unauthenticated — confirmed by direct reproduction before and after the fix. `/oauth/*` decision resolved by documenting (behavior unchanged). 13 of 14 patches fully applied and re-verified (`npm run check`'s oxlint+tsc+oxfmt now all pass repo-wide for the first time this session, 194/194 tests, both `--dry-run`s clean, `npm ci` exit 0); 1 low-priority test-robustness patch acknowledged but not fixed (disproportionate effort for a currently-unreachable gap). AC7 remains deliberately open, unchanged, pending Part B. Status → in-progress (not `done`: one acknowledged item remains, and AC7 is still Patrick's to close).
- 2026-08-10: **Scope revised — single environment, not staging + production.** Patrick's call, made when walking through what Part B actually required. Collapsed `env.staging`/`env.production` to one flat config, renamed the D1 database `pml-dev` → `pml`, simplified both runbooks and the deploy scripts accordingly. Created the real D1 database via the Cloudflare MCP tool. Re-verified clean (oxlint, tsc, tests, single dry-run with correct bindings). AC1 and AC7 marked revised in place. Status stays in-progress — Part B (domain, Access, secrets, Builds) is smaller now but still Patrick's to run.
- 2026-08-10: **Part B executed — the site is live.** Access application created via API, first production deploy run, AC7 verified end to end except its auto-deploy clause.
  - **Root cause of the previous session's failure, corrected:** it was recorded as "started before MCP auth", but the MCP tools were never the blocker — they worked, and are what created the D1 database. `wrangler` reads `CLOUDFLARE_API_TOKEN` or its own `wrangler login` config and knows nothing about an MCP OAuth session. Two separate credential paths. Fixed by `npx wrangler login` (account Bizmation `86e17509826e809459ca9f0725363c16`, identity `patrick@bizmation.com`).
  - **Resolved from the live account rather than transcribed:** `TEAM_DOMAIN` `https://bizmation.cloudflareaccess.com`, `POLICY_AUD` `0170fec1…79bb`, `OPERATOR_EMAIL` `patrick@bizmation.com` (the account's sole member — and the identity `wrangler login` authenticated as, which independently corroborates it). Written to gitignored `.env`; **this repo is public**.
  - **Access application `PML admin`** (`b13e527e-…`) with the three destinations, policy `operator only`, both IdPs allowed, `http_only_cookie_attribute: true`. Two deliberate departures from `access-runbook.md`'s own instructions, both documented there under Deviations: the policy uses an email include rather than "Cloudflare Account Member" (the latter would have denied the one-time-PIN break-glass login the same document asks for), and `path_cookie_attribute` is left off (the app spans `/admin*` and `/api/admin/*`; a path-scoped cookie would not reach the second).
  - **Deploy:** version `44d951f2-…`, both custom domains bound automatically from `routes` — no dashboard step, and the zone had zero DNS records so the pre-existing-CNAME trap never applied. Immediately after, apex returned `500` and `ops.` refused connections; both were propagation, resolved within about a minute. The runbook now warns about this, because it reads exactly like a broken deploy.
  - **AC6 finally has evidence.** The client-bundle secret scan had never run against a build with real secrets present — `.env` did not exist until now. 194/194 tests pass with it in place, confirming Vite inlined none of the Access config into `dist/client`.
  - **Three corrections to the runbook's own verification section**, all found by running it: apex `/api/admin/*` answers `302` (Access at the edge) not the documented `403`; `ops.` admin paths are **not** edge-gated at all and rely solely on the Worker guard (they answer `403` — the backstop working, but an undocumented asymmetry); and the `%zz` bypass regression **cannot** be exercised in production because Cloudflare's edge rejects it with `400` first, so that response must not be read as evidence the `normalizePath` fix works.
- 2026-08-11: **Status → done. Epic 1 closed.** Patrick's call, made with the review trade-off stated: BMAD's own transition rule in `sprint-status.yaml` is `in-progress → review → done`, and while Story 1.5 had a full code review earlier, everything after it — Part B, the Workers Builds cut, and the AC4 display-name work with its new endpoint, hook and 24 new tests — was reviewed only within the implementing session. Recorded here so the provenance of that `done` is legible: it means "the operator accepted it", not "an independent review pass ran". 8/8 ACs satisfied, 71/71 boxes checked, 218 tests, `npm run check` exit 0, verified against production rather than inferred. `epic-1` flipped alongside it, per that file's rule that an epic closes when all its stories do. `epic-1-retrospective` remains `optional` and unrun.
- 2026-08-11: **Access login page skipped for PML — the account-wide design is King of the Floor's.** Patrick loaded `/admin` and got another product's login page: its logo, colours, "Private preview — enter with your invited email", and "Long live the floor. · kingofthefloor.com". Checked before changing anything, and **the Access application was correct all along** — the redirect's `kid` matched the PML AUD, and the page heading read *Log in to PML admin*. The branding around that heading was the whole problem.
  - **Root constraint:** `login_design` (logo, header, footer, colours) exists only on the organization endpoint — verified against the OpenAPI spec, where no application endpoint accepts those fields. One login page for every Access app in the account, no per-app override.
  - **Fix:** `allowed_idps` narrowed to the Cloudflare IdP alone plus `auto_redirect_to_identity: true`, so Instant Auth skips the shared chooser entirely. Chosen over editing the org design because that would have stripped King of the Floor's own branding — a different live product. AUD unchanged, so `POLICY_AUD` stayed valid and no redeploy was needed.
  - **Cost, and it reopens a closed question: PML admin now has no break-glass login.** One-time PIN had to go, because Instant Auth only skips the page when a single IdP is allowed. Open Question 3 is reopened above rather than left marked resolved.
  - **A rationale expired quietly and was corrected, not left standing.** `access-runbook.md`'s first deviation justified the email-include policy partly by "account-member matching would deny the PIN break-glass login". With PIN gone from this app, that argument no longer applies. The deviation still holds on its other reason (it is tighter, and it agrees with `OPERATOR_EMAIL` by construction); the dead half is struck through in place.
  - **Method note:** `curl -L` cannot verify this. Instant Auth is a client-side redirect, so curl lands on the login page with a `200` no matter what the setting is — it looked unchanged through curl and through a stale browser tab, and only a genuinely fresh browser load confirmed it.
- 2026-08-10: **Story 1.4's AC4 display-name half closed — the last substantive Epic 1 item.** Deployed as version `e1fc60c9`. It had been deferred to "a follow-up once Part B lands"; Part B landed hours earlier, so it was done rather than carried.
  - `GET /api/admin/session` (guarded, returns **only** `displayName`) + `useAdminSession`, which fails closed to "Not signed in" on every error path — including the 302-to-login Access returns for an expired session, which `fetch` follows into an HTML body that `res.json()` rejects. Chose this over server-rendered chrome because the app is a client-side SPA served from a prebuilt document: adding `/admin` to `run_worker_first` would let the Worker see the request with nowhere to inject a name, needing HTMLRewriter or an SSR pipeline for one route.
  - **Two adjacent falsehoods fixed in the same change.** The admin chrome's warn chip still read "Not access-controlled — anyone with this URL sees it" — true when written, and the exact inverse of true once Access was bound. Its test carried an explicit "delete this only when Access is actually in front of /admin" instruction whose condition had been met. Both retired; the warn slot went back to carrying gate state, which its own comment records as the original handoff design.
  - **Found a test that passed for the wrong reason, and proved it before fixing it.** `server.test.ts`'s "still rejects a valid token for a non-operator identity" generated a fresh keypair per test under one team domain. `access.ts` caches its JWKS per team domain in a module-level Map for the isolate's lifetime, so the second keypair was verified against the first one's cached key and failed on **signature** — never reaching the email comparison the test existed to prove. Verified with a throwaway probe: a token carrying the **correct** operator email, signed by a second keypair, also returned 403. Both that block and the new one now share one keypair, and a new case pins that the two outcomes differ only by identity. This bit the new tests first, which is how it surfaced.
  - 218 tests (was 194), `npm run check` exit 0, deployed and verified live: `/api/admin/session` answers `302` on the apex (Access at the edge) and the `403` envelope on `ops.` (Worker guard). All four secrets confirmed still bound after a deploy without `--secrets-file`.
- 2026-08-10: **CI/CD dropped — no Workers Builds.** Patrick, asked why it was needed: *"i don't think we do."* Supersedes `architecture.md:262`'s LOCKED "Workers Builds (GitHub) → production", the second LOCKED infrastructure line this story has revised (single-environment was the first). AC7's auto-deploy clause is revised away rather than left failing, which closes AC7 and with it the last open item in the story.
  - **The decision surfaced a real defect in the manual path.** `"deploy": "vite build && wrangler deploy"` ran **no tests at all**. Workers Builds was going to be the only place `npm test` gated a deploy — that is precisely why the code review had set its Build command to `npm run build && npm test` (see the finding above). Dropping Builds without noticing would have silently left AC6's client-bundle secret scan gating nothing, which is the exact failure mode AC6 was written to eliminate, reintroduced by the fix for it.
  - **Gate moved into the surviving script:** `"deploy": "vite build && vitest run && wrangler deploy"`. Order is load-bearing — `vite build` creates `dist/client`, and only then does the scan stop `skipIf`-ing itself. A non-zero `vitest run` now blocks the deploy, the same way a failing Builds step would have.
  - **Second reason the drop is right, not merely acceptable:** Workers Builds deploys from GitHub's `main`. At the time of this decision `origin/main` was 11 commits behind local and did not contain `d64836f` — the fix for the critical `/agents/*` authentication bypass. Connecting Builds would have deployed the vulnerable build over the fixed one, automatically. Deploying from the laptop ships the tree you can see.
