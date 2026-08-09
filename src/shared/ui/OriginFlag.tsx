/**
 * Run origin flag — why this Run happened. Dashed outline and visually
 * subordinate to the status chip: origin is context, not outcome.
 *
 * The enum strings are the D1 values verbatim (architecture #Naming-Patterns):
 * `scheduled` | `catch-up` | `manual`.
 */

export type RunOrigin = "scheduled" | "catch-up" | "manual";

type OriginFlagProps = {
  origin: RunOrigin;
};

export function OriginFlag({ origin }: OriginFlagProps) {
  return <span className="origin">{origin}</span>;
}
