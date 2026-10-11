---
project: PredictionMarketLitigation
date: 2026-10-11T18:23Z
workflow: bmad-correct-course
status: proposed
mode: batch
approach: direct-adjustment
scope: moderate
epic: 3
baseline_commit: 4dba6b57e96ed5572e07223b2cbba6a53f4acf63
---

# Sprint Change Proposal — Tier-1 and Tier-2 source monitoring

This file is the Step 4 Sprint Change Proposal. It is not approved. `epics.md`, the PRD, `architecture.md`, the UX brief, and `sprint-status.yaml` are unchanged.

The skill's `default_output_file` is `sprint-change-proposal-{date}.md`. `{date}` for this run is the datetime `2026-10-11T18:23Z`. `sprint-change-proposal-2026-10-11.md` already holds the approved story 4.8 proposal, so this run writes the datetime filename and leaves that file in place.

## Activation record

`uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/bmad-correct-course --project-root . --key workflow` succeeded. No `_bmad/custom/bmad-correct-course.toml` and no `_bmad/custom/bmad-correct-course.user.toml`. Resolved `workflow`:

- `activation_steps_prepend`: `[]` (executed, nothing to run)
- `activation_steps_append`: `[]` (executed, nothing to run)
- `persistent_facts`: `[]` (nothing to load)
- `on_complete`: `""`

`resolve_config.py`: `project_name` PML, `user_name` Patrick, `communication_language` English, `document_output_language` English, `user_skill_level` intermediate, `planning_artifacts` `_bmad-output/planning-artifacts`, `implementation_artifacts` `_bmad-output/implementation-artifacts`, `project_knowledge` `docs`.

Mode stored from Patrick's answer: **Batch**.

## 1. Issue summary

Staging Runs finish `empty` while three configured sources are skipped as `not wired`. Only the CourtListener connector is registered. PRD FR-9 requires the daily pipeline to monitor Tier-1 and Tier-2 sources. Patrick also wants more web and publication sources than the four names already in the seed.

**When found.** Reported as the Correct Course trigger on 2026-10-11. Confirmed on D1 `pml-build` (`9e83494a-016e-4bff-9e07-7fca3a159a83`) the same day.

**Issue types.**

- Technical limitation discovered during implementation. Story 3.21 wired one Tier-1 connector and left every other configured source on `stubCheck`.
- New requirement emerged from stakeholders. Patrick wants more web and publication sources than the seeded list.

**Problem statement.** A Run that polls CourtListener, finds no new docket entries, and skips every other configured source as `not wired` completes `empty` with `failed: false`. That satisfies the story 3.21 stub clause and the story 3.4 line "stubs acceptable if they record skip reasons." It does not satisfy FR-9's requirement that the pipeline monitor Tier-1 and Tier-2 sources. Tier-2 is never fetched. Two other seeded Tier-1 sources are never fetched.

**Evidence.**

- `run-20261011-0000` (scheduled, `2026-10-11T16:00:17.000Z` to `2026-10-11T16:03:34.517Z`) status `empty`. `run-20261011-0002` (manual, `2026-10-11T15:52:48.754Z` to `2026-10-11T15:53:38.715Z`) status `empty`.
- On `run-20261011-0000`, `source.fetched` for CourtListener has `itemCount: 0` and `newEntries: 0` on dockets `73133459`, `72237443`, `73242633`, and `73375343`. Then `source.skipped` with `reason: "not wired"` and `failed: false` for CFTC press (tier1), SCOTUS docket (tier1), and Legal news leads (tier2, `https://news.bloomberglaw.com/securities-law`). The Run ends `run.empty` with `{ "drafts": 0 }`. The pinned snapshot is poll-sources version 0, the four names in `src/pipeline/connectors/sources.ts`.
- `sourceChecksFromEnv` in `src/pipeline/workflow/dailyRun.ts` returns only `CourtListener`. `stubCheck` in `src/pipeline/connectors/connector.ts` returns `[]`. An empty stub result is `source.skipped` / `not wired` / `failed: false`, so it does not flip the Run to `failed`. `packageSources` marks the Run `empty` when the draft count is 0 and `anyFailure` is false.
- `src/pipeline/workflow/dailyRun.test.ts` asserts "wires exactly CourtListener; the other sources stay not wired."
- Story 3.21 acceptance: "the remaining sources stay stubs with explicit `source.skipped` reasons." Story 3.4 acceptance: "stubs acceptable if they record skip reasons."
- Architecture still names `federalRegister.ts` and `tier2News.ts`. Those files are not in `src/pipeline/connectors/`. The seeded names are CFTC press, SCOTUS docket, and Legal news leads.

## 2. Impact analysis

### Checklist

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 3.21. Its stub clause is what `run-20261011-0000` executed. Story 3.4 wrote the stub allowance. |
| 1.2 | Core problem | [x] | Both "technical limitation discovered during implementation" and "new requirement emerged from stakeholders." |
| 1.3 | Evidence | [x] | Section 1. Staging rows, Evidence payloads, and the connector registry. |
| 2.1 | Current epic | [!] | Epic 3 cannot stay closed. `sprint-status.yaml` has `epic-3: done`, and stories 3.21 and 3.4 are done, but FR-9 monitoring is not met for three configured sources. |
| 2.2 | Epic-level changes | [x] | Add stories 3.39 and 3.40 inside Epic 3. Supersede the stub allowance for the three seeded unwired sources. No epic removed. Epic 3 is not redefined. |
| 2.3 | Remaining epics | [x] | Epics 1 and 2 stay done and unchanged. Epic 4's stories 4.1–4.8 stay as written. Its entry gate is already met by story 3.37 and the Epic 3 retrospective. |
| 2.4 | Obsolete or new epics | [x] | No planned epic becomes obsolete. No new epic. FR-9 is already Epic 3. |
| 2.5 | Order and priority | [x] | Do not resequence Epic 4. 3.39 precedes 3.40. 3.40 does not start until the additional sources are named. |
| 3.1 | PRD | [!] | FR-9 stays a v1 requirement. One consequence is added so a `not wired` skip is not monitoring. MVP is not reduced. |
| 3.2 | Architecture | [!] | Replace the unimplemented `federalRegister.ts` / `tier2News.ts` names with the seeded source modules. No platform, schema, or API change. |
| 3.3 | UI/UX | [N/A] | `ux-brief-pack.md` already requires sources consulted, skip reasons, and the Tier-2-only flag on existing ops surfaces. No new screen. |
| 3.4 | Other artifacts | [!] | `epics.md` on approval. `sprint-status.yaml` only after explicit approval, through checklist 6.4. Implementation tests in `dailyRun.test.ts` change when 3.39 is built, not in this proposal. |
| 4.1 | Direct adjustment | [x] Viable | Effort medium. Risk medium. See section 3. |
| 4.2 | Rollback | [x] Not viable | Effort medium. Risk high. |
| 4.3 | MVP review | [x] Not viable | Effort high. Risk high. |
| 4.4 | Selected path | [x] | Option 1 — Direct adjustment. |
| 5.1 | Issue summary | [x] | Section 1. |
| 5.2 | Epic and artifact adjustments | [x] | This section and section 4. |
| 5.3 | Path and rationale | [x] | Section 3. |
| 5.4 | MVP impact and action plan | [x] | Section 3. |
| 5.5 | Handoff | [x] | Section 5. Not executed. |
| 6.1 | Checklist completion | [x] | Sections 1–5 are recorded. 6.3–6.5 are waiting on Patrick. |
| 6.2 | Proposal accuracy | [x] | Checked against the staging rows, `sources.ts`, `dailyRun.ts`, story 3.4, story 3.21, FR-9, and the architecture tree. |
| 6.3 | Explicit approval | [ ] | Not asked yet. Step 4 halts before approval. |
| 6.4 | `sprint-status.yaml` | [ ] | Not updated. Approval has not been given. |
| 6.5 | Next steps confirmed | [ ] | Handoff is described in section 5 and is not confirmed. |

### Epic impact

Epic 3 is the epic that contains the trigger. Stories 3.4 and 3.21 stay done. Their stub clauses are superseded for CFTC press, SCOTUS docket, and Legal news leads by story 3.39, the same way story 3.38 superseded only the fail-on-first HTTP 429 clause in story 3.23. Epic 3 gains stories 3.39 and 3.40. On approval, `epic-3` returns to `in-progress` because new stories are open. `bmad-create-story` blocks story creation in a done epic only for story `N.1`. Story 3.39 is not story 3.1, so that halt does not fire. `sprint_plan.py` never downgrades a `done` epic, so the status change is checklist 6.4 after approval, not a generate-only refresh.

Epics 1 and 2 have no source-connector scope. Epic 4 does not own FR-9. Its backlog stories do not change. The empty-run behavior does not make Epic 4 obsolete and does not create a gap that needs a fifth epic.

Order stays Epic 4 after Epic 3's already-met entry gate. 3.39 and 3.40 do not move in front of stories 4.1–4.8 and do not reopen that gate. Inside the new work, 3.39 is first because its three sources are already named in `POLL_SOURCES`. 3.40 waits on names that are not in the trigger.

### Story impact

| Story | Effect |
|---|---|
| 3.4 | Done. Add a supersession sentence. Do not rewrite the shipped Given/When/Then. |
| 3.21 | Done. The "remaining sources stay stubs" clause no longer covers CFTC press, SCOTUS docket, or Legal news leads. |
| 3.23, 3.27, 3.38 | Unchanged. Credential checks, fail-on-first for auth and 5xx, and CourtListener 429 pacing stay in force. |
| 3.39 | New. Wire the three seeded unwired sources. |
| 3.40 | New. Further web and publication sources. No hosts are named in this proposal. |
| 4.1–4.8 | Unchanged. |

Numbering follows `.agents/skills/bmad-create-epics-and-stories` (`### Story N.M: Title`) and `.agents/skills/bmad-sprint-planning` (`{epic}-{story}-{slug}` via `_slug`, max 60 characters). The next Epic 3 number after 3.38 is 3.39, then 3.40. Keys the generator would write, after approval only:

- `3-39-wire-seeded-cftc-scotus-and-legal-news-sources`
- `3-40-add-further-web-and-publication-sources`

### Artifact conflicts

- PRD FR-9 already requires both tiers and a public skip reason. It does not say a `not wired` stub counts as monitoring. The proposed sentence closes that reading.
- Architecture's connector filenames do not match `sources.ts`.
- UX has no conflict. B2 already shows sources consulted and skipped. B3 already shows the Tier-2-only flag.

### Technical impact

`sourceChecksFromEnv` gains a check for each seeded source that 3.39 wires. `stubCheck` remains the fallback for an unknown `poll_sources` name. CourtListener pacing in story 3.38 stays on the CourtListener check only. New fetches use the existing connector deadline, credential rules from story 3.27, and `source.skipped` with a scrubbed reason when access is blocked. No new D1 table. `poll_sources` already stores name, url, and tier. No deploy, staging call, or production call is part of this proposal. Story 3.40 does not add hosts until they are named.

## 3. Recommended approach

**Selected approach: Option 1 — Direct adjustment.**

Add stories inside Epic 3. Keep FR-9 in the v1 MVP. Do not roll back story 3.21 and do not shrink the MVP.

**Option 1 — Direct adjustment. Viable.** The three missing connectors are already named, tiered, and snapshotted. The registry, skip evidence, and empty-run rule already exist. Effort is medium: three fetchers, fixture tests, and a supersession note on two done stories. Risk is medium: CFTC and SCOTUS pages can change shape, and Legal news leads may refuse access. A refusal is a named skip, which is the FR-9 outcome, not a silent success. Timeline impact is a backlog addition. Epic 4's existing stories do not move.

**Option 2 — Rollback. Not viable.** Reverting story 3.21 removes the only live connector. The other three sources would still be unwired, and CourtListener would stop producing docket drafts. The rollback is not smaller than adding the missing checks. Risk is high.

**Option 3 — PRD MVP review. Not viable.** FR-9 is already in the v1 cut. Dropping Tier-2, or accepting permanent stubs, would make the MVP smaller than the PRD. Patrick's request is to monitor more sources, not fewer. Risk to the daily-loop claim is high.

**Why Option 1.** The empty Runs are the stub path working as story 3.21 specified, on a day CourtListener had nothing new. The fix is to monitor the sources the seed already lists, and to hold a second story for the additional web and publication sources Patrick asked for. That keeps the change inside the epic that owns FR-9.

**MVP.** The MVP is still the FR-9 pipeline. It is not achievable while three of four configured sources are `not wired`. Nothing moves to post-MVP. Story 3.40's extra sources are v1 monitoring scope once they are named. They are not a new product goal.

**Action plan.**

1. On approval, apply the section 4 edits to `epics.md`, the PRD, and `architecture.md`.
2. On approval, checklist 6.4 adds the two story keys as `backlog` and sets `epic-3` to `in-progress`. `sprint_plan.py` can add the keys and will not change `done` to `in-progress` by itself.
3. Implement 3.39. Tests replace the "other sources stay not wired" assertion for those three names. CourtListener behavior stays.
4. Patrick names the further web and publication sources. Until that list exists, 3.40 is not ready to implement.
5. Epic 4 stories stay backlog and are not reordered by this proposal.

## 4. Detailed change proposals

### Stories

#### Story 3.4: Source Monitoring & Draft Packaging

Section: Acceptance Criteria, after the partial-failure criterion.

OLD:

```
**And** partial connector failure is explicit on the Run (not marked fully successful)
```

NEW:

```
**And** partial connector failure is explicit on the Run (not marked fully successful)
**And** story 3.39 supersedes "stubs acceptable if they record skip reasons" for CFTC press, SCOTUS docket, and Legal news leads. A `not wired` skip on those three sources is not FR-9 monitoring.
```

Rationale: Story 3.4 is done and its original criterion records what shipped. The supersession is explicit, as story 3.38 was for story 3.23.

#### Story 3.21: First Live Connector

Section: Acceptance Criteria, after the stub criterion.

OLD:

```
**And** the remaining sources stay stubs with explicit `source.skipped` reasons
```

NEW:

```
**And** the remaining sources stay stubs with explicit `source.skipped` reasons
**And** story 3.39 supersedes that stub allowance for CFTC press, SCOTUS docket, and Legal news leads. Those three are fetched, or skipped with a named access reason. `not wired` is no longer their success path.
```

Rationale: `run-20261011-0000` followed this clause. The clause stays as the historical 3.21 contract and stops covering those three names.

#### Story 3.39: Wire seeded CFTC, SCOTUS, and legal-news sources

Section: new story, appended after story 3.38 and before Epic 4. Number 3.39 is the next Epic 3 number after 3.38. Story key, after approval: `3-39-wire-seeded-cftc-scotus-and-legal-news-sources`.

OLD:

```
(no story 3.39)
```

NEW:

```
### Story 3.39: Wire seeded CFTC, SCOTUS, and legal-news sources

As an operator,
I want the three seeded sources that are not CourtListener to be monitored,
So that a day with no new CourtListener entries is empty only when those sources were actually consulted or explicitly blocked.

**Depends on:** 3.21, 3.27, 3.38. Does not replace 3.21, 3.23, or 3.38. Does not change Epic 4.

**Acceptance Criteria:**

**Given** poll-sources version 0 names CourtListener, CFTC press, SCOTUS docket, and Legal news leads
**When** a Run packages those four sources
**Then** CFTC press and SCOTUS docket are consulted as Tier-1, and Legal news leads is consulted as Tier-2
**And** each of those three emits `source.fetched` or `source.skipped` with a scrubbed reason other than `not wired`
**And** a blocked or disallowed fetch records the skip and does not invent entries
**And** material items from a consulted source become Drafts with tier labels under the story 3.4 package, and still cannot write live F1
**And** CourtListener keeps story 3.38 pacing and story 3.23's fail-on-first behavior for 401, 403, 5xx, network, and timeout
**And** an access failure on one of the three does not by itself fail CourtListener
**And** fixture tests cover a fetch, a named access skip, and a CourtListener-only registry no longer being the success path for these three names
**And** this story does not deploy, call staging or production, or make a paid model call
```

Rationale: These are the three `not wired` rows on `run-20261011-0000`. The story does not add hosts beyond that seed.

#### Story 3.40: Add further web and publication sources

Section: new story, immediately after 3.39. Story key, after approval: `3-40-add-further-web-and-publication-sources`.

OLD:

```
(no story 3.40)
```

NEW:

```
### Story 3.40: Add further web and publication sources

As an operator,
I want web and publication sources beyond the four seeded names,
So that Tier-2 leads are not limited to the single Legal news leads row.

**Depends on:** 3.39. Does not start until Patrick names each additional source.

**Acceptance Criteria:**

**Given** a list Patrick has named, each item with a display name, https URL, and tier
**When** that list is added to `poll_sources`
**Then** each named source is consulted on a Run, or skipped with a scrubbed access reason other than `not wired`
**And** a web or publication lead that is not itself a primary document is Tier-2
**And** a Tier-2-only Draft stays ineligible for agent auto-approval (FR-9, FR-17)
**And** no URL is added that Patrick did not name
**And** this story does not deploy, call staging or production, or make a paid model call until a later approved story says so
```

Rationale: The trigger asks for more web and publication sources and does not name them. The story holds that request without inventing hosts.

#### `epics.md` frontmatter

Section: `scopeAmendments`, append one entry. Leave the 2026-10-11 story 4.8 entry in place.

OLD:

```
  - '2026-10-11: Story 4.8 adds plain-language help, approve/reject identity confirmation, and an explicit private choice on the admin approver flow. See sprint-change-proposal-2026-10-11.md. Story 3.37 is unchanged.'
```

NEW:

```
  - '2026-10-11: Story 4.8 adds plain-language help, approve/reject identity confirmation, and an explicit private choice on the admin approver flow. See sprint-change-proposal-2026-10-11.md. Story 3.37 is unchanged.'
  - '2026-10-11: Stories 3.39 and 3.40 monitor the seeded unwired sources and hold further web and publication sources. See sprint-change-proposal-2026-10-11T1823Z.md. Stories 3.4 and 3.21 keep their shipped text and gain a supersession sentence.'
```

Rationale: The epic file records approved scope changes in frontmatter. This entry is applied only if the proposal is approved.

### PRD

#### FR-9: Two-tier source monitoring

Section: Consequences, after the skip-reason bullet in `_bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md`.

OLD:

```
- Source access respects each source's access/ToS constraints at the capability level (mechanism deferred to architecture); blocked sources are recorded as skipped with reason, not silently omitted — and that skip reason is part of the public Evidence record.
```

NEW:

```
- Source access respects each source's access/ToS constraints at the capability level (mechanism deferred to architecture); blocked sources are recorded as skipped with reason, not silently omitted — and that skip reason is part of the public Evidence record.
- A configured source skipped only because no connector is wired is not monitored. Tier-1 and Tier-2 monitoring means each configured source is fetched, or skipped for a named access constraint.
```

Rationale: FR-9 already requires both tiers. The new sentence stops the story 3.4 stub allowance from being read as compliance. MVP scope is unchanged. No FR is removed. Web and publication leads stay Tier-2 under the existing glossary unless the document is itself a primary source.

### Architecture

#### Connector modules

Section: Project directory tree, `src/pipeline/connectors/`.

OLD:

```
│   │   ├── connectors/
│   │   │   ├── courtlistener.ts
│   │   │   ├── federalRegister.ts
│   │   │   └── tier2News.ts
```

NEW:

```
│   │   ├── connectors/
│   │   │   ├── courtListener.ts
│   │   │   ├── cftcPress.ts
│   │   │   ├── scotusDocket.ts
│   │   │   └── legalNewsLeads.ts
```

Rationale: The tree names modules that were never added. The seeded sources are CFTC press, SCOTUS docket, and Legal news leads. `courtListener.ts` matches the file on disk. Story 3.40 adds further modules only for sources Patrick names. That list is not drawn here.

#### External integrations

Section: Integration Points, External Integrations.

OLD:

```
- CourtListener, Federal Register, Tier-2 sources via `pipeline/connectors`
```

NEW:

```
- CourtListener, CFTC press, SCOTUS docket, and Legal news leads via `pipeline/connectors`. Further web and publication sources are added only when named.
```

Rationale: Federal Register is not in `POLL_SOURCES`. The integration line should match the seed plus the 3.40 gate.

No diagram change. The Daily Run flow already says "connectors (Tier-1 / Tier-2)". No technology-stack change. Ripple: `sourceChecksFromEnv` and the story 3.21 test that locks the registry to CourtListener. Those are implementation of 3.39, not edits in this proposal.

### UI/UX

No edit. `ux-brief-pack.md` sections B1, B2, and B3 already show Run status, sources consulted and skipped, and the Tier-2-only flag. New source names appear on those surfaces. No wireframe, flow, component, or accessibility change.

## 5. Implementation handoff

**Scope: Moderate.** Backlog reorganization. New stories in an epic that is marked done. Not a one-story implementation with no planning change. Not a new epic or a platform replan.

**Route to:** Product Owner and Developer agents, after approval.

| Role | Responsibility |
|---|---|
| Product Owner | Apply the approved section 4 text to `epics.md`, the PRD, and `architecture.md`. |
| Correct Course, checklist 6.4 | After a yes, add `3-39-wire-seeded-cftc-scotus-and-legal-news-sources: backlog` and `3-40-add-further-web-and-publication-sources: backlog`, and set `epic-3: in-progress`. Do not hand-edit that file before approval. `sprint_plan.py` may add the keys from `epics.md` and will leave `epic-3: done` unless 6.4 also sets `in-progress`. |
| Developer | Implement 3.39 from the approved story. Do not implement 3.40 until Patrick names each source. |

**Success criteria.**

- A Run that consults the four seeded sources does not record `not wired` for CFTC press, SCOTUS docket, or Legal news leads.
- An empty Run still happens when every consulted source has no material change. That remains the FR-10 outcome.
- A blocked source records a scrubbed access reason and does not invent a Draft.
- Story 3.40 adds no URL that Patrick did not name.
- Epic 4 stories 4.1–4.8 are unchanged.
- No deploy and no staging or production call is performed by this proposal.

Checklist 6.3, 6.4, and 6.5 are open. Step 5 has not been asked.
