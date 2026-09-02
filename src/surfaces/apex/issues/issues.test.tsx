import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CaseListItem } from "../../../shared/schemas/caseSchema";
import type { ApexF1Value } from "../ApexF1Context";
import { ApexF1Stub } from "../ApexF1Context";
import {
  parseApexSelection,
  selectionForCase,
  selectionForIssue
} from "../selection";
import { IssueBar } from "./IssueBar";
import { IssueBoard, selectionFromIssueHit } from "./IssueBoard";
import {
  bindIssueChart,
  CHART_FALLBACK,
  CHART_FALLBACK_TITLE,
  IssueChart
} from "./IssueChart";
import { hitFromChartParams, matrixOption } from "./issueCharts";
import {
  emergencePoints,
  indexIssues,
  matrixPostureColumns,
  type IndexedIssue
} from "./issueView";

const STAMP = "2026-08-09T16:00:00.000Z";

function caseRow(
  partial: Partial<CaseListItem> & Pick<CaseListItem, "id" | "caption">
): CaseListItem {
  return {
    court: "D.N.J.",
    docketNumber: "24-cv-1",
    forum: "federal-appellate",
    lifecycle: "active",
    posture: "pending",
    circuitId: "cir-3",
    filedAt: null,
    decidedAt: null,
    provenanceKind: "human",
    publishedAt: STAMP,
    updatedAt: STAMP,
    listIssueTags: [],
    affectedStateCodes: [],
    entityRoles: [],
    firstOccurredAt: "2024-07-01",
    ...partial
  };
}

const flaherty = caseRow({
  id: "case-flaherty",
  caption: "KalshiEx LLC v. Flaherty",
  posture: "pending",
  listIssueTags: [
    {
      slug: "certiorari-path",
      label: "Supreme Court certiorari path",
      isControlling: false
    },
    { slug: "cea-preemption", label: "CEA preemption", isControlling: true }
  ]
});

const nessel = caseRow({
  id: "case-nv-banned",
  caption: "Nevada enforcement matter",
  posture: "banned",
  circuitId: "cir-9",
  listIssueTags: [
    {
      slug: "state-enforcement",
      label: "State enforcement",
      isControlling: true
    }
  ],
  firstOccurredAt: null
});

function stub(partial: Partial<ApexF1Value> = {}): ApexF1Value {
  return {
    circuits: [],
    states: [],
    cases: [flaherty, nessel],
    listsReady: true,
    selection: { state: null, circuit: null, case: null, issue: null },
    commit: () => undefined,
    statusFilter: "all",
    setStatusFilter: (() => undefined) as ApexF1Value["setStatusFilter"],
    detailEpoch: 0,
    filtersEpoch: 0,
    resetLocalFilters: () => undefined,
    ...partial
  };
}

describe("indexIssues", () => {
  it("groups by slug and counts controlling even when that tag is not first", () => {
    const indexed = indexIssues([flaherty, nessel]);
    const cea = indexed.find((tag) => tag.slug === "cea-preemption");
    expect(cea?.label).toBe("CEA preemption");
    expect(cea?.family).toBe("Federal preemption");
    expect(cea?.controllingCount).toBe(1);
    expect(cea?.cases.map((row) => row.id)).toEqual(["case-flaherty"]);
    const cert = indexed.find((tag) => tag.slug === "certiorari-path");
    expect(cert?.controllingCount).toBe(0);
  });

  it("maps unknown slugs to Other without crashing", () => {
    const odd = caseRow({
      id: "case-odd",
      caption: "Odd",
      listIssueTags: [
        { slug: "not-a-seed", label: "Mystery", isControlling: true }
      ]
    });
    expect(indexIssues([odd])[0]?.family).toBe("Other");
  });
});

describe("matrix and emergence", () => {
  it("omits a posture column with zero tagged cases", () => {
    const columns = matrixPostureColumns([flaherty, nessel]);
    expect(columns).toContain("pending");
    expect(columns).toContain("banned");
    expect(columns).not.toContain("platform");
    expect(columns).not.toContain("untracked");
    const option = matrixOption(indexIssues([flaherty, nessel]), columns, null);
    const xData = (option.xAxis as { data: string[] }).data;
    expect(xData).not.toContain("For platform");
    expect(xData).not.toContain("Untracked");
  });

  it("omits emergence marks when firstOccurredAt is null", () => {
    const tags = indexIssues([flaherty, nessel]);
    const points = emergencePoints(tags);
    expect(points.some((point) => point.caseId === "case-flaherty")).toBe(true);
    expect(points.some((point) => point.caseId === "case-nv-banned")).toBe(
      false
    );
  });
});

describe("IssueBar", () => {
  const cea = indexIssues([flaherty, nessel]).find(
    (tag) => tag.slug === "cea-preemption"
  ) as IndexedIssue;

  it("shows empty copy when nothing is selected", () => {
    const html = renderToStaticMarkup(
      <IssueBar
        selected={null}
        tagCount={3}
        matterCount={2}
        onJump={() => undefined}
        onClear={() => undefined}
      />
    );
    expect(html).toContain("Nothing selected");
    expect(html).toContain("3 issue tags across 2 matters");
    expect(html).not.toContain("CEA preemption");
  });

  it("names the selected issue in the lead", () => {
    const html = renderToStaticMarkup(
      <IssueBar
        selected={cea}
        tagCount={3}
        matterCount={2}
        onJump={() => undefined}
        onClear={() => undefined}
      />
    );
    expect(html).toContain("CEA preemption");
    expect(html).toContain("Federal preemption");
    expect(html).toContain("controlling in 1");
    expect(html).toContain("KalshiEx LLC v. Flaherty");
  });
});

describe("issue URL axis", () => {
  it("hydrates ?issue=cea-preemption into the issue bar lead", () => {
    const html = renderToStaticMarkup(
      <ApexF1Stub
        value={stub({
          selection: {
            state: null,
            circuit: null,
            case: null,
            issue: "cea-preemption"
          }
        })}
      >
        <IssueBoard />
      </ApexF1Stub>
    );
    expect(html).toContain('class="lead"');
    expect(html).toContain("CEA preemption");
    expect(html).not.toContain("Nothing selected");
  });

  it("fails closed on spaced and unknown issue params", () => {
    expect(parseApexSelection("?issue=CEA%20preemption").issue).toBeNull();
    expect(parseApexSelection("?issue=uigea").issue).toBe("uigea");
    const html = renderToStaticMarkup(
      <ApexF1Stub
        value={stub({
          selection: {
            state: null,
            circuit: null,
            case: null,
            issue: null
          }
        })}
      >
        <IssueBoard />
      </ApexF1Stub>
    );
    expect(html).toContain("Nothing selected");
  });

  it("selecting a matter uses selectionForCase and keeps the issue axis", () => {
    const current = {
      state: "NJ" as string | null,
      circuit: "cir-3" as string | null,
      case: null as string | null,
      issue: "cea-preemption" as string | null
    };
    expect(selectionForCase("case-flaherty", current)).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    });
    expect(selectionForIssue("cea-preemption", current).issue).toBeNull();
    expect(selectionForIssue("state-enforcement", current).issue).toBe(
      "state-enforcement"
    );
  });

  it("does not show zero tags while lists are still loading", () => {
    const html = renderToStaticMarkup(
      <ApexF1Stub value={stub({ listsReady: false, cases: [] })}>
        <IssueBoard />
      </ApexF1Stub>
    );
    expect(html).toContain("Loading issue tags");
    expect(html).toContain("retrieval wait");
    expect(html).not.toContain("0 issue tags");
    expect(html).not.toContain("Nothing selected");
  });

  it("sunburst leaf sets the leaf issue so the jumped case stays visible", () => {
    const current = {
      state: null as string | null,
      circuit: null as string | null,
      case: null as string | null,
      issue: "cea-preemption" as string | null
    };
    expect(
      selectionFromIssueHit(
        { kind: "case", caseId: "case-nv-banned", slug: "state-enforcement" },
        current
      )
    ).toEqual({
      state: null,
      circuit: null,
      case: "case-nv-banned",
      issue: "state-enforcement"
    });
    expect(
      selectionFromIssueHit({ kind: "tag", slug: "cea-preemption" }, current)
        ?.issue
    ).toBeNull();
  });
});

describe("chart-init failure", () => {
  it("keeps honest EmptyState copy in the document, not a blank no-issues card", () => {
    const html = renderToStaticMarkup(
      <IssueChart
        option={{}}
        height={520}
        highlightName={null}
        onHit={() => undefined}
      />
    );
    expect(html).toContain(CHART_FALLBACK_TITLE);
    expect(html).toContain(CHART_FALLBACK);
    expect(html).toContain("issue tags are still on every case");
    expect(html.toLowerCase()).not.toContain("no issues");
    expect(html).toContain('class="empty"');
  });

  it("treats a throwing echarts.init as failure and disposes a partial instance", () => {
    const host = {} as HTMLDivElement;
    expect(
      bindIssueChart(
        host,
        () => {
          throw new Error("no svg");
        },
        () => undefined
      )
    ).toBeNull();

    const dispose = vi.fn();
    const on = vi.fn(() => {
      throw new Error("click bind failed");
    });
    expect(
      bindIssueChart(
        host,
        () => ({ dispose, on }) as unknown as ReturnType<typeof bindIssueChart>,
        () => undefined
      )
    ).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("hitFromChartParams", () => {
  it("maps a sunburst leaf to a case hit and a tagged cell to a tag hit", () => {
    expect(
      hitFromChartParams({
        data: { leaf: true, caseId: "case-flaherty", slug: "cea-preemption" }
      })
    ).toEqual({
      kind: "case",
      caseId: "case-flaherty",
      slug: "cea-preemption"
    });
    expect(hitFromChartParams({ data: { slug: "state-enforcement" } })).toEqual(
      { kind: "tag", slug: "state-enforcement" }
    );
    expect(
      hitFromChartParams({ data: { name: "Federal preemption" } })
    ).toBeNull();
  });
});

describe("chart tooltip HTML", () => {
  it("escapes captions interpolated into tooltip markup", () => {
    const xss = caseRow({
      id: "case-xss",
      caption: "Kalshi <img src=x onerror=alert(1)> v. X",
      posture: "pending",
      listIssueTags: [
        { slug: "cea-preemption", label: "CEA preemption", isControlling: true }
      ]
    });
    const columns = matrixPostureColumns([xss]);
    const option = matrixOption(indexIssues([xss]), columns, null);
    const series = option.series as Array<{ data: Array<{ slug: string }> }>;
    const cell = series[0]?.data[0];
    expect(cell).toBeDefined();
    const tooltip = option.tooltip as {
      formatter: (p: { data: unknown }) => string;
    };
    const html = tooltip.formatter({ data: cell });
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<img src/);
  });
});
