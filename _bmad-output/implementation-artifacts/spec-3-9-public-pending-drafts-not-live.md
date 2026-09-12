---
title: 'Story 3.9: Public Pending Drafts (Not Live)'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: d0fa128a14e5354441cd814c34b8640f90679552
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Pending Drafts live in D1 but have no public surface — the ops. `#drafts` band is a placeholder EmptyState, so a visitor cannot read what the pipeline proposes before it becomes live, and the thesis "drafts are public here before they are published anywhere" has nowhere to land.

**Approach:** A public read-only band on ops. fed by a new `GET /api/drafts` (pending + rejected-archive, newest first): each card renders the full Draft body, the per-field proposed diff, flags, confidence/eval badge with designed empties, and a link into the run's Evidence — wrapped in NotLiveDraftBanner / `.draft` ticket edge (UX-DR5). Rejected Drafts stay archived with their outcome; approved/edited Drafts are excluded (they belong to publish records, 3.11).

## Boundaries & Constraints

**Always:**
- No login on the band or `GET /api/drafts`; GET/HEAD only via the existing public-router guard.
- Every pending card sits inside NotLiveDraftBanner (fixed label, no props) — mandatory and conspicuous (UX-DR5).
- Full Draft body verbatim; proposed diffs render the real shape `Record<string, { from, to }>` (3.4 packaging) — never the mock's string pairs.
- Designed empties: confidence null → "not recorded"; evalSummary null → "Evals not run"; disagreement chip only when flagged; null target → explicit empty, never blank.
- Confidence renders `{n}/100` (schema is int 0–100) — never a 0–1 float.
- Order: `updated_at DESC, id ASC`; pending group first, rejected archive second.
- Client shallow-guards every item (RunLog `isRunLogItem` pattern); fail closed to the designed EmptyState — never invent a Draft.

**Never:**
- No Approval Gate writes, reject-reason capture, or approve/edit/reject actions (3.10); no publish, `gate.decided`, `run.completed` (3.11).
- No auto-approve threshold UI or mode-audit band (3.13) — no threshold warning even when confidence is low.
- No apex/F1 writes of any kind — this story is read-only.
- No new migration — `drafts` + `outcome` exist (3.1/0006).
- No router library; the band is an anchored OpsShell section; evidence links go through `surfaceHref`.
- Do not edit `EvidenceDetail.tsx` (3.8, just reviewed); do not invent reject reasons (3.10 owns) or eval numbers not in `evalSummary`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pending draft | outcome null, full fields | Banner card: meta "from run {id}", title, flagrow, full body, per-field diff, evidence link | N/A |
| Tier-2 flag | tier2Only true | "Tier-2 source only" flag chip | N/A |
| Confidence empty | confidence null | "Confidence not recorded" | N/A |
| Evals not run | evalSummary null | "Evals not run" — explicit, never blank | N/A |
| Disagreement | disagreement.flagged true | "Reviewer disagreement" warn chip | N/A |
| Multi-field diff | {operationalStatus:{...}, posture:{...}} | Every field renders labeled del(from)/ins(to) | N/A |
| Null diff value | from or to null | "—" designed empty in that column | N/A |
| Rejected archive | outcome "rejected" | Archive card "Rejected" + decidedAt/decidedBy when present; same body/diff/evidence link; no pending banner | N/A |
| Approved excluded | outcome "approved"/"edited" | Absent from band and API | N/A |
| Empty band | no pending/rejected rows | EmptyState "No drafts awaiting approval" | N/A |
| API filter | mixed outcomes in D1 | GET /api/drafts returns only pending + rejected, updated_at DESC, id ASC | N/A |
| API 405 | POST /api/drafts | Envelope 405 GET, HEAD | Existing guard |
| Fetch fail / invalid item | non-OK or guard-failing payload | Band fails closed to EmptyState | Fail closed |
| No auth | ops host, no cookies | HTML 200; API 200 | N/A |

</intent-contract>

## Code Map

- `src/surfaces/ops/OpsShell.tsx:133-147` -- EDIT the `#drafts` SectionBand: replace the placeholder EmptyState with `<PendingDrafts dev={dev} drafts={drafts} />`; add a `drafts?: DraftRecord[]` pass-through prop for tests.
- `src/surfaces/ops/RunLog.tsx:74-110` -- READ ONLY pattern to mirror: `useRunLog` fetch + `unwrapItems` + `every`-guard + injected ?? fetched, fail closed.
- `src/surfaces/ops/PendingDrafts.tsx` -- NEW -- `useDrafts` hook (`GET /api/drafts`), `isDraftRecord` shallow guard, pending cards (NotLiveDraftBanner with meta linking `/runs/:id` via `surfaceHref`, flagrow, body, per-field diff, evidence link), rejected archive group, EmptyState.
- `src/shared/ui/NotLiveDraftBanner.tsx` -- READ ONLY wrapper; the `meta` slot carries the run link; label stays fixed.
- `src/shared/ui/pml.css:377-410` -- READ ONLY `.draft` / `.draftbanner`; PORT `.drafts`, `.draftbody` (+ h3/p rules), `.flagrow` from `PML Ops.html:41-44,500`.
- `src/shared/ui/pml.css:857-898` -- READ ONLY `.diff` two-col del/ins — reuse for proposed diffs.
- `src/shared/db/repos/draftsRepo.ts:38-72` -- ADD `listPublicDrafts(db)`: `WHERE outcome IS NULL OR outcome = 'rejected'` `ORDER BY updated_at DESC, id ASC`, via `DRAFT_COLUMNS`/`mapDraft`.
- `src/shared/api/publicRouter.ts:283-285` -- ADD near `/api/runs`: `if (pathname === "/api/drafts") return jsonList(await draftsRepo.listPublicDrafts(db));` (GET/HEAD guard already applies).
- `src/shared/schemas/run.ts:156-185` -- READ ONLY `DraftRecordSchema` — the wire contract; no schema changes.
- `src/shared/api/publicApi.test.ts:900-973` -- EXTEND: `/api/drafts` filter (approved/edited excluded), order, camelCase envelope, 405.
- `src/surfaces/ops/pendingDrafts.test.tsx` -- NEW -- renderToStaticMarkup I/O matrix (cards, flags, designed empties, archive, fail-closed, no login).
- `src/surfaces/ops/pendingDrafts.mount.test.tsx` -- NEW -- jsdom mount (pattern: `evidenceDetail.mount.test.tsx`): fetch drives render; fetch fail → EmptyState.
- `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Ops.html:466-506` -- card anatomy reference (banner meta, flagrow, "Proposed change to the tracker" kicker, diff cols); mock titles/flags are illustrative — derive everything from real `DraftRecord`.

## Tasks & Acceptance

**Execution:**
- `src/shared/db/repos/draftsRepo.ts` -- ADD `listPublicDrafts` -- the band's one query
- `src/shared/api/publicRouter.ts` -- ADD `GET /api/drafts` -- FR15 public read, no auth
- `src/surfaces/ops/PendingDrafts.tsx` -- NEW component + hook + guard + cards + archive -- the visitor surface
- `src/surfaces/ops/OpsShell.tsx` -- wire the band + `drafts` prop -- replaces this story's placeholder
- `src/shared/ui/pml.css` -- PORT `.drafts` / `.draftbody` / `.flagrow` -- handoff classes, not new names
- `src/shared/api/publicApi.test.ts` + `src/surfaces/ops/pendingDrafts.test.tsx` + `src/surfaces/ops/pendingDrafts.mount.test.tsx` -- I/O matrix (API + HTML + mount)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-9-public-pending-drafts-not-live` in-progress then done -- tracking

**Acceptance Criteria:**
- Given a pending Draft, when a visitor opens ops. `#drafts` without login, then the full body, per-field proposed diff, flags, confidence or "not recorded", eval badge or "Evals not run", and a link to the run's Evidence are visible — all inside the NotLiveDraftBanner / `.draft` ticket edge (FR15, UX-DR5)
- Given a rejected Draft, when the band renders, then it appears in the archive with its outcome (and decidedAt/decidedBy when present) — never under the pending banner
- Given approved or edited Drafts exist, when `GET /api/drafts` responds, then they are excluded and pending + rejected return newest-first
- Given this story shipped, apex F1 tables and APIs behave byte-identically — the story adds read paths only
- Given an empty list or failed fetch, when the band renders, then the designed EmptyState shows and no Draft is invented

## Spec Change Log

## Review Triage Log

### 2026-09-12 — Review pass
- verdicts: 26 findings — high 0, medium 3, low 7, false 16, maybe-false 0
- findings:
  - `[low]` `[reject]` Spec frontmatter `in-progress` vs sprint-status `done` in the same diff (blind-hunter) — transient mid-run bookkeeping; Finalize writes `status: done` to the spec, at which point both files agree; the spec task list itself said "in-progress then done".
  - `[false]` `[reject]` Spec Change Log and Review Triage Log committed empty (blind-hunter) — both are empty by template design; the Change Log populates only on bad_spec loopbacks, and this very pass appends the Triage Log.
  - `[false]` `[reject]` `draftsRepo` import seemingly missing in the publicRouter hunk (blind-hunter) — the import pre-existed at `publicRouter.ts:14` (used by the 3.8 run-detail join); `tsc` exit 0 confirms.
  - `[false]` `[reject]` No HEAD `/api/drafts` test (blind-hunter) — the matrix row is POST → 405 with `allow: GET, HEAD`, which is tested; HEAD handling is the router-wide pre-existing guard shared by every public route.
  - `[low]` `[reject]` No empty-database API test (blind-hunter) — `jsonList` is pre-existing shared envelope infra; the empty-list path is covered client-side (`drafts={[]}` → EmptyState); no failure mode demonstrated.
  - `[low]` `[reject]` No pagination bound; `nextCursor` absence pinned but untested at volume (blind-hunter) — v1 deliberately pins the no-cursor contract, consistent with `/api/runs`; realistic draft volume is bounded by pending + rejected counts at daily-run scale.
  - `[low]` `[reject]` `Evals · eval_fail` renders the raw enum with no designed label (blind-hunter + edge-case-hunter) — raw controlled-vocabulary status display is the established, reviewed 3.8 pattern (EvidenceDetail renders `evalSummary.status` raw); honest and consistent beats invented copy.
  - `[false]` `[reject]` `isEvalSummary` weaker than schema — unvalidated fields are never rendered (blind-hunter) — the guard certifies exactly what the component renders (status, flagged); deeper validation is the server's Zod job before the 200.
  - `[false]` `[reject]` Rejected fixture's null targets untested in archive card (blind-hunter) — `draftTitle` is shared by both cards and its null-target output is pinned by the pending-card test; the fixture choice exercises the guard, not a behavior gap.
  - `[low]` `[reject]` Confidence-0 untested; mount abort path untested; mount stub ignores `signal` (blind-hunter) — the guard unit test pins the 0–100 bounds; the unmount-abort is a fetch-once mirror of the reviewed RunLog pattern, and `EvidenceDetail`'s mount suite already covers the abort discipline for the harder polling case.
  - `[medium]` `[patch]` Wire/guard drift untested: `DraftRecordSchema` types `diff: z.unknown()` but `isDraftRecord` rejects null/array/scalar diffs, so one such wire row blanks the entire band with no failing test (verification-gap + edge-case-hunter) — fixed: the story 3.9 API test now asserts every returned item satisfies the guard-relevant shape (diff non-null non-array object, `runId` matches the run regex, non-empty `body`), inlined because importing the React-bearing guard into the workers project would break the suite.
  - `[false]` `[reject]` Non-`{from,to}` diff entries render both cells "—", indistinguishable from a real null (edge-case-hunter) — every write path (connector packaging types, drafter `DraftOutputSchema` `z.record(...{from,to})`) validates the record shape; the mock's string pairs are unreachable, and fail-soft "—" on unreachable states is correct behavior.
  - `[false]` `[reject]` Pre-fetch render is unguarded `null` — blank band, no loading state (edge-case-hunter ×2, claim) — identical to the reviewed RunLog pattern (`RunLog.tsx:123`); the 3.8 review rejected this same family for a slower multi-join endpoint.
  - `[false]` `[reject]` Deeply malformed diff values may render "undefined" text (edge-case-hunter, claim) — `diffValueText` never yields the text "undefined" (an `undefined` return renders empty in React; BigInt/circular are caught and stringified).
  - `[medium]` `[patch]` OpsShell `#drafts` band wiring observed by no test — bare `<OpsShell />` renders PendingDrafts null pre-fetch, so the `not.toContain` assertion passes even if the band were deleted (verification-gap) — fixed: `shells.test.tsx` now renders `<OpsShell drafts={[fixture]} />` and asserts the card body and `.draftbody` inside the `#drafts` band.
  - `[low]` `[patch]` The newest-first order assertion depended on shared cross-describe D1 state (`slice(0, 4)`, own comment admits it) — 3.10 will insert draft fixtures and trip it (verification-gap, other) — fixed: the assertion now filters to the fixture run id before asserting the exact order.
  - `[false]` `[reject]` No end-to-end no-auth HTML test of the ops page (intent-alignment) — the ops HTML document is the pre-existing static SPA shell (1.3/1.5 infra, never story-tested); the story's No-auth row is covered where it lives: unauthenticated API 200 in publicApi tests plus no-login chrome assertions in the band tests.
  - `[false]` `[reject]` Banner conspicuousness tested by string presence, not visual prominence (intent-alignment) — the `.draft`/`.draftbanner` CSS is pre-existing and untouched; the ported classes are verbatim from the handoff; visual QA is not a test surface anywhere in this repo.
  - `[false]` `[reject]` Rejected cards under-badged vs a blanket-banner reading of UX-DR5 (intent-alignment) — the AC's mandatory banner governs *pending* drafts; the spec's Design Note and the banner component's own docstring reserve the fixed label for pending-only, and a rejected draft claiming to await approval would be false.
  - `[false]` `[reject]` "Flags" satisfied by an interpretation (intent-alignment) — the flagrow matches the handoff's card anatomy (tier-2 chip, confidence, eval badge, disagreement warn chip).
  - `[false]` `[reject]` API orders rejected-first globally while the band re-partitions; presentation order never asserted against real API output (intent-alignment) — pending-before-rejected is structural in the component (two sequential maps), not derived from API order; within-group order is the API's tested contract.
  - `[false]` `[reject]` "Full body visible" narrowed by the strict guard (intent-alignment) — the fail-closed EmptyState on guard failure is the spec's explicit design ("never invent a Draft").
  - `[false]` `[reject]` Diffs rendered as record-of-changes rather than patch hunks (intent-alignment) — exactly the spec's Design Note: per-field del/ins rows over the real `Record<string, {from, to}>` shape.

## Design Notes

- Diff rendering: real diffs are `Record<string, { from: unknown; to: unknown }>` (draftAndReview.ts:42). Render each field as a labeled row inside the `.diff` two-col: left `<del>` from ("—" when null), right `<ins>` to ("—" when null). Never the mock's prose pairs.
- Rejected archive: the banner label is fixed for PENDING only — a rejected Draft renders a plain explicit header ("Rejected — proposed, never published") plus decidedAt/decidedBy, inside the same `.draft` ticket edge: it is still non-live content, but it must not claim to await approval.
- The `every()` all-or-nothing fetch guard follows RunLog's established pattern; per-item tolerance is the known Epic-2 deferred family (deferred-work.md) — do not fork it here.
- Card titles derive from the record — `{targetEntityType} · {targetEntityId}` with designed empties; never the mock's invented case names.
- The mount test lands in the harness 3.8's review just chose (jsdom + @testing-library/react), so this fetch hook is covered from day one instead of joining the uncovered-hook backlog.

## Verification

**Commands:**
- `npm test` -- expected: pass, including `publicApi.test.ts`, `pendingDrafts.test.tsx`, `pendingDrafts.mount.test.tsx`
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Open ops. (dev: `?surface=ops`), scroll to `#drafts`: pending card anatomy — banner, flags, full body, diff, evidence link — and the designed empty state when no drafts exist

## Auto Run Result

Status: done

Summary: Public pending drafts are live on ops. `#drafts` (no login). `GET /api/drafts` returns pending (outcome null) + rejected-archive drafts (`updated_at DESC, id ASC`; approved/edited are excluded — publish-record territory, 3.11). Each pending card renders inside NotLiveDraftBanner: run meta link, derived title, flagrow (Tier-2, disagreement, `Confidence {n}/100` or "not recorded", eval badge or "Evals not run"), full body verbatim, per-field Live-now/If-approved diff over the real `{from, to}` record shape, and an evidence link into the run's page. Rejected drafts archive with explicit outcome + decidedAt/decidedBy — never under the pending banner. Handoff CSS (`.drafts`/`.draftbody`/`.flagrow`) ported; the band's placeholder EmptyState is replaced by the wired component's own designed empty state.

Files changed:
- `src/shared/db/repos/draftsRepo.ts` — `listPublicDrafts` (pending + rejected, newest first)
- `src/shared/api/publicRouter.ts` — `GET /api/drafts` (public, GET/HEAD)
- `src/surfaces/ops/PendingDrafts.tsx` — band component: useDrafts hook, isDraftRecord guard, cards, archive, EmptyState
- `src/surfaces/ops/OpsShell.tsx` — `#drafts` band wired + `drafts` test prop
- `src/shared/ui/pml.css` — `.drafts` / `.draftbody` / `.flagrow` ports
- `src/shared/api/publicApi.test.ts` — filter/order/envelope/405 + wire↔guard parity pin + run-scoped order assertion
- `src/surfaces/ops/pendingDrafts.test.tsx` — static I/O matrix
- `src/surfaces/ops/pendingDrafts.mount.test.tsx` — jsdom mount (fetch → render, fail-closed)
- `src/surfaces/shells.test.tsx` — band-wiring test through OpsShell
- `_bmad-output/implementation-artifacts/spec-3-9-public-pending-drafts-not-live.md` / `sprint-status.yaml` — tracking

Review: 4 layers, 26 findings — 3 patch entries applied (wire↔guard shape parity pin in the API test; OpsShell band-wiring test; run-scoped order assertion); 6 low and 16 false rejected (RunLog-pattern precedent, write-path-validated diff shape, pre-existing shared infra, template-designed empty sections, spec-resolved banner semantics).

Follow-up review recommended: true (two medium entries patched on the first pass). Unverified risk: the band-wiring test asserts injected-draft rendering through OpsShell — no test drives the real fetch path through OpsShell itself (the jsdom mount covers PendingDrafts directly) — and the wire↔guard parity pin only fires when the API test's own fixtures would carry a guard-violating diff.

Verification: `npm test` — 573 passed (28 files). `npm run check` — oxfmt, oxlint, tsc exit 0.

Residual risks: unbounded list at multi-year archive scale (deliberate v1 no-cursor contract, consistent with `/api/runs`); `eval_fail` renders the raw controlled-vocabulary status (consistent with the reviewed 3.8 precedent); no browser-eyeball pass of the ported `.drafts` grid spacing.
