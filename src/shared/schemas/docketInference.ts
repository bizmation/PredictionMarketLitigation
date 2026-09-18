import { z } from "zod";

import { IsoDateSchema } from "./common";
import { CaseLifecycleSchema, PostureSchema } from "./vocabulary";

/**
 * Story 3.21 — the docket-entry inference contract.
 *
 * The LLM classifies; code decides. A CourtListener docket entry becomes a
 * Draft with two parts: the *record* (connector-authored, verbatim, never
 * touched by a model) and the *inference* — the drafter's classification of
 * the entry into this closed vocabulary. `deriveStatePatch` is a pure
 * function of `(kind, favors, current row, occurredAt)` implementing the
 * frozen transition table from the spec, so the table is reviewed once and
 * tested row by row. The D1 CHECKs in migrations/0018 carry these strings
 * verbatim; this module is canonical.
 *
 * `favors` names the side the ruling helps, never the movant: a denied
 * platform PI favors `state`.
 */

export const DOCKET_EVENT_KIND_VALUES = [
  "filing",
  "appearance",
  "scheduling",
  "motion-filed",
  "brief",
  "procedural-order",
  "hearing",
  "tro-granted",
  "tro-denied",
  "pi-granted",
  "pi-denied",
  "stay-granted",
  "stay-denied",
  "mtd-granted",
  "mtd-denied",
  "sj-granted",
  "sj-denied",
  "judgment",
  "dismissal-with-prejudice",
  "dismissal-without-prejudice",
  "voluntary-dismissal",
  "opinion-affirmed",
  "opinion-reversed",
  "remand",
  "mandate",
  "notice-of-appeal",
  "settlement",
  "other"
] as const;

export const DocketEventKindSchema = z.enum(DOCKET_EVENT_KIND_VALUES);
export type DocketEventKind = z.infer<typeof DocketEventKindSchema>;

export const FAVORS_VALUES = ["platform", "state", "none"] as const;

export const FavorsSchema = z.enum(FAVORS_VALUES);
export type Favors = z.infer<typeof FavorsSchema>;

export const INFERENCE_BASIS_MAX_CHARS = 400;

/** The drafter's whole answer. Anything outside this shape is dropped. */
export const InferenceSchema = z
  .object({
    kind: DocketEventKindSchema,
    favors: FavorsSchema,
    confidence: z.number().min(0).max(1),
    basis: z.string().trim().min(1).max(INFERENCE_BASIS_MAX_CHARS)
  })
  .strict();

export type Inference = z.infer<typeof InferenceSchema>;

/** Kind groups — each of the 28 kinds is in exactly one. */
export const PROCEDURAL_KINDS: readonly DocketEventKind[] = [
  "filing",
  "appearance",
  "scheduling",
  "motion-filed",
  "brief",
  "procedural-order",
  "hearing",
  "notice-of-appeal",
  "stay-granted",
  "stay-denied",
  "other"
];

export const INTERIM_MERITS_KINDS: readonly DocketEventKind[] = [
  "tro-granted",
  "tro-denied",
  "pi-granted",
  "pi-denied",
  "mtd-granted",
  "mtd-denied",
  "sj-denied",
  "opinion-affirmed",
  "opinion-reversed"
];

export const DISPOSITIVE_MERITS_KINDS: readonly DocketEventKind[] = [
  "judgment",
  "sj-granted",
  "dismissal-with-prejudice",
  "settlement"
];

export const RESOLVES_WITHOUT_MERITS_KINDS: readonly DocketEventKind[] = [
  "dismissal-without-prejudice",
  "voluntary-dismissal",
  "remand",
  "mandate"
];

export type KindGroup =
  | "procedural"
  | "interim-merits"
  | "dispositive-merits"
  | "resolves-without-merits";

export function kindGroup(kind: DocketEventKind): KindGroup {
  if (INTERIM_MERITS_KINDS.includes(kind)) return "interim-merits";
  if (DISPOSITIVE_MERITS_KINDS.includes(kind)) return "dispositive-merits";
  if (RESOLVES_WITHOUT_MERITS_KINDS.includes(kind)) {
    return "resolves-without-merits";
  }
  return "procedural";
}

const ChangeSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ from: value.nullable(), to: value.nullable() }).strict();

/**
 * Only these three `cases` fields can ever be derived. Identity fields
 * (caption, court, docketNumber, forum, circuitId, filedAt) are never
 * patched, and `banned` / `untracked` are never produced — finality is a
 * human judgment made by hand.
 */
export const StatePatchSchema = z
  .object({
    lifecycle: ChangeSchema(CaseLifecycleSchema).optional(),
    posture: ChangeSchema(PostureSchema).optional(),
    decidedAt: ChangeSchema(IsoDateSchema).optional()
  })
  .strict();

export type StatePatch = z.infer<typeof StatePatchSchema>;

export const STATE_PATCH_FIELDS = [
  "lifecycle",
  "posture",
  "decidedAt"
] as const;
export type StatePatchField = (typeof STATE_PATCH_FIELDS)[number];

/** The inference fields the operator accepts or strips at the gate. */
export const INFERENCE_FIELDS = ["kind", "favors"] as const;

export type CaseStateSnapshot = {
  lifecycle: z.infer<typeof CaseLifecycleSchema>;
  posture: z.infer<typeof PostureSchema>;
  decidedAt: string | null;
};

/**
 * The frozen transition table. A field appears in the patch only when the
 * derived value differs from the current row — a no-op is not a change.
 *
 * | group                   | favors           | lifecycle | posture  | decidedAt    |
 * | procedural              | any              | —         | —        | —            |
 * | interim merits          | platform / state | —         | = favors | —            |
 * | interim merits          | none             | —         | —        | —            |
 * | dispositive on merits   | platform / state | resolved  | = favors | = occurredAt |
 * | dispositive on merits   | none             | resolved  | —        | = occurredAt |
 * | resolves without merits | any              | resolved  | —        | = occurredAt |
 */
export function deriveStatePatch(
  kind: DocketEventKind,
  favors: Favors,
  current: CaseStateSnapshot,
  occurredAt: string
): StatePatch {
  const group = kindGroup(kind);
  const patch: StatePatch = {};
  const sided = favors === "platform" || favors === "state";

  const movesPosture =
    sided && (group === "interim-merits" || group === "dispositive-merits");
  const resolves =
    group === "dispositive-merits" || group === "resolves-without-merits";

  if (resolves && current.lifecycle !== "resolved") {
    patch.lifecycle = { from: current.lifecycle, to: "resolved" };
  }
  // `banned` is finality, set by hand; the table never moves it. `untracked`
  // is the absence of a finding and may move.
  if (
    movesPosture &&
    current.posture !== "banned" &&
    current.posture !== favors
  ) {
    patch.posture = { from: current.posture, to: favors };
  }
  if (resolves && current.decidedAt !== occurredAt) {
    patch.decidedAt = { from: current.decidedAt, to: occurredAt };
  }
  return StatePatchSchema.parse(patch);
}

/**
 * Fields that only make sense together. `favors` without `kind` is a side
 * with no ruling; `decidedAt` without `lifecycle` is a decision date on an
 * active case. The queue toggles each pair as one unit and the gate refuses
 * a half. Each pair's first member is the anchor.
 */
export const COUPLED_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["kind", "favors"],
  ["lifecycle", "decidedAt"]
];

/** The unit a field belongs to: `[anchor, partner]` or `[field]`. */
export function coupledUnit(field: string): readonly string[] {
  for (const pair of COUPLED_FIELDS) {
    if (pair.includes(field)) return pair;
  }
  return [field];
}

/**
 * True when `accepted` never contains one half of a coupled pair without
 * the other (only pairs where both halves are acceptable count).
 */
export function isCoherentAcceptance(
  acceptable: readonly string[],
  accepted: readonly string[]
): boolean {
  for (const [a, b] of COUPLED_FIELDS) {
    if (!acceptable.includes(a) || !acceptable.includes(b)) continue;
    if (accepted.includes(a) !== accepted.includes(b)) return false;
  }
  return true;
}

/**
 * The default per-field decision the queue and the YOLO path share: accept
 * everything when the drafter's confidence clears the live threshold (0–100)
 * and the reviewer did not disagree; otherwise strip everything.
 */
export function defaultAcceptedFields(
  diff: unknown,
  threshold: number,
  reviewerDisagrees: boolean
): string[] {
  const acceptable = acceptableFields(diff);
  if (acceptable.length === 0) return [];
  const row = diff as Record<string, unknown>;
  const inference = InferenceSchema.safeParse(row.inference);
  const confident =
    inference.success && inference.data.confidence >= threshold / 100;
  return confident && !reviewerDisagrees ? acceptable : [];
}

/**
 * Every field the operator may accept or strip on a docket-event Draft:
 * the classification itself plus whatever the table derived.
 */
export function acceptableFields(diff: unknown): string[] {
  if (diff == null || typeof diff !== "object" || Array.isArray(diff)) {
    return [];
  }
  const row = diff as Record<string, unknown>;
  const fields: string[] = [];
  if (InferenceSchema.safeParse(row.inference).success) {
    fields.push(...INFERENCE_FIELDS);
  }
  const patch = StatePatchSchema.safeParse(row.statePatch);
  if (patch.success) {
    for (const field of STATE_PATCH_FIELDS) {
      if (patch.data[field] != null) fields.push(field);
    }
  }
  return fields;
}
