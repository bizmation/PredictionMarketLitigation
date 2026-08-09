/**
 * Run status chip — the outcome of one pipeline Run, on the public ops. log.
 *
 * UX-DR6: all six outcomes are designed states. An empty or budget-stopped Run
 * is evidence, not a gap, and is kept in the log deliberately — "absence of
 * drama is not absence of evidence".
 *
 * Note the one name mismatch with the CSS: the empty-run chip uses class
 * `.run.noop`, because `.empty` is already the EmptyState block. The prop stays
 * reader-facing (`empty`) and maps to `noop` here.
 */

export type RunStatus =
  | "published"
  | "awaiting"
  | "empty"
  | "failed"
  | "stopped"
  | "rejected";

const RUN_CLASS: Record<RunStatus, string> = {
  published: "published",
  awaiting: "awaiting",
  empty: "noop",
  failed: "failed",
  stopped: "stopped",
  rejected: "rejected"
};

const RUN_LABELS: Record<RunStatus, string> = {
  published: "published",
  awaiting: "awaiting approval",
  empty: "no material change",
  failed: "failed",
  stopped: "budget-stopped",
  rejected: "rejected"
};

type RunStatusChipProps = {
  status: RunStatus;
};

export function RunStatusChip({ status }: RunStatusChipProps) {
  return (
    <span className={`run ${RUN_CLASS[status]}`}>{RUN_LABELS[status]}</span>
  );
}
