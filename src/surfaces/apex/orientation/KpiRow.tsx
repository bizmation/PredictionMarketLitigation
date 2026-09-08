import { formatEtDate } from "../../../shared/lib/dates";
import type { ApexKpis } from "../../../shared/schemas/kpi";

type KpiRowProps = {
  kpis: ApexKpis | null;
};

function figure(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

/**
 * Six-cell KPI row. Figures are em dashes until aggregates arrive — never a
 * guessed seed count. Split cells use the StatusBadge operational-status ramp.
 */
export function KpiRow({ kpis }: KpiRowProps) {
  const since = kpis
    ? formatEtDate(`${kpis.changedWindowStart}T12:00:00.000Z`)
    : null;

  return (
    <ul className="kpis" aria-label="Docket snapshot">
      <li className="kpi">
        <b>{figure(kpis?.statesTracked)}</b>
        <span className="k">States tracked</span>
        <span className="sub">
          {kpis
            ? `Of ${kpis.statesTotal}. The rest have no tracked activity.`
            : "The rest of the union has no tracked activity."}
        </span>
      </li>
      <li className="kpi">
        <div className="split">
          <i className="go">
            {figure(kpis?.operationalGo)}
            <em>Go</em>
          </i>
          <i className="restricted">
            {figure(kpis?.operationalRestricted)}
            <em>Restricted</em>
          </i>
          <i className="banned">
            {figure(kpis?.operationalBanned)}
            <em>Banned</em>
          </i>
        </div>
        <span className="k">Operational status</span>
        <span className="sub">Can a platform take the order there today.</span>
      </li>
      <li className="kpi">
        <b>{figure(kpis?.mattersTracked)}</b>
        <span className="k">Cases on record</span>
        <span className="sub">
          Each with a primary source and docket history.
        </span>
      </li>
      <li className="kpi">
        <b>
          {figure(kpis?.circuitsDecided)}
          {kpis ? <small> of {kpis.circuitsTotal}</small> : null}
        </b>
        <span className="k">Circuits decided</span>
        <span className="sub">
          {kpis
            ? `${kpis.circuitsWithActivity} ${kpis.circuitsWithActivity === 1 ? "has" : "have"} tracked activity.`
            : "Circuits with a merits holding versus those with tracked activity."}
        </span>
      </li>
      <li className="kpi">
        <b>{figure(kpis?.appealsPending)}</b>
        <span className="k">Appeals pending</span>
        <span className="sub">
          Active federal-appellate matters on the docket.
        </span>
      </li>
      <li className="kpi">
        <b>{figure(kpis?.changedIn30Days)}</b>
        <span className="k">Changed in 30 days</span>
        <span className="sub">
          {since
            ? `Tracked states whose published record was updated since ${since}.`
            : "Tracked states whose published record was updated in the freshness window."}
        </span>
      </li>
    </ul>
  );
}
