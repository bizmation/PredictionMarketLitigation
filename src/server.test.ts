import { env } from "cloudflare:workers";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true
    });
    const jwk = (await exportJWK(publicKey)) as Record<string, unknown>;
    jwk.kid = "e2e-1";
    jwk.alg = "RS256";
    jwk.use = "sig";
    vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));

    const realEnv = {
      ...env,
      ACCESS_DEV_BYPASS: undefined,
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
      OPERATOR_EMAIL: EMAIL
    } as Env;

    const sign = (email: string) =>
      new SignJWT({ email })
        .setProtectedHeader({ alg: "RS256", kid: "e2e-1" })
        .setIssuer(TEAM)
        .setAudience(AUD)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

    return { realEnv, sign };
  }

  it("lets the operator through to the handler", async () => {
    const { realEnv, sign } = await setup();
    const token = await sign(EMAIL);
    const res = await worker.fetch(
      get("/api/admin/ping", { headers: { "cf-access-jwt-assertion": token } }),
      realEnv
    );
    expect(res.status).toBe(404); // past the guard, no handler yet
  });

  it("still rejects a valid token for a non-operator identity", async () => {
    const { realEnv, sign } = await setup();
    const token = await sign("someone.else@example.com");
    const res = await worker.fetch(
      get("/api/admin/ping", { headers: { "cf-access-jwt-assertion": token } }),
      realEnv
    );
    expect(res.status).toBe(403);
  });
});

describe("public routes stay public (AC5)", () => {
  // Asserting a specific status, not merely "not 403": a 500 would satisfy
  // `not.toBe(403)` and this is the guard most likely to be broken later.
  it("leaves the SPA document route untouched", async () => {
    const res = await worker.fetch(get("/"), anon);
    expect(res.status).toBe(404); // no asset layer in the test pool
  });

  it("leaves a public mutating endpoint untouched (story 2.9 poll votes)", async () => {
    const res = await worker.fetch(
      get("/api/poll/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "grant" }),
        headers: { "content-type": "application/json" }
      }),
      anon
    );
    expect(res.status).toBe(404);
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
