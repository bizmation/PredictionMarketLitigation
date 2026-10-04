// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApexF1Provider } from "../ApexF1Context";
import { CircuitSplit } from "./CircuitSplit";
import { StateBoard } from "../states/StateBoard";
import {
  nextApexSearch,
  parseApexSelection,
  selectedCircuitLayers
} from "../selection";

const data = vi.hoisted(() => {
  const stamp = "2026-10-04T16:00:00.000Z";
  return {
    listsReady: true,
    cases: [],
    circuits: [1, 3, 9].map((number) => ({
      id: `cir-${number}`,
      number,
      name: `Circuit ${number}`,
      posture: "untracked",
      hasSplit: false,
      summary: null,
      provenanceKind: "human",
      publishedAt: stamp,
      updatedAt: stamp
    })),
    states: [
      ["ME", "Maine", 1],
      ["NJ", "New Jersey", 3],
      ["CA", "California", 9]
    ].map(([code, name, number]) => ({
      id: `st-${String(code).toLowerCase()}`,
      code,
      name,
      circuitId: `cir-${number}`,
      operationalStatus: "unknown",
      operationalStatusBasis: "inferred",
      posture: "untracked",
      controllingCaseId: null,
      whyNote: null,
      provenanceKind: "human",
      publishedAt: stamp,
      updatedAt: stamp
    }))
  };
});
vi.mock("./useCircuitData", () => ({ useCircuitData: () => data }));
vi.mock("../states/useStateDetail", () => ({
  useStateDetail: () => ({ detail: null, status: "idle" })
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("toggles multiple real map overlays without scrolling the state board, and restores them from the URL", async () => {
  window.history.replaceState(null, "", "/?state=ME&circuit=cir-1#circuits");
  const scroll = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = scroll;
  const topo = JSON.parse(readFileSync("public/geo/states-10m.json", "utf8"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => topo }))
  );
  const mount = () =>
    render(
      <ApexF1Provider>
        <CircuitSplit />
        <StateBoard />
      </ApexF1Provider>
    );
  const view = mount();
  await waitFor(() =>
    expect(view.container.querySelectorAll("path.circ")).toHaveLength(3)
  );
  const chip = (id: string) =>
    view.container.querySelector<HTMLButtonElement>(
      `button[data-circuit="${id}"]`
    )!;
  fireEvent.click(chip("cir-3"));
  expect(chip("cir-1").getAttribute("aria-pressed")).toBe("true");
  expect(chip("cir-3").getAttribute("aria-pressed")).toBe("true");
  expect(view.container.querySelectorAll("path.circ.sel")).toHaveLength(2);
  const paths = Array.from(view.container.querySelectorAll("path.st"));
  expect(
    paths
      .find((el) => el.getAttribute("aria-label")?.startsWith("Maine —"))
      ?.getAttribute("opacity")
  ).toBe("1");
  expect(
    paths
      .find((el) => el.getAttribute("aria-label")?.startsWith("New Jersey —"))
      ?.getAttribute("opacity")
  ).toBe("1");
  expect(
    paths
      .find((el) => el.getAttribute("aria-label")?.startsWith("California —"))
      ?.getAttribute("opacity")
  ).toBe("0.22");
  expect(scroll).not.toHaveBeenCalled();
  expect(parseApexSelection(window.location.search).state).toBe("ME");
  expect(
    selectedCircuitLayers(parseApexSelection(window.location.search))
  ).toEqual(["cir-1", "cir-3"]);
  view.unmount();
  const restored = mount();
  await waitFor(() =>
    expect(restored.container.querySelectorAll("path.circ.sel")).toHaveLength(2)
  );
  fireEvent.click(
    restored.container.querySelector('button[data-circuit="cir-1"]')!
  );
  expect(
    selectedCircuitLayers(parseApexSelection(window.location.search))
  ).toEqual(["cir-3"]);
  expect(screen.getByText("1 circuit layer selected.")).toBeTruthy();
  expect(scroll).not.toHaveBeenCalled();
});

it("normalizes, deduplicates and constrains layer URLs only after lists load", () => {
  const query = "?circuits=CIR-1,cir-3,cir-1,garbage,cir-9&surface=apex";
  const empty = new Set<string>();
  expect(nextApexSearch(query, empty, empty, empty, empty, false).search).toBe(
    query
  );
  const settled = nextApexSearch(
    query,
    empty,
    new Set(["cir-1", "cir-3"]),
    empty,
    empty,
    true
  );
  expect(selectedCircuitLayers(settled.selection)).toEqual(["cir-1", "cir-3"]);
  expect(new URLSearchParams(settled.search).get("surface")).toBe("apex");
});
