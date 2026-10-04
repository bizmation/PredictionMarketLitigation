---
title: '3.35 — Drive apex pending copy from public Draft data'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
baseline_revision: 'b5fa8bce057dbe2fcab60b484d676083c1058f4c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred:
  - summary: >-
      Existing public Draft validation accepts partial evaluation metadata and arbitrary date strings.
    evidence: |-
      The guard is moved unchanged from PendingDrafts. Consumers read only the guarded evaluation status/flag and date formatters explicitly render Unknown date for invalid strings; pending membership is unaffected. Tightening the full wire schema is pre-existing low-impact validation work.
    location: >-
      src/shared/lib/publicDrafts.ts:isDraftRecord
    severity: low
---

<intent-contract>

## Intent

**Problem:** The apex masthead always asserts no pending drafts. The public ops band also converts request failures into an empty list, so readers cannot distinguish no proposals from unavailable data.

**Approach:** Derive the masthead count and public pending band from one reusable public Draft contract, with consistent refresh behavior and honest loading, fresh, error and stale presentation.

## Boundaries & Constraints

**Always:** Use the existing public `/api/drafts` feed and its undecided revision-chain heads as the pending authority. Include pending/unavailable evaluation heads that are visible in the public band; pending does not mean ready for approval. Exclude rejected archive and approved/edited records from counts. Preserve Not Live labels, readiness, public Evidence links, private-content boundaries and 3.24 copy cleanup. Keep existing editorial headings and breadcrumb/UI improvements. Refresh both surfaces on mount, focus/return to visibility and a bounded periodic interval (30 seconds) so decisions and revisions made on another host become visible without relying on same-origin notifications. Refresh uses uncached public reads; no overlapping requests or updates after unmount. Prior snapshots shown after a failed refresh are explicitly stale, including prior zero. Use accessible status announcements; provide retry without requiring reload. Continue to use environment-correct ops links targeting `#drafts`.

**Never:** Add an independent count endpoint, count rejected history as pending, infer zero from a failed/malformed/timeout response, claim stale data is current, expose admin data, perform paid inference, approve content, alter legal copy or advance 3.34. Story 3.28 is the dependency; 3.34 is not required for this independent UI correction.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First load | Request unresolved | Masthead and band explicitly loading, no asserted zero | Deadline remains bounded |
| Empty | Successful valid empty list, or rejected-only feed | Zero pending reported; archive retained separately | No error |
| Positive | One then multiple undecided heads, mixed readiness and rejected records | Matching pending count/cards, singular/plural copy, not-live link to ops drafts | Never count archive |
| Initial failure | HTTP/network/timeout/malformed feed | Unavailable status and retry, no zero claim | No fabricated data |
| Refresh failure | Previously successful positive or zero result, next request fails | Previous result clearly stale; no current zero assertion | Retry can restore freshness |
| Decisions/revision | Approve, reject or supersede a head between public reads | Both surfaces refresh to the same current membership/count; no old ancestor counted | Deterministic timer/focus refresh tests |
| Lifecycle | Repeated refresh events while request active; unmount while pending | No concurrent duplicate requests or late state writes | Abort/cleanup timers/listeners |

</intent-contract>

## Code Map

- `src/surfaces/apex/orientation/Masthead.tsx:59` — unconditional zero text; replace with shared public summary. `ApexShell.tsx:106` already supplies environment-correct opsHref.
- `src/surfaces/ops/PendingDrafts.tsx` — isDraftRecord, unwrapItems, useDrafts currently conflate failures with empty; move reusable validation/loading/selection contract into shared code. Preserve public card/archive/diff rendering and exported validator compatibility with existing tests.
- `src/shared/db/repos/draftsRepo.ts:listPublicDrafts` — authoritative undecided chain heads plus rejected archive; excludes approved/edited. Read-only unless a demonstrated contract gap requires a minimal repair. Existing repository/API tests already cover revision-chain eligibility.
- `src/shared/lib/draftReadiness.ts` — readiness differs from pending membership; reuse labels without tightening public eligibility.
- `src/shared/lib/timeouts.ts` — bounded 15-second public GET and abort support. `src/shared/lib/surface.ts` — staging/dev-safe links.
- `src/surfaces/ops/pendingDrafts.mount.test.tsx`, `pendingDrafts.test.tsx`, `src/surfaces/apex/orientation/orientation.test.tsx`, `src/surfaces/shells.test.tsx` — existing rendering contracts; obsolete failure-as-zero expectations must become explicit unavailable assertions.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3.35 status and action 13 remainder; update closure only on verified delivery. Story 3.33 continuity: maintain public/private evidence boundaries and source truth; its admission/accounting code is outside this change.

## Tasks & Acceptance

**Execution:**
- `src/shared/lib/publicDrafts.ts` and/or a shared React hook module — extract validator, public pending selection and fresh/stale request lifecycle; reuse in both surfaces.
- `src/surfaces/apex/orientation/Masthead.tsx`, `src/surfaces/ops/PendingDrafts.tsx` — consume common state, accessible summary/loading/error/stale/retry, preserve full public cards and not-live treatment.
- Relevant `*.test.tsx` under `src/surfaces` and shared hook tests — cover every matrix row with real rendered consumers, deterministic timers/deferred fetches and varied public snapshots; preserve existing repository/API revision contract tests.

**Acceptance Criteria:**
- Given the published Draft feed, when readers inspect the masthead and ops pending band, then both derive pending membership from that feed and show matching current counts/cards with links into inspectable not-live proposals.
- Given a changed decision or revision, when either public surface refreshes, then its accessible status reflects the new public snapshot without an independent or obsolete count.
- Given an unavailable or stale feed, when a reader inspects either surface, then its state does not assert that no proposals exist and retry can recover.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 11 findings — high 0, medium 4, low 3, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` B1 positive stale/refresh summaries omit Not live — preserve the explicit label for every positive snapshot; the masthead has no card banner to supply it.
  - `[low]` `[patch]` B2 empty panel disappears during each refresh — retain its layout with snapshot-qualified copy until a current result arrives.
  - `[medium]` `[patch]` B3 unchanged poll results repeatedly announce refreshing — keep fresh status text stable during automatic reads; still announce changed counts, errors and recovery.
  - `[low]` `[reject]` B4 no retrieval timestamp for stale count — stale/current-unavailable wording already prevents a freshness claim. Distinguishing age would add stored state and presentation for prolonged failure; useful enhancement but not necessary to resolve a reader-facing false claim.
  - `[low]` `[defer]` B5 partial nested metadata/date validation — extracted guard is unchanged and the formatters handle invalid dates as Unknown date; current consumers only read guarded evaluation fields. Record pre-existing schema completeness rather than widening this correction.
  - `[medium]` `[patch]` B6 ready fixture is actually unready — supply a valid completed summary and assert actual ready, pending and unavailable card presentation.
  - `[medium]` `[patch]` B7 refresh body timeout/late result regression missing — add deferred refresh cases after zero/positive snapshots, active retry and obsolete-body resolution after recovery.
  - `[false]` `[reject]` I1 workflow closure absent in review-stage diff — in-review/in-progress is correct until review/finalization completes; no completed workflow is asserted by the staged snapshot.
  - `[false]` `[reject]` I2 scripted frontend responses do not prove deployed endpoint behavior — these verify the changed client lifecycle; existing real-D1 public API and approval/revision tests verify the feed. Staging read-only verification follows delivery, without substituting mocks for runtime acceptance.
  - `[false]` `[reject]` I3 revision eligibility delegated to server — intentionally preserves the existing authoritative listPublicDrafts/pendingTips contract, with existing API/revision regressions in the full suite. No new client reimplementation is required.
  - `[false]` `[reject]` I4 independently fetched snapshots can differ in time — both separate-host surfaces use the same contract and refresh policy; atomic cross-host simultaneous snapshots are neither required nor claimed.
- Verification-gap and edge-case layers reported no findings. Reviewer slot limits required reusing two reviewers from unrelated prior work; neither had this implementation context. All four layers reported before triage.

## Verification

- `npx vitest run --project ui --reporter=verbose` — all UI cases and matrix tests execute successfully.
- `npm test` — all repository/API/UI regressions pass with no new skips.
- `npm run check` — formatting, lint and TypeScript pass.
- `git diff --check` — no whitespace errors.


## Auto Run Result

Implemented one shared public Draft validator, pending/archive selector, loading/refresh lifecycle and status presentation for the apex masthead and ops pending band. Rejected history does not inflate the count; unavailable/evaluating heads remain visible. Both hosts refresh on mount, focus, visibility and every 30 seconds with uncached, bounded reads. Failures retain explicitly stale snapshots, retry is available, and late responses cannot replace current membership. Headings and other UI improvements are preserved.

Files changed:
- `src/shared/lib/publicDrafts.ts` — extracted public validation and pending/archive membership.
- `src/shared/lib/usePublicDrafts.ts` — shared bounded fetch, refresh, cleanup, stale/retry and status contract.
- `src/surfaces/apex/orientation/Masthead.tsx` — live count/status and environment-correct inspect link.
- `src/surfaces/ops/PendingDrafts.tsx` — shared lifecycle with preserved cards/archive and stable qualified empty panel.
- `src/surfaces/publicDrafts.mount.test.tsx` — 31 rendered lifecycle/matrix cases across both consumers.
- `src/surfaces/ops/pendingDrafts.mount.test.tsx`, `src/surfaces/shells.test.tsx` — truthful unavailable/loading expectations and links.
- Story spec and sprint record — implementation, review and closure evidence.

Review: five patches (medium 4, low 1) preserve Not live labels, avoid routine announcement churn/layout removal, correct ready fixtures and cover deferred refresh timeouts/obsolete responses. One low pre-existing validation issue is deferred. Five findings rejected: retrieval timestamps are an optional additional state/presentation enhancement; review-stage status is not a false completion claim; client mocks complement existing real-D1 endpoint tests; revision eligibility remains the tested server authority; separate-host reads need common semantics rather than atomic synchronization. Full evidence and individual verdicts appear above.

Follow-up review recommendation: false. The four medium patches have direct rendered regression coverage and the parent inspected the final repair diff; no specific unverified repair risk remains.

Verification: `npx vitest run --project ui --reporter=verbose`: 469 passed, 32 files; `npm test`: 1410 passed, 61 files; `npm run check` and `git diff --check`: passed. All seven matrix rows ran successfully, including initial failures of eight kinds, zero/positive stale snapshots, valid ready/pending/unavailable cards, timer/focus/visibility decision/revision refresh, cleanup and StrictMode obsolete requests. No new skips. Existing repository/API eligibility regressions remain unchanged and pass.

Residual limits: separate public hosts refresh independently and can observe different moments within the refresh interval. Schema completeness deferral is pre-existing and does not change pending membership. Staging confirmation and action 13 closure follow delivery; 3.34 remains backlog until its own build. No paid inference or approvals were performed.
