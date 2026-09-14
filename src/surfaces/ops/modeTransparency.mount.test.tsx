// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";
import { ModeTransparency } from "./ModeTransparency";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModeTransparency live fetch (jsdom mount)", () => {
  it("renders the public GET body without a login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ...DEFAULT_APPROVAL_MODE,
          mode: "yolo",
          threshold: 80,
          audit: [
            {
              id: "a1",
              createdAt: "2026-09-13T16:00:00.000Z",
              actorDisplayName: "Patrick",
              kind: "mode",
              prior: { mode: "hitl" },
              next: { mode: "yolo" }
            }
          ]
        })
      }))
    );
    render(<ModeTransparency />);
    await act(async () => {});
    expect(document.body.textContent).toContain("YOLO — autonomous");
    expect(document.body.textContent).toContain("auto-approve threshold 80");
    expect(document.body.textContent).toContain("Patrick");
    expect(document.body.textContent).not.toContain("@");
  });

  it("fails closed to HITL when the public GET is not OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => null
      }))
    );
    render(<ModeTransparency />);
    await act(async () => {});
    expect(document.body.textContent).toContain("HITL — human in the loop");
    expect(document.body.textContent).toContain("auto-approve threshold 70");
    expect(document.body.textContent).not.toContain("YOLO");
  });
});
