// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STEERING_POST_TIMEOUT_MS } from "../../shared/lib/timeouts";
import { STEERING_TIMEOUT_MESSAGE, SteeringPanel } from "./SteeringPanel";

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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
        revisionReady
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "typed for draft A" }
    });
    fireEvent.click(screen.getByLabelText("Mark private at submit"));
    rerender(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-2" />
    );
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
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "why skipped" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    rerender(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-2" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    expect(document.body.textContent).toContain(
      "Pipeline sources updated to version 1; they take effect on the next Run."
    );
    expect(document.body.textContent).not.toContain(
      '{"key":"poll_sources","value":[]}'
    );
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("");
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
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

describe("SteeringPanel standing guidance (story 3.18)", () => {
  const TURN_BASE = {
    id: "st-g1",
    runId: "run-20260914-aaa1",
    draftId: "d-1",
    actor: "Patrick",
    role: "steward",
    reply: null,
    private: false,
    revisedDraftId: null,
    configVersion: null,
    createdAt: "2026-09-14T16:00:00.000Z"
  };

  function emptyConfig() {
    return scripted({
      key: "poll_sources",
      version: 0,
      sources: [],
      history: []
    });
  }

  function guidanceBody(
    inForce: Array<{
      itemId: string;
      version: number;
      content: string;
    }>,
    cap = 12
  ) {
    return {
      cap,
      maxChars: 600,
      inForce: inForce.map((item) => ({
        ...item,
        status: "active",
        actor: "Patrick",
        createdAt: "2026-09-14T16:00:00.000Z",
        revokedAt: null,
        sourceTurnId: "st-0"
      })),
      history: []
    };
  }

  it("POSTs intent guidance from Record guidance, then reloads the in-force list", async () => {
    let guidanceGets = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        guidanceGets += 1;
        return scripted(
          guidanceBody(
            guidanceGets === 1
              ? []
              : [{ itemId: "sg:one", version: 1, content: "Cite the docket." }]
          )
        );
      }
      return scripted({
        ...TURN_BASE,
        content: "Cite the docket.",
        guidanceItemId: "sg:one",
        guidanceVersion: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Standing guidance in force: 0 of 12"
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Cite the docket." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record guidance" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Cite the docket.",
          private: false,
          draftId: "d-1",
          intent: "guidance"
        })
      })
    );
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).toContain(
      "Guidance recorded; it takes effect on the next Run and on any Revise draft from now on."
    );
    expect(document.body.textContent).toContain(
      "Standing guidance in force: 1 of 12"
    );
    expect(document.body.textContent).toContain("Cite the docket.");
    expect(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revoke guidance sg:one" })
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("");
  });

  it("Edit prefills the composer and POSTs guidanceItemId with the new text", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        return scripted(
          guidanceBody([
            { itemId: "sg:one", version: 1, content: "Cite the docket." }
          ])
        );
      }
      return scripted({
        ...TURN_BASE,
        content: "Cite the docket and court.",
        guidanceItemId: "sg:one",
        guidanceVersion: 2
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    );
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("Cite the docket.");
    expect(document.body.textContent).toContain(
      "Editing standing guidance sg:one (version 1)"
    );
    expect(
      screen.getByRole("button", { name: "Save guidance edit" })
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Cite the docket and court." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save guidance edit" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Cite the docket and court.",
          private: false,
          draftId: "d-1",
          intent: "guidance",
          guidanceItemId: "sg:one"
        })
      })
    );
    expect(document.body.textContent).toContain(
      "Guidance updated to version 2"
    );
    expect(document.body.textContent).not.toContain(
      "Editing standing guidance"
    );
    expect(
      screen.getByRole("button", { name: "Record guidance" })
    ).toBeTruthy();
  });

  it("clears the edit pin on a successful non-guidance submit", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        return scripted(
          guidanceBody([
            { itemId: "sg:one", version: 1, content: "Cite the docket." }
          ])
        );
      }
      return scripted({
        ...TURN_BASE,
        content: "why skipped",
        reply: "federal-register was skipped",
        guidanceItemId: null,
        guidanceVersion: null
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    );
    expect(document.body.textContent).toContain(
      "Editing standing guidance sg:one"
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "why skipped" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(steeringPosts(fetchMock)[0]![1]!.body))).toEqual({
      content: "why skipped",
      private: false,
      draftId: "d-1"
    });
    expect(document.body.textContent).not.toContain(
      "Editing standing guidance"
    );
    expect(
      screen.getByRole("button", { name: "Record guidance" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save guidance edit" })
    ).toBeNull();
  });

  it("refuses to Revoke a different item while an edit is pinned and posts nothing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      return scripted(
        guidanceBody([
          { itemId: "sg:one", version: 1, content: "Cite the docket." },
          { itemId: "sg:two", version: 1, content: "Never guess motive." }
        ])
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    );
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("Cite the docket.");
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke guidance sg:two" })
    );
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(0);
    expect(document.body.textContent).toContain(
      "Cancel the current edit first."
    );
    expect(document.body.textContent).toContain(
      "Editing standing guidance sg:one"
    );
  });

  it("drops the edit pin when the selected Draft changes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      return scripted(
        guidanceBody([
          { itemId: "sg:one", version: 1, content: "Cite the docket." }
        ])
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    );
    expect(
      screen.getByRole("button", { name: "Save guidance edit" })
    ).toBeTruthy();
    rerender(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-2" />
    );
    await act(async () => {});
    expect(
      screen.getByRole("button", { name: "Record guidance" })
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(
      "Editing standing guidance"
    );
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("");
    expect(steeringPosts(fetchMock)).toHaveLength(0);
  });

  it("Cancel edit clears the composer and restores Record guidance", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      return scripted(
        guidanceBody([
          { itemId: "sg:one", version: 1, content: "Cite the docket." }
        ])
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Edit guidance sg:one" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("");
    expect(
      screen.getByRole("button", { name: "Record guidance" })
    ).toBeTruthy();
    expect(steeringPosts(fetchMock)).toHaveLength(0);
  });

  it("Revoke POSTs revoke true with the composer text as the public reason", async () => {
    let guidanceGets = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        guidanceGets += 1;
        return scripted(
          guidanceBody(
            guidanceGets === 1
              ? [{ itemId: "sg:one", version: 1, content: "Cite the docket." }]
              : []
          )
        );
      }
      return scripted({
        ...TURN_BASE,
        content: "Superseded by the ruling.",
        guidanceItemId: "sg:one",
        guidanceVersion: 2
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke guidance sg:one" })
    );
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(0);
    expect(document.body.textContent).toContain(
      "Type the public reason for revoking this guidance"
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Superseded by the ruling." }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke guidance sg:one" })
    );
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/runs/run-20260914-aaa1/steering",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Superseded by the ruling.",
          private: false,
          draftId: "d-1",
          intent: "guidance",
          guidanceItemId: "sg:one",
          revoke: true
        })
      })
    );
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).toContain(
      "Guidance revoked; the next Run and any Revise draft from now on will not see it."
    );
    expect(document.body.textContent).toContain(
      "Standing guidance in force: 0 of 12"
    );
    expect(
      screen.queryByRole("button", { name: "Revoke guidance sg:one" })
    ).toBeNull();
  });

  it("shows the calm cap message from the server and the cap note when full", async () => {
    const full = Array.from({ length: 12 }, (_, i) => ({
      itemId: `sg:${i}`,
      version: 1,
      content: `Item ${i}`
    }));
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        return scripted(guidanceBody(full));
      }
      return scripted(
        {
          code: "bad_request",
          message:
            "Standing guidance is at its cap of 12 in-force items. Revoke or edit an existing item to make room."
        },
        false,
        400
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Standing guidance in force: 12 of 12"
    );
    expect(document.body.textContent).toContain("The cap is reached");
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "One more." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record guidance" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Standing guidance is at its cap of 12 in-force items."
    );
    expect(document.body.textContent).not.toContain("Try again.");
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("One more.");
  });

  it("shows a guidance budget-ceiling message on 409 budget_stopped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/pipeline-config")) return emptyConfig();
        if (String(url).includes("/api/standing-guidance")) {
          return scripted(guidanceBody([]));
        }
        return scripted({ code: "budget_stopped" }, false, 409);
      })
    );
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Cite the docket." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record guidance" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Guidance was not recorded because spend hit the ceiling."
    );
  });

  it("keeps the composer usable when the public guidance GET fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/pipeline-config")) return emptyConfig();
      if (String(url).includes("/api/standing-guidance")) {
        return scripted({ code: "error" }, false, 500);
      }
      return scripted({
        ...TURN_BASE,
        content: "Cite the docket.",
        guidanceItemId: "sg:one",
        guidanceVersion: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel revisionReady runId="run-20260914-aaa1" draftId="d-1" />
    );
    await act(async () => {});
    expect(document.body.textContent).not.toContain(
      "Standing guidance in force"
    );
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "Cite the docket." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record guidance" }));
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).toContain("Guidance recorded");
  });
});

describe("SteeringPanel POST timeout (story 3.19, jsdom mount)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears busy, re-enables the queue, and shows a designed error when the steering POST hangs past STEERING_POST_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    const onSubmittingChange = vi.fn();
    const fetchMock = vi.fn((_input: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<never>(() => {});
      return Promise.resolve(
        scripted({ version: 0, sources: [], history: [] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SteeringPanel
        revisionReady
        runId="run-20260914-aaa1"
        draftId="d-1"
        onSubmittingChange={onSubmittingChange}
      />
    );
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "hello" }
    });
    const submit = screen.getByRole("button", { name: "Submit turn" });
    fireEvent.click(submit);
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(1);
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    // Outlasts the 30 s admin POST deadline: a slow revise is not a timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEERING_POST_TIMEOUT_MS - 1);
    });
    expect(STEERING_POST_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(STEERING_TIMEOUT_MESSAGE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
    expect(document.body.textContent).toContain(STEERING_TIMEOUT_MESSAGE);
    expect(STEERING_TIMEOUT_MESSAGE).toContain("130 seconds");
    // The composer keeps the operator's text: a timed-out turn is not lost.
    expect(
      (screen.getByLabelText("Steering turn") as HTMLTextAreaElement).value
    ).toBe("hello");
    // A second submit is possible again (busy really cleared).
    fireEvent.click(submit);
    await act(async () => {});
    expect(steeringPosts(fetchMock)).toHaveLength(2);
  });
});
