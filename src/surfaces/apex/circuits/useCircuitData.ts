import { useEffect, useState } from "react";

import type { Case } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import type { Posture } from "../../../shared/schemas/vocabulary";

/**
 * Parallel fetch of the published F1 lists the map needs. Pattern copied from
 * useOrientation: useEffect + AbortController, fail closed, no query library.
 *
 * `import type` from schemas so zod does not follow into the client bundle.
 */

export type CircuitData = {
  circuits: Circuit[];
  states: State[];
  cases: Case[];
  listsReady: boolean;
};

const POSTURES: ReadonlySet<string> = new Set([
  "untracked",
  "platform",
  "pending",
  "state",
  "banned"
]);

function isPosture(value: unknown): value is Posture {
  return typeof value === "string" && POSTURES.has(value);
}

function isCircuit(value: unknown): value is Circuit {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    (row.number === null || typeof row.number === "number") &&
    typeof row.name === "string" &&
    isPosture(row.posture) &&
    typeof row.hasSplit === "boolean" &&
    (row.summary === null || typeof row.summary === "string") &&
    typeof row.updatedAt === "string"
  );
}

function isState(value: unknown): value is State {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.code === "string" &&
    typeof row.name === "string" &&
    (row.circuitId === null || typeof row.circuitId === "string") &&
    typeof row.operationalStatus === "string" &&
    isPosture(row.posture) &&
    (row.controllingCaseId === null ||
      typeof row.controllingCaseId === "string") &&
    typeof row.updatedAt === "string"
  );
}

function isCase(value: unknown): value is Case {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.caption === "string";
}

function unwrapItems(body: unknown): unknown[] | null {
  if (body !== null && typeof body === "object" && "items" in body) {
    const items = (body as { items: unknown }).items;
    return Array.isArray(items) ? items : null;
  }
  return null;
}

export function useCircuitData(): CircuitData {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [circuitsReady, setCircuitsReady] = useState(false);
  const [statesReady, setStatesReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const opts: RequestInit = {
      signal: controller.signal,
      headers: { accept: "application/json" }
    };

    const load = (
      path: string,
      apply: (items: unknown[]) => void,
      guard: (item: unknown) => boolean,
      settled: () => void
    ) => {
      fetch(path, opts)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: unknown) => {
          if (controller.signal.aborted) return;
          const items = unwrapItems(body);
          if (items && items.every(guard)) apply(items);
        })
        .catch(() => {
          // Fail closed. AbortError lands here too.
        })
        .finally(() => {
          if (!controller.signal.aborted) settled();
        });
    };

    load(
      "/api/circuits",
      (items) => setCircuits(items as Circuit[]),
      isCircuit,
      () => setCircuitsReady(true)
    );
    load(
      "/api/states",
      (items) => setStates(items as State[]),
      isState,
      () => setStatesReady(true)
    );
    load(
      "/api/cases",
      (items) => setCases(items as Case[]),
      isCase,
      () => {}
    );

    return () => controller.abort();
  }, []);

  return {
    circuits,
    states,
    cases,
    listsReady: circuitsReady && statesReady
  };
}
