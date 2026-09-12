---
title: 'Story 3.10: Admin HITL Approval Queue'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: daa7956047953a34468557219e6e92473b0ac2f0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Pending Drafts are public (3.9) but the operator has no surface to act on them — no approve / edit-then-approve / reject path exists, so the Approval Gate cannot move and HITL is theoretical.

**Approach:** An Access-gated queue on `/admin#queue` fed by `GET /api/admin/queue`, with keyboard-first actions (J/K navigate, A approve, E edit-then-approve, R reject) posting to `POST /api/admin/drafts/:id/decision`. A new pipeline gate module records each decision atomically — draft outcome + decidedAt/decidedBy plus a `gate.decided` Evidence event — and reject reasons are public-by-default with a private control (migration 0010 columns, a public wire field, and the reason shown on the ops. archive card).

## Boundaries & Constraints

**Always:**
- Queue and decision routes live under `/api/admin/*`, so `requireOperator` applies; every response carries `ADMIN_CACHE_HEADERS` (private, no-store, vary).
- `decidedBy` is the verified operator's `displayName` (public-safe) — never the email.
- A decision is one atomic `db.batch`: the draft UPDATE (validate-before-write: merge onto the row and `DraftRecordSchema.parse` before bind) plus the projector's `gate.decided` append (scrubbed payload `{draftId, outcome, decidedBy, reason: publicReason ?? null}`, deterministic id `gate-decided-{draftId}`).
- Reject requires a reason. Public portion rides `DraftRecord.rejectReason` (wire + `gate.decided` payload) and renders on the ops. archive card; `reject_reason_private` never enters any public wire, Evidence payload, or log — tests whole-body-scan for it.
- Edit-then-approve preserves the original `body`; the operator text lands in `editedBody` (outcome `edited`; the schema refine already enforces non-empty).
- Queue order: oldest waiting first (`created_at ASC, id ASC`).
- Keyboard parity per the handoff: J next, K previous, A/E/R act — all ignored while focus is in an input or textarea.

**Never:**
- No F1 writes, no publish, no run status changes, no `run.completed` emission (3.11). No mode toggle, threshold, or audit-trail panel (3.13) — the `#mode` placeholder stays. No supersede/replay (3.12).
- No new Evidence event names — `gate.decided` exists (0008/0009 vocabulary).
- No changes to the Access perimeter (`adminGuard.ts` / `access.ts`); new routes ride the existing guard. Session handling stays where it is in `server.ts`.
- No public-route changes beyond the `rejectReason` wire field and the archive-card display; apex untouched.
- HITL stays the launch default — no mode code ships and the existing "Autonomous OFF" chrome is unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Queue list | pending drafts in D1 | 200 `{items}` oldest-first, private no-store headers | N/A |
| Anon queue/decision | no token | opaque 403 envelope | Fail closed |
| Approve | `{action:"approve"}` | outcome approved + decidedAt/decidedBy; `gate.decided` evidence; 200 updated draft | N/A |
| Edit-then-approve | `{action:"edit", editedBody}` | outcome edited; original body preserved; evidence recorded | 400 on empty editedBody |
| Reject public | `{action:"reject", rejectReason, private:false}` | `rejectReason` on the wire + evidence payload + ops. archive card | 400 when reason empty |
| Reject private | `{action:"reject", rejectReason, private:true}` | public wire `rejectReason` null; text only in the private column; absent from every public surface and payload | N/A |
| Double decision | second POST on a decided draft | 409 already-decided envelope | Conflict |
| Unknown draft | bad id | 404 | N/A |
| Invalid body | wrong shape / unknown action | 400 | N/A |
| Empty queue | none pending | `{items: []}` + designed EmptyState | N/A |
| Keyboard | J/K/A/E/R | selection moves / action fires; ignored while typing in inputs | N/A |
| Session expired mid-action | 403 on POST | panel shows re-auth needed; no fake success; queue refetch | Fail closed |

</intent-contract>

## Code Map

- `migrations/0010_draft_reject_reason.sql` -- NEW -- rebuild `drafts` (0009 pattern, copy rows, restore `idx_drafts_run`) adding `reject_reason` + `reject_reason_private`: non-empty when present; reasons only on `outcome = 'rejected'`; a rejection requires at least one of the two.
- `src/shared/schemas/run.ts:156-185` -- ADD `rejectReason: z.string().min(1).nullable()` to `DraftRecordSchema` — required-nullable, never a missing key.
- `src/shared/db/repos/draftsRepo.ts` -- `DRAFT_COLUMNS`/`DraftRow`/`mapDraft` gain `reject_reason` → `rejectReason`; ADD `listPending` (outcome IS NULL, `created_at ASC, id ASC`); ADD the validate-then-UPDATE decision statement (loads the row, refuses when already decided, merges, parses, binds).
- `src/pipeline/gate/approval.ts` -- NEW -- `decide(db, {draftId, action, operator, editedBody?, rejectReason?, rejectReasonPrivate?, now})` with a typed result (`not_found` / `already_decided` / `invalid` / updated record); one `db.batch` of the draft UPDATE + the projector's `gate.decided` append; the projector's scrub applies to the payload.
- `src/server.ts:272-313` -- EDIT the admin block: keep session; ADD `GET /api/admin/queue` (→ `{items}` with admin headers) and `POST /api/admin/drafts/:id/decision` (strict Zod body: `{action: "approve"|"edit"|"reject", editedBody?, rejectReason?, private?}` — `private` moves the reason into the private column; the router resolves the two storage fields for the gate); 200/400/404/409; unknown admin paths keep the 404 placeholder.
- `src/surfaces/admin/ApprovalQueue.tsx` -- NEW -- handoff anatomy (`PML Admin.html:190-355`): `.queue` grid with `.qitem` list (aria-selected, focus-visible) and `.work` panel; fetch per the `useAdminSession` pattern (same-origin, abort on unmount, fail to a signed-out EmptyState); J/K/A/E/R handlers skipping inputs/textareas; edit mode with the `.editor` textarea; rejectbox with reason + private checkbox (`PML Admin.html:258-270`); resolved state; queue refetch after each decision.
- `src/surfaces/admin/AdminShell.tsx:99-113` -- EDIT the `#queue` band: placeholder EmptyState → `<ApprovalQueue />`. The `#mode` band stays 3.13's placeholder.
- `src/shared/ui/pml.css` -- PORT `.queue` / `.qitem` / `.work` / `.editor` / `.actions` / `.rejectbox` / `.privacy` / `.kbd` from `PML Admin.html:22-55`.
- `src/surfaces/ops/PendingDrafts.tsx` -- EDIT the archive card: render `rejectReason` when present as the published rejection reason.
- `src/shared/lib/adminGuard.ts` / `access.ts` -- READ ONLY: the guard, envelope, and `displayName` semantics; new routes inherit them.
- `src/server.test.ts:58-163` -- READ ONLY test patterns: explicit `anon`/`authed` envs, signed-JWT blocks, cache-header assertions.
- `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Admin.html` -- queue anatomy, keyboard semantics (J next, K prev, input guard), resolved copy, reject-privacy copy.

## Tasks & Acceptance

**Execution:**
- `migrations/0010_draft_reject_reason.sql` -- reject-reason columns with CHECKs -- FR14 storage
- `src/shared/schemas/run.ts` + `src/shared/db/repos/draftsRepo.ts` -- `rejectReason` wire + `listPending` + decision statement -- the data layer
- `src/pipeline/gate/approval.ts` -- the decision module -- only the gate records gate decisions
- `src/server.ts` -- queue + decision routes under the existing guard -- the operator's door
- `src/surfaces/admin/ApprovalQueue.tsx` + `AdminShell.tsx` + `pml.css` -- the operator surface
- `src/surfaces/ops/PendingDrafts.tsx` -- public reason on the archive card
- `src/shared/api/adminApi.test.ts` + `src/surfaces/admin/approvalQueue.test.tsx` + `approvalQueue.mount.test.tsx` + `pendingDrafts.test.tsx` fixture updates -- I/O matrix (API + HTML + keyboard + public-leak scans)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-10-admin-hitl-approval-queue` in-progress then done -- tracking

**Acceptance Criteria:**
- Given pending drafts, when the operator opens `/admin#queue`, then J/K move the selection and A/E/R act on the focused draft; the work panel shows the full body, proposed diff, and flags, and every action posts one decision and refreshes the queue
- Given approve, the draft gains `outcome: "approved"` + `decidedAt`/`decidedBy` (displayName) and a `gate.decided` Evidence event in one atomic write; F1 tables and run status are untouched
- Given edit-then-approve, `editedBody` carries the operator text and the original draft body is preserved
- Given reject with a public reason, the reason lands on `DraftRecord.rejectReason`, in the `gate.decided` payload, and on the ops. archive card; given the private control, the text lands only in the private column and whole-body scans prove it absent from every public surface and payload
- Given anonymous callers, queue and decision answer the same opaque 403 as the rest of the admin perimeter
- Given an already-decided draft, a second decision answers 409 without writing
- Given nothing pending, the queue shows the designed EmptyState; given a failed/expired session, the panel fails closed to a re-auth state with no fake success

## Spec Change Log

## Review Triage Log

## Review Triage Log

### 2026-09-12 — Review pass
- verdicts: 31 findings — high 3, medium 2, low 12, false 14, maybe-false 0
- findings:
  - `[high]` `[patch]` sprint-status.yaml no longer parses as YAML — `3-9`/`3-10`/`3-11` keys written at 3-space indent inside the 2-space `development_status` mapping (blind-hunter + edge-case-hunter + verification-gap, independently) — verified with a direct parse (`mapping values are not allowed here`, line 79 col 38); the BMAD tooling and the next build-auto dispatch read this file. Fixed: 2-space alignment restored on exactly those three lines; parse re-verified.
  - `[false]` `[reject]` Spec frontmatter `in-progress` vs sprint-status `done` (blind-hunter) — transient mid-run state; Finalize writes `status: done` and the follow-up flag, reconciling both.
  - `[low]` `[reject]` `normalizeAdminPath` is undocumented drift from the spec's Code Map (blind-hunter) — the local mirror is the only constraint-satisfying solution (the spec froze `adminGuard.ts`), its parity with the guard is pinned by three encoded/double-slash tests, and this row records it.
  - `[low]` `[reject]` `normalizeAdminPath` copy is a standing split-brain hazard (blind-hunter) — same root: the guard is deliberately frozen; a shared export would edit the guarded module the spec forbade; parity is tested.
  - `[low]` `[reject]` `decide()` maps every `applyDecisionStmt` throw to `invalid` → 400, including rare already-decided/DB-error windows (blind-hunter + edge-case-hunter ×2 + verification-gap other) — the sequential 409 contract is tested and holds; the concurrent loser's batch cannot double-write (WHERE `outcome IS NULL` guard + idempotent deterministic evidence id) and its 200 carries the actual winner's state; a single-operator surface makes the window vanishingly rare — recorded, not patched.
  - `[false]` `[reject]` The server catch logs raw `error.message`, possibly echoing operator content (blind-hunter) — identical to the established `public_api.error` convention; no path carries a private reason into an error message (the gate catches repo throws before the server catch).
  - `[false]` `[reject]` Post-batch `getById` miss would 404 after the write landed (blind-hunter) — no draft-deletion path exists anywhere in the codebase (runs/drafts are never deleted).
  - `[low]` `[reject]` No max length on `editedBody`/`rejectReason`; `listPending` unbounded (blind-hunter) — operator-only surface (the only sender is the verified operator); D1 row limits fail loudly; the unbounded list matches the repo-wide v1 no-cursor contract (`/api/runs`, `/api/drafts`).
  - `[false]` `[reject]` HEAD accepted but untested and may carry a body (blind-hunter) — HEAD parity is the router-wide pre-existing pattern (no route in the repo tests HEAD individually); the runtime strips HEAD bodies; the matrix's 405 row is tested.
  - `[medium]` `[patch]` Ctrl/Cmd/Alt + A/E/R/J/K fire queue actions — Ctrl+A (select-all, a routine copy gesture outside inputs) posts an approve decision; the handoff shares the bug but is a reference, not production code — fixed: the keyHandler returns early on `metaKey || ctrlKey || altKey`, plus a mount test asserting ctrl+A posts nothing.
  - `[low]` `[reject]` `aria-selected` on buttons without a listbox role (blind-hunter) — the handoff's own pattern; the buttons are focusable and operable (Tab/Enter/click), focus-visible styled; role semantics are an a11y enhancement beyond the handoff for a single-operator surface.
  - `[medium]` `[patch]` `rejectText`/`rejectPrivate` never reset — the next draft's reject box opens pre-populated with the previous draft's (possibly private-marked) reason and confirm already enabled; a wrong reason can publish against a different draft — fixed: both reset on a successful confirm and on every selection change (J/K/click), plus a mount test asserting the next draft's box starts empty with confirm disabled.
  - `[low]` `[reject]` `postDecision` treats non-OK/non-403/non-409 uniformly and casts the 200 body unvalidated (blind-hunter) — own authenticated same-origin server; the mount suite pins exact request/response bodies; client-side guards already disable the buttons that could produce 400s.
  - `[false]` `[reject]` Post-refetch `Math.min` clamp "silently moves the selection" (blind-hunter) — the clamp IS next-item progression: actions act on the selected draft, so after it leaves the queue the selection lands on the next pending draft, which is the queue UX the handoff draws.
  - `[false]` `[reject]` Migration 0010's comment ("no decided Draft can exist") contradicts its faithful column copy (blind-hunter) — the comment states the pre-state correctly (the decision writer ships in this diff); copying all columns is the 0009 rebuild idiom and is defensive, not contradictory.
  - `[low]` `[reject]` Three parallel validators (`isQueueItem`, `isDraftRecord`, `DraftRecordSchema`) will drift (blind-hunter) — the shallow client guard per surface is the reviewed 3.7/3.8/3.9 convention; client-side Zod parsing would pull the schema library into the browser bundle.
  - `[false]` `[reject]` The private-reason whole-body scans miss the evidence-detail surface (blind-hunter) — the private column is excluded from `DRAFT_COLUMNS`, so no read path in the codebase can SELECT it into any wire; the scanned surfaces sample the one wire shape that exists.
  - `[low]` `[reject]` `applyDecisionStmt`'s patch schema lacks the reject-requires-reason refine (edge-case-hunter) — the gate enforces it (discriminated-union refine) and the 0010 CHECK fails closed loudly; no second caller exists to guard against.
  - `[low]` `[reject]` (carried) `decide` catch maps the concurrent already-decided race to 400 (edge-case-hunter) — grouped with the decide-catch row above.
  - `[low]` `[reject]` (carried) `decide` race: UPDATE 0 rows still appends evidence / returns the winner's record (edge-case-hunter) — grouped with the decide-catch row above: the deterministic evidence id makes the append idempotent (`INSERT OR IGNORE`), and the loser's response reflects the actual state with no double-write.
  - `[false]` `[reject]` Draft-id double decode — ids containing a literal `%` resolve to a different draft (edge-case-hunter) — pipeline draft ids are deterministic `[-a-z0-9]`-shaped (`evidenceId`/draftAndReview); no `%` id exists; the encoded-id test pins the single-encode case.
  - `[low]` `[reject]` One malformed queue item misclassifies the whole queue as "re-authentication needed" (edge-case-hunter) — the every()-fail-closed guard is the 3.9-spec'd convention ("do not fork it here"); the server parses every row through `DraftRecordSchema` before emitting, so the guard failing requires the server to emit a schema-invalid row.
  - `[false]` `[reject]` Keyboard guard misses `select`/`contenteditable` (edge-case-hunter) — no such elements exist in the component tree (only buttons, one checkbox `input`, two `textarea`s — all guarded).
  - `[high]` `[patch]` (carried) sprint-status.yaml parse failure (edge-case-hunter) — grouped with the first row; fixed.
  - `[low]` `[reject]` (carried) decide-catch 400-vs-409 under concurrency (verification-gap, other) — grouped with the decide-catch row above.
  - `[false]` `[reject]` No migration test against a pre-0010 snapshot holding decided rows (verification-gap, other) — impossible pre-state: the decision writer ships in this diff, so no pre-0010 database can contain a decided draft; the migration's copy path is exercised on every fresh apply (apply-migrations runs 0001→0010 in every test run).
  - `[false]` `[reject]` The queue leak scan only protects the column name on pending rows (verification-gap, other) — traced by the layer itself: `listPending` filters `outcome IS NULL` and `DRAFT_COLUMNS` never selects the private column; noted, no action.
  - `[false]` `[reject]` Test surface is jsdom/static/API-level, not a real browser with a real Access session (intent-alignment) — the harness Patrick chose (retro item 6) plus the real-JWT perimeter suite in `server.test.ts`; the auth contract is verified at the API/DB layer where it lives.
  - `[false]` `[reject]` "Preserved for public diff" asserted at the data layer, not as a rendered diff (intent-alignment) — the public before/after render is the 3.8 evidence page's tested `editedBody` diff; this story's contract is the preservation itself (`body` + `editedBody` both stored, schema-refined).
  - `[false]` `[reject]` The private control is tested at markup/mount level, not against a live Access session (intent-alignment) — the same split as every admin surface since 1.4: the perimeter is the signed-JWT suite's job; the UI layer under jsdom pins the exact POST bodies.

## Design Notes

- Whole-reason privacy is v1 (the handoff's one textarea + checkbox); "portion" granularity can split later without schema change — both columns exist.
- `server.ts` stays the composition root for admin routes (the session precedent); the gate module owns decision semantics so 3.11 can extend it with publish.
- The `gate.decided` payload snapshots the public reason at decision time (append-only record); the drafts column is the queryable source of truth.
- `rejectReason` is required-nullable on the wire — hand-built `DraftRecord` test fixtures gain `rejectReason: null`; SQL-seeded rows need no change (mapDraft emits null).
- Remote D1: apply 0010 to staging before production (epic-2 retro item 8's runbook note).

## Verification

**Commands:**
- `npm test` -- expected: pass, including `adminApi.test.ts`, `approvalQueue.test.tsx`, `approvalQueue.mount.test.tsx`
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Dev (`ACCESS_DEV_BYPASS=true` on localhost): open `/admin?surface=admin`, queue lists seeded pending drafts; J/K/A/E/R round-trip; reject reasons appear on ops. `#drafts`

## Auto Run Result

Status: done

Summary: The operator's Approval Gate is live. `GET /api/admin/queue` lists pending drafts (oldest first, operator-only, private no-store) behind the untouched Access perimeter; `POST /api/admin/drafts/:id/decision` records approve / edit-then-approve / reject through a new pipeline gate module — one atomic `db.batch` of the draft UPDATE plus a scrubbed `gate.decided` Evidence event, `decidedBy` = the verified operator's public-safe displayName. Reject reasons are public-by-default: the public portion rides `DraftRecord.rejectReason` (wire + evidence payload + the ops. archive card), and the private control stores its text in a column no public read path selects. The admin queue implements the handoff anatomy — J/K navigate, A/E/R act (modifier-guarded), edit buffer preserving the original body, reject box with the private checkbox, resolved states, fail-closed re-auth. Migration 0010 adds the two reason columns with cross-field CHECKs (a rejection requires a reason; reasons only on rejections). HITL stays the default: no mode controls, `#mode` stays 3.13's placeholder.

Files changed:
- `migrations/0010_draft_reject_reason.sql` — `reject_reason` + `reject_reason_private` columns with CHECKs (0009 rebuild pattern)
- `src/shared/schemas/run.ts` — `rejectReason` on `DraftRecordSchema` (required-nullable)
- `src/shared/db/repos/draftsRepo.ts` — columns/mapping, `listPending`, validate-then-UPDATE decision statement
- `src/pipeline/gate/approval.ts` — the decision module (typed results, atomic batch, evidence append)
- `src/server.ts` — `GET /api/admin/queue` + `POST /api/admin/drafts/:id/decision` under the existing guard
- `src/surfaces/admin/ApprovalQueue.tsx` + `AdminShell.tsx` — the operator surface (handoff anatomy, keyboard, fail-closed)
- `src/shared/ui/pml.css` — handoff queue/work/editor/rejectbox classes
- `src/surfaces/ops/PendingDrafts.tsx` — public rejection reason on the archive card
- `adminApi.test.ts` + `approvalQueue.test.tsx` + `approvalQueue.mount.test.tsx` + fixture updates across the 3.9/3.8 test files — the I/O matrix incl. whole-body private-reason leak scans and F1/run-untouched assertions
- `_bmad-output/implementation-artifacts/spec-3-10-admin-hitl-approval-queue.md` / `sprint-status.yaml` — tracking

Review: 4 layers, 31 findings — 3 patch entries applied (sprint-status YAML parse break — 3-space indentation restored and parse re-verified; Ctrl/Cmd+A modifier guard on the queue's keyboard actions; reject-state reset across drafts so a previous — possibly private-marked — reason cannot carry onto another draft); 12 low + 14 false rejected with recorded evidence (decide-catch race windows on a single-operator surface, HEAD parity precedent, guard-convention precedents, impossible pre-states).

Follow-up review recommended: true (a high was patched on the first pass — the sprint-status parse break). Unverified risk: no automated check parses `sprint-status.yaml` (the verification-gap layer traced that nothing in the pipeline reads it), so a future tracking-file corruption would again ship silently; the modifier-guard and reject-reset fixes are pinned only by the jsdom mount suite, not a real browser session.

Verification: `npm test` — 617 passed (31 files). `npm run check` — oxfmt, oxlint, tsc exit 0. `sprint-status.yaml` — parse re-verified directly after the fix.

Residual risks: remote D1 must apply 0010 to staging before production (epic-2 retro item 8); no live-browser pass of the queue (jsdom + static markup stand in); the concurrent double-decision window returns the winner's state rather than 409 (single-operator surface; no double-write is possible).
