import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  CLIENT_GET_TIMEOUT_MS,
  STEERING_POST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError
} from "../../shared/lib/timeouts";
import { EmptyState } from "../../shared/ui";

/**
 * Story 3.15/3.16/3.17/3.18 — operator steering composer. Submit turn is
 * ask (default). Revise is an explicit second control that sends
 * `intent: "revise"`. Steer pipeline sends `intent: "config"`. Record
 * guidance sends `intent: "guidance"`; the in-force list (from the public
 * GET) offers per-item Edit (prefills the composer and pins
 * `guidanceItemId`) and Revoke (`revoke: true` with the composer text as
 * the public reason). After a 200, the last steward reply (or “content
 * withheld” when private) is shown under the composer. A successful
 * revise notifies the queue with `revisedDraftId`. Privacy is chosen at
 * submit and cannot be undone. 403 fails closed to the signed-out
 * EmptyState. Revert of a listed `poll_sources` version is a structured
 * POST on the same route.
 */

type SteeringPanelProps = {
  runId: string;
  draftId: string;
  onRevised?: (revisedDraftId: string) => void;
  onSubmittingChange?: (submitting: boolean) => void;
};

type View = { status: "ready" } | { status: "signedOut" };

export const STEERING_TIMEOUT_MESSAGE = `No answer within ${Math.round(STEERING_POST_TIMEOUT_MS / 1000)} seconds. The turn may still have been recorded — check the Run's Evidence before resubmitting.`;

function submitFailureMessage(err: unknown): string {
  return isTimeoutError(err)
    ? STEERING_TIMEOUT_MESSAGE
    : "Submit failed. Try again.";
}

type PipelineHistoryItem = {
  version: number;
  key: string;
  actor: string;
  createdAt: string;
};

type PipelineConfigView = {
  version: number;
  history: PipelineHistoryItem[];
};

type GuidanceItemView = {
  itemId: string;
  version: number;
  content: string;
  actor: string;
  createdAt: string;
};

type StandingGuidanceView = {
  cap: number;
  maxChars: number;
  inForce: GuidanceItemView[];
};

function parseStandingGuidance(body: unknown): StandingGuidanceView | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const row = body as Record<string, unknown>;
  if (typeof row.cap !== "number") return null;
  if (typeof row.maxChars !== "number") return null;
  if (!Array.isArray(row.inForce)) return null;
  const inForce: GuidanceItemView[] = [];
  for (const item of row.inForce) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.itemId !== "string") continue;
    if (typeof entry.version !== "number") continue;
    if (typeof entry.content !== "string") continue;
    if (typeof entry.actor !== "string") continue;
    if (typeof entry.createdAt !== "string") continue;
    inForce.push({
      itemId: entry.itemId,
      version: entry.version,
      content: entry.content,
      actor: entry.actor,
      createdAt: entry.createdAt
    });
  }
  return { cap: row.cap, maxChars: row.maxChars, inForce };
}

function parsePipelineConfig(body: unknown): PipelineConfigView | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const row = body as Record<string, unknown>;
  if (typeof row.version !== "number") return null;
  if (!Array.isArray(row.history)) return null;
  const history: PipelineHistoryItem[] = [];
  for (const item of row.history) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.version !== "number") continue;
    if (typeof entry.key !== "string") continue;
    if (typeof entry.actor !== "string") continue;
    if (typeof entry.createdAt !== "string") continue;
    history.push({
      version: entry.version,
      key: entry.key,
      actor: entry.actor,
      createdAt: entry.createdAt
    });
  }
  return { version: row.version, history };
}

export function SteeringPanel({
  runId,
  draftId,
  onRevised,
  onSubmittingChange
}: SteeringPanelProps) {
  const [view, setView] = useState<View>({ status: "ready" });
  const [content, setContent] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [pipelineConfig, setPipelineConfig] =
    useState<PipelineConfigView | null>(null);
  const [guidance, setGuidance] = useState<StandingGuidanceView | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const submitting = useRef(false);
  const selectionRef = useRef({ runId, draftId });
  selectionRef.current = { runId, draftId };

  async function loadPipelineConfig() {
    try {
      const res = await fetchWithTimeout(
        "/api/pipeline-config",
        {
          credentials: "same-origin",
          headers: { accept: "application/json" }
        },
        CLIENT_GET_TIMEOUT_MS
      );
      if (!res.ok) return;
      const parsed = parsePipelineConfig(await res.json());
      if (parsed != null) setPipelineConfig(parsed);
    } catch {
      // Public GET is best-effort; steer still works without the list.
    }
  }

  async function loadGuidance() {
    try {
      const res = await fetchWithTimeout(
        "/api/standing-guidance",
        {
          credentials: "same-origin",
          headers: { accept: "application/json" }
        },
        CLIENT_GET_TIMEOUT_MS
      );
      if (!res.ok) return;
      const parsed = parseStandingGuidance(await res.json());
      if (parsed != null) setGuidance(parsed);
    } catch {
      // Public GET is best-effort; Record guidance still works without it.
    }
  }

  useEffect(() => {
    setLastReply(null);
    setError(null);
    setContent("");
    setPrivate(false);
    setEditingItemId(null);
  }, [draftId, runId]);

  useEffect(() => {
    void loadPipelineConfig();
    void loadGuidance();
  }, [runId]);

  async function postSteering(body: Record<string, unknown>): Promise<{
    status: number;
    json: unknown;
    ok: boolean;
  } | null> {
    const submittedRunId = runId;
    const submittedDraftId = draftId;
    // Story 3.19 — a hung steering POST rejects with a TimeoutError after
    // STEERING_POST_TIMEOUT_MS (a revise runs drafter + reviewer, each under
    // the 60 s provider deadline, so this outlasts both); every caller's
    // `finally` clears `submitting`/busy so the queue's keyboard controls
    // come back.
    const res = await fetchWithTimeout(
      `/api/admin/runs/${runId}/steering`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body)
      },
      STEERING_POST_TIMEOUT_MS
    );
    if (
      selectionRef.current.runId !== submittedRunId ||
      selectionRef.current.draftId !== submittedDraftId
    ) {
      return null;
    }
    let json: unknown = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    return { status: res.status, json, ok: res.ok };
  }

  function applyError(status: number, json: unknown, intent: string): boolean {
    if (status === 403) {
      setView({ status: "signedOut" });
      return true;
    }
    const errBody =
      json != null && typeof json === "object" && !Array.isArray(json)
        ? (json as { code?: unknown; message?: unknown })
        : {};
    if (status === 409 && errBody.code === "budget_stopped") {
      setError(
        intent === "config"
          ? "Config did not apply because spend hit the ceiling."
          : intent === "guidance"
            ? "Guidance was not recorded because spend hit the ceiling."
            : "Revision did not complete because spend hit the ceiling."
      );
      return true;
    }
    if (typeof errBody.message === "string" && errBody.message.length > 0) {
      setError(errBody.message);
      return true;
    }
    setError("Submit failed. Try again.");
    return true;
  }

  async function submit(
    intent: "ask" | "revise" | "config" | "guidance",
    guidanceOptions?: { guidanceItemId?: string; revoke?: boolean }
  ) {
    if (submitting.current || content.trim().length === 0) return;
    submitting.current = true;
    setBusy(true);
    onSubmittingChange?.(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        content,
        private: isPrivate,
        draftId
      };
      if (intent === "revise") body.intent = "revise";
      if (intent === "config") body.intent = "config";
      if (intent === "guidance") {
        body.intent = "guidance";
        if (guidanceOptions?.guidanceItemId != null) {
          body.guidanceItemId = guidanceOptions.guidanceItemId;
        }
        if (guidanceOptions?.revoke === true) body.revoke = true;
      }
      const result = await postSteering(body);
      if (result == null) return;
      if (!result.ok) {
        applyError(result.status, result.json, intent);
        return;
      }
      const parsed =
        result.json != null &&
        typeof result.json === "object" &&
        !Array.isArray(result.json)
          ? (result.json as {
              private?: unknown;
              reply?: unknown;
              revisedDraftId?: unknown;
              configVersion?: unknown;
              guidanceVersion?: unknown;
            })
          : {};
      if (intent === "config" && typeof parsed.configVersion !== "number") {
        setLastReply("Those controls are unchanged; the request was refused.");
        return;
      }
      if (parsed.private === true) {
        setLastReply("content withheld");
      } else if (
        intent === "config" &&
        typeof parsed.configVersion === "number"
      ) {
        setLastReply(
          `Pipeline sources updated to version ${parsed.configVersion}; they take effect on the next Run.`
        );
      } else if (typeof parsed.reply === "string" && parsed.reply.length > 0) {
        setLastReply(parsed.reply);
      } else {
        setLastReply(null);
      }
      if (
        intent === "revise" &&
        typeof parsed.revisedDraftId === "string" &&
        parsed.revisedDraftId.length > 0
      ) {
        onRevised?.(parsed.revisedDraftId);
      }
      if (intent === "config") void loadPipelineConfig();
      setEditingItemId(null);
      if (intent === "guidance") {
        void loadGuidance();
        const version =
          typeof parsed.guidanceVersion === "number"
            ? parsed.guidanceVersion
            : null;
        setLastReply(
          guidanceOptions?.revoke === true
            ? "Guidance revoked; the next Run will not see it."
            : version != null && version > 1
              ? `Guidance updated to version ${version}; it takes effect on the next Run and on any Revise draft from now on.`
              : "Guidance recorded; it takes effect on the next Run and on any Revise draft from now on."
        );
      }
      setContent("");
      setPrivate(false);
    } catch (err) {
      setError(submitFailureMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
      onSubmittingChange?.(false);
    }
  }

  async function revertTo(version: number) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    onSubmittingChange?.(true);
    setError(null);
    try {
      const result = await postSteering({
        content: `Revert poll_sources to version ${version}`,
        private: isPrivate,
        draftId,
        intent: "config",
        key: "poll_sources",
        revertToVersion: version
      });
      if (result == null) return;
      if (!result.ok) {
        applyError(result.status, result.json, "config");
        return;
      }
      const parsed =
        result.json != null &&
        typeof result.json === "object" &&
        !Array.isArray(result.json)
          ? (result.json as { private?: unknown })
          : {};
      if (parsed.private === true) {
        setLastReply("content withheld");
      } else {
        setLastReply(null);
      }
      void loadPipelineConfig();
    } catch (err) {
      setError(submitFailureMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
      onSubmittingChange?.(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit("ask");
  }

  function beginEdit(item: GuidanceItemView) {
    if (busy) return;
    setEditingItemId(item.itemId);
    setContent(item.content);
    setPrivate(false);
    setError(null);
  }

  function cancelEdit() {
    setEditingItemId(null);
    setContent("");
  }

  async function revokeGuidance(item: GuidanceItemView) {
    if (busy) return;
    if (editingItemId != null && editingItemId !== item.itemId) {
      setError("Cancel the current edit first.");
      return;
    }
    if (content.trim().length === 0) {
      setError(
        "Type the public reason for revoking this guidance in the composer, then choose Revoke."
      );
      return;
    }
    await submit("guidance", { guidanceItemId: item.itemId, revoke: true });
  }

  const editingItem =
    editingItemId != null
      ? (guidance?.inForce.find((item) => item.itemId === editingItemId) ??
        null)
      : null;
  const guidanceAtCap =
    guidance != null && guidance.inForce.length >= guidance.cap;

  if (view.status === "signedOut") {
    return (
      <EmptyState
        title="Operator re-authentication needed"
        hint="Steering answers only to a verified operator identity."
      >
        Your session expired or the server refused to identify you. Pass the
        Cloudflare Access challenge again and this composer reloads. Nothing
        here acted on your behalf.
      </EmptyState>
    );
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <label htmlFor="steering-content">Steering turn</label>
      <textarea
        id="steering-content"
        className="editor"
        aria-label="Steering turn"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Ask about this Draft or leave a note for the record…"
      />
      <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
        Privacy is chosen at submit and cannot be undone. Public Evidence
        records that the turn happened even when the content is withheld.
      </p>
      <div className="submitrow">
        <div className="privacy">
          <input
            type="checkbox"
            id="steering-private"
            checked={isPrivate}
            onChange={(event) => setPrivate(event.target.checked)}
          />
          <label htmlFor="steering-private">Mark private at submit</label>
        </div>
        <button type="submit" className="btn" disabled={busy}>
          Submit turn
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void submit("revise")}
        >
          Revise draft
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void submit("config")}
        >
          Steer pipeline
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void submit(
              "guidance",
              editingItem != null
                ? { guidanceItemId: editingItem.itemId }
                : undefined
            )
          }
        >
          {editingItem != null ? "Save guidance edit" : "Record guidance"}
        </button>
      </div>
      {editingItem != null ? (
        <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          Editing standing guidance {editingItem.itemId} (version{" "}
          {editingItem.version}). Saving writes a new version; history is kept.{" "}
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={cancelEdit}
          >
            Cancel edit
          </button>
        </p>
      ) : null}
      {guidance != null ? (
        <section
          className="standing-guidance"
          aria-label="Standing guidance in force"
        >
          <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
            Standing guidance in force: {guidance.inForce.length} of{" "}
            {guidance.cap}. Guidance is public, advisory to the drafter only,
            and takes effect on the next Run and on any Revise draft from now
            on. Up to {guidance.maxChars} characters per item.
            {guidanceAtCap
              ? " The cap is reached; revoke or edit an item to record another."
              : ""}
          </p>
          {guidance.inForce.length > 0 ? (
            <ul className="lastupd">
              {guidance.inForce.map((item) => (
                <li key={item.itemId}>
                  <span>
                    v{item.version} · {item.actor} · {item.content}
                  </span>{" "}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-label={`Edit guidance ${item.itemId}`}
                    onClick={() => beginEdit(item)}
                  >
                    Edit
                  </button>{" "}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-label={`Revoke guidance ${item.itemId}`}
                    onClick={() => void revokeGuidance(item)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {pipelineConfig != null && pipelineConfig.version > 0 ? (
        <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void revertTo(0)}
          >
            Revert to seed
          </button>
        </p>
      ) : null}
      {pipelineConfig != null && pipelineConfig.history.length > 0 ? (
        <ul className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          {pipelineConfig.history.map((row) => (
            <li key={row.version}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void revertTo(row.version)}
              >
                Revert to version {row.version}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          {error}
        </p>
      ) : null}
      {lastReply != null ? (
        <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          {lastReply}
        </p>
      ) : null}
    </form>
  );
}
