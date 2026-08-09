/**
 * Operational status badge — "is [platform] legal in [state] today?".
 *
 * UX-DR3: outlined and muted, never a traffic light. `restricted` carries a
 * fine hatch so the three are distinguishable without relying on hue.
 *
 * The enum strings are the PRD glossary values, stored verbatim in D1
 * (architecture #Naming-Patterns). Do not prettify them here.
 */

export type OperationalStatus = "go" | "restricted" | "banned";

type StatusBadgeProps = {
  status: OperationalStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge ${status}`}>{status}</span>;
}
