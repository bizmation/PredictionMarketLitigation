---
title: 'Story 3.11: Publish to Live F1 with Provenance & Diffs'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 7221d5240f59a6972f02807a84157a2ab558b8d7
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** 3.10 records approve / edit-then-approve / reject, but live F1 never moves — the admin queue's "Published" copy is fiction, apex still serves seed rows, and agents are already forbidden from publishing (3.6) with no gate path to replace them.

**Approach:** Extend the existing gate `decide()` so an approve or edit-then-approve also applies that Draft's field `diff` to the named F1 row, freezes provenance on the row at publish time, and terminals the Run once no drafts remain pending — one operator POST, one atomic `db.batch`, idempotent under retry.

## Boundaries & Constraints

**Always:**
- The operator's existing `POST /api/admin/drafts/:id/decision` is the only trigger. Approve and edit-then-approve publish; reject still writes the decision only. No second click, no new route, no agent tool.
- Decision + F1 apply + `gate.decided` are one `db.batch` with the 3.10 `WHERE outcome IS NULL` guard. A retry is `already_decided` / 409 and must not apply F1 a second time.
- Field truth is `diff`: `Record<field, {from, to}>` (3.4/3.9). Apply each `to` onto `targetEntityType` / `targetEntityId`. `editedBody` is operator prose for Evidence; it never patches F1 columns. `from` is the public snapshot, not an optimistic lock.
- Allowed targets are the F1 claim tables drafts already name: `states`, `cases`, `circuits`, `entities`, `cert_signals`. Allowed diff keys are that table's mutable claim fields (camelCase schema names). Identity (`id`, `code`, `slug`) and provenance/timestamp columns are never taken from the diff — the gate stamps `provenance_kind`, `published_at`, `updated_at` (and `cert_signals.approver` = `decidedBy`).
- `provenance_kind` is frozen from the Run's stored `mode`: `hitl` → `human`, `yolo` → `agent`. HITL is still the only live path; a yolo-mode fixture is how the agent label is proven without 3.13.
- Unpublishable approve/edit (null target, unknown type/field, malformed diff, missing F1 row) is `invalid` / 400: no decision row, no F1 write.
- F1 repos stay SELECT-only. Apply SQL lives under `src/pipeline/gate/` and is imported only there. `surfaces/*` never import `pipeline/*`. No new Evidence event names — `run.completed` already exists.
- Run stays `awaiting` while any sibling draft is pending. When none remain: `published` if any draft in the run is approved/edited, else `rejected`. Emit `run.completed` once (deterministic id) on that transition only.

**Never:**
- No `publish_f1` (or any) agent tool; 3.6 empty allowlists stay empty. No YOLO toggle, threshold, or mode UI (3.13). No supersede/replay (3.12). No Access-perimeter edits. No apex view rewrites — they already render `provenanceKind` from F1. No `waitForApproval` Workflow pause. No migration unless a CHECK truly cannot admit the write (it can).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Approve (HITL, last pending) | POST `{action:"approve"}` on `states`/`st-nv` `{posture:{from,to:"pending"}}` | Draft approved; NV `posture=pending`, `provenance_kind=human`, timestamps = `now`; `GET /api/states` reflects it; run `published`; `run.completed` | N/A |
| Edit-then-approve | POST `{action:"edit", editedBody}` | F1 applies `diff.to` (not the prose); original `body` preserved; Evidence still shows Agent draft vs Published | N/A |
| Reject | POST `{action:"reject", rejectReason}` | Decision as 3.10; F1 row byte-identical; no provenance rewrite | N/A |
| Retry | Second POST on a decided draft | 409; F1 values unchanged (no double-apply) | Conflict |
| Sibling still pending | Two pending drafts; approve one | That entity publishes; run stays `awaiting`; no `run.completed` | N/A |
| All remaining rejected | Last pending is reject; none approved/edited | Run `rejected` + `run.completed`; F1 untouched by the reject | N/A |
| YOLO-mode fixture | Run `mode=yolo`; approve | F1 `provenance_kind=agent` | N/A |
| Unpublishable | null target / unknown type or field / missing row / bad diff | 400; draft still pending; F1 unchanged | Fail closed |
| Anon | no token | opaque 403 | Fail closed |
| Agent `publish_f1` | model requests the tool | Denied + `guardrails.failed`; F1 unchanged (3.6 still holds) | N/A |

</intent-contract>

## Code Map

- `src/pipeline/gate/approval.ts` -- EXTEND `decide()`: after the 3.10 validate, for approve/edit build F1 apply stmt(s) + optionally run-terminal + `run.completed` append; same `db.batch` as `applyDecisionStmt` + `gate.decided`. Reject skips apply. Keep typed results; unpublishable → `invalid` before any write.
- `src/pipeline/gate/f1Apply.ts` -- NEW -- gate-only: parse `diff` as `Record<string, {from, to}>`; map type+camelCase field → `UPDATE` on `states`/`cases`/`circuits`/`entities`/`cert_signals` (column names as in `statesRepo.ts:12-25` / `casesRepo` / `circuitsRepo` / `entitiesRepo` / `certSignalRepo`); stamp provenance + timestamps; `cert_signals.approver` = displayName. Unknown type/field or missing row throws → `invalid`.
- `src/shared/db/repos/runsRepo.ts:211-228` -- ADD awaiting→terminal (`published`\|`rejected`) `UPDATE … WHERE id = ? AND status = 'awaiting'` (do not reuse `completeRun`, which only moves `running`). `getRunById` / `listByRun` are the mode + sibling-pending reads.
- `src/shared/db/repos/draftsRepo.ts` -- READ `getById` / `listByRun` / `applyDecisionStmt`; no new draft columns. `listByRun` tells decide() whether any other `outcome IS NULL` remains.
- `src/pipeline/projector/evidence.ts` -- REUSE `appendStmt`; `run.completed` id deterministic (`run-completed-{runId}` or `evidenceId` equivalent) so a retry `INSERT OR IGNORE`s.
- `src/server.ts:379-440` -- READ ONLY route; existing 200/400/404/409 mapping already covers the new `invalid` cases.
- `src/shared/db/repos/{states,cases,circuits,entities,certSignal}Repo.ts` -- READ ONLY. Gate must not add writes here.
- `src/shared/api/publicRouter.ts:222-223` -- READ ONLY `GET /api/states` (and siblings); the Worker test hits this after publish to prove apex data moved.
- `src/surfaces/ops/EvidenceDetail.tsx:407-421` -- EDIT the after-column heading `Edited` → `Published` when `editedBody` is present (UX: Agent draft vs Published). Field diffs stay on the 3.9/3.10 cards; do not invent a second diff UI.
- `src/surfaces/apex/*` + `ProvenanceLabel.tsx` -- READ ONLY; detail views already bind `provenanceKind`.
- `src/pipeline/ai/actionPolicy.ts:37-47` -- READ ONLY empty `ALLOWED_TOOLS`; `gateway.ts` deny path stays the 3.6 regression.
- `src/shared/api/adminApi.test.ts:286-335` -- REPLACE "F1 and run untouched" on approve; extend edit/reject/409 with F1 snapshots, `GET /api/states`, run terminal, yolo-kind, unpublishable 400.
- `src/pipeline/ai/actionPolicy.test.ts` / `gateway.test.ts` -- KEEP the deny-`publish_f1` + F1-snapshot assertions.
- `src/surfaces/ops/evidenceDetail.test.tsx` -- UPDATE the editedBody heading assertion to "Published".
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-11-publish-to-live-f1-provenance-diffs` in-progress then done.

## Tasks & Acceptance

**Execution:**
- `src/pipeline/gate/f1Apply.ts` -- NEW apply statements (allowlisted type/field → column, provenance freeze) -- the only F1 writer
- `src/shared/db/repos/runsRepo.ts` -- awaiting→`published`/`rejected` -- run terminal 3.10 deferred
- `src/pipeline/gate/approval.ts` -- fold publish + optional `run.completed` into `decide()`'s batch -- one POST, one batch
- `src/surfaces/ops/EvidenceDetail.tsx` -- Agent draft vs Published -- the public edit diff after publish
- `src/shared/api/adminApi.test.ts` + `evidenceDetail.test.tsx` -- I/O matrix (F1 + public GET + run terminal + 409 no double-apply + reject snapshot + unpublishable 400 + yolo→agent)
- `src/pipeline/ai/actionPolicy.test.ts` / `gateway.test.ts` -- unchanged deny-publish regression
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- tracking

**Acceptance Criteria:**
- Given an operator approve or edit-then-approve on a pending Draft, when `POST /api/admin/drafts/:id/decision` succeeds, then the named F1 entity's fields equal each `diff.to`, `provenance_kind` is `human` on a HITL run (or `agent` on a yolo-mode run), and `GET /api/states` (or the matching public F1 GET) returns that new state
- Given edit-then-approve, when Evidence detail for that Run is rendered, then the original `body` appears as Agent draft and `editedBody` as Published; F1 columns follow `diff`, not the prose
- Given reject, when the same POST runs, then F1 bytes are unchanged
- Given a second decision POST on the same Draft, when the first already published, then the response is 409 and F1 is not applied again
- Given a model request for `publish_f1`, when the gateway/action-policy path runs, then the tool is denied and F1 is unchanged
- Given the last pending Draft in a Run is decided, when any sibling was approved or edited, then the Run is `published` and `run.completed` exists once; when every draft was rejected, then the Run is `rejected`

## Spec Change Log

## Review Triage Log

### 2026-09-12 — Review pass
- verdicts: 22 findings — high 0, medium 4, low 5, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` last-pending run terminal chosen from a pre-batch `listByRun` snapshot, so two in-flight last drafts can both skip `run.completed` (blind-hunter) — single-operator sequential queue; the sibling test covers the sequential path; a SQL `NOT EXISTS` sibling guard would add concurrency complexity the 3.10 decide-race row already declined.
  - `[medium]` `[patch]` `decide()` enqueued `run.completed` even when `run.status` was not `awaiting` (blind-hunter) — budget-stop can leave pending drafts on a `stopped` run (`afterPackaging` returns without `finishAwaiting`); fixed: `terminalAwaitingRunStmt` + `run.completed` only enqueue when `run.status === "awaiting"`; F1 still publishes.
  - `[false]` `[reject]` After `db.batch`, only the draft UPDATE's `meta.changes` is checked, so a 0-row F1 apply could still return decided (blind-hunter) — no F1 DELETE exists anywhere; a concurrent already-decided loser zeros both the F1 `EXISTS (outcome IS NULL)` UPDATE and the draft UPDATE, which is the 409 path.
  - `[low]` `[reject]` F1 CHECK/enum/`to` failures and D1 errors all become 400 "Invalid decision body." (blind-hunter) — fail-closed with no write (batch abort); splitting envelopes would add a public error surface the 3.10 route already maps `invalid` → that string.
  - `[false]` `[reject]` `TARGETS` has no `state_platform_statuses` (blind-hunter) — no connector/drafter emits that `targetEntityType`; unreachable.
  - `[false]` `[reject]` Empty `diff` `{}` still stamps provenance (blind-hunter) — packaging always sends field `{from,to}`; no producer emits `{}`.
  - `[medium]` `[patch]` New I/O tests only exercised `states`/`st-nv`/`posture` (blind-hunter) — grouped with the verification-gap row; Worker approve tests added for `operationalStatus`, `case-flaherty`, and `cert_signals`/`current`.
  - `[false]` `[reject]` Evidence "Published" is only a heading rename; approve-without-edit has no Published affordance; field `{from,to}` not on Evidence (blind-hunter) — the story AC is human-edit before/after (`body` vs `editedBody`), which 3.8 already rendered; field diffs stay on the 3.9/3.10 cards by design.
  - `[false]` `[reject]` Sprint key `done` while spec `in-progress`, `last_updated` rewind, `.oxfmtrc.json` `.omo/**` (blind-hunter) — Finalize writes `status: done`; `.omo/**` ignore is what makes `npm run check` pass.
  - `[false]` `[reject]` `seedRun` inserts `awaiting` with `completedAt` already set (blind-hunter) — matches production: `finishAwaiting` uses `completeRun`, which stamps `completed_at` when leaving `running`.
  - `[low]` `[reject]` (carried) concurrent last-pending skip (edge-case-hunter) — grouped with the first row.
  - `[medium]` `[patch]` (carried) Run exists but status is not awaiting (edge-case-hunter) — grouped with the awaiting-guard patch.
  - `[false]` `[reject]` F1 row gone between existence SELECT and batch (edge-case-hunter) — grouped with the no-delete row above.
  - `[false]` `[reject]` `factors` `to` as a nonempty array of invalid objects publishes then cert GET throws (edge-case-hunter) — no pipeline produces `cert_signals` drafts; SQL `json_valid`/`json_type=array` still fail-closes garbage; the new cert Worker test uses a valid seed shape.
  - `[low]` `[reject]` (carried) claim "terminals the Run once no drafts remain pending" fails under concurrency (edge-case-hunter) — grouped with the first row.
  - `[false]` `[reject]` claim "when POST succeeds F1 fields equal each diff.to" because success checks only the draft UPDATE (edge-case-hunter) — grouped with the no-delete / dual-`EXISTS` row.
  - `[medium]` `[patch]` Publish tests never apply the draft shapes packaging already emits (`operationalStatus`, `cases`, `cert_signals.approver`) (verification-gap) — added Worker approve tests: `operationalStatus` on `st-nv` via `GET /api/states`; `case-flaherty` via `GET /api/cases`; `cert_signals`/`current` stamps `approver` = `DISPLAY_NAME` on `GET /api/cert-signal`.
  - `[false]` `[reject]` Apex views vs `GET /api/states` (intent-alignment) — apex already binds `provenanceKind` from F1; the Worker public GET is the data those views read.
  - `[false]` `[reject]` Frozen Agent-approved string not asserted on apex/Evidence from a post-publish fetch (intent-alignment) — `ProvenanceLabel` already maps `kind`; yolo fixture pins `provenance_kind=agent` on the row and public JSON.
  - `[false]` `[reject]` Evidence field-level diffs / operator-click E2E vs heading rename (intent-alignment) — grouped with the Evidence AC row: original Draft vs published prose is the human-edit surface.
  - `[false]` `[reject]` FR21 agent-publish proof not in this diff (intent-alignment) — 3.6 `publish_f1` deny + F1-snapshot tests ran in `npm test`; this diff's only F1 writer is the gate module.
  - `[low]` `[reject]` Admin queue copy always says "frozen human-approved" even for the yolo fixture (intent-alignment) — HITL is the launch default; agent-label chrome is 3.13; F1 `provenance_kind` is the frozen published label.

## Design Notes

- Same batch as 3.10 so a crash cannot leave `outcome` set with F1 unapplied; 409 retries then have nothing left to do.
- `from` is what 3.9 already prints as "Live now"; requiring live==from would invent a CAS the packaging story never specified.
- Do not add `gate.published` — 3.1 closed the event set; `gate.decided` + row outcome already distinguish reject vs publish; `run.completed` was the event 3.10 deferred.
- Architecture's `approvalGate.ts` is this module under the name it already shipped (`approval.ts`); do not rename.

## Verification

**Commands:**
- `npm test` -- expected: pass, including rewritten `adminApi.test.ts` publish matrix and existing deny-`publish_f1` tests
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Dev bypass: approve the seeded NV posture draft on `/admin#queue`; apex state board / `GET /api/states` shows `pending` + Human-approved; ops Evidence shows Published on an edit

## Auto Run Result

Status: done

Summary: Approve and edit-then-approve now publish live F1 on the existing decision POST — one operator action, one atomic `db.batch`. The gate applies each Draft `diff.to` onto the named F1 row (`states` / `cases` / `circuits` / `entities` / `cert_signals`), freezes `provenance_kind` from the Run's stored mode (`hitl` → `human`, `yolo` → `agent`), and terminals the Run when no sibling remains pending (`published` if any approved/edited, else `rejected`) with one `run.completed`. Reject still writes the decision only. Unpublishable approve/edit fail closed (400, draft still pending). Agents still have no publish tool (3.6 allowlists unchanged). Evidence detail labels the after-column Published when `editedBody` is present.

Files changed:
- `src/pipeline/gate/f1Apply.ts` — sole F1 writer (allowlisted type/field → column, provenance freeze, `cert_signals.approver`)
- `src/pipeline/gate/approval.ts` — fold F1 apply + optional awaiting→terminal + `run.completed` into `decide()`'s batch
- `src/shared/db/repos/runsRepo.ts` — `terminalAwaitingRunStmt` (`awaiting` → `published`/`rejected`)
- `src/surfaces/ops/EvidenceDetail.tsx` — Agent draft vs Published
- `src/shared/api/adminApi.test.ts` — publish I/O matrix including operationalStatus, cases, cert approver, 409, siblings, yolo, unpublishable 400
- `src/surfaces/ops/evidenceDetail.test.tsx` — Published heading
- `_bmad-output/implementation-artifacts/spec-3-11-publish-to-live-f1-provenance-diffs.md` / `sprint-status.yaml` — tracking
- `.oxfmtrc.json` / `.gitignore` — ignore `.omo/` so `oxfmt --check .` and the working tree stay clean

Review: 4 layers, 22 findings — 2 patch entries applied (awaiting-only run terminal so a budget-stopped run cannot emit `run.completed` without a status change; Worker approve tests for `operationalStatus` / `case-flaherty` / `cert_signals` approver); 5 low + 13 false rejected with recorded evidence (single-operator last-pending race, 400 envelope precedent, unreachable sps/empty-diff/cert-garbage producers, Evidence AC is the body diff, apex reads the public GET, FR21 covered by 3.6 tests that ran).

Follow-up review recommended: true (two mediums patched). Unverified risk: the awaiting-only terminal guard has no budget-stopped-run fixture, so a future edit could enqueue `run.completed` on `stopped` again without a red test; the new F1-type tests pin allowlist rows only for the three added shapes, not `circuits`/`entities`.

Verification: `npm test` — 627 passed (31 files). `npm run check` — oxfmt, oxlint, tsc exit 0.

Residual risks: remote D1 has no new migration (F1 columns already exist); no live-browser pass of queue → apex → Evidence (Worker POST + public GET + static Evidence markup stand in); concurrent last-two-drafts can still both skip the run terminal on a single-operator surface.
