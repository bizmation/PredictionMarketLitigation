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

/** Access signs with RS256. Pinning it stops the token header choosing. */
const ALLOWED_ALGORITHMS = ["RS256"];

/** The only hosts where the dev bypass may fire. See verifyOperator. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

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
 * Secrets arrive as free text from `wrangler secret put`, where a trailing
 * slash or a stray newline is invisible and permanent. `TEAM_DOMAIN` is used
 * both to build the JWKS URL and as the expected `iss`, so one trailing slash
 * would produce a double-slashed URL AND an issuer that can never match —
 * locking the operator out with a 403 that deliberately explains nothing.
 */
function normalizeDomain(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Every candidate token on the request, most authoritative first.
 *
 * The header is present for all client types and cannot be set cross-site by a
 * browser, so it is the only source accepted for state-changing methods. The
 * `CF_Authorization` cookie IS attached automatically by the browser, which
 * makes it a CSRF vector: without this restriction a third-party page could
 * auto-submit a form to /api/admin/... and ride the operator's live session to
 * approve a draft they never saw. Cookies are therefore read for safe methods
 * only — enough to render admin chrome, never enough to act.
 *
 * All matching cookies are returned rather than just the first, because
 * anything able to set a cookie on a parent domain could otherwise shadow the
 * real one with an empty value and lock the operator out permanently.
 */
function readTokens(request: Request): string[] {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return [header];

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return [];

  const cookie = request.headers.get("cookie");
  if (!cookie) return [];

  const tokens: string[] = [];
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) !== "CF_Authorization") continue;
    const value = trimmed.slice(eq + 1).trim();
    if (value) tokens.push(value);
  }
  return tokens;
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
  const displayName =
    normalizeText(env.OPERATOR_DISPLAY_NAME) ?? DEFAULT_DISPLAY_NAME;
  const operatorEmail = normalizeText(env.OPERATOR_EMAIL);

  // Local development escape hatch, doubly gated.
  //
  // The var lives in .dev.vars (gitignored, read only by `wrangler dev`), so
  // it is absent from deployed environments. That alone is not enough: a
  // `wrangler dev --tunnel-name=...` session loads .dev.vars AND publishes the
  // dev server on a public hostname, which would hand full operator rights to
  // any caller. So the request must ALSO arrive on a loopback host.
  if (env.ACCESS_DEV_BYPASS === "true") {
    const { hostname } = new URL(request.url);
    if (LOCAL_HOSTS.has(hostname)) {
      return { email: operatorEmail ?? "dev@localhost", displayName };
    }
  }

  // Fail closed on missing configuration rather than verifying against
  // undefined and letting jose decide what that means.
  const teamDomain = normalizeDomain(env.TEAM_DOMAIN);
  const policyAud = normalizeText(env.POLICY_AUD);
  if (!teamDomain || !policyAud || !operatorEmail) return null;

  const jwks = jwksFor(teamDomain);

  for (const token of readTokens(request)) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: teamDomain,
        // Mandatory. The AUD tag is per-application, so without it a token
        // minted for any other Access app on this account would pass on
        // signature and issuer alone.
        audience: policyAud,
        // Without this the token's own header picks the algorithm from
        // whatever the JWK permits.
        algorithms: ALLOWED_ALGORITHMS
      });

      const email = payload.email;
      if (typeof email !== "string" || email.length === 0) continue;
      if (email.toLowerCase() !== operatorEmail.toLowerCase()) continue;

      return { email, displayName };
    } catch {
      // Expired, wrong aud/iss, bad signature, unknown kid, malformed token,
      // JWKS unreachable — try the next candidate, then give up.
    }
  }

  return null;
}
