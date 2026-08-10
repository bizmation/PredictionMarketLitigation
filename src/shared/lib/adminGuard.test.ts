import { describe, expect, it } from "vitest";

import { isAdminApiPath } from "./adminGuard";

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
