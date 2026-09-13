// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../shared/schemas/mode";
import { AdminShell } from "./admin/AdminShell";
import { OpsShell } from "./ops/OpsShell";

const YOLO_MODE = { ...DEFAULT_APPROVAL_MODE, mode: "yolo" as const };

function stubMode(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/mode")) {
        return {
          ok,
          status: ok ? 200 : 500,
          json: async () => body
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shell TrustBar live mode (jsdom mount)", () => {
  it("keeps HITL/70 and does not imply YOLO when GET /api/mode is not OK", async () => {
    stubMode(null, false);
    render(<OpsShell items={[]} drafts={[]} />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: HITL");
    expect(document.body.textContent).toContain("HITL — human in the loop");
    expect(document.body.textContent).toContain("auto-approve threshold 70");
    expect(document.body.textContent).not.toContain("Gate: YOLO");
    expect(document.body.textContent).not.toContain("YOLO — autonomous");
  });

  it("shows Gate: YOLO on ops when GET /api/mode is yolo", async () => {
    stubMode(YOLO_MODE);
    render(<OpsShell items={[]} drafts={[]} />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).not.toContain("Gate: HITL");
  });

  it("shows Gate: YOLO on admin when GET /api/mode is yolo", async () => {
    stubMode(YOLO_MODE);
    render(<AdminShell />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).toContain("Autonomous ON — YOLO");
    expect(document.body.textContent).not.toContain("Gate: HITL");
  });
});
