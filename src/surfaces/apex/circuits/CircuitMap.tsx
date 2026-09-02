import { geoAlbersUsa, geoPath } from "d3-geo";
import { select } from "d3-selection";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useRef, useState } from "react";
import { feature, merge } from "topojson-client";
import type {
  GeometryCollection,
  GeometryObject,
  Topology
} from "topojson-specification";

import { formatEtDate } from "../../../shared/lib/dates";
import type { Case } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import type { Posture } from "../../../shared/schemas/vocabulary";
import { POSTURE_LABELS } from "../../../shared/ui";
import type { ApexSelection } from "../selection";
import { rowMatchesStatusFilter, type StatusFilter } from "../states/boardView";
import { circStroke, circuitShortLabel } from "./circuitView";

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- choropleth SVG; no <img> equivalent */

export const MAP_FALLBACK =
  "Map geometry could not be loaded. The circuit index and the status board still carry the same postures. This view is a second reading of the same record, never the only one.";

type UsAtlas = Topology<{
  states: GeometryCollection<{ name: string }>;
}>;

type StateFeature = Feature<Geometry, { name: string }>;

type CircOverlay = {
  id: string;
  name: string;
  geom: Geometry;
  labelGeom: Geometry;
};

type CircuitMapProps = {
  states: State[];
  circuits: Circuit[];
  cases: Case[];
  selection: ApexSelection;
  mapPostures: ReadonlySet<Posture>;
  statusFilter: StatusFilter;
  showCirc: boolean;
  onSelectState: (code: string) => void;
  onSelectCircuit: (circuitId: string) => void;
};

type Tip = {
  name: string;
  untracked: boolean;
  postureLabel: string | null;
  caption: string | null;
  updated: string | null;
  x: number;
  y: number;
};

function isUsAtlas(value: unknown): value is UsAtlas {
  if (value === null || typeof value !== "object") return false;
  const row = value as { objects?: { states?: unknown } };
  return row.objects !== undefined && row.objects.states !== undefined;
}

function atlasName(geom: GeometryObject<{ name: string }>): string {
  const props = geom.properties as { name?: string } | undefined;
  return props?.name ?? "";
}

function postureOf(name: string, rows: State[]): Posture {
  return rows.find((state) => state.name === name)?.posture ?? "untracked";
}

export function CircuitMap({
  states,
  circuits,
  cases,
  selection,
  mapPostures,
  statusFilter,
  showCirc,
  onSelectState,
  onSelectCircuit
}: CircuitMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const paintRef = useRef<(() => void) | null>(null);
  const statesRef = useRef(states);
  const casesRef = useRef(cases);
  const selectionRef = useRef(selection);
  const mapPosturesRef = useRef(mapPostures);
  const statusFilterRef = useRef(statusFilter);
  const showCircRef = useRef(showCirc);
  const onSelectStateRef = useRef(onSelectState);
  const onSelectCircuitRef = useRef(onSelectCircuit);

  statesRef.current = states;
  casesRef.current = cases;
  selectionRef.current = selection;
  mapPosturesRef.current = mapPostures;
  statusFilterRef.current = statusFilter;
  showCircRef.current = showCirc;
  onSelectStateRef.current = onSelectState;
  onSelectCircuitRef.current = onSelectCircuit;

  const [topo, setTopo] = useState<UsAtlas | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [mapWidth, setMapWidth] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/geo/states-10m.json", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => {
        if (!res.ok) throw new Error("topology");
        return res.json();
      })
      .then((body: unknown) => {
        if (!isUsAtlas(body)) throw new Error("topology");
        setTopo(body);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || failed) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setMapWidth((prev) => {
        const next = Math.round(width);
        return next === prev ? prev : next;
      });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [failed]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !topo) return;

    select(svg).selectAll("g").remove();

    const w = mapWidth || svg.clientWidth || 700;
    const h = 560;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const fc = feature(topo, topo.objects.states) as FeatureCollection<
      Geometry,
      { name: string }
    >;
    const proj = geoAlbersUsa().fitSize([w - 24, h - 24], fc);
    const path = geoPath(proj);
    const g = select(svg).append("g").attr("transform", "translate(12,12)");

    g.selectAll<SVGPathElement, StateFeature>("path.st")
      .data(fc.features)
      .join("path")
      .attr("class", "st")
      .attr("d", (d) => path(d) ?? "")
      .attr("tabindex", (d) => (path(d) ? 0 : -1))
      .attr("role", "button")
      .on("mousemove", (event: MouseEvent, d) => showTip(event, d))
      .on("mouseleave", hideTip)
      .on("focus", function onFocus(_event, d) {
        const r = this.getBoundingClientRect();
        showTip({ clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }, d);
      })
      .on("blur", hideTip)
      .on("click", (_event, d) => {
        const row = statesRef.current.find(
          (state) => state.name === d.properties.name
        );
        if (row) onSelectStateRef.current(row.code);
      })
      .on("keydown", (event: KeyboardEvent, d) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const row = statesRef.current.find(
          (state) => state.name === d.properties.name
        );
        if (!row) return;
        event.preventDefault();
        onSelectStateRef.current(row.code);
      });

    const geoms = topo.objects.states.geometries;
    const byName = new Map(geoms.map((geom) => [atlasName(geom), geom]));
    const circFeatures: CircOverlay[] = [];
    for (const circuit of circuits) {
      const members = states
        .filter((state) => state.circuitId === circuit.id)
        .map((state) => byName.get(state.name))
        .filter((geom): geom is GeometryObject<{ name: string }> =>
          Boolean(geom)
        );
      if (members.length === 0) continue;
      const labelMembers = members.filter(
        (geom) => !["Alaska", "Hawaii"].includes(atlasName(geom))
      );
      const geom = merge(topo, members as never);
      const labelGeom = merge(
        topo,
        (labelMembers.length ? labelMembers : members) as never
      );
      if (!geom || !labelGeom) continue;
      circFeatures.push({
        id: circuit.id,
        name: circuit.name,
        geom,
        labelGeom
      });
    }

    g.selectAll<SVGPathElement, CircOverlay>("path.circ")
      .data(circFeatures)
      .join("path")
      .attr("class", "circ")
      .attr("d", (d) => path(d.geom) ?? "");

    const labels = g
      .selectAll<SVGTextElement, CircOverlay>("text.clabel")
      .data(circFeatures)
      .join("text")
      .attr("class", "clabel")
      .attr("text-anchor", "middle")
      .attr("x", (d) => {
        const c = path.centroid(d.labelGeom);
        return Number.isFinite(c[0]) ? c[0] : 0;
      })
      .attr("y", (d) => {
        const c = path.centroid(d.labelGeom);
        return Number.isFinite(c[1]) ? c[1] : 0;
      })
      .attr("tabindex", 0)
      .attr("role", "button")
      .text((d) => {
        const circuit = circuits.find((c) => c.id === d.id);
        return circuit ? circuitShortLabel(circuit) : d.id;
      })
      .on("click", (_event, d) => onSelectCircuitRef.current(d.id))
      .on("keydown", (event: KeyboardEvent, d) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectCircuitRef.current(d.id);
      });
    labels.append("title").text((d) => d.name);

    function hideTip() {
      setTip(null);
    }

    function showTip(
      event: { clientX: number; clientY: number },
      d: StateFeature
    ) {
      const name = d.properties.name;
      const row = statesRef.current.find((state) => state.name === name);
      const x = Math.min(event.clientX + 14, window.innerWidth - 300);
      const y = event.clientY + 16;
      if (!row) {
        setTip({
          name,
          untracked: true,
          postureLabel: null,
          caption: null,
          updated: null,
          x,
          y
        });
        return;
      }
      const caption = row.controllingCaseId
        ? (casesRef.current.find((c) => c.id === row.controllingCaseId)
            ?.caption ?? null)
        : null;
      setTip({
        name: row.name,
        untracked: row.posture === "untracked",
        postureLabel: POSTURE_LABELS[row.posture],
        caption,
        updated: formatEtDate(row.updatedAt),
        x,
        y
      });
    }

    function paint() {
      const sel = selectionRef.current;
      const selectedName = sel.state
        ? (statesRef.current.find((state) => state.code === sel.state)?.name ??
          null)
        : null;
      const postures = mapPosturesRef.current;

      g.selectAll<SVGPathElement, StateFeature>("path.st")
        .attr(
          "class",
          (d) => `st ${postureOf(d.properties.name, statesRef.current)}`
        )
        .attr("stroke", (d) =>
          d.properties.name === selectedName
            ? "var(--color-accent)"
            : "var(--color-neutral-500)"
        )
        .attr("stroke-width", (d) =>
          d.properties.name === selectedName ? 2.6 : 0.6
        )
        .attr("opacity", (d) => {
          const row = statesRef.current.find(
            (state) => state.name === d.properties.name
          );
          const circuitHasMembers =
            !sel.circuit ||
            statesRef.current.some((state) => state.circuitId === sel.circuit);
          const inCircuit =
            !sel.circuit ||
            !circuitHasMembers ||
            (row !== undefined && row.circuitId === sel.circuit);
          const posture = postureOf(d.properties.name, statesRef.current);
          const inPosture = postures.size === 0 || postures.has(posture);
          const inStatus = rowMatchesStatusFilter(row, statusFilterRef.current);
          return inCircuit && inPosture && inStatus ? 1 : 0.22;
        })
        .attr(
          "aria-label",
          (d) =>
            `${d.properties.name} — ${POSTURE_LABELS[postureOf(d.properties.name, statesRef.current)]}`
        );

      g.selectAll<SVGPathElement, CircOverlay>("path.circ")
        .attr("stroke", (d) => circStroke(d.id))
        .attr("opacity", (d) =>
          !sel.circuit || d.id === sel.circuit ? 1 : 0.22
        )
        .classed("sel", (d) => d.id === sel.circuit)
        .attr("display", showCircRef.current ? null : "none");

      g.selectAll<SVGTextElement, CircOverlay>("text.clabel")
        .attr("fill", (d) => circStroke(d.id))
        .attr("opacity", (d) =>
          !sel.circuit || d.id === sel.circuit ? 1 : 0.22
        )
        .classed("sel", (d) => d.id === sel.circuit)
        .attr("display", showCircRef.current ? null : "none");
    }

    paintRef.current = paint;
    paint();

    return () => {
      select(svg).selectAll("g").remove();
      paintRef.current = null;
    };
  }, [topo, circuits, states, mapWidth]);

  useEffect(() => {
    paintRef.current?.();
  }, [selection, mapPostures, statusFilter, showCirc, cases]);

  return (
    <>
      <div hidden={failed}>
        <svg
          ref={svgRef}
          data-map
          role="img"
          aria-label="Map of the United States, states shaded by litigation posture"
        />
      </div>
      <div className="mapfallback" hidden={!failed}>
        {MAP_FALLBACK}
      </div>
      <div
        className="tooltip"
        hidden={!tip}
        style={tip ? { left: tip.x, top: tip.y, opacity: 1 } : { opacity: 0 }}
        aria-hidden="true"
      >
        {tip ? (
          <>
            <h4>{tip.name}</h4>
            {tip.untracked ? (
              <div className="tt-row">
                No tracked activity. Absence of a finding is not a finding of
                legality.
              </div>
            ) : (
              <>
                {tip.postureLabel ? (
                  <div className="tt-row">
                    <strong>{tip.postureLabel}</strong>
                  </div>
                ) : null}
                {tip.caption ? (
                  <div className="tt-row">
                    <em>{tip.caption}</em>
                  </div>
                ) : null}
                {tip.updated ? (
                  <div className="tt-row num">Updated {tip.updated}</div>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
