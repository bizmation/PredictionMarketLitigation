import { EmptyState, ProvenanceLabel, UpdatedBadge } from "../../../shared/ui";
import type { CertSignal } from "../../../shared/schemas/certSignal";
import { formatIsoDate } from "../../../shared/lib/dates";
import { CERT_SCALE, readingLabel, scaleFilledCount } from "./certView";
import { useCertSignal, type CertStatus } from "./useCertSignal";

const CAVEAT =
  "A qualitative editorial reading of the named factors. It is not a probability, and it is not derived from any market.";
const RESERVED =
  "Reserved: market-derived cert probability (Kalshi / Robinhood), with methodology and reflexivity caveat. Not shipped in v1.";
const METHOD_CHROME =
  "Factors are the whole method. There is no weighting, no model and no score behind this reading.";

type CertBoardProps = {
  signal?: CertSignal | null;
  status?: CertStatus;
};

export function CertBoard({
  signal: injectedSignal,
  status: injectedStatus
}: CertBoardProps = {}) {
  const fetched = useCertSignal();
  const signal = injectedSignal !== undefined ? injectedSignal : fetched.signal;
  const status = injectedStatus ?? fetched.status;
  const pending = status === "idle" || status === "loading";

  if (
    status === "error" ||
    (!pending && (!signal || signal.factors.length === 0))
  ) {
    return (
      <EmptyState
        title="Cert signal could not be loaded"
        hint="A missing reading is not a forecast of Remote."
      >
        Retry the page. The published reading stays unpublished until it
        arrives.
      </EmptyState>
    );
  }

  if (pending || !signal) {
    return (
      <div className="cert">
        <div>
          <span className="kicker">Loading cert reading</span>
          <p className="issuehint">
            The published reading has not settled yet. That is a retrieval wait,
            not a forecast.
          </p>
        </div>
      </div>
    );
  }

  const label = readingLabel(signal.reading);
  const filled = scaleFilledCount(signal.reading);

  return (
    <div className="cert">
      <div>
        <div className="certgauge" aria-label={`Qualitative reading: ${label}`}>
          <div className="kicker">Reading</div>
          <div className="val">{label}</div>
          <div className="scale" aria-hidden="true">
            {CERT_SCALE.map((step, index) => (
              <span key={step} className={index < filled ? "on" : undefined} />
            ))}
          </div>
          <div className="cap">
            {CERT_SCALE.map((step, index) => {
              const word = readingLabel(step);
              return (
                <span key={step}>
                  {index > 0 ? " · " : null}
                  {step === signal.reading ? <strong>{word}</strong> : word}
                </span>
              );
            })}
          </div>
          <hr className="rule" />
          <div className="caveat">{CAVEAT}</div>
          <div className="meta">
            <ProvenanceLabel kind={signal.provenanceKind} />
            <UpdatedBadge
              label={`Reviewed ${formatIsoDate(signal.reviewedAt)}`}
            />
          </div>
        </div>
        <div className="reserved">{RESERVED}</div>
      </div>
      <div>
        <div className="kicker">Factors named in this reading</div>
        <ul className="factors" role="list">
          {signal.factors.map((factor, index) => (
            <li key={`${index}-${factor.lead}`}>
              <span className="fn">{index + 1}</span>
              <span>
                <strong>{factor.lead}</strong> {factor.explanation}
              </span>
            </li>
          ))}
        </ul>
        <p className="methodnote">{signal.methodNote}</p>
        <p className="methodnote">{METHOD_CHROME}</p>
      </div>
    </div>
  );
}
