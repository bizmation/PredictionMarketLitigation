import { describe, expect, it } from "vitest";

import { isAdminApiPath, isAgentsPath } from "./adminGuard";

/**
 * The prefix matcher is the whole perimeter: everything it returns false for
 * is unauthenticated by design. Its bypasses are the interesting cases.
 */
describe("isAdminApiPath", () => {
  it.each([
    "/api/admin",
    "/api/admin/",
    "/api/admin/drafts/abc/approve",
    "/api/admin/mode"
  ])("guards %s", (path) => {
    expect(isAdminApiPath(path)).toBe(true);
  });

  it.each([
    "/api/administrivia",
    "/api/adminx",
    "/api/poll/votes",
    "/api",
    "/",
    "/admin"
  ])("does not guard %s", (path) => {
    expect(isAdminApiPath(path)).toBe(false);
  });

  // URL.pathname does not percent-decode, so a naive prefix test misses these
  // while a downstream router that DOES decode would serve them.
  it.each([
    ["/api/%61dmin/ping", "percent-encoded 'a'"],
    ["/api/%61dmin", "percent-encoded, bare"],
    ["/api/ad%6Din/ping", "percent-encoded 'm'"],
    ["/api/%2561dmin/ping", "double-encoded"]
  ])("guards %s (%s)", (path) => {
    expect(isAdminApiPath(path)).toBe(true);
  });

  it.each([
    "//api/admin/ping",
    "/api//admin/ping",
    "/api///admin",
    "//api//admin//ping"
  ])("guards %s despite duplicate slashes", (path) => {
    expect(isAdminApiPath(path)).toBe(true);
  });

  // A malformed escape must never let a request past the guard that a
  // non-decoding downstream router (partyserver's routePartykitRequest) would
  // still route. Falling back to the raw path on decode failure means the
  // guard matches whenever that router's raw-split matching would.
  it("does not throw on a malformed escape", () => {
    expect(() => isAdminApiPath("/api/%zz/admin")).not.toThrow();
  });

  it("does not guard a malformed escape that sits before the prefix ever appears", () => {
    // "/api/%zz/admin" never becomes "/api/admin" under any decoding, and the
    // raw string does not start with it either.
    expect(isAdminApiPath("/api/%zz/admin")).toBe(false);
  });

  it("guards a malformed escape AFTER an already-matching raw prefix (the bypass)", () => {
    expect(isAdminApiPath("/api/admin/%zz")).toBe(true);
  });
});

describe("isAgentsPath", () => {
  it.each(["/agents", "/agents/", "/agents/chat-agent/abc", "/agents/x/y/z"])(
    "guards %s",
    (path) => {
      expect(isAgentsPath(path)).toBe(true);
    }
  );

  it.each(["/agentsomething", "/agent", "/api/agents", "/", "/oauth/callback"])(
    "does not guard %s",
    (path) => {
      expect(isAgentsPath(path)).toBe(false);
    }
  );

  // Same normalization as the admin prefix — the encoding and slash bypasses
  // that applied there apply identically here.
  it.each([
    "/%61gents/chat-agent/x",
    "//agents/chat-agent/x",
    "/agents//chat-agent",
    "/%61gents"
  ])("guards %s despite encoding or duplicate slashes", (path) => {
    expect(isAgentsPath(path)).toBe(true);
  });

  // The live bypass this review found: routePartykitRequest (agents/
  // partyserver) never decodes the path — it matches on the raw string. A
  // malformed escape anywhere used to make normalizePath return a sentinel
  // that matched nothing, so the guard said "not an agents path" while the
  // router still routed the request to a live ChatAgent DO, unauthenticated.
  it.each(["/agents/chat-agent/%zz", "/agents/%zz"])(
    "guards %s — a malformed escape must not bypass a raw-matching prefix",
    (path) => {
      expect(isAgentsPath(path)).toBe(true);
    }
  );

  it("does not guard a malformed escape where the raw path never matches the prefix either", () => {
    expect(isAgentsPath("/api/%zz/agents")).toBe(false);
  });
});
