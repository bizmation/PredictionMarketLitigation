---
title: 'Staging ops host (ops-build)'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: eeb6768922a74f325607525bc55c6f502dbf6067
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Development surfaceHref query overrides follow fragments instead of preceding them.
    evidence: |-
      Existing dev branch appends ?surface=ops to /runs/id#draft-1, placing it inside the fragment. This predates 3.22; current changed production staging links preserve suffixes and affected callers supply run paths without fragments.
    location: >-
      src/shared/lib/surface.ts development branch
    severity: low
---

<intent-contract>

## Intent

**Problem:** The staging Worker serves the tracker but has no hostname that selects the ops shell. Its ops links lead to the production brochure, so readers cannot inspect the staged run log, Evidence, and pending Drafts in the browser.

**Approach:** Attach `ops-build.predictionmarketlitigation.com` to the existing `pml-build` Worker, resolve that exact hostname as ops, and use it for ops links from both staging hosts. Deploy and verify the public staging surfaces while keeping production on `pml`.

## Boundaries & Constraints

**Always:** Keep the existing `pml-build` Worker and D1. `build.predictionmarketlitigation.com` remains the tracker. On both `build.` and `ops-build.`, all ops links (including Run rows, draft Evidence, navigation, and admin receipts) target `https://ops-build.predictionmarketlitigation.com`, preserving paths, query strings, and fragments. Production apex/ops links retain their current origins. `/admin` precedence and dev-only `?surface=` behavior remain. Match the new staging host exactly; unrelated `ops-build` lookalikes do not select staging. Non-browser callers retain a safe production default.

**Never:** Run `npm run deploy`, move production domains, create a Worker/database, change Access rules or secrets, start a paid Run, approve/publish Drafts, or claim live verification solely from static HTML. Staging deployment via `npm run deploy:build` is part of this story; prerequisites 3.23–3.25 must be merged first (now satisfied).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Staging ops route | Exact ops-build host, root or /runs/:id | Ops root or Evidence detail, never apex | Existing missing/error run states |
| Staging links | build or ops-build browser host | All ops hrefs target ops-build, preserving route suffix | No error expected |
| Production/default | Production or unknown host; no browser | Existing production ops/apex hrefs | No error expected |
| Lookalike | ops-build.evil.example or ops-build.production-domain.evil | No staging resolution or staging origin | Normal apex/default behavior |
| Admin/dev precedence | /admin on staging ops; dev query routes | Admin wins; dev links keep their query overrides | Existing guards unchanged |
| Domain configuration | Build environment routes | Both build and ops-build on pml-build; top-level production domains unchanged | Deploy failures reported, no production fallback |

</intent-contract>

## Code Map

- `src/shared/lib/surface.ts` — `isOpsHost` currently recognizes only ops.; `surfaceHref` centralizes every cross-surface link but has no current-host input. Add exact staging recognition and environment-aware ops origin selection. Optional hostname input can support pure tests; normal browser callers must automatically supply/read the real hostname so no call site silently stays production. Preserve no-window rendering.
- `src/app.tsx` — already resolves from window URL and selects EvidenceDetail via `runIdFromOpsPath`; no router needed.
- `src/surfaces/{apex/ApexShell,ops/OpsShell,ops/RunLog,ops/PendingDrafts,ops/EvidenceDetail,admin/AdminShell,admin/ApprovalQueue}.tsx` — existing surfaceHref consumers; reuse central behavior. Update only any context propagation genuinely needed. Do not make staging-specific copies of components.
- `wrangler.jsonc` — add only the exact custom domain under `env.build.routes`; retain build assets, workflows, AI, D1, workers_dev false and preview_urls false. Top-level routes stay apex/ops on pml.
- `src/shared/lib/surface.test.ts` — resolution/href cases, including path/admin/dev/no-window behavior.
- `src/surfaces/shells.test.tsx` — App URL tests currently stub window.location.href; extend for staging root/detail and rendered shell links using production mode. Ops row/draft test suites provide injected fixtures for deep links.
- `src/shared/lib/wranglerConfig.test.tsx` — Node-side config invariants and built-client secret scan; extend with parsed build/production domain ownership assertions.
- `docs/deploy-runbook.md` — environment matrix, staging rules, and deployment log. Preserve historical entries as history; distinguish current ops-build from production ops brochure.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/lib/surface.ts` and relevant consumer/tests above — implement and test host-aware ops links and exact shell resolution.
- [x] `wrangler.jsonc` and `src/shared/lib/wranglerConfig.test.tsx` — attach staging custom domain without changing production configuration.
- [x] `docs/deploy-runbook.md` — document current host matrix, deploy command, and pending verification; executing parent fills factual deploy results after code review/verification.
- [x] Executing parent — deploy staging using the standard build/test/migrate/deploy gate; use Cloudflare domain API and public browser checks; record actual Worker version, migration status, and URLs in runbook. Implementation subagent does not perform deployment.

**Acceptance Criteria:**
- Given the merged prerequisites, when staging deploy succeeds, then Cloudflare reports ops-build owned by pml-build and production ops owned by pml, with production brochure page hashes unchanged.
- Given ops-build, when a visitor opens the root and an existing /runs/:id, then the rendered browser shows the public run log/pending-drafts band and Evidence page, respectively.
- Given either staging host, when readers follow ops links including Run/Evidence links, then they remain on ops-build; production host links still target production ops.
- Given the full verification run, when tests exercise the matrix, then routing, hrefs, and config separation pass; no production deploy occurs.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 10 findings — high 0, medium 0, low 3, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` New runbook overstates admin-shell protection and lacks live boundary checks — anonymous /admin and /admin/queue return 200, while /api/admin/queue returns 403. Corrected new documentation to distinguish static shell from gated data/actions and recorded checks; no authentication code change needed.
  - `[false]` `[reject]` Admin run receipt lacks a staging URL assertion — tracing LoopControls shows its Run ID is plain text, not an ops link. There is no receipt URL to misroute or assert. Existing admin navigation and approval-queue Evidence links are covered; adding a new receipt hyperlink would be a separate feature.
  - `[low]` `[patch]` New component assertions only check Evidence prefixes — such checks would miss a truncated fixture run ID. Strengthened them to exact complete hrefs for Run rows and pending/rejected/admin Draft links.
  - `[low]` `[defer]` Development query override follows URL fragment — confirmed pre-existing surfaceHref behavior; record separately because this story changes only production staging host selection.
  - `[false]` `[reject]` Temporary baseline makes deployment evidence non-durable — the committed runbook already records the Worker version, both environments' domain ownership, and identical before/after SHA-256 for both named production hosts. The spec temp path is procedural, not the only evidence.
  - `[false]` `[reject]` Integration ordering is not established by the diff — Git history establishes #39 merged at 97b049f before #40 at eeb6768; 3.22 baseline is eeb6768. Remote merge operations succeeded before this branch's build.
  - `[false]` `[reject]` Story scope cannot be derived from the short user message — planning-artifacts/epics.md Story 3.22 explicitly specifies ops-build, pml-build, staging ops links and deployment. The spec follows that existing story.
  - `[false]` `[reject]` Automated tests do not establish remote behavior — no claim that they do; separate authenticated domain API, production hash comparisons, and rendered browser checks established those acceptance criteria.
  - `[false]` `[reject]` Operational delivery is only a recorded claim and nonempty drafts use fixtures — parent directly observed browser-loaded run data and domain API results; staging had no pending Drafts. Runbook explicitly distinguishes live empty-state evidence from fixture coverage.
  - `[false]` `[reject]` Deployment exceeds a narrow compile-only reading — existing Story 3.22 acceptance expressly requires staging deployment; user invoked the story build after its prerequisites. No paid Run or production cutover was undertaken.
- Edge-case hunter: no findings. Verification-gap reviewer: no gaps. Blind arithmetic line is metadata, not a finding; intent auditor's five divergence observations are all logged above.

## Verification

- `npm run check` — formatting, lint, and TypeScript pass.
- `npm run build` then `npm test` — full suite and built-client secret scans pass.
- Executing parent after code verification: `npm run deploy:build` — build/test/migrate/deploy succeeds for pml-build only; inspect actual domain ownership and migration output.
- Browser: open build, ops-build root, one existing Evidence URL, and pending-draft band; inspect rendered content and link destinations. Compare production responses and domain ownership to `/tmp/pml-322-before.json`. Record propagation delays or blocked checks honestly.

## Auto Run Result

Implemented exact ops-build shell resolution and automatic staging ops origins through the existing surfaceHref helper. Attached the new custom domain only under env.build. PR #39 (3.24) and PR #40 (3.25) were merged before the 3.22 branch was created.

Files changed:
- src/shared/lib/surface.ts — exact staging hostname resolution and host-aware ops URLs.
- src/shared/lib/surface.test.ts — host, suffix, admin/dev and non-browser matrix coverage.
- src/shared/lib/wranglerConfig.test.tsx — parsed staging/production domain and binding separation assertions.
- src/surfaces/shells.test.tsx — production-mode staging App shell, Evidence and navigation checks.
- src/surfaces/ops/runLog.test.tsx — complete staging Run Evidence hrefs.
- src/surfaces/ops/pendingDrafts.test.tsx — complete pending/rejected Draft Evidence hrefs.
- src/surfaces/admin/approvalQueue.test.tsx — complete staging admin Evidence hrefs.
- wrangler.jsonc — ops-build custom domain on existing pml-build Worker.
- docs/deploy-runbook.md — host matrix, deployment evidence, production hashes and accurate admin boundary.
- sprint-status.yaml — 3.22 in review; merged 3.24 and 3.25 done.
- This spec — contract, review triage, deferred issue and verification record.

Review outcome: two low patches (accurate admin-boundary documentation and exact URL assertions), one low pre-existing development fragment issue deferred, seven findings rejected with individual reasons above. No application patch was needed after deployment. The edge-case and verification-gap layers returned no findings. Patched entry counts: high 0, medium 0, low 2. Follow-up review recommended: false.

Verification: initial check/build passed; full suite passed 1,050 tests across 48 files. Standard deploy:build gate repeated those passing tests, found no migrations to apply and deployed Worker version 98ed45b4-f131-4d40-b5b7-944138869779. Browser showed staging tracker links, loaded ops run log, empty pending-drafts band and run-20260924-0000 Evidence with six steps. Cloudflare domain ownership and production hashes matched the intended separation. Anonymous admin API returned 403; static admin shell returned 200 as designed. Post-review targeted suite passed 32 tests; final full verification result recorded below. No second deployment was needed because review patches only changed tests and documentation.

Residual limits: no pending Draft existed for live nonempty-state navigation, so fixtures cover that case. Legacy Runs correctly show budget Not recorded; no new paid Run was triggered. This story does not establish a successful new pipeline cycle or close Epic 3 retrospective acceptance. Deferred dev-fragment issue does not affect production staging paths.

Final verification: npm run check and npm run build passed; npm test passed all 1,050 tests in 48 files after review patches. Frontmatter parsed successfully; deferred is one list with its one intended item.
