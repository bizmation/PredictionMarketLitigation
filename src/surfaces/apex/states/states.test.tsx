import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CaseListItem } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State, StateDetail } from "../../../shared/schemas/state";
import type { ApexF1Value } from "../ApexF1Context";
import { ApexF1Stub } from "../ApexF1Context";
import {
  DEFAULT_BOARD_SORT,
  filterByStatus,
  isFresh,
  nextBoardSort,
  rowMatchesStatusFilter,
  sortBoardRows,
  trackedStates,
  windowStartUtc
} from "./boardView";
import { StateBoard } from "./StateBoard";
import { StateDetailPanel } from "./StateDetail";
import { isStateDetail, resolveDetailLoad } from "./useStateDetail";

const STAMP = "2026-08-09T16:00:00.000Z";

function circuit(
  partial: Partial<Circuit> & Pick<Circuit, "id" | "name">
): Circuit {
  return {
    number: null,
    posture: "untracked",
    hasSplit: false,
    summary: null,
    provenanceKind: "human",
    publishedAt: STAMP,
    updatedAt: STAMP,
    ...partial
  };
}

function state(partial: Partial<State> & Pick<State, "code" | "name">): State {
  return {
    id: `st-${partial.code.toLowerCase()}`,
    circuitId: null,
    operationalStatus: "unknown",
    operationalStatusBasis: "inferred",
    posture: "untracked",
    controllingCaseId: null,
    whyNote: null,
    provenanceKind: "human",
    publishedAt: STAMP,
    updatedAt: STAMP,
    ...partial
  };
}

function caseRow(
  partial: Partial<CaseListItem> & Pick<CaseListItem, "id" | "caption">
): CaseListItem {
  return {
    court: "D.N.J.",
    docketNumber: "24-cv-1",
    forum: "federal-appellate",
    lifecycle: "resolved",
    posture: "platform",
    circuitId: "cir-3",
    filedAt: null,
    decidedAt: null,
    provenanceKind: "human",
    publishedAt: STAMP,
    updatedAt: STAMP,
    listIssueTags: [],
    affectedStateCodes: [],
    entityRoles: [],
    firstOccurredAt: null,
    ...partial
  };
}

const mockCircuits: Circuit[] = [
  circuit({
    id: "cir-3",
    number: 3,
    name: "Third Circuit",
    posture: "platform"
  })
];

const nj = state({
  code: "NJ",
  name: "New Jersey",
  circuitId: "cir-3",
  operationalStatus: "go",
  posture: "pending",
  controllingCaseId: "case-flaherty",
  whyNote: "The Third Circuit held the CFTC occupies the field."
});
const nv = state({
  code: "NV",
  name: "Nevada",
  circuitId: "cir-3",
  operationalStatus: "restricted",
  posture: "pending"
});
const ct = state({
  code: "CT",
  name: "Connecticut",
  circuitId: "cir-3",
  operationalStatus: "banned",
  posture: "banned"
});
const ak = state({
  code: "AK",
  name: "Alaska",
  operationalStatus: "unknown",
  posture: "untracked"
});

const mockStates: State[] = [nj, nv, ct, ak];
const mockCases: CaseListItem[] = [
  caseRow({
    id: "case-flaherty",
    caption: "KalshiEx LLC v. Flaherty",
    docketNumber: "24-2077",
    affectedStateCodes: ["NJ"],
    entityRoles: ["plaintiff"]
  })
];

function stub(partial: Partial<ApexF1Value> = {}): ApexF1Value {
  return {
    circuits: mockCircuits,
    states: mockStates,
    cases: mockCases,
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

function board(value: ApexF1Value): string {
  return renderToStaticMarkup(
    <ApexF1Stub value={value}>
      <StateBoard />
    </ApexF1Stub>
  );
}

describe("boardView", () => {
  it("omits untracked from the table set", () => {
    expect(trackedStates(mockStates).map((row) => row.code)).toEqual([
      "NJ",
      "NV",
      "CT"
    ]);
  });

  it("filters by operational status only", () => {
    const tracked = trackedStates(mockStates);
    expect(filterByStatus(tracked, "go").map((row) => row.code)).toEqual([
      "NJ"
    ]);
    expect(
      filterByStatus(tracked, "restricted").map((row) => row.code)
    ).toEqual(["NV"]);
    expect(filterByStatus(tracked, "all")).toHaveLength(3);
  });

  it("sorts status go < restricted < banned and never puts untracked in the table", () => {
    const rows = sortBoardRows(trackedStates(mockStates), {
      key: "status",
      dir: 1
    });
    expect(rows.map((row) => row.code)).toEqual(["NJ", "NV", "CT"]);
    expect(rows.every((row) => row.posture !== "untracked")).toBe(true);
  });

  it("toggles sort direction on the same key and resets on a new key", () => {
    const next = nextBoardSort(DEFAULT_BOARD_SORT, "name");
    expect(next).toEqual({ key: "name", dir: -1 });
    expect(nextBoardSort(next, "status")).toEqual({ key: "status", dir: 1 });
  });

  it("treats freshness as 30 UTC days before the published stamp, not Date.now()", () => {
    expect(windowStartUtc(STAMP)).toBe("2026-07-10T16:00:00.000Z");
    expect(isFresh(STAMP, STAMP)).toBe(true);
    expect(isFresh("2026-07-09T16:00:00.000Z", STAMP)).toBe(false);
  });

  it("dims map states whose operational status does not match the board filter", () => {
    expect(rowMatchesStatusFilter({ operationalStatus: "go" }, "all")).toBe(
      true
    );
    expect(rowMatchesStatusFilter({ operationalStatus: "go" }, "banned")).toBe(
      false
    );
    expect(
      rowMatchesStatusFilter({ operationalStatus: "banned" }, "banned")
    ).toBe(true);
    expect(rowMatchesStatusFilter(undefined, "banned")).toBe(false);
    expect(rowMatchesStatusFilter(undefined, "all")).toBe(true);
  });
});

describe("StateBoard", () => {
  it("hides a restricted row when Go is pressed and never lists untracked", () => {
    const all = board(stub());
    expect(all).toContain("New Jersey");
    expect(all).toContain("Nevada");
    expect(all).not.toContain("Alaska");
    expect(all).toContain("3 of 3 tracked states");
    expect(all).not.toContain("51");

    const goOnly = board(stub({ statusFilter: "go" }));
    expect(goOnly).toContain("New Jersey");
    expect(goOnly).not.toContain("Nevada");
    expect(goOnly).not.toContain("Alaska");
    expect(goOnly).toContain("1 of 3 tracked states");
  });

  it("marks the selected row and opens the panel on a hydrated NJ selection", () => {
    const html = board(
      stub({
        selection: { state: "NJ", circuit: "cir-3", case: null, issue: null }
      })
    );
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("<h3>New Jersey</h3>");
    expect(html).toContain("KalshiEx LLC v. Flaherty");
    expect(html).toContain("24-2077");
    expect(html).toContain("Third Circuit");
    expect(html).not.toContain("Select a state on the map or in the table.");
  });

  it("shows empty panel copy when nothing is selected, not New Jersey", () => {
    const html = board(stub());
    expect(html).toContain("Select a state on the map or in the table.");
    expect(html).not.toContain("<h3>New Jersey</h3>");
  });

  it("renders honest untracked copy when the map selects an untracked state", () => {
    const html = board(
      stub({
        selection: { state: "AK", circuit: null, case: null, issue: null }
      })
    );
    const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
    expect(aside).toContain("<h3>Alaska</h3>");
    expect(aside).toContain("Nothing in this state has been reviewed");
    expect(aside).toContain('class="badge unknown"');
    expect(aside).not.toContain('class="badge go"');
  });

  it("forces unknown on untracked even if the row is seeded go", () => {
    const rogue = state({
      code: "AK",
      name: "Alaska",
      operationalStatus: "go",
      posture: "untracked"
    });
    const html = board(
      stub({
        states: [nj, nv, ct, rogue],
        selection: { state: "AK", circuit: null, case: null, issue: null }
      })
    );
    const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
    expect(aside).toContain('class="badge unknown"');
    expect(aside).not.toContain('class="badge go"');
  });

  it("does not claim table cells are source links", () => {
    const html = board(stub());
    expect(html).toContain("Select a row to see that state");
    expect(html).not.toContain("cell above links to at least one Tier-1");
  });

  it("marks the controlling caption as em.case", () => {
    const html = board(
      stub({
        selection: { state: "NJ", circuit: "cir-3", case: null, issue: null }
      })
    );
    expect(html).toContain('<em class="case">KalshiEx LLC v. Flaherty</em>');
  });

  it("says case record not loaded when the controlling id misses the list", () => {
    const html = board(
      stub({
        cases: [],
        selection: { state: "NJ", circuit: "cir-3", case: null, issue: null }
      })
    );
    expect(html).toContain("Case record not loaded");
    expect(html).toContain('href="#cases"');
    const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
    expect(aside).not.toContain("None tracked");
  });
});

describe("StateDetailPanel sources", () => {
  const detail: StateDetail = {
    ...nj,
    platformStatuses: [
      {
        id: "sps-nj-kalshi",
        stateId: "st-nj",
        entityId: "ent-kalshi",
        operationalStatus: "go",
        operationalStatusBasis: "inferred",
        note: "CFTC-registered event contracts.",
        provenanceKind: "human",
        publishedAt: STAMP,
        updatedAt: STAMP,
        entity: {
          id: "ent-kalshi",
          slug: "kalshi",
          name: "Kalshi",
          role: "platform",
          provenanceKind: "human",
          publishedAt: STAMP,
          updatedAt: STAMP
        },
        sources: [
          {
            id: "src-plat",
            owningTable: "state_platform_statuses",
            owningId: "sps-nj-kalshi",
            url: "https://www.cftc.gov/example",
            title: "CFTC order",
            tier: "tier1",
            publishedAt: null
          }
        ]
      }
    ],
    sources: [
      {
        id: "src-nj",
        owningTable: "states",
        owningId: "st-nj",
        url: "https://www.courtlistener.com/example",
        title: "Flaherty opinion",
        tier: "tier1",
        publishedAt: null
      }
    ]
  };

  it("renders a tier-1 source from the detail payload without fetching", () => {
    const html = renderToStaticMarkup(
      <StateDetailPanel
        selected={nj}
        circuits={mockCircuits}
        cases={mockCases}
        detail={detail}
        detailStatus="success"
        freshness={STAMP}
      />
    );
    expect(html).toContain("Flaherty opinion");
    expect(html).toContain("https://www.courtlistener.com/example");
    expect(html).toContain("Kalshi");
    expect(html).toContain("CFTC-registered event contracts.");
    expect(html).toContain('href="#cases"');
    expect(html).toContain('href="#correct"');
    expect(html).not.toContain("#trust");
  });

  it("does not paint another state's platforms under the selected heading", () => {
    const html = renderToStaticMarkup(
      <StateDetailPanel
        selected={nv}
        circuits={mockCircuits}
        cases={mockCases}
        detail={detail}
        detailStatus="success"
        freshness={STAMP}
      />
    );
    expect(html).toContain("<h3>Nevada</h3>");
    expect(html).toContain("Loading per-platform breakdown");
    expect(html).not.toContain("Kalshi");
    expect(html).not.toContain("Flaherty opinion");
  });

  it("keys platform notes by row id and names the platform", () => {
    const html = renderToStaticMarkup(
      <StateDetailPanel
        selected={nj}
        circuits={mockCircuits}
        cases={mockCases}
        detail={detail}
        detailStatus="success"
        freshness={STAMP}
      />
    );
    expect(html).toContain("Kalshi: CFTC-registered event contracts.");
  });

  it("hides a previous state's detail while the next code is selected", () => {
    const stale = resolveDetailLoad("NV", detail, "success");
    expect(stale).toEqual({ detail: null, status: "loading" });
    const live = resolveDetailLoad("NJ", detail, "success");
    expect(live.detail?.code).toBe("NJ");
    expect(live.status).toBe("success");
  });
});

describe("useStateDetail guards", () => {
  it("rejects platform rows that cannot render a name", () => {
    expect(
      isStateDetail({
        code: "NJ",
        name: "New Jersey",
        platformStatuses: [{}],
        sources: []
      })
    ).toBe(false);
    expect(
      isStateDetail({
        code: "NJ",
        name: "New Jersey",
        platformStatuses: [
          {
            id: "sps",
            operationalStatus: "go",
            entity: { name: "Kalshi" }
          }
        ],
        sources: [
          {
            id: "src",
            url: "https://example.com",
            title: "Opinion",
            tier: "tier1"
          }
        ]
      })
    ).toBe(true);
  });
});
