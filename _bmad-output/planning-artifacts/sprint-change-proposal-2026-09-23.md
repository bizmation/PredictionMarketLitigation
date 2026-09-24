# Sprint Change Proposal — Staging ops host (`ops-build`)

**Date:** 2026-09-23
**Author:** Developer agent with Patrick
**Mode:** Incremental
**Status:** Approved 2026-09-23. Handoff is Moderate: stories 3.22–3.25 are `backlog` in sprint status; Edit 6 is applied in `epics.md`. Code and deploy are not done.
**Trigger:** Epic 3 retrospective (`_bmad-output/implementation-artifacts/epic-3-retro-2026-09-22.md`, verdict rejected).

---

## Section 1 — Issue Summary

**Problem statement.** Epic 3’s code is on worker `pml-build`, and the public ops hostname is still the landing-page brochure. The Runs that do exist are labelled `empty` on days when every CourtListener docket returned HTTP 400. The apex page on that same worker still says the pipeline is not live, and every Run publishes a null budget.

**When found.** Epic 3 retrospective, 2026-09-22. Patrick then required a one-level staging subdomain, and locked the hostname, worker, and link behavior on 2026-09-23.

**Evidence.**

- `https://ops.predictionmarketlitigation.com/` is the brochure (worker `pml`). `https://build.predictionmarketlitigation.com/runs/run-20260922-0000` renders the apex tracker, because `isOpsHost` is `hostname.startsWith("ops.")`.
- `run-20260919-0000` through `run-20260922-0000` are `status: "empty"` with four CourtListener dockets at HTTP 400.
- Apex copy on `build.` includes “the daily pipeline is not live”.
- All six live Runs publish `budgetCents: null`. Migration 0017 seeded a 500¢ default. The gateway reads that default only at call time.
- Universal SSL on a full zone covers the apex and `*.predictionmarketlitigation.com` only (Cloudflare Universal SSL and Advanced Certificate Manager, both updated 2026-08-14). `ops.build.` would be a second level and would need its own advanced certificate.

**Issue type.** Failed approach. The PRD already names `ops.predictionmarketlitigation.com` as the receipts site. The deploy runbook held that hostname on the landing-page worker until the apex cutover.

---

## Section 2 — Impact Analysis

### Checklist

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Trigger | [x] | Epic 3 retro, plus Story 1.5 (domains bound to the brochure worker) and Story 3.7 (run log) |
| 1.2 | Core problem | [x] | Failed approach. Requirement did not change |
| 1.3 | Evidence | [x] | Section 1 |
| 2.1 | Epic 3 completable as planned? | [!] | Not until the ops shell is reachable and a total fetch failure is `failed` |
| 2.2 | Epic-level changes | [x] | Add stories 3.22–3.25 inside Epic 3. No new epic |
| 2.3 | Future epics | [x] | Epic 4 still assumes a real `ops.` host. Its stories stay as written |
| 2.4 | Obsolete / new epics | [N/A] | None |
| 2.5 | Order | [x] | 3.23, 3.24, and 3.25 before 3.22’s deploy, so the first public ops page is not a false empty. Epic 4 stays backlog until those four are done |
| 3.1 | PRD | [x] | No change. FR-13 and FR-27 already require public `ops.` |
| 3.2 | Architecture | [!] | `architecture.md` already names both production domains. `docs/deploy-runbook.md` is what changes |
| 3.3 | UX | [x] | No new screen. Apex sentences that say the pipeline is not live are Story 3.24 |
| 3.4 | Other artifacts | [!] | `wrangler.jsonc` `env.build.routes`; `epics.md` status tokens; sprint status. Stories 3.14–3.21 missing from `epics.md` stay on the existing open item `epic-3-cc-item-1` |
| 4.1 | Direct adjustment | [x] Viable | Medium effort. Medium risk on the hostname attach, low on the other three stories |
| 4.2 | Rollback | [x] Not viable | The pipeline, gate, and shells stay |
| 4.3 | MVP review | [x] Not viable | Dropping public ops would cut locked FR-13 and FR-27 |
| 4.4 | Selected path | [x] | Option 1 — Direct adjustment |
| 5.1–5.5 | Proposal components | [x] | This document |
| 6.1–6.2 | Review | [x] | Complete proposal assembled from the six approved edits |
| 6.3 | Explicit approval of the whole proposal | [x] | Patrick: Continue, 2026-09-23 |
| 6.4 | Sprint status write | [x] | `3-22` through `3-25` added as `backlog` |
| 6.5 | Handoff confirmed | [x] | Moderate. Developer agent implements 3.23, 3.24, 3.25, then 3.22 |

### Epic impact

Epic 3 gains four stories: 3.22, 3.23, 3.24, 3.25. Epic 4 is unchanged and stays backlog until those four are done.

### Story impact

No existing story is reopened. 3.14–3.21 stay `done`. Their absence from `epics.md` remains `epic-3-cc-item-1`.

### Technical impact

- One new custom domain on worker `pml-build`: `ops-build.predictionmarketlitigation.com`. Production `ops.` stays on worker `pml`.
- `src/shared/lib/surface.ts`: treat that exact host as the ops shell, and point staging ops links at it.
- CourtListener: every-docket failure becomes `failed: true`. Scrubbed response reason on Evidence. No token.
- Apex copy. No new route.
- Both Run insert paths copy the config budget default onto new rows. Existing rows stay null.
- `npm run deploy` is not run.

---

## Section 3 — Recommended Approach

**Selected: Option 1 — Direct adjustment.**

The PRD and architecture already describe the ops hostname. The gap is the staging binding, plus three defects that would be the first thing a visitor sees there. Rollback would throw away a working pipeline. Cutting public ops would abandon locked requirements.

**Trade-off.** Production `ops.predictionmarketlitigation.com` remains the brochure until the apex cutover. Staging readers use `ops-build.`. That is the locked choice, made so the certificate stays on the Universal SSL wildcard `*.predictionmarketlitigation.com`.

**Effort:** Medium. Four stories plus a runbook and `epics.md` token pass.
**Risk:** Medium on attaching the custom domain (a hostname belongs to one Worker). Low on the copy, budget stamp, status words, and the failure classification.
**Sequence:** doc token pass and stories 3.23–3.25 first; story 3.22’s `npm run deploy:build` last.

---

## Section 4 — Detailed Change Proposals

All six edits below were approved individually on 2026-09-23.

### Locked decisions

| # | Decision | Locked choice |
|---|---|---|
| 1 | Staging ops URL | `ops-build.predictionmarketlitigation.com`. Production `https://ops.predictionmarketlitigation.com/` stays the brochure. |
| 2 | Worker | Existing `pml-build` and D1 `pml-build`. No new Worker, no new database. |
| 3 | Links from the staging tracker | On `build.` and `ops-build.`, ops links use `https://ops-build.predictionmarketlitigation.com`. On `predictionmarketlitigation.com`, ops links stay `https://ops.predictionmarketlitigation.com`. |

`npm run deploy` stays forbidden.

### Edit 1 — Runbook and Wrangler

**Artifact:** `docs/deploy-runbook.md` environment matrix; `wrangler.jsonc` `env.build.routes`

**OLD:** Staging’s only domain is `build.predictionmarketlitigation.com`. The live-check line says not to point `ops.` at `pml-build` until cutover. Apex and `ops.` move together.

**NEW:** Staging domains are `build.predictionmarketlitigation.com` (apex shell) and `ops-build.predictionmarketlitigation.com` (ops shell), both custom domains on `pml-build`. Production `ops.` stays on worker `pml` until the apex cutover. `env.build.routes` gains:

```jsonc
{ "pattern": "ops-build.predictionmarketlitigation.com", "custom_domain": true }
```

### Edit 2 — Story 3.22

**Artifact:** `epics.md`, after Story 3.21’s place in the epic (the file currently ends Epic 3 at Story 3.13; 3.14–3.21 are inserted by `epic-3-cc-item-1`, and 3.22 follows them). `sprint-status.yaml` key: `3-22-staging-ops-host: backlog`.

### Story 3.22: Staging ops host (`ops-build`)

As any visitor on staging,
I want the ops shell on `ops-build.predictionmarketlitigation.com`,
So that Runs, Evidence, and pending Drafts are readable on a one-level subdomain without taking down the production brochure.

**Acceptance Criteria:**

**Given** worker `pml-build` and D1 `pml-build`
**When** `npm run deploy:build` runs
**Then** `ops-build.predictionmarketlitigation.com` is a custom domain on `pml-build` only
**And** `ops.predictionmarketlitigation.com` remains on worker `pml`
**And** `https://ops-build.predictionmarketlitigation.com/runs/:id` renders the ops shell (run log and Evidence), not the apex tracker
**And** on `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com`, ops links use `https://ops-build.predictionmarketlitigation.com`
**And** on `predictionmarketlitigation.com`, ops links stay `https://ops.predictionmarketlitigation.com`
**And** `npm run deploy` is not run

### Edit 3 — Story 3.23

**Artifact:** `epics.md`, after Story 3.22. `sprint-status.yaml` key: `3-23-fail-a-total-courtlistener-outage: backlog`.

### Story 3.23: Fail a total CourtListener outage

As a reader on the ops shell,
I want a day when every docket fetch fails to be a failed Run,
So that “empty” means the connector looked and found nothing new.

**Acceptance Criteria:**

**Given** a CourtListener poll of one or more dockets
**When** every docket returns an error
**Then** the source is `failed: true` and a zero-draft Run finishes `failed`, not `empty`
**And** Evidence records each docket’s status and a scrubbed response reason, and never the API token
**And** `itemCount` is the number of new entries, not the number of summary objects
**And** one docket error beside a docket that returned entries stays non-fatal for the source
**And** 401, 403, 429, 5xx, network, and timeout still fail the source on the first such response

### Edit 4 — Story 3.24

**Artifact:** `epics.md`, after Story 3.23. `sprint-status.yaml` key: `3-24-retire-pipeline-not-live-copy: backlog`.

### Story 3.24: Retire “pipeline is not live” copy

As a reader on the apex tracker,
I want the page to describe the pipeline that is actually running,
So that a scheduled Run is not described as a future feature.

**Acceptance Criteria:**

**Given** the apex shell on `build.` or production
**When** the pending-draft count is zero
**Then** the masthead says there are no pending drafts and links to the ops shell, and it does not say the pipeline is not live
**And** the trust paragraphs say published claims are the seeded record and that proposed changes are on the ops shell, labelled not live
**And** the ops band says the run log is public now, and that drafts appear there labelled not live
**And** no apex string contains “not live yet” or “once the pipeline ships”

### Edit 5 — Story 3.25

**Artifact:** `epics.md`, after Story 3.24. `sprint-status.yaml` key: `3-25-stamp-run-budget-ceiling: backlog`.

### Story 3.25: Stamp the budget ceiling onto each new Run

As a reader of the run log,
I want each Run to show the budget ceiling that was in force when it started,
So that a null budget is not mistaken for “no ceiling.”

**Acceptance Criteria:**

**Given** a gateway config default of 500¢
**When** a scheduled, catch-up, or manual Run is inserted
**Then** `runs.budget_cents` is that default
**And** the public Run list and Run detail show that number
**And** a later change to the config default does not rewrite Runs that already started
**And** the gateway still refuses a call when recorded spend reaches the Run’s own ceiling

Existing rows on `pml-build` stay null.

### Edit 6 — `epics.md` status words

**Artifact:** story acceptance criteria in `epics.md` only. No new story. No code change.

**OLD:** Stories 3.1, 3.2, 3.7, 3.9, and 3.12 name the stored status as `awaiting-approval` or `budget-stopped`.

**NEW:** Where a criterion names the stored Run status or the evidence event, use `awaiting`, `stopped`, and `run.stopped`. The public chip labels stay as built: status `stopped` renders “budget-stopped”, status `awaiting` renders “awaiting approval” (`src/shared/ui/RunStatusChip.tsx`). FR19, NFR7, and UX-DR6 keep the English phrase “budget-stopped” for that chip.

---

## Section 5 — Implementation Handoff

**Scope: Moderate.** Four new backlog stories and two document edits. The epic is not replanned. The PRD does not change.

**Who does what**

- **This approval** writes the four story keys into `sprint-status.yaml` as `backlog`, and applies Edit 6 to `epics.md`. It does not deploy.
- **Developer agent** implements 3.23, 3.24, and 3.25, then 3.22 (runbook, `wrangler.jsonc`, `surface.ts`, `npm run deploy:build`).
- **`epic-3-cc-item-1`** stays the separate task that inserts stories 3.14–3.21 into `epics.md`.

**Success criteria**

- `https://ops-build.predictionmarketlitigation.com/runs/:id` is the ops shell, and `https://ops.predictionmarketlitigation.com/` is still the brochure.
- A CourtListener poll where every docket errors finishes `failed`, with a scrubbed reason and no token in Evidence.
- Apex has no “not live yet” and no “once the pipeline ships”.
- A new Run stores the 500¢ ceiling. The six existing Runs stay null.
- `epics.md` criteria name `awaiting` and `stopped`. The chip still says “budget-stopped”.
- `npm run deploy` was not run.

**Continue** approves this proposal for that handoff. **Edit** revises it first.
