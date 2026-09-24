---
title: 'Retire “pipeline is not live” copy'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The apex tracker still describes the daily pipeline and Approval Gate as future features, although the daily loop is running. Readers see contradictory claims about the public run log and proposed changes.

**Approach:** Update the masthead's zero-pending-drafts copy to say there are no pending drafts and retain its ops link. State that published claims are the seeded, human-curated record and proposed changes appear in full on ops., labelled not live. Describe the run log, Evidence, pending drafts, approval mode, and audit trail in the present tense; leave the future governance explainer in the future tense. Update the credibility strip consistently. Remove “not live yet” and “once the pipeline ships” from apex strings. Reuse existing ops links and leave data, routing, and deployment unchanged.

</frozen-after-approval>

## Implementation Notes

- Updated `Masthead.tsx`, `CredibilityStrip.tsx`, and `ApexShell.tsx`. The zero-draft link now reads “No pending drafts — see the run log on ops.” Trust and credibility copy retain the sourced-seed description and label proposed changes not live. The ops band describes existing receipts in the present tense and leaves the Epic 4 explainer as future work.
- Scope is copy only: no new public API, pending-count data wiring, host routing, or deploy. The approved proposal assigns staging host wiring and deploy to Story 3.22 after Stories 3.23–3.25.
- Validation: `npm run check` passed; existing orientation and trust component suites passed (2 files, 45 tests). Source inspection found no remaining “not live yet”, “once the pipeline ships”, “pipeline is not live”, or “ship in Epic 3” in apex components. `git diff --check` passed.

## Review Triage Log

- `medium` — **defer:** The masthead asserts zero pending drafts without reading a count. Confirmed in `MastheadProps`, its `ApexShell` caller, and `ApexKpisSchema`; the same unconditional assertion exists at the baseline revision. Ops reads `/api/drafts` independently. This is existing data-wiring debt outside the approved copy-only story; record a follow-up rather than replacing the required zero-state sentence with neutral text.
- `false` — **reject:** The seed wording leaves the publication boundary implicit. The revised trust paragraphs explicitly say proposed changes pass through the Approval Gate before publication and appear on ops. labelled not live. “Seeded, human-curated record” also preserves Story 3.24's requested description; a broader terminology rewrite is not needed for this change.
