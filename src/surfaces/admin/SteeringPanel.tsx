import { useEffect, useRef, useState, type FormEvent } from "react";

import { EmptyState } from "../../shared/ui";

/**
 * Story 3.15/3.16 — operator steering composer. Submit turn is ask
 * (default). Revise is an explicit second control that sends
 * `intent: "revise"`. After a 200, the last steward reply (or “content
 * withheld” when private) is shown under the composer. A successful
 * revise notifies the queue with `revisedDraftId`. Privacy is chosen at
 * submit and cannot be undone. 403 fails closed to the signed-out
 * EmptyState.
 */

type SteeringPanelProps = {
  runId: string;
  draftId: string;
  onRevised?: (revisedDraftId: string) => void;
  onSubmittingChange?: (submitting: boolean) => void;
};

type View = { status: "ready" } | { status: "signedOut" };

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
  const submitting = useRef(false);
  const selectionRef = useRef({ runId, draftId });
  selectionRef.current = { runId, draftId };

  useEffect(() => {
    setLastReply(null);
    setError(null);
    setContent("");
    setPrivate(false);
  }, [draftId, runId]);

  async function submit(intent: "ask" | "revise") {
    if (submitting.current || content.trim().length === 0) return;
    submitting.current = true;
    setBusy(true);
    onSubmittingChange?.(true);
    setError(null);
    const submittedRunId = runId;
    const submittedDraftId = draftId;
    try {
      const body: Record<string, unknown> = {
        content,
        private: isPrivate,
        draftId
      };
      if (intent === "revise") body.intent = "revise";
      const res = await fetch(`/api/admin/runs/${runId}/steering`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body)
      });
      if (
        selectionRef.current.runId !== submittedRunId ||
        selectionRef.current.draftId !== submittedDraftId
      ) {
        return;
      }
      if (res.status === 403) {
        setView({ status: "signedOut" });
        return;
      }
      if (!res.ok) {
        let errBody: { code?: unknown; message?: unknown } = {};
        try {
          errBody = (await res.json()) as { code?: unknown; message?: unknown };
        } catch {
          // Fall through to the generic failure.
        }
        if (res.status === 409 && errBody.code === "budget_stopped") {
          setError("Revision did not complete because spend hit the ceiling.");
          return;
        }
        if (typeof errBody.message === "string" && errBody.message.length > 0) {
          setError(errBody.message);
          return;
        }
        setError("Submit failed. Try again.");
        return;
      }
      let parsed: {
        private?: unknown;
        reply?: unknown;
        revisedDraftId?: unknown;
      } = {};
      try {
        parsed = (await res.json()) as {
          private?: unknown;
          reply?: unknown;
          revisedDraftId?: unknown;
        };
      } catch {
        parsed = {};
      }
      if (parsed.private === true) {
        setLastReply("content withheld");
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
      setContent("");
      setPrivate(false);
    } catch {
      setError("Submit failed. Try again.");
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
      </div>
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
