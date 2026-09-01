/**
 * Apex selection — the URL-param contract Story 2.4 will sync the board to.
 *
 * Shape is `{ state: code | null, circuit: id | null }` where `state` is the
 * 2-letter seed code (`NJ`) and `circuit` is the seed id (`cir-3`). Invalid
 * values fail closed (ignored). Pure parse/serialize — no `window`.
 */

export type ApexSelection = {
  state: string | null;
  circuit: string | null;
};

const STATE_RE = /^[A-Za-z]{2}$/;
const CIRCUIT_RE = /^cir-(?:[1-9]|1[01]|dc|fed)$/i;

function normalizeCircuitId(id: string): string {
  const lower = id.toLowerCase();
  if (lower === "cir-dc") return "cir-dc";
  if (lower === "cir-fed") return "cir-fed";
  return lower;
}

export function parseApexSelection(search: string): ApexSelection {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const rawState = params.get("state");
  const rawCircuit = params.get("circuit");
  return {
    state: rawState && STATE_RE.test(rawState) ? rawState.toUpperCase() : null,
    circuit:
      rawCircuit && CIRCUIT_RE.test(rawCircuit)
        ? normalizeCircuitId(rawCircuit)
        : null
  };
}

export function serializeApexSelection(
  selection: ApexSelection,
  existingSearch = ""
): string {
  const raw = existingSearch.startsWith("?")
    ? existingSearch.slice(1)
    : existingSearch;
  const params = new URLSearchParams(raw);
  if (selection.state) params.set("state", selection.state);
  else params.delete("state");
  if (selection.circuit) params.set("circuit", selection.circuit);
  else params.delete("circuit");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function constrainApexSelection(
  selection: ApexSelection,
  stateCodes: ReadonlySet<string>,
  circuitIds: ReadonlySet<string>
): ApexSelection {
  if (stateCodes.size === 0 && circuitIds.size === 0) {
    return { state: null, circuit: null };
  }
  return {
    state:
      stateCodes.size === 0
        ? selection.state
        : selection.state && stateCodes.has(selection.state)
          ? selection.state
          : null,
    circuit:
      circuitIds.size === 0
        ? selection.circuit
        : selection.circuit && circuitIds.has(selection.circuit)
          ? selection.circuit
          : null
  };
}

/**
 * URL hydrate for the selection hook. Do not rewrite until both F1 lists have
 * settled — a staggered `/api/states` vs `/api/circuits` arrival must not drop
 * the param that belongs to the list that has not landed yet.
 */
export function nextApexSearch(
  search: string,
  stateCodes: ReadonlySet<string>,
  circuitIds: ReadonlySet<string>,
  listsReady: boolean
): { selection: ApexSelection; search: string } {
  const parsed = parseApexSelection(search);
  if (!listsReady) return { selection: parsed, search };
  const selection = constrainApexSelection(parsed, stateCodes, circuitIds);
  return { selection, search: serializeApexSelection(selection, search) };
}

export function selectionForState(
  code: string,
  states: ReadonlyArray<{ code: string; circuitId: string | null }>
): ApexSelection {
  const row = states.find((state) => state.code === code);
  if (!row) return { state: null, circuit: null };
  return { state: row.code, circuit: row.circuitId };
}

export function selectionForCircuit(
  circuitId: string,
  states: ReadonlyArray<{ code: string; circuitId: string | null }>,
  current: ApexSelection
): ApexSelection {
  const member = states.find((state) => state.circuitId === circuitId);
  return {
    circuit: circuitId,
    state: member ? member.code : current.state
  };
}

export function clearCircuitSelection(current: ApexSelection): ApexSelection {
  return { state: current.state, circuit: null };
}
