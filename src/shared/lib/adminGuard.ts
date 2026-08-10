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
  return (
    pathname === ADMIN_API_PREFIX || pathname.startsWith(`${ADMIN_API_PREFIX}/`)
  );
}

/**
 * Resolve the operator for an admin request, or the 403 to return instead.
 *
 * The rejection carries the architecture's error envelope and nothing else:
 * no `details`, no reason, no echo of what was sent. "No token" and "valid
 * token, wrong identity" must be indistinguishable from outside — telling an
 * attacker which half they got right is free reconnaissance.
 * [Source: architecture.md#API-&-Communication-Patterns]
 */
export async function requireOperator(
  request: Request,
  env: Env
): Promise<{ operator: Operator } | Response> {
  const operator = await verifyOperator(request, env);
  if (!operator) {
    return Response.json(
      { code: "forbidden", message: "Operator authorization required." },
      { status: 403 }
    );
  }
  return { operator };
}
