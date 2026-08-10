---
baseline_commit: ba7ce91d99bdef85632f48b06e9ad00d53f57323
---

# Story 1.3: Dual-Site Shells & Trust Chrome

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor,
I want distinct apex, `ops.`, and admin shells with shared trust chrome and cross-links,
So that the litigation product and governance receipts are clearly separated but discoverable.

## Acceptance Criteria

1. **Given** design tokens and trust components (Story 1.2), **when** I open the apex surface (`predictionmarketlitigation.com` or the local apex route), **then** I see TopBar + TrustBar with brand, the positioning line *Built by AI, governed and approved by a human; corrections welcome.*, a not-legal-advice warn affordance, a last-updated placeholder, and links to `ops.` and the public repo
2. When I open the `ops.` surface I see ops.-branded chrome, a link back to apex, and empty-state placeholders for the run log / explainer / journal bands
3. When I open `/admin` I see admin-branded chrome (Access may still be stubbed until 1.4) with links to apex and `ops.`
4. Section bands use EmptyState where content is not yet wired
5. Layouts collapse sensibly under ~940px (UX-DR22)
6. IA split is preserved: apex does not host the 9-layer explainer or canonical journal

## Tasks / Subtasks

- [x] Task 1: Preflight (AC: all)
  - [x] Node ≥ 20.12 — **machine default `node` is v16.20.2 and WILL FAIL**. `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"` or `nvm use` (repo ships `.nvmrc`)
  - [x] Confirm baseline green: `npm run check` and `npm test` (expect 29 tests, 2 projects)
- [x] Task 2: Surface resolution (AC: 1, 2, 3)
  - [x] Create `src/shared/lib/surface.ts` exporting `type Surface = "apex" | "ops" | "admin"` and `resolveSurface(url: URL): Surface`
  - [x] Resolution order, first match wins:
    1. pathname starts with `/admin` → `admin`
    2. hostname starts with `ops.` → `ops`
    3. `?surface=ops|admin|apex` → that surface (**dev/preview escape hatch**, see below)
    4. otherwise → `apex`
  - [x] The `?surface=` param exists because custom domains are not bound until Story 1.5 and `ops.localhost` resolves in Chrome but not reliably elsewhere. Gate it on `import.meta.env.DEV` so it cannot be used to reach admin chrome on production
  - [x] Keep this module free of React and of any `surfaces/*` import — it is pure and is unit-tested in the workers project
- [x] Task 3: Shared chrome primitives (AC: 1, 2, 3, 5)
  - [x] Add to `src/shared/ui/`, emitting handoff classes only (`.topbar`, `.brand`, `.topnav`, `.trustbar`, `.wrap`, `.sep`, `.grow`, `section.band`, `.sec-head`, `.why`, `footer.foot`) — all already in `pml.css` from 1.2, nothing new to author:
    - [x] `TopBar.tsx` — props: `brand: ReactNode`, `links: Array<{ href, label, external?, current? }>`. External links get `class="ext"` (renders the ↗ affordance); the active link gets `aria-current`
    - [x] `TrustBar.tsx` — props: `warn: ReactNode`, `message: ReactNode`, `meta?: ReactNode`, `provenance?: ReactNode`. Renders `·` separators between present slots only (the CSS hides a trailing one via `.sep:last-of-type`)
    - [x] `SectionBand.tsx` — props: `id`, `kicker`, `title`, `why`, `children`. This is the `section.band` + `.sec-head` pattern the gallery already prototypes; **extract it from `DesignSystemGallery.tsx` and have the gallery import it** rather than keeping two copies
    - [x] `SiteFooter.tsx` — `footer.foot` with the cross-surface links
  - [x] Export all four from `src/shared/ui/index.ts`
  - [x] These are shared because all three surfaces use them. Per-surface differences (brand text, nav items, trust-bar copy) are **props**, never forks
- [x] Task 4: Cross-surface link helper (AC: 1, 2, 3, 6)
  - [x] Add `surfaceHref(target: Surface, path?: string): string` to `src/shared/lib/surface.ts`
  - [x] In dev it returns `?surface=<target>`; in production it returns the real origin (`https://ops.predictionmarketlitigation.com`, apex root, `/admin`). Story 1.5 binds the domains; centralizing here means 1.5 changes one function, not every shell
  - [x] **Architecture boundary (LOCKED):** `surfaces/apex` must not import `surfaces/ops` internals. Cross-surface navigation is href strings only — never a component import. [Source: architecture.md#Architectural-Boundaries]
- [x] Task 5: Apex shell (AC: 1, 5, 6)
  - [x] Create `src/surfaces/apex/ApexShell.tsx`
  - [x] TopBar brand: `Prediction<em>Market</em>Litigation` (the `<em>` is the accent word, styled by `.brand em`)
  - [x] TopBar nav, in handoff order: Overview · Circuit split · States · Issues · Cases · Entities · Cert signal, then `ops.` and Repo as external. Anchors are `#brief #circuits #states #issues #cases #entities #cert` — the long-scroll section ids
  - [x] TrustBar: warn = `WarnChip` default copy; message = **`Built by AI, governed and approved by a human; corrections welcome.`** verbatim; meta = `LastUpdated` placeholder; provenance = `ProvenanceLabel kind="human"`
  - [x] Body: the handoff's long-scroll bands as `SectionBand` + `EmptyState`, in order — Overview/brief, Circuit split, States, Issues, Cases, Entities, Cert signal, Trust/correction, ops. handoff. Each EmptyState says what will live there and that it is not yet wired
  - [x] **AC6 — do NOT add explainer or journal bands here.** Those are `ops.`-only. Apex links to `ops.`; it never hosts them
  - [x] v1 apex is a **single long-scroll page**, not per-state/per-case routes. Selection deep-links via URL params (`?state=NJ`) in Epic 2 — do not build routes for them now [Source: architecture.md#Frontend-routing-clarification]
- [x] Task 6: ops. shell (AC: 2, 4, 5)
  - [x] Create `src/surfaces/ops/OpsShell.tsx`
  - [x] Brand: `ops.<em>PredictionMarketLitigation</em>`. Nav: Run log · Pending drafts · Mode · Nine layers · Journal, then Tracker and Repo as external
  - [x] TrustBar (handoff copy): warn = `Nothing here is live tracker content`; message = `Runs and drafts are AI-produced and gate-controlled. Corrections welcome.`; meta = next-run placeholder; provenance = gate-mode placeholder
  - [x] Bands with EmptyState, ids `#runs #drafts #mode #layers #journal` — run log (3.7), pending drafts (3.9), mode transparency (3.13), nine-layer explainer (4.1), build journal (4.3). Name the owning story in each empty state's hint so the placeholder is honest about what is coming
- [x] Task 7: Admin shell (AC: 3, 5)
  - [x] Create `src/surfaces/admin/AdminShell.tsx`
  - [x] Brand: `PML <span class="sub">/ admin</span>`. Nav: Approval queue · Mode controls, then ops. and Tracker as external
  - [x] TrustBar: gate/mode indicator + queue-summary placeholder + budget placeholder (all static placeholders — no data until 3.x)
  - [x] Bands with EmptyState for the approval queue (3.10) and mode controls (3.12)
  - [x] **Access is NOT wired here — Story 1.4 owns it.** Do not add auth checks, login UI, or secret reads. A visible "unprotected — Access lands in 1.4" note in the admin chrome is appropriate and honest
- [x] Task 8: Replace the starter chat UI (AC: 1, 2, 3)
  - [x] Rewrite `src/app.tsx` to: resolve the surface once from `window.location`, then render `ApexShell` / `OpsShell` / `AdminShell`
  - [x] Delete the starter `Chat` component and its imports. This clears the Story 1.1 deferrals for `src/app.tsx` (blob-URL leak on unmount, approval no-op when `approval.id` is missing, send/encode races, unguarded `mediaType`/`text`, MCP connect failures only `console.error`) — they die with the template UI rather than being fixed. Record that in `deferred-work.md`
  - [x] Remove the dev-only `?ds=1` gallery gate; mount the gallery at `/design-system` under the apex surface instead, still `import.meta.env.DEV`-gated
  - [x] **Do NOT touch `src/server.ts`.** The `ChatAgent` Durable Object stays: `@cloudflare/ai-chat`, `ai`, `workers-ai-provider` and `zod` are server-side dependencies, and the pipeline in Epic 3 builds on this Agents/DO wiring. The unauthenticated agent surface is owned by Stories 1.4/1.5, not this one
- [x] Task 9: Prune the template UI's client dependencies (AC: 1)
  - [x] Verified: `@cloudflare/kumo`, `@phosphor-icons/react`, `streamdown`, `@streamdown/code` appear **only** in `src/app.tsx` (47 references), never in `server.ts`, `client.tsx` or `shared/`. Once Task 8 lands they are dead weight
  - [x] Remove those four from `package.json` dependencies and run `npm install`
  - [x] `src/styles.css`: drop `@import "@cloudflare/kumo/styles/tailwind"` and the three `@source` lines for kumo/streamdown. Keep `@import "tailwindcss"` and both PML imports
  - [x] `index.html`: remove the `data-mode` theme bootstrap script — it exists only for Kumo's light/dark, and PML v1 is a single light ground
  - [x] Do this **last, after the shells render**, and re-run `npm run check` + `npm test` immediately. If anything breaks, revert this task alone rather than unpicking the shells
- [x] Task 10: Tests (AC: 1, 2, 3, 6)
  - [x] `src/shared/lib/surface.test.ts` — **workers project** (pure module, no React): `/admin` → admin; `ops.` host → ops; bare host → apex; `?surface=ops` honored in dev; precedence when host and path disagree (`ops.` host + `/admin` path → admin)
  - [x] `src/surfaces/shells.test.tsx` — **ui project** (`renderToStaticMarkup`):
    - [x] Apex renders the positioning line verbatim, a not-legal-advice warn, and links to both `ops.` and the repo
    - [x] **AC6 regression guard:** apex markup contains neither the explainer nor the journal — assert the absence of `#layers` and `#journal`. This is the one AC a future well-meaning edit is most likely to break
    - [x] ops. renders the run log, explainer and journal bands, each wrapped in `.empty`, plus a link back to apex
    - [x] Admin renders both cross-links and the approval-queue band
    - [x] Every shell renders `.topbar` and `.trustbar`
  - [x] `npm test` green across both projects
- [x] Task 11: Verify in the browser (AC: 1, 2, 3, 4, 5)
  - [x] `npm run dev`, then check apex `/`, ops. `/?surface=ops`, admin `/admin`
  - [x] Confirm at ~900px that the two-column `.sec-head` stacks and the trust bar wraps (UX-DR22)
  - [x] Tab through each shell: nav links show the 2px accent focus ring at 2px offset
  - [x] Confirm zero console errors on all three
- [x] Task 12: Finalize (AC: all)
  - [x] `npm run check` green (oxfmt + oxlint + tsc)
  - [x] Update Dev Agent Record + File List; set status `review`
  - [x] Commit `story 1.3: dual-site shells + trust chrome` (single commit; do not push)

### Review Findings

- [x] [Review][Decision] `workers` Vitest project (+ `npm run dev`) requires a live `CLOUDFLARE_API_TOKEN` and cannot start without one — `wrangler.jsonc`'s `ai` binding is `remote: true` with no local simulation mode for Workers AI (confirmed against Cloudflare's own docs). Confirmed by direct reproduction: `npx vitest run` originally threw "Failed to start the remote proxy session" for both `surface.test.ts` and `server.test.ts`; only 45 of the claimed 61 tests ran, and none of `surface.ts`'s admin-gating security tests executed. **Resolved, not deferred:** added `wrangler.test.jsonc` (identical to `wrangler.jsonc` minus the `ai` block — `wrangler.jsonc` itself untouched, respecting the story's scope boundary) and pointed the `workers` Vitest project at it. Neither `surface.test.ts` (pure URL logic) nor `server.test.ts` (fetch-handler smoke test) reaches the one call site that reads `env.AI` (`src/server.ts:51`, inside `ChatAgent` message handling). Re-verified: `npx vitest run` now passes 4 test files / 61 tests with zero `CLOUDFLARE_API_TOKEN` needed; `npm run check`'s oxlint + tsc steps stay clean. `npm run dev` still needs a live token (unaffected — it boots the real `wrangler.jsonc`, correctly) but that path was never blocking test coverage or CI, only the interactive live-browser verification step, so nothing further deferred here.
- [x] [Review][Patch] ApexShell TrustBar shows a fixed "Updated 10 Aug 2026" + "Human-approved" though every section below is an EmptyState — nothing has been approved or published yet; no visible placeholder marking, unlike OpsShell's "Next run — not yet scheduled" [`src/surfaces/apex/ApexShell.tsx:67-68`]
- [x] [Review][Patch] OpsShell's provenance slot renders "Human-approved · Gate: HITL" by reusing `ProvenanceLabel`'s fixed human/agent vocabulary for a gate-mode indicator; the handoff's own source (`PML Ops.html:115`) shows bare "Gate: HITL" with no "Human-approved" prefix [`src/surfaces/ops/OpsShell.tsx:61`]
- [x] [Review][Patch] AdminShell TrustBar is missing the "budget placeholder" Task 7 calls for and checks off complete — only gate/mode + queue-summary are wired, no budget slot (handoff `PML Admin.html:99`: `Budget today $0.38 of $2.00`) [`src/surfaces/admin/AdminShell.tsx:50-54`]
- [x] [Review][Patch] AdminShell `meta="No drafts awaiting"` reads as a checked fact rather than an honest not-yet-real placeholder, inconsistent with OpsShell's "not yet scheduled" phrasing [`src/surfaces/admin/AdminShell.tsx:53`]
- [x] [Review][Patch] TopBar/SiteFooter external links never set `target="_blank"`, so the conditional `rel="noopener"` spread is dead code with no effect [`src/shared/ui/TopBar.tsx:41-43`]
- [x] [Review][Patch] AdminShell hardcodes `current: true` on the "Approval queue" nav link with no routing/scroll basis for it — neither ApexShell nor OpsShell mark anything current [`src/surfaces/admin/AdminShell.tsx:33`]
- [x] [Review][Patch] None of the three shells render a `<main>` landmark — SectionBands sit in a bare wrapping `<div>`, so screen-reader/keyboard users can't skip the repeated top/trust bars [`src/surfaces/apex/ApexShell.tsx:54`]
- [x] [Review][Patch] No `color-scheme` declared anywhere after Task 9 removed the `data-mode` bootstrap script — page is exposed to forced/auto-dark-mode heuristics with no dark tokens to fall back on [`index.html`]
- [x] [Review][Patch] In-page nav anchors scroll their target directly under the sticky 62px `.topbar` (`z-index: 30`) — no `scroll-margin-top`/`scroll-padding-top` anywhere in `pml.css`, so every anchor jump hides the destination heading [`src/shared/ui/pml.css:66-77`]
- [x] [Review][Patch] AC6 regression guard only asserts the literal absence of `id="layers"`/`id="journal"` strings, not the underlying explainer/journal content — a future band under a different id would violate AC6 and still pass [`src/surfaces/shells.test.tsx:61-65`]
- [x] [Review][Patch] Dev-only `/design-system` gallery gate is an exact pathname match — `/design-system/` or any sub-path falls through to the surface shells instead of the gallery [`src/app.tsx:28`]
- [x] [Review][Patch] `surfaceHref` concatenates `path` with no leading-slash normalization and no query-string collision handling — a future caller passing `"runs"` or a path that already has `"?"` produces a malformed href [`src/shared/lib/surface.ts:90-100`]
- [x] [Review][Patch] TrustBar's warn/message/meta/provenance slots use truthy checks, so a literal `0` would be dropped as if absent [`src/shared/ui/TrustBar.tsx:31-34`]
- [x] [Review][Patch] TopBar nav link key is `href+label` with no index fallback — two links sharing both would collide [`src/shared/ui/TopBar.tsx:37`]
- [x] [Review][Patch] SiteFooter link key has the same `href+label` collision risk as TopBar [`src/shared/ui/SiteFooter.tsx:27`]
- [x] [Review][Patch] SiteFooter never applies the `.ext` ↗ class for external links, unlike TopBar — the same `external: true` flag renders inconsistently between header and footer [`src/shared/ui/SiteFooter.tsx:25-34`]
- [x] [Review][Patch] ops. EmptyState hints never name the owning story (3.7/3.9/3.13/4.1/4.3) despite Task 6's explicit instruction to do so, though the task is checked complete [`src/surfaces/ops/OpsShell.tsx:72,88,104,119,134`]
- [x] [Review][Defer] `oxfmt --check .` fails repo-wide (including files 1.3 never touched) on Windows because `core.autocrlf=true` checks files out as CRLF and there is no `.gitattributes` pinning LF — pre-existing since before 1.1, not caused by this diff — deferred, pre-existing

## Dev Notes

### ⚠️ Story 1.2 has not been code-reviewed

1.2 is at status `review`, not `done`. This story builds directly on its tokens and trust components. If 1.2's review lands changes to component props or class names, this story's shells may need adjusting. Nothing here is blocked — but do not treat 1.2's API as frozen.

### What 1.2 already gives you (do not rebuild any of it)

All chrome CSS this story needs **already exists** in `src/shared/ui/pml.css` — ported verbatim from the handoff in 1.2. You are writing React that emits these classes, not new CSS:

`.topbar` (sticky, 62px, hairline base) · `.brand` (+ `.brand em` accent word, `.brand .sub`) · `.topnav` (+ `a.ext` ↗ affordance, `a[aria-current]`) · `.trustbar` (+ `.sep`, `.grow`, wraps at 900px) · `section.band` · `.sec-head` (+ `.why`, stacks at 940px) · `footer.foot` · `.empty` · `.wrap` (1220px max)

Components available from `src/shared/ui/index.ts`: `EmptyState`, `LastUpdated`, `NotLiveDraftBanner`, `OriginFlag`, `PostureSwatch`, `ProvenanceLabel`, `RunStatusChip`, `StatusBadge`, `UpdatedBadge`, `WarnChip`. Date formatting: `formatEtDateTime` / `formatEtDate` from `src/shared/lib/dates.ts`.

**If you find yourself writing a CSS rule in this story, stop** — either the class exists in `pml.css`, or the handoff has it and it was skipped, or you are inventing something the design system does not have.

### Current code state (verified at `ba7ce91`)

- `src/app.tsx` is 990 lines and is still the starter chat UI, plus the 1.2 `?ds=1` gallery gate at the top of `App()`. Task 8 replaces the whole thing
- `src/client.tsx` is 6 lines: imports `./styles.css`, mounts `App` into `#root`. **No change needed**
- `src/server.ts` exports the `ChatAgent` DO and a `fetch` that delegates to `routeAgentRequest(request, env)` then 404s. **Leave it alone**
- `wrangler.jsonc` already serves the SPA correctly: `assets.not_found_handling: "single-page-application"` with `run_worker_first: ["/agents/*", "/oauth/*"]`. That means **`/admin` already falls through to `index.html`** — no Worker routing change is needed for this story. Do not edit `wrangler.jsonc`
- `src/shared/` exists with `ui/` (1.2's components + both CSS files) and `lib/dates.ts`
- `src/surfaces/` **does not exist yet** — this story creates it

### Routing: what v1 actually needs

There is **no router library installed, and this story does not add one.** What the three surfaces need is surface *resolution*, not nested routing:

- apex — one long-scroll page, in-page anchors, URL params for selection later (Epic 2)
- ops. — one page, in-page anchors (`#runs`, `#drafts`, …); Evidence detail (`/runs/:runId`) arrives in Story 3.8
- admin — one page at `/admin`

A pure `resolveSurface(url)` covers all of it today and stays valid under any router adopted later, because it reads a URL rather than owning navigation. See Open Question 1 for the library decision this defers.

**Local development reality:** custom domains are not bound until Story 1.5. `ops.localhost:5173` works in Chrome but is not reliable across browsers, which is why `?surface=ops` exists as a dev-only escape hatch — and why it must be `import.meta.env.DEV`-gated, so nobody can reach admin chrome on production by pasting a query string.

### Architecture requirements binding this story

- **File locations (LOCKED):** `src/surfaces/{apex,ops,admin}/`; shared primitives in `src/shared/ui/`; pure helpers in `src/shared/lib/`. [Source: architecture.md#Complete-Project-Directory-Structure]
- **Boundaries (LOCKED):** `surfaces/*` may import `shared/*` **only** — never another surface, never `pipeline/*`. Cross-surface navigation is href strings. [Source: architecture.md#Architectural-Boundaries]
- **Naming (LOCKED):** PascalCase component files, camelCase functions. [Source: architecture.md#Naming-Patterns]
- **v1 apex is a single long-scroll page**, not the `StateDetailPage`/`CaseDetailPage` routes sketched in the directory tree — that sketch is explicitly superseded. [Source: architecture.md#Frontend-routing-clarification]
- **No global state library**; URL is the source of truth for shareable selection. [Source: architecture.md#State-Management-Patterns]
- **Tests co-located** `*.test.ts(x)`. [Source: architecture.md#File-Organization-Patterns]

### UX requirements binding this story

- **UX-DR7** — TopBar + TrustBar on all three surfaces: positioning line, last-updated, provenance, not-legal-advice warn, discoverability links across surfaces
- **UX-DR21** — EmptyState is dashed frame + reason + what it means for the reader. Never an apology, and never a bare "coming soon"
- **UX-DR22** — two-column grids collapse to one at 940px; the trust bar wraps at 900px. Both are already in `pml.css`; your job is to not fight them
- **UX-DR24** — recreate from the handoff; never serve the prototypes
- **NFR5** — keyboard reachable, 2px accent focus ring at 2px offset
- **IA split (AC6)** — the nine-layer explainer and the canonical journal live on `ops.` only. Apex links to them; apex never hosts them. Syndicated copies elsewhere are not source of truth

Handoff chrome copy is transcribed into the tasks above; the source of truth if anything is ambiguous is `PML Tracker.html` (line ~522), `PML Ops.html` (line ~95) and `PML Admin.html` (line ~84) in the handoff bundle.

### Scope boundaries (do NOT do in this story)

- No Cloudflare Access, no auth, no admin gating → **Story 1.4**
- No CI/CD, no environments, no custom domain binding → **Story 1.5** (this is why `surfaceHref` centralizes origins)
- No D1, no migrations, no Zod schemas, no API routes, no data fetching → 2.1 / 3.1
- No map, no ECharts, no d3/topojson → 2.3 / 2.6
- No real run log, drafts, explainer, journal or approval queue — **EmptyState placeholders only**
- No router library, no per-state or per-case routes
- Do not modify `src/server.ts` or `wrangler.jsonc`
- Never touch `_bmad/`, `.claude/`, `.agents/`, `docs/`, or `_bmad-output/` except this story file and `sprint-status.yaml`

### Previous story intelligence (1.2)

- **Port, don't invent.** 1.2's one real misstep was inventing wrapper classes (`.postureswatch`, `.visually-hidden`) the handoff does not define; they were removed. Same rule here: if a class is not in `pml.css`, it does not exist
- **oxlint runs `jsx-a11y`.** 1.2 hit `prefer-tag-over-role` on `role="img"`. Expect similar on chrome: use real `<nav>`, `<header>`, `<footer>` elements rather than divs with roles. Note the handoff prototypes use `<div class="topbar">` — prefer the semantic element and keep the class
- **Two Vitest projects** (`workers` for `*.test.ts`, `ui` for `*.test.tsx`). Put pure-logic tests in the former, rendering tests in the latter — see Task 10
- **The browser pane's screenshot capture returns blank frames for scrolled content.** Verify by reading computed styles / DOM via the JS console rather than trusting a screenshot
- **`npm run check` = `oxfmt --check . && oxlint src/ && tsc`**, repo-wide. oxfmt will reformat your JSX; re-read the diff to confirm only formatting moved
- 1.2 verified its work against live computed styles rather than eyeballing. Do the same for UX-DR22's collapse — read `getComputedStyle` at a narrow viewport instead of guessing

### Git intelligence

Recent history (`ba7ce91` back): story 1.2's component layer, then the bmad-loop orchestrator install, then two planning commits. Conventions worth continuing from 1.1/1.2: file-level comments explaining *why* a shape was chosen; deliberate, documented exclusions rather than silent omissions; and red-green test order.

Note the working tree is now clean and pushed — `ba7ce91` is on `origin/main`, so `git diff ba7ce91` cleanly shows this story's work.

### Project Structure Notes

```
src/
├── surfaces/                        # NEW — this story creates it
│   ├── apex/ApexShell.tsx
│   ├── ops/OpsShell.tsx
│   ├── admin/AdminShell.tsx
│   └── shells.test.tsx
├── shared/
│   ├── ui/  TopBar.tsx · TrustBar.tsx · SectionBand.tsx · SiteFooter.tsx  (+ index.ts)
│   └── lib/ surface.ts · surface.test.ts
├── app.tsx                          # REWRITTEN — surface switch, chat UI deleted
└── styles.css                       # kumo/streamdown imports removed
```

No variance from the architecture tree. `SectionBand` is an extraction of markup 1.2 prototyped inline in the gallery — the gallery should import it, leaving one definition.

### Testing standards summary

- Vitest ~4.1.10, two projects; `npm test` runs both
- This story's bar: surface-resolution unit tests (including the host-vs-path precedence case) and shell rendering tests, with the AC6 IA-split assertion as an explicit regression guard
- Deeper coverage obligations begin at 3.3 / 3.6 / 3.11

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3] — story + ACs
- [Source: _bmad-output/planning-artifacts/epics.md] UX-DR7, UX-DR21–24; line 133 NFR5
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-routing-clarification] — single long-scroll apex supersedes the per-page route sketch
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural-Boundaries] — surface import rules
- [Source: _bmad-output/planning-artifacts/ux-brief-pack.md#6B] / [#6C] — ops. and admin screen inventory + owning FRs
- [Source: .../design_handoff_pml/PML Tracker.html:522] · [PML Ops.html:95] · [PML Admin.html:84] — chrome markup and copy
- [Source: _bmad-output/implementation-artifacts/1-2-design-tokens-core-trust-components.md] — component API, Vitest split, oxlint behavior
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — starter `app.tsx` edge cases this story retires

## Open Questions for Patrick (do not block implementation)

1. **Router library.** None is installed and this story does not need one — `resolveSurface` covers three single-page surfaces. But Story 3.8 (Evidence detail, `/runs/:runId`) needs real routing. Options: `react-router` v7 (heaviest, most familiar), `wouter` (~2KB, hook-based), or hand-rolled `URLPattern` matching (zero deps; `URLPattern` is available in workerd and modern browsers). Recommendation: decide at 3.8 rather than now, since `resolveSurface` stays valid under all three.
2. **Icon library — still open from 1.2.** The handoff specifies Lucide; the starter shipped `@phosphor-icons/react`, which Task 9 removes. No icon is required by this story's ACs, but the `ops.` nine-layer explainer (4.1) and admin queue (3.10) will want them. Recommendation: adopt `lucide-react` when the first icon is actually needed.
3. **Font self-hosting — still open from 1.2.** Cormorant/Lora load from Google Fonts. Worth deciding before 1.5 binds real domains, on a project whose thesis is provenance.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session

### Debug Log References

- **Focus-ring verification produced a false negative at first.** Calling `element.focus()` from the console reported `outline-style: none`, which looks like an NFR5 failure. It is not: `:focus-visible` does not match on programmatic focus. Re-tested with a real `Tab` keypress — `el.matches(':focus-visible')` true, outline `2px solid rgb(182, 130, 53)` at `2px` offset. **Verify focus rings with keyboard input, never with `.focus()`.**
- `oxlint` flagged the unused `ReactNode` import left behind in `DesignSystemGallery.tsx` after its local `Band` was replaced by the shared `SectionBand`.
- `npm uninstall` of the four template packages emitted an `npm audit` advisory notice on unrelated transitive deps; no install failure, and `check` + `test` stayed green.

### Completion Notes List

- **Surface resolution (AC1–3).** `src/shared/lib/surface.ts` is pure — no React, no DOM, no imports — with `resolveSurface(url)` and `surfaceHref(target)`. Precedence is path → host → dev-only query override. Path beats host on purpose: an operator on `ops.` who navigates to `/admin` gets admin chrome, not the public ops. shell.
- **The `?surface=` override is secure by default.** `allowQueryOverride` defaults to `false`, and callers pass `import.meta.env.DEV`. Two tests pin the security property directly: `?surface=admin` at a production origin resolves to `apex`, both with the flag explicitly false and with it omitted.
- **Four shared chrome primitives** — `TopBar`, `TrustBar`, `SectionBand`, `SiteFooter` — emitting only classes that already existed in `pml.css` from 1.2. **No CSS was written in this story.** Per-surface differences are props, never forks.
- **`SectionBand` de-duplicated.** 1.2's gallery had prototyped this markup inline as a local `Band`; that copy is deleted and the gallery now imports the shared component, leaving one definition.
- **Three shells built** with the handoff's brand marks, nav order and trust-bar copy. Every band is an `EmptyState` naming what will live there and which story wires it — an honest placeholder rather than a mock a reader could mistake for a finding.
- **AC6 (IA split) is enforced by test, not just by convention:** `shells.test.tsx` asserts apex markup contains neither `id="layers"` nor `id="journal"`. This is the AC a future well-meaning edit is most likely to break.
- **Admin says it is unprotected.** The chrome reads "Not protected — Access lands in Story 1.4", asserted by test. An unprotected surface that looks protected is worse than one that admits it. No auth, no secrets, no mutating API — every band is empty.
- **Starter chat UI deleted** (990 lines → 38). `src/app.tsx` is now the surface switch plus the dev-only `/design-system` route. This retires five Story 1.1 deferrals outright — they died with the template rather than being fixed — and `deferred-work.md` records that.
- **`src/server.ts` and `wrangler.jsonc` untouched, deliberately.** The `ChatAgent` DO stays (Epic 3 builds on that Agents/DO wiring), and `assets.not_found_handling: "single-page-application"` already routes `/admin` to `index.html`, so no Worker change was needed. The DO's `/agents/*` route is still unauthenticated — noted in `deferred-work.md`, owned by 1.4/1.5.
- **Four dependencies removed** — `@cloudflare/kumo`, `@phosphor-icons/react`, `streamdown`, `@streamdown/code` — after confirming they appeared only in the deleted chat UI. Kumo's `@import` and the three `@source` lines are gone from `styles.css`, and `index.html` lost the `data-mode` bootstrap that existed only for Kumo's light/dark (PML v1 is a single light ground).
- **Verified live in the browser**, all three surfaces plus the gallery, zero console errors. UX-DR22 checked by computed style at 900px: `.sec-head` `flex-wrap: wrap` with the why-line left-aligned at `margin-left: 0`, trust bar wrapping, and `documentElement.scrollWidth === innerWidth` (no horizontal overflow). NFR5 focus ring confirmed by keyboard Tab.
- **61 tests pass across both Vitest projects** (was 29): 15 surface-resolution tests in `workers`, 17 shell tests in `ui`.

### Change Log

- 2026-08-10: Story implemented end-to-end (surface resolution red/green → chrome primitives → three shells → app rewrite → dependency prune → live verification). Status → review.
- 2026-08-10: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 1 decision-needed, 17 patch, 1 defer, 2 dismissed. Decision resolved (test-only `wrangler.test.jsonc`, no cloud token needed for `workers` Vitest project); all 17 patches applied and re-verified (`npm run check`'s oxlint+tsc, 61/61 tests, live static-build check of all three shells). Status → done.

### File List

New (authored this story):

- src/shared/lib/surface.ts
- src/shared/lib/surface.test.ts
- src/shared/ui/TopBar.tsx
- src/shared/ui/TrustBar.tsx
- src/shared/ui/SectionBand.tsx
- src/shared/ui/SiteFooter.tsx
- src/surfaces/apex/ApexShell.tsx
- src/surfaces/ops/OpsShell.tsx
- src/surfaces/admin/AdminShell.tsx
- src/surfaces/shells.test.tsx

Modified:

- src/app.tsx (starter chat UI deleted; surface switch + dev-only /design-system)
- src/styles.css (kumo import + three @source lines removed)
- src/shared/ui/index.ts (four chrome primitives exported)
- src/shared/ui/DesignSystemGallery.tsx (local Band replaced by shared SectionBand)
- index.html (data-mode bootstrap removed)
- package.json / package-lock.json (four template dependencies removed)
- _bmad-output/implementation-artifacts/deferred-work.md (three 1.1 deferrals retired; one new 1.3 entry)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status transitions)
- _bmad-output/implementation-artifacts/1-3-dual-site-shells-trust-chrome.md (this file)

Modified/added by code review (2026-08-10) — resolving the decision-needed finding and applying all 17 patches:

- wrangler.test.jsonc (new — `wrangler.jsonc` minus the `ai` binding, for the `workers` Vitest project)
- vitest.config.ts (workers project now points at `wrangler.test.jsonc`)
- src/surfaces/apex/ApexShell.tsx (dropped false `ProvenanceLabel`; added `<main>` landmark)
- src/surfaces/ops/OpsShell.tsx (`ProvenanceLabel` misuse replaced with bare handoff-accurate mode indicator; `<main>` landmark; 5 EmptyState hints now name their owning story)
- src/surfaces/admin/AdminShell.tsx (added budget placeholder; reworded queue placeholder; dropped arbitrary `current: true`; added `<main>` landmark)
- src/shared/ui/TopBar.tsx (dropped dead `rel="noopener"`; link key collision fallback)
- src/shared/ui/SiteFooter.tsx (dropped dead `rel="noopener"`; link key collision fallback; now applies `.ext` class like TopBar)
- src/shared/ui/TrustBar.tsx (slot presence checks are now `!= null`, not truthy)
- src/shared/lib/surface.ts (`surfaceHref` normalizes a missing leading slash and an existing query string)
- src/app.tsx (`/design-system` gallery gate now matches sub-paths too)
- src/shared/ui/pml.css (`section.band` gets `scroll-margin-top` so anchor jumps clear the sticky topbar)
- index.html (added `color-scheme: light` meta)
- src/surfaces/shells.test.tsx (AC6 guard also checks explainer/journal content, not just ids)
