// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";
import { MODE_TIMEOUT_NOTICE, ModeControls } from "./ModeControls";

type ScriptedResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function scripted(
  body: unknown,
  ok = true,
  status = ok ? 200 : 500
): ScriptedResponse {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModeControls live fetch (jsdom mount)", () => {
  it("fails closed to the re-auth EmptyState when POST is 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/admin/mode") && init?.method === "POST") {
          return scripted(
            { code: "forbidden", message: "Operator authorization required." },
            false,
            403
          );
        }
        return scripted(DEFAULT_APPROVAL_MODE);
      })
    );
    render(<ModeControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Autonomous mode" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).not.toContain("Autonomous mode is OFF");
  });

  it("POSTs yolo when the toggle is pressed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/mode") && init?.method === "POST") {
        return scripted({
          ...DEFAULT_APPROVAL_MODE,
          mode: "yolo",
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
        });
      }
      return scripted(DEFAULT_APPROVAL_MODE);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ModeControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Autonomous mode" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/mode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "yolo" })
      })
    );
    expect(document.body.textContent).toContain("Autonomous mode is ON");
    expect(document.body.textContent).toContain("Patrick");
    expect(document.body.textContent).not.toContain("@");
  });

  it("commits the threshold on pointer-up, not every change tick", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/mode") && init?.method === "POST") {
        return scripted({
          ...DEFAULT_APPROVAL_MODE,
          threshold: 80
        });
      }
      return scripted(DEFAULT_APPROVAL_MODE);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ModeControls />);
    await act(async () => {});
    const slider = screen.getByRole("slider", {
      name: "Auto-approve threshold"
    });
    fireEvent.change(slider, { target: { value: "80" } });
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/admin/mode",
      expect.objectContaining({ method: "POST" })
    );
    fireEvent.pointerUp(slider);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/mode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ threshold: 80 })
      })
    );
    expect((slider as HTMLInputElement).value).toBe("80");
  });

  it("restores the last confirmed threshold when POST is not OK", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/mode") && init?.method === "POST") {
        return scripted({ code: "error" }, false, 500);
      }
      return scripted(DEFAULT_APPROVAL_MODE);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ModeControls />);
    await act(async () => {});
    const slider = screen.getByRole("slider", {
      name: "Auto-approve threshold"
    });
    fireEvent.change(slider, { target: { value: "80" } });
    fireEvent.pointerUp(slider);
    await act(async () => {});
    expect((slider as HTMLInputElement).value).toBe("70");
    expect(document.body.textContent).not.toContain("YOLO");
  });
});

describe("ModeControls POST timeout (story 3.19, jsdom mount)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-enables the controls with a notice and re-fetches GET /api/mode when the POST hangs 30 s", async () => {
    vi.useFakeTimers();
    let gets = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/mode") && init?.method === "POST") {
        return new Promise<never>(() => {});
      }
      gets += 1;
      // The server did apply the change; the resync GET reveals it.
      return Promise.resolve(
        scripted(
          gets === 1
            ? DEFAULT_APPROVAL_MODE
            : { ...DEFAULT_APPROVAL_MODE, mode: "yolo" }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ModeControls />);
    await act(async () => {});
    expect(gets).toBe(1);

    const toggle = screen.getByRole("button", { name: "Autonomous mode" });
    const slider = screen.getByLabelText("Auto-approve threshold");
    fireEvent.click(toggle);
    await act(async () => {});
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect((slider as HTMLInputElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(MODE_TIMEOUT_NOTICE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect((slider as HTMLInputElement).disabled).toBe(false);
    expect(document.body.textContent).toContain(MODE_TIMEOUT_NOTICE);
    expect(gets).toBe(2);
    expect(document.body.textContent).toContain("Autonomous mode is ON");
  });
});
