import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ApexKpis } from "../../../shared/schemas/kpi";
import { CredibilityStrip } from "./CredibilityStrip";
import { ExecutiveBrief } from "./ExecutiveBrief";
import { KpiRow } from "./KpiRow";

const mockKpis: ApexKpis = {
  statesTracked: 17,
  statesTotal: 51,
  operationalGo: 3,
  operationalRestricted: 8,
  operationalBanned: 6,
  mattersTracked: 11,
  circuitsDecided: 1,
  circuitsWithActivity: 4,
  circuitsTotal: 13,
  appealsPending: 2,
  changedIn30Days: 5,
  changedWindowStart: "2026-08-01",
  freshness: "2026-08-31T19:07:00.000Z",
  provenanceKind: "human"
};

describe("KpiRow", () => {
  it("renders the mock payload, not a seed literal", () => {
    const html = renderToStaticMarkup(<KpiRow kpis={mockKpis} />);
    expect(html).toContain("17");
    expect(html).toContain("11");
    expect(html).toContain("2");
    expect(html).toContain("5");
    expect(html).not.toContain(">25<");
    expect(html).toContain('aria-label="Docket snapshot"');
    expect(html).toContain("published record was updated");
  });

  it("shows em dashes when aggregates have not arrived", () => {
    const html = renderToStaticMarkup(<KpiRow kpis={null} />);
    expect(html).toContain("—");
    expect(html).not.toContain(">25<");
    expect(html).not.toContain(">51<");
  });
});

describe("CredibilityStrip", () => {
  it("keeps pipeline claims honest and omits dummy LinkedIn", () => {
    const html = renderToStaticMarkup(
      <CredibilityStrip opsHref="https://ops.predictionmarketlitigation.com" />
    );
    const lower = html.toLowerCase();
    expect(lower).not.toContain("checked daily");
    expect(lower).not.toContain("always current");
    expect(lower).not.toContain("linkedin.com");
    expect(html).toContain("sourced seed");
    expect(html).toContain("Sourced from the case record");
    expect(html).not.toContain("not a snapshot");
    expect(html).toContain("Patrick Bland");
    expect(html).toContain("PB");
    expect(html).toContain("#layers");
  });
});

describe("ExecutiveBrief", () => {
  it("interpolates docket statistics from the KPI payload", () => {
    const html = renderToStaticMarkup(<ExecutiveBrief kpis={mockKpis} />);
    expect(html).toContain("5 of the 17 tracked states");
    expect(html).toContain("2 appeals are pending");
    expect(html).not.toContain("nineteen states");
    expect(html).not.toContain("nine states");
    expect(html).not.toContain("It changes most weeks");
    expect(html).not.toContain("Every status here links");
  });

  it("does not invent movement or pending appeals before KPIs arrive", () => {
    const html = renderToStaticMarkup(<ExecutiveBrief kpis={null} />);
    expect(html).not.toContain("have moved in the last 30 days");
    expect(html).not.toContain("Appeals are pending in the courts of appeals");
    expect(html).not.toContain("appeals are pending");
  });
});
