---
title: '3.37 — Prove the live governed loop and reassess Epic 3'
type: 'chore'
created: '2026-10-11'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '44afaf459976f9013635e9f6c52838e27c1c0b0e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-36-verify-the-corrected-staging-run-and-gateway.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-retro-2026-09-22.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 3 is not accepted until a real docket change on staging goes from source through Patrick's named approval to exactly one published F1 row, with matching public Evidence, and a fresh retrospective judges that result. `run-20261010-0003` cannot serve: it was rejected, its drafts never received a model call, and nothing was published. `run-20261010-0004` was empty.

**Approach:** Reuse `run-20261010-0005` on `pml-build` (status `awaiting`, six undecided drafts, model `deepseek-ai/DeepSeek-V4-Flash` for every role). Patrick himself decides the named draft and the other five. No agent approves, rejects, or publishes. Then append an Epic 3 reassessment and close the nine action rows only with linked evidence.

## Boundaries & Constraints

**Always:** Staging only (`pml-build`, D1 `9e83494a-016e-4bff-9e07-7fca3a159a83`, hosts `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com`). Publish at most one of the six undecided `run-20261010-0005` heads, and only the draft Patrick names. Record his Access display name as `decidedBy`. Capture the evidence in the I/O matrix after he acts. The retrospective keeps the 2026-09-22/24 rejected verdict as history and draws open items from `deferred-work.md`, including R13, R14, the Furcolo citation tweak, and the thin-source deferral added with this spec.

**Never:** Approve or publish by an agent, YOLO, steering, or a scripted decision POST. Edit the draft body. Start another Run. Call DeepInfra again. Deploy, migrate, or touch production `pml`. Treat plan approval as approval of the legal text. Use `run-20261010-0003` or `0004`. Batch-reject after any head is approved. Silently close a retro action, mark Epic 3 done, or open Epic 4 without the publication evidence and an accepted verdict.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Named approval | Patrick clicks Approve on the Illinois draft in staging admin Review drafts, after the other five current heads are already rejected, default field checks left as loaded, body not edited | One staging `docket_events` row `de-case-il-cftc-481187549`, source `src-de-case-il-cftc-481187549`, case `updated_at` only, `kind`/`favors` follow the checks he left, provenance `human`. Run becomes `published` in that same batch. Public `gate.decided` names the draft, his display name, and `approvedText` | 409 conflict or not-ready: refresh, do not retry blindly, leave F1 unchanged |
| Five left awaiting | Illinois draft approved while any other current head is still undecided | That one F1 write still happens. Run stays `awaiting` because `finalizeDecidedRunStmt` requires zero undecided current heads | Do not claim a final published Run |
| Batch reject first | Manage runs → Reject this run, while every head is undecided | All six rejected with private reason `Rejected with the Run.` No `gate.decided`, no F1. Run becomes `rejected` | Cannot be combined with publishing the Illinois draft |
| Batch reject after approval | Same control after any approved or edited head | HTTP 409 `Run cannot be rejected.` (`reject_run_unpublished`). The approved row stays | Reject the other heads one by one from Review drafts |
| Steering revise | A steering turn on any 0005 draft | Paid drafter/reviewer calls. Not an approval and not this story | Do not do this. Period `acceptance-3-36-deepinfra-20261004` ends 2026-10-11T19:10:00Z; 12¢ of the 100¢ cap is already settled. Approval and per-draft reject make no model call |

## Decisions

Patrick chose option A for both questions at 9:01 AM ET on 2026-10-11, relayed by PML Eng Manager. He kept the full spec. His exact words:

> I approve draft d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549 by clicking Approve on https://build.predictionmarketlitigation.com/admin#queue, leaving the loaded field checks unchanged and not editing the body. I'll reject the other five privately first with 'Not the named 3.37 publication.'

The other five are `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187548`, `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-480884781`, `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481007743`, `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481153828`, and `d:run-20261010-0005:CourtListener:docket_events:de-case-ri-furcolo-480886814`. Private means the checkbox that stores `reject_reason_private` and leaves the public reason null. Loaded checks at threshold 70 are `kind` and `favors`. Patrick performs every click. No agent calls the admin API.

</frozen-after-approval>

## Code Map

- `src/surfaces/admin/ApprovalQueue.tsx` — Review drafts. Approve posts `{ action: "approve", acceptedFields }`. Reject posts `{ action: "reject", rejectReason, private }`. Do not change this file.
- `src/surfaces/admin/LoopControls.tsx` — Manage runs. Reject this run posts `{}` to `/api/admin/runs/:id/reject`. Do not change this file.
- `src/pipeline/gate/approval.ts` — `decide` is the only F1 writer. `RUN_REJECT_PRIVATE_REASON` is `Rejected with the Run.` `rejectAwaitingRun` writes no F1 and no per-draft `gate.decided`, and asserts `reject_run_unpublished`.
- `src/shared/db/repos/runsRepo.ts` — `finalizeDecidedRunStmt` sets `published` only when no current head is undecided and at least one head is approved or edited; otherwise `rejected`.
- `src/pipeline/gate/f1Apply.ts` — approve inserts `sources` and `docket_events`. Empty `statePatch` updates `cases.updated_at` only. `kind` and `favors` publish only when accepted.
- `src/pipeline/gate/yoloPolicy.ts` — `isThinSourceText` matches only `recap_short_description`. Do not change it here; the deferral is in `deferred-work.md`.
- `src/pipeline/steering/submitTurn.ts` — revise path. It cannot publish. Do not call it.
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-09-22.md` — append the reassessment. Do not rewrite the rejected history.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — nine rows. Eight are `done`. `epic-3-retro-item-17-deploy-current-main-to-pml-build-after-t` is still `in-progress` with a stale note. `epic-3-retro-live-governed-loop-acceptance` is `open`.
- `.agents/skills/bmad-retrospective/scripts/sprint_status.py` — use this script to record the verdict and action status. Do not hand-edit those keys.

## Tasks & Acceptance

**Execution:**
- [ ] `src/surfaces/admin/ApprovalQueue.tsx` -- no code change. After Patrick's answers are locked, he performs the recorded queue actions on `https://build.predictionmarketlitigation.com/admin#queue` while signed in. An agent does not click Approve or Reject.
- [ ] `_bmad-output/implementation-artifacts/spec-3-37-prove-the-live-governed-loop-and-reassess-epic-3.md` -- append the evidence below under Implementation Notes: decision response outcome, `decidedBy`, public `gate.decided` ids, Run status, the new `docket_events` and `sources` ids, staging tracker and ops URLs with HTTP status, spend still 12¢, and production brochure hashes unchanged from `bffcd5c604008e866cc2d71a0b9aa74478ba024167898f45fc910f3f0d41b270`.
- [ ] `_bmad-output/implementation-artifacts/epic-3-retro-2026-09-22.md` -- append a 2026-10-11 reassessment with the retrospective sections (epic summary, findings sourced from `deferred-work.md` and this evidence, dispositions, action items, verdict). Keep prior findings. Do not auto-apply fixes.
- [ ] `.agents/skills/bmad-retrospective/scripts/sprint_status.py` -- `update --file` the sprint status `--epic 3 --set-action-status` for `epic-3-retro-item-17-deploy-current-main-to-pml-build-after-t` (close from the 3.36 `run-20261010-0005` record) and `epic-3-retro-live-governed-loop-acceptance` (close only from this publication). Pass `--verdict` and `--ref` pointing at the retro. The script does not store the verdict or change `epic-3`. Set `epic-3: done` in `sprint-status.yaml` only when that verdict is `accepted` or `accepted-with-open-items`. Leave `epic-4: backlog` and do not start a story 4.x. A rejected verdict leaves `epic-3: in-progress` and names the blocker in the retro.

**Acceptance Criteria:**
- Given `run-20261010-0005` still `awaiting` with six undecided drafts and no matching `docket_events` row, when Patrick completes the locked queue actions, then staging has exactly one new docket event for entry 102, the other five heads are decided as locked, the Run status matches that choice, and production hashes are unchanged.
- Given that evidence, when the reassessment is appended, then each of the nine action rows is `done` only with a linked note, or stays open with the blocker named, and Epic 4 does not start unless the verdict accepts Epic 3.

## Implementation Notes

Patrick's clicks are not in yet. These checks run only after he sends the results. No admin API call, queue click, steering turn, or publish has been made. Spend must stay 12¢ and `llm_calls` for this Run must stay 12.

**Staging D1** `pml-build` `9e83494a-016e-4bff-9e07-7fca3a159a83`, read-only:

```sql
SELECT id, outcome, decided_by, reject_reason, reject_reason_private, decided_at
  FROM drafts WHERE run_id = 'run-20261010-0005' ORDER BY id;
SELECT id, status, spend_cents, completed_at FROM runs WHERE id = 'run-20261010-0005';
SELECT id, case_id, occurred_at, kind, favors, provenance_kind, source_id
  FROM docket_events WHERE id = 'de-case-il-cftc-481187549';
SELECT id, owning_id, tier FROM sources WHERE id = 'src-de-case-il-cftc-481187549';
SELECT id, event, payload_json FROM evidence_events
  WHERE run_id = 'run-20261010-0005' AND event IN ('gate.decided','run.completed')
  ORDER BY seq;
SELECT COUNT(*) AS llm_calls FROM llm_calls WHERE run_id = 'run-20261010-0005';
SELECT id, event, created_at FROM evidence_events
  WHERE run_id = 'run-20261010-0005'
    AND event IN ('steering.turn','steering.applied');
SELECT id, role, created_at FROM llm_calls
  WHERE run_id = 'run-20261010-0005' AND created_at > '2026-10-11T13:01:00.000Z';
SELECT id, role, state, created_at FROM llm_operations
  WHERE run_id = 'run-20261010-0005' AND created_at > '2026-10-11T13:01:00.000Z';
SELECT d.outcome, d.edited_body,
       d.body = e.description AS published_equals_full_body,
       e.description = json_extract(d.diff_json, '$.description') AS published_equals_diff_description,
       d.body = (
         json_extract(d.diff_json, '$.context.caption') || ' — docket entry ' ||
         json_extract(d.diff_json, '$.entryNumber') || ', filed ' ||
         json_extract(d.diff_json, '$.occurredAt') || ': ' || e.description
       ) AS body_equals_caption_plus_published
  FROM drafts d
  JOIN docket_events e ON e.id = d.target_entity_id
 WHERE d.id = 'd:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549';
SELECT json_extract(payload_json, '$.approvedText') = (
         SELECT body FROM drafts
          WHERE id = 'd:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549'
       ) AS approved_text_equals_body
  FROM evidence_events
 WHERE run_id = 'run-20261010-0005' AND event = 'gate.decided'
   AND json_extract(payload_json, '$.draftId')
       = 'd:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549';
```

**Public surfaces** (GET only):

- `https://ops-build.predictionmarketlitigation.com/api/runs/run-20261010-0005` — status, spend, drafts, `gate.decided`, `run.completed`, `llmCalls` length.
- `https://ops-build.predictionmarketlitigation.com/runs/run-20261010-0005` — HTTP status of the ops page.
- `https://build.predictionmarketlitigation.com/api/cases/case-il-cftc` — `docketEvents` contains `de-case-il-cftc-481187549`.
- `https://build.predictionmarketlitigation.com/api/developments` — entry 102 appears here only if it is among the seven newest events.
- `https://ops-build.predictionmarketlitigation.com/api/drafts` — the five rejects may appear with a null public reason; the approved draft is not in this list.
- Production `https://predictionmarketlitigation.com/` and `https://ops.predictionmarketlitigation.com/` — SHA-256 of each body.

### Evidence table

Observed cells stay blank until his click results arrive.

| Check | Expected | Observed |
|---|---|---|
| IL 101 reject `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187548` | `rejected`; `reject_reason` null; `reject_reason_private` `Not the named 3.37 publication.`; `gate.decided` reason null | |
| NY 174 reject `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-480884781` | same private reject | |
| NY 175 reject `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481007743` | same private reject | |
| NY 176 reject `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481153828` | same private reject | |
| Furcolo reject `d:run-20261010-0005:CourtListener:docket_events:de-case-ri-furcolo-480886814` | same private reject | |
| Approval `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549` | `approved`; `acceptedFields` `kind`, `favors`; body not edited; `decidedBy` is his display name | |
| `docket_events` `de-case-il-cftc-481187549` | one row; `kind` `procedural-order`; `favors` `none`; `provenance_kind` `human`; source `src-de-case-il-cftc-481187549` | |
| Run `run-20261010-0005` | `published`; spend 12; `llm_calls` 12 | |
| Public tracker | `GET /api/cases/case-il-cftc` lists entry 102; ops run page HTTP 200 | |
| Production isolation | both brochure hashes `bffcd5c604008e866cc2d71a0b9aa74478ba024167898f45fc910f3f0d41b270` | |
| Unsent steering on IL 102 | zero `steering.turn` and `steering.applied` rows for `run-20261010-0005`; zero `llm_calls` and `llm_operations` for that Run with `created_at` after `2026-10-11T13:01:00.000Z` | |
| Published text vs draft body | `outcome` `approved`; `edited_body` null; `published_equals_diff_description` 1; `body_equals_caption_plus_published` 1; `approved_text_equals_body` 1. `published_equals_full_body` is 0: `docket_events.description` is the entry text, and `drafts.body` is the caption line plus that text | |

## Spec Change Log

## Review Triage Log

## Design Notes

Patrick adopted reject-then-approve on Review drafts on 2026-10-11. Batch reject and a single publication cannot both happen: the batch endpoint refuses as soon as one head is approved, and using it first rejects the Illinois minute order too. Leaving the five undecided publishes the row but strands the Run in `awaiting`. No further paid call is required. A revise before 2026-10-11T19:10:00Z would spend more of the 100¢ period; after that instant the period is closed.

The nine rows are the 2026-09-24 corrective set: `epic-3-cc-item-1`, items 13 and 17, gate transaction safety, paid-budget accounting, workflow replay/admission, connector pagination, executing-workflow regression, and live governed-loop acceptance.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0, only if a file under `src/` or tests changed. This plan changes none.
- Read-only staging D1 and `GET https://ops-build.predictionmarketlitigation.com/runs/run-20261010-0005` -- expected: one published docket event, Run status per the locked choice, spend 12, no new `llm_calls`.

**Manual checks (if no CLI):**
- Patrick performs the queue actions. The agent records the public ops page, the staging tracker case, and the production homepage hash. The agent does not sign in as Patrick to decide a draft.
