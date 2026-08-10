import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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

  it("reaches the placeholder handler once authenticated", async () => {
    const res = await worker.fetch(get("/api/admin/ping"), authed);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404); // no real admin handlers until story 3.10
  });

  it("guards admin GETs too, not only mutations", async () => {
    const res = await worker.fetch(
      get("/api/admin/queue", { method: "GET" }),
      anon
    );
    expect(res.status).toBe(403);
  });
});

describe("public routes stay public (AC5)", () => {
  it("leaves the SPA document route untouched", async () => {
    const res = await worker.fetch(get("/"), anon);
    expect(res.status).not.toBe(403);
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
    expect(res.status).not.toBe(403);
  });

  it("leaves the ops. surface untouched", async () => {
    const res = await worker.fetch(
      new Request("https://ops.pml.example.com/", { method: "GET" }),
      anon
    );
    expect(res.status).not.toBe(403);
  });
});
