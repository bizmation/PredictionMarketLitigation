import type { ReactNode } from "react";

/**
 * Empty state — a dashed frame, the reason, and what it means for the reader.
 *
 * UX-DR21: never an apology. Empty runs, evals-not-run and untracked states are
 * first-class findings, and the copy must say what the absence means rather
 * than say sorry. The handoff's own examples set the tone:
 *
 *   "No material change" / "The run completed and proposed nothing."
 *     hint: "Empty runs are kept in the log deliberately."
 *   "Evals not run" / "This run predates the eval suite."
 *     hint: "An empty eval is not a passing eval."
 *   "No tracked activity" / "Nothing in this state has been reviewed."
 *     hint: "Absence of a finding is not a finding of legality."
 *
 * There is deliberately no default copy — a generic empty state would be the
 * apology this component exists to prevent.
 */

type EmptyStateProps = {
  /** What is empty, in the reader's terms. */
  title: string;
  /** Why it is empty. */
  children: ReactNode;
  /** What the absence means — the line that stops a misreading. */
  hint?: ReactNode;
};

export function EmptyState({ title, children, hint }: EmptyStateProps) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
