---
title: 'Constrain connector pagination credentials'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CourtListener pagination accepts an upstream next URL and attaches authorization without checking its origin. Automatic redirects can also send that credential to another destination.

**Approach:** Validate initial and subsequent page URLs against the exact configured HTTPS CourtListener API origin before attaching credentials. Resolve valid relative next links against the current page. Reject malformed, foreign, downgraded and credential-bearing/deceptive destinations with fixed scrubbed docket failure reasons. Disable automatic redirects and fail closed on redirect responses, including same-origin redirects; no redirect following is required. Preserve existing successful pagination, page cap, timeout, baseline and partial/all-docket failure behavior. Prove unauthorized destinations receive no requests/credentials and public Evidence contains no token or unsafe URL. No deployment, paid calls, schema changes or other corrective stories.

</frozen-after-approval>

## Implementation Notes

- Small-change route: no unresolved user intent, no irreversible effects; production changes confined to `src/pipeline/connectors/courtListener.ts`, with regression tests in its existing test suite and story/status bookkeeping. Baseline: 2210267f099c4dbda2b1bfc2d9a5c801bb28ab5a.
- Reuse the connector's DocketError and per-docket summary handling; validate outside the network catch to preserve the fixed policy reason. Resolve next links using the current page, then revalidate at fetch. Preserve the five-page bound and source failure classifications.
- Default fetch uses `fetchWithTimeout`, which forwards RequestInit. Set redirect to manual and reject 3xx before reading body text to avoid reflecting Location, unsafe URLs or credentials into Evidence.
- Provider behavior reference: https://developers.cloudflare.com/workers/runtime-apis/request/ — Workers follow-mode redirects can forward sensitive headers. Explicit manual mode makes redirect handling the connector's responsibility.
- Verify valid absolute/root-relative/query-relative paging; foreign/scheme-relative/lookalike/userinfo/non-HTTPS/malformed next URLs; redirects; unchanged baseline/cap/failure classification; token and unsafe-URL absence from Evidence. No live network required.

- Implemented exact-origin URL checks before authorization, validated/normalized every returned next link against the current page, rejected userinfo/control characters/backslashes/bad percent escapes, and disabled automatic redirects. A redirect produces only a fixed reason/status; its body and Location never enter Evidence.
- Healthy-docket isolation and all-docket failure behavior remain covered. No new public API or schema. Regenerated Epic 3 context as required and changed its canonical backlog introduction to point to authoritative sprint lifecycle states.

## Review Triage Log

2026-09-24: Blind Hunter floor 20.169 kB → 5 findings. All verified and patched; no deferrals.

1. low / patch — unsafe unused next links could escape validation at empty/baseline/page-cap stops, contrary to the broad rejection contract. Validate every returned next link; cover all three stopping boundaries without requesting the link.
2. low / patch — WHATWG parsing accepts malformed percent escapes. Added strict escape validation and %ZZ/%F/% regressions, preserving correctly encoded cursors.
3. medium / patch — healthy dockets were empty in negative fixtures, so Draft preservation was not demonstrated. Added a fresh healthy docket and asserted its persisted Draft survives unsafe-next failure.
4. medium / patch — initial-redirect-only tests missed later-page failure isolation. Added a first successful page then 307 redirect alongside a healthy docket, asserting only the healthy Draft persists and no foreign request occurs.
5. low / patch — redirect leak assertions inspected only the summary. Assert the entire persisted Run Evidence is free of the token and unsafe destination, including the same-origin redirect body fixture.

## Verification

- Initial full local suite: 48 files / 1,078 tests passed.
- After review patches: connector suite 57 tests passed; npm run check passed; git diff --check passed.
- Required PR CI runs the entire suite again on the final patch. Tests use deterministic upstream fixtures and Miniflare D1, not live CourtListener calls. Redirect tests verify the manual RequestInit through the real timeout wrapper; simulated transport models follow-mode forwarding, not a claim of live network observation.
