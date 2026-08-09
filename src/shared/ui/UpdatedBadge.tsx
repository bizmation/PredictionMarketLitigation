/**
 * "updated" marker — flags a row that changed inside the reader's current
 * window (status board, cert signal). Accent-tinted rather than uppercase
 * semantic, so it reads as a note and not as a fourth status.
 */

type UpdatedBadgeProps = {
  /** Override for a more specific window, e.g. "updated 3d ago". */
  label?: string;
};

export function UpdatedBadge({ label = "updated" }: UpdatedBadgeProps) {
  return <span className="badge upd">{label}</span>;
}
