import { useEffect, useState } from "react";

/**
 * Ask the Worker who the operator is (story 1.4 AC4, closed 2026-08-10).
 *
 * The admin shell is served as a static document and rendered client-side, so
 * nothing about the Access session reaches React through the HTML. Before this,
 * the session strip read "Not signed in" to an operator who had just cleared an
 * Access challenge — the chrome understating its own protection, which is the
 * same class of dishonesty as overstating it.
 *
 * WHY A FETCH AND NOT SERVER-RENDERED CHROME. `/admin` is deliberately absent
 * from `run_worker_first` in wrangler.jsonc. Adding it would let the Worker see
 * the request but not inject anything, because there is no SSR path — the
 * Worker serves a prebuilt document. Producing a name server-side would mean
 * HTMLRewriter or a new rendering pipeline for exactly one route. `/api/admin/*`
 * already runs through the Worker and is already gated twice (Cloudflare Access
 * at the edge on the apex, `requireOperator` in the Worker everywhere), so the
 * cheap correct move is to ask it.
 *
 * FAILS TO "NOT SIGNED IN", ALWAYS. Every failure path — 403, network error,
 * malformed body, unmount mid-flight — leaves the session undefined and the
 * strip reading "Not signed in". A name rendered here is a claim that the
 * server verified an identity; it must never appear on a guess.
 *
 * Note the expired-session case specifically: Access answers an expired session
 * with a 302 to its login page rather than a 401 (see docs/access-runbook.md's
 * gotchas). `fetch` follows that redirect, so this lands on an HTML body and
 * `res.json()` throws — caught below, same as any other failure. That is the
 * intended outcome, not an accident: a stale session should read as signed out.
 */

export type AdminSession = { displayName: string };

export function useAdminSession(): AdminSession | undefined {
  const [session, setSession] = useState<AdminSession | undefined>(undefined);

  useEffect(() => {
    // Abort on unmount so a slow response cannot set state on a dead component.
    const controller = new AbortController();

    fetch("/api/admin/session", {
      signal: controller.signal,
      // The Access JWT rides either the Cf-Access-Jwt-Assertion header (which
      // Access injects at the edge) or the CF_Authorization cookie. The cookie
      // is HttpOnly, which is why this asks the server rather than reading it.
      credentials: "same-origin",
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const displayName = (body as AdminSession | null)?.displayName;
        if (typeof displayName === "string" && displayName.length > 0) {
          setSession({ displayName });
        }
      })
      .catch(() => {
        // Deliberately silent. A failure here means "not signed in", which the
        // strip already says by default. Surfacing it would put an error in
        // front of the operator for the ordinary case of an expired session.
      });

    return () => controller.abort();
  }, []);

  return session;
}
