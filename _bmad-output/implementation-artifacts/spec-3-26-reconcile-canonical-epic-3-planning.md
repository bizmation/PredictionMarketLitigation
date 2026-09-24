---
title: 'Reconcile canonical Epic 3 planning'
type: 'chore'
created: '2026-09-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Canonical Epic 3 planning omits eight already-approved stories and the F9 steering requirements, making completed scope and remaining corrective work difficult to trace.

**Approach:** Backfill 3.14–3.21 from the approved August 9 and September 17 proposals; integrate F9/FR46–50 into the PRD and epic coverage; connect approved B8/C4 UX additions and explicit implementation decisions. Verify unique 3.1–3.37 definitions/tracking, retain the approved corrective architecture/UX amendments, and close only the canonical backfill action with evidence. Preserve historical completion and rejected acceptance, the 500-cent policy, current status tokens, and the remaining corrective backlog. This is planning reconciliation, with no runtime, deployment, paid calls, or content publication.

</frozen-after-approval>

## Implementation Notes

- Route facts: no unresolved intent gaps; no irreversible runtime effects; a bounded documentation change across epics.md, PRD, UX, architecture and existing context/status records. The complete story scope was approved in the September 24 proposal. Use the small-change route.
- Preserve the prior turn's approved uncommitted course-correction edits on branch `codex/3-26-reconcile-epic-3-planning`; they are an authorized prerequisite, not unrelated work. Baseline commit: c630094aa235e9425f4fbd18ffde2a2ec842b084.
- Sources: August 9 proposal §4.1–4.7; September 17 proposal §4.1–4.3; completed implementation specs 3.14–3.21 and deferred-work dispositions; September 24 corrective proposal controls current acceptance and sequencing.
- Verification: source-text parity for historical ACs, unique story IDs and FR definitions/coverage, source-link resolution, preservation of other action statuses, documentation formatting and diff checks. No runtime test suite is warranted for documentation-only edits.

- Implemented historical story/FR source parity, canonical F9 cross-references and coverage, B8/C4 UX, steering architecture, and approved exception notes. Preserved the rejected retrospective, remaining corrective work and original completed stories. Context regeneration retains export, primary-support and sequencing constraints.
- Review patches amend the planning documents that are explicitly this story's authorized deliverable; no frozen intent or runtime behavior changed.

## Review Triage Log

2026-09-24: Blind Hunter reported 10 findings (floor calculation: 90.737 kB → 10). All verified and patched; no deferrals.

1. medium / patch — PRD §11 omitted approved F9; added launch-scope entry.
2. low / patch — canonical 1.2 omitted the approved ChatAgent retention amendment; restored it with its authentication boundary.
3. medium / patch — orchestration overview lacked the steward loop; added permitted effects, evaluation re-entry and denied capabilities.
4. medium / patch — event vocabulary omitted steering events; added implemented names and explicit 3.14/3.17 refusal-event refinement, rather than inventing steering.denied.
5. low / patch — 3.19 “one helper” conflicted with its approved two-helper implementation; recorded client/server helper refinement while preserving original AC text.
6. medium / patch — corrective diagram conflated unknown provider liability with evaluation completion; separated reconciliation from completed evaluation or explicitly recorded not-run readiness.
7. low / patch — corrective diagram and component descriptions lacked cross-links; linked data, model routing and orchestration to the governing corrective boundaries.
8. medium / patch — regenerated context omitted thin Evidence export; restored FR26 requirement.
9. medium / patch — regenerated context omitted primary-support/pending-primary publication rule; restored it and Tier-2 autonomy restriction.
10. low / patch — PRD/architecture revision metadata omitted current reconciliation; updated date and architecture amendment provenance.

## Verification

Source-parity validation passed for all eight historical AC blocks and all FR46–50 consequences. IDs 3.1–3.37 are unique in epics and tracking; local source links resolve; UX B8/C4 and FR coverage are present. `npm run check` and `git diff --check` passed after review patches. No runtime code changed; required CI will run the full suite on the PR.

- Required CI run 36037980580 passed check and the full real-Worker/Miniflare test suite on implementation commit 5c34401e4b787709a5a16cefa9601b6b63630626. Story/action completion is carried in PR #42; the final metadata commit is also subject to required CI before merge.
