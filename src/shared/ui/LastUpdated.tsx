import { formatEtDateTime } from "../lib/dates";

/**
 * Last-updated stamp — appears on panels, rows and the map header.
 *
 * Freshness is load-bearing for a tracker: a reader deciding whether a state is
 * safe to operate in needs to know how old the answer is. Renders in tabular
 * figures so stacked timestamps align.
 */

type LastUpdatedProps = {
  /** ISO 8601 UTC instant with `Z`, as stored and served. */
  at: string;
  /** Set false where a column header already says "Updated". */
  prefix?: boolean;
};

export function LastUpdated({ at, prefix = true }: LastUpdatedProps) {
  const formatted = formatEtDateTime(at);
  return (
    <span className="lastupd">
      {prefix ? `Updated ${formatted}` : formatted}
    </span>
  );
}
