// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunLogItem } from "../../shared/schemas/run";
import { LoopControls } from "./LoopControls";

function item(overrides: Partial<RunLogItem> = {}): RunLogItem {
  return {
    id: "run-20261111-0000",
    origin: "scheduled",
    mode: "hitl",
    status: "published",
    startedAt: "2026-11-11T16:00:00.000Z",
    completedAt: "2026-11-11T16:05:00.000Z",
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: null,
    scheduledFor: "2026-11-11",
    eventCount: 1,
    approvalOutcome: "approved",
    ...overrides
  };
}

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

describe("LoopControls live fetch (jsdom mount)", () => {
  it("fails closed to the re-auth EmptyState when the loop GET is not OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted(null, false, 403))
    );
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).not.toContain("Run now");
  });

  it("shows No runs yet and Run now when the loop GET returns latest null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted({ latest: null }))
    );
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("No runs yet.");
    expect(document.body.textContent).toContain("Run now");
    expect(document.body.textContent).not.toContain(
      "Operator re-authentication needed"
    );
  });

  it("asks to supersede prior publish and confirms with the flag", async () => {
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/api/admin/runs")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            supersedePriorPublish?: boolean;
          };
          if (body.supersedePriorPublish === true) {
            return scripted(
              item({ id: "run-20261111-0002", origin: "manual" })
            );
          }
          return scripted(
            {
              code: "supersede_required",
              message: "Confirm supersede of the prior published Run.",
              details: { priorRunId: "run-20261111-0000" }
            },
            false,
            409
          );
        }
        return scripted({ latest: item() });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("Supersede prior publish");
    expect(document.body.textContent).not.toContain("Run now");

    fireEvent.click(
      screen.getByRole("button", { name: "Supersede prior publish" })
    );
    await act(async () => {});
    const confirmCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/api/admin/runs")
        ? JSON.parse(String(call[1]?.body ?? "{}")).supersedePriorPublish ===
          true
        : false
    );
    expect(confirmCall).toBeDefined();
    expect(JSON.parse(String(confirmCall![1]?.body))).toEqual({
      origin: "manual",
      supersedePriorPublish: true
    });
  });
});
