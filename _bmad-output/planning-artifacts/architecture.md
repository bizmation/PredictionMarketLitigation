---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md
  - _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/reconcile-brief.md
  - _bmad-output/planning-artifacts/briefs/brief-PML-2026-06-17/brief.md
  - docs/research/U.S. Prediction Markets Case Law & Regulatory Survey (Through June 2026).md
  - docs/research/prediction_markets_case_law_survey_FINAL.md
  - docs/research/aug926-prediction_markets_case_law_survey.md
workflowType: 'architecture'
project_name: 'PML'
user_name: 'Patrick'
date: '2026-08-09'
lastStep: 8
status: 'complete'
completedAt: '2026-08-09'
updated: '2026-08-09'
amendments:
  - '2026-08-09: Locked multi-agent orchestration + OpenRouter role→model routing via AI Gateway'
  - '2026-08-09 (post-epics sync): UX-promoted scope deltas — ECharts issue map, poll tally endpoint, moderated corrections→GitHub Issues API (supersedes "no deep integration"), long-scroll apex with URL-param deep links, journal content in D1, Vitest mandate storied (see §Post-Epics Amendments)'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **F1 Litigation Intelligence (FR-1–FR-7):** Public interactive tracker — circuit-split heat map, state status board (go/restricted/banned), case records as single source of truth, qualitative cert signal; timeline/player/regulatory trackers phase-in. All views last-updated + Tier-1 linked; drafts never mutate live F1.
- **F2 Daily Pipeline (FR-8–FR-13):** 365 scheduled Runs (noon ET target); Tier-1 + Tier-2 monitoring; change detection → Drafts; empty Runs required; catch-up/manual origins; operator loop controls; every Run publicly inspectable.
- **F3 Approval Gate (FR-14–FR-18):** HITL default; optional Autonomous/YOLO with policy bounds + public threshold; full pending Draft text public on `ops.`; provenance labels (human-/agent-approved); reject reasons public by default.
- **F4 Governance Spine (FR-19–FR-26):** Gateway+budget, guardrails, action policy, durable orchestration, scoped identity/context, observability+evals, lineage, thin GRC export — enforceable Mantle, not full 9-layer maturity at launch.
- **F5–F7 on `ops.` (FR-27–FR-35):** Public run log + full Evidence projection, disagreement flag, mode transparency; interactive 9-layer explainer; milestone build journal with Evidence links.
- **F8 Trust & OSS (FR-36–FR-39):** Disclaimers, corrections (main + `ops.`), public repo, donations at launch; ads phase-in.

**Non-Functional Requirements:**
- Reliability/cadence: daily attempt; gaps visible; catch-up supplements
- Public observability: `ops.` is SoR for Evidence; secrets scrubbed
- Accuracy/trust: Tier-1 citation or pending-primary label; HITL default; YOLO escalations for posture flips / party characterization / Tier-2-only / eval-fail
- Performance: interactive maps/tables usable desktop+mobile (budgets TBD in architecture)
- Accessibility: best-effort WCAG 2.2 AA v1
- Security: operator auth for actions/mode; Draft bodies public but labeled not-live
- Cost: hard per-Run budget; budget-stopped is first-class public status
- Loop harnessability: schedule / trigger / inspect / approve without redeploy for routine ops

**Scale & Complexity:**
- Primary domain: full-stack public web + governed agent orchestration + public evidence projection
- Complexity level: high (dual public surfaces, durable multi-step Runs, policy-gated autonomy, legal-content risk)
- Estimated architectural components: ~10–12 major (apex site, `ops.` site, admin/auth, content/data store, draft/approval service, run orchestrator, source connectors, gateway/budget, guardrails/evals, evidence projector, lineage, journal/CMS-light)

### Technical Constraints & Dependencies

- **Harness criterion (LOCKED):** prefer showcase-native managed agent harness — shortlist Cloudflare Agents (+ Workflows HITL / Think) vs Amazon Bedrock AgentCore Harness; framework-only cron stacks secondary
- **Data ToS:** no Kalshi/Robinhood market data for AI features in v1
- **Legal posture:** general legal information only; UPL/defamation drive HITL + citation rules
- **IA split (LOCKED):** apex = F1 litigation product; `ops.` = Evidence, explainer, journal; admin private
- **Python legal tooling friction:** architecture must prove CourtListener/heavy research path on or beside the chosen harness
- **Solo + out-of-pocket:** budget caps and thin spine are hard constraints
- **Seed content:** June + Aug 9 case-law surveys as initial F1 corpus; landscape still volatile (no circuit merits yet; cert clock extended) — validates daily empty-Run + change-detection design

### Cross-Cutting Concerns Identified

- Publish idempotency and supersede semantics
- Run durability across HITL interrupts (same Run ID)
- Evidence projection completeness vs secret scrubbing
- Source Tier labeling and auto-approve ineligibility
- Dual-site linking and consistent provenance UI
- Controlled vocabularies (posture, operational status, legal track, Run origin/status)
- Domain-agnostic engine vs PML-specific content models (reusable pattern thesis)

## Starter Template Evaluation

### Primary Technology Domain

Full-stack **Cloudflare Workers** platform: public dual-site web (apex + `ops.`) + showcase-native agent harness (Agents SDK / Think + Workflows HITL) + AI Gateway governance spine.

### Platform Decision: Cloudflare vs Amazon Bedrock AgentCore

**LOCKED (2026-08-09): Cloudflare.**

| Criterion (PRD) | Cloudflare | Bedrock AgentCore Harness | Winner for PML |
|---|---|---|---|
| Showcase-native harness (criterion A) | Agents SDK + Think + Workflows; CF OS (OSS Aug 5) Gatekeepers / observation logs as narrative reference | Managed Harness GA — microVM, skills, gateway, CloudWatch GenAI | Tie on “harness product”; **CF** on open/public story |
| F3 durable HITL | Native `waitForApproval` / `approveWorkflow` / `rejectWorkflow` | Compose (inline tools, Strands hooks, Step Functions callbacks) | **Cloudflare** |
| F4 gateway + budget | AI Gateway (logs, rate limits, multi-provider, unified billing path) | AgentCore Gateway (RPS/TPM/connection limits, policies) | Tie (both viable) |
| F5 public Evidence SoR | Same Workers plane hosts `ops.`; project from app store (D1/DO) | CloudWatch private — mandatory projection glue | **Cloudflare** |
| Dual sites + admin auth | Workers + custom domains + Access | Amplify/CloudFront + IAM/Cognito + AgentCore | **Cloudflare** |
| Solo surface area | One vendor for sites, agents, cron, DNS, Access | Split hosting + harness + observability + IAM | **Cloudflare** |
| Python / CourtListener | TS REST primary; Containers/Sandbox beside harness for heavy jobs | BYO container microVM stronger for heavy Python day-1 | AWS (secondary for v1) |
| Lock-in / thesis risk | Mitigate by owning Evidence schema + Approval Gate + Gatekeeper-like policy in *our* repo; CF OS = reference not black box | Managed Harness can swallow the story (“AWS did governance”) | **Cloudflare** (fits PRD risk row) |

**Rationale:** PML is a public, dual-site, HITL-gated daily harness with receipts. Cloudflare is the only shortlist option where harness primitives and the public product share one ownership boundary. AWS AgentCore remains the better “managed agent appliance” if heavy Python isolation or Bedrock-first enterprise signaling ever dominates — not v1.

**Explicit non-goals of this lock:** Deploying full Cloudflare OS as the product UI is optional/reference; v1 builds PML’s own apex + `ops.` on Agents/Workflows/AI Gateway patterns inspired by CF OS (Gatekeepers, observation logs), not a fork of the OS shell unless later chosen.

### Starter Options Considered

1. **`cloudflare/agents-starter`** — Agents SDK + React/Vite client, Durable Objects + SQLite, Workers AI, HITL-oriented tool approval, scheduling hooks. Best first story for F2–F5 showcase.
2. **`create-cloudflare --framework=react`** — React SPA + Worker API only; agent harness bolted on later. Weaker for criterion A day-1.
3. **`@aws/agentcore` harness create** — Rejected with platform lock; retained as rejected alternative for decision history.
4. **Next.js / OpenNext on Cloudflare** — Deferred; interactive F1 maps/tables do not require Next SSR for v1; SPA + Workers is enough; revisit if programmatic SEO becomes primary.

### Selected Starter: Cloudflare Agents Starter

**Rationale for Selection:** Aligns first implementation commit with the locked showcase harness; ships TypeScript + React + Vite + Agents/DO foundation that Workflows HITL, AI Gateway, and dual-site routing can compose onto.

**Initialization Command:**

```bash
npm create cloudflare@latest -- pml --template cloudflare/agents-starter
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript on Cloudflare Workers / workerd
- Agents SDK Durable Object agent class(es) with SQLite-backed DO storage
- `nodejs_compat` + current Wrangler compatibility date at scaffold time

**Styling Solution:**
- Starter includes Tailwind-oriented agent UI styles (replace/extend for PML brand; not a design-system lock)

**Build Tooling:**
- Vite + `@cloudflare/vite-plugin` + `agents/vite` (decorator support)
- Wrangler for local dev / deploy

**Testing Framework:**
- Minimal/none from starter — add Vitest (+ Workflows vitest patterns) in early stories

**Code Organization:**
- `src/server.ts` (agent) + React client entry; evolve into monorepo/workspaces shape for apex vs `ops.` vs pipeline as architecture patterns solidify

**Development Experience:**
- `npm run dev` via Wrangler remote proxy where Workers AI / bindings require auth
- Hot reload for client; Worker reload via Vite Cloudflare plugin

**Note:** Project initialization using this command should be the first implementation story. Immediate follow-on stories: Think/AgentWorkflows HITL Approval Gate, AI Gateway binding, noon-ET schedule, apex + `ops.` routes/domains, Access-protected admin actions.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Platform: Cloudflare (Agents + Workflows + AI Gateway) — locked in Starter Evaluation
- Data: D1 (canonical public/query) + Durable Objects/Agents (in-flight Run/HITL)
- Auth: Cloudflare Access for operator actions; Worker secrets for agents/cron; no agent-direct publish
- Control plane: AgentWorkflow with `waitForApproval` for F3; cron/Workflow schedules for daily Run
- **Multi-agent + model routing (LOCKED):** Orchestrator Workflow dispatches role-specialist agents; each role has a configurable model (OpenRouter via AI Gateway); reviewer/eval uses a separately configured model; full operator control over role→model map; CF OS is not the orchestrator

**Important Decisions (Shape Architecture):**
- API: REST/JSON + Zod shared contracts
- Frontend: single React+Vite app; apex + `ops.` via custom domains; Access-gated `/admin`
- Maps: lightweight SVG/TopoJSON (no Mapbox required for v1)
- CI/CD: Workers Builds + Wrangler environments (dev/staging/production, separate D1s)
- Observability split: private CF/AI Gateway logs vs public Evidence projection on `ops.`

**Deferred Decisions (Post-MVP):**
- Cloudflare Queues — add when source fan-out / 429 pacing / DLQ triggers fire
- KV read-through cache — until public heat-map/status traffic needs it
- Hyperdrive/Postgres — if D1 limits become real
- Next.js / OpenNext — if programmatic SEO becomes primary
- Full Cloudflare OS deploy — patterns/reference only for v1 (Gatekeepers optional later)
- Terraform/Pulumi — Wrangler-first for solo
- R2 — export bundles / large artifacts when thin L9 needs object storage

### Data Architecture

- **Canonical store:** Cloudflare D1 (SQLite) for F1 entities (cases, states, circuits, cert signal), pending/public Drafts, Evidence/run log rows, journal metadata
- **In-flight state:** Durable Objects via Agents SDK for Run orchestration, step status, HITL wait coordination
- **Validation:** Zod (current latest verified: **4.4.3** at decision time) — shared schemas for API + Draft diffs + Evidence
- **Migrations:** Wrangler D1 migrations from day 1
- **Cache:** KV deferred
- **Objects:** R2 deferred for GRC export bundles / large artifacts
- **Provided by starter:** DO SQLite for agent memory; D1 is an explicit add-on binding

### Authentication & Security

- **Operator auth:** Cloudflare Access (Zero Trust) in front of `/admin` and mutating gate APIs
- **Agent/cron identity:** Worker secrets + AI Gateway credentials; not user sessions
- **Action policy:** Publish to live F1 only via Approval Gate path; agents must not hold a direct “mutate published F1” tool
- **Public by design:** Full pending Draft bodies on `ops.`, labeled not-live
- **Scrubbing:** Secrets/credentials never in Evidence projection; reject-reason private mark = field-level redaction
- **Reader accounts:** None in v1 (PRD A7)

### API & Communication Patterns

- **Public + operator HTTP:** REST/JSON on Worker routes
- **Contracts:** Zod schemas as source of truth (OpenAPI optional later)
- **Errors:** Structured `{ code, message, details? }`; no secret/stack leakage on public routes
- **Model traffic:** All LLM calls via AI Gateway (budget/logging front door); **OpenRouter is a required supported provider** (see Multi-Agent section)
- **Internal:** Agents SDK Workflow/RPC / sub-agents; D1 bindings
- **Queues:** Deferred — Workflow `step.do` retries cover v1 ingest; revisit on fan-out/429/DLQ triggers
- **Rate limiting:** CF edge rules for public GETs; Access for admin; AI Gateway for spend

### Multi-Agent Orchestration & Model Routing (LOCKED — design criterion)

**Requirement:** The platform must support multiple agents per Run, each bound to a configurable model, with an orchestrator that dispatches work and a reviewer that evaluates drafts — under full operator control of which models power which roles. Cloudflare OS is **not** used to orchestrate this; **Agents SDK + Workflows** are.

**Orchestration pattern (per daily Run):**

```text
Cron / schedule
  → DailyRunWorkflow (orchestrator — durable steps; may use light/no LLM)
       → connectors (Tier-1 / Tier-2; mostly non-LLM)
       → Drafter agent(s)     [model: roles.drafter]
       → Reviewer / eval agent [model: roles.reviewer]
       → package Drafts + Evidence (+ disagreement flag if drafter≠reviewer)
       → waitForApproval (HITL) OR YOLO agent [model: roles.yolo]
       → approvalGate.publish → live F1   (never an agent-direct tool)
```

**Agent roles (minimum v1):**

| Role | Responsibility | Model binding |
|---|---|---|
| `orchestrator` | Workflow control, dispatch, assemble Run package | Optional light model or none |
| `drafter` | Material-change → Draft field diffs + citations | Required configurable model |
| `reviewer` | Confidence/eval, citation completeness, escalate categories | Required configurable model (may differ from drafter) |
| `yolo` | Autonomous approve within policy bounds only | Required when Autonomous mode enabled |

**Model routing (design criterion):**
- Single code path: `pipeline/ai/gateway.ts` — agents call `gateway.complete({ role, … })` only
- **OpenRouter** supported via AI Gateway provider endpoint (`…/openrouter/…`) as the primary multi-model router; other AI Gateway providers allowed as secondary
- Versioned **role→model config** (stored in D1 and/or ops config; visible on `ops.`):

```json
{
  "version": 1,
  "roles": {
    "orchestrator": { "provider": "openrouter", "model": "openai/gpt-5-mini" },
    "drafter":      { "provider": "openrouter", "model": "anthropic/claude-sonnet-4" },
    "reviewer":     { "provider": "openrouter", "model": "openai/gpt-5" },
    "yolo":         { "provider": "openrouter", "model": "anthropic/claude-sonnet-4" }
  }
}
```

- Changing role→model is an audited ops event (who/when/old/new), mirrored on Evidence / mode transparency surfaces
- Every LLM call records `role`, `provider`, `model`, tokens/spend on the public Evidence projection
- No agent hardcodes a provider SDK or model ID

**Cloudflare OS vs Agents SDK (normative for implementers):**
- **Agents SDK (+ Think + Workflows):** runtime that runs PML’s orchestrator, specialists, HITL waits, scheduling — **required**
- **Cloudflare OS:** open-source agent *workspace* product (Gatekeepers, observation logs, employee UI) — **optional reference only**; do not deploy as PML’s control plane

### Frontend Architecture

- **App shape:** One React + Vite codebase (from agents-starter), multi-surface routing
- **Domains:** apex = F1; `ops.` subdomain = Evidence/explainer/journal; `/admin` Access-gated
- **State:** URL/search-param driven filters for map↔table sync; server state via REST
- **Maps:** SVG/TopoJSON choropleth for circuits/states
- **Live Runs:** Poll Evidence/step status; optional light Agent WebSocket later
- **Testing add-on:** Vitest (current latest verified: **4.1.10** stable) in early stories

### Infrastructure & Deployment

- **Runtime:** Cloudflare Workers + Assets + Agents + Workflows
- **Domains:** `predictionmarketlitigation.com` + `ops.predictionmarketlitigation.com`
- **CI/CD:** Workers Builds (GitHub) → production; Wrangler envs for dev/staging/prod with separate D1 databases
- **Schedule:** Workflow schedules or Cron Trigger → daily Run (noon ET expressed in UTC)
- **Operator observability:** Workers Observability + AI Gateway (private)
- **Public observability:** D1-backed Evidence projection on `ops.` (SoR for trust thesis)
- **IaC:** Wrangler-first; Terraform deferred

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold agents-starter + D1 + Wrangler envs
2. Domain routing (apex / `ops.` / admin) + Access
3. Schema + Zod contracts + seed from case-law surveys
4. AI Gateway helper + OpenRouter + role→model config schema
5. Daily Run Workflow + multi-agent dispatch (drafter/reviewer) + empty-Run Evidence
6. Approval Gate (HITL) + public pending Drafts + YOLO policy agent slot
7. F1 interactive views reading approved D1 state
8. `ops.` run log + Evidence detail + mode/model-config transparency
9. Explainer + journal (content can lag)

**Cross-Component Dependencies:**
- Approval Gate is the only bridge from Drafts → live F1 (auth + action policy + D1 writes)
- Evidence projector depends on Workflow step events + per-role model/spend + scrubbing rules
- Frontend map/table sync depends on shared posture/status enums in Zod/D1
- YOLO mode depends on versioned threshold **and** `roles.yolo` model config visible on `ops.`
- Disagreement flag depends on drafter vs reviewer outputs in the same Run

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
8 areas where AI agents could diverge: DB naming, API paths/JSON shape, file/component naming, project layout, response/error envelopes, date/enum formats, Run/Evidence event naming, gate write rules / loading UX.

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case`, plural — `cases`, `states`, `runs`, `drafts`, `evidence_events`
- Columns: `snake_case` — `case_id`, `created_at`, `operational_status`
- PKs: `id` (text ULID/UUID) unless natural key justified
- FKs: `<entity>_id` — `case_id`, `run_id`
- Indexes: `idx_<table>_<cols>` — `idx_runs_started_at`
- Enums in DB: store PRD glossary strings exactly — `go` | `restricted` | `banned`; Run origin `scheduled` | `catch-up` | `manual`

**API Naming Conventions:**
- Paths: plural REST — `/api/cases`, `/api/states`, `/api/runs/:runId`, `/api/drafts/:draftId`
- Admin mutations: `/api/admin/drafts/:draftId/approve` (Access-gated)
- Query params: `camelCase` — `?legalTrack=cea-preemption&status=banned`
- No trailing slash

**Code Naming Conventions:**
- React components: `PascalCase` files — `CircuitHeatMap.tsx`
- Functions/vars: `camelCase` — `getRunEvidence`
- Types/Zod schemas: `PascalCase` + `Schema` suffix — `RunSchema`, `DraftDiff`
- Workers/Durable Object classes: `PascalCase` — `DailyRunWorkflow`, `ApprovalGateAgent`
- Glossary terms in code match PRD: `Draft`, `Run`, `Evidence`, `ApprovalGate`, `posture`, `operationalStatus`

### Structure Patterns

**Project Organization:**
- Feature/surface-first under `src/`:
  - `src/surfaces/apex/` — F1 UI
  - `src/surfaces/ops/` — Evidence, explainer, journal
  - `src/surfaces/admin/` — gate actions UI
  - `src/pipeline/` — Workflows, agents, connectors, projector
  - `src/shared/` — Zod schemas, UI primitives, lib
- Co-locate tests as `*.test.ts(x)` next to source (Vitest)
- D1 SQL migrations in `migrations/` (Wrangler default)
- No separate packages until a real split pain appears

**File Structure Patterns:**
- `wrangler.jsonc` at repo root; env overrides via Wrangler environments
- Secrets only via Wrangler/Secrets Store — never `.env` committed
- Static assets via Vite/Workers assets conventions from starter
- Docs/planning stay in `_bmad-output/` — not mixed into `src/`

### Format Patterns

**API Response Formats:**
- Success resource: direct JSON body (no `{ data: ... }` wrapper) for single resources
- Success list: `{ items: T[], nextCursor?: string }`
- Error: `{ code: string, message: string, details?: unknown }` with appropriate HTTP status
- Booleans: JSON `true`/`false`; DB may use INTEGER 0/1 with Zod coerce at boundary

**Data Exchange Formats:**
- External JSON: `camelCase`
- DB: `snake_case`; map in repository/query layer via Zod or explicit mappers — never leak snake_case to public API
- Dates/times: ISO 8601 UTC strings with `Z` — `2026-08-09T16:00:00.000Z`
- Money/spend: integer **cents** (or smallest currency unit) + currency code field; never float dollars in API
- Null: prefer explicit `null` for PRD-required empty states (e.g. evals not run)

### Communication Patterns

**Event System Patterns (Evidence / workflow progress):**
- Step/event names: `dot.case` lowercase — `run.started`, `source.fetched`, `draft.created`, `gate.awaiting_approval`, `gate.approved`, `run.budget_stopped`
- Payload: `{ type, at, runId, ... }` validated by Zod
- Public Evidence is append-oriented projection rows, not raw CF log dump

**State Management Patterns:**
- URL search params are source of truth for shareable F1 filters/selection
- Server state via REST fetch; no global Redux
- Immutable updates in React state; D1 writes only through gate/pipeline modules

### Process Patterns

**Error Handling Patterns:**
- Boundary: map exceptions → `{ code, message }` at Worker route edge
- Public vs operator: same shape; operator may get extra `details`
- User-facing copy: calm, non-legal-advice; never expose secrets/model keys
- Pipeline failures: mark Run status explicitly (`failed` | `budget-stopped`); never silent skip

**Loading State Patterns:**
- Name: `status: 'idle' | 'loading' | 'success' | 'error'`
- Lists: show last good data + subtle refreshing indicator when polling Runs
- Gate actions: disable submit while in-flight; idempotent server-side approve

**Write-path rules (mandatory):**
- Only Approval Gate module persists published F1 mutations
- Agents/connectors write Drafts + Evidence stubs only
- Supersede/publish requires explicit flag + Evidence event

### Enforcement Guidelines

**All AI Agents MUST:**
- Use PRD glossary terms and controlled vocabularies verbatim
- Keep JSON camelCase / DB snake_case boundary intact
- Route all LLM calls through AI Gateway helpers via `gateway.complete({ role })` (no ad-hoc provider SDKs or hardcoded model IDs in agents)
- Resolve models only from versioned role→model config (OpenRouter-capable)
- Put UI in the correct `surfaces/*` folder; pipeline code in `src/pipeline/`
- Refuse agent tools that publish live F1 directly
- Add/update Zod schemas when adding API fields

**Pattern Enforcement:**
- PR review / agent checklist against this section
- Shared schemas in `src/shared/schemas` are canonical
- Violations fixed in-place; pattern changes only via architecture doc update

### Pattern Examples

**Good Examples:**
- `GET /api/runs?origin=scheduled` → `{ items: [...], nextCursor: "..." }`
- D1 `operational_status` → API `operationalStatus: "banned"`
- Evidence event `{ type: "gate.awaiting_approval", at: "...Z", runId: "..." }`

**Anti-Patterns:**
- `{ data: { run: ... }, success: true }` wrapper (unless migrating — don’t introduce)
- Agent calling `UPDATE cases SET posture=...` directly
- `createdAt: 1723123456` unix numbers in public JSON
- Mixing `ops` UI into `apex` feature folders
- Ad-hoc `fetch('https://api.openai.com')` bypassing AI Gateway

## Project Structure & Boundaries

### Complete Project Directory Structure

```
predictionmarketlitigation/
├── README.md
├── package.json
├── wrangler.jsonc
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .env.example                 # non-secret placeholders only
├── migrations/                  # D1 SQL migrations
│   └── 0001_init.sql
├── public/                      # static assets (maps topojson, icons)
│   └── geo/
│       ├── us-states.json
│       └── us-circuits.json
├── src/
│   ├── client.tsx               # React entry
│   ├── app.tsx                  # root router (host-aware apex vs ops)
│   ├── worker/
│   │   ├── index.ts             # Worker fetch router + cron/schedule hooks
│   │   └── env.d.ts             # Env bindings types
│   ├── surfaces/
│   │   ├── apex/
│   │   │   ├── pages/
│   │   │   │   ├── HomePage.tsx
│   │   │   │   ├── StateDetailPage.tsx
│   │   │   │   └── CaseDetailPage.tsx
│   │   │   ├── components/
│   │   │   │   ├── CircuitHeatMap.tsx
│   │   │   │   ├── StateStatusBoard.tsx
│   │   │   │   ├── CaseList.tsx
│   │   │   │   └── CertSignal.tsx
│   │   │   └── hooks/
│   │   │       └── useTrackerFilters.ts
│   │   ├── ops/
│   │   │   ├── pages/
│   │   │   │   ├── RunLogPage.tsx
│   │   │   │   ├── RunDetailPage.tsx
│   │   │   │   ├── LayersExplainerPage.tsx
│   │   │   │   └── JournalPage.tsx
│   │   │   └── components/
│   │   │       ├── EvidenceTimeline.tsx
│   │   │       ├── PendingDraftCard.tsx
│   │   │       └── ModeBanner.tsx
│   │   └── admin/
│   │       ├── pages/
│   │       │   └── ApprovalQueuePage.tsx
│   │       └── components/
│   │           ├── DraftEditor.tsx
│   │           └── ModeToggle.tsx
│   ├── pipeline/
│   │   ├── agents/
│   │   │   ├── DrafterAgent.ts
│   │   │   ├── ReviewerAgent.ts
│   │   │   └── YoloApprovalAgent.ts
│   │   ├── workflows/
│   │   │   └── DailyRunWorkflow.ts  # orchestrator (dispatch + HITL wait)
│   │   ├── gate/
│   │   │   ├── approvalGate.ts      # sole F1 publish path
│   │   │   └── yoloPolicy.ts
│   │   ├── connectors/
│   │   │   ├── courtlistener.ts
│   │   │   ├── federalRegister.ts
│   │   │   └── tier2News.ts
│   │   ├── projector/
│   │   │   └── evidenceProjector.ts # scrub + write Evidence rows
│   │   ├── config/
│   │   │   └── modelRoles.ts        # role→model config load/validate
│   │   └── ai/
│   │       └── gateway.ts           # AI Gateway + OpenRouter only entry
│   ├── shared/
│   │   ├── schemas/                 # Zod canonical contracts
│   │   │   ├── run.ts
│   │   │   ├── draft.ts
│   │   │   ├── case.ts
│   │   │   ├── state.ts
│   │   │   └── evidence.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── repos/
│   │   │       ├── casesRepo.ts
│   │   │       ├── runsRepo.ts
│   │   │       └── draftsRepo.ts
│   │   ├── api/
│   │   │   ├── errors.ts
│   │   │   └── respond.ts
│   │   ├── lib/
│   │   │   ├── dates.ts
│   │   │   └── ids.ts
│   │   └── ui/
│   └── styles.css
└── _bmad-output/                  # planning artifacts (existing)
```

### Architectural Boundaries

**API Boundaries:**
- Public GETs under `/api/*` (cases, states, runs, drafts, journal)
- Mutating gate under `/api/admin/*` — Cloudflare Access only
- No direct browser → D1; all via Worker routes / repos

**Component Boundaries:**
- `surfaces/apex` must not import `surfaces/ops` internals (link across hosts/paths only)
- `surfaces/*` may import `shared/*` only — never `pipeline/*` (except admin calling admin APIs)
- `pipeline/*` must not import React surface components

**Service Boundaries:**
- `pipeline/gate/approvalGate.ts` — only module that publishes live F1
- `pipeline/ai/gateway.ts` — only module that calls LLMs
- `pipeline/projector` — only module that writes public Evidence projection

**Data Boundaries:**
- D1 = canonical published + public query store
- DO/Agent = in-flight Run state only; project out to D1 for `ops.`
- Connectors read external Tier-1/Tier-2; never write F1 directly

### Requirements to Structure Mapping

**Feature Mapping:**
- F1 FR-1–4 → `surfaces/apex` + `shared/schemas` + `shared/db/repos`
- F2 FR-8–13 → `pipeline/workflows`, `pipeline/connectors`, `pipeline/agents` (drafter/reviewer)
- F3 FR-14–18 → `pipeline/gate` + `YoloApprovalAgent` + `surfaces/admin` + public drafts on `ops`
- F4 FR-19–26 → `pipeline/ai/gateway`, `pipeline/config/modelRoles`, `pipeline/projector`, Workflow/Agent wiring
- F5–F7 → `surfaces/ops`
- F8 → shared chrome in `surfaces/apex` + `surfaces/ops` (disclaimers, correction links)

**Cross-Cutting Concerns:**
- Auth: Access at Worker edge for `/admin` and `/api/admin/*`
- Zod contracts: `src/shared/schemas`
- Trust furniture: shared UI helpers + page shells

### Integration Points

**Internal Communication:**
- Cron/schedule → `DailyRunWorkflow` → connectors → Drafts/Evidence in D1 → `waitForApproval` → `approvalGate` publish
- React surfaces → REST `/api/*` only

**External Integrations:**
- CourtListener, Federal Register, Tier-2 sources via `pipeline/connectors`
- LLM providers via AI Gateway only
- GitHub issues link for corrections (no deep integration v1)

**Data Flow:**
Sources → connectors → Draft + Evidence events → (public on `ops.`) → Gate approve/edit/reject → F1 tables → apex UI

### File Organization Patterns

**Configuration Files:** `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts` at root  
**Source Organization:** surface/pipeline/shared as above  
**Test Organization:** co-located `*.test.ts(x)`  
**Asset Organization:** `public/geo` for map topologies  

### Development Workflow Integration

**Development:** `npm run dev` (Vite + Cloudflare plugin); Access bypass/dev stub for local admin  
**Build:** Vite build → Workers assets; Wrangler deploy  
**Deployment:** Workers Builds on GitHub; envs `dev` / `staging` / `production` with separate D1 databases; custom domains apex + `ops.`

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
Cloudflare Workers + Agents/Workflows + D1 + AI Gateway + Access form one coherent plane. No AWS/CF hybrid. Starter (`agents-starter`) matches harness lock. Queues/KV/R2 correctly deferred without leaving F2–F5 holes.

**Pattern Consistency:**
snake_case DB / camelCase JSON boundary, REST shapes, glossary enums, and sole-publish-via-gate rules align with dual-store (D1 + DO) and public Evidence thesis.

**Structure Alignment:**
`surfaces/{apex,ops,admin}` + `pipeline/{workflows,gate,connectors,projector,ai}` + `shared/schemas` enforce boundaries agents need; FR→folder mapping is explicit.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
No epics yet; F1–F8 fully placed in structure mapping.

**Functional Requirements Coverage:**
- F1: apex + D1 repos + geo assets
- F2: DailyRunWorkflow + connectors + schedule
- F3: gate + admin + public drafts on ops
- F4: AI Gateway + OpenRouter + per-role models + projector + Workflow HITL + action policy (no agent publish)
- F5–F7: ops surfaces (incl. model-config / mode transparency)
- F8: shared trust chrome + GitHub corrections link
- Multi-agent design criterion: orchestrator → drafter → reviewer → gate (locked amendment 2026-08-09)

**Non-Functional Requirements Coverage:**
- Cadence/reliability: Workflow schedule + explicit Run statuses
- Public observability: Evidence projector + ops UI (vendor console not SoR); per-call role/model/spend
- Security: Access + secrets + scrubbing
- Cost: AI Gateway budget front door; budget-stopped status
- Accessibility/perf: best-effort AA + interactive maps; hard p95 budgets deferred (PRD A8) — not a blocker for scaffold

### Implementation Readiness Validation ✅

**Decision Completeness:**
Platform, data, auth, API, frontend, infra documented; Zod 4.4.3 / Vitest 4.1.10 verified at decision time; init command specified.

**Structure Completeness:**
Concrete tree with gate/projector/gateway singleton modules and migration path.

**Pattern Completeness:**
Naming, formats, events, write-path rules, anti-patterns covered.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (non-blocking; resolve in early stories/config):**
1. Numeric YOLO auto-approve threshold value (PRD requires existence + public visibility)
2. Eval scoring implementation details inside ReviewerAgent (vs explicit “evals not run”)
3. Cloudflare Access IdP (Google vs GitHub vs one-time PIN)
4. Exact UTC cron expression for noon ET (DST handling)
5. Initial production role→model pin set (which OpenRouter model IDs at launch)

**Nice-to-Have Gaps:**
- Host-based routing helper details in `worker/index.ts`
- Seed script path for case-law surveys → D1
- Optional Agent WebSocket for live Run steps
- CF OS Gatekeeper wrappers for individual connectors (later)

### Validation Issues Addressed

No critical issues. Important gaps deferred to implementation stories / ops config rather than reopening platform decisions.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high

**Key Strengths:**
- Showcase harness and public product share one Cloudflare ownership boundary
- HITL Approval Gate is a first-class Workflow primitive
- Multi-agent drafter/reviewer with per-role OpenRouter models via AI Gateway
- Hard write-path boundary prevents agent/F1 corruption
- Glossary-anchored schemas reduce agent drift

**Areas for Future Enhancement:**
- Queues when ingest fan-out hurts
- KV cache for hot map payloads
- R2 for L9 export bundles
- CF OS Gatekeeper patterns as optional deep reference (not a v1 dependency)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
```bash
npm create cloudflare@latest -- pml --template cloudflare/agents-starter
```
Then: D1 + migrations, dual-domain routing, AI Gateway helper, DailyRunWorkflow stub with empty-Run Evidence.

## Post-Epics Amendments (2026-08-09)

Recorded after the UX design handoff and `epics.md` promoted additional v1 scope (FR40–FR45) and the implementation-readiness check (see `implementation-readiness-report-2026-08-09.md`, warning W1) found this document one amendment behind. These deltas are **normative** and extend — never contradict — the locked platform decisions above, except where explicitly superseded.

### Scope deltas from UX promotion (FR40–FR45)

- **Issue map charts (FR42):** ECharts (SVG renderer, custom token-derived theme) for the four issue-taxonomy views. d3 + topojson (pinned SRI) remains the rule for US geography; ECharts is chart-only. Vendor the ECharts bundle if the deployment requires SRI (no unpinned CDN in production).
- **Reader poll tally (FR44):** new public endpoint (e.g. `POST /api/poll/votes`, `GET /api/poll/results`) backed by a D1 `poll_votes` table (migration in Story 2.9). One-vote-per-browser via cookie/fingerprint basics; no reader accounts (PRD A7). localStorage is prototype-only.
- **Moderated corrections → GitHub issue (FR45) — supersedes "GitHub issues link for corrections (no deep integration v1)":** correction/feedback forms write a durable pending submission to a D1 `submissions` table (migration in Story 4.5) and return a tracking ID (`PML-C-…`). An Access-gated admin moderation queue approves (GitHub Issues API creates the issue in the public repo via GitHub App or scoped PAT with `issues:write`, held in Worker secrets; issue URL/number stored on the submission) or rejects (no issue). Resolution marking links gate-published fixes back to the submission (FR-37 lineage consequence).
- **Apex orientation chrome + entity ledger + rich case filters (FR40/41/43):** no new architectural components — served by the existing D1 repos + REST endpoints; KPI figures derive from aggregate queries, not hard-coded values.

### Frontend routing clarification

- **v1 apex is a single long-scroll page** (per design handoff section order), not the separate `StateDetailPage.tsx` / `CaseDetailPage.tsx` routes sketched in the directory tree. Selected state/case/issue are **URL-param deep-linkable** (e.g. `?state=NJ`) per the URL-driven state rule, preserving FR-2's standalone-surface consequence. Dedicated per-state SEO pages remain the phase-in path (revisit Next/OpenNext note only then).

### Storage decision closed

- **Journal content (F7):** post metadata **and markdown body** stored in D1, rendered by the app. No build-time markdown pipeline in v1.

### Testing mandate storied

- The "add Vitest in early stories" intent is now enforced in `epics.md`: Vitest setup in Story 1.1; required coverage ACs on Run lifecycle (3.3), enforcement-layer injection/allowlist fixtures (3.6), and gate write-path/idempotent publish (3.11). CI/CD + dev/staging/prod environments + custom domains are Story 1.5.
