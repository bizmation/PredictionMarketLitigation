import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Cloudflare Access verification — who, if anyone, is the operator.
 *
 * Story 1.4 ships this Worker-side layer only. The Zero Trust application that
 * puts Access in front of the edge is Story 1.5's, because a path-scoped Access
 * app requires an active zone and this project has no custom domain bound yet.
 *
 * WHY VERIFY AT ALL, IF ACCESS SITS AT THE EDGE?
 * Because the edge is not the only door. Once 1.5 binds the custom domains this
 * Worker is still reachable at its workers.dev hostname and at every preview
 * URL, and a request arriving there can set `Cf-Access-Jwt-Assertion` to
 * anything it likes. Cloudflare documents this exact failure for the analogous
 * case: a hostname that does not pass through the zone "keeps answering
 * unauthenticated requests and defeats the policy". Signature + audience
 * verification is what turns that from a breach into a 403. Do not "simplify"
 * this module into a header read.
 *
 * TWO SEPARATE QUESTIONS, DELIBERATELY:
 *   1. Is this token real?          → cryptographic verification
 *   2. Is this token *Patrick's*?   → the OPERATOR_EMAIL allowlist
 * Story 3.13 requires that non-operator identities cannot change gate mode, so
 * "authenticated" is not sufficient on its own. Both must pass.
 *
 * Pure module: no React, no surface imports, no D1. Unit-tested offline in the
 * workers Vitest project against a locally minted keypair.
 */

export type Operator = {
  /** Verified from the JWT's `email` claim. Never render this publicly. */
  email: string;
  /**
   * Public-safe display name from config — never derived from the email.
   * Story 3.13 renders mode-change audit entries on the public ops. surface,
   * so the name that leaves this module must be safe to publish.
   */
  displayName: string;
};

const DEFAULT_DISPLAY_NAME = "Patrick";

/**
 * One remote key set per team domain, cached for the isolate's lifetime.
 *
 * createRemoteJWKSet keeps its own JWKS cache and handles `kid` matching and
 * Cloudflare's 6-weekly key rotation. Constructing it per request would throw
 * that away and refetch the JWKS on every call.
 */
const jwksByTeamDomain = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function jwksFor(teamDomain: string) {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Header first, cookie second. The header is present for every client type;
 * the cookie only for browsers.
 */
function readToken(request: Request): string | null {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header;

  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "CF_Authorization" && rest.length > 0) {
      return rest.join("=") || null;
    }
  }
  return null;
}

/**
 * Resolve the request's operator, or null.
 *
 * Null is the only failure signal — callers must not be able to distinguish
 * "no token" from "wrong identity", and neither may reach a client.
 * Every error path returns null; nothing here throws.
 */
export async function verifyOperator(
  request: Request,
  env: Env
): Promise<Operator | null> {
  const displayName = env.OPERATOR_DISPLAY_NAME || DEFAULT_DISPLAY_NAME;

  // Local development escape hatch. Gated on an exact string match against a
  // var that lives in .dev.vars (gitignored, read only by `wrangler dev`) and
  // is therefore absent from every deployed environment by construction.
  // If this ever evaluates true in production, /api/admin/* is wide open.
  if (env.ACCESS_DEV_BYPASS === "true") {
    return { email: env.OPERATOR_EMAIL || "dev@localhost", displayName };
  }

  // Fail closed on missing configuration rather than verifying against
  // undefined and letting jose decide what that means.
  const teamDomain = env.TEAM_DOMAIN;
  const policyAud = env.POLICY_AUD;
  const operatorEmail = env.OPERATOR_EMAIL;
  if (!teamDomain || !policyAud || !operatorEmail) return null;

  const token = readToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: teamDomain,
      // Mandatory. The AUD tag is per-application, so without it a token
      // minted for any other Access app on this account would pass on
      // signature and issuer alone.
      audience: policyAud
    });

    const email = payload.email;
    if (typeof email !== "string" || email.length === 0) return null;
    if (email.toLowerCase() !== operatorEmail.toLowerCase()) return null;

    return { email, displayName };
  } catch {
    // Expired, wrong aud/iss, bad signature, unknown kid, malformed token,
    // JWKS unreachable — all the same answer to the caller.
    return null;
  }
}
