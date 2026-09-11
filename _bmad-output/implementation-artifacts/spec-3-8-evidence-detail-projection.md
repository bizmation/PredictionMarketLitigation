---
title: 'Story 3.8: Evidence Detail Projection'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 7d5f67a137dad815c777a2cb57a4a0141f4dc7e6
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred:
  - summary: >-
      Evidence detail GET has no client timeout, so a hung /api/runs/:id
      leaves ops chrome with an empty body until the worker answers.
    evidence: |-
      fetch in EvidenceDetail uses AbortController for unmount only.
      Timeout duration is unchosen (same hung-fetch family as Epic 2).
    location: >-
      src/surfaces/ops/EvidenceDetail.tsx:449
    severity: medium
---

<intent-contract>

## Intent

**Problem:** 3.7 run-log rows already link to `/runs/:id`, but that URL still renders the ops. log. Visitors cannot audit a Run’s steps, models, spend, evals, Draft text, or lineage without a vendor console.

**Approach:** Dedicated public Evidence page at `/runs/:id` on ops. (no login) driven by `GET /api/runs/:id`. Project llmCalls onto the existing RunDetail bundle, scrub secrets on Evidence writes, and offer that same JSON as a thin GRC download.

## Boundaries & Constraints

**Always:**
- No authentication on the Evidence page or `GET /api/runs/:id`.
- Dedicated page, not the mock sticky aside. Hand-roll pathname `/runs/:runId` (keep `resolveSurface`); no new router dependency.
- Money stays integer cents; display via `formatUsdCents`. Zero spend, evals-not-run, empty llmCalls, and unrecorded prompt version are designed empties — never blank.
- `surfaces/ops` imports `shared/*` only. Evidence hrefs already use `surfaceHref("ops", { path: `/runs/${id}`, dev })`.
- Closed Evidence event vocabulary — no new event names, no migration `0010`.
- Detail GET is `jsonNoStore` so a `running` Run’s timeline can refresh.
- Export is the same RunDetail JSON the GET returns (download), not a second schema.
- Projector is the Evidence write path: scrub secret-bearing keys / credential-shaped values before D1 insert.

**Never:**
- No run-log filters, CSV, sticky `#evidence` aside, or mock 06:00 cadence.
- No `#drafts` band, mode-audit band, YOLO validation log, or auto-approve threshold UI (3.9 / 3.13).
- No Approval Gate writes, reject-reason column, `gate.decided`, or `run.completed` emission (3.10 / 3.11).
- No `react-router` / `wouter`. No pipeline imports from surfaces. No live F1 writes. No Access on ops.
- Do not invent a prompt-version table or `gateway.config_changed`. Do not edit migrations `0001`–`0009`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Known Run | `GET /api/runs/:id` with drafts, evidence, llmCalls | 200 RunDetail (incl. `llmCalls`); page shows timeline, spend, models, Draft body, lineage | N/A |
| Empty Run | status `empty`, spend 0, drafts `[]`, no evals | Spend `$0.00`; evals “not run”; EmptyState “No draft produced” | N/A |
| Disagreement | `evalSummary.disagreement.flagged` | Flag + description visible | N/A |
| Unknown id | missing Run | API envelope 404; page EmptyState, no invented Run | Fail closed |
| No auth | ops host, no cookies | HTML 200; API 200 | N/A |
| Secret payload | append `{ apiKey: "x", source: "cl" }` | Stored/returned payload has no `apiKey` | N/A |
| Export | visitor clicks export | Downloads the GET JSON as one file | N/A |
| In-flight | status `running`; new evidence appears | Page refetches; new steps render | Fail closed on fetch error |
| Fetch fail | `/api/runs/:id` non-OK | EmptyState, no fake Evidence | Do not fake a Run |

</intent-contract>

## Code Map

- `src/app.tsx:19-56` -- BRANCH: if ops surface and pathname `/runs/:runId`, render Evidence page; else keep `OpsShell`.
- `src/shared/lib/surface.ts:59-72,90-104` -- READ ONLY `resolveSurface` / `surfaceHref`; do not add a router library.
- `src/surfaces/ops/EvidenceDetail.tsx` -- NEW -- fetch `GET /api/runs/:id`; timeline `.steps` (`done`/`now` from seq vs last event while `running`); `.spend` (cents + token sum); models from `llmCalls` (prompt version “not recorded”); provenance dl (mode, approver/`decidedBy` or “none — not approved”, lineage sources → draft → guardrails → gate → status); evals from `evalSummary` or EmptyState; full `draft.body` (`NotLiveDraftBanner` when `outcome` is null); disagreement when flagged; `editedBody` diff when present; JSON export control; poll while `running`.
- `src/surfaces/ops/evidenceDetail.test.tsx` -- NEW -- I/O matrix HTML (empty/disagreement/unknown/unauth/export href, zero spend, evals-not-run, no login chrome).
- `src/surfaces/ops/OpsShell.tsx` -- READ ONLY log + stubs; Evidence is a sibling page.
- `src/surfaces/ops/RunLog.tsx:112-117,152-161` -- READ ONLY `formatUsdCents` + existing `/runs/:id` links.
- `src/shared/ui/pml.css` -- PORT `.kv` / `.spend` from `PML Ops.html:31-39`. `.steps` / `.diff` already at 771-841. Do not port sticky `.evidence`.
- `src/shared/ui/EmptyState.tsx:5-16` -- reuse “Evals not run” / empty-run copy pattern.
- `src/shared/ui/NotLiveDraftBanner.tsx` -- wrap pending Draft bodies on this page only (list band stays 3.9).
- `src/shared/ui/RunStatusChip.tsx` / `OriginFlag.tsx` / `ProvenanceLabel.tsx` -- reuse; `ProvenanceLabel` only when `decidedBy` exists (HITL → human, yolo → agent).
- `src/shared/schemas/run.ts:209-215` -- ADD `llmCalls: LlmCallRecord[]` to `RunDetailSchema` (may be empty).
- `src/shared/schemas/gateway.ts:78-97` -- READ ONLY `LlmCallRecordSchema`.
- `src/shared/db/repos/llmCallsRepo.ts:47-59` -- ADD `listByRun` (`ORDER BY created_at ASC`).
- `src/shared/db/repos/evidenceRepo.ts:5-8,73-113` -- KEEP D1 mapping; scrub happens in projector before bind.
- `src/pipeline/projector/evidence.ts` -- NEW -- sole append API (`append` / `appendStmt`): scrub then `evidenceRepo`. Replace gateway raw SQL (`gateway.ts:162-178`) and pipeline `evidenceRepo.appendEvent*` callers (`dailyRunSteps.ts`, `connector.ts`, `draftAndReview.ts`, `actionPolicy.ts`, `gateway.ts` invokeTool).
- `src/shared/api/publicRouter.ts:286-302` -- KEEP detail join; ADD `llmCalls`; `jsonNoStore`; payloads already scrubbed at write.
- `src/shared/api/publicApi.test.ts:899-952` -- EXTEND: `llmCalls`, no-store, scrubbed payload never echoed.
- `src/pipeline/projector/evidence.test.ts` -- NEW -- scrub strips secrets; gateway stop uses projector not raw INSERT.
- `wrangler.jsonc:34-36` -- READ ONLY SPA fallthrough already serves `/runs/:id`.
- `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Ops.html:400-463` -- section order (spend, steps, provenance, evals, draft/diff/flag); ignore sticky aside, filters, CSV, 06:00.

## Tasks & Acceptance

**Execution:**
- `src/pipeline/projector/evidence.ts` -- NEW scrub+append; reroute pipeline writers incl. gateway budget-stop SQL -- FR24 write path, secrets never stored
- `src/shared/db/repos/llmCallsRepo.ts` -- ADD `listByRun` -- models/tokens for the public bundle
- `src/shared/schemas/run.ts` + `publicRouter.ts` -- `llmCalls` on RunDetail; detail `jsonNoStore` -- FR26 bundle is GET `/api/runs/:id`
- `src/app.tsx` + `src/surfaces/ops/EvidenceDetail.tsx` -- `/runs/:id` page -- the visitor surface
- `src/shared/ui/pml.css` -- PORT `.kv` / `.spend` -- handoff classes, not new names
- `src/shared/api/publicApi.test.ts` + `evidenceDetail.test.tsx` + `projector/evidence.test.ts` -- I/O matrix (API + HTML + scrub)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-8-evidence-detail-projection` in-progress then done -- tracking

**Acceptance Criteria:**
- Given a Run with steps, drafts, spend, and evals, when a visitor opens `/runs/{id}` on ops. with no login, then they see the step timeline (live `now` while running, historical `done`), tools from guardrail payloads, model/role/provider from llmCalls (prompt version explicit “not recorded”), spend (including `$0.00`), evals or “not run”, full Draft text, and lineage sources → draft → guardrails → gate → status
- Given secrets in an Evidence payload, when the event is written or fetched, then credentials are absent from D1 and from the public JSON
- Given `evalSummary.disagreement.flagged`, when the page renders, then the flag and short description are visible
- Given that Run’s Evidence, when the visitor exports, then they receive one JSON file matching `GET /api/runs/:id`

## Spec Change Log

## Review Triage Log

### 2026-09-11 — Review pass
- verdicts: 20 findings — high 0, medium 8, low 8, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Scrub missed compound secret keys and embedded credential strings — `isSecretKey` now matches contained tokens; credential regex is unanchored; projector tests cover `openaiApiKey` / embedded Bearer
  - `[low]` `[reject]` `evidenceRepo.appendEvent` remains an unsanitized D1 mapping — spec kept the repo as bind-only; all pipeline writers go through the projector
  - `[false]` `[reject]` Shallow `isRunDetail` lets bad nested objects throw — `GET /api/runs/:id` `RunDetailSchema.parse`s before 200, so EvidenceBody never sees an invalid bundle
  - `[medium]` `[patch]` First paint returned `null` (blank document) — while `view` is null the page still renders EvidenceChrome
  - `[medium]` `[patch]` Tests injected `detail` and never drove App/`fetch` — grouped with the two verification-gap rows; App route test + `mapEvidenceFetch` unit tests added
  - `[low]` `[patch]` Export `<a>` unstyled (`.export` targeted `button` only) — `.export a` shares the handoff button styles
  - `[low]` `[reject]` Hardcoded lineage invents stages on empty/failed Runs — Code Map specified the mock caption; the timeline is the record
  - `[false]` `[reject]` Draft UI omits confidence / `tier2Only` / `ineligible` — full `body` is on the page; those flags belong to 3.9
  - `[low]` `[reject]` Unguarded `JSON.parse(tokens_json)` 500s the detail GET — column has `json_valid`; writes go through Zod; poison-row 500 same family 3.7 rejected
  - `[medium]` `[patch]` Failed poll of a running Run wiped the timeline — `mapEvidenceFetch` keeps a held RunDetail on later 404/non-OK/invalid/network 0
  - `[low]` `[reject]` TrustBar still says Gate: HITL on YOLO Runs / spend always `$` — mode is on the provenance dl; YOLO chrome is 3.13; USD display matches 3.7
  - `[low]` `[patch]` `listByRun` ordered only by `created_at` (same-timestamp shuffle) — now `ORDER BY created_at ASC, id ASC`
  - `[false]` `[reject]` Unencoded `runId` in fetch (`?`/`#`/whitespace) — Run ids are `run-YYYYMMDD-xxxx`; they need no encoding
  - `[medium]` `[defer]` Hung first GET has no timeout, page stays chrome-only — AbortController is unmount-only; timeout duration unchosen (Epic 2 hung-fetch family)
  - `[low]` `[reject]` `tokens_json` parse 500 (edge) — same as the projector-adjacent parse row above
  - `[low]` `[patch]` Same-timestamp `llmCalls` order (edge) — same `ORDER BY …, id ASC` fix
  - `[medium]` `[patch]` Credential regex was whole-string only (edge) — same unanchored regex as the first scrub patch
  - `[false]` `[reject]` GET does not re-scrub stored payloads — matrix row is append-then-GET, which the projector + publicApi tests pin; no secret-bearing rows exist on the write path
  - `[medium]` `[patch]` App `/runs/:id` branch untested — `shells.test.tsx` stubs `window.location.href` and asserts Evidence chrome, not OpsShell bands
  - `[medium]` `[patch]` Evidence I/O tests never ran the GET mapping — `mapEvidenceFetch` covers 404/non-OK/invalid/running-poll/held-on-fail

## Design Notes

- 3.7 locked a page at `/runs/:id`; the mock sticky aside is out. Hand-rolled pathname matches 1.3 / apex (`no router library`).
- Prompt versions are not stored. Showing llmCalls model/role/provider plus a designed empty for prompt version is the honest analog of evals-not-run — do not invent a version table.
- Lineage is rendered from existing events + Draft fields. Do not add a lineage object to the wire.
- `gate.decided` / reject-reason storage stay unwired until 3.10; render `decidedBy` / `editedBody` only when already present.

## Verification

**Commands:**
- `npm test` -- expected: pass, including `publicApi.test.ts`, `evidenceDetail.test.tsx`, `projector/evidence.test.ts`
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Open ops. run log, follow a row to `/runs/:id` (dev: `?surface=ops`): timeline, `$0.00` empty run, export JSON, no login wall, unknown id EmptyState

## Auto Run Result

Status: done

Summary: Public Evidence detail is live on ops. at `/runs/:id` (no login). The page projects `GET /api/runs/:id` (Run + drafts + evidence + `llmCalls`, `Cache-Control: no-store`): step timeline (`done` / live `now`), spend including `$0.00`, models from llmCalls with prompt version **not recorded**, evals or “Evals not run”, full Draft text, disagreement when flagged, lineage caption, and an Export JSON control. Pipeline Evidence writes go through a scrubbing projector.

Files changed:
- `src/pipeline/projector/evidence.ts` — sole append path; scrub secret keys and credential-shaped values
- `src/pipeline/projector/evidence.test.ts` — scrub + gateway budget-stop through projector
- `src/pipeline/ai/gateway.ts` / `dailyRunSteps.ts` / `connector.ts` / `draftAndReview.ts` / `actionPolicy.ts` — append via projector (budget-stop no longer raw SQL)
- `src/shared/schemas/run.ts` — `llmCalls` on `RunDetailSchema`
- `src/shared/db/repos/llmCallsRepo.ts` — `listByRun` (`created_at`, `id`)
- `src/shared/api/publicRouter.ts` — detail join includes `llmCalls`; `jsonNoStore`
- `src/shared/api/publicApi.test.ts` — llmCalls, no-store, scrubbed payload not echoed
- `src/app.tsx` — ops `/runs/:runId` → EvidenceDetail
- `src/surfaces/ops/EvidenceDetail.tsx` — public page, chrome on first paint, `mapEvidenceFetch` keeps a held Run on poll fail
- `src/surfaces/ops/evidenceDetail.test.tsx` — I/O matrix HTML + mapper
- `src/surfaces/shells.test.tsx` — App Evidence URL does not render the run log
- `src/shared/ui/pml.css` — `.kv` / `.spend` / `.export a`
- `_bmad-output/implementation-artifacts/spec-3-8-evidence-detail-projection.md` / `sprint-status.yaml`

Review: 6 patch entries applied (scrub keys+embedded credentials, first-paint chrome, poll keep-last, App route test, GET mapper tests, export link CSS, llmCalls order). 1 deferred (hung GET timeout). Rejected: repo back door, shallow client parse vs server Zod, hardcoded lineage caption, 3.9 draft flags, poison `tokens_json`, TrustBar HITL/USD, unencoded run id, GET re-scrub of unstored secrets.

Follow-up review recommended: true (four medium patches). Unverified risk: App/mapper tests still do not drive a real `fetch`/`setInterval`; a hung GET still leaves chrome with an empty body.

Verification: `npm test` — 552 passed. `npm run check` — oxfmt, oxlint, tsc exit 0.

Residual risks: `/runs/:id` export is a same-origin `<a download>` of the GET JSON (no `Content-Disposition`). Prompt versions stay a designed empty. `gate.decided` / reject reasons / pending-drafts band remain 3.10 / 3.9.
