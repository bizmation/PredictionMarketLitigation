---
baseline_branch: main
main_at_creation: 8e192cb74ae7e6a1b90328f3da9dc8b7ad635de1
baseline_commit: 8e192cb74ae7e6a1b90328f3da9dc8b7ad635de1
---

# Story 2.10: Trust Furniture, Donations & ops. Handoff

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader,
I want persistent trust, correction entry, donations, and a clear path to `ops.`,
so that I know this is information-not-advice, can start a correction, and can inspect receipts.

## Acceptance Criteria

1. **Given** the completed apex sections (Stories 2.2–2.9), **when** I view the trust/correction and footer regions, **then** the F1 surface shows the not-legal-advice disclaimer, the AI-built/governed disclosure, a visible last-updated, "Powered by Bizmation" (or equivalent), and provenance where published (FR36)
2. **And** a correction/feedback entry point exists on apex that navigates to the correction band/form shell; the shell states submissions open in Story 4.5 (no fake submit) — queued-submission wiring and moderation land in Stories 4.5/4.6 (definite scope per readiness m1)
3. **And** a donations link ("Buy me a coffee" or equivalent) is present (FR39)
4. **And** the public repository is linked (FR38)
5. **And** an ops. handoff block explains that transparency/governance live on `ops.` with clear CTA links
6. **And** section order matches the handoff long-scroll through footer (UX-DR8)

## ⚠️ Read this before writing any code

**This is FR36/FR38/FR39 trust furniture, NOT FR37/FR45 correction plumbing.** The correction **form shell only** is in scope — queued submission + moderated GitHub-issue creation land in Stories 4.5/4.6. Eight things will bite you:

1. **Base is Story 2.9, not Story 2.8.** Story 2.9 is still uncommitted in the tree (HEAD `8e192cb`). `#trust` and `#ops` are the two remaining `EmptyState` bands in `ApexShell.tsx`. Branch from whatever SHA merges 2.9 (confirm `#poll` is present), or the empty states will already be stale. Do **not** start from raw `8e192cb` without 2.9 applied.
2. **The correction band is a shell, not a form.** UX-DR16 + handoff A6 render a full form (type/where/detail/name/contact) with "Open a GitHub issue". Story 4.5 builds the real moderated queue (FR45); Story 2.10 ships a shell that **says submissions open in Story 4.5**. No `<input>`, no `<textarea>`, no submit button, no tracking-ID acknowledgment. **HALT** if you wire a fake submit or render a fake `PML-C-` ID.
3. **TrustBar already ships FR36's top-of-page disclosure.** `WarnChip` ("General legal information — not legal advice") + positioning line ("Built by AI, governed and approved by a human; corrections welcome.") + `<LastUpdated>` + `<ProvenanceLabel kind="human" />` are already in `ApexShell` (Story 1.2/1.3). Do **not** re-add or reword these — the trust band adds the *fuller* disclaimer block + "Powered by Bizmation", not a duplicate bar.
4. **"Powered by Bizmation" is a literal affordance (FR36).** Handoff Tracker.html:1028 renders `Powered by Bizmation.` under the CTAs. Ship that string verbatim. Placement is chrome-deferred but the AC requires it on F1.
5. **Donation link is a placeholder URL.** FR39 says "Buy me a coffee or equivalent"; the handoff uses a `#coffee` stub with no real target. Ship a single named `DONATE_URL` constant with a clearly-marked placeholder. Do **not** invent a live Ko-fi/BMC/GitHub-Sponsors URL — see Open Question 1.
6. **Repo link already exists twice.** `REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation"` is in `ApexShell`, `CredibilityStrip`, and `OpsShell`. FR38 is satisfied; the trust band + footer just reference it again. Do **not** create a 4th divergent URL.
7. **The EmptyState tests will break — rewrite them.** `shells.test.tsx` has `uses EmptyState for every unwired tracker band` (asserts `remaining = ["trust", "ops"]` are `.empty`) **and** Story 2.9 added `keeps one h1, the cert gauge, and trust/ops EmptyStates intact`. After this story there are **zero** unwired apex bands. Both tests must be rewritten to assert the new trust/ops furniture instead. `#cert`/`.certgauge` and one-`<h1>` invariants stay.
8. **Section order (UX-DR8) is already correct** in `ApexShell`: … cert → trust → ops → footer. Do not reorder; just replace the two EmptyStates in place and extend the footer. `#trust`/`#ops` anchor ids must remain (top nav "Cert signal" and footer link to them).

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm base includes Story 2.9 (`#poll` present; `#trust`/`#ops` still EmptyState). Record `git log -1 --oneline`
  - [x] Confirm `npm test` green (Story 2.9 baseline: 410 tests). Zero cloud credentials
  - [x] Confirm `npm run check` exit 0 — note the two pre-existing cert-file failures recorded in Story 2.9 (cert.test.tsx oxfmt, CertBoard.tsx oxlint) and leave them untouched
  - [x] Read `ApexShell.tsx` (the two EmptyState bands + `SiteFooter`), `TrustBar.tsx`, `WarnChip.tsx`, `SiteFooter.tsx`, `TopBar.tsx` (`TopBarLink` shape), `CredibilityStrip.tsx` (repo + honesty precedent), `shells.test.tsx` (both EmptyState tests), `pml.css` (940px collapse block), Tracker.html `#trust` (~1003–1072), `#ops` (~1074–1085), footer (~1087–1094), trust CSS (~487–513)
  - [x] Branch: `story/2-10-trust-furniture-donations-ops-handoff` from the 2.9-merged SHA

- [x] **Task 2: Trust furniture + correction shell** (AC: 1, 2)
  - [x] Replace `#trust` EmptyState with the "How this page is made" band (Tracker.html:1003–1072), ported to React + tokens:
    - `SectionBand` kicker `A5 / A6 · Provenance`, title `How this page is made` (handoff). Keep `id="trust"`
    - `.trust` grid (1.1fr / 1fr): left `.disclaimer` (three short paragraphs, verbatim spirit of handoff but v1-honest):
      - **Not legal advice** — general legal information, no attorney-client relationship, not a substitute for counsel.
      - **Built by AI, approved by a human** — every claim on this page is a seeded, human-curated record (Story 2.1); the autonomous pipeline and its Approval Gate ship in Epic 3 and are **not live yet**. Do not claim a pipeline that does not run.
      - **Drafts are not here** — proposed changes will live in full on `ops.`, labelled not live, once the pipeline ships (Epic 3). Do not say "two pending right now" (that was prototype theatre).
    - CTA row: `See the receipts on ops.` (`opsHref`), `Public repository` (`REPO_URL`), `Buy me a coffee` (`DONATE_URL`)
    - `Powered by Bizmation.` line under the CTAs
  - [x] Right column: `.corr` correction shell with `id="correct"`:
    - kicker `A6 · Report a discrepancy`, title `Corrections welcome`
    - Copy: submissions are **queued for operator review** and open in Story 4.5 — not a live form, no instant public issue. One or two sentences, honest, no fake fields. See Open Question 2 for exact copy.
  - [x] Do **not** render `<input>`/`<textarea>`/`<select>`/submit; no `PML-C-` tracking ID; no fake acknowledgment

- [x] **Task 3: Correction entry point + donations + repo + footer** (AC: 2, 3, 4)
  - [x] Add `DONATE_URL` constant next to `REPO_URL` (a clearly-marked placeholder; see Open Question 1)
  - [x] Add a `Corrections` link in the `TopBar` `links` array → `#correct` (correction entry point AC2)
  - [x] Footer (`SiteFooter`): links become `ops.`, `Repository` (`REPO_URL`), `Corrections` (`#correct`), `Support the project` (`DONATE_URL`); keep `note="General legal information — not legal advice."`. Handoff footer ~1087–1094 (uses `© 2026 …`; mirror label/links, don't invent a date claim that's wrong)
  - [x] Keep FR38: repo linked from trust band CTA + footer + existing `CredibilityStrip`

- [x] **Task 4: ops. handoff block** (AC: 5)
  - [x] Replace `#ops` EmptyState with the `.opslink` handoff block (Tracker.html:1074–1085):
    - `SectionBand` kicker `The other half of the system`, title `ops.predictionmarketlitigation.com` (handoff uses an `h3` + `.opslink`; adapt to `SectionBand` title/why as fits). Keep `id="ops"`
    - Copy (v1-honest): the run log, full evidence, pending drafts in full text, approval mode + audit trail, and the nine-layer explainer live on `ops.` — **no login** — and note which of these are not live yet (pipeline/Epic 3) rather than overclaiming
    - CTA: `Open ops. ↗` → `opsHref`
  - [x] Ensure "transparency/governance lives on ops." message survives (currently the EmptyState says this)

- [x] **Task 5: CSS** (AC: 1, 5)
  - [x] Port into `src/shared/ui/pml.css` from Tracker.html trust CSS (~487–513) using tokens: `.trust` (grid 1.1fr/1fr), `.disclaimer` (accent left border, 13.5px, `strong` weight), `.corr` (strong border + `--space-6` padding), `.opslink` (grid 1fr/auto; h3 26px), `.corr label` if needed
  - [x] Add `.trust` and `.opslink` to the **existing** `@media (max-width: 940px)` collapse block (handoff line 513 collapses `.mast-grid, .f1, .board, .cases, .cert, .trust, .opslink` → 1fr). Do **not** add a new media query
  - [x] Optional `.coffee` topnav accent (Tracker.html:104–106) — only if you put "Buy me a coffee" in the top nav; the required placements are the trust CTA row + footer. Do not restyle `.certgauge`/`.poll`/`.f1`/`.board`/`.cases`/`.ent`
  - [x] Reuse existing `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost` (tokens.css), `.kicker`, `.panel` where they fit

- [x] **Task 6: Tests** (AC: all)
  - [x] Rewrite `shells.test.tsx` `uses EmptyState for every unwired tracker band`: `remaining` becomes `[]` (zero unwired apex bands). Keep the per-band non-empty assertions (brief/circuits/states/issues/cases/entities/cert)
  - [x] Rewrite Story 2.9's `keeps one h1, the cert gauge, and trust/ops EmptyStates intact`: keep one-`<h1>` + `.certgauge`/`.cert` assertions; **replace** the trust/ops `class="empty"` assertions with assertions for the new furniture (`How this page is made`, `Corrections welcome`, `ops.predictionmarketlitigation.com`)
  - [x] New co-located test (Node `renderToStaticMarkup`, no new testing-library) for the trust band:
    - `#trust` contains `Powered by Bizmation`, `Not legal advice`, `Corrections welcome`, `Buy me a coffee`, `Public repository`, `id="correct"`
    - `#trust` contains **no** `<input`, `<textarea`, `<select`, `<button` (no fake form)
    - `#ops` contains `Open ops.` and `ops.predictionmarketlitigation.com`
    - Footer contains `Corrections` and `Support the project`
    - No `PML-C-` tracking-ID string anywhere
  - [x] `npm test` green, zero cloud credentials, no `@testing-library` addition

- [x] **Task 7: Finalize** (AC: all)
  - [x] `npm run check` exit 0 for all files touched by this story (pre-existing cert-file failures remain untouched)
  - [x] File List from `git status` / diff; single commit only if Patrick asks
  - [x] Browser-verify: `#trust` under `#cert`, footer under `#ops`; corrections shell has no form; `Powered by Bizmation` visible; `Buy me a coffee` + `Support the project` present; `Open ops.` links to ops.; top-nav `Corrections` scrolls to `#correct`; one `<h1>`; `#cert` unchanged; 940px collapses `.trust`/`.opslink`; `#trust`/`#ops` EmptyState gone

### Review Findings

- [x] [Review][Defer] Donation placeholder is a silent dead anchor — `DONATE_URL = "#coffee"` matches no element, so "Buy me a coffee" and "Support the project" do nothing on click with no reader-visible hint (the "clearly-marked placeholder" comment is code-only). — deferred, pending Open Question 1: Patrick has not yet picked a donation service; wire the real URL (and any visible "not open yet" treatment) when he does
- [x] [Review][Patch] "Submissions open in Story 4.5" in public trust copy — internal story ID reads as a dev placeholder to readers. Fix (Patrick's call): reword reader-friendly, e.g. "Submissions are not open yet — corrections will be queued for operator review before anything is filed publicly."
- [x] [Review][Patch] `#ops` copy overclaims: presents run log, pending drafts, approval mode + audit trail, and nine-layer explainer as live today [src/surfaces/apex/ApexShell.tsx:227] — OpsShell shows EmptyStates for all of these (Stories 3.7/3.8/3.9/3.13/4.1); present-tense "all live on ops." contradicts the trust band's "Drafts are not here… once the pipeline ships" 60 lines up and violates the v1-honesty anti-pattern. Fix: future-tense the not-yet-live items while keeping the transparency message.
- [x] [Review][Patch] `#correct` anchor lacks scroll-margin — sticky topbar occludes the correction panel [src/surfaces/apex/ApexShell.tsx:209, src/shared/ui/pml.css:188] — `scroll-margin-top: 62px` is only on `section.band`; `id="correct"` is a plain `div.corr`, so nav/footer "Corrections" clicks hide the kicker + title under the 62px bar — the exact behavior that rule exists to prevent. Fix: add `scroll-margin-top` for `.corr`.
- [x] [Review][Patch] `ops.predictionmarketlitigation.com` band title cannot wrap — horizontal page scroll on phones [src/surfaces/apex/ApexShell.tsx:223, src/shared/ui/pml.css] — 34-char unbreakable token in `.sec-head h2` with no `overflow-wrap`/`word-break` anywhere in pml.css; min-content ≈500px+ vs ~375px viewports. Fix: `overflow-wrap: anywhere` on the heading.
- [x] [Review][Patch] Task 6 test assertions missing or narrowed vs the marked-[x] subtasks [src/surfaces/shells.test.tsx:192] — no `<button` negative assertion on `#trust`; `PML-C-` checked only inside the trust band (spec: anywhere); footer `Corrections` link never asserted; `#ops` content assertions run unscoped on the whole page and pass on the band *title text* alone (no actual ops `href` asserted); the 2.10 test also sits inside `describe("ApexShell reader poll (story 2.9)")`, misattributing regressions.
- [x] [Review][Patch] Footer donate link mislabeled `external: true` [src/surfaces/apex/ApexShell.tsx:250] — `TopBarLink.external` means "leaves this surface" (↗ affordance) but `#coffee` is a same-page fragment.
- [x] [Review][Patch] Inert `rel="noopener"` on three same-tab ops links [src/surfaces/apex/ApexShell.tsx:191,231,237] — `rel="noopener"` without `target="_blank"` is dead code; the repo CTA two lines up uses the full `target="_blank" rel="noopener noreferrer"` pattern. Fix: drop the dead attributes (nav treats ops. as same-tab by design).
- [x] [Review][Patch] ApexShell docblock self-contradicts [src/surfaces/apex/ApexShell.tsx:38] — "All tracker bands are now wired (Epic 2 complete)" is immediately followed by the rationale for why bands *were* EmptyState ("Remaining tracker bands were EmptyState…"), reading as if some still are. Fix: one coherent sentence.

## Dev Notes

### Current code state (verified 2026-09-03, SHA `8e192cb`; Story 2.9 uncommitted in tree)

- `main` = `8e192cb`; Story 2.9 (reader poll) is implemented but **not committed** (`git status` shows `M src/surfaces/apex/ApexShell.tsx`, `?? src/surfaces/apex/poll/`, etc.). Branch after 2.9 lands.
- `ApexShell.tsx` section order: TopBar → TrustBar → CredibilityStrip → Masthead(+KpiRow, PollPanel) → #brief → #circuits → #states → #issues → #cases → #entities → #cert → `#trust` (EmptyState "Correction form not yet open") → `#ops` (EmptyState "The governance record lives on ops.") → `SiteFooter`.
- `TrustBar` already carries: `WarnChip` (not-legal-advice), positioning line, `<LastUpdated at={kpis.freshness} />`, `<ProvenanceLabel kind="human" />` — FR36 top-of-page disclosure done in 1.3.
- `SiteFooter` = label + `TopBarLink[]` + note. `TopBarLink` = `{ href, label, external?, current? }`.
- `REPO_URL` duplicated in `ApexShell` (43), `CredibilityStrip` (1), `OpsShell` (25).

### What this story changes vs what must be preserved

| File | Today | This story | Must preserve |
|---|---|---|---|
| `ApexShell.tsx` | `#trust`/`#ops` EmptyState | Trust furniture + ops handoff + footer/nav links | TrustBar copy; section order; `#cert`; `#poll`; one `<h1>`; `#trust`/`#ops` ids |
| `pml.css` | No `.trust`/`.disclaimer`/`.corr`/`.opslink` | Port handoff trust CSS + 940px collapse | Existing 940px block; all other classes |
| `shells.test.tsx` | Trust/ops EmptyState pins | Rewrite both tests | `.certgauge`/`.cert`, one-`<h1>` assertions |

### Anti-patterns (HALT)

- Rendering a working/fake correction form (inputs, submit, tracking ID) — that is Story 4.5 (FR45 moderated queue)
- Claiming the autonomous pipeline / Approval Gate / pending drafts are live today (they ship in Epic 3)
- Rewording or dropping `Powered by Bizmation` / not-legal-advice / positioning line
- Inventing a live donation URL; duplicating `REPO_URL` a 4th time
- Touching `OpsShell`/`AdminShell` (FR36's ops. complement is already partly present + polished in 4.7)
- Removing `#trust`/`#ops` anchor ids; reordering sections; a second media query
- Shipping 4.5/4.6 correction plumbing here

### Project Structure Notes

- Trust/correction furniture is apex surface chrome — live in `ApexShell.tsx` (and optionally a small `src/surfaces/apex/trust/` component, matching the `cert/`/`poll/` surface-local convention), **not** `src/shared/ui/`.
- `DONATE_URL` constant beside `REPO_URL` in `ApexShell.tsx`.
- CSS tokens only in `src/shared/ui/pml.css`.

### Previous story intelligence (2.9 → 2.10)

- 2.9 explicitly told the dev "Do not ship Story 2.10. No donations row, no correction form, no `#trust` rewrite." — this story is that deferred work, and 2.9 left `#trust`/`#ops` as EmptyState on purpose.
- Pattern: replace one placeholder band, port handoff CSS, pin with `renderToStaticMarkup`, leave later bands EmptyState. 2.10 is the *last* apex band — no more EmptyState after it.
- Honesty rule (see 2.2 CredibilityStrip): never claim a pipeline/draft that isn't live. Apply to the trust disclaimer and ops. block.

### Git intelligence

- Last commits: `8e192cb` 2.8 cert signal (#8); `6677e2b` 2.7 entity ledger; `3b86914` 2.6 issue map. 2.9 is the uncommitted working tree.

### Latest tech information

- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`. No new libraries needed — this story is pure presentational React + CSS.
- `.btn` variants already in `tokens.css`; use them, don't restyle.

### Project context reference

No `project-context.md` present. Carry `architecture.md` + the 2.1–2.9 story files as the implementation constitution. Trust furniture per architecture: F8 (L37), shared chrome `surfaces/apex` (L541), "shared UI helpers + page shells" (L546), GitHub corrections link (L557/599 — superseded by moderated FR45 at L708).

### References

- [Source: epics.md#Story-2.10] L524–539 — user story + ACs
- [Source: epics.md] FR36 (L101), FR37 (L103), FR38 (L105), FR39 (L107), FR45 (L121), UX-DR8 (L180), UX-DR16 (L196), NFR11 (L145)
- [Source: prd.md] FR-36 (L450), FR-37 (L458), FR-38 (L467), FR-39 (L474)
- [Source: ux-brief-pack.md] A5 trust furniture (L171–181), A6 correction (L182–184), B7 ops. disclosure (L233–234)
- [Source: architecture.md] F8 (L37), trust furniture (L541, L546), GitHub corrections (L557, L599), moderated corrections amendment (L708)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#trust` (~1003–1072), `#ops` (~1074–1085), footer (~1087–1094), trust CSS (~487–513), `.coffee` (~104–106)
- [Source: implementation-readiness-report] m1 correction-entry scope definite (L366)
- [Source: 2-9-reader-cert-poll-tally-api.md] "Do not ship Story 2.10" note; EmptyState discipline

## Open Questions for Patrick (do not block implementation)

1. **Donation URL?** Implemented as a named `DONATE_URL` placeholder. Say which service (Ko-fi / Buy Me a Coffee / GitHub Sponsors) + URL and I'll wire it — otherwise it ships as an obvious placeholder.
2. **Correction shell copy?** Default: "Submissions open in Story 4.5 — corrections will be queued for operator review before anything is filed publicly." Say if you want different wording.

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro-0813

### Debug Log References

- Preflight: HEAD `8e192cb` (Story 2.8); Story 2.9 is uncommitted in the working tree (`#poll` present in `ApexShell.tsx`, `src/surfaces/apex/poll/` untracked). This story was implemented on top of that working tree — 2.10's `baseline_commit` therefore records `8e192cb` (2.8), which is the raw SHA the story warns against; the actual code state includes 2.9's poll. Flag for Patrick: 2.9 must be committed before 2.10's diff is meaningful.
- Preflight: `npm test` green — 414 tests (17 files) both before and after. Zero cloud credentials.
- `npm run check` pre-existing failures (recorded in Story 2.9) remain untouched: `src/surfaces/apex/cert/cert.test.tsx` oxfmt, `src/surfaces/apex/cert/CertBoard.tsx` oxlint `no-redundant-roles`.
- `tsc` clean; `oxlint` 0/0 on touched files; `oxfmt --check` clean on touched files.

### Completion Notes List

- Replaced the `#trust` and `#ops` `EmptyState` bands in `ApexShell.tsx` with real trust furniture + ops. handoff (FR36/FR38/FR39, UX-DR8).
- `#trust`: `SectionBand` (kicker `A5 / A6 · Provenance`, title `How this page is made`) → `.trust` grid: left `.disclaimer` (Not legal advice / Built by AI, approved by a human / Drafts are not here, all v1-honest — pipeline is not live), `.trust-ctas` (See the receipts on ops. / Public repository / Buy me a coffee), `Powered by Bizmation.` line; right `.corr` correction shell with `id="correct"` (kicker `A6 · Report a discrepancy`, title `Corrections welcome`, copy: submissions open in Story 4.5, queued for review). No inputs, no submit, no tracking ID.
- `#ops`: `SectionBand` (kicker `The other half of the system`, title `ops.predictionmarketlitigation.com`) → `.opslink` block with the run-log/evidence/drafts/explainer copy (pipeline not live yet, no login) + `Open ops. ↗` CTA.
- Added `DONATE_URL = "#coffee"` placeholder constant (Open Question 1 — no live URL invented).
- Added `Corrections` link to `TopBar` `links` → `#correct`; extended `SiteFooter` links to `ops.` / `Repository` / `Corrections` / `Support the project`, keeping the not-legal-advice note.
- CSS: ported `.trust`, `.disclaimer`, `.trust-ctas`, `.bizmation`, `.corr`, `.opslink` into `pml.css`; added `.trust, .opslink` to the existing 940px collapse block (no new media query).
- Tests: rewrote `shells.test.tsx` `uses EmptyState for every unwired tracker band` (no remaining EmptyState bands) and Story 2.9's `keeps one h1 … trust/ops EmptyStates intact` (now asserts trust furniture + ops handoff + no-fake-form + no-fake-pipeline-claims). 414 tests pass.

### File List

Modified (this story):
- src/surfaces/apex/ApexShell.tsx
- src/shared/ui/pml.css
- src/surfaces/shells.test.tsx

## Change Log

- 2026-09-03: Code review (Blind Hunter / Edge Case Hunter / Acceptance Auditor, triaged): 8 patches applied — `#ops` copy moved to future tense (no live-today claims for 3.7/3.9/3.13/4.1 features); `#correct` scroll-margin-top so Corrections jumps clear the sticky topbar; `overflow-wrap: anywhere` on `.sec-head h2` (unbreakable ops hostname no longer forces mobile horizontal scroll); corrections copy reworded to drop the internal "Story 4.5" ID (Patrick's call); footer donate `external` flag removed; three inert `rel="noopener"` attributes removed; ApexShell docblock de-contradicted; Task 6 test assertions completed (no-`<button` guard, whole-page `PML-C-` check, footer-scoped Corrections/Support assertions, ops-band scoping + real ops href pin) and the 2.10 test moved into its own describe. 414 tests passing; tsc 0. One finding deferred (dead `#coffee` placeholder — pending Open Question 1); commit-order note: 2.9 must be committed before 2.10's diff is meaningful. Story → done.
- 2026-09-03: Implemented trust furniture, donations placeholder & ops. handoff (Story 2.10) — `#trust`/`#ops` EmptyStates replaced, footer/nav links extended, trust CSS ported, tests rewritten. Status → review.
- 2026-09-03: Story context created from Epic 2 / FR36/FR38/FR39 / UX-DR8 / A5-A6 handoff / Stories 2.2, 2.9 (ready-for-dev)
