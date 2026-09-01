import { z } from "zod";

/**
 * Controlled vocabularies — the canonical definition, for D1 and the UI alike.
 *
 * Architecture is explicit that `src/shared/schemas` is canonical
 * (#Enforcement-Guidelines) and that DB enums "store PRD glossary strings
 * exactly" (#Naming-Patterns). These strings therefore appear verbatim in three
 * places — the D1 column, the JSON on the wire, and the CSS class the UI
 * renders — and must stay one definition rather than three that drift.
 *
 * Story 1.2 shipped these as hand-written union types inside the UI components
 * that render them. Story 2.1 inverts that: the schema owns the values and the
 * components import from here. Two definitions of `Posture` that can disagree
 * is a data-integrity bug waiting for the first migration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THING TO GET RIGHT: `banned` IS IN BOTH VOCABULARIES.
 *
 *   posture.banned            → the litigation came out against platforms
 *   operationalStatus.banned  → a platform cannot operate there today
 *
 * They are INDEPENDENT AXES on the same `states` row. A state is routinely
 * operationally `restricted` while its posture is `pending` — that is the
 * normal condition of an unsettled docket, not an edge case. Modelling them as
 * one column, or reusing one enum for both, silently destroys the distinction
 * the apex product exists to show, and `banned` is precisely the value that
 * makes the mistake survive a spot check.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Posture ramp — one axis, five steps, darker = worse for platforms.
 *
 * Order is the RAMP order, not alphabetical: legends, swatches and the heat map
 * read it as a scale. `untracked` leads because absence of a finding is the
 * start of the ramp, not a midpoint — UX-DR2 renders it near-white with a
 * dashed edge so it can never be mistaken for a neutral finding.
 */
export const POSTURE_VALUES = [
  "untracked",
  "platform",
  "pending",
  "state",
  "banned"
] as const;

export const PostureSchema = z.enum(POSTURE_VALUES);
export type Posture = z.infer<typeof PostureSchema>;

/**
 * Operational status — "is [platform] legal in [state] today?".
 *
 * PRD glossary values, stored verbatim in D1. Do not prettify, title-case, or
 * abbreviate: the UI renders the raw string and the CSS class is derived from
 * it (`badge go`, `badge restricted`, `badge banned`).
 */
/**
 * `unknown` is NOT a fourth judgement — it is the absence of one.
 *
 * Added 2026-08-11 (Patrick's call) because the column is NOT NULL and the
 * other three are all affirmative legality claims. Roughly 31 states appear
 * nowhere in the case-law corpus; without this they would have to be seeded
 * `go`, which pml.css renders GREEN. A reader would see a green GO badge beside
 * a "No tracked activity" swatch and conclude prediction markets are legal in a
 * state nobody has looked at — the exact failure AC6 exists to prevent
 * ("we have no data" must never render as "we looked and found nothing
 * concerning").
 *
 * Deliberately NOT named `untracked`. That is a `Posture` member, and this enum
 * already shares `banned` with that one; a second overlapping string would make
 * the two axes harder to keep apart, which is the thing this module is most
 * concerned with. Different word, different axis.
 */
export const OPERATIONAL_STATUS_VALUES = [
  "go",
  "restricted",
  "banned",
  "unknown"
] as const;

export const OperationalStatusSchema = z.enum(OPERATIONAL_STATUS_VALUES);
export type OperationalStatus = z.infer<typeof OperationalStatusSchema>;

/**
 * Who approved a published claim, frozen at publish time.
 *
 * Seeded rows are `human`: Patrick curated them from the case-law surveys and
 * no agent has run yet. Epic 3's gate is what starts writing `agent`.
 */
export const PROVENANCE_KIND_VALUES = ["human", "agent"] as const;

export const ProvenanceKindSchema = z.enum(PROVENANCE_KIND_VALUES);
export type ProvenanceKind = z.infer<typeof ProvenanceKindSchema>;

/**
 * Case lifecycle — drives visual weight in the case list (Story 2.5).
 */
export const CASE_LIFECYCLE_VALUES = ["active", "resolved"] as const;

export const CaseLifecycleSchema = z.enum(CASE_LIFECYCLE_VALUES);
export type CaseLifecycle = z.infer<typeof CaseLifecycleSchema>;

/**
 * A prediction-market entity's role in one case.
 *
 * This belongs on `case_entities`, not `cases`: CFTC-v-state matters can affect
 * several platforms without making any platform a captioned party.
 */
export const CASE_ENTITY_ROLE_VALUES = [
  "plaintiff",
  "defendant",
  "appellant",
  "appellee",
  "beneficiary",
  "affected",
  "enforcement-target"
] as const;

export const CaseEntityRoleSchema = z.enum(CASE_ENTITY_ROLE_VALUES);
export type CaseEntityRole = z.infer<typeof CaseEntityRoleSchema>;

/**
 * Source tier — Tier 1 is a court or agency record; Tier 2 is reporting about
 * one. FR2 requires every status/posture claim to carry at least one primary
 * source, and Epic 3 makes Tier-2-only findings ineligible for auto-approval,
 * so the distinction has to survive into the seed rather than arriving later.
 */
export const SOURCE_TIER_VALUES = ["tier1", "tier2"] as const;

export const SourceTierSchema = z.enum(SOURCE_TIER_VALUES);
export type SourceTier = z.infer<typeof SourceTierSchema>;

/**
 * How we know an operational status — stated in a source vs inferred from
 * injunction posture. Seeded for every state (Patrick, 2026-08-11).
 */
export const OPERATIONAL_STATUS_BASIS_VALUES = ["stated", "inferred"] as const;

export const OperationalStatusBasisSchema = z.enum(
  OPERATIONAL_STATUS_BASIS_VALUES
);
export type OperationalStatusBasis = z.infer<
  typeof OperationalStatusBasisSchema
>;

/**
 * Case forum — load-bearing for Story 2.2's "appeals pending" KPI.
 */
export const FORUM_VALUES = [
  "federal-district",
  "federal-appellate",
  "state",
  "agency"
] as const;

export const ForumSchema = z.enum(FORUM_VALUES);
export type Forum = z.infer<typeof ForumSchema>;

/**
 * Polymorphic `sources.owning_table` values. Must match the CHECK in
 * migrations/0001_f1_core.sql exactly.
 */
export const OWNING_TABLE_VALUES = [
  "cases",
  "states",
  "circuits",
  "entities",
  "cert_signals",
  "state_platform_statuses"
] as const;

export const OwningTableSchema = z.enum(OWNING_TABLE_VALUES);
export type OwningTable = z.infer<typeof OwningTableSchema>;

/**
 * Qualitative cert-signal reading (Story 2.8). Explicitly not a probability.
 */
export const CERT_READING_VALUES = [
  "remote",
  "low",
  "elevated",
  "likely",
  "near-certain"
] as const;

export const CertReadingSchema = z.enum(CERT_READING_VALUES);
export type CertReading = z.infer<typeof CertReadingSchema>;
