---
title: '3.37 — Prove the live governed loop and reassess Epic 3'
type: 'chore'
created: '2026-10-11'
status: 'draft'
route: 'dispatch'
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

</frozen-after-approval>

## Open Questions

- Named approval wording and surface — options: (A, recommended) Patrick replies with this exact sentence and then performs it himself: `I approve draft d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549 by clicking Approve on https://build.predictionmarketlitigation.com/admin#queue, leaving the loaded field checks unchanged and not editing the body.` The button posts `{ action: "approve", acceptedFields }` to `/api/admin/drafts/<id>/decision`. At inference confidence 0.95, disagreement false, and threshold 70, the loaded checks are `kind` and `favors` only. (B) The same click after he toggles those checks off, so the row publishes with null `kind` and `favors`. (C) Steering. Steering cannot approve or publish; a revise is a new paid call and still needs a later queue approval.
- The other five drafts — options: (A, recommended) Before that Approve click, Patrick rejects each of these in the same Review drafts queue, with the private checkbox on and the reason text `Not the named 3.37 publication.`: `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187548` (IL 101, full status-report entry), `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-480884781` (NY 174), `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481007743` (NY 175), `d:run-20261010-0005:CourtListener:docket_events:de-case-ny-cftc-481153828` (NY 176), `d:run-20261010-0005:CourtListener:docket_events:de-case-ri-furcolo-480886814` (Furcolo, citation 0). NY 174, 175, 176, and Furcolo are one-line titles labelled `recap_description`. Each reject writes `gate.decided` with a null public reason. The later Approve is the last head, so publication and `published` commit together. (B) Leave them `awaiting`. The named row can still publish, and the Run never reaches `published`. (C) Batch-reject the Run from Manage runs (`https://build.predictionmarketlitigation.com/admin#loop`, POST `/api/admin/runs/run-20261010-0005/reject` with `{}`). That rejects all six, publishes nothing, and is refused once any head is approved.

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

## Spec Change Log

## Review Triage Log

## Design Notes

Recommend reject-then-approve on Review drafts, not Manage runs and not steering. Batch reject and a single publication cannot both happen: the batch endpoint refuses as soon as one head is approved, and using it first rejects the Illinois minute order too. Leaving the five undecided publishes the row but strands the Run in `awaiting`. No further paid call is required. A revise before 2026-10-11T19:10:00Z would spend more of the 100¢ period; after that instant the period is closed.

The nine rows are the 2026-09-24 corrective set: `epic-3-cc-item-1`, items 13 and 17, gate transaction safety, paid-budget accounting, workflow replay/admission, connector pagination, executing-workflow regression, and live governed-loop acceptance.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0, only if a file under `src/` or tests changed. This plan changes none.
- Read-only staging D1 and `GET https://ops-build.predictionmarketlitigation.com/runs/run-20261010-0005` -- expected: one published docket event, Run status per the locked choice, spend 12, no new `llm_calls`.

**Manual checks (if no CLI):**
- Patrick performs the queue actions. The agent records the public ops page, the staging tracker case, and the production homepage hash. The agent does not sign in as Patrick to decide a draft.
