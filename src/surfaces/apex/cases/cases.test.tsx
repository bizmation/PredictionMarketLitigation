import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  CaseDetail,
  CaseListItem
} from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import type { ApexF1Value } from "../ApexF1Context";
import { ApexF1Stub } from "../ApexF1Context";
import { CaseBoard } from "./CaseBoard";
import { CaseDetailPanel } from "./CaseDetail";
import { CaseList } from "./CaseList";
import {
  caseMatches,
  emptyCaseFilters,
  filtersAreClear,
  partyRoleLabel,
  POSTURE_CHIP_ORDER,
  sortCircuitIds,
  uniqueIssueTags,
  type CaseFilters
} from "./caseView";
import { isCaseDetail, resolveCaseDetailLoad } from "./useCaseDetail";

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
    ...partial
  };
}

const flaherty = caseRow({
  id: "case-flaherty",
  caption: "KalshiEx LLC v. Flaherty",
  docketNumber: "24-2077",
  posture: "pending",
  circuitId: "cir-3",
  lifecycle: "resolved",
  listIssueTags: [
    { slug: "cea-preemption", label: "CEA preemption", isControlling: true }
  ],
  affectedStateCodes: ["NJ"],
  entityRoles: ["plaintiff"]
});

const other = caseRow({
  id: "case-other",
  caption: "Nevada enforcement matter",
  court: "D. Nev.",
  docketNumber: "25-cv-9",
  posture: "banned",
  circuitId: "cir-9",
  listIssueTags: [
    {
      slug: "state-enforcement",
      label: "State enforcement",
      isControlling: true
    }
  ],
  affectedStateCodes: ["NV"],
  entityRoles: ["defendant"]
});

const mockCircuits: Circuit[] = [
  circuit({ id: "cir-3", number: 3, name: "Third Circuit" }),
  circuit({ id: "cir-9", number: 9, name: "Ninth Circuit" })
];

const mockStates: State[] = [
  state({
    code: "NJ",
    name: "New Jersey",
    circuitId: "cir-3",
    posture: "banned"
  }),
  state({ code: "NV", name: "Nevada", circuitId: "cir-9", posture: "banned" })
];

function stub(partial: Partial<ApexF1Value> = {}): ApexF1Value {
  return {
    circuits: mockCircuits,
    states: mockStates,
    cases: [flaherty, other],
    listsReady: true,
    selection: { state: null, circuit: null, case: null },
    commit: () => undefined,
    statusFilter: "all",
    setStatusFilter: (() => undefined) as ApexF1Value["setStatusFilter"],
    detailEpoch: 0,
    ...partial
  };
}

function board(value: ApexF1Value): string {
  return renderToStaticMarkup(
    <ApexF1Stub value={value}>
      <CaseBoard />
    </ApexF1Stub>
  );
}

function filters(partial: Partial<CaseFilters> = {}): CaseFilters {
  return { ...emptyCaseFilters(), ...partial };
}

const detailMock: CaseDetail = {
  ...flaherty,
  sources: [
    {
      id: "src-1",
      owningTable: "cases",
      owningId: "case-flaherty",
      title: "CourtListener docket",
      url: "https://www.courtlistener.com/docket/flaherty/",
      tier: "tier1",
      publishedAt: "2024-07-01"
    }
  ],
  docketEvents: [
    {
      id: "de-1",
      caseId: "case-flaherty",
      occurredAt: "2024-07-01",
      description: "Third Circuit opinion",
      sourceId: "src-1",
      provenanceKind: "human",
      publishedAt: STAMP,
      updatedAt: STAMP,
      source: {
        id: "src-1",
        owningTable: "cases",
        owningId: "case-flaherty",
        title: "CourtListener docket",
        url: "https://www.courtlistener.com/docket/flaherty/",
        tier: "tier1",
        publishedAt: "2024-07-01"
      }
    }
  ],
  issueTags: [
    {
      tag: {
        id: "tag-secondary",
        slug: "certiorari-path",
        label: "Certiorari path",
        provenanceKind: "human",
        publishedAt: STAMP,
        updatedAt: STAMP
      },
      isControlling: false,
      provenanceKind: "human",
      publishedAt: STAMP,
      updatedAt: STAMP
    },
    {
      tag: {
        id: "tag-cea",
        slug: "cea-preemption",
        label: "CEA preemption",
        provenanceKind: "human",
        publishedAt: STAMP,
        updatedAt: STAMP
      },
      isControlling: true,
      provenanceKind: "human",
      publishedAt: STAMP,
      updatedAt: STAMP
    }
  ],
  states: [
    {
      state: mockStates[0]!,
      provenanceKind: "human",
      publishedAt: STAMP,
      updatedAt: STAMP
    }
  ],
  entities: [
    {
      entity: {
        id: "ent-kalshi",
        slug: "kalshi",
        name: "Kalshi",
        role: "exchange",
        provenanceKind: "human",
        publishedAt: STAMP,
        updatedAt: STAMP
      },
      role: "plaintiff",
      provenanceKind: "human",
      publishedAt: STAMP,
      updatedAt: STAMP
    }
  ]
};

describe("caseView", () => {
  const names = new Map([
    ["NJ", "New Jersey"],
    ["NV", "Nevada"]
  ]);

  it("AND-matches search tokens against caption, court, docket, tags, and states", () => {
    expect(
      caseMatches(flaherty, filters({ q: "kalshi flaherty" }), names)
    ).toBe(true);
    expect(caseMatches(flaherty, filters({ q: "kalshi nevada" }), names)).toBe(
      false
    );
    expect(caseMatches(flaherty, filters({ q: "new jersey" }), names)).toBe(
      true
    );
  });

  it("filters by issue slug, state code, circuit, and posture set", () => {
    expect(
      caseMatches(other, filters({ issue: "cea-preemption" }), names)
    ).toBe(false);
    expect(caseMatches(flaherty, filters({ state: "NJ" }), names)).toBe(true);
    expect(caseMatches(other, filters({ state: "NJ" }), names)).toBe(false);
    expect(caseMatches(other, filters({ circuit: "cir-3" }), names)).toBe(
      false
    );
    expect(
      caseMatches(flaherty, filters({ postures: new Set(["banned"]) }), names)
    ).toBe(false);
    expect(
      caseMatches(other, filters({ postures: new Set(["banned"]) }), names)
    ).toBe(true);
  });

  it("Clear is pressed only when every control is at its default", () => {
    expect(filtersAreClear(emptyCaseFilters())).toBe(true);
    expect(filtersAreClear(filters({ q: "kalshi" }))).toBe(false);
  });

  it("collapses party roles without inventing a case-level partyRole", () => {
    expect(partyRoleLabel(["plaintiff", "defendant"])).toBe("Both");
    expect(partyRoleLabel(["plaintiff"])).toBe("Plaintiff");
    expect(partyRoleLabel(["enforcement-target"])).toBe("Enforcement target");
    expect(partyRoleLabel([])).toBeNull();
  });

  it("collects unique issue tags sorted by label", () => {
    expect(uniqueIssueTags([flaherty, other]).map((tag) => tag.slug)).toEqual([
      "cea-preemption",
      "state-enforcement"
    ]);
  });

  it("includes Untracked in the posture chip order", () => {
    expect(POSTURE_CHIP_ORDER).toContain("untracked");
  });

  it("sorts circuit filter ids by court number, not raw id", () => {
    const mixed = [
      circuit({ id: "cir-11", number: 11, name: "Eleventh Circuit" }),
      circuit({ id: "cir-2", number: 2, name: "Second Circuit" }),
      circuit({ id: "cir-dc", number: null, name: "D.C. Circuit" })
    ];
    expect(sortCircuitIds(["cir-11", "cir-dc", "cir-2"], mixed)).toEqual([
      "cir-2",
      "cir-11",
      "cir-dc"
    ]);
  });
});

describe("CaseBoard", () => {
  it("renders both mocks and italic captions", () => {
    const html = board(stub());
    expect(html).toContain("KalshiEx LLC v. Flaherty");
    expect(html).toContain("Nevada enforcement matter");
    expect(html).toContain('class="cap"');
    expect(html).toContain("2 of 2 cases");
    expect(html).toContain("Select a case from the list.");
    expect(html).toContain(
      "Search caption, court, docket number, issue tag or state"
    );
  });

  it("marks the selected row and shows its caption in the panel", () => {
    const html = board(
      stub({
        selection: { state: null, circuit: null, case: "case-flaherty" }
      })
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("<h3>KalshiEx LLC v. Flaherty</h3>");
    expect(html).not.toContain("Select a case from the list.");
  });

  it("keeps resolved matters at reduced visual weight", () => {
    const html = board(stub());
    expect(html).toContain('data-lifecycle="resolved"');
  });

  it("renders the case posture, not an affected state's posture", () => {
    const html = board(
      stub({
        cases: [flaherty],
        selection: { state: null, circuit: null, case: "case-flaherty" }
      })
    );
    const item = html.match(
      /<button type="button" class="caseitem"[\s\S]*?<\/button>/
    )?.[0];
    expect(item).toContain('class="sw pending"');
    expect(item).toContain("Pending — skeptical");
    expect(item).not.toContain('class="sw banned"');
  });
});

describe("CaseList empty states", () => {
  it("does not describe a loading catalog as a filter miss", () => {
    const html = renderToStaticMarkup(
      <CaseList
        rows={[]}
        selectedId={null}
        onSelect={() => undefined}
        listsReady={false}
        total={0}
      />
    );
    expect(html).toContain("Loading cases");
    expect(html).not.toContain("No case matches");
    expect(html).not.toContain("fits those terms");
  });

  it("does not describe an empty catalog as a filter miss", () => {
    const html = renderToStaticMarkup(
      <CaseList
        rows={[]}
        selectedId={null}
        onSelect={() => undefined}
        listsReady={true}
        total={0}
      />
    );
    expect(html).toContain("No cases published");
    expect(html).not.toContain("No case matches");
  });

  it("uses filter-miss copy only when published rows were hidden", () => {
    const html = renderToStaticMarkup(
      <CaseList
        rows={[]}
        selectedId={null}
        onSelect={() => undefined}
        listsReady={true}
        total={2}
      />
    );
    expect(html).toContain("No case matches");
    expect(html).toContain("#trust");
  });
});

describe("CaseDetailPanel", () => {
  it("accents the controlling tag even when it is not first", () => {
    const html = renderToStaticMarkup(
      <CaseDetailPanel
        selected={flaherty}
        circuits={mockCircuits}
        states={mockStates}
        selection={{
          state: null,
          circuit: null,
          case: "case-flaherty"
        }}
        commit={() => undefined}
        detail={detailMock}
        detailStatus="success"
      />
    );
    expect(html).toContain("itag primary");
    expect(html).toContain("CEA preemption");
    expect(html).toContain("Certiorari path");
    expect(html).toContain("CourtListener docket");
    expect(html).toContain("https://www.courtlistener.com/docket/flaherty/");
    expect(html).toContain("Every event above links to a Tier-1 source");
  });

  it("does not claim events have Tier-1 sources when the docket is empty", () => {
    const html = renderToStaticMarkup(
      <CaseDetailPanel
        selected={flaherty}
        circuits={mockCircuits}
        states={mockStates}
        selection={{
          state: null,
          circuit: null,
          case: "case-flaherty"
        }}
        commit={() => undefined}
        detail={{ ...detailMock, docketEvents: [] }}
        detailStatus="success"
      />
    );
    expect(html).toContain("No docket events published");
    expect(html).not.toContain("Every event above links to a Tier-1 source");
  });
});

describe("useCaseDetail guards", () => {
  it("rejects a payload missing docket source urls", () => {
    expect(
      isCaseDetail({
        id: "case-flaherty",
        caption: "x",
        docketEvents: [
          { id: "de-1", description: "op", occurredAt: "2024-07-01" }
        ],
        issueTags: [],
        states: [],
        sources: []
      })
    ).toBe(false);
    expect(isCaseDetail(detailMock)).toBe(true);
  });

  it("treats a stale detail id as still loading", () => {
    expect(resolveCaseDetailLoad("case-other", detailMock, "success")).toEqual({
      detail: null,
      status: "loading"
    });
  });
});
