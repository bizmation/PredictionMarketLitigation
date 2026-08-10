import { type Operator, verifyOperator } from "./access";

/**
 * The admin API perimeter (story 1.4).
 *
 * Separate from access.ts on purpose: that module answers "who is this?" with
 * no knowledge of HTTP, and is unit-testable as pure identity logic. This one
 * owns the routing and response shape.
 */

const ADMIN_API_PREFIX = "/api/admin";

/**
 * Normalize before matching, or the guard is trivially sidestepped.
 *
 * `URL.pathname` does not percent-decode, so `/api/%61dmin/x` reaches here as
 * a literal that fails a naive prefix test — while a downstream router that
 * DOES decode would happily serve it. Duplicate slashes (`//api/admin`,
 * `/api//admin`) are the same class of bypass. Decode first, collapse slashes,
 * then match.
 *
 * decodeURIComponent throws on malformed escapes (`%zz`); treat that as
 * un-routable rather than letting it bubble.
 */
function normalizePath(pathname: string): string {
  let decoded = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return "\0"; // matches nothing
    }
  }
  return decoded.replace(/\/{2,}/g, "/");
}

/**
 * `/api/admin` and `/api/admin/...`, but never `/api/administrivia`.
 *
 * Same shape as resolveSurface's isAdminPath in ./surface.ts — deliberately,
 * so there is one prefix-matching idiom in the codebase rather than two that
 * disagree at the edges.
 *
 * SCOPED BY PATH, NEVER BY METHOD. Story 2.9 adds a public
 * `POST /api/poll/votes` and story 4.5 a public correction-form POST. A guard
 * written as "mutations require auth" would break both.
 */
export function isAdminApiPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === ADMIN_API_PREFIX || path.startsWith(`${ADMIN_API_PREFIX}/`);
}

/**
 * Resolve the operator for an admin request, or the response to return instead.
 *
 * The rejection carries the architecture's error envelope and nothing else:
 * no `details`, no reason, no echo of what was sent. "No token" and "valid
 * token, wrong identity" must be indistinguishable from outside — telling an
 * attacker which half they got right is free reconnaissance.
 * [Source: architecture.md#API-&-Communication-Patterns]
 *
 * Admin responses are never cacheable. Story 3.10 returns pending draft text
 * through this prefix, and on a custom domain an authenticated response cached
 * at the edge would be served to the next anonymous caller of the same URL.
 * Setting the convention here means every later handler inherits it.
 */
export const ADMIN_CACHE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Cookie, Cf-Access-Jwt-Assertion"
} as const;

export async function requireOperator(
  request: Request,
  env: Env
): Promise<{ operator: Operator } | Response> {
  const operator = await verifyOperator(request, env);
  if (!operator) {
    return Response.json(
      { code: "forbidden", message: "Operator authorization required." },
      { status: 403, headers: ADMIN_CACHE_HEADERS }
    );
  }
  return { operator };
}
