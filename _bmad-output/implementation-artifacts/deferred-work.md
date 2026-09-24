## Deferred from: code review of 1-4-admin-access-protection.md (2026-08-10)

- ~~**AC4, display-name half:** the admin session strip renders "Not signed in" rather than the operator's name~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5 Part B):** closed the same day Access went live, since that is what it was waiting for. Took the `GET /api/admin/session` route of the two options, not server-rendered chrome: the app is a client-side SPA served from a prebuilt document, so adding `/admin` to `run_worker_first` would let the Worker see the request without giving it anywhere to inject a name ΓÇö that needs HTMLRewriter or an SSR pipeline, for one route. `/api/admin/*` already runs through the Worker and is already gated twice. `useAdminSession` fetches it and fails closed to "Not signed in" on every error path, including the 302-to-login that Access returns for an expired session. **Only `displayName` crosses the wire** ΓÇö never the email, which `access.ts` types as unsafe to render and which Story 3.13 would otherwise risk publishing on ops.
  - Two things went stale with it and were fixed in the same change: the admin chrome's warn chip still read "Not access-controlled ΓÇö anyone with this URL sees it", which had become the *opposite* falsehood once Access was bound; and its test carried an explicit "delete this only when Access is actually in front of /admin" instruction, whose condition had been met.

- ~~`/agents/*` and `ChatAgent`'s `@callable() addServer` remain fully unauthenticated~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5):** `/agents` and `/agents/*` now run through the same `requireOperator` guard as `/api/admin/*`, with the same opaque 403 and the same normalization against encoding/slash bypasses. The `ChatAgent` Durable Object is untouched ΓÇö Epic 3 builds on that wiring; only the door is locked.
- ~~`workers_dev` and `preview_urls` are not disabled in `wrangler.jsonc`~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5):** both set `false` at the top level (inheritable, so every environment gets them), stated explicitly rather than inferred from `routes` because the `preview_urls` default changed twice in wrangler 4.34/4.44.
- ~~AC6 (no Access config in the client bundle) rests on a one-time manual `grep` of `dist/`~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5):** `src/shared/lib/wranglerConfig.test.tsx` walks `dist/client/` and asserts no bundled file mentions `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS` or `cloudflareaccess`. Skips cleanly when `dist/` is absent; `npm run build && npm test` is the full check.
- No revocation awareness: a leaked Access JWT stays valid until `exp` even after the identity is removed in Zero Trust. Inherent to stateless verification; the runbook should document rotating `OPERATOR_EMAIL` as the break-glass step.
- Unauthenticated callers can trigger outbound JWKS fetches by spraying tokens with unknown `kid` values. Mitigated by jose's built-in fetch cooldown; revisit if a rate-limiting binding lands.
- `access.ts` sits in `src/shared/lib/`, which client surfaces already import from (`surface.ts`). Nothing structurally prevents a future surface importing `verifyOperator` and pulling `jose` plus the auth logic into the browser bundle. Wants a lint boundary rule.
- `src/access-env.d.ts` relies on being a global script for its `interface Env` declaration merge; one stray `import` turns it into a module and silently breaks the merge.

## Deferred from: code review of 1-3-dual-site-shells-trust-chrome.md (2026-08-10)

- ~~`oxfmt --check .` fails repo-wide because there is no `.gitattributes`~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5):** `.gitattributes` pins `* text=auto eol=lf`, the working tree was renormalized, and `npm run check` now exits 0 across all 48 files. Only four vendored BMAD CSVs had CRLF in the index; all project source was already LF, so there was no whole-tree history diff.

## Deferred from: code review of 1-2-design-tokens-core-trust-components.md (2026-08-10)

- EmptyState does not guard empty/whitespace `title` ΓÇö presentational primitive; callers own copy until a real empty-state surface lands.
- NotLiveDraftBanner has no `role="status"` / live-region semantics ΓÇö a11y enhancement beyond Story 1.2 ACs; revisit with admin/ops draft surfaces.
- ~~Google Fonts third-party load with no self-hosted fallback~~ ΓÇö **CLOSED BY DECISION 2026-08-10 (Patrick, during Story 1.5):** keep the Google Fonts CDN load. Not a defect; a deliberate choice recorded so it is not re-raised.
- RunStatusChip reader labels mostly untested beyond empty ΓåÆ ΓÇ£no material changeΓÇ¥ ΓÇö Task 8 only required class/enum contract; deepen when Run log UI ships.

## Deferred from: code review of 1-1-scaffold-cloudflare-agents-starter.md (2026-08-09)

- ~~Unauthenticated starter agent surface (chat + Workers AI + `@callable` MCP add/remove with no auth/allowlist)~~ ΓÇö **partially retired 2026-08-10 (Story 1.3):** the client chat UI is gone, so the surface is no longer reachable from the app. The `ChatAgent` Durable Object and its `/agents/*` route still exist in `src/server.ts` and remain **unauthenticated** ΓÇö still owned by Stories 1.4 (Access) and 1.5 (deploy hardening). Do not treat the scaffold demo agent as production-safe.
- ~~Starter HTML still titled "Agent Starter" / Cloudflare Agents description~~ ΓÇö **RESOLVED 2026-08-09 (Story 1.2):** `index.html` title and description are PML's.
- ~~Starter UI edge cases in `src/app.tsx`: blob URL leak on Chat unmount, Approve/Reject no-op when `approval.id` missing, send clears input before encode/send can fail, concurrent send while encoding, no attachment size/count caps, unguarded `mediaType`/`text` access, MCP connect failures only `console.error`~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.3):** the starter chat UI was deleted wholesale when `src/app.tsx` became the surface router. None of this code remains; the defects died with the template rather than being fixed. `@cloudflare/kumo`, `@phosphor-icons/react`, `streamdown` and `@streamdown/code` were removed with it.

## ~~Open from: Story 1.3 (2026-08-10)~~ ΓÇö CLOSED

- ~~`/admin` is reachable by anyone who knows the path until Story 1.4 wires Cloudflare Access... the route must not ship to a real domain unprotected.~~ ΓÇö **RESOLVED 2026-08-10 (Story 1.5 Part B).** The condition this entry set was met before the domain went live, in the order it demanded: 1.4 shipped the Worker-side verification, then 1.5 bound the domains and created the Access application in the same session, so `/admin` was never reachable unprotected on a real domain. Verified against production: `/admin` answers `302` to the Access login, and the admin chrome no longer claims to be unprotected.

## Deferred from: code review of 2-1-f1-data-model-apis-case-law-seed.md (2026-08-31)

- `npm run deploy` still publishes the repository SPA over the stable root landing page because `/preview/*` routing and a repository-owned landing document have not landed. This predates Story 2.1's migration-script change and remains governed by the explicit warning in `docs/deploy-runbook.md`; do not run a live deploy until that routing work is completed or the operator deliberately accepts the overwrite.
- ~~Story 2.2 must delete the unconditional launch-state `LaunchNote` before any later Epic 2 story wires a reader-facing band; otherwise its ΓÇ£views are not wiredΓÇ¥ copy would sit above live findings.~~ ΓÇö **RESOLVED 2026-08-31 (Story 2.2):** `LaunchNote.tsx` is deleted. Apex orientation is credibility ΓåÆ masthead ΓåÆ KPI ΓåÆ `#brief`; remaining bands stay EmptyState.
- Brand `Posture` and `OperationalStatus` at the TypeScript boundary so their shared `banned` literal cannot be passed between UI components. This is a cross-UI type refactor, not a Story 2.1 data-contract fix.
- ~~**[LOW][edge][Deferred to 2.5] No FTS index for Story 2.5's free-text case search.** Fine at seed scale; recorded for the story that implements search.~~ ΓÇö **RESOLVED 2026-09-01 (Story 2.5):** client-side AND-token match on the 25-row list payload. D1 FTS5 is postponed until `GET /api/cases` list-all is no longer sufficient.
- FR9's future `pending-primary` ingestion state still needs a first-class representation when the governed write pipeline lands. Every current seeded tracked claim has Tier-1 coverage, so no live row needs that state today.
- The ops and admin documents still have no `<h1>`. Their future chrome stories should fix the pre-existing outline gap without changing Story 2.1's apex-only UI.

## Deferred from: code review of 2-2-apex-orientation-chrome.md (2026-09-01)

- Founder portrait remains a `.plate` lettermark (`PB`) and the founder LinkedIn link is omitted. Both are the story's documented fallbacks until a real `public/assets/patrick-bland.jpg` and a real profile URL are supplied.

## Deferred from: code review of 2-3-circuit-split-heat-map.md (2026-09-01)

- ~~`history.replaceState` writes `?state=` / `?circuit=` but does not listen for `popstate`. Story 2.4 owns board sync and can attach Back/Forward traversal if the shareable URL contract needs it.~~ ΓÇö **RESOLVED 2026-09-01 (Story 2.4):** `useApexSelection` now listens for `popstate` and re-runs `nextApexSearch`; clicks still use `replaceState`.

## Deferred from: code review of 2-4-state-status-board-synced-with-map.md (2026-09-01)

- Failed or empty F1 list still prints "0 of 0 tracked states" with absence-is-not-a-finding copy. `useCircuitData` fail-closes to `states: []` and `listsReady: true`; the map already had this empty-list path. Distinguish fetch-fail from "nothing tracked" when a later story owns list-error chrome.

## Deferred from: code review of 2-5-case-list-detail-rich-filters.md (2026-09-02)

- `useCircuitData` `load()` still uses `items.every(guard)`, so one invalid `/api/cases` item discards the whole list (same helper as circuits/states). Empty `caseIds` then cannot constrain `?case=`.
- `listCases` `CaseListItemSchema.parse`s every assembled row in one pass; one invalid `case_role` 500s `GET /api/cases`. Same all-or-nothing parse as the other F1 list repos.
- `/api/cases` (and the sibling F1 list fetches) have no timeout; a hung request leaves `listsReady` false so invalid `state` / `circuit` / `case` params are never stripped.

## Deferred from: code review of 2-6-issue-map-synced-to-cases.md (2026-09-02)

- Client `isCase` still uses `items.every(guard)`, so one invalid `/api/cases` item discards the whole list. Story 2.6 added `firstOccurredAt === null || typeof string` to that guard, so a mixed-deploy or cached payload missing the new field now fails the same all-or-nothing check. Same 2.5 blast radius; do not change the `every()` contract here.

## Deferred from: code review of 2-7-entity-ledger.md (2026-09-02)

- Entity tests pin `selectionFromEntityMatter` / `selectionForState` and static ΓÇ£Open case recordΓÇ¥ markup instead of clicking `commit`. Epic 2 UI tests are `renderToStaticMarkup` only; there is no click driver and Story 2.7 forbids a new npm dependency. Revisit if a later story adds a harness.

## Deferred from: code review of 2-8-qualitative-cert-signal.md (2026-09-02)

- Seed `methodNote` is now public `#cert` copy and still says the reading was ΓÇ£Seeded qualitatively from the Aug 9, 2026 case-law survey corpus (docs/research/)ΓÇ¥. Story 2.8 was required to print D1 `methodNote` and not migrate; rewrite the seed sentence if the public gauge should not name a repo path.
- Apex top-nav still labels `#cert` as ΓÇ£Cert signalΓÇ¥ after the band title became ΓÇ£Certiorari likelihoodΓÇ¥. The nav string is pre-2.8 chrome; this story only rewrote the SectionBand title.

## Deferred from: code review of 2-9-reader-cert-poll-tally-api.md (2026-09-03)

- **Unthrottled anonymous INSERT endpoint allows ballot stuffing.** `POST /api/poll/votes` mints a fresh `crypto.randomUUID()` token per cookieless request and inserts unconditionally; a script can insert unbounded rows and inflate the public tally. — **ACCEPTED (Patrick, 2026-09-03):** it is an unscientific reader poll, and the identity options that would stop stuffing (IP columns, fingerprinting, reader accounts) are all forbidden by FR44/A7/NFR11. Revisit only if stuffing becomes visible; a Cloudflare rate-limit rule on the path is the no-code lever if it does.

## Deferred from: code review of spec-3-3-daily-run-workflow-empty-runs.md (2026-09-09)

- Persist FR27 `next_run_at` + timezone on a run or config row so 3.7 can render "next run" without recomputation. `nextRunAtUtc` / `RUN_SCHEDULE_TIMEZONE` exist; nothing writes them. Story 3.3 task allowed deferral to 3.7.
- Catch-up / manual Runs have `ensureRun` origins but no production trigger. 3.12 owns operator loop controls.

## Deferred from: code review of spec-3-4-source-monitoring-draft-packaging.md (2026-09-09)

- Live connector hang / timeout: stubs return immediately; add a deadline when HTTP fetches land.

## Deferred from: code review of 2-10-trust-furniture-donations-ops-handoff.md (2026-09-03)

- **Donation placeholder is a silent dead anchor.** `DONATE_URL = "#coffee"` matches no element, so "Buy me a coffee" (trust CTA) and "Support the project" (footer) do nothing on click with no reader-visible hint. — **DEFERRED (Patrick, 2026-09-03):** pending his choice of donation service (Story 2.10 Open Question 1). When the service is picked, wire the real URL and decide whether the CTAs need a visible "donations not open yet" treatment in the meantime.

## Deferred from: code review of spec-3-1-run-draft-evidence-data-model.md (2026-09-10)

- Epic context still names chip statuses `awaiting-approval` / `budget-stopped` and evidence event `run.budget_stopped`, while 3.1 locked `awaiting` / `stopped` / `run.stopped` to match `RunStatusChip`. Fix would edit the compiled epic context; later stories already used the locked strings.
- `listRuns` orders by `started_at DESC` but `0006` only indexes `runs(status)`. Fine at empty-table foundation; add a `started_at` index when 3.7’s public log is the hot path.

## Deferred from: code review of spec-3-2-ai-gateway-budget-envelope-role-model-config.md (2026-09-10)

- Frozen Never requires `gateway.config_changed` on `setRoleModel`, but that event is not in the closed Evidence vocabulary and `evidence_events.run_id` is NOT NULL. 3.8 projector and 3.12 operator config UI own audited config changes; version bump remains the 3.2 audit record.
- Migration 0007 creates empty `gateway_config` with no seed row or default role→model mappings. 3.12 operator loop controls stand up the live config; empty table stays fail-closed as `role_not_configured`.

- Successful LLM calls live in `llm_calls`, not `evidence_events`. 3.8 projector owns the public Evidence projection; 0007 already treats `llm_calls` as the spend ledger.
- `setRoleModel` last-write-wins the whole `roles_json`. No concurrent config writers until 3.12 operator controls; version bump is already atomic.
- `GatewayInput` is `prompt` only (no `messages`). Workers AI text path this story; chat-shaped input belongs to a later provider/chat story.
- Config `provider` is never matched to the injected `LlmProvider`. Single Workers AI binding this story; revisit when OpenRouter is wired.
- Budget check is prior ledger `spend >= budget`, not “this call would push over.” First-pass #1; zero-dollar Workers AI cannot overshoot; paid provider story.
- Provider `complete` / `AI.run` has no timeout. Same family as the Epic 2 hung-fetch deferral; timeout duration is a product choice.
- `llm_calls.currency` hardcoded `USD` instead of `run.spendCurrency`. First-pass #6; USD-only this story.
- `run.stopped` evidence is a raw INSERT, not `evidenceRepo`. First-pass #7; 3.8 projector owns Evidence writes.

## Deferred from: code review of spec-3-8-evidence-detail-projection.md (2026-09-11)

- Hung first GET on `/runs/:id` has no client timeout — `AbortController` is unmount-only, so a hung `GET /api/runs/:id` leaves the page chrome-only with an empty body. Same Epic-2 hung-fetch family (epic-2 retro item 4, owner: agent, open); timeout duration is the unchosen product decision. Also recorded in the spec's frontmatter `deferred` (severity: medium). [src/surfaces/ops/EvidenceDetail.tsx:449]

## Deferred from: code review of spec-3-9-public-pending-drafts-not-live.md (2026-09-12)

- Hung `GET /api/drafts` has no client timeout — `useDrafts` AbortController is unmount-only, so a hung list request leaves the `#drafts` band blank (`drafts === null` → `return null`). Same Epic-2 hung-fetch family as 3.7 RunLog and 3.8 EvidenceDetail (epic-2 retro item 4, owner: agent, open); timeout duration is the unchosen product decision. [src/surfaces/ops/PendingDrafts.tsx:88]

## Deferred from: code review of spec-3-16-conversational-draft-revision.md (2026-09-17)

- Second revise (r2+) has no end-to-end test — less common operator path; first revise fully covered. [`src/pipeline/steering/submitTurn.test.ts`]
- No live-browser `/admin#queue` → ops. Evidence round-trip — jsdom/HTTP-unit coverage matches 3.15 harness.

## Deferred from: code review of spec-3-12-operator-loop-controls.md (2026-09-13)

- LoopControls 4s poll while running/awaiting is never timer-asserted — first paint is SSR-tested; EvidenceDetail-style fake-timer mount deferred (also in spec frontmatter). [src/surfaces/admin/LoopControls.tsx:138]
- Trigger fetch has no timeout; hung POST leaves Run now disabled — Epic-2 hung-fetch family; ApprovalQueue has the same gap (also in spec frontmatter). [src/surfaces/admin/LoopControls.tsx:160]
- DailyRunWorkflow attach-run void/non-id fallback untested under Workflow step-cache replay — no WorkflowEntrypoint replay fixture in repo unit style; id-pinned helpers cover the non-replay path. [src/pipeline/workflow/dailyRun.ts:192]

- source_spec: `spec-3-18-standing-corrections-durable-guidance.md`
  summary: Best-effort `guidance.recorded` / `guidance.revoked` Evidence after the `standing_guidance` row has no partial-failure test (same for 3.17's `config.steered` catch); a lost receipt is silent while HTTP says ok.
  evidence: No DB fault-injection harness exists in the repo (only `vi.spyOn` use is `actionPolicy.test.ts`); closing this needs a shared failing-batch helper used by both 3.17 and 3.18 catches, plus a `console.warn` in each catch so the gap is discoverable in logs. [src/pipeline/steering/submitTurn.ts]

## Dispositions: sprint-change-proposal-2026-09-17 (Epic 3 clean-up, approved 2026-09-17)

Ledger entries above are not edited; this block records where each Epic 3 entry went.

- [closed-resolved] 3.3 catch-up/manual Runs no production trigger — 3.12 `POST /api/admin/runs` (`server.ts:79`)
- [closed-resolved] 3.2 `run.stopped` raw INSERT — `gateway.ts:164` uses `appendStmt`
- [closed-resolved] 3.3 persist `next_run_at` — 3.7 computes via `nextRunAtUtc` by design
- [closed-resolved] 3.16 live-browser round-trip — superseded by the first material Run (→ 3.21)
- [closed-resolved] 3.2 `setRoleModel` last-write-wins — single operator; `version` bump atomic
- [closed-accepted] 3.2 no `gateway.config_changed` Evidence — `version` bump is the audit; config is global, Evidence is per-Run
- [closed-accepted] 3.2 `llm_calls.currency` hardcoded USD
- [closed-accepted] 3.2 `GatewayInput` prompt-only
- [closed-accepted] 3.2 successful LLM calls in `llm_calls`, not `evidence_events`
- [closed-accepted] 3.12 LoopControls 4 s poll never timer-asserted
- [closed-accepted] 3.12 attach-run replay fallback untested — staging cron exercises it
- [→ 3.19] 3.4 connector hang — 60 s deadline
- [→ 3.19] 3.2 provider `complete` / `AI.run` no timeout — 60 s deadline
- [→ 3.19] 3.8 `GET /runs/:id` no client timeout — 15 s
- [→ 3.19] 3.9 `GET /api/drafts` no client timeout — 15 s
- [→ 3.19] 3.12 trigger POST / ApprovalQueue no timeout — 30 s
- [→ 3.19] 3.2 empty `gateway_config` — migration 0017 seed (Workers AI, 500¢)
- [→ 3.19] 3.1 `runs(started_at)` index — migration 0017
- [→ 3.19] 3.1 epic-context stale identifiers — fixed 2026-09-17 in `epic-3-context.md`
- [→ 3.19] 3.18 / 3.17 best-effort Evidence untested — `console.warn` + shared failing-batch helper
- [→ 3.19] 3.16 second revise (r2+) untested — e2e case
- [→ 3.20] 3.2 config `provider` never matched to injected `LlmProvider`
- [→ 3.20] 3.2 budget check `spend >= budget` vs would-push-over
- [→ Epic 2 item 7] 2.10 `DONATE_URL` dead anchor — interim "Donations open soon" copy in 3.19; real URL is Patrick's decision

## Deferred from: code review of spec-3-19-epic-3-hardening-timeouts-gateway-seed.md (2026-09-18)

- source_spec: `spec-3-19-epic-3-hardening-timeouts-gateway-seed.md`
  summary: `withDeadline` never cancels the underlying work — `LlmProvider.complete` and `SourceCheck` receive no `AbortSignal`, so a timed-out `env.AI.run` keeps running (and metering) and a hung connector keeps fetching in the background.
  evidence: Both seams take only `{ model, prompt }` / `(source)`; adding a signal widens the provider contract (3.20 OpenRouter) and the connector contract (3.21 first live connector). [src/pipeline/ai/gateway.ts, src/pipeline/connectors/connector.ts]
- source_spec: `spec-3-19-epic-3-hardening-timeouts-gateway-seed.md`
  summary: Sequential per-source connector deadlines (60 s each) and per-Draft provider deadlines can exceed the Workflows step default of 10 minutes on a steered list of 10+ hung sources; a step timeout bypasses `packageDailyRun`'s catch so the Run is never marked `failed`.
  evidence: Cloudflare docs (workflows/build/sleeping-and-retrying): default `WorkflowStepConfig` is `timeout: "10 minutes"`, `retries: { limit: 5, backoff: "exponential" }`; `dailyRun.ts` passes no step config. 4 seed sources today. 3.21 should either run connectors in parallel or set an explicit step `timeout` and mark the Run failed from the Workflow catch. [src/pipeline/workflow/dailyRun.ts:219]
- source_spec: `spec-3-19-epic-3-hardening-timeouts-gateway-seed.md`
  summary: `PendingDrafts` and `RunLog` hung-GET → designed empty state has no mount test (only `EvidenceDetail` covers the ops GET pattern).
  evidence: `pendingDrafts.mount.test.tsx` and `runLog.test.tsx` script resolved responses only; both sites are one-line repeats of the tested `EvidenceDetail` pattern. [src/surfaces/ops/PendingDrafts.tsx, src/surfaces/ops/RunLog.tsx]
- source_spec: `spec-3-19-epic-3-hardening-timeouts-gateway-seed.md`
  summary: The 0017 idempotence test re-runs its own `INSERT … DO NOTHING`, not the migration's text, so `INSERT OR REPLACE` creeping into 0017 would pass the suite.
  evidence: D1 applies each migration once via `d1_migrations`, so the re-run only arises with a hand-seeded row; to pin, read the `0017` entry from `env.TEST_MIGRATIONS` in `gatewaySeed.test.ts`, steer the row via `setRoleModel`, re-apply, assert unchanged. [src/pipeline/workflow/gatewaySeed.test.ts]

## Deferred from: code review of spec-3-21-first-live-connector.md (2026-09-18)

- source_spec: `spec-3-21-first-live-connector.md`
  summary: `DailyRunWorkflow.run` passing `sourceChecksFromEnv(env, db)` into `packageDailyRun` has no executing test; deleting the argument would silently make every production Run report CourtListener as "not wired" with the suite green.
  evidence: The repo has no Workflow-entrypoint harness (only `server.test.ts` checks the export exists); `dailyRun.test.ts` calls `packageDailyRun(..., sourceChecksFromEnv(...))` directly. The spec's manual check (`Run now` on `build.*` → ops. `/runs/:id` shows `source.fetched` for CourtListener) is the stated verification; a fake-`step` harness would close it. [src/pipeline/workflow/dailyRun.ts:242]

## Deferred from: code review of spec-3-20-openrouter-provider-via-ai-gateway.md (2026-09-22)

- source_spec: `spec-3-20-openrouter-provider-via-ai-gateway.md`
  summary: OpenRouter gateway path `/openrouter/chat/completions` vs `/openrouter/v1/chat/completions` is unverified. Code and tests pin the spec's prose/SDK form; a live 404 on the other form would not be caught.
  evidence: Cloudflare OpenRouter docs (updated 2026-04-20) say replace `https://openrouter.ai/api/v1/chat/completions` with `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openrouter/chat/completions`, and the OpenAI SDK `baseURL` is `…/openrouter` (SDK appends `/chat/completions`). The same page's cURL posts to `…/openrouter/v1/chat/completions`. A live POST to both paths settles it. [src/pipeline/ai/gateway.ts:422]

## Deferred from: code review of spec-3-23-fail-a-total-courtlistener-outage.md (2026-09-24)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-23-fail-a-total-courtlistener-outage.md`
  summary: Error-body scrubbing redacts only the exact API token string.
  evidence: Unverified whether a CourtListener error body can echo the token URL-encoded, prefixed, or in another case. A captured 400 body that contains the token in a non-exact form would prove a public Evidence leak. [src/pipeline/connectors/courtListener.ts]
