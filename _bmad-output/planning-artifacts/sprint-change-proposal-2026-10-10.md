---
project: PredictionMarketLitigation
date: 2026-10-10
workflow: bmad-correct-course
status: approved
mode: batch
scope: moderate
approach: direct-adjustment
epic: 3
baseline_commit: 85850d2b376bc56b194cffe6a173e87b36378b6b
---

# Epic 3 corrective change proposal — CourtListener HTTP 429 pacing

## 1. Issue summary

Staging Run `run-20261004-0002` failed before any Draft existed. CourtListener returned HTTP 429, `Rate limit exceeded: 5/min. Expected available in 59 seconds.` The connector started the four seeded case-docket requests together and treated the first 429 as a source failure. There was no request spacing and no retry. Story 3.36 cannot claim live gateway acceptance until a later governed Run gets past that source.

**When found.** During Epic 3 story 3.36, after the 2026-10-04 staging deploy of the corrected runtime. The operator signed in and used Run now once. Admission created `run-20261004-0002` at 21:26:34Z with the 100-cent Run limit. The Run failed at 21:26:42Z. Public evidence: https://ops-build.predictionmarketlitigation.com/runs/run-20261004-0002 . Spent, reserved, and uncertain balances were zero. No Drafts, LLM calls, or accounting operations were produced.

**Issue type.** Technical limitation discovered during implementation. Story 3.23 required 401, 403, 429, 5xx, network, and timeout to fail the source on the first such response. That clause is correct for auth, server, network, and timeout failures. It is the wrong behavior for a published per-minute request limit when four dockets are polled at once.

**Evidence.**

- Story 3.36 spec, “Authenticated live attempt — 2026-10-04,” records the 429 text, the Run id, and the eight-second failure.
- Seeded case dockets polled by the connector are four. CourtListener’s published limit is about 5 requests per minute. One parallel burst, plus pagination or any earlier use of the token, crosses that limit.
- The connector implementation on this baseline starts those dockets with `Promise.all` and lists HTTP 429 in `SOURCE_LEVEL_REASONS`. The file header says there are no retries and no backoff.
- Story 3.38, `3-38-pace-courtlistener-requests-and-recover-from-http-429`, was already created and implemented on branch `cursor/courtlistener-429-pacing-4f5f` (PR #58, status review). This proposal does not reopen that implementation.

**Process deviations this proposal puts on the record.** Story 3.38 was added with Create Story, not with Correct Course. In that Create Story run:

- `uv` was not installed, so `resolve_customization.py` did not run. The workflow block was merged by hand from `.agents/skills/bmad-create-story/customize.toml`. That run reported no team or user override, and empty `activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, and `on_complete`.
- Context7 is configured in `.mcp.json` but had no MCP namespace in that session.
- The create-story checklist’s interactive improvement prompt was resolved as apply-all.
- Create-story auto-discover’s first backlog key was 3.37. That story was not rewritten. 3.36 was already in progress. The missing-story choice became 3.38, inserted ahead of 3.37.

Patrick approved proceeding with PR #58’s review as is on 2026-10-10. This Correct Course pass ratifies the scope addition and those deviations. It does not re-implement the connector, edit the 3.38 story file, or call staging or production.

This run resolved customization with `uv run _bmad/scripts/resolve_customization.py`. The resolved `workflow` block is empty for prepend, append, persistent facts, and `on_complete`. The config was not merged by hand.

## 2. Impact analysis

### Checklist

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 3.36 live attempt `run-20261004-0002`. The fix is new story 3.38. |
| 1.2 | Core problem | [x] | Technical limitation. Parallel CourtListener starts plus fail-on-first 429. |
| 1.3 | Evidence | [x] | Section 1. The 429 body, Run URL, and story 3.23 clause are concrete. |
| 2.1 | Can Epic 3 finish as planned? | [!] | Not until 3.38 is merged and deployed and 3.36/3.37 still pass on a real Run. Epic 3 stays in progress. |
| 2.2 | Epic-level changes | [x] | Add story 3.38 inside Epic 3. Supersede only 3.23’s fail-on-first 429 clause. No new epic. |
| 2.3 | Future epics | [x] | Epic 4 still waits on 3.37 and accepted Epic 3 evidence. Its seven stories stay as written. |
| 2.4 | Obsolete or new epics | [N/A] | None. 3.36 and 3.37 remain necessary. |
| 2.5 | Order and priority | [x] | 3.38 blocks the remaining live portion of 3.36. 3.37 still depends on 3.36. Epic 4 does not move. |
| 3.1 | PRD | [x] | No text change. FR-9 already requires source access to respect access constraints and to record a skipped source with a reason. MVP stays achievable. |
| 3.2 | Architecture | [x] | No file change. Queues stay deferred. In-connector pacing is the accepted response to this 429. See below. |
| 3.3 | UI/UX | [N/A] | No screen, flow, or component change. Scrubbed `http_429` evidence uses the existing ops Run log. |
| 3.4 | Other artifacts | [!] | `epics.md` and `sprint-status.yaml` are updated here. PR #58 already carries the 3.36 spec note, `epic-3-context.md`, the story file, and the connector code. Those files are left untouched in this pass. |
| 4.1 | Direct adjustment | [x] Viable | Low planning effort. Implementation effort is medium and already in review on PR #58. Risk low. |
| 4.2 | Rollback | [x] Not viable | Reverting the live connector or 3.23’s total-outage rule does not make four parallel requests legal. Risk high. |
| 4.3 | MVP review | [x] Not viable | Dropping CourtListener polling or live acceptance would cut FR-9/FR-10 and the Epic 3 acceptance gate. Risk high. |
| 4.4 | Selected path | [x] | Option 1 — Direct adjustment. |
| 5.1 | Issue summary | [x] | Section 1. |
| 5.2 | Epic and artifact adjustments | [x] | This section and section 4. |
| 5.3 | Path and rationale | [x] | Section 3. |
| 5.4 | MVP impact and action plan | [x] | MVP unchanged. Actions are the backlog edits plus continued review of PR #58. |
| 5.5 | Handoff | [x] | Section 5. |
| 6.1 | Checklist completion | [x] | Every applicable item above is decided. |
| 6.2 | Proposal accuracy | [x] | 3.38 text matches the story already in review. 3.36’s dependency is added only in canonical planning. |
| 6.3 | Explicit approval | [x] | Patrick, 2026-10-10. The triggering brief approves the 3.38 addition as described and approves continuing PR #58 review as is. |
| 6.4 | Sprint status | [x] | `3-38-pace-courtlistener-requests-and-recover-from-http-429: review`. Not `backlog`: the story file exists and the implementation is in review. |
| 6.5 | Next steps | [x] | Section 5. No deploy and no staging or production call in this pass. |

### Epic impact

Epic 3 stays `in-progress`. Stories 3.1–3.35 stay done. Story 3.36 stays `in-progress` and gains an explicit dependency on 3.38 for its remaining live Run. Story 3.37 stays `backlog` and still depends on 3.36. Story 3.38 is added. Epic 4’s entry gate is unchanged.

Story 3.23 stays done. Only its fail-on-first HTTP 429 clause is superseded. A 401, 403, 5xx, network, or timeout still fails that request on the first response. If every docket errors, including an exhausted 429, the zero-draft Run still finishes `failed`, not `empty`.

### Story impact

- **3.38 (new):** Pace CourtListener requests and recover from a bounded HTTP 429. Dependencies: 3.23, 3.27, 3.32, 3.33, 3.34. It blocks the remaining live portion of 3.36. It does not replace 3.36 or 3.37.
- **3.36:** Live acceptance waits until 3.38 is merged and deployed to `pml-build`. Do not start another paid staging Run before that deploy. The status value stays `in-progress`.
- **3.37:** Unchanged. It still consumes a qualifying 3.36 Run when one exists.
- **3.26:** Its historical check “every 3.1–3.37 ID appears once” was the scope on 2026-09-24. This proposal does not rewrite that completed story. 3.38 is a later addition.

### Artifact conflicts

**PRD.** No modification. FR-9’s consequence already says source access respects each source’s constraints and that a blocked source is skipped with a reason on public Evidence. FR-10 still requires an empty Run when nothing new was found, which is distinct from a failed poll. The budget-stopped status remains a gateway outcome, not a CourtListener 429.

**Architecture.** `architecture.md` still defers Cloudflare Queues until source fan-out, 429 pacing, or a dead-letter queue is required, and it says Workflow `step.do` retries cover v1 ingest. Story 3.38 does not adopt Queues and does not split `run-daily-step`. The accepted reading, already implemented on PR #58 and approved for continued review, is that one account and four serial docket reads are in-connector pacing, not the fan-out or dead-letter threshold. This proposal records that reading and does not edit `architecture.md`, so PR #58’s code review stays the implementation record.

**UX.** `ux-brief-pack.md` has no request-pacing flow. No wireframe change.

**Spec files under planning artifacts.** None matched `*spec-*.md`. The implementation spec for 3.36 is evidence. PR #58 adds one sentence there: live acceptance is blocked on 3.38 merge and deploy. This pass does not edit that spec, so the two branches do not both rewrite it.

**Project context.** `AGENTS.md` has no `bmad:context` block. The credentials note is unchanged: staging remains `pml-build`, production remains `pml`, and this pass performs no deploy.

### Technical impact

PR #58 serializes CourtListener request starts at least 15 seconds apart, retries HTTP 429 at most three times using a capped `Retry-After` or a 60-second window, and stops inside a 6-minute wait budget and an 8-minute poll deadline. Exhaustion still fails the source with scrubbed `http_429` evidence. `CONNECTOR_TIMEOUT_MS` stays 60 seconds for other sources. `run-daily-step` is unchanged. That behavior is not modified here.

No schema change, no new secret, no Workers deploy, and no paid provider call is authorized by this proposal.

## 3. Recommended approach

| Option | Effort | Risk | Assessment |
|---|---|---|---|
| Direct adjustment | Low for this planning record. Medium for the connector work already in review on PR #58. | Low. Total-outage failure, credential boundaries, and the `run-daily-step` checkpoint stay. | Recommended. |
| Rollback | High relative to the defect. | High. Removes a working poll or the failed-versus-empty distinction without staying under 5 requests per minute. | Not viable. |
| Reduce or redefine MVP | Medium planning effort. The 429 defect would remain if the connector stayed in scope. | High. Live Epic 3 acceptance and Tier-1 docket monitoring are in the current MVP. | Not viable. |

**Selected approach: Option 1, direct adjustment.**

Add one story inside the existing epic and narrow one completed acceptance clause. Do not reorder Epic 4, do not open a new epic, and do not start a second implementation beside PR #58.

Timeline impact is sequencing, not a calendar promise. Story 3.36’s live Run waits on 3.38 merged and deployed to `pml-build`. Story 3.37 waits on 3.36. Epic 4 waits on 3.37. The highest remaining uncertainty is the next real CourtListener response after deploy, which 3.36 must observe. This proposal does not deploy.

## 4. Detailed change proposals

Approved as a batch on 2026-10-10. Applied in `epics.md` and `sprint-status.yaml`. The 3.38 story wording matches the entry already on PR #58 so the two edits rebase cleanly. The 3.36 dependency line is the canonical addition PR #58 does not make in `epics.md`.

### A. Story 3.23 acceptance clause

**Story:** 3.23 Fail a total CourtListener outage
**Section:** Acceptance criteria, final clause
**Artifact:** `epics.md`

**OLD:**

```
**And** 401, 403, 429, 5xx, network, and timeout still fail the source on the first such response
```

**NEW:**

```
**And** 401, 403, 5xx, network, and timeout still fail the source on the first such response
**And** HTTP 429 is no longer fail-on-first: story 3.38 paces requests and retries a bounded 429; an exhausted 429 still fails the source with scrubbed `http_429` evidence
```

**Rationale:** The 2026-10-04 Run showed that fail-on-first 429 rejects a normal four-docket poll. Auth, server, network, and timeout failures stay fail-on-first. An exhausted 429 still fails the Run with scrubbed evidence, so 3.23’s failed-versus-empty rule remains.

### B. Story 3.36 dependency

**Story:** 3.36 Verify the corrected staging Run and gateway
**Section:** Dependencies and acceptance bullets
**Artifact:** `epics.md`

**OLD:**

```
Effort: Medium, operational. Dependencies: 3.26–3.35 merged and required CI green. Covers existing action 17 remainder / R18.
```

**NEW:**

```
Effort: Medium, operational. Dependencies: 3.26–3.35 merged and required CI green. Live acceptance also depends on 3.38 merged and deployed to `pml-build`. Covers existing action 17 remainder / R18.
```

**NEW bullet:**

```
- Live acceptance depends on story 3.38 merged and deployed to `pml-build`. Do not start another paid staging Run until that deploy. Story 3.38 does not replace this story or story 3.37.
```

**Rationale:** 3.36 is the story the 429 blocked. The dependency belongs on 3.36, not only on 3.38. PR #58 records the same block in the 3.36 implementation spec and the sprint-status comment. This edit is the canonical epic statement. The 3.36 spec is not edited here.

### C. New story 3.38

**Story:** 3.38 Pace CourtListener requests and recover from HTTP 429
**Section:** New entry after story 3.37
**Artifact:** `epics.md`

**OLD:** No story 3.38. Epic 4 follows story 3.37.

**NEW:**

```
### Story 3.38: Pace CourtListener requests and recover from HTTP 429

As an operator, a normal daily CourtListener poll stays inside the published request limit and a transient HTTP 429 does not fail the Run.

Effort: Medium, implementation. Dependencies: 3.23, 3.27, 3.32, 3.33, 3.34. Blocks the remaining live portion of 3.36. Does not replace 3.36 or 3.37.

- The connector currently starts every case docket at once and treats the first HTTP 429 as a source-level failure. CourtListener's published limit is about 5 requests per minute. Seed data polls four case dockets, so one burst plus any pagination or earlier account use trips that limit. Staging Run `run-20261004-0002` failed this way.
- Space CourtListener HTTP requests so a sliding minute stays under 5 requests. On 429, honor a delta-seconds or HTTP-date `Retry-After` capped to the limit window; without that header, wait one limit window. Retry a finite number of times. Stop when the wait budget is exhausted and fail the source with scrubbed `http_429` evidence.
- Keep 401, 403, 5xx, network, timeout, unsafe URLs, and redirects fail-on-first. Keep every-docket failure as a failed Run. Do not split `run-daily-step`. Do not call the drafter or reviewer again because a fetch was retried. Do not deploy or call staging, production, or a paid provider.
```

**Rationale:** This is the scope Patrick approved for continued review on PR #58. Copying that entry keeps a later rebase from choosing between two wordings. The implementation story file on that branch holds the numbered acceptance criteria, constants, and file list. This pass does not modify that file.

### D. Epic 3 planning index

**Artifact:** `epics.md` frontmatter `scopeAmendments`, and the corrective-backlog introduction.

**OLD:** Amendments stop at 2026-08-09. The corrective introduction cites only the 2026-09-24 proposal and stories 3.26–3.37.

**NEW:** A 2026-10-10 scope amendment, plus one sentence under the corrective backlog pointing at this proposal, the 3.23 supersession, and the 3.36 dependency.

**Rationale:** A reader of the epic index should find 3.38 without opening sprint status. These lines sit outside the hunks PR #58 edits.

### E. Sprint tracking

**Artifact:** `sprint-status.yaml`

**OLD:**

```
last_updated: 2026-09-25
3-36-verify-the-corrected-staging-run-and-gateway: in-progress # USD 1 total authorized; DeepInfra/GLM Secrets Store implementation in review; live acceptance pending
3-37-prove-the-live-governed-loop-and-reassess-epic-3: backlog
```

**NEW:**

```
last_updated: 2026-10-10
3-36-verify-the-corrected-staging-run-and-gateway: in-progress # USD 1 total authorized; DeepInfra/GLM Secrets Store implementation in review; live acceptance pending; blocked on 3.38 (CourtListener 429 pacing) merge and deploy
# Added 2026-10-10 by create-story. Not part of 3.36 (operational verification) and not 3.37 (next backlog acceptance story).
3-38-pace-courtlistener-requests-and-recover-from-http-429: review
3-37-prove-the-live-governed-loop-and-reassess-epic-3: backlog
```

A separate comment records that this proposal ratified 3.38. Epic 3 stays `in-progress`. Epic 4 stays `backlog`.

**Rationale:** Checklist 6.4 requires the new story in sprint status. The status token is `review`, not `backlog`. The checklist’s backlog default is for a story that exists only in the epic file. The status legend says `backlog` means that, `ready-for-dev` means the story file exists, and `review` means the implementation is ready for code review. PR #58 is in code review, and Patrick approved continuing that review. Using `backlog` would contradict both the legend and PR #58. The 3-36 comment and the 3-38 key match PR #58 so that hunk rebases as the same change.

### F. Artifacts intentionally unchanged

| Artifact | Why it stays |
|---|---|
| PRD | FR-9 already covers constrained source access and skipped-source evidence. |
| `architecture.md` | Queues stay deferred. This 429 does not adopt them. |
| `ux-brief-pack.md` | No user-facing flow change. |
| `3-38-pace-courtlistener-requests-and-recover-from-http-429.md` | Owned by PR #58. This pass must not modify it. |
| `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` | PR #58 already adds the live-acceptance block note. |
| `epic-3-context.md` | PR #58 already records the 3.38 handoff. |
| Application code | The connector change is PR #58. |

## 5. Implementation handoff and success criteria

**Scope:** Moderate backlog reorganization. One story is added and one completed clause is narrowed. Implementation of the connector is already on PR #58. This planning pass does not start a second build.

- **Product Owner / planning role:** This proposal is the canonical record. The epic and sprint-status edits in section 4 are applied with it.
- **Developer role:** Continue code review of PR #58 as Patrick approved on 2026-10-10. Do not re-implement 3.38 from this proposal and do not rewrite the story file to erase the Create Story deviations. Those deviations stay documented in the story and in section 1 here.
- **After review and merge:** Deploy 3.38 to `pml-build` only through the existing staging process, in a later authorized pass. Then resume the live portion of 3.36. Do not start another paid staging Run before that deploy.
- **3.37 and Epic 4:** Unchanged. 3.37 still follows a qualifying 3.36 Run. Epic 4 still waits on 3.37 and accepted Epic 3 evidence.

Success for this planning change means story 3.38 appears once in `epics.md` and once in `sprint-status.yaml`, story 3.36 states the dependency, and the Create Story process deviations are written down. Success for the product change remains story 3.36’s: a new post-deploy governed Run that gets past CourtListener and shows an authenticated DeepInfra success, without tokens in the evidence. Merging this proposal does not close 3.36 or 3.37.

Approval of this proposal authorizes the backlog and document edits in section 4. It does not authorize a deploy, a staging or production call, a paid provider call, or a second copy of the connector change.

## 6. Workflow checklist and approval record

- [x] 1.1–1.3: Trigger is story 3.36’s Run `run-20261004-0002`. Problem and evidence are in section 1, including the Create Story deviations.
- [x] 2.1–2.5: Epic 3 remains the right epic. Story 3.38 is added. Epic 4 is unchanged. 3.36’s live work waits on 3.38.
- [x] 3.1–3.4: PRD, architecture, and UX need no file edits. Planning specs were absent. `AGENTS.md` has no `bmad:context` block.
- [x] 4.1–4.4: Direct adjustment selected. Rollback and MVP reduction were rejected.
- [x] 5.1–5.5: Issue, impact, approach, edits, MVP note, and handoff are in this document.
- [x] 6.1–6.2: Checklist complete. 3.38 wording matches PR #58. 3.36’s canonical dependency is new.
- [x] 6.3: Patrick approved on 2026-10-10. The triggering brief is approval of the 3.38 addition as described, and approval to proceed with PR #58’s review as is. Step 4 choice: Continue. Step 5 choice: yes.
- [x] 6.4: Applied to `epics.md` and `sprint-status.yaml`. Status `review` follows the sprint-status legend and the current review state.
- [x] 6.5: Handoff is section 5. Next product step is review and merge of PR #58, then an authorized staging deploy, then the remainder of 3.36.

Mode: batch. The brief supplied the whole change and its approval together and asked for the proposal plus the canonical edits in one pass. Incremental halt-and-choose was closed by that approval rather than by a live reply.

Activation used the resolver. `workflow.activation_steps_prepend`, `workflow.activation_steps_append`, and `workflow.persistent_facts` were empty and were executed as empty. `workflow.on_complete` is empty. No code, infrastructure, paid call, or content publication was performed by this proposal.
