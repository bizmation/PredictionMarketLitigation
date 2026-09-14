import { useEffect, useState } from "react";

import {
  ApprovalModeSchema,
  DEFAULT_APPROVAL_MODE,
  type ApprovalMode
} from "../shared/schemas/mode";

/**
 * Live gate mode for TrustBar + #mode bands. Fail-closes to HITL/70 so a
 * fetch error never implies YOLO.
 */

export { DEFAULT_APPROVAL_MODE };

export function useApprovalMode(injected?: ApprovalMode): {
  mode: ApprovalMode;
  setMode: (next: ApprovalMode) => void;
} {
  const [mode, setMode] = useState<ApprovalMode>(
    injected ?? DEFAULT_APPROVAL_MODE
  );

  useEffect(() => {
    if (injected !== undefined) {
      setMode(injected);
      return;
    }
    const controller = new AbortController();
    fetch("/api/mode", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const parsed = ApprovalModeSchema.safeParse(body);
        if (parsed.success) setMode(parsed.data);
      })
      .catch(() => {
        // Keep HITL default. Never imply YOLO on a public GET error.
      });
    return () => controller.abort();
  }, [injected]);

  return { mode, setMode };
}
