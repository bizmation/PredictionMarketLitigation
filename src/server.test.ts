import { env } from "cloudflare:workers";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import worker from "./server";

// Smoke test (story 1.1): the Worker module exposes the shape wrangler deploys.
// Runs inside workerd via @cloudflare/vitest-pool-workers against
// wrangler.test.jsonc.
describe("worker module", () => {
  it("exports a default fetch handler", () => {
    expect(worker).toBeDefined();
    expect(typeof worker.fetch).toBe("function");
  });
});

function get(path: string, init?: RequestInit) {
  return new Request(`https://pml.example.com${path}`, init);
}

/**
 * Envs constructed explicitly, never taken ambient.
 *
 * vitest-pool-workers loads `.dev.vars` into the test env, so on a machine
 * where local development is set up, ACCESS_DEV_BYPASS is already "true" here
 * — and every "unauthenticated" assertion below would pass through the bypass
 * and silently test nothing. A test that asserts rejection has to own the env
 * it asserts against.
 */
const anon = { ...env, ACCESS_DEV_BYPASS: undefined } as Env;
const authed = { ...env, ACCESS_DEV_BYPASS: "true" } as Env;

/**
 * Story 1.4 — the admin API perimeter.
 *
 * The guard is deliberately scoped by PATH PREFIX, never by HTTP method.
 * Story 2.9 adds a public `POST /api/poll/votes` and story 4.5 a public
 * correction-form POST; a "mutations require auth" guard would break both.
 * The public-route cases below are the regression guard for that.
 */
describe("/api/admin/* perimeter (story 1.4)", () => {
  it("rejects an unauthenticated admin request with 403", async () => {
    const res = await worker.fetch(get("/api/admin/ping"), anon);
    expect(res.status).toBe(403);
  });

  it("returns the architecture's error envelope and leaks nothing", async () => {
    const res = await worker.fetch(get("/api/admin/ping"), anon);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toEqual({ code: "forbidden", message: expect.any(String) });
    expect(res.headers.get("content-type")).toContain("application/json");

    // No hint about WHY: "no token" and "wrong identity" must be
    // indistinguishable, and no secret or stack may appear.
    const serialized = JSON.stringify(body).toLowerCase();
    for (const leak of [
      "jwt",
      "token",
      "aud",
      "cloudflareaccess",
      "email",
      "stack"
    ]) {
      expect(serialized).not.toContain(leak);
    }
    expect(body.details).toBeUndefined();
  });

  it("guards every sub-path, not just the exact prefix", async () => {
    for (const path of [
      "/api/admin",
      "/api/admin/",
      "/api/admin/drafts/abc/approve",
      "/api/admin/mode"
    ]) {
      const res = await worker.fetch(get(path), anon);
      expect(res.status, `${path} should be guarded`).toBe(403);
    }
  });

  it("runs the guard before routing — an unknown admin path is 403, not 404", async () => {
    const res = await worker.fetch(get("/api/admin/does-not-exist"), anon);
    expect(res.status).toBe(403);
  });

  it("does not guard a lookalike path outside the prefix", async () => {
    const res = await worker.fetch(get("/api/administrivia"), anon);
    expect(res.status).not.toBe(403);
  });

  it("reaches the placeholder handler via the dev bypass on loopback", async () => {
    const res = await worker.fetch(
      new Request("http://localhost:5173/api/admin/ping"),
      authed
    );
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404); // no real admin handlers until story 3.10
  });

  it("refuses the dev bypass on a non-loopback host", async () => {
    // A tunnelled `wrangler dev` loads .dev.vars and is publicly reachable.
    const res = await worker.fetch(get("/api/admin/ping"), authed);
    expect(res.status).toBe(403);
  });

  it("marks admin responses uncacheable", async () => {
    // Story 3.10 returns pending draft text through this prefix. On a custom
    // domain an edge-cached authenticated response would be served to the next
    // anonymous caller of the same URL.
    const res = await worker.fetch(get("/api/admin/ping"), anon);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toContain("Cf-Access-Jwt-Assertion");
  });

  it("guards admin GETs too, not only mutations", async () => {
    const res = await worker.fetch(
      get("/api/admin/queue", { method: "GET" }),
      anon
    );
    expect(res.status).toBe(403);
  });
});

/**
 * The guard must be reachable by a genuine signed token, not only by the dev
 * bypass — otherwise requireOperator could be gutted and every test above
 * would still pass.
 */
describe("a real Access JWT passes the guard end-to-end", () => {
  const TEAM = "https://e2e.cloudflareaccess.com";
  const AUD = "e2e-aud";
  const EMAIL = "operator@example.com";

  /**
   * ONE keypair for the block. This was a per-test `setup()` until 2026-08-10,
   * and the non-operator case below was passing for the wrong reason.
   *
   * access.ts caches its JWKS per team domain in a module-level Map for the
   * isolate's lifetime. A second keypair minted under the same team domain is
   * therefore checked against the FIRST one's cached public key and fails on
   * signature — so the old second test got its 403 from a bad signature, never
   * reaching the email comparison it existed to prove. Verified directly: a
   * token carrying the CORRECT operator email, signed by a second keypair,
   * also returned 403.
   *
   * Sharing the key is what makes the 403 below attributable to identity.
   */
  let privateKey: CryptoKey;
  let jwk: Record<string, unknown>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    jwk = (await exportJWK(pair.publicKey)) as Record<string, unknown>;
    jwk.kid = "e2e-1";
    jwk.alg = "RS256";
    jwk.use = "sig";
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const realEnv = () =>
    ({
      ...env,
      ACCESS_DEV_BYPASS: undefined,
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
      OPERATOR_EMAIL: EMAIL
    }) as Env;

  const sign = (email: string) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: "RS256", kid: "e2e-1" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  const call = (token: string) =>
    worker.fetch(
      get("/api/admin/ping", { headers: { "cf-access-jwt-assertion": token } }),
      realEnv()
    );

  it("lets the operator through to the handler", async () => {
    const res = await call(await sign(EMAIL));
    expect(res.status).toBe(404); // past the guard, no handler yet
  });

  it("still rejects a valid token for a non-operator identity", async () => {
    const res = await call(await sign("someone.else@example.com"));
    expect(res.status).toBe(403);
  });

  it("the two cases differ only by identity", async () => {
    // Pins the fix above. Same key, same issuer, same audience, same everything
    // except the email claim — so if these two ever return the same status, the
    // email comparison has stopped working (or stopped being reached).
    const ok = await call(await sign(EMAIL));
    const notOk = await call(await sign("someone.else@example.com"));
    expect(ok.status).toBe(404);
    expect(notOk.status).toBe(403);
  });
});

/**
 * GET /api/admin/session — story 1.4's AC4 display-name half, closed 2026-08-10.
 *
 * The admin shell renders from a static document, so the operator's name can
 * only come from asking the Worker. This is the first admin route with an
 * actual handler, which makes it the first chance to get the response shape
 * wrong in a way that matters: the operator's EMAIL must never be in it.
 * access.ts types that field as never safe to render, and story 3.13 publishes
 * the display name in mode-change audit entries on the PUBLIC ops. surface.
 */
describe("GET /api/admin/session (story 1.4 AC4)", () => {
  const TEAM = "https://session.cloudflareaccess.com";
  const AUD = "session-aud";
  const EMAIL = "operator@example.com";
  // Deliberately NOT "Patrick". That is both .dev.vars' value and access.ts's
  // built-in DEFAULT_DISPLAY_NAME, so asserting on it would pass even if the
  // handler ignored config entirely or the ambient env leaked in.
  const DISPLAY_NAME = "Distinctive Operator Name";

  /**
   * ONE keypair for the whole block, deliberately.
   *
   * access.ts caches its JWKS per team domain in a module-level Map that lives
   * as long as the isolate (see jwksByTeamDomain — constructing one per request
   * would refetch the key set every call). A per-test keypair under the same
   * team domain therefore gets verified against the FIRST test's cached public
   * key and fails on signature, no matter what the token actually claims.
   *
   * That failure mode is quiet and dangerous in a test file: every assertion
   * expecting 403 keeps passing, for the wrong reason. Sharing the keypair is
   * what makes the non-operator case below prove identity checking rather than
   * re-prove signature checking.
   */
  let privateKey: CryptoKey;
  let jwk: Record<string, unknown>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    jwk = (await exportJWK(pair.publicKey)) as Record<string, unknown>;
    jwk.kid = "session-1";
    jwk.alg = "RS256";
    jwk.use = "sig";
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const realEnv = () =>
    ({
      ...env,
      ACCESS_DEV_BYPASS: undefined,
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
      OPERATOR_EMAIL: EMAIL,
      OPERATOR_DISPLAY_NAME: DISPLAY_NAME
    }) as Env;

  const sign = (email: string) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: "RS256", kid: "session-1" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  const signedRequest = (
    token: string,
    path = "/api/admin/session",
    init?: RequestInit
  ) =>
    new Request(`https://pml.example.com${path}`, {
      ...init,
      headers: { "cf-access-jwt-assertion": token, ...init?.headers }
    });

  it("returns the operator's display name", async () => {
    const res = await worker.fetch(signedRequest(await sign(EMAIL)), realEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ displayName: DISPLAY_NAME });
  });

  it("never returns the operator's email, under any key", async () => {
    const res = await worker.fetch(signedRequest(await sign(EMAIL)), realEnv());
    expect(res.status).toBe(200);

    // Whole-body scan, not a key check: the point is that the address cannot
    // appear at all, including nested or as part of some future field.
    const raw = await res.text();
    expect(raw).not.toContain(EMAIL);
    expect(raw.toLowerCase()).not.toContain("email");
  });

  it("is guarded — anonymous callers get the same opaque 403", async () => {
    const res = await worker.fetch(get("/api/admin/session"), anon);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
  });

  it("rejects a valid token for a non-operator identity", async () => {
    // Signed by the SAME key as the passing case above, so this can only fail
    // on the email comparison — which is the thing being tested.
    const token = await sign("someone.else@example.com");
    const res = await worker.fetch(signedRequest(token), realEnv());
    expect(res.status).toBe(403);
  });

  it("is read-only — a POST past the guard is 405, not a silent 200", async () => {
    const token = await sign(EMAIL);
    const res = await worker.fetch(
      signedRequest(token, "/api/admin/session", { method: "POST" }),
      realEnv()
    );

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("marks the response uncacheable", async () => {
    // An authenticated response cached at the edge would be served to the next
    // caller of the same URL. Assert the 200 as well: ADMIN_CACHE_HEADERS ride
    // the 403 too, so a header-only check would pass on a failed auth.
    const res = await worker.fetch(signedRequest(await sign(EMAIL)), realEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toContain("Cf-Access-Jwt-Assertion");
  });

  it("still matches when the path is encoded or double-slashed", async () => {
    // The guard normalizes, so the handler must too — otherwise a path the
    // guard admits falls through to the 404 placeholder instead of answering.
    const token = await sign(EMAIL);
    for (const path of [
      "/api//admin/session",
      "/api/%61dmin/session",
      "/api/admin//session"
    ]) {
      const res = await worker.fetch(signedRequest(token, path), realEnv());
      expect(res.status, `${path} should reach the handler`).toBe(200);
    }
  });
});

describe("public routes stay public (AC5)", () => {
  // Asserting a specific status, not merely "not 403": a 500 would satisfy
  // `not.toBe(403)` and this is the guard most likely to be broken later.
  it("leaves the SPA document route untouched", async () => {
    const res = await worker.fetch(get("/"), anon);
    expect(res.status).toBe(404); // no asset layer in the test pool
  });

  it("leaves a public mutating endpoint open (story 2.9 poll votes, AC5)", async () => {
    const res = await worker.fetch(
      get("/api/poll/votes", {
        method: "POST",
        body: JSON.stringify({ cert: "yes" }),
        headers: { "content-type": "application/json" }
      }),
      anon
    );
    // Not 403: an anonymous vote is the whole point of the reader poll. It is
    // also not a 404 anymore — story 2.9 owns this path. 200 is the success.
    expect(res.status).toBe(200);
  });

  it("leaves the ops. surface untouched", async () => {
    const res = await worker.fetch(
      new Request("https://ops.pml.example.com/", { method: "GET" }),
      anon
    );
    expect(res.status).toBe(404);
  });

  it("sets no admin cache headers on public responses", async () => {
    const res = await worker.fetch(get("/"), anon);
    expect(res.headers.get("cache-control")).not.toBe("private, no-store");
  });
});

/**
 * Story 1.5 — the agent surface.
 *
 * ChatAgent's @callable() addServer attaches an arbitrary MCP server whose
 * tools run against env.AI. This was reachable by anyone since Story 1.1.
 */
describe("/agents/* perimeter (story 1.5)", () => {
  it("rejects an unauthenticated agent request with 403", async () => {
    const res = await worker.fetch(get("/agents/chat-agent/default"), anon);
    expect(res.status).toBe(403);
  });

  it("rejects the bare /agents path", async () => {
    const res = await worker.fetch(get("/agents"), anon);
    expect(res.status).toBe(403);
  });

  it.each(["/%61gents/chat-agent/x", "//agents/chat-agent/x"])(
    "rejects %s — normalization bypasses do not work here either",
    async (path) => {
      const res = await worker.fetch(get(path), anon);
      expect(res.status).toBe(403);
    }
  );

  // The live bypass this review found and fixed: a malformed percent-escape
  // used to make the guard say "not an agents path" while
  // routeAgentRequest — which never decodes anything — still routed the
  // request straight to a live ChatAgent Durable Object. Confirmed against
  // the pre-fix code: this returned 404 "Not implemented" from the DO
  // itself, not 403 from the guard.
  it.each(["/agents/chat-agent/%zz", "/agents/%zz"])(
    "rejects %s — a malformed escape must not reach a live agent unauthenticated",
    async (path) => {
      const res = await worker.fetch(get(path), anon);
      expect(res.status).toBe(403);
    }
  );

  it("returns the same opaque envelope as the admin perimeter", async () => {
    const res = await worker.fetch(get("/agents/chat-agent/default"), anon);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ code: "forbidden", message: expect.any(String) });
    expect(body.details).toBeUndefined();
  });

  it("does not guard a lookalike path", async () => {
    const res = await worker.fetch(get("/agentsomething"), anon);
    expect(res.status).not.toBe(403);
  });

  it("lets the operator through via the loopback dev bypass", async () => {
    const res = await worker.fetch(
      new Request("http://localhost:5173/agents/chat-agent/default"),
      authed
    );
    expect(res.status).not.toBe(403);
  });
});
