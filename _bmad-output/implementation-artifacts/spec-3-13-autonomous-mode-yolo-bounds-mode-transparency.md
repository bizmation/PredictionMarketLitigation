---
title: 'Story 3.13: Autonomous Mode, YOLO Bounds & Mode Transparency'
type: 'feature'
created: '2026-09-13'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 957ab23623d379a420bb0391aa6eb65dd77a5bda
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred:
  - summary: >-
      modeRepo.set can treat get()'s fail-closed HITL/70 as the before-image
      if parse throws while a live row exists.
    evidence: |-
      Unverified: ApprovalModeSchema.parse would have to throw on a row
      that passed SQL CHECKs. If true, a later POST could reset YOLO.
    location: >-
      src/shared/db/repos/modeRepo.ts:127
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** HITL is hardcoded: `#mode` is an EmptyState on admin and ops., every Run stamps `hitl`, and eligible Drafts never auto-approve. Readers cannot see the gate mode, threshold, or who changed them.

**Approach:** Operator-only mode/threshold controls, a public `/api/mode` projection, Runs stamped from the live mode, and a code-level auto-approve path that calls the existing gate when every FR-17 check passes — escalations stay in the human queue.

## Boundaries & Constraints

**Always:**
- Launch default HITL + threshold **70** (3.5 `AUTO_APPROVE_CONFIDENCE_THRESHOLD`). Store threshold as integer 0–100, same scale as `confidence`. Public even while HITL (inert for auto-approve).
- Only `requireOperator` may POST mode/threshold. Audit actor is `displayName` (never email). Non-operator Access JWT → same opaque 403 as queue/loop.
- Enable/disable and threshold writes append `mode_audit` (who, when, prior, next) visible on `ops.#mode`. Unchanged POST is 200 with no new audit row.
- New Runs read live mode at insert (`ensureRun` / `startOperatorRun`). Already-recorded Runs and published provenance stay frozen.
- Auto-approve only when `run.mode === "yolo"` and **all** hold: `ineligible` empty of eval/guardrail/tier2 reasons, confidence ≥ **current** threshold, not `posture_flip`, not `party_characterization`. Else leave pending.
- `posture_flip`: parsed diff has `posture` with `from !== to`. `party_characterization`: `targetEntityType === "entities"`. Low-risk = not those escalate categories.
- Auto-approve calls `decide({ action: "approve" })` with `provenanceKind: "agent"` and `decidedBy: "approval-agent"`. Human `/api/admin/drafts/:id/decision` always `provenanceKind: "human"` (update the 3.11 yolo-fixture test). Append `yolo.validated` Evidence (verdict approve|escalate, draftId, confidence, threshold, reasons) **before** decide.
- Fail-closed: missing mode row → HITL/70; public GET errors → show HITL default, never imply YOLO.

**Never:**
- No `waitForApproval` Workflow pause. No `publish_f1` / yolo tools (`ALLOWED_TOOLS.yolo` stays `[]`). No `complete({ role: "yolo" })` (gateway still unseeded). No Access-perimeter edits. No `surfaces/*` → `pipeline/*`. No chat-reachable governance (3.14). No `gateway_config` seed. No float 0–1 threshold. No email on ops. audit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default public | No writes yet | `GET /api/mode` → `{ mode:"hitl", threshold:70, audit:[] }` | N/A |
| Enable YOLO | Operator POST `{mode:"yolo"}` | Mode yolo; audit row (prior hitl → yolo, displayName); ops. shows ON | N/A |
| Disable | POST `{mode:"hitl"}` | Mode hitl; new audit row | N/A |
| Threshold | POST `{threshold:80}` | Threshold 80; audit prior→next; HITL still does not auto-approve | N/A |
| No-op POST | Same as current | 200 current; **no** audit row | N/A |
| Anon / wrong identity | No token or other email POST `/api/admin/mode` | Opaque 403; mode unchanged | Fail closed |
| Bad body | mode/threshold out of set | 400 | Fail closed |
| Stamp | YOLO on; new scheduled/manual Run | `runs.mode=yolo` | N/A |
| Auto-approve | yolo Run; draft passes all checks | F1 `provenance_kind=agent`; Evidence `yolo.validated` + `gate.decided`; pending list drops it | N/A |
| Escalate posture | yolo Run; diff posture from≠to | Stays pending; `yolo.validated` verdict escalate; `ineligible` includes `posture_flip` | N/A |
| Escalate party | yolo Run; `targetEntityType=entities` | Same, `party_characterization` | N/A |
| Escalate baked | yolo Run; `tier2_only` / below live threshold / eval_fail / evals_not_run / guardrail_fail | Stays pending | N/A |
| HITL run | mode hitl; otherwise-eligible draft | Never auto-approve | N/A |
| Mixed | one eligible + one escalate | Eligible publishes agent; escalate stays in queue; Run stays `awaiting` | N/A |
| Human on yolo Run | Operator approves leftover | F1 `provenance_kind=human` | N/A |

</intent-contract>

## Code Map

- `migrations/0012_approval_mode.sql` -- NEW -- `approval_mode` singleton (`id='current'`, `mode` hitl\|yolo, `threshold` 0–100, `version`, `updated_at`) **seeded** hitl/70; `mode_audit` (id, created_at, actor_display_name, kind mode\|threshold, prior_json, next_json). Rebuild `evidence_events` (0011 pattern) admitting `yolo.validated`.
- `src/shared/schemas/vocabulary.ts:252-279` -- ADD `yolo.validated`; comment CHECK now 0012.
- `src/shared/schemas/run.ts:107-113` -- ADD `posture_flip`, `party_characterization` to `INELIGIBLE_REASON_VALUES`.
- `src/shared/schemas/mode.ts` -- NEW -- public `{ mode, threshold, version, updatedAt, audit[] }` + admin POST body.
- `src/shared/db/repos/modeRepo.ts` -- NEW -- `get()`, `set({mode?, threshold?, actor, now})` version bump + audit only on change.
- `src/pipeline/agents/draftAndReview.ts:36-103` -- REPLACE const: `ineligibleFor` takes live threshold; add posture/party reasons from diff/target.
- `src/pipeline/gate/approval.ts:31-129` -- ADD optional `provenanceKind` on approve (default `human`). Admin route omits it.
- `src/pipeline/gate/yoloPolicy.ts` -- NEW -- `eligible(draft, threshold)` + `autoApproveRun(db, runId)` loops pending, appends `yolo.validated`, `decide()` with agent provenance. **No** gateway call.
- `src/pipeline/workflow/dailyRunSteps.ts:60-63` / `dailyRun.ts:135-138` -- stamp `mode` from `modeRepo.get()`. After `afterPackaging`, if yolo call `autoApproveRun`.
- `src/pipeline/ai/actionPolicy.ts:37-43` -- READ ONLY empty yolo allowlist.
- `src/shared/lib/adminGuard.ts` / `access.ts` -- READ ONLY.
- `src/server.ts:583-590` -- ADD `POST /api/admin/mode` before the 404 placeholder; keep unknown-admin 404. Admin UI reads public `GET /api/mode`.
- `src/shared/api/publicRouter.ts:270-291` -- ADD `GET /api/mode` `jsonNoStore`.
- `src/shared/ui/pml.css` -- ADD handoff `.modepanel` / `.switchrow` / `.toggle` / `.modebox` (Admin.html:57-67, Ops.html:18-25). Reuse `.panel`/:703.
- `src/surfaces/admin/ModeControls.tsx` -- NEW -- replace `#mode` EmptyState; toggle + range; GET `/api/mode`; POST `/api/admin/mode`; 403 → signedOut EmptyState (LoopControls pattern).
- `src/surfaces/admin/AdminShell.tsx:31-33,91-92,119-131` -- mount ModeControls; TrustBar WarnChip from live mode.
- `src/surfaces/ops/ModeTransparency.tsx` -- NEW -- replace ops `#mode` EmptyState; current mode, threshold, audit dl (displayName only).
- `src/surfaces/ops/OpsShell.tsx:115-157` -- mount it; TrustBar `Gate: HITL`/`YOLO` from same GET.
- `src/surfaces/ops/EvidenceDetail.tsx:160-169` -- `yolo.validated` extras (verdict, draftId).
- Tests: `adminApi.test.ts` (POST 403/400/audit, drop `#mode` 404 lock); `publicApi.test.ts` GET /api/mode; `yoloPolicy` + `draftAndReview` ineligible; `dailyRun` stamp + auto-approve; ModeControls/ModeTransparency mount; `shells.test.tsx:141,289` placeholder gone; `adminApi.test.ts:605` human POST on yolo Run → `human`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-13-…` in-progress then done.

## Tasks & Acceptance

**Execution:**
- `migrations/0012_approval_mode.sql` -- seed HITL/70 + audit table + admit `yolo.validated`
- `src/shared/schemas/vocabulary.ts` / `run.ts` / `mode.ts` -- events, ineligible reasons, public wire
- `src/shared/db/repos/modeRepo.ts` -- read/write + audit-on-change
- `src/pipeline/agents/draftAndReview.ts` -- live threshold + posture/party ineligible
- `src/pipeline/gate/approval.ts` -- caller provenance on approve
- `src/pipeline/gate/yoloPolicy.ts` -- auto-approve via `decide()`, never a tool
- `src/pipeline/workflow/dailyRunSteps.ts` / `dailyRun.ts` -- stamp live mode; yolo hook after packaging
- `src/server.ts` / `src/shared/api/publicRouter.ts` -- admin POST + public GET
- `src/shared/ui/pml.css` -- port modepanel/modebox/toggle
- `src/surfaces/admin/ModeControls.tsx` / `AdminShell.tsx` -- wire `#mode` + TrustBar
- `src/surfaces/ops/ModeTransparency.tsx` / `OpsShell.tsx` / `EvidenceDetail.tsx` -- public band + validation extras
- tests + `sprint-status.yaml` -- I/O matrix, mount, placeholder removal, 3.11 fixture update

**Acceptance Criteria:**
- Given `/admin#mode` with Access, when I turn Autonomous on, then ops. `#mode` and `GET /api/mode` show YOLO, threshold, and an audit row with my displayName — not my email
- Given a non-operator identity, when they POST `/api/admin/mode`, then they get the same opaque 403 as other admin writes and the public mode is unchanged
- Given YOLO on and a new Run whose Draft passes every bound, when packaging finishes, then that Draft is live as agent-approved and Evidence lists `yolo.validated` plus `gate.decided`
- Given YOLO on and a posture flip, Tier-2-only, below-threshold, eval-fail, evals-not-run, guardrail fail, or entities-target Draft, when packaging finishes, then it stays pending for the human queue and is not live
- Given HITL (default), when a otherwise-eligible Draft is packaged, then nothing auto-approves
- Given ops. with no login, when I open `#mode`, then I see current mode, the numeric threshold, and recent mode/threshold audits

## Spec Change Log

## Review Triage Log

### 2026-09-13 — Review pass
- verdicts: 35 findings — high 0, medium 11, low 15, false 8, maybe-false 1
- findings:
  - `[false]` `[reject]` autoApproveRun retry PK-conflicts on yolo.validated (blind-hunter) — `INSERT OR IGNORE` on deterministic evidence ids; a retry does not throw
  - `[medium]` `[patch]` yolo.validated approve written before decide(), result ignored (blind-hunter) — approve Evidence now writes only after `decide()` returns `decided`
  - `[medium]` `[patch]` reviewDailyRun catch finishFailed after awaiting (blind-hunter) — `finishFailed` returns without `run.failed` when `completeRun` does not move the row
  - `[low]` `[reject]` ineligibleFor vs reasonsFor disagree on null confidence (blind-hunter) — null confidence is already `evals_not_run`; extra `below_threshold` is not an everyday path
  - `[medium]` `[patch]` threshold slider POSTs every onChange tick (blind-hunter) — commit on pointerup/blur; failed POST restores last confirmed value
  - `[low]` `[reject]` queue/pending cards omit posture_flip / party_characterization (blind-hunter) — 3.13 AC is stay-pending, not new flagrow chrome; `yolo.validated` carries the bound
  - `[medium]` `[patch]` EvidenceDetail TrustBar hardcoded Gate: HITL; stepLabel drops numeric payload (blind-hunter) — chrome now uses `useApprovalMode`; verdict/draftId extras were already enough for the step line
  - `[low]` `[reject]` GET /api/mode loads unbounded mode_audit (blind-hunter) — launch volume is tiny; a LIMIT is extra surface
  - `[medium]` `[reject]` missing tests bundle (fail-closed singleton, frozen runs.mode, baked escalate, retry, slider) (blind-hunter) — split across VG patches and false retry; leftover singleton-delete is not everyday after 0012 seed
  - `[low]` `[reject]` spec in-progress vs sprint done; YOLO has no confirm (blind-hunter) — confirm is not in the story ACs (unlike supersede); bookkeeping is finalize's job
  - `[low]` `[reject]` autoApproveRun uses wall-clock not gatewayDeps.now (blind-hunter) — production insert and decide share Date; injected now is a test-clock concern
  - `[low]` `[reject]` /api/mode fetch copied three times; empty actor can 500 (blind-hunter) — production shells inject `useApprovalMode`; operator displayName is never whitespace
  - `[medium]` `[patch]` decide() invalid/already_decided after approve validation (edge-case-hunter) — grouped with the decide-result patch
  - `[medium]` `[patch]` slider localThreshold diverges on non-OK POST (edge-case-hunter) — grouped with pointerup/rollback
  - `[low]` `[reject]` slider min 50 max 99 cannot represent API 0–49/100 (edge-case-hunter) — Design Notes lock that range so 70 is in the control
  - `[maybe-false]` `[defer]` get() fail-closed DEFAULT used as set() before-image (edge-case-hunter) — unverified parse-throw on a CHECK-valid row; recorded in frontmatter
  - `[medium]` `[patch]` autoApproveRun never exercises a non-default live threshold (verification-gap) — added threshold 90 / confidence 80 pending case
  - `[medium]` `[patch]` production GET fail-closed runs through untested useApprovalMode (verification-gap) — jsdom 500 keeps HITL/70
  - `[medium]` `[patch]` TrustBar live YOLO chrome unpinned (verification-gap) — stubbed yolo GET asserts Gate: YOLO / Autonomous ON
  - `[medium]` `[patch]` Ops EvidenceDetail TrustBar still hardcodes Gate: HITL (verification-gap) — grouped with Evidence chrome live mode
  - `[false]` `[reject]` architecture waitForApproval / roles.yolo LLM not implemented (intent-alignment) — story 3.13 as planned is code-bounded auto-approve; empty gateway would block an LLM YOLO agent
  - `[false]` `[reject]` 3.2 approval-agent role config not seeded (intent-alignment) — yolo role already exists in vocabulary; seed remains the 3.2 leftover
  - `[low]` `[reject]` admin toggle → ops.#mode not one E2E test (intent-alignment) — HTTP + injected mounts cover both surfaces
  - `[false]` `[reject]` non-operator tests assert HTTP 403 not EmptyState JSON (intent-alignment) — opaque 403 is the AC; signedOut is a separate mount
  - `[low]` `[reject]` packaging→live not asserted via public F1 GET / pending banner (intent-alignment) — SQL provenance + outcome are the same records those GETs read
  - `[low]` `[reject]` baked FR-17 reasons not run through autoApproveRun (intent-alignment) — `reasonsFor` unit tests plus live-threshold autoApprove cover the same function
  - `[false]` `[reject]` HITL no-auto-approve not tested on apex (intent-alignment) — apex is not the HITL gate; pipeline HITL skip is the behavior
  - `[false]` `[reject]` human leftover on yolo Run only HTTP-tested (intent-alignment) — the 3.11 fixture update is that POST
  - `[low]` `[reject]` anonymous ops.#mode tested on component mock not live GET (intent-alignment) — publicApi GET /api/mode is the live projection
  - `[low]` `[reject]` fail-closed missing singleton untested (intent-alignment) — 0012 seeds the row; get() catch is the fail-closed
  - `[low]` `[reject]` FR-17 validation log UI omits confidence/threshold/reasons (intent-alignment) — Evidence lists the event; payload extras are on GET /api/runs/:id
  - `[false]` `[reject]` existing runs.mode not proven frozen after a mode write (intent-alignment) — nothing in this diff UPDATEs `runs.mode` after insert
  - `[false]` `[reject]` HITL threshold write test does not offer a Draft to auto-approve (intent-alignment) — HITL-stamped Runs never enter autoApproveRun
  - `[low]` `[reject]` slider range not POSTed from the UI in tests (intent-alignment) — HTTP threshold 80 plus pointerup mount cover the control
  - `[low]` `[reject]` sprint-status done while spec was in-progress (intent-alignment) — finalize writes spec `done`

## Design Notes

- Threshold stays 0–100 (3.5), not the handoff's 0.92 float. Display the integer; slider `min=50` `max=99` so 70 is in range. UX 0.80–0.99 is mock chrome.
- Mode audit is its own table: `evidence_events.run_id` is NOT NULL and mode is global, not a Run.
- Deterministic policy agent (no yolo LLM): FR-17/FR-21 require code bounds; empty `gateway_config` would block Autonomous if we required `complete({ role: "yolo" })`.
- 3.11's "yolo Run + human POST → agent provenance" was the fixture until this story. Mixed Runs must label the **caller**.

## Verification

**Commands:**
- `npm test` -- expected: pass, including mode I/O matrix and unchanged empty-allowlist tests
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Dev bypass: `/admin#mode` toggle on → ops. `#mode` shows YOLO + audit; a fixture-eligible Run publishes agent-approved; a posture-flip Draft stays under the pending banner

## Auto Run Result

Status: done

Summary: Autonomous mode is a live, audited gate. HITL/70 is the seed; only the operator can POST `/api/admin/mode`; `GET /api/mode` is public. New Runs stamp the live mode. YOLO auto-approves eligible Drafts through existing `decide()` (agent provenance, `yolo.validated` Evidence); escalations stay in the human queue. No yolo LLM tool.

Files changed:
- `migrations/0012_approval_mode.sql` — singleton + audit + `yolo.validated`
- `src/shared/schemas/mode.ts` / `run.ts` / `vocabulary.ts` — wire, ineligible reasons, event
- `src/shared/db/repos/modeRepo.ts` — get/set + audit-on-change
- `src/pipeline/gate/yoloPolicy.ts` / `approval.ts` / `draftAndReview.ts` / daily-run stamp+hook
- `src/server.ts` / `publicRouter.ts` — admin POST + public GET
- `ModeControls` / `ModeTransparency` / shells / Evidence chrome / `pml.css`
- tests + `sprint-status.yaml` + this spec

Review: 4 layers, 35 findings — 0 high. Patches: decide-then-validate; finishFailed no-op when not running; slider pointerup + rollback; Evidence/ops/admin live Gate: YOLO tests; live threshold 90 case. Deferred: unverified modeRepo parse-throw before-image. Rejected lows/false as recorded above.

Follow-up review recommended: true — two or more mediums patched. Unverified risk: a crash after `decide()` and before `yolo.validated` leaves an agent-approved Draft without the validation event (retry sees `already_decided` and skips the append).

Patch counts by verdict: high 0, medium 7 entries (decide honesty, finishFailed, slider, Evidence chrome, live-threshold test, useApprovalMode fail-closed, TrustBar YOLO).

Verification: `npm test` — 701 passed (39 files). `npm run check` — oxfmt/oxlint/tsc exit 0. No live-browser pass of `/admin#mode` (jsdom mounts + Worker POSTs stand in).

Residual risks: remote D1 still needs migration 0012; `gateway_config` remains unseeded; slider 50–99 vs API 0–100.
