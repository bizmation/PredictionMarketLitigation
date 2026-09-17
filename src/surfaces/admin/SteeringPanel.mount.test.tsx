// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SteeringPanel } from "./SteeringPanel";

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

function steeringPosts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/steering")
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SteeringPanel live submit (jsdom mount)", () => {
  it("POSTs content, private, and draftId to the admin steering route", async () => {
    const fetchMock = vi.fn(async () =>
      scripted({
        id: "st-1",
        runId: "run-20260914-aaa1",
        draftId: "d-1",
        actor: "Patrick",
        role: "steward",
        content: null,
        reply: null,
        private: true,
        createdAt: "2026-09-14T16:00:00.000Z"
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    fireEvent.click(screen.getByLabelText("Mark private at submit"));
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pipeline-config",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "hello",
          private: true,
          draftId: "d-1"
        })
      })
    );
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).toContain("content withheld");
    expect(document.body.textContent).toContain("Submit turn");
  });

  it("POSTs intent revise and notifies onRevised with the new Draft id", async () => {
    const onRevised = vi.fn();
    const fetchMock = vi.fn(async () =>
      scripted({
        id: "st-1",
        runId: "run-20260914-aaa1",
        draftId: "d-1",
        actor: "Patrick",
        role: "steward",
        content: "tighten the holding",
        reply: null,
        private: false,
        revisedDraftId: "d-1:r1",
        createdAt: "2026-09-14T16:00:00.000Z"
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel
        runId="run-20260914-aaa1"
        draftId="d-1"
        onRevised={onRevised}
      />
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "tighten the holding" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Revise draft" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "tighten the holding",
          private: false,
          draftId: "d-1",
          intent: "revise"
        })
      })
    );
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(onRevised).toHaveBeenCalledWith("d-1:r1");
    expect(onRevised).toHaveBeenCalledTimes(1);
  });

  it("locks a second click before busy re-renders", async () => {
    let resolveFetch: ((value: ScriptedResponse) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<ScriptedResponse>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    await act(async () => {
      resolveFetch?.(
        scripted({
          id: "st-1",
          runId: "run-20260914-aaa1",
          draftId: "d-1",
          actor: "Patrick",
          role: "steward",
          content: "hello",
          private: false,
          createdAt: "2026-09-14T16:00:00.000Z"
        })
      );
    });
  });

  it("shows a budget-ceiling message on 409 budget_stopped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted({ code: "budget_stopped" }, false, 409))
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "tighten the holding" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Revise draft" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Revision did not complete because spend hit the ceiling."
    );
    expect(document.body.textContent).not.toContain("Try again.");
  });

  it("shows the server message when revise does not complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        scripted(
          { code: "bad_request", message: "Revision did not complete." },
          false,
          400
        )
      )
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "tighten the holding" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Revise draft" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("Revision did not complete.");
    expect(document.body.textContent).not.toContain("Submit failed.");
  });

  it("shows a short failure message on non-403 POST failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted({ code: "error" }, false, 500))
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("Submit failed. Try again.");
    expect(document.body.textContent).toContain("Submit turn");
  });

  it("shows a short failure message when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      })
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("Submit failed. Try again.");
  });

  it("fails closed to the re-auth EmptyState when POST is 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        scripted(
          { code: "forbidden", message: "Operator authorization required." },
          false,
          403
        )
      )
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).not.toContain("Submit turn");
  });

  it("shows the last public reply under the composer after 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        scripted({
          id: "st-1",
          runId: "run-20260914-aaa1",
          draftId: "d-1",
          actor: "Patrick",
          role: "steward",
          content: "why skipped",
          reply: "federal-register was skipped",
          private: false,
          createdAt: "2026-09-14T16:00:00.000Z"
        })
      )
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "why skipped" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("federal-register was skipped");
    expect(document.body.textContent).toContain("Submit turn");
    expect(document.body.textContent).not.toContain("content withheld");
  });

  it("clears composer content and private when the selected Draft changes", () => {
    const { rerender } = render(
      <SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "typed for draft A" }
    });
    fireEvent.click(screen.getByLabelText("Mark private at submit"));
    rerender(<SteeringPanel runId="run-20260914-aaa1" draftId="d-2" />);
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Mark private at submit") as HTMLInputElement)
        .checked
    ).toBe(false);
  });

  it("ignores an in-flight reply after the selected Draft changes", async () => {
    let resolveFetch: ((value: ScriptedResponse) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<ScriptedResponse>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const { rerender } = render(
      <SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "why skipped" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    rerender(<SteeringPanel runId="run-20260914-aaa1" draftId="d-2" />);
    await act(async () => {
      resolveFetch?.(
        scripted({
          id: "st-1",
          runId: "run-20260914-aaa1",
          draftId: "d-1",
          actor: "Patrick",
          role: "steward",
          content: "why skipped",
          reply: "stale reply for draft A",
          private: false,
          createdAt: "2026-09-14T16:00:00.000Z"
        })
      );
    });
    expect(document.body.textContent).not.toContain("stale reply for draft A");
  });

  it("POSTs intent config from Steer pipeline", async () => {
    let configGets = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) {
        configGets += 1;
        if (configGets === 1) {
          return scripted({
            key: "poll_sources",
            version: 0,
            sources: [],
            history: []
          });
        }
        return scripted({
          key: "poll_sources",
          version: 1,
          sources: [],
          history: [
            {
              version: 1,
              key: "poll_sources",
              prior: [],
              next: [],
              actor: "Patrick",
              createdAt: "2026-09-14T16:00:00.000Z"
            }
          ]
        });
      }
      return scripted({
        id: "st-1",
        runId: "run-20260914-aaa1",
        draftId: "d-1",
        actor: "Patrick",
        role: "steward",
        content: "Add the ND Cal docket to Tier-1.",
        reply: '{"key":"poll_sources","value":[]}',
        private: false,
        revisedDraftId: null,
        configVersion: 1,
        createdAt: "2026-09-14T16:00:00.000Z"
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Add the ND Cal docket to Tier-1." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Steer pipeline" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Add the ND Cal docket to Tier-1.",
          private: false,
          draftId: "d-1",
          intent: "config"
        })
      })
    );
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Revert to seed" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revert to version 1" })
    ).toBeTruthy();
  });

  it("POSTs revertToVersion and key for a listed pipeline-config version", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) {
        return scripted({
          key: "poll_sources",
          version: 1,
          sources: [],
          history: [
            {
              version: 1,
              key: "poll_sources",
              prior: [],
              next: [],
              actor: "Patrick",
              createdAt: "2026-09-14T16:00:00.000Z"
            }
          ]
        });
      }
      return scripted({
        id: "st-2",
        runId: "run-20260914-aaa1",
        draftId: "d-1",
        actor: "Patrick",
        role: "steward",
        content: "Revert poll_sources to version 1",
        reply: null,
        private: false,
        revisedDraftId: null,
        configVersion: 2,
        createdAt: "2026-09-14T16:00:00.000Z"
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Revert to version 1" })
    );
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Revert poll_sources to version 1",
          private: false,
          draftId: "d-1",
          intent: "config",
          key: "poll_sources",
          revertToVersion: 1
        })
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Revert to seed" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Revert poll_sources to version 0",
          private: false,
          draftId: "d-1",
          intent: "config",
          key: "poll_sources",
          revertToVersion: 0
        })
      })
    );
  });

  it("shows a config budget-ceiling message on 409 budget_stopped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/pipeline-config")) {
          return scripted({
            key: "poll_sources",
            version: 0,
            sources: [],
            history: []
          });
        }
        return scripted({ code: "budget_stopped" }, false, 409);
      })
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Add a docket." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Steer pipeline" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Config did not apply because spend hit the ceiling."
    );
    expect(document.body.textContent).not.toContain("Try again.");
  });

  it("shows a refused message on config 200 without configVersion and keeps the instruction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/pipeline-config")) {
          return scripted({
            key: "poll_sources",
            version: 0,
            sources: [],
            history: []
          });
        }
        return scripted({
          id: "st-1",
          runId: "run-20260914-aaa1",
          draftId: "d-1",
          actor: "Patrick",
          role: "steward",
          content: "Switch the gate to YOLO.",
          reply: '{"key":"mode","value":null}',
          private: false,
          revisedDraftId: null,
          configVersion: null,
          createdAt: "2026-09-14T16:00:00.000Z"
        });
      })
    );
    render(<SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />);
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Switch the gate to YOLO." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Steer pipeline" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Those controls are unchanged; the request was refused."
    );
    expect(document.body.textContent).not.toContain(
      '{"key":"mode","value":null}'
    );
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("Switch the gate to YOLO.");
  });
});
