# Handoff: PredictionMarketLitigation (PML) — v1 surfaces

## Overview

PML is two products served by one system:

1. **Apex** (`predictionmarketlitigation.com`) — the open, data-driven source of record for U.S.
   prediction-market litigation. Answers "where does this stand?" and "is [platform] legal in [state] today?"
2. **ops.** (`ops.predictionmarketlitigation.com`) — the public Crust: transparency and governance. Run log,
   evidence detail, pending drafts in full text, approval-mode transparency, the nine-layer explainer, the build
   journal. No login.
3. **Admin** (private) — the operator's approval queue: approve / edit-then-approve / reject on pending drafts,
   plus mode controls.

The governing thesis: **the litigation is the subject; the governance is the message.** Provenance, last-updated,
disclaimers, public drafts and evidence are product UI, not footer chrome. Every published claim carries a
primary-source link and a provenance label frozen at publish time.

Positioning line used verbatim in the chrome: *Built by AI, governed and approved by a human; corrections welcome.*

---

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and
behaviour. They are **not production code to lift**. The task is to **recreate these designs in the target
codebase's environment** (React/Next, Vue, whatever exists) using its established patterns, routing, data layer
and component library. If no environment exists yet, choose the framework and implement there.

Specifically, do not ship these files as-is:

- All data is **mock data hard-coded in `<script>` blocks** at the bottom of each page (`STATES`, `CIRCUITS`,
  `CASES`, `ENTITIES`, `RUNS`, `DRAFTS`, `LAYERS`, `POSTS`). It is realistic but illustrative. Real
  implementations read from the pipeline's datastore.
- All rendering is `innerHTML` string templating. Recreate as components.
- The reader poll writes to `localStorage` only. A real deployment needs a tally endpoint.
- Links between surfaces are relative `.html` filenames. Replace with real routes.

## Fidelity

**High fidelity.** Final colours, typography, spacing, component states and interaction behaviour. Recreate
pixel-accurately using the codebase's libraries. All values derive from tokens (see *Design tokens*); do not
hard-code hexes that a token already carries.

---

## Design language

Editorial, book-like, on a soft near-white ground. Cormorant Garamond headings over Lora body. Hairline rules
carry structure. **Colour is applied as stroke, not fill** — cards are bordered and unfilled, buttons are
outlined, never solid. Photographs are matted in a `.plate` wrapper like a tipped-in book plate.

Deliberately **not** a generic AI dashboard and **not** a gambling odds board. No aggressive gradients, no
emoji, no rounded pill-heavy chrome, no heavy drop shadows (elevation is a whisper).

Two loud rules that are load-bearing for trust:

1. **Draft ≠ live.** A pending draft must be visually impossible to confuse with published tracker content
   (see `.draft` / `.draftbanner`).
2. **Empty, failed and boring states are first-class.** Empty runs, budget-stopped runs, evals-not-run,
   untracked states all get designed states. Absence of drama is not absence of evidence.

---

## Screens / views

### APEX — `PML Tracker.html`

Single long-scroll page. Section order top to bottom:

| # | Section | Anchor | Purpose |
|---|---|---|---|
| 1 | Top bar + trust bar | — | Nav, positioning line, last-updated, provenance, disclaimer |
| 2 | Credibility strip | — | Two numbered claims + founder card + repo link |
| 3 | Masthead | — | H1, bottom line, CTAs, meta list, "Latest developments" feed |
| 4 | KPI row | — | 4 figures (matters tracked, states, appeals pending, changed in 30 days) |
| 5 | **Reader poll** | `#poll` | Cert thumbs up/down + term picker |
| 6 | Executive summary | `#brief` | Plain-language explainer for non-lawyers |
| 7 | **Circuit split heat map** | `#circuits` | A1 — real US geography + circuit index, synced |
| 8 | **State status board** | `#states` | A2 — filterable/sortable table + sticky state panel |
| 9 | **Issue map** | `#issues` | Four ECharts views over the issue taxonomy |
| 10 | **Case record** | `#cases` | A3 — filterable list + case detail with docket |
| 11 | Entity ledger | `#entities` | Per-platform footprint and matter list |
| 12 | **Cert signal** | `#cert` | A4 — qualitative reading + named factors |
| 13 | Trust + correction | `#trust` | A5/A6 — disclaimers, GitHub-issue correction form |
| 14 | ops. handoff | `#ops` | Cross-link block |
| 15 | Footer | — | |

**A1 — Circuit-split heat map.** Left column (1.5fr) the map, right column (1fr) the circuit index; `gap:
var(--space-6)`; collapses to one column under 940px.

- Geometry: **real US state topology**, not a drawing. `us-atlas@3.0.1/states-10m.json` fetched with `d3.json`,
  converted with `topojson.feature(topo, topo.objects.states)`, projected with
  `d3.geoAlbersUsa().fitSize([w-24, h-24], fc)`, drawn with `d3.geoPath`. **Never freehand this geometry.**
- States are filled by posture depth (see posture ramp). Untracked states are near-white with a **dashed**
  hairline — absence must not read as a neutral finding.
- Circuit boundaries are drawn on top as solid lines, one colour per circuit, from a merged mesh of that
  circuit's member states.
- Interaction: hover → tooltip (posture, controlling case, last-updated); click → selects the state; keyboard
  focus with `tabindex=0` and Enter/Space activation, `role="button"`, `aria-label` naming state + posture.
- Selecting a circuit raises its member states to full opacity and drops the rest to 0.28.
- Selection is **shared with the status board** (A2): selecting on either cross-highlights the other.
- Legend renders before the map, always visible, colour → posture with the controlled vocabulary.
- Fallback: if the topology fetch fails, the map hides and a message explains the circuit index and the board
  carry the same postures — the map is a second reading, never the only one.

**A2 — State status board.** Table (1.5fr) + sticky detail panel (1fr, `top: 78px`).

- Columns: State (with circuit beneath), Status badge, Posture, Controlling case + citation, Updated (+ "updated"
  badge when changed within the window).
- Sortable by state, status, posture, updated (click header button; second click reverses).
- Filter chips: All / Go / Restricted / Banned.
- Detail panel answers the compliance question: status badge, posture, circuit, controlling case, updated,
  provenance label, a **per-platform breakdown table** (status differs per platform), a note explaining *why*
  the per-platform statuses differ, primary-source links, and buttons to open the case record or report an error.

**A3 — Case record.** List (1fr) + detail (1.05fr).

- Filters: free-text search, posture chips, issue-tag dropdown, state dropdown, circuit dropdown, Clear.
- Row: caption (Cormorant 18px), then a quiet metadata line — posture swatch + label, then forum in lighter grey.
- Row metadata also carries party role (Plaintiff / Defendant / Both) and lifecycle (Active / Resolved) so a
  dismissed matter does not sit at the same visual weight as a live appeal.
- Detail: caption, issue tags (first = controlling issue, rendered in accent; rest secondary), court + docket
  number, provenance, posture line with links to affected states and circuit, then a **reverse-chronological
  docket** as a hairline timeline, each event dated and source-linked. Closing note: every event links to a
  Tier-1 source; trade press is used as leads only and never as the citation of record.

**A4 — Cert signal.** Two columns. Left: the gauge — kicker, the word reading ("Elevated"), a 5-segment scale
(Remote · Low · Elevated · Likely · Near-certain), the caveat that it is not a probability and not market-derived,
provenance label + reviewed date; beneath it a **dashed reserved block** holding space for a future
market-derived probability with methodology and reflexivity caveat (explicitly not shipped in v1). Right: the
numbered factor list, each factor a bolded lead + explanation, closing with "factors are the whole method —
no weighting, no model, no score."

**A6 — Correction form.** Type dropdown, where, detail + primary source, **name and contact fields**, then a
warning block immediately above the button: this opens a public GitHub issue and everything typed — name and
contact included — is visible to anyone; both may be left blank to file anonymously. Button reads *Open a GitHub
issue*. On submit, the acknowledgment box is replaced with a tracking ID (`PML‑C‑2026‑0185`) and an explanation
that the resulting draft appears on ops. before it appears here.

**Reader poll.** Panel under the KPI row. Left: thumbs-up/thumbs-down on cert. Right: term picker (OT 2026 /
OT 2027 / OT 2028 / Later or never). Results reveal only after voting, as labelled percentage bars with the
reader's own choice in full accent. Footer disclaims: unscientific, not evidence, not a forecast, not connected
to any market, one vote per browser stored locally. **Implementation note:** replace `localStorage` with a real
tally service; keep the disclaimer copy verbatim — it is what keeps the poll from undermining the cert signal.

**Issue map (4 ECharts views).** SVG renderer, custom theme matching the tokens.
1. *Issue × posture matrix* (hero) — rows are issue tags grouped by family, columns are outcomes, tone depth is
   count. Empty outcome columns are dropped rather than left as dead space.
2. *Emergence timeline* — one mark per matter at its first docket event, coloured by current posture.
3. *Frequency strip* — stacked by posture, sorted descending.
4. *Sunburst* — family → tag → one segment per matter; leaf labels off (unreadable at ~40 segments), hover names
   the case, click opens its record.

Clicking any cell / mark / bar / segment sets the active issue: a panel names the matching matters with jump
buttons **and** the case record below filters to match with its dropdown synced. Clear resets both.

> ECharts loads from CDN without a subresource hash, unlike the pinned d3/topojson tags. If that matters for the
> deployment's threat model, vendor the bundle.

### ops. — `PML Ops.html`

- **Run log** — no login. Rows: run ID, status chip, timestamp, origin flag (scheduled / catch-up / manual), mode,
  spend, step summary, approval outcome. Must be able to display *published, awaiting-approval, empty (no material
  change), failed, budget-stopped, catch-up, manual* — all seven are designed. Schedule timezone and next-run time
  are shown publicly. Every run links to its evidence.
- **Evidence detail** — the full projected story, not a vendor-console deep link: step/tool/model/prompt versions,
  spend, evals, full draft text, lineage/provenance, approver (human name or approval-agent id+version) and mode,
  validation log for agent-approved publishes, **full before/after diff** for human edits, reject reason (public
  by default), disagreement flag + short description. Budget and eval fields render **even when zero or not-run**,
  as explicit empty states. Secrets scrubbed. Step-level status live and historical.
- **Pending drafts** — any visitor reads the full draft body, the proposed F1 diffs, flags (e.g. Tier-2-only),
  confidence/eval badge or explicit "evals not run", and links into evidence. Wrapped in `.draft` with the
  `.draftbanner` — the label *not live / awaiting approval* is mandatory and must never be subtle.
- **Mode transparency** — whether autonomous (YOLO) mode is on, the mode-change audit events with timestamp and
  public-safe operator display name, and the current auto-approve threshold.
- **Nine-layer explainer** — Earth-layer diagram (Core / Mantle / Crust), keyboard-accessible. Selecting a layer
  shows plain-language explanation, PML implementation status (shipped spine vs phase-in), and links to evidence
  concepts / journal posts. Live status hooks: gateway budget, approval-gate mode, latest run health.
  Layers: Gateway (+budget) · Guardrails · Action policy · Orchestration (+Approval Gate) · Identity/scoped
  context · Observability · Evals · Lineage/provenance · GRC.
- **Build journal** — milestone-triggered posts in the founder's first-person voice, ~1,000 words, series
  navigation by layer (L1→L9) / fault-line / bookend. Missing layer posts are acceptable. Posts attach run
  evidence. Syndicated copies elsewhere are not source of truth.

### Admin — `PML Admin.html`

Authenticated. Deliberately lighter. Approval queue over pending drafts with three actions:

- **Approve** — promotes draft to live F1; evidence records the approver.
- **Edit then approve** — preserves the original draft *and* the published version, producing the public
  before/after diff on ops.
- **Reject** — F1 unchanged; reject reason **public by default**, with a control to mark the reason (or part of
  it) private.

All actions keyboard-accessible. Mode controls (enable/disable autonomous) are restricted to the single operator
identity and are audited; default remains HITL. The public observes outcomes; only the operator acts.

---

## Interactions & behaviour

- **Synced selection** — one selected state and one selected circuit for the whole apex page. Map, circuit index,
  status board, state panel and case links all read and write it.
- **Keyboard parity** — map regions, circuit rows, filter chips, sortable headers, case rows, layer diagram and
  the admin queue actions are all reachable and operable by keyboard. Focus ring is
  `outline: 2px solid var(--color-accent); outline-offset: 2px` — never the browser default.
- **Hover** — accent-100 tint on rows and chips; accent-600 border. Selected rows get an `inset 2px 0 0
  var(--color-accent)` left marker plus the tint.
- **Tooltips** — fixed-position, hairline-bordered, `--shadow-md`, following the cursor and clamped to the
  viewport; also shown on keyboard focus, positioned at the element's centre.
- **Transitions** — minimal by design. Tooltip opacity 120ms. No entrance animations.
- **Responsive** — every two-column grid collapses to one at 940px (`.diff` at 800px, `.pgrid` at 820px). The
  trust bar wraps at 900px. The sticky state panel becomes static when stacked. Tables remain readable on mobile;
  the map keeps its aspect and stays usable.
- **Empty states** — `.empty`: dashed frame, the reason, and what it means for the reader. Never an apology.
- **Form validation** — none blocking in the correction form; all fields optional, anonymous filing supported.

## State management

Apex needs: `sel {state, circuit}`, `selCase`, `selIssue`, board `filter` + `sort {key, dir}`, case filters
(`search`, `posture`, `issue`, `state`, `circuit`), poll `{cert, term}` (persisted).

ops. needs: selected run, selected draft, selected layer, journal filter.

Admin needs: queue selection, per-draft edit buffer, action + reason state, private-portion flags.

Data the real system must supply: states with status/posture/platform breakdown/sources/updated; circuits;
cases with docket events and issue tags; entities; runs with steps, spend, evals, mode, approver; drafts with
body, diffs, flags; mode-change audit events; journal posts. All published records need a provenance label and
a publish timestamp, both frozen at publish.

---

## Design tokens

All from the Classical token sheet — `_ds/classical-.../styles.css`, included in this bundle. Never hard-code a
value the tokens carry.

**Colour roles**

| Token | Value |
|---|---|
| `--color-bg` | `#f3f2f2` |
| `--color-surface` | `#eae9e9` |
| `--color-text` | `#201f1d` |
| `--color-accent` | `#b68235` |
| `--color-divider` | `color-mix(in srgb, #201f1d 16%, transparent)` |

Neutral ramp 100→900: `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`
Accent ramp 100→900: `#fff3e4 #ffe3bf #facb8d #e1ad66 #c28d41 #a06f24 #7d5411 #5a3b0a #3a270d`

Light steps (100–300) for tinted fills and hovers, 500 as base, 700–900 for text on tints and pressed states.
Accent-to-ground is tuned to ≥3:1 — enough for icons, large text and chrome, **not** body copy; use
`--color-accent-700` for paragraph-size accent text.

**Posture ramp (a deliberate extension, documented in `PML Design System.html`)**

One axis, five steps — the darker the fill, the worse for platforms. Never carried by fill alone; always paired
with its label.

| Posture | Fill |
|---|---|
| No tracked activity | `oklch(0.96 0.004 80)` + dashed hairline |
| Decided for platform | `oklch(0.88 0.012 80)` |
| Pending — skeptical | `oklch(0.78 0.012 80)` |
| Expected / decided for state | `oklch(0.63 0.012 80)` |
| Banned | `oklch(0.42 0.012 80)` |

**Operational status badges** — semantic but muted and outlined, never traffic-light: `go` green outline,
`restricted` amber outline with a fine diagonal hatch, `banned` solid deep red. See `.badge` in `pml.css`.

**Run status chips** — `published` (accent, filled mark), `awaiting` (accent tint + hatched mark), `empty`
(hollow mark), `failed` (solid ink, inverted), `stopped`, `rejected`. Origin flags (`scheduled` / `catch-up` /
`manual`) are dashed outline tags, visually subordinate.

**Typography** — `--font-heading: "Cormorant Garamond"`, `--font-body: "Lora"`.
Headings cap at semibold (`--font-heading-weight: 600`); the larger the text the lighter it sets — display sizes
take the normal cut (H1 is `clamp(38px, 5.2vw, 62px)` at weight 400). Kicker: 11px, `letter-spacing: .16em`,
uppercase, `--color-neutral-700`. Body 13–16.5px, line-height 1.55–1.7. **Numbers set tabular**
(`font-feature-settings: "tnum"`) wherever they stand as figures or columns — kickers, tables, KPIs, dates,
charts — while running prose keeps its text figures.

**Spacing** — `--space-1..8`: `4.6 9.2 13.8 18.4 27.6 36.8` px (density 1.15×).
**Radius** — `--radius-sm/md/lg`: `2 / 4 / 7` px. **Shadows** — `--shadow-sm/md/lg`, already tuned to the ground.

## Assets

- `assets/patrick-bland.jpg` — founder portrait, matted in the `.plate` wrapper.
- Icons: **Lucide** (https://lucide.dev). The poll's thumbs are inline Lucide paths.
- Fonts: Cormorant Garamond + Lora from Google Fonts.
- Map geometry: `us-atlas@3.0.1/states-10m.json` (Natural Earth, public domain), fetched at runtime.
- Libraries: d3 7.9.0 and topojson-client 3.1.0, loaded via pinned SRI-hashed tags — **keep the pins**.
  ECharts for the issue map (unpinned; vendor it if the deployment requires SRI).

## Files

| File | Contents |
|---|---|
| `PML Tracker.html` | Apex — all 15 sections above, plus mock data and all apex logic |
| `PML Ops.html` | ops. — run log, evidence, drafts, mode transparency, nine-layer explainer, journal |
| `PML Admin.html` | Admin — approval queue and mode controls |
| `PML Design System.html` | The component reference: tokens, posture/status colour, badges, provenance, not-live draft, last-updated, tables, empty states |
| `pml.css` | The PML component layer on top of Classical — chrome, badges, provenance, draft, run chips, tables, panels, empty states, steps, diff |
| `_ds/classical-.../styles.css` | The Classical token sheet and component layer. Link first, before `pml.css` |
| `assets/` | Images used in the designs |

Start with `PML Design System.html` — it is the shortest path to the component vocabulary the other three use.
