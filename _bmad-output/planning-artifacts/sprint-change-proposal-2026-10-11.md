---
project: PredictionMarketLitigation
date: 2026-10-11
workflow: bmad-correct-course
status: proposed
mode: batch
scope: moderate
approach: direct-adjustment
epic: 4
story: 4.8
baseline_commit: 6726615846e11174c36f45ebbcce67a11bab5bf7
---

# Epic 4 change proposal — admin approver control help

## 1. Issue summary

During the story 3.37 live approval on staging, the admin queue did not say what each control does. Patrick could not tell a steering note from Approve, could not tell two adjacent Illinois drafts apart at the moment of decision, and could not tell that a reject reason would be public.

**When found.** 2026-10-11, about 9:05 AM ET, on the Access-protected admin queue while approving Run `run-20261010-0005`. The change request arrived the same morning. A 9:12 AM ET ruling locked what stays on the record.

**Issue type.** New requirement from the operator, found while using the shipped queue. The gate, the steering intents, and the private-reason field already exist. The screen does not explain them.

**Evidence.**

- Patrick typed in the steering box while he meant to approve. Submit turn is the form submit of that box. It asks the steward. It does not approve the Draft. A, E, and R do nothing while focus is in that box, and the screen does not say so.
- He meant to approve Illinois entry 102, `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187549`. He approved the adjacent entry 101, `d:run-20261010-0005:CourtListener:docket_events:de-case-il-cftc-481187548`, at 13:06:14Z. He rejected entry 102 at 13:03:34Z. The ids differ by one digit. Approve sends immediately. The reject step does not show the case, the entry number, and the first line before Confirm rejection.
- He meant to reject privately. All five rejects went out with the public reason `dev` and `reject_reason_private` null. Mark private is an unchecked checkbox. Silence leaves the reason public.
- **9:12 AM ET ruling.** Entry 101 stands as the story 3.37 publication. The five public `dev` rejects stay. This proposal does not change those rows, story 3.37, or its spec on PR #76.

**One story.** The three misses are one screen. The workflow's direct-adjustment path adds a story inside the current epic structure. It does not require a split. Help, identity confirmation, and the named Mark-private criterion stay together so the words on Approve and Reject match the confirmation and the privacy choice.

**Undo / redraft.** A sent approval or rejection cannot be undone from this screen. That gap is recorded in `_bmad-output/implementation-artifacts/deferred-work.md` through [PR #76](https://github.com/bizmation/PredictionMarketLitigation/pull/76). This proposal cross-references that file. It does not restate the gap or add the deferred entry.

This run resolved customization with `uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/bmad-correct-course --project-root . --key workflow`. The resolved block has empty `activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, and `on_complete`. Config was loaded with `resolve_config.py`. Communication language is English. User skill level is intermediate. The date is 2026-10-11.

## 2. Impact analysis

### Checklist

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 3.37 live approval of `run-20261010-0005`. The new story is 4.8. 3.37 is not edited. |
| 1.2 | Core problem | [x] | New operator requirement. The queue does not explain controls, name the Draft being decided, or make private an explicit choice. |
| 1.3 | Evidence | [x] | Section 1, including the 9:12 AM ET ruling. |
| 2.1 | Can the trigger epic finish as planned? | [x] | Epic 3 still finishes on story 3.37's own terms. This change does not add a 3.37 task. |
| 2.2 | Epic-level changes | [x] | Add story 4.8 to Epic 4. Stories 4.1–4.7 keep their scope. No new epic. |
| 2.3 | Future epics | [x] | No epic after Epic 4 is affected. Epic 4's entry gate is unchanged. |
| 2.4 | Obsolete or new epics | [N/A] | None. |
| 2.5 | Order and priority | [x] | 4.8 waits on the existing Epic 4 entry gate. It does not jump ahead of 3.37. Sprint status lists it after 4.7, so 3.37 remains the first Epic 3 backlog key. |
| 3.1 | PRD | [x] | Three consequence bullets on FR-14 and FR-15. MVP stays. Public-by-default is unchanged. |
| 3.2 | Architecture | [x] | No file change. See below. |
| 3.3 | UI/UX | [x] | UX-DR26 plus a C1/C4 note in `ux-brief-pack.md`. No new screen. |
| 3.4 | Other artifacts | [x] | `epics.md` and `sprint-status.yaml` gain story 4.8 as `backlog`. `deferred-work.md` is not edited. No spec under `planning-artifacts/*spec-*.md`. `AGENTS.md` has no `bmad:context` block. |
| 4.1 | Direct adjustment | [x] Viable | Low planning effort. Implementation is UI copy, confirmation, and tests on the existing queue. Risk low. |
| 4.2 | Rollback | [x] Not viable | Reverting the live entry 101 publication or the five `dev` rejects contradicts the 9:12 AM ET ruling. |
| 4.3 | MVP review | [x] Not viable | Dropping HITL or public-by-default reject reasons would cut FR-14. The gap is explanation and confirmation, not a smaller MVP. |
| 4.4 | Selected path | [x] | Option 1 — Direct adjustment. |
| 5.1 | Issue summary | [x] | Section 1. |
| 5.2 | Epic and artifact adjustments | [x] | This section and section 4. |
| 5.3 | Path and rationale | [x] | Section 3. |
| 5.4 | MVP impact and action plan | [x] | MVP unchanged. The action is story 4.8 after the Epic 4 entry gate. |
| 5.5 | Handoff | [x] | Section 5. Implementation routing waits on an explicit yes. |
| 6.1 | Checklist completion | [x] | Every applicable item above is decided. |
| 6.2 | Proposal accuracy | [x] | Story 4.8 matches the applied epic text. The 9:12 ruling is in the story. The undo/redraft gap is a cross-reference only. |
| 6.3 | Explicit approval | [!] | Planning artifacts were applied because the brief ordered the backlog story, this proposal, and a draft PR. Step 5 implementation approval is still open: yes / no / revise. |
| 6.4 | Sprint status | [x] | `4-8-admin-approver-control-help: backlog`. No other status token changed. |
| 6.5 | Next steps | [!] | Section 5. Do not start implementation until the step 5 answer is yes. |

### Where the story sits

Epic 4, story 4.8, after story 4.7.

Epic 3 owns the controls (stories 3.10 and 3.14–3.18, UX-DR20, UX sections C1 and C4, FR-14, FR-15, FR-46–FR-50). Epic 4's existing admin story, 4.6, is a different queue: reader feedback into a GitHub issue (UX-DR25). Folding this help into 4.6 would mix two decisions.

A new Epic 3 story, 3.39, would sit inside the epic story 3.37 is closing, and the brief forbids editing 3.37. Story 4.8 keeps that exit gate as written. It waits on the same Epic 4 entry dependency: story 3.37 and accepted Epic 3 retrospective evidence. It does not block that gate.

### Epic impact

Epic 4 stays `backlog`. Stories 4.1–4.7 stay `backlog` with their current text. Story 4.8 is added as `backlog`. Epic 3 stays `in-progress`. Story 3.37 stays `backlog` on this branch. Its spec and story text are not modified. PR #76 remains the owner of the 3.37 spec and of the deferred-work entry for the undo/redraft gap.

### Story impact

- **4.8 (new):** Admin approver control help. Three named acceptance groups: control help (four facts on every listed control), confirm the draft, and Mark private before submit.
- **3.37:** Unchanged. Entry 101 stands as its publication. The five public `dev` rejects stay.
- **3.10 and 3.14–3.18:** Stay done. 4.8 explains the controls they shipped. It does not reopen them.
- **4.6:** Unchanged. Different admin queue.

### Artifact conflicts

**PRD.** FR-14 keeps public-by-default reject reasons. Two new consequences: confirm case, entry number when present, and first line before approve or reject is sent; Mark private is a visible explicit choice and silence is not private. FR-15 gains the four-fact help requirement on hover and keyboard focus, and states that story 4.8 does not add an undo or redraft path.

**Architecture.** No edit. `/admin` stays Access-gated. Publish stays on the Approval Gate. The steward still has no live-F1 publish tool. `reject_reason_private` stays field-level redaction. Paid calls stay on the existing paths: steward `complete()` for Submit turn and conversational Steer pipeline; drafter and reviewer for Revise draft; no model call for Approve, Edit, Reject, Accept/Strip, Record guidance, structured Revert, or the Mark private checkbox itself. Confirmation is a client step before the existing POST.

**UX.** UX-DR26 and the 2026-10-11 note on C1/C4. No new screen. Help is not a `title` attribute alone.

**Planning specs.** None matched `*spec-*.md` under planning artifacts.

**Project context.** `AGENTS.md` has no `bmad:context` block. Staging remains `pml-build`. Production remains `pml`. This pass does not deploy and does not call staging or production.

### Technical impact

No schema change, no new secret, no Workers deploy, and no paid provider call. Tests use the existing UI harness. The story does not rewrite entry 101 or the five `dev` rejects.

## 3. Recommended approach

| Option | Effort | Risk | Assessment |
|---|---|---|---|
| Direct adjustment | Low for this planning record. The implementation is help text, a confirmation, and tests on the current queue. | Low, if the help matches the shipped intents and the story does not move the 3.37 rows. | Recommended. |
| Rollback | High relative to the ruling. | High. Would unset the publication Patrick confirmed. | Not viable. |
| Reduce or redefine MVP | Medium planning effort, and the confusing controls would remain. | High. FR-14's public-by-default rule and the HITL gate stay. | Not viable. |

**Selected approach: Option 1, direct adjustment.**

Add one Epic 4 backlog story. Do not split it. Do not add an epic. Do not edit story 3.37. Do not write the undo/redraft gap into this story; cross-reference `deferred-work.md` on PR #76.

Timeline impact is sequencing only. Story 4.8 cannot start until the Epic 4 entry gate opens. It does not extend story 3.37. This proposal does not deploy.

## 4. Detailed change proposals

Batch presentation. Applied in the files below because the brief ordered the backlog story and this proposal. Step 5 approval for implementation is still open.

### A. New story 4.8

**Story:** 4.8 Admin approver control help
**Section:** New entry after story 4.7
**Artifact:** `epics.md`

**OLD:** Epic 4 ended at story 4.7. The entry line said all seven Epic 4 stories retain their scope.

**NEW:** Story 4.8, with the 9:12 AM ET ruling, the deferred-work cross-reference, and these acceptance criteria:

- **AC — Control help.** Hover and keyboard focus on Approve, Edit, Reject, Accept/Strip per field, Submit turn, Revise draft, Steer pipeline, Record guidance, and the A/E/R hotkeys. Each help states what it does, whether it makes a paid model call, whether the result is public, and whether it can be undone. A `title` attribute alone is not enough. Fact (d) does not specify an undo or redraft design. The per-control facts are in the story.
- **AC — Confirm the draft.** Before Approve sends, and before Confirm rejection sends, show the Draft's case, its entry number when it has one, and the first line. Entry 102 (`…481187549`) and entry 101 (`…481187548`) must be distinguishable without reading the raw id. Do not invent an entry number. Do not move the standing entry 101 publication.
- **AC — Mark private before submit.** The Mark private control and the reject flow state, before submit, whether the reason will be public. Private is a visible, explicit choice. Silence is not a private mark. This criterion does not rewrite the five public `dev` rejects.
- Tests cover the four facts, hover and focus, the hotkey focus exception, the confirmation identity, and the named Mark-private criterion. No paid provider, staging, or production call.

**Rationale:** One story covers the screen Patrick was using. The ruling keeps the live rows. The undo/redraft gap stays on PR #76.

### B. Epic 4 index

**Artifact:** `epics.md` frontmatter `scopeAmendments`, the Epic 4 list line, the Epic 4 entry sentence, and UX-DR26.

**OLD:** Amendments stop at 2026-10-10. Epic 4 lists seven stories and UX-DR16, UX-DR18–19, and UX-DR25. UX-DR20 describes the queue keys and does not require help text.

**NEW:** A 2026-10-11 scope amendment. The entry sentence keeps the 3.37 gate and adds story 4.8. UX-DR26 requires the help, the confirmation, and the explicit private choice, and points the undo/redraft gap at `deferred-work.md` through PR #76. UX-DR20 is unchanged.

**Rationale:** A reader of the epic index should find 4.8 without opening sprint status. UX-DR20 stays the original queue contract so completed story 3.10 is not rewritten.

### C. PRD consequences

**Artifact:** `prds/prd-PML-2026-06-18/prd.md`, FR-14 and FR-15.

**OLD:** FR-14 ends at the public-by-default reject reason and the optional private mark. FR-15 ends at keyboard-accessible operator actions.

**NEW:** FR-14 adds confirmation of case, entry number, and first line, and requires the private choice to be visible and explicit. FR-15 adds the four-fact help on hover and focus, and says story 4.8 does not add an undo or redraft path.

**Rationale:** The help and the confirmation are requirements, not only copy. Public-by-default stays.

### D. UX brief

**Artifact:** `ux-brief-pack.md`, new section "Admin approver control help — 2026-10-11".

**OLD:** C1 and C4 describe the actions and the submit-is-publication model. They do not require per-control help or an identity confirmation.

**NEW:** The four facts for each listed control, the confirmation, and AC — Mark private before submit. The 9:12 ruling and the PR #76 cross-reference are in the section lead.

**Rationale:** The UX pack is the design input for C1 and C4. The new section annotates those screens. It does not add a screen.

### E. Sprint tracking

**Artifact:** `sprint-status.yaml`

**OLD:** Epic 4 stories end at `4-7-trust-closure-donations-repo-cross-links: backlog`.

**NEW:**

```
# Added 2026-10-11 by sprint-change-proposal-2026-10-11. Approver control help. Does not change 3.37 or any existing status.
4-8-admin-approver-control-help: backlog
```

**Rationale:** Checklist 6.4. `backlog` matches the legend: the story exists in the epic file and has no story file. No current story status changes. Story 3.37 stays `backlog`.

### F. Artifacts intentionally unchanged

| Artifact | Why it stays |
|---|---|
| `architecture.md` | No new component, schema, route, or model path. |
| Story 3.37 in `epics.md` | In flight on PR #76. The brief forbids editing it. |
| `spec-3-37-prove-the-live-governed-loop-and-reassess-epic-3.md` | Owned by PR #76. |
| `deferred-work.md` | PR #76 records the undo/redraft gap. This pass only cross-references it. |
| `sprint-status.yaml` status tokens other than the new 4.8 line | The brief forbids status changes. |
| Application code | Planning artifacts only. |

## 5. Implementation handoff and success criteria

**Scope:** Moderate backlog reorganization. One story is added. No completed story is reopened. Implementation is not started in this pass.

- **Product owner / planning role:** This proposal is the record. The epic, PRD, UX, and sprint-status edits in section 4 are applied with it.
- **Developer role:** Do not implement story 4.8 until this proposal is approved (step 5: yes) and the Epic 4 entry gate is open. Then implement only the three acceptance groups. Do not edit story 3.37, its spec, or `deferred-work.md`. Do not change entry 101 or the five `dev` rejects. Do not design the undo/redraft path.
- **PR #76:** Continues to own story 3.37 and the deferred-work entry. This proposal does not merge with that branch's files.

Success for this planning change: story 4.8 appears once in `epics.md` and once in `sprint-status.yaml` as `backlog`; the proposal exists; story 3.37's text and status are unchanged; `deferred-work.md` is unchanged; no application code changes.

Success for the later product change: an operator can read the four facts on every listed control by hover and by keyboard focus; approve and reject confirmation shows case, entry number, and first line; Mark private before submit makes the public-or-private outcome explicit. The entry 101 publication and the five public `dev` rejects remain as recorded on 2026-10-11.

Approval of this proposal, when given, authorizes implementation of story 4.8 under the entry gate. It does not authorize a deploy, a staging or production call, a paid provider call, or a change to the 3.37 rows.

## 6. Workflow checklist and approval record

- [x] 1.1–1.3: Trigger is the 3.37 live approval. The 9:12 AM ET ruling is evidence, not a data repair.
- [x] 2.1–2.5: Story 4.8 is the addition. Epic 3's exit and story 3.37 stay as they are. One story, not a split.
- [x] 3.1–3.4: PRD and UX updated. Architecture unchanged. Planning specs absent. No `bmad:context` block.
- [x] 4.1–4.4: Direct adjustment. Rollback and MVP reduction rejected.
- [x] 5.1–5.5: Issue, impact, approach, edits, and handoff are in this document.
- [x] 6.1–6.2: Checklist complete. The undo/redraft gap is a cross-reference to PR #76 only.
- [!] 6.3: Step 4 document is written. Step 5 is not answered. Question: do you approve this Sprint Change Proposal for implementation? (yes / no / revise)
- [x] 6.4: `4-8-admin-approver-control-help: backlog` applied. No other status changed.
- [!] 6.5: Handoff is section 5. Implementation waits on yes.

Mode: batch. The brief asked for the proposal and the canonical planning edits in one pass, and the later rulings arrived before this document was written. They are included here rather than as a second proposal.

Activation prepend, append, and persistent facts were empty and were executed as empty. `workflow.on_complete` is empty and is not run, because step 6 waits on the step 5 answer. No code, infrastructure, paid call, or content publication was performed.
