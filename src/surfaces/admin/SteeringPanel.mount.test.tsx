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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
