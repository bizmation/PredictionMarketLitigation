import { useCallback, useEffect, useState } from "react";

import {
  constrainApexSelection,
  nextApexSearch,
  serializeApexSelection,
  type ApexSelection
} from "./selection";

/**
 * Shareable apex selection via `history.replaceState`. No router library.
 * URL is the source on mount; clicks write back. Do not read `window.location`
 * during render.
 */

type UseApexSelection = {
  selection: ApexSelection;
  commit: (next: ApexSelection) => void;
};

function writeSelection(next: ApexSelection): void {
  const query = serializeApexSelection(next, window.location.search);
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

function setFromKey(key: string): Set<string> {
  return new Set(key === "" ? [] : key.split(","));
}

export function useApexSelection(
  stateCodes: readonly string[],
  circuitIds: readonly string[],
  listsReady = true
): UseApexSelection {
  const [selection, setSelection] = useState<ApexSelection>({
    state: null,
    circuit: null
  });

  const stateKey = [...stateCodes].sort().join(",");
  const circuitKey = [...circuitIds].sort().join(",");

  useEffect(() => {
    const next = nextApexSearch(
      window.location.search,
      setFromKey(stateKey),
      setFromKey(circuitKey),
      listsReady
    );
    setSelection(next.selection);
    if (!listsReady) return;
    if (next.search !== window.location.search) {
      writeSelection(next.selection);
    }
  }, [stateKey, circuitKey, listsReady]);

  const commit = useCallback(
    (next: ApexSelection) => {
      const constrained = constrainApexSelection(
        next,
        setFromKey(stateKey),
        setFromKey(circuitKey)
      );
      setSelection(constrained);
      writeSelection(constrained);
    },
    [stateKey, circuitKey]
  );

  return { selection, commit };
}
