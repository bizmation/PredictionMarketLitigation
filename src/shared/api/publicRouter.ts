import {
  ApiError,
  badRequest,
  internalError,
  methodNotAllowed,
  notFound
} from "./errors";
import { jsonError, jsonList, jsonOk } from "./respond";
import { getDb } from "../db/client";
import * as casesRepo from "../db/repos/casesRepo";
import * as certSignalRepo from "../db/repos/certSignalRepo";
import * as circuitsRepo from "../db/repos/circuitsRepo";
import * as entitiesRepo from "../db/repos/entitiesRepo";
import * as statesRepo from "../db/repos/statesRepo";

/**
 * Public read-only F1 REST router (Story 2.1).
 *
 * Call ONLY after isAgentsPath / isAdminApiPath guards. Admin is a sub-path of
 * /api — evaluating public matching first would leave /api/admin/* unguarded.
 *
 * Returns null when the path is not a public API route (caller falls through).
 */

export function isPublicApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Paths that look like /api/* but are owned by later stories or must stay
 * unmatched. Returning null lets the outer handler 404 with the public envelope
 * once we own the /api prefix — except we must not claim Story 2.9's poll.
 */
function isReservedPublicPath(pathname: string): boolean {
  return (
    pathname === "/api/poll" ||
    pathname.startsWith("/api/poll/") ||
    pathname === "/api/administrivia" ||
    pathname.startsWith("/api/administrivia/")
  );
}

export async function handlePublicApi(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (!isPublicApiPath(pathname)) return null;
  // Admin/agents already handled upstream; belt-and-braces.
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
    return null;
  }
  if (isReservedPublicPath(pathname)) {
    // Story 2.9 owns /api/poll/votes — keep returning unmatched so existing
    // tests that expect a bare 404 continue to pass unmodified.
    return null;
  }

  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      throw methodNotAllowed("GET, HEAD");
    }

    const db = getDb(env);

    if (pathname === "/api/circuits") {
      return jsonList(await circuitsRepo.listCircuits(db));
    }

    if (pathname === "/api/states") {
      return jsonList(await statesRepo.listStates(db));
    }

    {
      const m = /^\/api\/states\/([A-Za-z]{2})$/.exec(pathname);
      if (m) {
        const state = await statesRepo.getStateByCode(db, m[1]!);
        if (!state) throw notFound(`State '${m[1]}' not found.`);
        return jsonOk(state);
      }
    }

    if (pathname === "/api/cases") {
      return jsonList(await casesRepo.listCases(db));
    }

    {
      const m = /^\/api\/cases\/([^/]+)$/.exec(pathname);
      if (m) {
        let id: string;
        try {
          id = decodeURIComponent(m[1]!);
        } catch {
          throw badRequest("Malformed case ID.");
        }
        const c = await casesRepo.getCaseById(db, id);
        if (!c) throw notFound(`Case '${m[1]}' not found.`);
        return jsonOk(c);
      }
    }

    if (pathname === "/api/entities") {
      return jsonList(await entitiesRepo.listEntities(db));
    }

    if (pathname === "/api/cert-signal") {
      const signal = await certSignalRepo.getCertSignal(db);
      if (!signal) throw notFound("Cert signal not published.");
      return jsonOk(signal);
    }

    // Owned /api/* prefix with no matching route → envelope 404 (architecture).
    throw notFound();
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err);
    console.error(
      JSON.stringify({
        event: "public_api.error",
        path: pathname,
        message: err instanceof Error ? err.message : String(err)
      })
    );
    return jsonError(internalError());
  }
}
