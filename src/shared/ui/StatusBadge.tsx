/**
 * Operational status badge — "is [platform] legal in [state] today?".
 *
 * UX-DR3: outlined and muted, never a traffic light. `restricted` carries a
 * fine hatch so the three are distinguishable without relying on hue.
 *
 * The enum strings are the PRD glossary values, stored verbatim in D1
 * (architecture #Naming-Patterns). Do not prettify them here.
 */

// Canonical in shared/schemas/vocabulary.ts as of Story 2.1. `import type` is
// erased at build, so zod does not follow this into the client bundle.
//
// NOTE: `banned` is also a `Posture` value, and means something different
// there — posture is which way the litigation came out, this is whether a
// platform can operate today. A state is routinely `restricted` here while its
// posture is `pending`. Never map one onto the other.
import type { OperationalStatus } from "../schemas/vocabulary";

export type { OperationalStatus };

type StatusBadgeProps = {
  status: OperationalStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge ${status}`}>{status}</span>;
}
