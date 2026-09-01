/**
 * Provenance label — who approved this claim, frozen at publish time.
 *
 * UX-DR4: human approval is a solid accent dot on a solid hairline; agent
 * approval is a hollow dot on a dashed border. The dashed edge is the point —
 * an agent-approved claim should look provisional next to a human-approved one
 * even before the reader reads the words.
 *
 * Appears on every published item and throughout ops. evidence.
 */

// Canonical in shared/schemas/vocabulary.ts as of Story 2.1. `import type` is
// erased at build, so zod does not follow this into the client bundle.
import type { ProvenanceKind } from "../schemas/vocabulary";

export type { ProvenanceKind };

type ProvenanceLabelProps = {
  kind: ProvenanceKind;
  /**
   * Approver identity suffix — the approval-agent id and version for agent
   * approvals (e.g. "gate-v2.1"), or an operator display name for human ones.
   */
  detail?: string;
};

const PROVENANCE_LABELS: Record<ProvenanceKind, string> = {
  human: "Human-approved",
  agent: "Agent-approved"
};

export function ProvenanceLabel({ kind, detail }: ProvenanceLabelProps) {
  const className = kind === "agent" ? "prov agent" : "prov";
  const label = PROVENANCE_LABELS[kind];

  return (
    <span className={className}>
      <span className="dot" aria-hidden="true" />
      {detail ? `${label} · ${detail}` : label}
    </span>
  );
}
