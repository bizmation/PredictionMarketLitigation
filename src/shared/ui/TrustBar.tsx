import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * Trust bar — the disclosure strip under the top bar.
 *
 * This is product UI, not footer chrome. The governing thesis is that the
 * litigation is the subject and the governance is the message, so provenance,
 * freshness and the not-legal-advice disclaimer ride at the top of the page
 * where a reader forms their impression — never buried at the bottom (UX-DR7).
 *
 * Slots are rendered in a fixed order with `·` separators between the ones
 * actually present, so an absent slot never leaves a dangling separator. The
 * CSS additionally hides a trailing one via `.sep:last-of-type`.
 */

type TrustBarProps = {
  /** Usually a WarnChip. */
  warn?: ReactNode;
  /** The wide, wrapping message — the positioning line on apex. */
  message?: ReactNode;
  /** Freshness or schedule figures — usually LastUpdated. */
  meta?: ReactNode;
  /** Usually a ProvenanceLabel, or a gate-mode indicator on ops./admin. */
  provenance?: ReactNode;
};

export function TrustBar({ warn, message, meta, provenance }: TrustBarProps) {
  const slots: Array<{ key: string; className?: string; node: ReactNode }> = [];

  if (warn) slots.push({ key: "warn", node: warn });
  if (message) slots.push({ key: "message", className: "grow", node: message });
  if (meta) slots.push({ key: "meta", className: "num", node: meta });
  if (provenance) slots.push({ key: "provenance", node: provenance });

  return (
    <div className="trustbar">
      <div className="wrap">
        {slots.map((slot, i) => (
          <Fragment key={slot.key}>
            {i > 0 ? (
              <span className="sep" aria-hidden="true">
                ·
              </span>
            ) : null}
            {slot.className ? (
              <span className={slot.className}>{slot.node}</span>
            ) : (
              slot.node
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
