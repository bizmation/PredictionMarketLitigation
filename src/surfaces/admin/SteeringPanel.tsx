import { useRef, useState, type FormEvent } from "react";

import { EmptyState } from "../../shared/ui";

/**
 * Story 3.14 — operator steering composer. Privacy is chosen at submit
 * and cannot be undone. 403 fails closed to the signed-out EmptyState.
 */

type SteeringPanelProps = {
  runId: string;
  draftId: string;
};

type View = { status: "ready" } | { status: "signedOut" };

export function SteeringPanel({ runId, draftId }: SteeringPanelProps) {
  const [view, setView] = useState<View>({ status: "ready" });
  const [content, setContent] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || content.trim().length === 0) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/runs/${runId}/steering`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          content,
          private: isPrivate,
          draftId
        })
      });
      if (res.status === 403) {
        setView({ status: "signedOut" });
        return;
      }
      if (!res.ok) {
        setError("Submit failed. Try again.");
        return;
      }
      setContent("");
      setPrivate(false);
    } catch {
      setError("Submit failed. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
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
    <form className="composer" onSubmit={(event) => void onSubmit(event)}>
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
      </div>
      {error ? (
        <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
