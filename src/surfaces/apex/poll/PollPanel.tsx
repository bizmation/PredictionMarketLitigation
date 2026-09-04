import { useState } from "react";

import type {
  PollCert,
  PollResults,
  PollTerm,
  PollVoteBody
} from "../../../shared/schemas/poll";
import { EmptyState } from "../../../shared/ui";
import {
  CERT_LABELS,
  POLL_TERMS,
  formatVoteCount,
  percentSplit
} from "./pollView";
import { usePoll, type PollStatus } from "./usePoll";

/**
 * Reader poll (Story 2.9 / FR44 / UX-DR13). Composed as a Masthead child after
 * KpiRow, OUTSIDE `ApexF1Provider` — it is a reader widget, not a data axis.
 *
 * `results` / `status` / `onVote` are injectable for tests (EntityBoard /
 * CertBoard pattern); without them the panel drives its own fetch from `usePoll`.
 */

const THUMBS_UP = (
  <>
    <path d="M7 10v12"></path>
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path>
  </>
);

const TERM_CHROME =
  "The petition was docketed 28 July 2026; a conference this autumn would put argument in October Term 2026.";

type PollPanelProps = {
  results?: PollResults | null;
  status?: PollStatus;
  onVote?: (body: PollVoteBody) => unknown;
};

export function PollPanel({
  results: injectedResults,
  status: injectedStatus,
  onVote
}: PollPanelProps = {}) {
  const live = usePoll();
  const results =
    injectedResults !== undefined ? injectedResults : live.results;
  const status = injectedStatus ?? live.status;
  const vote = onVote ?? live.vote;

  const succeeded = status === "success" && results !== null;
  const voted = succeeded && results!.voted;
  const certCounts = succeeded && results!.cert ? results!.cert : null;
  const termCounts = succeeded && results!.terms ? results!.terms : null;
  const mineCert = voted ? results!.mine.cert : null;
  const mineTerm = voted ? results!.mine.term : null;

  // Whole percents that sum to exactly 100 across each column's rows.
  const certPcts = certCounts
    ? percentSplit([certCounts.yes, certCounts.no])
    : null;
  const termPcts = termCounts
    ? percentSplit([
        termCounts.ot26,
        termCounts.ot27,
        termCounts.ot28,
        termCounts.later
      ])
    : null;

  // First write wins (FR44): no toggle-off, no changing a cast cert/term.
  // `pending` is UX disable; the usePoll in-flight ref is the actual race fix.
  const [pending, setPending] = useState(false);

  const handleCert = async (cert: PollCert) => {
    if (pending || voted) return;
    setPending(true);
    try {
      await vote({ cert, term: mineTerm });
    } finally {
      setPending(false);
    }
  };
  // Term is only meaningful on a grant ("And if they grant — which term?"),
  // and a picked term is locked like the cert vote (review 2-9).
  const handleTerm = async (term: PollTerm) => {
    if (pending || mineCert !== "yes" || mineTerm !== null) return;
    setPending(true);
    try {
      await vote({ cert: mineCert, term });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="poll" id="poll">
      <div className="ph">
        <span className="kicker">Reader poll</span>
        <span className="pq">Will the Supreme Court take it?</span>
        <span className="pn num">
          {succeeded && results
            ? `${formatVoteCount(results.total)} votes`
            : ""}
        </span>
      </div>

      {status === "error" ? (
        <div className="pcol">
          <EmptyState
            title="Reader poll unavailable"
            hint="A missing tally is not a forecast of the outcome."
          >
            Retry the page. The vote returns when the tally does.
          </EmptyState>
        </div>
      ) : (
        <div className="pgrid">
          <div className="pcol">
            <div className="plabel">
              Cert granted in <em>Flaherty</em>?
            </div>
            <div className="pvote">
              <button
                className="pbtn"
                type="button"
                aria-pressed={mineCert === "yes"}
                disabled={pending || voted}
                onClick={() => handleCert("yes")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {THUMBS_UP}
                </svg>
                {CERT_LABELS.yes}
              </button>
              <button
                className="pbtn"
                type="button"
                aria-pressed={mineCert === "no"}
                disabled={pending || voted}
                onClick={() => handleCert("no")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ transform: "rotate(180deg)" }}
                >
                  {THUMBS_UP}
                </svg>
                {CERT_LABELS.no}
              </button>
            </div>
            {certCounts ? (
              <div className="pres">
                {(["yes", "no"] as const).map((key, index) => {
                  const pct = certPcts?.[index] ?? 0;
                  return (
                    <div
                      className={key === mineCert ? "row me" : "row"}
                      key={key}
                    >
                      <span className="lab">{CERT_LABELS[key]}</span>
                      <span className="track">
                        <span
                          className="fill"
                          style={{ width: `${pct}%` }}
                        ></span>
                      </span>
                      <span className="pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="issuehint">
                {succeeded && results
                  ? `${formatVoteCount(results.total)} readers have called it. Vote to see the split.`
                  : "Loading the tally. That is a retrieval wait, not a forecast."}
              </div>
            )}
          </div>

          <div className="vr"></div>

          <div className="pcol">
            <div className="plabel">And if they grant — which term?</div>
            <div className="pterms">
              {POLL_TERMS.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={mineTerm === value}
                  disabled={mineCert !== "yes" || mineTerm !== null || pending}
                  onClick={() => handleTerm(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {termCounts ? (
              <div className="pres">
                {POLL_TERMS.map(([key, label], index) => {
                  const pct = termPcts?.[index] ?? 0;
                  return (
                    <div
                      className={key === mineTerm ? "row me" : "row"}
                      key={key}
                    >
                      <span className="lab">{label}</span>
                      <span className="track">
                        <span
                          className="fill"
                          style={{ width: `${pct}%` }}
                        ></span>
                      </span>
                      <span className="pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="issuehint">{TERM_CHROME}</div>
            )}
          </div>
        </div>
      )}

      <div className="pfoot">
        An unscientific reader poll. It is not evidence, not a forecast, and not
        connected to any market — the tracker's own{" "}
        <a href="#cert">cert reading</a> is qualitative and set by a named
        human. One vote per browser.
      </div>
    </div>
  );
}
