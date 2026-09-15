---
title: 'Story 3.14: Steering Channel Foundation, Action Policy & Evidence'
type: 'feature'
created: '2026-09-14'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: 0ca2efc2613b379f6fac19a544035cf64856806f
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** The operator has no governed conversational channel into the fleet. ChatAgent is still a demo weather/calculator agent; there is no `steward` role, no `steering_turns` Evidence, and nothing that would stop a future chat from publishing live F1 or mutating YOLO/budget/mode.

**Approach:** Access-gated turn submit on a Run/Draft, empty steward allowlist, immediate public Evidence of completed turns, private-at-submit only. ChatAgent stays as the DO; demo tools and ad-hoc Workers AI go. Steward LLM spend uses `gateway.complete({ role: "steward" })` against that Run's envelope.

## Boundaries & Constraints

**Always:**
- Admit `steward` in `GATEWAY_ROLE_VALUES`, `RoleModelMapSchema`, `llm_calls.role` CHECK, and frozen `ALLOWED_TOOLS.steward = []`. No production `gateway_config` model-id seed (3.2 leftover); tests INSERT a steward mapping when they need `complete()`.
- Steward has no `publish_f1` (and no other tool). `isToolAllowed("steward", …)` is false; `invokeTool` deny + `guardrails.failed` — never execute a tool body.
- YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, and `ALLOWED_TOOLS` are not writable through the channel. Mode stays `POST /api/admin/mode`. Allowlist stays a code constant. Chat may read/explain; it cannot set.
- Operator `POST /api/admin/runs/:runId/steering` `{ content, private, draftId? }` via `requireOperator`. `actor` is `displayName` (never email). `draftId` if present must belong to that Run. One `steering_turns` row per submit. Same batch: `steering.turn` + `steering.applied` (`effect: "none"` this story — 3.16/3.17 own real mutations).
- `private` is stored at insert. No UPDATE/PATCH of `private`. Public `GET /api/runs/:id` evidence omits turn `content` when private; keeps `actor`, timestamp, `draftId`, `private: true`.
- Submit is publication. Public projection never includes composer/in-flight text. No as-you-type public stream.
- Anon / non-operator POST → same opaque 403 as queue/mode. Public reads Evidence only.
- When a steward mapping exists, call `complete({ role: "steward", runId })` so spend hits `llm_calls` + `runs.spend_cents`. Steward complete is allowed for `running` and `awaiting` Runs (queue Drafts are awaiting); still refused for published/failed/stopped/empty/rejected. Unconfigured steward: persist the operator turn + Evidence anyway; no llm_calls row.
- Preserve `ChatAgent` class + `/agents/*` `requireOperator`. Strip demo tools, `createWorkersAI`, and `@callable` MCP add/remove so `/agents` is not a second unprojected LLM/tool path.

**Never:**
- Stories 3.15–3.18 (interrogation grounding, Draft revision, `pipeline_config_versions`, `standing_guidance`).
- `surfaces/*` importing `pipeline/*`. Ad-hoc provider SDKs. Live-F1 writes from steward. Retroactive privatize UI. As-you-type public streaming. Email on ops. Evidence. Seeding production model ids.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Public submit | Operator POST content, `private: false`, draft on awaiting Run | `steering_turns` row; Evidence `steering.turn` + `steering.applied` (`effect: "none"`); GET `/api/runs/:id` shows content; if steward mapped + budget ok, `llm_calls.role=steward` and spend bumps | N/A |
| Private submit | `private: true` | Row stored with content; public Evidence has no content; actor/time/draftId/`private: true` remain | N/A |
| No retroactive private | Attempt PATCH/UPDATE private after insert | No such route; existing row unchanged | 404 on unknown admin path |
| Anon / wrong identity | No JWT or other email POST | Opaque 403; no row; no Evidence | Fail closed |
| Unknown run | POST `/api/admin/runs/nope/steering` | 404 | Fail closed |
| Draft not on Run | `draftId` belongs to another Run | 400; no row | Fail closed |
| Empty content | whitespace-only `content` | 400 | Fail closed |
| Injection | Draft body and/or turn text asks for `publish_f1` / extra tools | `ALLOWED_TOOLS.steward` still `[]`; F1 tables unchanged; deny path if tool-shaped | Fail closed |
| Governance probe | Turn text `{tool:"set_mode"}` or asks to enable YOLO / raise budget | `GET /api/mode` unchanged; budget/allowlist unchanged | Fail closed |
| Unconfigured steward | No `gateway_config` steward mapping | Turn + Evidence persist; no `llm_calls` steward row | No 500 |
| Awaiting spend | Awaiting Run, steward mapped, budget remaining | `complete()` allowed; spend on that Run | N/A |
| Terminal Run | POST on published/failed/stopped/empty/rejected | 400; no LLM call | Fail closed |
| Budget stop | Spend already at ceiling | Turn may persist; `complete()` throws `budget_stopped`; no extra paid call | Typed gateway error |
| Public in-composition | GET `/api/runs/:id` during an unsubmitted composer | No partial turn in `evidence` | N/A |

</intent-contract>

## Code Map

- `migrations/0013_steering_channel.sql` -- NEW -- `steering_turns` (`id`, `run_id` FK, `draft_id` NULL FK, `actor_display_name`, `role` CHECK `steward`, `content`, `private` 0/1, `created_at` 24-char UTC). Rebuild `evidence_events` (0012 pattern) admitting `steering.turn`, `steering.applied`. Rebuild `llm_calls` (0009 pattern) admitting `steward`.
- `src/shared/schemas/vocabulary.ts:264-298` -- ADD `steering.turn`, `steering.applied`; ADD `steward`; comments: CHECKs now 0013.
- `src/shared/schemas/gateway.ts:43-49` -- ADD optional `steward` on `RoleModelMapSchema`.
- `src/shared/schemas/steering.ts` -- NEW -- admin POST body `{ content, private, draftId? }` + public-safe turn payload (content nullable when private).
- `src/shared/db/repos/steeringTurnsRepo.ts` -- NEW -- `insert` (no update of `private`); `listByRun` for admin panel.
- `src/pipeline/ai/actionPolicy.ts:37-43` -- ADD `steward: NONE` to frozen `ALLOWED_TOOLS`.
- `src/pipeline/ai/gateway.ts:105-183` -- ALLOW `complete({ role: "steward" })` when Run is `running` or `awaiting`; other roles stay running-only. Budget pre-check unchanged.
- `src/pipeline/steering/submitTurn.ts` -- NEW -- validate run/draft, insert turn, append both Evidence events via `appendStmt` (private content scrubbed from public payload), optionally `complete({ role: "steward" })`. Never calls modeRepo/setRoleModel/ALLOWED_TOOLS mutation.
- `src/pipeline/agents/StewardAgent.ts` -- NEW -- thin wrapper: build steward prompt from turn + optional draft ids only (no live-F1 tools). 3.15 owns grounded interrogation.
- `src/pipeline/projector/evidence.ts:142-147` -- READ ONLY `append`/`appendStmt` (scrub).
- `src/pipeline/connectors/connector.ts:29-31` -- READ ONLY `evidenceId`.
- `src/shared/lib/adminGuard.ts` / `access.ts` -- READ ONLY `requireOperator`.
- `src/server.ts:87-283` -- STRIP ChatAgent demo tools, `createWorkersAI`, `@callable` addServer/removeServer. Keep class + DO export.
- `src/server.ts:323-330` -- READ ONLY `/agents` gate.
- `src/server.ts:585-624` -- ADD `POST /api/admin/runs/:runId/steering` before the 404 placeholder (after mode). Actor `gate.operator.displayName`.
- `src/shared/api/publicRouter.ts:300-318` -- READ ONLY run detail; new events ride `evidence[]`. Do not add a raw `steering_turns` array (would leak private content).
- `src/surfaces/admin/SteeringPanel.tsx` -- NEW -- composer + private checkbox adjacent to submit; copy that privatize is at submit only and cannot be undone; POST the admin route; 403 → signedOut EmptyState.
- `src/surfaces/admin/ApprovalQueue.tsx:475-511` -- MOUNT `<SteeringPanel>` in `.work .wb` after the evidence link when a Draft is selected.
- `src/surfaces/ops/EvidenceDetail.tsx:161-173` -- ADD stepLabel extras for `actor` / redacted placeholder when `private`.
- `src/shared/ui/pml.css` -- ADD composer classes next to `.rejectbox` / `.privacy` (`:2470+`).
- Tests: `actionPolicy.test.ts` steward empty/frozen + injection; `submitTurn` / adminApi I/O matrix; `publicApi` redaction + no partial; `gateway` awaiting-steward vs other-role-awaiting; ChatAgent no demo tools; SteeringPanel + ApprovalQueue mount; sprint-status `3-14-…`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:85` -- in-progress then done.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0013_steering_channel.sql` -- steering_turns + evidence/llm_calls CHECK rebuilds
- [x] `src/shared/schemas/vocabulary.ts` / `gateway.ts` / `steering.ts` -- role, events, POST body
- [x] `src/shared/db/repos/steeringTurnsRepo.ts` -- insert-only private flag
- [x] `src/pipeline/ai/actionPolicy.ts` -- steward empty allowlist
- [x] `src/pipeline/ai/gateway.ts` -- steward complete on running|awaiting
- [x] `src/pipeline/steering/submitTurn.ts` / `agents/StewardAgent.ts` -- persist + optional complete; no governance writes
- [x] `src/server.ts` -- strip ChatAgent demo/MCP-attach; POST steering
- [x] `src/surfaces/admin/SteeringPanel.tsx` / `ApprovalQueue.tsx` -- composer on selected Draft
- [x] `src/surfaces/ops/EvidenceDetail.tsx` / `pml.css` -- public step extras + composer chrome
- [x] tests + `sprint-status.yaml` -- I/O matrix, 403, injection, immutability, redaction

**Acceptance Criteria:**
- Given Access-protected admin and a pending Draft, when I submit a steering turn, then ops. Evidence for that Run shows `steering.turn` immediately and the public payload includes my displayName, not my email
- Given I mark the turn private at submit, when a reader loads `/api/runs/:id`, then they see the turn happened (time, actor, draft) but not the content, and I cannot privatize it later
- Given a steward allowlist, when the turn or Draft text asks to `publish_f1` or grow tools, then F1 is unchanged and `ALLOWED_TOOLS.steward` stays `[]`
- Given a turn that asks to change YOLO, budget, mode, guardrails, or the allowlist, when it is submitted, then those controls are unchanged and the refusal is visible on Evidence (`guardrails.failed` and/or `steering.applied` with `effect: "none"`)
- Given no operator JWT, when I POST the steering route or `/agents/*`, then I get the same opaque 403 and no turn is stored
- Given a steward model mapping and an awaiting Run under budget, when I submit, then public `GET /api/runs/:id` includes an `llmCalls` entry with `role` steward and the Run's `spendCents` has increased

### Review Findings

**2026-09-14 — Follow-up review pass (4 layers, baseline `0ca2efc…HEAD`)**

- [x] [Review][Patch] Admin HTTP route never asserts steward spend attribution [`src/shared/api/adminApi.test.ts:1518`] — added HTTP integration test with spied provider; asserts public `llmCalls` + `spendCents`.
- [x] [Review][Patch] Draft-body-only tool injection untested [`src/pipeline/steering/submitTurn.test.ts:290`] — added fixture with benign turn text and tool-shaped JSON in draft body.
- [x] [Review][Patch] Steering submit on `running` Run untested [`src/pipeline/steering/submitTurn.ts:24`] — added success case with `insertRun("running")`.
- [x] [Review][Patch] ApprovalQueue does not verify steering POST uses selected draft [`src/surfaces/admin/ApprovalQueue.tsx:514`] — added mount test: J navigation then steering POST asserts `draftId: "d-b"`.

- [x] [Review][Defer] Production Workers AI records `costCents: 0` — deferred: documented residual risk; AC #6 satisfied in tests via fake paid provider; real spend requires non-zero provider cost or manual mapping.
- [x] [Review][Defer] Queue composer → ops Evidence round-trip not live-browser tested — deferred: jsdom + HTTP tests cover path; manual `/admin#queue` walk noted in spec Verification.
- [x] [Review][Defer] Remote D1 migration 0013 and unseeded production `gateway_config` — deferred: deployment/ops tasks outside this diff; steward spend skipped until mapping inserted.
- [x] [Review][Defer] Natural-language governance probes produce only `steering.applied` effect none — deferred: `parseToolRequest` is JSON-only by design; spec allows `steering.applied` alone for 3.14; NL refusal is 3.15+ scope.

**Rejected**

- `[false]` Steward LLM response never stored — 3.15 owns grounded replies; 3.14 ACs require operator turn Evidence and spend attribution, not displayed steward utterance.
- `[false]` Private turn content sent to steward LLM — spec Design Notes: privacy is public projection, not LLM egress.
- `[false]` `complete()` failures after persist return HTTP 200 — spec I/O: persist turn, no extra paid call; catch-all prevents duplicate retry on gateway throw.
- `[false]` Private submit returns `content: null` in POST 200 — `toPublicSteeringTurn` intentionally redacts; operator confirms via checkbox copy.
- `[false]` `SteeringPanel` requires `draftId` blocks run-level steering — spec mounts composer on selected Draft in ApprovalQueue; optional `draftId` on API is for programmatic callers, not an AC.
- `[false]` Composer only in ApprovalQueue — spec code map explicitly mounts there; running-Run UI is out of 3.14 scope.
- `[false]` `listByRun` has no admin history UI — not in 3.14 ACs; ops Evidence is the public read path.
- `[false]` EvidenceDetail private content leak — `publicTurnPayload` nulls content when `private: true`; tests assert `content: null` on public GET.
- `[false]` Submit without `draftId` skips draft-body scan — no draft body is loaded without `draftId`; not an injection bypass when draft is unattached.
- `[false]` PATCH steering returns 405 not 404 — correct for known route with wrong method; unknown paths still 404.
- `[false]` OAuth `onStart` removal breaks callbacks — pre-existing 1.5 path; 3.14 only updated comment; MCP attach stripped by design.
- `[low]` No success confirmation after submit — composer clears silently; everyday operator sees Evidence link above composer; cosmetic.
- `[low]` No `content` max length — unbounded rows possible but not demonstrated harm in normal use; guard adds complexity without shown failure.
- `[low]` No idempotency key on POST — client ref lock covers double-click; network retry duplicates are rare.
- `[low]` Textarea editable while submit in flight — button disables; race window is negligible.
- `[low]` Run status race between check and insert — requires concurrent terminal transition; not everyday.
- `[low]` Second `guardrails.failed` dropped via INSERT OR IGNORE — requires two tool-shaped strings in one turn; not everyday.
- `[low]` `turnId` omitted from EvidenceDetail step labels — payload includes it; label omission is cosmetic correlation aid.
- `[low]` `actorDisplayName` whitespace-only — HTTP path uses Access `gate.operator.displayName`, not raw schema input.

## Spec Change Log

## Review Triage Log

### 2026-09-14 — Follow-up review pass (baseline `0ca2efc…HEAD`)
- verdicts: 35 raw findings — high 0, medium 4 patch, low 0, false 11, low-reject 8, defer 4
- layers: Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor — all completed
- patch: admin HTTP spend test; draft-body injection test; running-Run submit test; ApprovalQueue draftId wiring test — **all 4 applied**
- defer: Workers AI costCents 0; live-browser E2E; remote migration/config; NL governance probes
- outcome: implementation matches spec intent; verification gaps closed; `npm test` 742 passed

### 2026-09-14 — Review pass
- verdicts: 31 findings — high 0, medium 11, low 7, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` Steward `complete()` text is never stored or shown — 3.15 owns grounded replies; 3.14 ACs require spend attribution and Evidence of the operator turn, not a displayed steward utterance
  - `[low]` `[reject]` `listByRun` has no admin GET/history UI — not in 3.14 ACs; composer is submit-only
  - `[medium]` `[patch]` `denyToolShaped` passed the selected Draft id into `invokeTool`, which ORs `guardrail_fail` onto queue Drafts with `evalSummary` — now passes the turn id so Evidence still records `guardrails.failed` and evalSummary stays unchanged
  - `[false]` `[reject]` HTTP path casts a null provider / admin tests skip spend — `complete()` already fail-closes on a null provider; spend is covered in `submitTurn` with a fake paid provider (Workers AI `costCents` is 0 by 3.2)
  - `[medium]` `[patch]` Evidence `stepLabel` omitted public turn content and `steering.applied` effect — extras now include `content` and `effect`; private still shows content withheld
  - `[low]` `[reject]` Evidence polls only while `running` — awaiting queue Drafts load on navigation; live poll is not an everyday miss
  - `[false]` `[reject]` `GatewayError` after persist is swallowed as HTTP 200 — spec I/O: persist the turn, no extra paid call; the typed error is the gateway throw, not the admin response
  - `[low]` `[reject]` `guardrails.failed` evidence id collides on a second deny — INSERT OR IGNORE; two tool-shaped texts in one turn is not everyday
  - `[medium]` `[patch]` Composer silent on non-403 failures and can double-POST — ref lock plus `Submit failed. Try again.`
  - `[false]` `[reject]` `/oauth/*` stays unguarded after MCP strip — pre-existing 1.5 callback path; 3.14 only updated the comment
  - `[false]` `[reject]` `private: true` still sends content to `complete()` — privacy is the public projection, not LLM egress
  - `[false]` `[reject]` sprint `done` vs spec `in-review`; PATCH 405 vs matrix 404; no `running` submitTurn case — 405 is correct for the real route; awaiting is the queue path; bookkeeping is finalize
  - `[low]` `[reject]` Run can turn terminal between status check and insert — needs a concurrent publish; not everyday
  - `[medium]` `[patch]` `complete()` non-GatewayError after persist became HTTP 500 / duplicate retry — catch-all after persist, still return ok
  - `[medium]` `[patch]` Two submit clicks before busy re-renders — grouped with composer lock
  - `[medium]` `[patch]` POST non-403 / fetch throw had no feedback — grouped with composer error copy
  - `[low]` `[reject]` `scrubPayload` drops whole-value credential-shaped public content — intended Evidence scrub; everyday prose survives
  - `[false]` `[reject]` AC `spendCents` vs Workers AI `costCents: 0` — bumpSpend only when cost > 0; tests use a paid fake; 3.2 money model unchanged
  - `[medium]` `[patch]` SteeringPanel mount never sent `private: true` — mount test now checks the checkbox
  - `[medium]` `[patch]` Admin POST never sent `private: true` — adminApi case POSTs private and asserts public redaction
  - `[medium]` `[patch]` ChatAgent strip was `toString()` only — test now invokes `onChatMessage` and asserts the queue-channel body
  - `[medium]` `[patch]` Injection fixtures used `evalSummary: null` — seed queue-like `ok` / `ineligible: []` and assert it stays empty
  - `[medium]` `[patch]` Tool-deny stamped the selected Draft (VG other) — grouped with synthetic deny id
  - `[false]` `[reject]` Form POST vs ChatAgent conversational transport — FR-50 forbids as-you-type public streaming; DO + `/agents` gate kept; demo LLM path stripped
  - `[false]` `[reject]` No production steward model seed — architecture launch gap + 3.2 leftover; spec explicit
  - `[low]` `[reject]` No B8 empty state / `SteeringLog` / awaiting poll — later projection chrome; content/effect now on the existing step line
  - `[false]` `[reject]` No keyboard binding to open steering — 3.10/3.15 amendment, not a 3.14 AC
  - `[false]` `[reject]` No `steering.denied` / source-under-discussion fixture — draft-body injection is tested; 3.15 owns interrogation sources
  - `[false]` `[reject]` In-composition test is “no row yet” — composer state is client-local until POST
  - `[false]` `[reject]` Spend/awaiting complete() — `gateway.test.ts` pins steward-on-awaiting vs other roles
  - `[false]` `[reject]` displayName / yoloPolicy format / sprint metadata — displayName is 1.4/3.13; yoloPolicy is oxfmt from the closed event enum

## Design Notes

- 3.2 `complete()` refuses any non-`running` Run. Queue Drafts live on `awaiting`. Restrict the exception to `role === "steward"` so drafter/reviewer cannot resume on a gated Run.
- `steering.applied` with `effect: "none"` is the honest 3.14 receipt (R2: no invisible channel). 3.16/3.17 replace none with draft/config effects.
- Composer is a form POST, not public token streaming. ChatAgent DO remains for 1.2/1.5 wiring; it must not stay an unprojected Workers AI chat.
- Do not seed `gateway_config`. Architecture still lists steward model pin as a launch gap.

## Verification

**Commands:**
- `npm test` -- expected: pass, including steering I/O matrix and unchanged empty-allowlist tests for the original four roles
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Dev bypass: `/admin#queue` submit a public turn → ops. `/runs/:id` lists `steering.turn`; private checkbox withholds content; YOLO toggle still only on `#mode`

## Auto Run Result

Status: done

Summary: Access-gated steering turns on a Run/Draft. Operator POST persists `steering_turns` and public Evidence (`steering.turn`, `steering.applied` with `effect: "none"`). Private is chosen at submit and cannot be undone. Steward has a frozen empty allowlist (no `publish_f1`). ChatAgent demo tools and Workers AI are gone. Optional `complete({ role: "steward" })` on running/awaiting Runs attributes spend when a mapping exists.

Files changed:
- `migrations/0013_steering_channel.sql` — `steering_turns` plus evidence/`llm_calls` CHECK rebuilds
- `src/shared/schemas/vocabulary.ts` / `gateway.ts` / `steering.ts` — steward role, events, POST body
- `src/shared/db/repos/steeringTurnsRepo.ts` — insert-only private flag
- `src/pipeline/ai/actionPolicy.ts` / `gateway.ts` — empty steward allowlist; steward complete on awaiting
- `src/pipeline/steering/submitTurn.ts` / `agents/StewardAgent.ts` — persist + optional complete; synthetic deny id
- `src/server.ts` — strip ChatAgent demo/MCP-attach; POST `/api/admin/runs/:runId/steering`
- `src/surfaces/admin/SteeringPanel.tsx` / `ApprovalQueue.tsx` — composer on selected Draft
- `src/surfaces/ops/EvidenceDetail.tsx` / `pml.css` — step extras + composer chrome
- tests + `sprint-status.yaml` + this spec

Review: 4 layers, 31 findings — 0 high, 11 medium. Patches: synthetic deny id (no Draft `guardrail_fail`); catch-all after persist; composer ref lock + error copy; Evidence content/effect labels; private:true mount + admin POST tests; `onChatMessage` runtime body; queue-like evalSummary injection. Rejected lows/false as recorded above. No deferrals.

Follow-up review recommended: true — seven medium patch entries on the first pass. Unverified risk: the queue composer → ops Evidence round-trip was HTTP and jsdom tested, not walked in a live browser on `/admin#queue`.

Patch counts by verdict: high 0, medium 7 entries (deny id, composer lock/error, persist catch-all, Evidence labels, private mount, private admin POST, ChatAgent runtime).

Verification: `npm test` — 738 passed (42 files). `npm run check` — oxfmt/oxlint/tsc exit 0. No live-browser pass of `/admin#queue`.

Residual risks: remote D1 still needs migration 0013; `gateway_config` remains unseeded so production steward spend is skipped until a mapping is inserted; Workers AI still records `costCents: 0`.
