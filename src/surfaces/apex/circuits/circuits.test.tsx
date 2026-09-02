import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import {
  clearCircuitSelection,
  constrainApexSelection,
  nextApexSearch,
  parseApexSelection,
  selectionForCase,
  selectionForCircuit,
  selectionForIssue,
  selectionForState,
  serializeApexSelection,
  shouldBumpStateDetailEpoch
} from "../selection";
import { CircuitIndex } from "./CircuitIndex";
import { CircuitLegend } from "./CircuitLegend";
import { CircuitMap, MAP_FALLBACK } from "./CircuitMap";
import { CircuitSplit } from "./CircuitSplit";
import { ApexF1Provider } from "../ApexF1Context";
import { US_ATLAS_STATE_NAMES } from "./atlasStateNames";

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

const mockCircuits: Circuit[] = [
  circuit({
    id: "cir-3",
    number: 3,
    name: "Third Circuit",
    posture: "platform",
    summary: "Flaherty is the controlling appellate holding."
  }),
  circuit({
    id: "cir-fed",
    number: null,
    name: "Federal Circuit",
    posture: "untracked"
  })
];

const mockStates: State[] = [
  state({
    code: "NJ",
    name: "New Jersey",
    circuitId: "cir-3",
    posture: "platform",
    controllingCaseId: "case-flaherty"
  }),
  state({
    code: "PA",
    name: "Pennsylvania",
    circuitId: "cir-3",
    posture: "untracked"
  }),
  state({
    code: "DE",
    name: "Delaware",
    circuitId: "cir-3",
    posture: "pending"
  })
];

describe("selection.ts", () => {
  const none = new Set<string>();

  it("round-trips NJ / cir-3 / case-flaherty / cea-preemption", () => {
    const sel = {
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    expect(serializeApexSelection(sel)).toBe(
      "?state=NJ&circuit=cir-3&case=case-flaherty&issue=cea-preemption"
    );
    expect(
      parseApexSelection(
        "?state=NJ&circuit=cir-3&case=case-flaherty&issue=cea-preemption"
      )
    ).toEqual(sel);
    expect(
      parseApexSelection(
        "state=nj&circuit=CIR-3&case=CASE-FLAHERTY&issue=CEA-PREEMPTION"
      )
    ).toEqual(sel);
  });

  it("round-trips a lone ?issue=cea-preemption", () => {
    const sel = {
      state: null,
      circuit: null,
      case: null,
      issue: "cea-preemption"
    };
    expect(serializeApexSelection(sel)).toBe("?issue=cea-preemption");
    expect(parseApexSelection("?issue=cea-preemption")).toEqual(sel);
  });

  it("ignores garbage state, circuit, case, and issue params", () => {
    expect(parseApexSelection("?state=New%20Jersey&circuit=3")).toEqual({
      state: null,
      circuit: null,
      case: null,
      issue: null
    });
    expect(parseApexSelection("?state=ZZZ&circuit=fed")).toEqual({
      state: null,
      circuit: null,
      case: null,
      issue: null
    });
    expect(parseApexSelection("?state=nj&circuit=not-a-circuit")).toEqual({
      state: "NJ",
      circuit: null,
      case: null,
      issue: null
    });
    expect(parseApexSelection("?case=flaherty")).toEqual({
      state: null,
      circuit: null,
      case: null,
      issue: null
    });
    expect(parseApexSelection("?case=Case%20Flaherty")).toEqual({
      state: null,
      circuit: null,
      case: null,
      issue: null
    });
    expect(parseApexSelection("?issue=CEA%20preemption")).toEqual({
      state: null,
      circuit: null,
      case: null,
      issue: null
    });
  });

  it("drops well-formed codes that are not in the payload", () => {
    expect(
      constrainApexSelection(
        {
          state: "ZZ",
          circuit: "cir-9",
          case: "case-nope",
          issue: "uigea"
        },
        new Set(["NJ"]),
        new Set(["cir-3"]),
        new Set(["case-flaherty"]),
        new Set(["cea-preemption"])
      )
    ).toEqual({ state: null, circuit: null, case: null, issue: null });
  });

  it("does not honor params before membership sets exist", () => {
    expect(
      constrainApexSelection(
        {
          state: "NJ",
          circuit: "cir-3",
          case: "case-flaherty",
          issue: "cea-preemption"
        },
        none,
        none,
        none,
        none
      )
    ).toEqual({ state: null, circuit: null, case: null, issue: null });
  });

  it("keeps the unloaded axis when only one membership set has landed", () => {
    const current = {
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    expect(
      constrainApexSelection(current, new Set(["NJ"]), none, none, none)
    ).toEqual(current);
    expect(
      constrainApexSelection(current, none, new Set(["cir-3"]), none, none)
    ).toEqual(current);
    expect(
      constrainApexSelection(
        current,
        none,
        none,
        new Set(["case-flaherty"]),
        none
      )
    ).toEqual(current);
    expect(
      constrainApexSelection(
        current,
        none,
        none,
        none,
        new Set(["cea-preemption"])
      )
    ).toEqual(current);
  });

  it("empty issueSlugs keeps a parsed issue (staggered axis)", () => {
    expect(
      constrainApexSelection(
        {
          state: "NJ",
          circuit: "cir-3",
          case: "case-flaherty",
          issue: "cea-preemption"
        },
        new Set(["NJ"]),
        new Set(["cir-3"]),
        new Set(["case-flaherty"]),
        none
      )
    ).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    });
  });

  it("does not rewrite the URL until F1 lists have settled", () => {
    const pasted = "?state=NJ&circuit=cir-3";
    expect(
      nextApexSearch(pasted, new Set(["NJ"]), none, none, none, false)
    ).toEqual({
      selection: { state: "NJ", circuit: "cir-3", case: null, issue: null },
      search: pasted
    });
    expect(
      nextApexSearch(
        pasted,
        new Set(["NJ"]),
        new Set(["cir-3"]),
        none,
        none,
        true
      )
    ).toEqual({
      selection: { state: "NJ", circuit: "cir-3", case: null, issue: null },
      search: pasted
    });
  });

  it("strips unknown codes after lists settle and keeps unrelated params", () => {
    expect(
      nextApexSearch(
        "?surface=apex&state=ZZ&circuit=cir-9",
        new Set(["NJ"]),
        new Set(["cir-3"]),
        none,
        none,
        true
      )
    ).toEqual({
      selection: { state: null, circuit: null, case: null, issue: null },
      search: "?surface=apex"
    });
    expect(
      nextApexSearch("?state=ZZ&circuit=cir-9", none, none, none, none, true)
    ).toEqual({
      selection: { state: null, circuit: null, case: null, issue: null },
      search: ""
    });
  });

  it("selecting a state sets that row's circuit and keeps the issue axis", () => {
    expect(
      selectionForState("NJ", mockStates, {
        state: null,
        circuit: null,
        case: "case-flaherty",
        issue: "cea-preemption"
      })
    ).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: null,
      issue: "cea-preemption"
    });
    expect(
      clearCircuitSelection({
        state: "NJ",
        circuit: "cir-3",
        case: "case-flaherty",
        issue: "cea-preemption"
      })
    ).toEqual({
      state: "NJ",
      circuit: null,
      case: "case-flaherty",
      issue: "cea-preemption"
    });
  });

  it("selecting a circuit takes the first member in the states list", () => {
    expect(
      selectionForCircuit("cir-3", mockStates, {
        state: null,
        circuit: null,
        case: null,
        issue: null
      })
    ).toEqual({ state: "NJ", circuit: "cir-3", case: null, issue: null });
    expect(
      selectionForCircuit("cir-fed", mockStates, {
        state: "NJ",
        circuit: "cir-3",
        case: "case-flaherty",
        issue: "cea-preemption"
      })
    ).toEqual({
      state: "NJ",
      circuit: "cir-fed",
      case: "case-flaherty",
      issue: "cea-preemption"
    });
  });

  it("selecting a case preserves state, circuit, and issue", () => {
    expect(
      selectionForCase("case-flaherty", {
        state: "NJ",
        circuit: "cir-3",
        case: null,
        issue: "cea-preemption"
      })
    ).toEqual({
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    });
  });

  it("selecting an issue toggles the already-active slug", () => {
    const current = {
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    expect(selectionForIssue("cea-preemption", current).issue).toBeNull();
    expect(selectionForIssue("state-enforcement", current).issue).toBe(
      "state-enforcement"
    );
    expect(selectionForIssue(null, current).issue).toBeNull();
  });

  it("does not bump state-detail epoch for issue or case-only clicks", () => {
    const open = {
      state: "NJ",
      circuit: "cir-3",
      case: "case-flaherty",
      issue: "cea-preemption"
    };
    expect(
      shouldBumpStateDetailEpoch(open, {
        ...open,
        issue: "state-enforcement"
      })
    ).toBe(false);
    expect(
      shouldBumpStateDetailEpoch(open, {
        ...open,
        case: "case-other"
      })
    ).toBe(false);
    expect(
      shouldBumpStateDetailEpoch(open, {
        ...open,
        state: "NV",
        circuit: "cir-9"
      })
    ).toBe(true);
    expect(shouldBumpStateDetailEpoch(open, open)).toBe(true);
  });
});

describe("CircuitIndex", () => {
  it("renders mock figures, not a seed 7-of-13 literal", () => {
    const html = renderToStaticMarkup(
      <CircuitIndex
        circuits={mockCircuits}
        selectedCircuitId="cir-3"
        onSelect={() => undefined}
      />
    );
    expect(html).toContain("1 of 2 with tracked activity");
    expect(html).not.toContain("7 of 13");
    expect(html).not.toContain("9 of 13");
    expect(html).toContain(">3d<");
    expect(html).toContain(">Fed.<");
    expect(html).toContain("Flaherty is the controlling appellate holding.");
    expect(html).toContain("No tracked activity");
    expect(html).toContain('class="sw platform"');
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/class="crow"/g)).toHaveLength(2);
  });
});

describe("CircuitLegend", () => {
  it("counts from the mock payload and uses the posture swatch ramp", () => {
    const html = renderToStaticMarkup(
      <CircuitLegend
        circuits={mockCircuits}
        states={mockStates}
        selection={{ state: "NJ", circuit: "cir-3", case: null, issue: null }}
        mapPostures={new Set()}
        onTogglePosture={() => undefined}
        onSelectCircuit={() => undefined}
      />
    );
    expect(html).toContain("All <b>3</b>");
    expect(html).toContain("No tracked activity <b>1</b>");
    expect(html).toContain("Decided for platform <b>1</b>");
    expect(html).toContain("Pending — skeptical <b>1</b>");
    expect(html).not.toContain("<b>7</b>");
    expect(html).toContain('class="sw platform"');
    expect(html).toContain('class="sw pending"');
    expect(html).toContain('class="sw untracked"');
    expect(html).toContain('data-circuit="cir-3"');
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("CircuitMap fallback", () => {
  it("keeps honest fallback copy in the document before topology loads", () => {
    const html = renderToStaticMarkup(
      <CircuitMap
        states={mockStates}
        circuits={mockCircuits}
        cases={[]}
        selection={{ state: null, circuit: null, case: null, issue: null }}
        mapPostures={new Set()}
        showCirc
        statusFilter="all"
        onSelectState={() => undefined}
        onSelectCircuit={() => undefined}
      />
    );
    expect(html).toContain(MAP_FALLBACK);
    expect(html).toContain("status board still carry");
    expect(html).not.toContain("once it is wired");
    expect(html).not.toContain(" d=");
    expect(html).toContain('role="img"');
    expect(html).toContain("data-map");
  });
});

describe("CircuitSplit first paint", () => {
  it("lays out legend, map card and index without inventing seed counts", () => {
    const html = renderToStaticMarkup(
      <ApexF1Provider>
        <CircuitSplit />
      </ApexF1Provider>
    );
    expect(html).toContain('class="f1"');
    expect(html).toContain('class="circuits"');
    expect(html).toContain('class="legend"');
    expect(html).toContain("Controlling posture by state");
    expect(html).toContain("0 of 0 with tracked activity");
    expect(html).not.toContain("7 of 13");
    expect(html).toContain(MAP_FALLBACK);
  });
});

describe("vendored us-atlas 3.0.1", () => {
  it("states-10m.json is geographic (not pre-projected) and names every seeded state", () => {
    const topo = JSON.parse(
      readFileSync("public/geo/states-10m.json", "utf8")
    ) as {
      bbox: number[];
      transform?: unknown;
      objects: {
        states: { geometries: Array<{ properties?: { name?: string } }> };
      };
    };
    expect(topo.transform).toBeDefined();
    expect(topo.bbox[0]).toBeLessThan(-100);
    const names = new Set(
      topo.objects.states.geometries.map((geom) => geom.properties?.name)
    );
    expect(US_ATLAS_STATE_NAMES).toHaveLength(51);
    for (const name of US_ATLAS_STATE_NAMES) {
      expect(names.has(name)).toBe(true);
    }
  });
});
