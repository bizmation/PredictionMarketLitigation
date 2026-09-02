import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityListItem } from "../../../shared/schemas/entity";
import type { ApexF1Value } from "../ApexF1Context";
import { ApexF1Stub } from "../ApexF1Context";
import {
  selectionForCase,
  selectionForState,
  type ApexSelection
} from "../selection";
import {
  commitEntityJump,
  EntityBoard,
  jumpToBand,
  selectionFromEntityMatter
} from "./EntityBoard";
import { entityMetrics, groupFootprint, roleTagLabel } from "./entityView";

const STAMP = "2026-08-09T16:00:00.000Z";

function item(
  partial: Partial<EntityListItem> &
    Pick<EntityListItem, "id" | "slug" | "name">
): EntityListItem {
  return {
    role: "DCM",
    provenanceKind: "human",
    publishedAt: STAMP,
    updatedAt: STAMP,
    matters: [],
    footprint: [],
    ...partial
  };
}

const kalshi = item({
  id: "ent-kalshi",
  slug: "kalshi",
  name: "KalshiEX LLC",
  role: "DCM",
  matters: [
    {
      caseId: "case-flaherty",
      caption: "KalshiEx LLC v. Flaherty",
      court: "3d Cir.",
      docketNumber: "24-3057",
      forum: "federal-appellate",
      lifecycle: "active",
      posture: "platform",
      role: "plaintiff"
    },
    {
      caseId: "case-md-martin-4th",
      caption: "Martin appeal",
      court: "4th Cir.",
      docketNumber: "25-100",
      forum: "federal-appellate",
      lifecycle: "active",
      posture: "pending",
      role: "appellant"
    }
  ],
  footprint: [
    {
      stateCode: "NJ",
      stateName: "New Jersey",
      operationalStatus: "go",
      note: null
    },
    {
      stateCode: "NV",
      stateName: "Nevada",
      operationalStatus: "banned",
      note: "Enjoined"
    },
    {
      stateCode: "XX",
      stateName: "Unknownia",
      operationalStatus: "unknown",
      note: null
    }
  ]
});

const emptyPlatform = item({
  id: "ent-empty",
  slug: "empty-co",
  name: "Empty Co",
  role: "FCM"
});

function stub(partial: Partial<ApexF1Value> = {}): ApexF1Value {
  return {
    circuits: [],
    states: [
      {
        id: "st-nj",
        code: "NJ",
        name: "New Jersey",
        circuitId: "cir-3",
        operationalStatus: "go",
        operationalStatusBasis: "inferred",
        posture: "platform",
        controllingCaseId: "case-flaherty",
        whyNote: null,
        provenanceKind: "human",
        publishedAt: STAMP,
        updatedAt: STAMP
      }
    ],
    cases: [],
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

function board(
  value: ApexF1Value,
  props: {
    items?: EntityListItem[];
    status?: "idle" | "loading" | "success" | "error";
    initialSlug?: string | null;
  }
) {
  return renderToStaticMarkup(
    <ApexF1Stub value={value}>
      <EntityBoard {...props} />
    </ApexF1Stub>
  );
}

describe("entityMetrics", () => {
  it("counts exact roles and does not fold appellant into plaintiff", () => {
    const metrics = entityMetrics(kalshi);
    expect(metrics.total).toBe(2);
    expect(metrics.plaintiff).toBe(1);
    expect(metrics.defendant).toBe(0);
    expect(metrics.appellate).toBe(2);
  });
});

describe("groupFootprint", () => {
  it("puts unknown in its own bucket and does not invent go for missing states", () => {
    const grouped = groupFootprint(kalshi);
    expect(grouped.go.map((row) => row.stateCode)).toEqual(["NJ"]);
    expect(grouped.banned.map((row) => row.stateCode)).toEqual(["NV"]);
    expect(grouped.unknown.map((row) => row.stateCode)).toEqual(["XX"]);
    expect(grouped.restricted).toEqual([]);
    const empty = groupFootprint(emptyPlatform);
    expect(empty.go).toEqual([]);
    expect(empty.restricted).toEqual([]);
    expect(empty.banned).toEqual([]);
    expect(empty.unknown).toEqual([]);
  });
});

describe("roleTagLabel", () => {
  it("title-cases a single case-entity role without prototype P/D/PD", () => {
    expect(roleTagLabel("plaintiff")).toBe("Plaintiff");
    expect(roleTagLabel("enforcement-target")).toBe("Enforcement target");
    expect(roleTagLabel("appellant")).toBe("Appellant");
  });
});

describe("EntityBoard", () => {
  it("shows Nothing selected instead of defaulting to Kalshi", () => {
    const html = board(stub(), { items: [kalshi], status: "success" });
    expect(html).toContain("Nothing selected");
    expect(html).toContain("KalshiEX LLC");
    expect(html).not.toContain("Open case record");
  });

  it("opens a matter with selectionForCase and keeps the issue axis", () => {
    const current: ApexSelection = {
      state: "NJ",
      circuit: "cir-3",
      case: null,
      issue: "cea-preemption"
    };
    expect(selectionFromEntityMatter("case-flaherty", current)).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    });
    expect(selectionForCase("case-flaherty", current).case).toBe(
      "case-flaherty"
    );
    const html = board(stub(), {
      items: [kalshi],
      status: "success",
      initialSlug: "kalshi"
    });
    expect(html).toContain("Open case record");
    expect(html).toContain("KalshiEx LLC v. Flaherty");
    expect(html).not.toContain("no legal risk");
  });

  it("state jumps use selectionForState without inventing a second store", () => {
    const current: ApexSelection = {
      state: null,
      circuit: null,
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    expect(selectionForState("NJ", stub().states, current)).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: null,
      issue: "cea-preemption"
    });
  });

  it("shows the matters empty copy when a platform has no linked cases", () => {
    const html = board(stub(), {
      items: [emptyPlatform],
      status: "success",
      initialSlug: "empty-co"
    });
    expect(html).toContain("No matters are linked to this platform");
    expect(html).toContain(
      "not a finding that the platform faces no litigation"
    );
    expect(html.toLowerCase()).not.toContain("no legal risk");
  });

  it("shows the footprint empty copy when a platform has no published rows", () => {
    const html = board(stub(), {
      items: [emptyPlatform],
      status: "success",
      initialSlug: "empty-co"
    });
    expect(html).toContain(
      "No operational footprint is published for this platform"
    );
    expect(html).toContain("Absence of a row is not a finding of legality.");
    expect(html.toLowerCase()).not.toContain("no legal risk");
  });

  it("shows could not be loaded on fetch failure, not an empty docket", () => {
    const html = board(stub(), { status: "error" });
    expect(html).toContain("Entity list could not be loaded");
    expect(html).toContain("A missing ledger is not an empty docket.");
    expect(html).not.toContain("Nothing selected");
    expect(html).not.toContain("no platforms");
  });

  it("does not report zero matters while the list is still loading", () => {
    const html = board(stub(), { status: "loading" });
    expect(html).toContain("Loading entity record");
    expect(html).toContain("retrieval wait");
    expect(html).not.toContain("Nothing selected");
    expect(html).not.toContain(">0</b>");
  });

  it("treats a successful empty list as a load failure, not nothing selected", () => {
    const html = board(stub(), { items: [], status: "success" });
    expect(html).toContain("Entity list could not be loaded");
    expect(html).toContain("A missing ledger is not an empty docket.");
    expect(html).not.toContain("Nothing selected");
    expect(html).not.toContain('role="tab"');
  });
});

describe("commitEntityJump", () => {
  it("does not commit until F1 lists are ready", () => {
    const next: ApexSelection = {
      state: null,
      circuit: null,
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    const commit = vi.fn();
    expect(commitEntityJump(false, next, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(commitEntityJump(true, next, commit)).toBe(true);
    expect(commit).toHaveBeenCalledWith(next);
  });
});

describe("jumpToBand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the hash and scrolls the target band", () => {
    const scrollIntoView = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("location", {
      pathname: "/",
      search: "?issue=cea-preemption"
    });
    vi.stubGlobal("history", { replaceState });
    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        id === "cases" ? { scrollIntoView } : null
    });
    jumpToBand("cases");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/?issue=cea-preemption#cases"
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });
});
