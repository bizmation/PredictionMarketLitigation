---
workflowType: 'correct-course'
project_name: 'PML'
user_name: 'Patrick'
date: '2026-08-09'
status: 'approved'
approvedBy: 'Patrick'
approvedAt: '2026-08-09'
mode: 'batch'
trigger: 'Operator↔agent steering capability absent from locked F2/F3'
scopeClassification: 'Major (PRD amendment + new FRs) executed as Moderate (Direct Adjustment within Epic 3)'
amendments:
  - '2026-08-09 (post-approval): Steering publication timing resolved — turn-complete, immediate on submit, redaction at submit; as-you-type public streaming prohibited (FR-50, Story 3.14, UX C4/B8)'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-brief-pack.md
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-09.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
---

# Sprint Change Proposal — Operator Steering & Course Correction

**Date:** 2026-08-09
**Prepared for:** Patrick
**Review mode:** Batch
**v1 scope decision:** All four steering tiers in v1 (operator decision, 2026-08-09)

---

## Section 1 — Issue Summary

### Problem statement

The locked PRD gives the operator no way to converse with, question, or durably correct the agent fleet. Course correction today is limited to three blunt, non-conversational instruments:

| Existing mechanism | Story | What it actually does | Why it is insufficient |
|---|---|---|---|
| Edit-then-approve | 3.10 | A plain text editor buffer over the draft body | Operator retypes the fix by hand; the agent never learns what was wrong |
| Manual trigger / supersede | 3.12 | Re-runs the whole day | No targeting; same inputs produce the same defect |
| Public corrections → GitHub | 4.5 / 4.6 | Reader-facing async issue filing | Never reaches the runtime agent; not an operator instrument |

**Consequence:** if the drafter misses a Fifth Circuit matter on Monday, the operator's only remedy is to hand-write the correction into the edit buffer, and the drafter misses the same matter again on Tuesday. There is no channel to ask *why*, no channel to say *redo it with this*, and no mechanism by which today's correction improves tomorrow's run. The system is auditable but not teachable.

### Issue type

**New requirement emerged from stakeholder** (operator, 2026-08-09), surfaced while reviewing agent-control and telemetry design ahead of pre-launch communications.

### Evidence

- Grep of PRD + architecture for `chat|steer|course.correct|instruct|refine|dialog` returns **zero** operator-steering hits. The single match ([architecture.md:708](architecture.md:708)) is the reader-facing FR-45 corrections→GitHub path.
- UX Brief Pack §6.C lists exactly three admin capabilities: C1 action queue, C2 mode controls, C3 provenance. No conversational surface.
- Readiness report coverage matrix maps FR-14/15 to Story 3.10 as fully covered — correct against the PRD as written, which is precisely the gap: the requirement was never expressed, so no coverage check could catch it.
- **Latent asset at risk:** the committed scaffold already contains a working `ChatAgent` (`AIChatAgent`, streaming, tool-call approval, task scheduling) at [src/server.ts:14](../../src/server.ts:14). Story 1.2 is currently scoped to replace the starter UI, and [deferred-work.md](../implementation-artifacts/deferred-work.md) classifies the chat surface as disposable template. **Absent this proposal, the next story in flight deletes the exact primitive now required.**

---

## Section 2 — Impact Analysis

### 2.1 Checklist results (Change Navigation Checklist)

**Section 1 — Trigger and context**
- 1.1 Triggering story — [x] Done. No single failing story; gap identified during design review. Nearest anchor: Story 3.10.
- 1.2 Core problem defined — [x] Done. New requirement (see §1).
- 1.3 Evidence gathered — [x] Done. See §1 Evidence.

**Section 2 — Epic impact**
- 2.1 Epic 3 completable as planned? — [!] Action-needed. Epic 3's own goal statement ("Patrick can run the daily harness") is satisfiable, but the epic cannot deliver operator steering without new stories.
- 2.2 Epic-level change required — [x] Done. **Modify existing epic scope**; no new epic. Steering is inseparable from the gate and Evidence machinery already in Epic 3; a separate epic would fragment the write-path and Evidence contracts.
- 2.3 Remaining epics reviewed — [x] Done. Epic 1 affected (Story 1.2 must preserve the chat surface). Epic 2 unaffected. Epic 4 unaffected — FR-45 reader corrections remain a distinct, reader-facing path and must not be conflated with operator steering.
- 2.4 Epics invalidated / new epics needed — [N/A]. None invalidated, none needed.
- 2.5 Order / priority change — [!] Action-needed. Story 1.2 must be amended **before** it is developed (currently `in-progress` / `ready-for-dev`). New Epic 3 stories sequence after 3.10/3.11.

**Section 3 — Artifact conflict**
- 3.1 PRD conflicts — [!] Action-needed. F2/F3/F4 are LOCKED; requires additive amendment (new feature F9, FR-46–FR-50). No existing FR is contradicted. MVP grows.
- 3.2 Architecture conflicts — [!] Action-needed. Agent role table, event vocabulary, D1 schema, write-path rules, project structure all require additive updates. **No architectural decision is reversed** — the steward agent composes onto existing Agents SDK + AI Gateway + Approval Gate patterns.
- 3.3 UI/UX conflicts — [!] Action-needed. Two new screens (admin steering panel, public steering projection). One non-goal in §8 needs a clarifying note.
- 3.4 Other artifacts — [!] Action-needed. Testing strategy gains adversarial cases; `deferred-work.md` entry must be retracted.

**Section 4 — Path forward**
- 4.1 Direct Adjustment — [x] **Viable.** Effort: High. Risk: Medium.
- 4.2 Rollback — [x] Not viable / unnecessary. Only Story 1.1 is done; nothing to revert. One forward-looking amendment to 1.2 replaces any rollback.
- 4.3 MVP review — [x] Viable but **not selected**. Operator elected all four tiers in v1 (see §3 rationale and §5 risk).
- 4.4 Selected path — **Option 1: Direct Adjustment**, with additive PRD amendment.

### 2.2 Epic impact summary

| Epic | Impact | Detail |
|---|---|---|
| Epic 1 | **1 story amended** | 1.2 must preserve/harden `ChatAgent` rather than delete it |
| Epic 2 | None | — |
| Epic 3 | **5 stories added, 5 amended** | 13 → 18 stories |
| Epic 4 | None | FR-45 reader path stays separate by design |

### 2.3 Artifact conflict summary

| Artifact | Change required |
|---|---|
| PRD | New feature **F9**, new **FR-46 … FR-50**; F2/F3/F4 gain cross-references (bodies unchanged) |
| Epics | Requirements inventory + FR coverage map + Epic 3 story list |
| Architecture | Agent role table, role→model config, event vocabulary, D1 schema, write-path rules, project tree, gap list |
| UX Brief Pack | New screens C4 + B8; §7 principle 9; §8 non-goal clarification; §9 journey 6 |
| sprint-status.yaml | 5 new story entries |
| deferred-work.md | Retract the "leave with template UI until 1.2 replacement" chat-surface entry |

### 2.4 Technical impact

- **New agent role** `steward` — the conversational operator-facing agent. Separate from `drafter`/`reviewer` so its model binding *and* its tool permissions are independently bounded.
- **New D1 tables** — `steering_turns`, `standing_guidance`, `pipeline_config_versions`.
- **Action policy surface expands.** This is the material security change: an authenticated, natural-language, tool-bearing channel into the agent fleet is a new privileged input path. It must be bounded by the same L4 action policy as everything else, and it must not become a route to publish.
- **Evidence projector expands** to render steering turns, revision lineage, config changes, and standing guidance.

---

## Section 3 — Recommended Approach

**Selected: Option 1 — Direct Adjustment**, delivered as an additive PRD amendment plus five new Epic 3 stories and five amendments.

### Rationale

1. **Nothing to unwind.** Only Story 1.1 is `done`. The single at-risk decision (deleting the chat surface in 1.2) is caught before it executes — this proposal converts a would-be rollback into a one-line scope amendment.
2. **Additive, not contradictory.** No existing FR is reversed. The keystone invariant — *only the Approval Gate writes live F1* — is not merely preserved but load-bearing for the new design.
3. **The showcase thesis improves.** "Watch me argue with my own agent, in public, and watch it get better" is a materially stronger governance demo than a static approve/reject queue. It converts the ops. surface from an audit log into a demonstration of governed collaboration.
4. **Reuses committed infrastructure.** `AIChatAgent` with tool-approval semantics is already in the repo and already on the locked platform.

### The governance boundary (normative — this is the core of the proposal)

An operator steering channel is a **new privileged input path into the agent fleet**. Three containment rules are non-negotiable and are written into FR-50 and Story 3.14 as testable acceptance criteria:

> **R1 — No privileged publish.** The steward agent holds no live-F1 publish tool under any circumstance. Operator authority reaches live content only through the Approval Gate. A conversation must never be able to talk the agent past the gate; if it can, the entire control model reduces to "Patrick knows the magic words."
>
> **R2 — No invisible causation.** Every steering turn that influences a draft, a config value, or standing guidance emits an Evidence event and is projected on `ops.` A public reader must never observe a draft change shape with no visible cause. A side channel that steers without receipts is worse than no side channel, because it silently falsifies the transparency claim the whole product rests on.
>
> **R3 — Governance controls are not chat-reachable.** The YOLO auto-approve threshold, the per-Run budget ceiling, Autonomous mode enablement, the guardrail rule set, and the action-policy allowlist itself **cannot** be modified through conversation. They remain explicit, separately-audited admin form actions (Stories 3.2, 3.13). Chat may *read* and *explain* them. Otherwise Tier 3 becomes a natural-language backdoor around L3/L4.

R3 is the rule most likely to be eroded by convenience during implementation. It should be enforced by an allowlist in code, not by prompt instruction.

### Effort, risk, timeline

| Dimension | Assessment |
|---|---|
| Effort | **High.** 5 new stories, 5 amendments; Epic 3 grows 13 → 18 (+38%) |
| Technical risk | **Medium.** Tiers 1–2 are low risk (reuse committed primitives, draft-scoped writes). Tiers 3–4 are the risk concentration: config mutation and durable memory both widen the trust boundary |
| Timeline | Epic 3 is the longest epic and has not started. Expect meaningful launch delay |
| Governance risk if done well | **Net positive** — steering becomes the showcase's most differentiated asset |
| Governance risk if done badly | **High** — an unprojected steering channel invalidates the FR-13/FR-24 transparency claim outright |

### Scope caution (recorded, not blocking)

You elected all four tiers in v1 against a recommendation to phase 3–4. Recording the tradeoff plainly:

- Tier 4 (standing guidance) drags FR-23 authorized-context work with it — memory becomes authorized context and must be versioned, publicly inspectable, and revocable. That is real work, not a flag.
- Tiers 1–2 deliver the daily operational relief; tiers 3–4 deliver the showcase differentiation. If launch date pressure arrives, **3.17 and 3.18 are the correct cut line** and the FRs are drafted so they can be re-marked `[phase-in]` without touching 3.14–3.16.

---

## Section 4 — Detailed Change Proposals

### 4.1 PRD — new feature section F9

**File:** `_bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md`
**Insert:** after §5.8 (F8), before §6

> ### 5.9 F9 — Operator Steering & Course Correction
>
> **Description:** An authenticated conversational channel between the operator and the agent fleet, enabling the operator to interrogate a Draft's reasoning, revise a Draft by instruction, steer pipeline configuration, and record standing guidance that improves future Runs. Steering is a *drafting-side* capability: it never bypasses the Approval Gate and never reaches live F1 except through it. Every steering turn that influences output is public Evidence — the channel is governed and projected, not a private back office.
>
> **Relationship to locked features:** F9 extends F2 (pipeline configuration), F3 (operator surface) and F4 (L4 action policy, L6 authorized context, L7 observability, L8 lineage). It contradicts no locked requirement. F9 is distinct from FR-37/FR-45 reader corrections, which remain a public, moderated, non-runtime path.

**FR-46: Draft interrogation `[v1]`**
The operator can question a pending Draft conversationally and receive grounded answers about its basis.

*Consequences (testable):*
- Operator can ask why a field diff was proposed, which sources were weighed, what was skipped and why, and how the confidence/eval band was derived.
- Answers cite the Run's own Evidence records; the steward states "not recorded" rather than reconstructing plausible reasoning after the fact.
- Interrogation performs **no writes** to Drafts, config, or live F1.
- Interrogation turns are Evidence-projected per FR-50.

**FR-47: Conversational Draft revision `[v1]`**
The operator can instruct the agent to revise a pending Draft in natural language; the agent regenerates the Draft.

*Consequences (testable):*
- A revision instruction produces a new Draft version scoped to the same Run ID (no duplicate Draft set, FR-22).
- The **original agent Draft, every intermediate revision, and the final approved text** are all preserved and publicly diffable on `ops.` (extends FR-14's before/after requirement to N revisions).
- Revision writes to Drafts only. Publish remains exclusively the Approval Gate path (FR-21).
- A revised Draft re-enters guardrails and reviewer evaluation before it is approvable; revision cannot be used to route around a failed guardrail (FR-20).
- A revised Draft's confidence/eval badge is recomputed, never inherited.

**FR-48: Conversational pipeline steering `[v1]`**
The operator can modify source and pipeline configuration by instruction — adding a docket to Tier-1, adjusting escalation categories, changing monitoring scope.

*Consequences (testable):*
- Config changes are versioned, attributed, timestamped, and revertible; prior versions are retained.
- Each change writes an audited ops event visible on `ops.` (parity with the FR-16 mode-change audit and the architecture's role→model audit rule).
- **Out of reach of conversation (enforced as action policy, not prompt):** YOLO auto-approve threshold, per-Run budget ceiling, Autonomous mode enablement, guardrail rule set, action-policy allowlist. Chat may read and explain these; only explicit admin form actions may change them.
- Config changes take effect on the next Run and are attributable in that Run's lineage.

**FR-49: Standing corrections and durable guidance `[v1]`**
Operator corrections accumulate into durable guidance that agents consult on future Runs.

*Consequences (testable):*
- The operator can promote a correction to standing guidance, and can list, edit, and revoke every standing item.
- Standing guidance is **authorized context under FR-23** — versioned, attributable in lineage, and publicly readable on `ops.`
- A Run's Evidence states which standing guidance items were in force and which influenced a Draft.
- Guidance is advisory to drafting only. It cannot grant tool permissions, alter action policy, or change approval bounds.
- Guidance is capped and reviewable so it cannot grow into an unbounded, unauditable prompt.

**FR-50: Steering transparency and containment `[v1]`**
The steering channel is itself governed, bounded, and publicly projected.

*Consequences (testable):*
- Steering turns are public on `ops.` **by default**, attached to the Run and Draft they touched.
- **Publication timing (RESOLVED 2026-08-09):** turns publish at **turn completion, immediately** — on submit, with no operator publish step, no review queue, and no curation gap. Token-level / as-you-type streaming to the public surface is **prohibited**: the operator is a licensed attorney and mid-composition legal reasoning about named parties would publish unreviewed party characterizations, which FR-17 requires be escalated for review, not broadcast. Turn-complete publication preserves the unedited-transcript property the transparency thesis depends on while keeping the redaction decision (below) meaningful.
- Mirroring FR-14's reject-reason precedent, the operator may mark a specific turn (or portion) **private** — the decision is made **at submit, before the turn is published**, since post-hoc redaction of an already-public turn is not achievable against scrapers and archives. The *existence* of the private turn, its timestamp, and its effect on the Draft remain public. Redaction of content is permitted; concealment of causation is not.
- The steward agent operates under a scoped identity with **no live-F1 publish tool** (FR-21, FR-23).
- Prompt-injected content in a Draft or source under discussion cannot escalate steward permissions — demonstrated by adversarial fixture test (parity with FR-20 / readiness note G1).
- Steering is available only to the authenticated operator identity; the public observes, never steers.
- Steering spend is attributed to the Run and counts against the budget envelope (FR-19).

**Numbering note:** F9 sits in the feature namespace (F1–F9) and is unrelated to the nine governance layers (L1–L9). Flagged for the explainer copy in Epic 4 to avoid reader confusion.

---

### 4.2 PRD — cross-references into locked features

Bodies unchanged; each gains one line. LOCKED status preserved.

| Section | Added line |
|---|---|
| §5.2 F2 | *Cross-ref: pipeline configuration may also be steered conversationally per F9 / FR-48, within F9 containment bounds.* |
| §5.3 F3 | *Cross-ref: operator course correction is extended by F9 / FR-46–47. The Approval Gate remains the sole path to live F1 regardless of steering.* |
| §5.4 F4 | *Cross-ref: the steering channel is an L4 action-policy surface and an L6 authorized-context surface; see FR-49–50.* |
| §5.5 F5 | *Cross-ref: `ops.` projects steering turns per FR-50.* |

---

### 4.3 Epics — requirements inventory

**File:** `_bmad-output/planning-artifacts/epics.md`
**Insert:** after FR45, before `### NonFunctional Requirements`

> #### Operator steering functional requirements (added 2026-08-09 — sprint change proposal)
>
> FR46: Draft interrogation — conversational, grounded, read-only questioning of a pending Draft's basis; cites Run Evidence; "not recorded" over reconstruction. `[v1]`
>
> FR47: Conversational Draft revision — natural-language revision instructions regenerate the Draft under the same Run ID; original + all revisions preserved and publicly diffable; revised Drafts re-run guardrails and eval; writes Drafts only. `[v1]`
>
> FR48: Conversational pipeline steering — versioned, audited, revertible source/pipeline config changes by instruction; YOLO threshold, budget ceiling, mode, guardrails, and action-policy allowlist explicitly NOT chat-reachable. `[v1]`
>
> FR49: Standing corrections / durable guidance — promote corrections to versioned, revocable, publicly readable standing guidance; authorized context under FR23; advisory to drafting only; capped and reviewable. `[v1]`
>
> FR50: Steering transparency & containment — turns public by default, published at turn completion immediately (no as-you-type streaming, no publish step, no curation gap); redaction decided at submit; private-marking hides content but never causation; scoped steward identity with no publish tool; injection-resistant; operator-only; spend attributed to Run budget. `[v1]`

**FR Coverage Map** — append:

| FR | Description | Coverage | Status |
|---|---|---|---|
| FR-46 | Draft interrogation | Epic 3 → Story 3.15 | ✓ Covered |
| FR-47 | Conversational revision | Epic 3 → Story 3.16 | ✓ Covered |
| FR-48 | Pipeline steering | Epic 3 → Story 3.17 | ✓ Covered |
| FR-49 | Standing guidance | Epic 3 → Story 3.18 | ✓ Covered |
| FR-50 | Steering transparency & containment | Epic 3 → Stories 3.14 (channel + policy), 3.8 (projection) | ✓ Covered |

---

### 4.4 Epics — five new Epic 3 stories

#### Story 3.14: Steering Channel Foundation, Action Policy & Evidence

As the operator (and public auditors),
I want an Access-gated conversational channel to the agent fleet that is bounded by action policy and projected as Evidence,
So that steering exists without opening an ungoverned back door into the loop.

**Depends on:** 3.2 (role→model), 3.6 (action policy, scoped identity), 3.10 (admin surface)

**Acceptance Criteria:**

**Given** Access-protected admin (1.4) and the enforcement layer (3.6)
**When** the operator opens the steering channel on a Run or Draft
**Then** a `steward` agent role exists in the versioned role→model config with its own model binding (FR-48, extends 3.2)
**And** the steward agent holds **no live-F1 publish tool**, verified by an explicit test asserting the tool is absent from its resolved allowlist (FR-50 R1, FR-21)
**And** governance controls — YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, action-policy allowlist — are **not** mutable through the channel, enforced by a code-level allowlist rather than prompt instruction, verified by test (FR-50 R3, FR-48)
**And** every steering turn writes a `steering_turns` row and emits Evidence events (`steering.turn`, `steering.applied`) bound to Run and Draft IDs (FR-50 R2)
**And** turns publish to `ops.` at **turn completion, immediately on submit** — no operator publish step and no review queue; the public projection endpoint never exposes partial or in-composition turn content, asserted by test (FR-50 publication timing)
**And** the private/redact decision is captured **at submit**, before publication; a turn cannot be retroactively privatized once published (the UI states this plainly rather than offering a control that cannot deliver)
**And** an adversarial fixture test demonstrates that prompt-injected content inside a Draft or source under discussion cannot expand steward tool permissions (FR-50, parity with 3.6/G1)
**And** unauthenticated identities cannot open or post to the channel; the public reads projections only
**And** steering LLM spend is attributed to the Run and counts against the budget envelope (FR-19)
**And** Vitest coverage exists for: publish-tool absence, governance-control immutability, injection containment, and Evidence emission

#### Story 3.15: Draft Interrogation (Read-Only)

As the operator,
I want to ask a pending Draft why it says what it says,
So that I can evaluate it against its actual basis instead of my assumptions.

**Depends on:** 3.14, 3.8 (Evidence detail), 3.9 (pending Drafts)

**Acceptance Criteria:**

**Given** a Draft awaiting approval and the steering channel (3.14)
**When** the operator asks about the Draft's basis
**Then** the steward answers grounded in that Run's Evidence: proposed diffs, sources consulted and skipped with reasons, tier labels, guardrail outcomes, confidence/eval derivation, drafter-vs-reviewer disagreement when present (FR-46)
**And** where Evidence does not record an answer, the steward says so explicitly rather than reconstructing plausible reasoning post hoc
**And** interrogation performs zero writes to Drafts, config, standing guidance, or live F1 — asserted by test
**And** interrogation turns appear in the public projection attached to the Draft (FR-50)
**And** the operator can interrogate from the approval queue without losing queue position or keyboard context (UX-DR20 parity)

#### Story 3.16: Conversational Draft Revision

As the operator,
I want to correct a Draft by telling the agent what is wrong,
So that I stop retyping fixes the agent could make itself.

**Depends on:** 3.15, 3.11 (diff + publish machinery), 3.5 (drafter/reviewer)

**Acceptance Criteria:**

**Given** a pending Draft under interrogation (3.15)
**When** the operator issues a revision instruction
**Then** the drafter regenerates the Draft under the **same Run ID**, producing a new Draft version without creating a conflicting duplicate Draft set (FR-47, FR-22)
**And** the original agent Draft and every intermediate revision are preserved and rendered as a public revision chain on `ops.` (FR-47, extends FR-14 to N versions)
**And** the revised Draft re-enters guardrails and reviewer evaluation before becoming approvable; a hard guardrail failure cannot be bypassed by revising (FR-20)
**And** the confidence/eval badge is recomputed for the revised Draft, never inherited from the prior version
**And** revision writes only to Drafts; live F1 remains unchanged until an Approval Gate publish (FR-21)
**And** approval after revision records the full lineage: original → revisions → instruction that caused each → approved text (FR-25)
**And** Vitest coverage exists for: same-Run-ID revision, revision-chain preservation, guardrail re-entry, and badge recomputation

#### Story 3.17: Conversational Pipeline Steering

As the operator,
I want to change what the pipeline watches and escalates by instruction,
So that routine tuning does not require a redeploy (NFR8).

**Depends on:** 3.14, 3.4 (source monitoring), 3.12 (loop controls)

**Acceptance Criteria:**

**Given** the steering channel (3.14) and source config (3.4)
**When** the operator instructs a config change — add a docket to Tier-1, adjust an escalation category, change monitoring scope
**Then** the change writes a new version row in `pipeline_config_versions` with actor, timestamp, prior value, new value (FR-48)
**And** the operator can list versions and revert to any prior version
**And** each change emits an audited ops event publicly visible on `ops.` (parity with FR-16 mode audit)
**And** attempts to change YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, or the action-policy allowlist through the channel are **refused and the refusal is logged on public Evidence** (FR-50 R3)
**And** config changes take effect on the next Run and are attributable in that Run's lineage (FR-25)
**And** routine steering requires no redeploy (NFR8)

#### Story 3.18: Standing Corrections & Durable Guidance

As the operator,
I want my corrections to persist so the agent stops repeating the same mistake,
So that the loop improves rather than merely being supervised.

**Depends on:** 3.16, 3.17, 3.6 (FR-23 authorized context)

**Acceptance Criteria:**

**Given** revision (3.16) and steering (3.17) in place
**When** the operator promotes a correction to standing guidance
**Then** the item is stored versioned and attributed in `standing_guidance`, and can be listed, edited, and revoked (FR-49)
**And** standing guidance is treated as **authorized context under FR-23** and is publicly readable on `ops.`
**And** each Run's Evidence states which guidance items were in force, and which influenced a given Draft (FR-25)
**And** guidance is advisory to drafting only: it cannot grant tool permissions, alter action policy, or change approval bounds — asserted by test (FR-49, FR-50 R3)
**And** total guidance is capped with a defined limit and a review affordance, so it cannot grow into an unbounded unauditable prompt
**And** a regression fixture demonstrates the documented case: a correction recorded on Run N changes drafter behavior on Run N+1
**And** revoking guidance removes its influence on the next Run and is itself an audited public event

---

### 4.5 Epics — five amended stories

**Story 1.2 — Design Tokens & Core Trust Components** *(currently `in-progress` / `ready-for-dev` — amend before dev)*

> OLD (implied scope): replace starter UI wholesale, including the Agent Starter chat surface.
>
> NEW: add AC — *The scaffold's `ChatAgent` server class and chat transport are **preserved**, not deleted; only starter branding, demo tools (weather/calculator/MCP add-remove), and template copy are removed. The chat surface is retained as the foundation for the operator steering channel (Story 3.14) and must be left unreachable by unauthenticated users pending Story 1.4.*
>
> Rationale: prevents deleting the required primitive. Retracts the `deferred-work.md` chat-surface entry.

**Story 3.1 — Run, Draft & Evidence Data Model**

> Add AC: *Migrations also create `steering_turns` (run_id, draft_id, actor, role, content, private flag, created_at), `standing_guidance` (version, content, status, actor, created_at, revoked_at), and `pipeline_config_versions` (version, key, prior_value, new_value, actor, created_at). Draft records support a revision chain (parent_draft_id / revision_index) per FR-47.*

**Story 3.2 — AI Gateway, Budget Envelope & Role→Model Config**

> Add AC: *Role→model config includes a fourth+ role `steward` alongside orchestrator/drafter/reviewer/yolo. Steering-channel LLM spend is attributed to the associated Run and counts against its budget ceiling (FR-19, FR-50).*

**Story 3.6 — Guardrails, Action Policy & Scoped Context**

> Add AC: *Action policy covers the steering channel as a first-class privileged input path: the `steward` identity resolves to an allowlist that excludes any live-F1 publish tool and excludes mutation of YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, and the allowlist itself. Enforcement is code-level, not prompt-level, and is covered by test (FR-50 R1/R3).*

**Story 3.8 — Evidence Detail Projection**

> Add AC: *Evidence detail renders the steering record: turns attached to the Run/Draft they touched, the Draft revision chain with the instruction that caused each revision, config-change events, and standing-guidance items in force. Privately-marked turn content is redacted while timestamp, actor, and effect-on-Draft remain visible — content may be withheld, causation may not (FR-50 R2).*

**Story 3.10 — Admin HITL Approval Queue**

> Add AC: *The approval queue exposes the steering panel inline on the selected Draft, preserving keyboard navigation (J/K/A/E/R) with an added binding to open steering. Conversational revision (3.16) and the manual edit buffer coexist; the operator may use either.*

---

### 4.6 Architecture updates

**File:** `_bmad-output/planning-artifacts/architecture.md`

1. **Agent roles table (§Multi-Agent Orchestration, ~L215)** — add row:

   | `steward` | Operator-facing interrogation, revision instruction, config steering, guidance capture | Required configurable model; **no publish tool**; governance-control mutation denied at policy layer |

2. **Role→model JSON example (~L229)** — add `"steward": { "provider": "openrouter", "model": "anthropic/claude-sonnet-4" }`

3. **Orchestration diagram (~L204)** — add the steering loop:

   ```text
        → waitForApproval (HITL) OR YOLO agent [model: roles.yolo]
             ↕ steward agent [model: roles.steward]   ← operator steering
               (interrogate / revise draft / steer config / record guidance)
               writes: drafts, config, guidance, steering_turns + Evidence
               never:  live F1 publish, governance-control mutation
        → approvalGate.publish → live F1   (never an agent-direct tool)
   ```

4. **Event vocabulary (~L355)** — add `steering.turn`, `steering.applied`, `steering.denied`, `draft.revised`, `config.steered`, `guidance.recorded`, `guidance.revoked`

5. **Write-path rules (~L381)** — add: *The steward agent may write Drafts, pipeline config, and standing guidance. It may never write live F1 and may never mutate governance controls (YOLO threshold, budget ceiling, mode, guardrail rules, action-policy allowlist). Publish remains exclusively the Approval Gate module.*

6. **Enforcement guidelines (~L390)** — add: *Steering turns that influence output MUST emit Evidence. A steering path that mutates a Draft without a projected event is a defect, not an optimization.*

7. **Project structure (~L473)** — add `src/pipeline/agents/StewardAgent.ts`, `src/pipeline/steering/` (policy + config versioning), `src/surfaces/admin/SteeringPanel.tsx`, `src/surfaces/ops/SteeringLog.tsx`

8. **Gap list (~L622)** — add two: *(6) standing-guidance cap value and review cadence; (7) steward model pin at launch.*

9. **Amendments frontmatter** — add: `'2026-08-09: Added operator steering channel (F9 / FR-46–50) — steward agent role, steering Evidence projection, containment rules R1–R3'`

---

### 4.7 UX Brief Pack updates

**File:** `_bmad-output/planning-artifacts/ux-brief-pack.md`

**New §6.C4 — Operator steering panel `[v1]` — FR-46–49**
Authenticated conversational panel on the selected Draft inside the approval queue. Must preserve queue keyboard parity (J/K/A/E/R plus a steering binding). Shows the Draft revision chain with the instruction that caused each revision. Refusals (governance controls out of reach) render as calm, explanatory states — not errors.

**Publication model to design against (resolved 2026-08-09):** the composer is private; **submit is publication**. Each completed turn goes public on `ops.` immediately, with no publish step and no review queue. The design problem this creates is the *submit moment* — it is simultaneously "send to agent" and "publish to the world under my name," and the panel must make that unmistakable without making the operator hesitant to steer. The per-turn private/redact control belongs **in the composer, adjacent to submit** — not in a post-hoc turn menu, since redaction after publication is unachievable. Design the composer so a lawyer can think in it and the transcript can still be honest.

**New §6.B8 — Public steering projection `[v1]` — FR-50**
No-login view of steering turns attached to their Run and Draft. Renders the revision chain original → revisions → approved. Turns appear as they are submitted (turn-granular, not token-streamed); a live Run's steering view may poll. Privately-marked content shows a redaction placeholder that still displays timestamp, actor, and the effect on the Draft. Needs a designed empty state: most Runs will have no steering at all, and "nobody had to intervene" must read as a healthy, first-class state rather than missing data.

**§7 Interaction principles** — add principle 9: *Steering is public. Any surface where the operator instructs the agent must make the public-by-default nature of that instruction visible at the moment of typing, not merely in a policy page.*

**§8 Non-goals** — clarifying note under "Rich inter-agent disagreement explorer": *Operator↔agent steering (F9) IS in v1 scope as of 2026-08-09. The excluded item remains the rich agent-vs-agent disagreement explorer, which is unrelated.*

**§9 Journeys** — add journey 6: *Course correction — operator opens a flawed pending Draft → interrogates its basis → issues a revision instruction → reviews the regenerated Draft and its recomputed badge → approves → promotes the underlying correction to standing guidance → confirms on the next Run that the mistake did not recur.*

---

### 4.8 Secondary artifacts

- **`deferred-work.md`** — retract: *"Starter HTML still titled 'Agent Starter'… leave with template UI until 1.2 replacement"* as it applies to the chat surface. Replace with: *Chat surface retained per Sprint Change Proposal 2026-08-09; branding and demo tools still to be stripped in 1.2; auth hardening owned by 1.4.*
- **Testing strategy** — three new adversarial classes: publish-tool absence, governance-control immutability under natural-language pressure, and injection containment via Draft/source content discussed in-channel.
- **`sprint-status.yaml`** — five new entries (see §5.3).

---

## Section 5 — Implementation Handoff

### 5.1 Scope classification

**Major in nature, Moderate in execution.** The change amends a LOCKED PRD and adds five FRs — formally Major. But because only Story 1.1 is `done` and no contradicted decision must be unwound, execution is Direct Adjustment within the existing epic structure. No replan is required.

### 5.2 Handoff

| Recipient | Responsibility |
|---|---|
| **Product Manager (PM)** | Apply §4.1–4.2: insert F9 + FR-46–50 into the PRD, add cross-references, preserve LOCKED status on F2/F3/F4 |
| **Solution Architect** | Apply §4.6: steward role, event vocabulary, schema additions, write-path and enforcement rules, project tree, gap list, amendments frontmatter |
| **UX Designer** | Apply §4.7: screens C4 + B8, principle 9, non-goal note, journey 6. Priority design problems: the public-by-default typing indicator, and the "no steering was needed" empty state |
| **Product Owner / Dev** | Apply §4.3–4.5 and §4.8: epics inventory, coverage map, 5 new stories, 5 amendments, sprint-status entries, deferred-work retraction |
| **Dev (immediate)** | **Amend Story 1.2 before development proceeds** — it is the only time-sensitive item |

### 5.3 sprint-status.yaml additions

```yaml
  3-14-steering-channel-foundation-action-policy-evidence: backlog
  3-15-draft-interrogation-read-only: backlog
  3-16-conversational-draft-revision: backlog
  3-17-conversational-pipeline-steering: backlog
  3-18-standing-corrections-durable-guidance: backlog
```

### 5.4 Sequencing

```
1.2 (amend now — blocks nothing else, but deletes the primitive if unamended)
  → 3.1, 3.2, 3.6 (amended: schema, steward role, action policy)
    → 3.10, 3.11 (queue + publish machinery)
      → 3.14 (channel foundation + containment)
        → 3.15 (interrogate)
          → 3.16 (revise)
            → 3.17 (steer config)
              → 3.18 (standing guidance)
        → 3.8 (amended: projection — can proceed in parallel after 3.14)
```

### 5.5 Success criteria

1. The operator can question a Draft, correct it by instruction, and see the correction persist into the next Run.
2. A public reader can reconstruct every steering intervention and its effect from `ops.` alone, with no vendor console and no login.
3. Automated tests prove the steward agent cannot publish, cannot alter governance controls, and cannot be talked past either bound by injected or adversarial content.
4. No Draft ever changes shape on `ops.` without a visible cause.
5. Routine steering requires no redeploy (NFR8).

### 5.6 Open decisions (non-blocking; resolve during implementation)

1. **Standing-guidance cap** — item count and/or token ceiling, plus review cadence (Story 3.18).
2. ~~**Private-marking default**~~ — **RESOLVED 2026-08-09 (Patrick):** turn-complete, published immediately on submit, redaction decided at submit. No as-you-type public streaming; no draft-then-publish queue. Rationale recorded in FR-50 and §6.C4. UX design on the steering panel is unblocked.
3. **Steward model pin** — likely the strongest available reasoning model; it argues with a lawyer about case law.
4. **Revision chain depth** — whether to cap revisions per Draft to keep the public chain readable.

---

## Approval

- [x] **Approved** — approved as written by Patrick, 2026-08-09. Routed to PM / Architect / UX / PO per §5.2.
- [ ] **Approved with conditions:** ________________
- [ ] **Revise** — feedback: ________________

*Prepared 2026-08-09 under the Correct Course workflow. Checklist sections 1–6 complete. `sprint-status.yaml` updated with Stories 3.14–3.18 per checklist item 6.4.*

**Post-approval amendment — 2026-08-09:** Open decision §5.6(2) resolved by Patrick. Steering turns publish at turn completion, immediately on submit; redaction decided at submit; as-you-type public streaming prohibited. Applied to FR-50, epics FR50 line, Story 3.14 ACs, and UX §6.C4 / §6.B8. No other section affected; approval stands.
