/**
 * Apex selection — URL-param contract for map, board, case record, and issue.
 *
 * Shape is `{ state, circuit, case, issue }` where `state` is the 2-letter seed
 * code (`NJ`), `circuit` is the seed id (`cir-3`), `case` is the seed id
 * (`case-flaherty`), and `issue` is the seed slug (`cea-preemption`). Invalid
 * values fail closed. Pure parse/serialize — no `window`.
 */

export type ApexSelection = {
  state: string | null;
  circuit: string | null;
  case: string | null;
  issue: string | null;
};

const STATE_RE = /^[A-Za-z]{2}$/;
const CIRCUIT_RE = /^cir-(?:[1-9]|1[01]|dc|fed)$/i;
const CASE_RE = /^case-[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const ISSUE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function normalizeCircuitId(id: string): string {
  const lower = id.toLowerCase();
  if (lower === "cir-dc") return "cir-dc";
  if (lower === "cir-fed") return "cir-fed";
  return lower;
}

function axisValue(
  current: string | null,
  membership: ReadonlySet<string>
): string | null {
  if (membership.size === 0) return current;
  return current && membership.has(current) ? current : null;
}

export function parseApexSelection(search: string): ApexSelection {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const rawState = params.get("state");
  const rawCircuit = params.get("circuit");
  const rawCase = params.get("case");
  const rawIssue = params.get("issue");
  return {
    state: rawState && STATE_RE.test(rawState) ? rawState.toUpperCase() : null,
    circuit:
      rawCircuit && CIRCUIT_RE.test(rawCircuit)
        ? normalizeCircuitId(rawCircuit)
        : null,
    case: rawCase && CASE_RE.test(rawCase) ? rawCase.toLowerCase() : null,
    issue: rawIssue && ISSUE_RE.test(rawIssue) ? rawIssue.toLowerCase() : null
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
  if (selection.case) params.set("case", selection.case);
  else params.delete("case");
  if (selection.issue) params.set("issue", selection.issue);
  else params.delete("issue");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function constrainApexSelection(
  selection: ApexSelection,
  stateCodes: ReadonlySet<string>,
  circuitIds: ReadonlySet<string>,
  caseIds: ReadonlySet<string>,
  issueSlugs: ReadonlySet<string>
): ApexSelection {
  if (
    stateCodes.size === 0 &&
    circuitIds.size === 0 &&
    caseIds.size === 0 &&
    issueSlugs.size === 0
  ) {
    return { state: null, circuit: null, case: null, issue: null };
  }
  return {
    state: axisValue(selection.state, stateCodes),
    circuit: axisValue(selection.circuit, circuitIds),
    case: axisValue(selection.case, caseIds),
    issue: axisValue(selection.issue, issueSlugs)
  };
}

/**
 * URL hydrate for the selection hook. Do not rewrite until F1 lists have
 * settled — a staggered `/api/states` vs `/api/circuits` vs `/api/cases`
 * arrival must not drop the param that belongs to the list that has not landed
 * yet. Issue slugs are derived from the cases list, so they settle with cases.
 */
export function nextApexSearch(
  search: string,
  stateCodes: ReadonlySet<string>,
  circuitIds: ReadonlySet<string>,
  caseIds: ReadonlySet<string>,
  issueSlugs: ReadonlySet<string>,
  listsReady: boolean
): { selection: ApexSelection; search: string } {
  const parsed = parseApexSelection(search);
  if (!listsReady) return { selection: parsed, search };
  const selection = constrainApexSelection(
    parsed,
    stateCodes,
    circuitIds,
    caseIds,
    issueSlugs
  );
  return { selection, search: serializeApexSelection(selection, search) };
}

export function selectionForState(
  code: string,
  states: ReadonlyArray<{ code: string; circuitId: string | null }>,
  current: ApexSelection
): ApexSelection {
  const row = states.find((state) => state.code === code);
  if (!row) {
    return { state: null, circuit: null, case: null, issue: current.issue };
  }
  return {
    state: row.code,
    circuit: row.circuitId,
    case: null,
    issue: current.issue
  };
}

export function selectionForCircuit(
  circuitId: string,
  states: ReadonlyArray<{ code: string; circuitId: string | null }>,
  current: ApexSelection
): ApexSelection {
  const member = states.find((state) => state.circuitId === circuitId);
  return {
    circuit: circuitId,
    state: member ? member.code : current.state,
    case: current.case,
    issue: current.issue
  };
}

export function selectionForCase(
  id: string,
  current: ApexSelection
): ApexSelection {
  return { ...current, case: id };
}

export function selectionForIssue(
  slug: string | null,
  current: ApexSelection
): ApexSelection {
  if (slug === null || current.issue === slug) {
    return { ...current, issue: null };
  }
  return { ...current, issue: slug };
}

export function clearedIssueSelection(current: ApexSelection): ApexSelection {
  return { ...current, issue: null };
}

/** State-detail retry epoch. Do not bump for issue/case-only clicks. */
export function shouldBumpStateDetailEpoch(
  prev: ApexSelection,
  next: ApexSelection
): boolean {
  if (next.state !== prev.state || next.circuit !== prev.circuit) return true;
  return (
    next.state !== null && next.case === prev.case && next.issue === prev.issue
  );
}

export function clearCircuitSelection(current: ApexSelection): ApexSelection {
  return {
    state: current.state,
    circuit: null,
    case: current.case,
    issue: current.issue
  };
}
