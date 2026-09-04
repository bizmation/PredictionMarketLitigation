import {
  ApiError,
  badRequest,
  conflict,
  internalError,
  methodNotAllowed,
  notFound
} from "./errors";
import { jsonError, jsonList, jsonNoStore, jsonOk } from "./respond";
import { getDb, type Db } from "../db/client";
import * as casesRepo from "../db/repos/casesRepo";
import * as certSignalRepo from "../db/repos/certSignalRepo";
import * as circuitsRepo from "../db/repos/circuitsRepo";
import * as entitiesRepo from "../db/repos/entitiesRepo";
import * as kpisRepo from "../db/repos/kpisRepo";
import * as pollVotesRepo from "../db/repos/pollVotesRepo";
import * as statesRepo from "../db/repos/statesRepo";
import { PollResultsSchema, PollVoteBodySchema } from "../schemas/poll";
import type { PollResults, PollVote } from "../schemas/poll";

/**
 * Public F1 REST router (Story 2.1), plus the reader poll (Story 2.9).
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
 * once we own the /api prefix.
 */
function isReservedPublicPath(pathname: string): boolean {
  return (
    pathname === "/api/administrivia" ||
    pathname.startsWith("/api/administrivia/")
  );
}

const POLL_COOKIE = "pml_poll";

function readPollToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === POLL_COOKIE) return rest.join("=");
  }
  return null;
}

function buildPollCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${POLL_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}

/**
 * Story 2.9 — the reader poll is the first public POST. It is NOT guarded by
 * `adminGuard` (that guard is path-scoped, and `/api/poll` is not under
 * `/api/admin`); anonymous votes are the whole point (FR44, AC5).
 */
async function handlePollApi(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  try {
    const db = getDb(env);

    if (pathname === "/api/poll/votes") {
      if (request.method !== "POST") throw methodNotAllowed("POST");
      return await postVote(request, db);
    }

    if (pathname === "/api/poll/results") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        throw methodNotAllowed("GET, HEAD");
      }
      const token = readPollToken(request);
      const row = token ? await pollVotesRepo.getByToken(db, token) : null;
      return jsonNoStore(await buildResults(db, row));
    }

    // Unknown /api/poll/:x — envelope 404 (architecture).
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

async function buildResults(
  db: Db,
  row: PollVote | null
): Promise<PollResults> {
  const counts = await pollVotesRepo.tally(db);
  return PollResultsSchema.parse({
    voted: row !== null,
    mine: { cert: row?.cert ?? null, term: row?.term ?? null },
    total: counts.total,
    cert: row ? counts.cert : null,
    terms: row && row.term !== null ? counts.terms : null
  });
}

async function postVote(request: Request, db: Db): Promise<Response> {
  // The strict schema would reject a huge body, but only after fully
  // buffering and parsing it — the vote body is ~30 bytes, so cap up front.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 1024) {
    throw badRequest("Poll vote body too large.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Malformed JSON body.");
  }
  const parsed = PollVoteBodySchema.safeParse(body);
  if (!parsed.success) throw badRequest("Invalid poll vote body.");
  const { cert, term } = parsed.data;

  const now = new Date().toISOString();
  const token = readPollToken(request);
  const existing = token ? await pollVotesRepo.getByToken(db, token) : null;

  let row: PollVote;
  let cookie: string | undefined;

  if (existing) {
    if (existing.cert !== cert) {
      throw conflict("Vote already cast.");
    }
    if (term != null) {
      if (existing.term === null) {
        const stored = await pollVotesRepo.setTermIfNull(db, token!, term, now);
        if (!stored) {
          // Lost the first-write race: the row now holds a different term.
          throw conflict("Term already chosen.");
        }
        row = { id: existing.id, cert: existing.cert, term };
      } else if (existing.term !== term) {
        throw conflict("Term already chosen.");
      } else {
        row = existing;
      }
    } else {
      row = existing;
    }
  } else {
    const id = crypto.randomUUID();
    const voterToken = crypto.randomUUID();
    row = await pollVotesRepo.insertVote(db, {
      id,
      voterToken,
      cert,
      term: term ?? null,
      now
    });
    cookie = buildPollCookie(voterToken, request);
  }

  return jsonNoStore(
    await buildResults(db, row),
    cookie ? { headers: { "set-cookie": cookie } } : undefined
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
    // Story 4.5 owns /api/administrivia — keep returning unmatched so it 404s.
    return null;
  }

  // Story 2.9 — poll routes are handled before the GET/HEAD-only guard because
  // POST /api/poll/votes is a public mutation.
  if (pathname === "/api/poll" || pathname.startsWith("/api/poll/")) {
    return handlePollApi(request, env, pathname);
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

    if (pathname === "/api/kpis") {
      return jsonOk(await kpisRepo.getKpis(db));
    }

    if (pathname === "/api/developments") {
      return jsonList(await casesRepo.listRecentDevelopments(db));
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
