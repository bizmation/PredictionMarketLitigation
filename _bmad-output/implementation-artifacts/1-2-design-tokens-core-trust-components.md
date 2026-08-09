---
baseline_commit: 4ca747446e8176a1822b498789a98fa62ca66b1a
---

# Story 1.2: Design Tokens & Core Trust Components

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader (and future implementers),
I want Classical + PML design tokens and trust components available in the app,
So that every surface shares the editorial look and load-bearing trust UI (provenance, not-live drafts, status).

## Acceptance Criteria

1. **Given** the scaffolded React/Vite app (Story 1.1), **when** the Classical token sheet + PML component layer are integrated from the UX handoff reference, **then** tokens for color, type (Cormorant Garamond / Lora), spacing, radius, and shadows are usable as CSS variables
2. Components/classes exist for: posture swatches (5-step ramp + untracked dashed), operational status badges (`go` / `restricted` / `banned`), ProvenanceLabel (human- vs agent-approved), NotLiveDraftBanner / `.draft` ticket edge, RunStatusChip + OriginFlag, EmptyState (dashed frame + reason), LastUpdated, Warn chip
3. Accent is stroke-oriented (outlined cards/buttons; no solid pill-heavy chrome)
4. Focus ring uses accent outline with 2px offset (UX-DR1 / NFR5)
5. HTML prototypes are not shipped as production pages — tokens/components are recreated in the app (UX-DR24)

## Tasks / Subtasks

- [x] Task 1: Environment preflight (AC: 1)
  - [x] Node ≥ 20.12 — **machine default `node` is v16.20.2 and WILL FAIL**. Prefix commands with `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"` or `nvm use` (repo ships `.nvmrc`)
  - [x] Confirm baseline green before touching anything: `npm run check` and `npm test` both pass
- [x] Task 2: Create the Classical token sheet (AC: 1, 4)
  - [x] Create `src/shared/ui/tokens.css` — copy the `:root` block **verbatim** from `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/_ds/classical-85c77590-4a2f-41a0-92df-b00754b50bd3/styles.css` (colors, neutral 100–900, accent 100–900, accent-2 100–900, `--font-heading`/`--font-heading-weight`/`--font-body`, `--space-1..8`, `--radius-sm/md/lg`, `--shadow-sm/md/lg`). Do **not** re-derive or "improve" any value
  - [x] Do NOT copy the source file's `@import url(...Google Fonts...)` line — fonts are loaded from `index.html` (Task 6)
  - [x] Include the Classical base element rules that PML depends on: `*,*::before,*::after{box-sizing:border-box}`, `body` (margin 0, 15px/1.55), `h1–h6` scale + heading font, `p`, `a`, `img`, `figure/figcaption`, `.text-muted`, `:focus{outline:none}`, `:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}`, `::selection`, `.hr`, `.plate`
  - [x] Include the Classical component classes actually reachable in v1: `.btn` + `.btn-primary/.btn-secondary/.btn-ghost/.btn-icon/.btn-block`, `.field`/`.input`, `.card*`, `.tag*`, `.table`, `.elev-sm/md/lg`. Skip `.dialog*`, `.radio`, `.seg*` (no v1 surface uses them yet — add when a story needs them)
- [x] Task 3: Create the PML component layer (AC: 2, 3)
  - [x] Create `src/shared/ui/pml.css` — port `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/pml.css` **verbatim** (all 194 lines of it). Every declaration is load-bearing; keep the section comments
  - [x] Verify by diff-reading that the following class families landed intact: `.wrap .kicker .num .rule .muted`, `.topbar .brand .topnav .trustbar`, `section.band .sec-head footer.foot`, `.sw.*` posture ramp (oklch), `.badge.go/.restricted/.banned/.upd`, `.prov`/`.prov.agent`, `.warn`, `.lastupd`, `.draft`/`.draftbanner`, `.run.*`/`.origin`, `table.grid`, `.panel`/`.ph`/`.pb`, `.empty`, `.chip`/`.filters`/`.export`, `.steps`, `.diff`, themed native controls
  - [x] Do NOT convert any of this to Tailwind utilities or Kumo components. Plain CSS classes are the contract the handoff, the design-system page, and Stories 1.3/2.x/3.x all reference by name
- [x] Task 4: Wire the stylesheets into the app (AC: 1, 3, 4)
  - [x] In `src/styles.css`, append after the existing Tailwind/Kumo imports:
        `@import "./shared/ui/tokens.css";` then `@import "./shared/ui/pml.css";`
  - [x] Order matters twice over: (a) tokens before pml (pml resolves Classical vars), (b) both **after** `@import "tailwindcss"` for readability — though correctness is already guaranteed because Tailwind emits everything inside `@layer` and our unlayered CSS wins the cascade regardless
  - [x] Do **not** wrap our CSS in `@layer`, and do **not** move the tokens into Tailwind's `@theme` — `@theme` exists to mint utility classes we are not using, and would fork the source of truth
  - [x] Keep the existing `html, body, #root { width/height/margin }` rule; pml.css's `body { margin: 0 }` is compatible
- [x] Task 5: Build the React trust components (AC: 2, 3)
  - [x] Create under `src/shared/ui/` (PascalCase files, per architecture naming), one component per file, each a thin typed wrapper that emits the handoff markup + classes:
    - [x] `PostureSwatch.tsx` — `posture: "untracked" | "platform" | "pending" | "state" | "banned"`; renders `<span class="sw {posture}">` **plus its label** (never fill alone — UX-DR2). Labels verbatim: `No tracked activity` · `Decided for platform` · `Pending — skeptical` · `Decided for state` · `Banned`
    - [x] `StatusBadge.tsx` — `status: "go" | "restricted" | "banned"` → `<span class="badge {status}">`, uppercase label from the PRD glossary strings exactly
    - [x] `UpdatedBadge.tsx` — `.badge.upd` (the "updated" marker used by the status board)
    - [x] `ProvenanceLabel.tsx` — `kind: "human" | "agent"`, optional `detail` (e.g. `gate-v2.1`); human → `.prov` + solid dot + `Human-approved`; agent → `.prov.agent` (dashed) + hollow dot + `Agent-approved` (+ ` · {detail}` when present)
    - [x] `WarnChip.tsx` — `.warn`; default child copy `General legal information — not legal advice`; leading `⚠` glyph is decorative → `aria-hidden="true"`
    - [x] `LastUpdated.tsx` — `.lastupd`; takes an ISO-8601 UTC string, renders the handoff's reader format (`Updated 9 Aug 2026, 06:12 ET`). Put the formatter in `src/shared/lib/dates.ts` (architecture-designated home) and export it — 2.x and 3.x reuse it
    - [x] `NotLiveDraftBanner.tsx` — the `.draft` wrapper (ticket edge) with a `.draftbanner` header whose `<strong>` reads **`Not live · awaiting approval`** verbatim, plus `children` for the draft body. This is the single most load-bearing state in the product — the words are mandatory and must never be softened (UX-DR5)
    - [x] `RunStatusChip.tsx` — `status: "published" | "awaiting" | "noop" | "failed" | "stopped" | "rejected"` → `.run.{status}`. Note the class/vocabulary mismatch: the *empty* run status uses class `.run.noop` (the `.empty` class is the EmptyState block, not a chip) — keep the prop name reader-facing (`empty`) and map it to `noop` internally, or name the prop `noop`; pick one and document it in the file
    - [x] `OriginFlag.tsx` — `origin: "scheduled" | "catch-up" | "manual"` → `.origin`. Values match the DB enum exactly (architecture: Run origin `scheduled | catch-up | manual`)
    - [x] `EmptyState.tsx` — `.empty` with `<b>` title, reason children, optional `.hint`. Never apology-only (UX-DR21). Ship the three handoff exemplars as usage examples in the gallery, not as defaults
  - [x] Add `src/shared/ui/index.ts` barrel export so later surfaces import from one place
  - [x] No new runtime dependencies. Do **not** add `lucide-react` in this story (see Open Question 1)
- [x] Task 6: Brand the document shell (AC: 5, and clears a Story 1.1 deferral)
  - [x] `index.html`: `<title>` → `Prediction Market Litigation`; `<meta name="description">` → the PML one-liner (currently still reads "AI chat agent built with Cloudflare Agents")
  - [x] Add font loading in `<head>`: `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`, and the Cormorant Garamond (400,600) + Lora (400,600) stylesheet link with `display=swap`. Using `<link>` rather than a CSS `@import` avoids the render-blocking request chain and the `@import`-must-come-first ordering hazard inside a Tailwind-processed stylesheet
  - [x] Leave the existing `data-mode` theme bootstrap script alone (Kumo reads it; the starter chat UI is still mounted)
- [x] Task 7: Component gallery for visual verification (AC: 2, 5)
  - [x] Create `src/shared/ui/DesignSystemGallery.tsx` — renders every component above with all variants, mirroring the *Class inventory* section of `PML Design System.html`. This is how AC2 gets verified and how 1.3 authors discover the vocabulary
  - [x] Mount it in `src/app.tsx` behind a dev-only, non-invasive gate so the starter chat UI is otherwise untouched:
        `if (import.meta.env.DEV && new URLSearchParams(location.search).has("ds")) return <DesignSystemGallery />;`
  - [x] Add a one-line comment marking the gate **temporary — replaced by the real route in Story 1.3**
  - [x] Verify at `http://localhost:5173/?ds=1` (or whatever port `npm run dev` reports): fonts render as Cormorant/Lora, ground is `#f3f2f2`, cards/buttons are outlined not filled, tabbing shows the 2px accent ring with 2px offset
- [x] Task 8: Tests (AC: 2, 4)
  - [x] The existing Workers-pool Vitest project cannot render React (`vitest-pool-workers` externalizes `react` — see Dev Notes). Add a **second Vitest project** instead of fighting it:
    - [x] In `vitest.config.ts`, keep the current `cloudflareTest` setup as one project scoped to `src/**/*.test.ts`, and add a second project with `environment: "node"`, `plugins: [react()]`, `include: ["src/**/*.test.tsx"]`
    - [x] `environment: "node"` (not jsdom) — components are tested via `renderToStaticMarkup` from `react-dom/server`, which needs no DOM and no new dependency
  - [x] Add `src/shared/ui/trustComponents.test.tsx` asserting the contract that later stories depend on:
    - [x] `NotLiveDraftBanner` output contains `Not live · awaiting approval` and both `draft` and `draftbanner` classes
    - [x] `ProvenanceLabel` kind=`agent` emits `prov agent`; kind=`human` emits `prov` without `agent`
    - [x] `PostureSwatch` emits `sw untracked`…`sw banned` **and** the paired label text for every one of the five steps
    - [x] `StatusBadge` / `RunStatusChip` / `OriginFlag` emit exactly the glossary enum strings
    - [x] `EmptyState` renders title + reason (no default apology copy)
  - [x] `npm test` runs both projects green
- [x] Task 9: Finalize (AC: all)
  - [x] `npm run check` (oxfmt + oxlint + tsc) green — note oxfmt may reformat the ported CSS; that is fine, but re-read the diff to confirm no *values* changed
  - [x] Confirm no prototype HTML/CSS was copied into `public/` or served (AC5) — the only new CSS lives under `src/shared/ui/`
  - [x] Update Dev Agent Record + File List; set status `review`
  - [x] Commit `story 1.2: classical tokens + PML trust component layer` (single commit; do not push)

## Dev Notes

### Read these files before writing code (they ARE the spec)

| File | Why |
|---|---|
| `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/README.md` | The handoff contract: fidelity bar, design language, token table, the two "loud rules" |
| `.../design_handoff_pml/_ds/classical-85c77590-4a2f-41a0-92df-b00754b50bd3/styles.css` | Source of truth for tokens (255 lines) — copy, don't retype |
| `.../design_handoff_pml/pml.css` | Source of truth for the PML component layer (194 lines) — copy, don't retype |
| `.../design_handoff_pml/PML Design System.html` | Component vocabulary + the *Class inventory* table mapping every class → component name. Read this first; it is the shortest path |

Handoff instruction, verbatim in spirit: *"Never hard-code a value the tokens carry."* Fidelity is **high** — this is a recreate-exactly job, not a reinterpretation.

### Current repo state this story builds on (verified 2026-08-09 at `4ca7474`)

- `src/` is still flat starter layout: `app.tsx`, `client.tsx`, `server.ts`, `server.test.ts`, `styles.css`. **This story creates the first `src/shared/` directory** — the architecture's target tree. Do not migrate the starter files; 1.3 owns that
- `src/styles.css` is 13 lines: `@import "tailwindcss"`, `@import "@cloudflare/kumo/styles/tailwind"`, three `@source` directives, and one `html,body,#root` sizing rule
- Stack present: React 19.2 · Vite 8 · Tailwind 4.3 · `@cloudflare/kumo` 2.6 · `@phosphor-icons/react` 2.1 · Agents SDK · TypeScript 6 · oxlint/oxfmt · Vitest 4.1.10 + `@cloudflare/vitest-pool-workers` 0.20.3 · zod 4.4.3 (unused so far)
- `vitest.config.ts` currently: `plugins: [agents(), cloudflareTest({wrangler:{configPath:"./wrangler.jsonc"}})]`, `include: ["src/**/*.test.{ts,tsx}"]` — the `.tsx` glob is there but **nothing transforms JSX for it yet**, and the Workers pool would externalize `react` anyway. Task 8 fixes both by splitting projects
- `tsconfig.json` extends `agents/tsconfig` (already JSX-ready); `types: ["node","vite/client"]` — `import.meta.env.DEV` is typed

### Tailwind 4 + Kumo coexistence (the main integration hazard)

- Tailwind v4 emits **everything** — preflight, components, utilities — inside `@layer`. Per CSS cascade rules, **unlayered styles beat layered styles regardless of source order**. Our plain `:root` + element + class CSS therefore wins over Tailwind preflight automatically. This is why Task 4 says do not wrap in `@layer` and do not use `@theme`
- **Expected and acceptable:** the starter's Kumo chat UI will visually shift once `body`/`a`/`h1–h6` pick up Classical typography and the `#f3f2f2` ground. That is **not a regression** — the starter UI is explicitly "replaceable, not brand lock" (Story 1.1 AC3) and is replaced wholesale by the real shells in Story 1.3. Do **not** spend time re-theming Kumo, and do not scope our base rules to dodge it
- Kumo's `data-mode` dark theme is not in scope. PML v1 is a single light ground; there is no dark variant in the handoff
- `oklch()` (posture ramp, status badges) and `color-mix()` (dividers) are used unchanged from the handoff — both are baseline-available in all target browsers

### Vitest: why two projects

`@cloudflare/vitest-pool-workers` marks `react` as external when a test graph pulls it in (`cloudflare/workers-sdk` issue #10170), so React component tests fail inside workerd. The worker-code tests genuinely need the Workers pool; the presentational components genuinely do not. Splitting is the low-friction answer:

- Project A (existing): `cloudflareTest` + `agents()` plugins, `include: src/**/*.test.ts` — `src/server.test.ts` keeps passing untouched
- Project B (new): `environment: "node"`, `plugins: [react()]`, `include: src/**/*.test.tsx` — `renderToStaticMarkup` assertions, no jsdom dependency needed

Do not delete or weaken `src/server.test.ts`; it is Story 1.1's readiness-M1 evidence.

### Architecture requirements binding this story

- **File locations (LOCKED):** shared UI primitives live in `src/shared/ui/`; date helpers in `src/shared/lib/dates.ts`. [Source: architecture.md#Complete-Project-Directory-Structure]
- **Naming (LOCKED):** React components are `PascalCase` files; functions/vars `camelCase`; glossary terms in code match the PRD exactly (`Draft`, `Run`, `Evidence`, `posture`, `operationalStatus`). [Source: architecture.md#Naming-Patterns]
- **Boundaries:** `shared/*` must not import from `surfaces/*` or `pipeline/*`. These components are leaf presentational primitives — no data fetching, no D1, no `agents` imports. [Source: architecture.md#Architectural-Boundaries]
- **Enum strings are contracts:** posture/status/origin values here must match what D1 stores and what the Zod schemas will validate in Stories 2.1 / 3.1 — `go | restricted | banned`, origin `scheduled | catch-up | manual`. Getting these wrong now costs a migration later. [Source: architecture.md#Naming-Patterns]
- **Dates:** ISO 8601 UTC with `Z` on the wire; reader-facing ET formatting is a presentation concern living in `shared/lib/dates.ts`. [Source: architecture.md#Format-Patterns]
- **Tests:** co-located `*.test.ts(x)`, Vitest. [Source: architecture.md#File-Organization-Patterns]

### UX requirements binding this story

- **UX-DR1** — Classical + PML tokens; stroke-not-fill; hairline rules; no pill-heavy chrome, heavy shadows, emoji, or aggressive gradients
- **UX-DR2** — posture ramp always paired with its label; untracked is near-white + **dashed** hairline (absence must not read as a neutral finding)
- **UX-DR3** — status badges outlined and muted; `restricted` carries a fine hatch; never traffic-light toy UI
- **UX-DR4** — ProvenanceLabel: human = solid accent dot; agent = dashed border + hollow dot
- **UX-DR5** — NotLiveDraftBanner + `.draft` ticket edge, mandatory wherever a pending Draft appears; must be impossible to confuse with live F1
- **UX-DR6** — RunStatusChip + OriginFlag covering published / awaiting / empty / failed / budget-stopped / rejected × scheduled / catch-up / manual
- **UX-DR21** — EmptyState: dashed frame, the reason, and what it means for the reader. Never an apology
- **UX-DR24** — recreate in the app; the HTML prototypes are reference only and are never served
- **NFR5** — focus ring `outline: 2px solid var(--color-accent); outline-offset: 2px`, never the browser default. Every interactive element in this story must be keyboard-reachable and show it

### Scope boundaries (do NOT do in this story)

- No TopBar / TrustBar / page shells / routing / cross-surface links → **Story 1.3** (the `.topbar`/`.trustbar` CSS ships here; the React chrome does not)
- No Cloudflare Access, no `/admin` gating → Story 1.4
- No CI/CD, envs, or custom domains → Story 1.5
- No D1, no migrations, no Zod schemas, no data fetching → Story 2.1 / 3.1
- No map, no ECharts, no d3/topojson, no `us-atlas` → Story 2.3 / 2.6
- No correction form, no poll tally endpoint → Story 2.9 / 4.5
- No founder portrait / `.plate` usage, no icon library adoption → 1.3 chrome (the `.plate` *class* ships; nothing uses it yet)
- Do not restructure or restyle the starter chat UI beyond the `?ds=1` gallery gate; do not delete `src/app.tsx` content
- Never touch `_bmad/`, `.claude/`, `.agents/`, `docs/`, or `_bmad-output/` except this story file's Dev Agent Record and `sprint-status.yaml`

### Previous story intelligence (1.1, `done` — code review passed)

- **Node trap:** machine default is Node 16 and fails immediately. `.nvmrc` + `package.json` engines now exist (added in 1.1 code review) — still must `nvm use` in each fresh shell
- **oxfmt scope:** `.oxfmtrc.json` already ignores `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/`, `docs/` — so the handoff CSS in `_bmad-output/` will not be linted or reformatted. Good: read from there, write to `src/`
- **`npm run check` = `oxfmt --check . && oxlint src/ && tsc`** — all three must pass before commit; oxfmt runs repo-wide
- **Wrangler is at 4.120.0**, deliberately bumped above the template lockfile. Don't downgrade
- **Deferred to this story by 1.1's code review:** `index.html` still titled "Agent Starter" with a Cloudflare Agents description → Task 6 closes it
- **Explicitly NOT this story's problem** (deferred, owned elsewhere): unauthenticated starter agent surface (→1.4/1.5), and the starter `src/app.tsx` edge cases (blob URL leak, approval no-op, send races, unguarded `mediaType`/`text`). Leave them; they die with the template UI in 1.3
- Story 1.1's habit worth repeating: write the failing test first, then make it pass (`npm test` was taken red→green deliberately)

### Git intelligence

Last commit `4ca7474` ("story 1.1: scaffold cloudflare agents-starter foundation") is the entire application history — there are no prior styling conventions to conform to beyond what the starter shipped. Patterns established there and worth continuing: purposeful file-level comments explaining *why* a config is shaped the way it is (see `vitest.config.ts`), and deliberate, documented exclusions rather than silent omissions.

### Project Structure Notes

New files land as:

```
src/
├── shared/
│   ├── ui/
│   │   ├── tokens.css                 # Classical token sheet (copied)
│   │   ├── pml.css                    # PML component layer (copied)
│   │   ├── PostureSwatch.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── UpdatedBadge.tsx
│   │   ├── ProvenanceLabel.tsx
│   │   ├── WarnChip.tsx
│   │   ├── LastUpdated.tsx
│   │   ├── NotLiveDraftBanner.tsx
│   │   ├── RunStatusChip.tsx
│   │   ├── OriginFlag.tsx
│   │   ├── EmptyState.tsx
│   │   ├── DesignSystemGallery.tsx
│   │   ├── index.ts
│   │   └── trustComponents.test.tsx
│   └── lib/
│       └── dates.ts
└── styles.css                          # + 2 import lines
```

Variance from the architecture tree: none — `src/shared/ui/` and `src/shared/lib/dates.ts` are exactly where the architecture puts them. `DesignSystemGallery.tsx` is an addition not named in the tree; it is a development surface, co-located with what it documents, and is the verification mechanism for AC2.

### Testing standards summary

- Runner Vitest ~4.1.10. Two projects after this story: Workers pool for `*.test.ts` (workerd, against `wrangler.jsonc`), node + React plugin for `*.test.tsx` (`renderToStaticMarkup`)
- Co-located with source; `npm test` runs everything
- This story's bar: the trust-component contract tests above, plus `src/server.test.ts` still green. Deeper coverage obligations begin at 3.3 / 3.6 / 3.11 (Run lifecycle, enforcement fixtures, gate write-path)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2] — story + ACs
- [Source: _bmad-output/planning-artifacts/epics.md#UX-Design-Requirements] — UX-DR1–7, UX-DR21–24 (Epic 1 coverage)
- [Source: _bmad-output/planning-artifacts/epics.md] line 133 — NFR5 accessibility + focus-ring spec
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure] — `src/shared/ui`, `src/shared/lib/dates.ts`
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns] — component/file naming, glossary enum strings
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural-Boundaries] — `shared/*` import rules
- [Source: _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/README.md] — fidelity bar, token table, posture ramp, status/run chip vocabulary
- [Source: .../design_handoff_pml/PML Design System.html#inventory] — class → component mapping table
- [Source: _bmad-output/implementation-artifacts/1-1-scaffold-cloudflare-agents-starter.md] — env facts, check-suite, deferrals inherited
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — what 1.2 owns vs what stays deferred
- [Source: tailwindcss.com/docs/theme — verified 2026-08-09] — `@theme` vs `:root`; Tailwind v4 emits into `@layer`, unlayered styles win
- [Source: github.com/cloudflare/workers-sdk issue #10170 — verified 2026-08-09] — `react` externalized under `vitest-pool-workers`

## Open Questions for Patrick (do not block implementation)

1. **Icon library.** The handoff specifies **Lucide**; the starter shipped **`@phosphor-icons/react`**. No icon is required by this story's ACs, so nothing is added now — but 1.3's chrome needs the call. Recommendation: adopt `lucide-react` and drop Phosphor with the template UI.
2. **Font hosting.** Cormorant Garamond + Lora load from Google Fonts, matching the handoff. Self-hosting via Workers assets would remove a third-party request from every page load on a project whose whole thesis is provenance. Worth a decision before 1.5 goes to a real domain.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session

### Debug Log References

- **Baseline was not green.** `npm run check` failed at `4ca7474` before any work started: oxfmt rejected `package.json` key ordering (`engines` must follow `devDependencies`). Introduced by Story 1.1's code-review patch, which is still uncommitted in the working tree. Fixed with `oxfmt --write package.json` — key order only, no value changes.
- `oxlint` flagged `jsx-a11y(prefer-tag-over-role)` on `PostureSwatch`'s `role="img"` span. Fixed semantically rather than suppressed: the only caller that drops the visible label is a map region that already names the posture in its own `aria-label`, so the swatch there is genuinely decorative and is now `aria-hidden`. No unlabelled colour is ever exposed, and the posture is never announced twice.
- The browser pane's screenshot capture returns blank frames for scrolled content (DOM inspection confirmed the elements were present, in-viewport, with non-zero height). Visual verification was completed by reading computed styles instead, which checks the ACs more directly than a screenshot would.
- First draft of `PostureSwatch` invented two wrapper classes (`.postureswatch`, `.visually-hidden`) that the handoff does not define. Rewritten as a fragment so callers own layout and only handoff classes are emitted.

### Completion Notes List

- **Tokens (AC1).** `src/shared/ui/tokens.css` ports the Classical sheet verbatim — full colour roles, neutral/accent/accent-2 ramps 100–900, Cormorant/Lora, `--space-1..8`, radii, shadows — plus the base element rules and the v1-reachable component classes (`.btn*`, `.input`, `.card*`, `.tag*`, `.table`, `.elev-*`, `.hr`, `.plate`). `.dialog*`, `.radio` and `.seg*` deliberately not ported; no v1 surface reaches them yet.
- **Component layer (AC2, AC3).** `src/shared/ui/pml.css` ports all 194 lines of the handoff's PML layer: chrome, posture ramp, badges, provenance, warn, lastupd, draft ticket edge, run chips, origin flags, `table.grid`, panels, empty states, chips/filters/export, evidence step timeline, diff, themed native controls.
- **Cascade.** Both imported from `src/styles.css` after Tailwind/Kumo, unlayered and not restated via `@theme`. Verified live: Tailwind preflight does not override the token layer, and Kumo continues to work.
- **Ten components + barrel.** All emit handoff classes only. `LastUpdated` formats through the new `src/shared/lib/dates.ts` (`formatEtDateTime` / `formatEtDate`, ISO-8601 UTC in → ET out, correct across both EDT and EST).
- **`RunStatusChip` naming.** Resolved the class/vocabulary mismatch in favour of the reader: the prop is `empty`, mapped internally to the `.run.noop` class, documented in the file. Its label is "no material change" — an empty Run is a finding, not an error.
- **Verified live against computed styles** (`?ds=1`, dev server): `--color-bg` `#f3f2f2`, `--color-accent` `#b68235`, `--space-4` `18.4px`, `--radius-md` `4px`, `--shadow-md` present; `h2` resolves to Cormorant Garamond and `body` to Lora (fonts loading); `.empty` border `dashed` with hint; `.sw.untracked` border `dashed`; `.draft::before` is the 45° repeating gradient ticket edge; `.btn-primary` background `rgba(0,0,0,0)` with accent border (**AC3 stroke-not-fill**); focused `.chip` outline = `2px solid rgb(182,130,53)` at offset `2px` (**AC4**); `.num` carries `"tnum"`.
- **AC5.** Nothing from the handoff bundle is served: the only new CSS lives under `src/shared/ui/`, and the design-system reference is recreated as `DesignSystemGallery.tsx`, mounted dev-only behind `?ds=1` and marked temporary pending Story 1.3's routing.
- **No regression.** Without `?ds`, the starter chat UI still boots with zero console errors. As predicted in Dev Notes, it now inherits Classical typography and ground — expected, not a regression; the template UI is replaced in 1.3.
- **Story 1.1 deferral cleared:** `index.html` title and description are now PML's. (The "Agent Starter" string still visible in-app lives inside the starter's own chat component, not the document shell — it dies with the template UI in 1.3.)
- **Tests.** `vitest.config.ts` split into two projects — `workers` (workerd, `*.test.ts`, `src/server.test.ts` untouched and still green) and `ui` (node + React plugin, `*.test.tsx`, `renderToStaticMarkup`). No new dependencies; jsdom avoided. 29 tests pass across both projects.
- **No new dependencies added.** Both Open Questions (Lucide vs Phosphor, font self-hosting) remain open and unblocking.
- **Noticed, not touched:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-09.md` appeared untracked during this session and was not authored by this story. Story 1.1's review patches (`LICENSE`, `.nvmrc`, `engines`, `.gitignore`, `src/server.ts` modulo guard) are also still uncommitted in the working tree.

### Change Log

- 2026-08-09: Story implemented end-to-end (baseline repair → token sheet → component layer → cascade wiring → red/green component tests → ten trust components → document-shell branding → gallery → live verification). Status → review.

### File List

New (authored this story):

- src/shared/ui/tokens.css
- src/shared/ui/pml.css
- src/shared/ui/PostureSwatch.tsx
- src/shared/ui/StatusBadge.tsx
- src/shared/ui/UpdatedBadge.tsx
- src/shared/ui/ProvenanceLabel.tsx
- src/shared/ui/WarnChip.tsx
- src/shared/ui/LastUpdated.tsx
- src/shared/ui/NotLiveDraftBanner.tsx
- src/shared/ui/RunStatusChip.tsx
- src/shared/ui/OriginFlag.tsx
- src/shared/ui/EmptyState.tsx
- src/shared/ui/DesignSystemGallery.tsx
- src/shared/ui/index.ts
- src/shared/ui/trustComponents.test.tsx
- src/shared/lib/dates.ts

Modified:

- src/styles.css (token + component layer imports)
- src/app.tsx (dev-only `?ds=1` gallery gate + import)
- index.html (PML title/description, Google Fonts preconnect + stylesheet)
- vitest.config.ts (split into `workers` and `ui` projects)
- package.json (oxfmt key ordering — pre-existing baseline failure, no value changes)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status transitions)
- _bmad-output/implementation-artifacts/1-2-design-tokens-core-trust-components.md (this file)
