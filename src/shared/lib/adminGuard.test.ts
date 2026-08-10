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

  it("treats a malformed escape as un-routable rather than throwing", () => {
    expect(() => isAdminApiPath("/api/%zz/admin")).not.toThrow();
    expect(isAdminApiPath("/api/%zz/admin")).toBe(false);
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
});
