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
  selectionForCircuit,
  selectionForState,
  serializeApexSelection
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
  it("round-trips NJ / cir-3", () => {
    const sel = { state: "NJ", circuit: "cir-3" };
    expect(serializeApexSelection(sel)).toBe("?state=NJ&circuit=cir-3");
    expect(parseApexSelection("?state=NJ&circuit=cir-3")).toEqual(sel);
    expect(parseApexSelection("state=nj&circuit=CIR-3")).toEqual(sel);
  });

  it("ignores garbage state and circuit params", () => {
    expect(parseApexSelection("?state=New%20Jersey&circuit=3")).toEqual({
      state: null,
      circuit: null
    });
    expect(parseApexSelection("?state=ZZZ&circuit=fed")).toEqual({
      state: null,
      circuit: null
    });
    expect(parseApexSelection("?state=nj&circuit=not-a-circuit")).toEqual({
      state: "NJ",
      circuit: null
    });
  });

  it("drops well-formed codes that are not in the payload", () => {
    expect(
      constrainApexSelection(
        { state: "ZZ", circuit: "cir-9" },
        new Set(["NJ"]),
        new Set(["cir-3"])
      )
    ).toEqual({ state: null, circuit: null });
  });

  it("does not honor params before membership sets exist", () => {
    expect(
      constrainApexSelection(
        { state: "NJ", circuit: "cir-3" },
        new Set(),
        new Set()
      )
    ).toEqual({ state: null, circuit: null });
  });

  it("keeps the unloaded axis when only one membership set has landed", () => {
    expect(
      constrainApexSelection(
        { state: "NJ", circuit: "cir-3" },
        new Set(["NJ"]),
        new Set()
      )
    ).toEqual({ state: "NJ", circuit: "cir-3" });
    expect(
      constrainApexSelection(
        { state: "NJ", circuit: "cir-3" },
        new Set(),
        new Set(["cir-3"])
      )
    ).toEqual({ state: "NJ", circuit: "cir-3" });
  });

  it("does not rewrite the URL until both F1 lists have settled", () => {
    const pasted = "?state=NJ&circuit=cir-3";
    expect(nextApexSearch(pasted, new Set(["NJ"]), new Set(), false)).toEqual({
      selection: { state: "NJ", circuit: "cir-3" },
      search: pasted
    });
    expect(
      nextApexSearch(pasted, new Set(["NJ"]), new Set(["cir-3"]), true)
    ).toEqual({
      selection: { state: "NJ", circuit: "cir-3" },
      search: pasted
    });
  });

  it("strips unknown codes after lists settle and keeps unrelated params", () => {
    expect(
      nextApexSearch(
        "?surface=apex&state=ZZ&circuit=cir-9",
        new Set(["NJ"]),
        new Set(["cir-3"]),
        true
      )
    ).toEqual({
      selection: { state: null, circuit: null },
      search: "?surface=apex"
    });
    expect(
      nextApexSearch("?state=ZZ&circuit=cir-9", new Set(), new Set(), true)
    ).toEqual({
      selection: { state: null, circuit: null },
      search: ""
    });
  });

  it("selecting a state sets that row's circuit; All keeps the state", () => {
    expect(selectionForState("NJ", mockStates)).toEqual({
      state: "NJ",
      circuit: "cir-3"
    });
    expect(clearCircuitSelection({ state: "NJ", circuit: "cir-3" })).toEqual({
      state: "NJ",
      circuit: null
    });
  });

  it("selecting a circuit takes the first member in the states list", () => {
    expect(
      selectionForCircuit("cir-3", mockStates, { state: null, circuit: null })
    ).toEqual({ state: "NJ", circuit: "cir-3" });
    expect(
      selectionForCircuit("cir-fed", mockStates, {
        state: "NJ",
        circuit: "cir-3"
      })
    ).toEqual({ state: "NJ", circuit: "cir-fed" });
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
        selection={{ state: "NJ", circuit: "cir-3" }}
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
        selection={{ state: null, circuit: null }}
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
