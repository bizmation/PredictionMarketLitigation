---
baseline_commit: d7ab66a8f2485ee3a6b1602302be1d57a4b30e09
---

# Story 1.4: Admin Access Protection

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Patrick),
I want `/admin` and mutating gate APIs protected by Cloudflare Access,
So that only my operator identity can approve drafts, change mode, or moderate feedback.

## ⚠️ Scope split — read this before anything else

The epic's Story 1.4 assumed Access could be bound now. **It cannot.** Path-scoped Cloudflare Access applications require an **active zone** in the Cloudflare account — the Zero Trust UI's Domain field is a dropdown restricted to zones you own, and arbitrary `*.workers.dev` hostnames cannot be typed into it. [Source: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/]

The one-click Access toggle that *does* work on `workers.dev` (Workers & Pages → Settings → Domains & Routes → Enable Cloudflare Access) covers the **entire hostname**, with no path scoping. Enabling it today would lock apex and `ops.` too — directly violating the epic's AC "public apex and `ops.` routes remain reachable without login." Custom domains are not bound until Story 1.5.

**Decision (Patrick, 2026-08-10): split the story.**

| In scope — Story 1.4 | Deferred — Story 1.5 |
|---|---|
| Worker-side JWT verification module (`aud`-pinned, JWKS-backed) | Creating the Zero Trust Access application |
| Operator identity resolution + single-principal allowlist | Binding destinations `/admin`, `/admin/*`, `/api/admin/*` |
| `requireOperator()` guard + `/api/admin/*` route enforcement | Setting `TEAM_DOMAIN` / `POLICY_AUD` as real production secrets |
| `.adminbar` session chrome (handoff C-surface) | End-to-end browser login verification |
| Dev bypass, fail-closed, env-gated | Confirming apex/`ops.` stay public *in production* |
| Vitest coverage with locally-minted JWTs | Access on `workers.dev` + preview URLs as residual-bypass cover |

**This story is fully testable without any Cloudflare account, credentials, or network.** Verification runs against a locally-minted RSA keypair and a locally-served JWKS. Do not attempt to configure Zero Trust in this story.

## Acceptance Criteria

1. **Given** the admin shell from Story 1.3, **when** a request reaches `/api/admin/*` without a valid Access JWT, **then** the Worker rejects it with `403` and the structured error envelope `{ code, message }` — the SPA route `/admin` may still render, because a document render leaks nothing (every band is an empty placeholder) and edge enforcement is Story 1.5's job
2. **When** a request carries a JWT that is expired, wrong-`aud`, wrong-issuer, unsigned, `alg: none`, or signed by an unknown key, **then** verification fails closed and the request is rejected — each case pinned by a test
3. **When** a valid JWT authenticates an email that is **not** the configured operator principal, **then** the request is rejected with `403` — authentication alone is insufficient; only the pinned operator identity passes (this is what Story 3.13's "non-operator identities cannot change mode" depends on)
4. **When** authenticated as the operator, **then** the resolved identity is available to server code for later Evidence attribution, and the admin shell renders the `.adminbar` session strip per the UX admin bar. *(Scope reduced by review decision 2026-08-10: rendering the operator's display name moves to Story 1.5. Until Access issues a real session there is nothing to display — a session endpoint today would only ever echo the local dev-bypass stub. The strip renders "Not signed in", which is the honest state.)*
5. **And** public routes (`/`, `ops.` host, `/api/poll/*`, and every non-`/api/admin/*` path) are never subject to the guard — asserted by test, because Story 2.9 introduces a **public mutating** endpoint (`POST /api/poll/votes`) that a naive "all writes require auth" guard would break
6. **And** Access config and secrets never appear in client bundles or public Evidence — no `TEAM_DOMAIN`, `POLICY_AUD`, or operator email in anything Vite ships to the browser
7. **And** the dev bypass cannot be enabled in production: it is gated on a Wrangler `var` that is absent from the production env block, verified by test, and the verifier fails closed when the var is absent
8. **And** documentation records the chosen Access IdP and how to bind Access for staging vs production (the runbook Story 1.5 executes)

## Tasks / Subtasks

- [x] Task 1: Preflight (AC: all)
  - [x] Node ≥ 20.12 (repo ships `.nvmrc` = 24). Machine default may be older — `nvm use` first
  - [x] Confirm baseline green: `npm test` (expect **67 tests, 4 files, exit 0, no cloud credentials**) and note that `npm run check` currently **fails on Windows** for line-ending reasons unrelated to your work (see "Known environment traps")
- [x] Task 2: Add `jose` (AC: 2)
  - [x] `npm install jose` — production dependency, not dev. This is Cloudflare's own documented verification path for Access JWTs [Source: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/]
  - [x] Do **not** hand-roll WebCrypto RS256. You would reimplement `kid` matching, JWKS caching, and 6-weekly key rotation. `createRemoteJWKSet` handles all three
- [x] Task 3: Access verification module (AC: 2, 3, 7)
  - [x] Create `src/shared/lib/access.ts` — pure-ish, no React, no surface imports. Unit-tested in the **workers** project
  - [x] Export `type Operator = { email: string; displayName: string }`
  - [x] Export `async function verifyOperator(request: Request, env: Env): Promise<Operator | null>`
  - [x] Read the token from header `Cf-Access-Jwt-Assertion` first, falling back to the `CF_Authorization` cookie. Header is preferred — it works for non-browser clients too
  - [x] Verify with `jwtVerify(token, JWKS, { issuer: env.TEAM_DOMAIN, audience: env.POLICY_AUD })` where `JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`))`
  - [x] **`audience` is mandatory, not optional.** Without it, a JWT minted for *any other* Access application on the same Cloudflare account validates on signature + issuer alone. The AUD tag is per-application
  - [x] Cache the `createRemoteJWKSet` instance at module scope keyed by team domain — creating it per request defeats its internal JWKS cache and hits Cloudflare on every call
  - [x] Map `payload.email` → operator. Compare **case-insensitively** against `env.OPERATOR_EMAIL`; return `null` on mismatch. Do not treat "valid JWT" as "is the operator"
  - [x] Derive `displayName` from `env.OPERATOR_DISPLAY_NAME` (default `"Patrick"`), **never** from the email. The handoff shows `Patrick — operator identity`, and `README.md:176` requires a *public-safe operator display name* because Story 3.13 renders mode-change audit entries publicly on `ops.` — an email must never reach a public surface
  - [x] **Fail closed on every error path**: missing env var, missing token, malformed token, network failure fetching JWKS → `null`. Never `catch` into a permissive default
- [x] Task 4: Dev bypass — the dangerous part (AC: 7)
  - [x] In `verifyOperator`, before any token work: if `env.ACCESS_DEV_BYPASS === "true"`, return the stub operator `{ email: env.OPERATOR_EMAIL ?? "dev@localhost", displayName: … }`
  - [x] Gate on the **Wrangler `var`**, never on `import.meta.env.DEV` or `NODE_ENV` — those are bundler-time values that can be wrong in a Worker build
  - [x] Declare `ACCESS_DEV_BYPASS` in `wrangler.jsonc`'s **top-level `vars` only**. Wrangler `vars` are **non-inheritable** — an env block that does not redeclare it does not get it. Story 1.5's `production` block must therefore never declare it, and the existing comment at `wrangler.jsonc:9-11` already documents this semantic
  - [x] Write a test asserting `verifyOperator` rejects when `ACCESS_DEV_BYPASS` is absent **and** when it is any value other than the exact string `"true"` (guard against `"false"` being truthy)
  - [x] Add a one-line comment at the bypass naming the blast radius: if this ships enabled, `/api/admin/*` is fully open
- [x] Task 5: Route guard (AC: 1, 5)
  - [x] Create `src/shared/lib/adminGuard.ts` (or fold into `access.ts` if it stays under ~40 lines) exporting `requireOperator(request, env)` → `{ operator } | Response`
  - [x] Rejection shape must match the architecture's error envelope exactly: `{ code, message, details? }` with HTTP 403. Use `code: "forbidden"`. **No secret, no stack, no hint about why** — do not distinguish "no token" from "wrong identity" in the public message [Source: architecture.md#API-&-Communication-Patterns]
  - [x] Wire into `src/server.ts`'s `fetch`: match `/api/admin/` as a **path prefix**, before `routeAgentRequest`. Everything else falls through untouched
  - [x] **Gate by path prefix, never by HTTP method.** Story 2.9 adds public `POST /api/poll/votes` and Story 4.5 adds a public correction-form POST. A "all POST/PUT/DELETE requires auth" guard breaks both [Source: architecture.md#Post-Epics-Amendments, epics.md:518]
  - [x] There are no real `/api/admin/*` handlers yet — 3.10 brings the first. Add a single `404` placeholder *inside* the guarded prefix so the guard is exercisable end-to-end, and assert an unauthenticated call gets `403` (not `404`) so the guard demonstrably runs first
- [x] Task 6: `run_worker_first` (AC: 1)
  - [x] Add `"/api/admin/*"` to `assets.run_worker_first` in **both** `wrangler.jsonc` and `wrangler.test.jsonc`
  - [x] Why: compatibility flag `assets_navigation_prefers_asset_serving` is default-on for compat dates ≥ 2025-04-01 (this repo is on `2026-06-11`), so asset-eligible requests can skip the Worker. `run_worker_first` is documented as required when "performing any authentication checks… before serving static assets" [Source: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/]
  - [x] **Do not** add `/admin` to `run_worker_first` in this story. Adding it would route the SPA document through the Worker with no Access in front of it (1.5's job) and no benefit — the document leaks nothing. Story 1.5 revisits this
  - [x] `wrangler.test.jsonc` carries a "keep in sync" contract in its header comment — honour it
- [x] Task 7: `.adminbar` session chrome (AC: 4)
  - [x] Port the handoff's inline `.adminbar` CSS into `src/shared/ui/pml.css`. **It was never ported** — it lives in a `<style>` block inside `PML Admin.html:13-20`, not in the handoff's shared `pml.css`. This is the one place this story legitimately writes CSS; copy it verbatim:
    ```css
    .adminbar { background: var(--color-neutral-900); color: var(--color-neutral-200); }
    .adminbar .wrap { display: flex; align-items: center; gap: var(--space-4); padding: 6px var(--space-6);
      font-size: 11.5px; flex-wrap: wrap; }
    .adminbar strong { font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
      color: var(--color-accent-300); }
    .adminbar .who { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
    .adminbar .who i { width: 6px; height: 6px; border-radius: 50%; background: var(--color-accent-400);
      display: inline-block; }
    ```
  - [x] Create `src/shared/ui/AdminBar.tsx` — props `{ operator?: { displayName: string }, sessionNote?: ReactNode }`. Export from `src/shared/ui/index.ts`
  - [x] Markup per handoff `PML Admin.html:78-82`, copy verbatim: label `Private · operator only`; message `Actions taken here are published on ops. within seconds, including rejections.`; and `<span class="who"><i></i> {displayName} — operator identity</span>`
  - [x] The `<i></i>` is a 6px status dot, **not** an icon font. Mark it `aria-hidden="true"`
  - [x] The handoff shows `· session 41m`. **Omit the duration** — there is no session-length source until a real Access session exists, and inventing a number would be a fake receipt on a project whose thesis is provenance. Leave the slot; fill it in 1.5
  - [x] **There is no sign-out affordance in the handoff** (verified by grep across the bundle). Do not invent one
  - [x] Render `AdminBar` in `AdminShell` **above** `TopBar`. Do not extend `TrustBar` — its four slots are a different concern, and the admin bar is a distinct dark strip
  - [x] `AdminShell` currently hardcodes `warn={<WarnChip>Not protected — Access lands in Story 1.4</WarnChip>}`. Replace with the handoff's `Gate: HITL · autonomous OFF`. Also update the file-header comment at `AdminShell.tsx:16-20` which says "NOT PROTECTED YET" — it is now *partially* protected: API guarded, edge binding pending 1.5. Say exactly that; do not overclaim
- [x] Task 8: Types and config (AC: 6, 7)
  - [x] Add `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `OPERATOR_DISPLAY_NAME`, `ACCESS_DEV_BYPASS` to the `Env` interface in `env.d.ts`
  - [x] `TEAM_DOMAIN` / `POLICY_AUD` / `OPERATOR_EMAIL` are **secrets** (Wrangler secrets / Secrets Store), never committed values. Only `ACCESS_DEV_BYPASS` and `OPERATOR_DISPLAY_NAME` may sit in `vars`
  - [x] Verify nothing lands in the client bundle: these are read only in `src/server.ts` / `src/shared/lib/access.ts`, never in a `surfaces/*` component. Grep the built output if in doubt
- [x] Task 9: Tests (AC: 1, 2, 3, 5, 7)
  - [x] `src/shared/lib/access.test.ts` — **workers** project. Mint keys locally with `jose`'s `generateKeyPair("RS256")` and serve a JWKS via a stubbed `fetch`; **no network, no `CLOUDFLARE_API_TOKEN`**. The baseline is 67 tests passing with zero credentials — do not regress that
  - [x] Cover: valid operator token → `Operator`; expired; wrong `aud`; wrong `iss`; `alg: none`; unknown signing key; malformed/garbage string; missing token entirely; **valid token, non-operator email** (AC3); email case-insensitivity; JWKS fetch failure → `null` not throw
  - [x] Bypass tests: absent var → verify normally; `"true"` → stub operator; `"false"` / `"1"` / `""` → verify normally (AC7)
  - [x] `src/server.test.ts` (extend) — unauthenticated `/api/admin/ping` → `403` with `{ code, message }` and no `details` leakage; authenticated → not `403`; **`GET /` and `POST /api/poll/votes` are untouched by the guard** (AC5 — this is the regression guard most likely to be broken later)
  - [x] `src/surfaces/shells.test.tsx` (extend) — admin renders `.adminbar` with the display name; renders **no** email anywhere in markup; renders no sign-out control
  - [x] `npm test` green across all four files
- [x] Task 10: Runbook + IdP record (AC: 8)
  - [x] Create `docs/access-runbook.md`. This is Story 1.5's executable checklist — write it for someone with the Cloudflare dashboard open
  - [x] **Record the IdP decision: Cloudflare IdP** (see "Access IdP — decided" below). Note explicitly that `architecture.md:627`'s option list (Google / GitHub / one-time PIN) predates Cloudflare's own IdP and is stale
  - [x] Document for 1.5: create the self-hosted app once the apex zone is active; destinations must include **both** `/admin` **and** `/admin/*` — a wildcard `/admin/*` does **not** match the bare `/admin` path; plus `/api/admin/*`
  - [x] Document the residual-bypass hazard: after 1.5 binds custom domains, the Worker stays reachable at `pml.<subdomain>.workers.dev` and at preview URLs. Unless those are *also* covered, `/api/admin/*` is reachable there with a **forgeable** `Cf-Access-Jwt-Assertion` header. The `aud`-pinned verification from Task 3 is what makes that survivable — say so, so nobody later "simplifies" it away
  - [x] Note staging vs production get **different AUD tags** → different `POLICY_AUD` secrets per env
  - [x] Note a payment method is required at Zero Trust onboarding even on the Free plan (no charge) — easy to trip over [Source: https://developers.cloudflare.com/cloudflare-one/setup/]
  - [x] Note the team name must be chosen before any IdP config, since every callback URL embeds `<team-name>.cloudflareaccess.com`
- [x] Task 11: Finalize (AC: all)
  - [x] `npm test` green (expect 67 + your new tests)
  - [x] `oxlint src/ && npx tsc` clean. Full `npm run check` also runs `oxfmt --check .`, which fails on Windows for pre-existing line-ending reasons — see traps below
  - [x] Update Dev Agent Record + File List; set status `review`
  - [x] Commit `story 1.4: access verification + operator identity` (single commit; do not push)

### Review Findings

Adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) against `d7ab66a..08ec412`: 3 decision-needed, 14 patch, 7 deferred, 2 dismissed.

- [x] [Review][Decision] **RESOLVED — AC4 scope reduced.** The display-name half moves to Story 1.5; AC4 amended above and a ledger entry added. Original finding: **AC4 was checked off but no shipped code path satisfied it** — `app.tsx:53` renders `<AdminShell dev={dev} />` with no `operator` prop, so `AdminBar` always takes the "Not signed in" branch. The display name renders only where `shells.test.tsx:123` constructs the prop by hand. The Dev Notes did bless deferring the wiring to 1.5, but AC4 and Task 7 are both marked satisfied. Choose: wire a guarded `/api/admin/session` fetch now, or formally move AC4's session-name half to 1.5 and un-check it here.
- [x] [Review][Decision] **RESOLVED — explicit warning restored.** The warn slot now reads `Not access-controlled — anyone with this URL sees it`; the gate state moved to the message so both facts show. Two tests pin it. Original finding: **the chrome no longer warned that the document itself is unauthenticated** — the `WarnChip` went from `Not protected — Access lands in Story 1.4` to `Gate: HITL · autonomous OFF`, and the test enforcing the old standard was deleted. `/admin` is still fully public (deliberately excluded from `run_worker_first`, no Access binding), so an anonymous visitor now sees an operator console with a live-presence dot and a reassuring "Admin APIs are verified" line. Related: `"Not signed in"` is invented copy under a task that said *copy verbatim*, and the accent status dot renders unconditionally next to it. Choose: restore an explicit unauthenticated-document warning, or accept the current copy as sufficient disclosure.
- [x] [Review][Decision] **RESOLVED — Workers observability now.** `resolveOperator` returns a `RejectionReason`, `requireOperator` emits a structured `admin.access_denied` warn carrying reason/method/path but never the token or email, and `observability` is enabled in `wrangler.jsonc`. Public Evidence rows stay an Epic 3 concern. Original finding: **no telemetry on authorization decisions** — `access.ts:129` swallows every failure into a bare `catch`, `adminGuard.ts` emits nothing, and `wrangler.jsonc` has no `observability` block. A week of probing, a misconfiguration, and an unreachable JWKS endpoint are indistinguishable from "nobody tried". Choose: plain Workers observability + a rejection counter now, or design auth events as Evidence rows (which couples this to the Epic 3 Evidence schema).
- [x] [Review][Patch] `jwtVerify` does not pin `algorithms` — the `alg: none` test passes because jose refuses unsigned tokens, not because this code constrains anything [`src/shared/lib/access.ts:116`]
- [x] [Review][Patch] Dev bypass is not hostname-gated, and the runbook's own tunnel instructions expose it — `wrangler dev --tunnel-name` loads `.dev.vars` AND publishes a public hostname, so "structurally impossible to ship enabled" is overstated [`src/shared/lib/access.ts:101`]
- [x] [Review][Patch] Cookie-borne auth with no CSRF defense — a cross-site form POST rides `CF_Authorization` once story 3.10 adds mutating handlers; require the `Cf-Access-Jwt-Assertion` header (or check `Sec-Fetch-Site`) for non-GET [`src/shared/lib/access.ts:72`]
- [x] [Review][Patch] Empty `CF_Authorization=` short-circuits and returns null, skipping a later valid cookie in the same header — a cookie-shadowing lockout of the sole operator [`src/shared/lib/access.ts:78`]
- [x] [Review][Patch] `isAdminApiPath` matches the raw pathname — `/api/%61dmin/...` and `//api/admin/...` bypass the prefix test [`src/shared/lib/adminGuard.ts:24`]
- [x] [Review][Patch] `TEAM_DOMAIN` and `OPERATOR_EMAIL` are unvalidated — one trailing slash or stray whitespace in a secret locks the operator out permanently and silently [`src/shared/lib/access.ts:58`]
- [x] [Review][Patch] `run_worker_first` lists only `/api/admin/*` while the guard deliberately matches the bare `/api/admin`; glob semantics for the bare parent are undocumented, so make it explicit [`wrangler.jsonc:43`]
- [x] [Review][Patch] No `Cache-Control: private, no-store` / `Vary` on admin responses — the perimeter is where that convention should be set before 3.10 returns draft text [`src/shared/lib/adminGuard.ts:45`]
- [x] [Review][Patch] No test proves a real signed JWT passes the route guard end-to-end — the only "authenticated" server test uses the dev bypass [`src/server.test.ts:27`]
- [x] [Review][Patch] Public-route regression guards assert only `not.toBe(403)`, which a 500 also satisfies [`src/server.test.ts:107`]
- [x] [Review][Patch] JWKS stub answers any URL, so the `/cdn-cgi/access/certs` path shape is never actually asserted [`src/shared/lib/access.test.ts:55`]
- [x] [Review][Patch] `adminGuard.ts` ships with no co-located test, violating the LOCKED co-location constraint [`src/shared/lib/adminGuard.ts`]
- [x] [Review][Patch] Nothing asserts `ACCESS_DEV_BYPASS` is absent from the Wrangler configs, so AC7's "verified by test" half is unmet; `wrangler.test.jsonc` also has no defensive `vars` override, leaving the `.dev.vars` trap live for every future admin test [`wrangler.test.jsonc:23`]
- [x] [Review][Patch] Story file misstates its own work: Task 8 says modify `env.d.ts` (untouched — members went to `src/access-env.d.ts`), Project Structure Notes still claim `env.d.ts # MODIFIED`, the Dev Agent Record claims exactly one deviation when there were two, and the per-file test counts are wrong (server.test.ts gained 10 not 11; shells.test.tsx netted +4 after a deletion; the stated breakdown sums to 109, not 107) [`_bmad-output/implementation-artifacts/1-4-admin-access-protection.md:230`]
- [x] [Review][Patch] `AdminBar`'s second prop shipped as `note`, not the spec'd `sessionNote`, and is never passed — dead API surface [`src/shared/ui/AdminBar.tsx:24`]
- [x] [Review][Defer] `/agents/*` and `ChatAgent`'s `@callable() addServer` remain fully unauthenticated [`src/server.ts:41`] — deferred, pre-existing, already ledgered and owned by 1.5 deploy hardening
- [x] [Review][Defer] `workers_dev` and `preview_urls` are not disabled, so every deploy mints the exact public hostnames the module's own comments name as the threat model [`wrangler.jsonc`] — deferred, deploy config owned by 1.5
- [x] [Review][Defer] AC6 rests on a one-time manual `grep` of `dist/` with no committed guard or CI step [`src/shared/lib/access.ts`] — deferred, needs the CI pipeline from 1.5
- [x] [Review][Defer] No revocation awareness — a leaked token stays valid until `exp` after the identity is removed; break-glass is not in the runbook [`src/shared/lib/access.ts:116`] — deferred, inherent to stateless JWT; document in 1.5
- [x] [Review][Defer] Unauthenticated callers can trigger outbound JWKS fetches by spraying unknown `kid` values [`src/shared/lib/access.ts:116`] — deferred, mitigated by jose's fetch cooldown; revisit with rate limiting
- [x] [Review][Defer] `access.ts` sits in `src/shared/lib/`, which client surfaces import from; nothing structurally prevents a future surface pulling `jose` and the auth logic into the browser bundle [`src/shared/lib/access.ts`] — deferred, needs a lint boundary rule
- [x] [Review][Defer] `src/access-env.d.ts` relies on being a global script — one stray `import` silently breaks the declaration merge [`src/access-env.d.ts:25`] — deferred, low impact, caught by tsc if it happens

## Dev Notes

### Access IdP — decided

**Cloudflare IdP.** Cloudflare shipped its own first-party identity provider and made it the default for new Zero Trust organizations on 2026-06-18. Zero setup, no external OAuth app, no client secret to rotate, MFA inherited from the Cloudflare account, and the policy is a single selector (*Cloudflare Account Member* → this account). For a solo operator this dominates the alternatives on every axis. [Source: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/]

One-time PIN is **no longer added automatically** to new organizations — worth adding later as a break-glass method (~3 clicks) in case of Cloudflare account lockout, but not in this story. [Source: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/]

Free tier covers 50 users; one operator is 1 of 50. Service tokens and Bypass policies do not consume seats.

### Why the Worker verifies the JWT even though Access sits at the edge

Not defence-in-depth theatre — a real, documented bypass. Cloudflare states it for the analogous case: Access "only protects your custom domain. The default `<id>` hostname does not pass through your zone, so it **keeps answering unauthenticated requests and defeats the policy**." Once 1.5 binds `predictionmarketlitigation.com`, this Worker remains reachable at its `workers.dev` hostname and at every preview URL. A request arriving there can set `Cf-Access-Jwt-Assertion` to anything. Signature + `aud` verification is what turns that from a breach into a `403`.

This is why AC3 (identity allowlist) is separate from AC2 (token validity). Story 3.13's "non-operator identities cannot change mode" cannot be satisfied by "is authenticated" alone.

### Known environment traps

- **`npm run check` fails on Windows** for reasons unrelated to your work: the repo has no `.gitattributes`, `core.autocrlf=true` rewrites LF→CRLF on checkout, and `oxfmt --check` then flags all ~40 files including ones this story never touches. Run `oxlint src/ && npx tsc` for real signal. **Do not "fix" this by reformatting the repo** — that would produce a whole-tree diff burying your actual change. It belongs to Story 1.5's envelope work
- **`npm ci` currently fails** (`Missing: @emnapi/runtime@1.11.3 from lock file`). There is an uncommitted `package-lock.json` reconcile in the working tree. If `npm ci` fails, use `npm install`. Also Story 1.5's problem — do not adopt it here beyond adding `jose`
- **`wrangler.test.jsonc` exists specifically so tests need no cloud credentials.** Commit `b3dc307` added it because `wrangler.jsonc`'s `ai` binding is `remote: true` with no local simulation, which otherwise forced every workers-project test through a live `CLOUDFLARE_API_TOKEN`. Keep it in sync; **never add the `ai` binding to it**

### Current code state (verified at `d7ab66a`)

- `src/server.ts` — `ChatAgent` DO plus a 7-line `fetch` that delegates to `routeAgentRequest(request, env)` then 404s. Your guard goes in that `fetch`, before the delegation. Everything else in this file stays untouched
- `src/surfaces/admin/AdminShell.tsx` — renders `TopBar` (brand `PML <span class="sub">/ admin</span>`), `TrustBar`, two `SectionBand`s (`#queue`, `#mode`), `SiteFooter`. Takes only `{ dev }`. It will need an `operator` prop path — but note **the shell is currently rendered client-side from `app.tsx` with no server data**, so decide deliberately: either fetch identity from a small guarded endpoint, or leave `AdminBar` rendering a placeholder until 1.5 wires the real session. Prefer the latter; do not invent a client-side auth fetch this story does not need
- `src/shared/ui/TrustBar.tsx` — exactly four slots (`warn`, `message`, `meta`, `provenance`), `!= null` checks. No session slot. `AdminBar` is net-new, not a TrustBar variant
- `src/shared/ui/TopBar.tsx` — props `{ brand, links }`. No session slot either
- `src/shared/lib/surface.ts` — `resolveSurface` already routes `/admin` and `/admin/*` (but never `/administrivia`) to the admin surface. **Reuse `isAdminPath`'s logic shape for the API prefix match; do not write a second, subtly-different matcher**
- `wrangler.jsonc:25` already reserves this story's slot: *"Story 1.4 — Cloudflare Access protects /admin + /api/admin/\* (zero-trust config, not wrangler)"*. That comment is correct and is why Task 6 is the only Wrangler change here
- No `src/pipeline/`, no D1, no `/api/*` routes exist yet. This story creates the **first** `/api/` path in the repo

### Architecture requirements binding this story

- **Auth (LOCKED):** "Cloudflare Access (Zero Trust) in front of `/admin` and mutating gate APIs" [Source: architecture.md#Authentication-&-Security, line 181]
- **Enforcement point (LOCKED):** "Access at **Worker edge** for `/admin` and `/api/admin/*`" — not in the SPA [Source: architecture.md#Cross-Cutting-Concerns, line 544]
- **Route shape (LOCKED):** mutating gate under `/api/admin/*`; concrete example `/api/admin/drafts/:draftId/approve` [Source: architecture.md#API-Naming-Conventions, line 307; #Architectural-Boundaries, line 515]
- **Error envelope (LOCKED):** `{ code, message, details? }`; "no secret/stack leakage on public routes" [Source: architecture.md#API-&-Communication-Patterns]
- **File locations (LOCKED):** pure helpers in `src/shared/lib/`; co-located `*.test.ts(x)` [Source: architecture.md#File-Organization-Patterns]
- **Boundaries (LOCKED):** `surfaces/*` may import `shared/*` only — never `pipeline/*`, "except admin calling admin APIs" [Source: architecture.md#Architectural-Boundaries, line 520]
- **Naming (LOCKED):** PascalCase components, camelCase functions [Source: architecture.md#Naming-Patterns]
- **Local dev (planned):** "Access bypass/dev stub for local admin" — Task 4 is the architecture's own prescription, not an invention [Source: architecture.md#Development-Workflow-Integration, line 571]

### What later stories need from this one

| Story | Needs |
|---|---|
| 3.10 Admin HITL approval queue | Gated `/admin` + server-side rejection of unauthenticated mutations. AC: "unauthenticated users cannot perform actions" [epics.md:710] |
| 3.11 Publish to live F1 | Approver identity reaching the publish path — provenance labels frozen at publish time (FR18) |
| 3.12 Operator loop controls | Manual-trigger endpoints inside the perimeter. Constraint: "routine loop operation does not require redeploy (NFR8)" — so Access must be **config, not code** [epics.md:744] |
| 3.13 Autonomous mode | **The strongest requirement: "non-operator identities cannot change mode" [epics.md:761].** Needs a pinned principal (AC3), not just authentication. Also needs a public-safe display name, since mode-change audits render publicly on `ops.` |
| 4.6 Feedback moderation | The perimeter extended to a second admin queue + its mutations; "unauthenticated users cannot moderate" [epics.md:860] |
| 2.9 Reader cert poll | **The inverse:** `POST /api/poll/votes` must stay public. This is why AC5 exists |

### UX requirements binding this story

- **Handoff `PML Admin.html:78-82`** — the `.adminbar` markup and copy, quoted verbatim in Task 7
- **`ux-brief-pack.md:238-253` (section C)** — "Authenticated surface for approve / edit / reject"; "Only Patrick's operator identity enables/disables Autonomous mode"; "Evidence records the approver"; "Public can observe outcomes; only operator performs actions." Single-identity model, **not** a role system — do not build roles/permissions
- **`design_handoff_pml/README.md:176`** — mode transparency requires a *public-safe operator display name*, which is why `displayName` is a separate configured value rather than derived from the email
- **NFR5** — keyboard reachable, 2px accent focus ring at 2px offset. The admin bar is display-only, so this mostly means: do not add a focusable element without a focus style
- **NFR6** — "approve/edit/reject and mode controls operator-authenticated (Cloudflare Access); secrets never published" [epics.md:135]

### Scope boundaries (do NOT do in this story)

- No Zero Trust dashboard configuration, no Access application, no real AUD tag — Story 1.5
- No custom domains, no Wrangler environments, no CI/CD — Story 1.5
- No `.gitattributes`, no lockfile fix, no repo-wide reformat — Story 1.5's envelope work
- No real admin API handlers (approve/reject/mode) — Stories 3.10 / 3.12 / 3.13
- No D1, no migrations, no Evidence rows — Stories 2.1 / 3.1
- No roles, groups, or multi-user permissions — the model is one pinned operator
- No sign-out UI, no session timer — neither exists in the handoff or has a data source
- Do not modify `ChatAgent` or the `/agents/*` route. Its unauthenticated surface is a **known, ledgered** item owned by 1.5's deploy hardening — leaving it is correct here, but do not let the story's title fool you into thinking this closes it
- Never touch `_bmad/`, `.claude/`, `.agents/`, or `_bmad-output/` except this story file and `sprint-status.yaml`

### Previous story intelligence (1.2 / 1.3)

- **Port, don't invent.** 1.2's one real misstep was inventing wrapper classes the handoff does not define; they were removed in review. `.adminbar` is a genuine port (Task 7) — copy the five rules verbatim, add nothing
- **1.3's review resolved a decision rather than deferring it** (the `CLOUDFLARE_API_TOKEN` gap → `wrangler.test.jsonc`). Follow that instinct: if you hit a blocker with a clean fix inside scope, fix it and say so
- **oxlint runs `jsx-a11y`.** 1.2 hit `prefer-tag-over-role`. Use semantic elements; the `.adminbar` is a `div`, which is right — it is a strip, not a landmark
- **Two Vitest projects**: `workers` for `*.test.ts` (your `access.test.ts`, `server.test.ts`), `ui` for `*.test.tsx` (shell rendering). `react` is externalized in the workers project — never import React into a `.test.ts`
- **Verify a11y/focus with real keyboard input, not `.focus()`.** 1.3 recorded a false negative: `:focus-visible` does not match on programmatic focus
- **1.2's review flagged a File List that claimed files not in its commit.** Write the File List from `git diff --name-only`, not from memory
- **`renderToStaticMarkup` is the assertion vehicle** for shell tests — no DOM, no jsdom

### Git intelligence

`d7ab66a` (1.2 review: 3 decisions resolved, 7 patches) ← `b3dc307` (1.3 review: token gap + 17 patches) ← `d7d2323` ← `ab6d5df` (1.3 impl). Both 1.2 and 1.3 are now `done`; Epic 1 is 3/5 with only 1.4 and 1.5 open. Conventions to continue: file-level comments explaining *why* a shape was chosen; deliberate documented exclusions over silent omissions; red-green test order; single unpushed commit per story.

Working tree carries one uncommitted `package-lock.json` reconcile (+56/−53). Leave it alone — it is not yours.

### Project Structure Notes

```
src/
├── shared/
│   ├── lib/  access.ts · access.test.ts        # NEW — verification + identity
│   └── ui/   AdminBar.tsx                       # NEW — .adminbar session strip
│             pml.css                            # MODIFIED — port .adminbar rules
│             index.ts                           # MODIFIED — export AdminBar
├── surfaces/admin/AdminShell.tsx                # MODIFIED — AdminBar + honest warn copy
├── server.ts                                    # MODIFIED — /api/admin/* guard
└── server.test.ts                               # MODIFIED — guard + public-route tests
docs/access-runbook.md                           # NEW — 1.5's executable checklist
src/access-env.d.ts                              # NEW — Env members (env.d.ts is generated)
wrangler.jsonc · wrangler.test.jsonc              # MODIFIED — run_worker_first
```

No variance from the architecture tree. `access.ts` sits in `shared/lib/` rather than a new `auth/` folder because the architecture's tree has no `auth/` and one module does not justify inventing one.

### Testing standards summary

- Vitest ~4.1.10, two projects; `npm test` runs both; baseline **67 tests, exit 0, zero cloud credentials** — do not regress that invariant
- This story's bar: exhaustive negative-path coverage on `verifyOperator` (AC2 lists nine failure modes — each gets a test), the non-operator-identity case (AC3), the dev-bypass gating (AC7), and the public-route regression guard (AC5)
- Mint JWTs locally with `jose.generateKeyPair` + `SignJWT`; stub `fetch` for the JWKS endpoint. No network in tests, ever
- Deeper coverage obligations continue at 3.3 / 3.6 / 3.11

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4] — story + original ACs (lines 341-355)
- [Source: _bmad-output/planning-artifacts/epics.md] — 3.10 (700-710), 3.12 (738-744), 3.13 (754-761), 4.6 (852-860), 2.9 (508-522); NFR6 line 135
- [Source: _bmad-output/planning-artifacts/architecture.md] — lines 181, 307, 515, 520, 544, 571, 627
- [Source: _bmad-output/planning-artifacts/ux-brief-pack.md#C] — admin surface requirements (238-253)
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-09.md] — m7 (317, 342, 376): Access IdP is 1.4's to record; M2 (305): why 1.5 exists
- [Source: .../design_handoff_pml/PML Admin.html:13-20, 78-82, 84-92, 94-100] — `.adminbar` CSS + markup + copy
- [Source: .../design_handoff_pml/README.md:176, 188, 196-197] — public-safe display name; "Authenticated. Deliberately lighter."
- [Cloudflare: JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) · [app token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/) · [app paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) · [self-hosted app prerequisites](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) · [Cloudflare IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/) · [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

## Open Questions for Patrick (do not block implementation)

1. **Operator email pinning.** AC3 compares `payload.email` against `env.OPERATOR_EMAIL`. Which address will the Cloudflare IdP authenticate — your Cloudflare account email, or something else? Needed as a secret in 1.5, not now; the code reads it from env either way.
2. **Session duration display.** The handoff shows `session 41m`. Task 7 omits it deliberately (no data source). Do you want it in 1.5 once Access sessions exist, or drop it permanently? A stale/fabricated timer on a provenance-thesis project is worse than no timer.
3. **Break-glass IdP.** Worth adding one-time PIN as a second login method in 1.5, in case of Cloudflare account lockout? ~3 clicks, no downside I can see, but it is a second door.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session

### Debug Log References

- **`.dev.vars` leaks into the Vitest environment — and it silently disarmed five tests.** After creating `.dev.vars` with `ACCESS_DEV_BYPASS = "true"`, five previously-passing `/api/admin/*` rejection tests began returning 404 instead of 403: `vitest-pool-workers` loads `.dev.vars` into the test env, so the bypass was active and the "unauthenticated" requests were sailing through the guard to the placeholder handler. The tests had been passing only because no `.dev.vars` existed yet. Fixed by constructing envs explicitly in `src/server.test.ts` (`anon` / `authed`) rather than passing the ambient `env`. **A test that asserts rejection must own the env it asserts against** — otherwise it passes or fails depending on whether the developer happens to have local dev configured.
- **`cloudflare:test` types sit behind a subpath export.** Adding `"@cloudflare/vitest-pool-workers"` to tsconfig `types` does not work — the package root resolves to the pool's own API. The declaration lives at `@cloudflare/vitest-pool-workers/types`. Also switched the import from the deprecated `cloudflare:test` `env` to `cloudflare:workers`, which the package's own `.d.ts` recommends.
- **Module-scope JWKS caching vs per-test keypairs.** The first run failed three happy-path cases because `beforeEach` minted a fresh keypair per test while `verifyOperator` caches one remote key set per team domain (correct production behaviour — constructing `createRemoteJWKSet` per request would refetch the JWKS on every call). Moved key generation to `beforeAll`, which is also what a real Access team domain looks like: a stable key set.
- **Live browser verification was NOT performed.** `npm run dev` still requires a live `CLOUDFLARE_API_TOKEN` because `wrangler.jsonc`'s `ai` binding is `remote: true` with no local simulation. Commit `b3dc307` solved this for the test suite only (via `wrangler.test.jsonc`); it did not solve it for the dev server. Admin chrome is verified through `renderToStaticMarkup` assertions instead. Story 1.5 should fix the dev-server path.

### Completion Notes List

- **Scope split honoured.** This story ships the Worker-side half only. No Zero Trust application was created, no AUD tag exists, no domain was bound. What is live is a verified perimeter around `/api/admin/*`; what is pending is Access at the edge (Story 1.5 — checklist in `docs/access-runbook.md`).
- **Verification is `aud`-pinned, not merely signature-checked.** `jwtVerify` is called with both `issuer` and `audience`. Without `audience`, a token minted for any other Access application on the same Cloudflare account would validate on signature and issuer alone, because the AUD tag is per-application. This is the single most load-bearing line in the module.
- **Authentication and authorization are separate gates (AC3).** A cryptographically perfect token for `someone.else@example.com` is rejected. Story 3.13 requires that non-operator identities cannot change gate mode, which "is authenticated" cannot satisfy on its own — both the token check and the `OPERATOR_EMAIL` allowlist must pass.
- **The guard is scoped by path prefix, never by method (AC5).** Story 2.9 adds a public `POST /api/poll/votes` and 4.5 a public correction POST; a "mutations require auth" guard would break both. Three tests pin that public routes — `/`, the `ops.` host, and a poll POST — stay untouched, and `/api/administrivia` is explicitly asserted not to match the `/api/admin` prefix.
- **The 403 leaks nothing.** `{ code: "forbidden", message }` with no `details`. "No token" and "valid token, wrong identity" are indistinguishable from outside; a test asserts the serialized body contains none of `jwt`, `token`, `aud`, `cloudflareaccess`, `email`, `stack`.
- **DEVIATION #2 from Task 8.** The task said to add the Env members to `env.d.ts`. That file is generated wholesale by `wrangler types` and would lose them on the next regeneration, so they went into a new hand-authored `src/access-env.d.ts` that merges into the same global interface. `env.d.ts` is untouched.
- **DEVIATION #1 from Task 4, deliberate and safer.** The story said to declare `ACCESS_DEV_BYPASS` in `wrangler.jsonc` top-level `vars`. I put it in `.dev.vars` instead. Reason: no Wrangler `env` blocks exist yet, so a plain `wrangler deploy` — exactly what `npm run deploy` runs — would have carried a top-level var straight to production with the bypass on. `.dev.vars` is gitignored (`.dev.vars*`) and read only by `wrangler dev`: never bundled, never deployed. Code review then showed that claim was still overstated — `wrangler dev --tunnel-name`, which this story's own runbook recommends, loads `.dev.vars` AND publishes a public hostname. The bypass is now additionally gated on a loopback `hostname`, and a config test asserts `ACCESS_DEV_BYPASS` appears in no Wrangler config.
- **`.adminbar` genuinely needed porting.** It was never in the handoff's shared `pml.css` — it lives in an inline `<style>` block at `PML Admin.html:13-20`, which is why Story 1.2's port did not pick it up. Five rules copied verbatim; no CSS invented.
- **Two honesty decisions in the chrome.** The handoff shows `· session 41m`; there is no source for that number until Access issues real sessions, so it is omitted and a test asserts no `session <digit>` string appears. And with no verified session yet, the strip reads "Not signed in" rather than showing a name the app cannot vouch for. The trust bar now reads "Admin APIs are verified; edge Access binding lands in Story 1.5" — claiming exactly the protection that exists, no more.
- **No sign-out control**, matching the handoff (verified by grep across the bundle) and asserted by test. Access owns session lifecycle; a button that did nothing would misrepresent who controls the session.
- **`run_worker_first` gained `/api/admin/*`** in both `wrangler.jsonc` and `wrangler.test.jsonc`. The `assets_navigation_prefers_asset_serving` compat flag is default-on at this repo's compatibility date, so asset-eligible requests can otherwise skip the Worker — and a skipped Worker is a skipped auth check. `/admin` was deliberately not added: the document leaks nothing and there is no edge Access to enforce yet.
- **Secrets confirmed absent from the client bundle (AC6).** Ran `vite build` and grepped `dist/client/` for `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS`, `cloudflareaccess` — no matches. `access.ts` is reached only from `server.ts`, never from a `surfaces/*` component.
- **Access IdP recorded: Cloudflare's own first-party IdP** (default for new Zero Trust orgs since 2026-06-18). Zero setup, no external OAuth app, no client secret, MFA inherited from the Cloudflare account. `docs/access-runbook.md` records the decision and notes that `architecture.md:627`'s Google/GitHub/OTP list predates this option and is stale. This closes one of the five deferred config values the readiness report (m7) homes to specific stories.
- **160 tests pass across 7 files, exit 0, with zero cloud credentials** after review patches and decisions (was 107/5 at first submission; baseline 67/4). 26 new in `access.test.ts`, 10 new in `server.test.ts`, and a net +4 in `shells.test.tsx` (5 added, 1 deleted — the old "not protected" assertion, superseded). `npx tsc` and `npx oxlint src/` both clean.
- **`npm run check` still fails repo-wide** on pre-existing CRLF line endings (no `.gitattributes`, `core.autocrlf=true`). Untouched — it belongs to Story 1.5's envelope work, and reformatting the tree would have buried this diff. Files authored by this story were formatted individually with `oxfmt --write`.
- **`ChatAgent` and the `/agents/*` route were not modified.** That unauthenticated surface remains a ledgered item owned by 1.5's deploy hardening; this story's title notwithstanding, that door is still open.

### File List

New:

- src/shared/lib/access.ts
- src/shared/lib/access.test.ts
- src/shared/lib/adminGuard.ts
- src/shared/ui/AdminBar.tsx
- src/access-env.d.ts
- docs/access-runbook.md
- .dev.vars (gitignored — local development only, intentionally not committed)

Modified:

- src/server.ts (admin perimeter runs before agent routing)
- src/server.test.ts (perimeter + public-route tests; explicit envs; cloudflare:workers import)
- src/surfaces/admin/AdminShell.tsx (AdminBar, operator prop, honest trust-bar copy)
- src/surfaces/shells.test.tsx (admin chrome assertions)
- src/shared/ui/index.ts (export AdminBar)
- src/shared/ui/pml.css (.adminbar rules ported from the handoff)
- wrangler.jsonc (run_worker_first gains /api/admin/*)
- wrangler.test.jsonc (kept in sync)
- tsconfig.json (vitest-pool-workers types subpath)
- package.json / package-lock.json (jose ^6.2.8)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status transitions)
- _bmad-output/implementation-artifacts/1-4-admin-access-protection.md (this file)

## Change Log

- 2026-08-10: Story implemented end-to-end (red/green on the verification module, then route guard, chrome port, runbook). Scope split per Patrick's decision — Worker-side layer here, Zero Trust binding deferred to 1.5. Access IdP decided (Cloudflare IdP). Status → review.
