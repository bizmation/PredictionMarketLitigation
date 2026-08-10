import { describe, expect, it } from "vitest";

import { resolveSurface, surfaceHref } from "./surface";

// Pure module — no React, no DOM. Runs in the workers project.

describe("resolveSurface", () => {
  it("resolves the bare apex host to apex", () => {
    expect(
      resolveSurface(new URL("https://predictionmarketlitigation.com/"))
    ).toBe("apex");
  });

  it("resolves the ops. subdomain to ops", () => {
    expect(
      resolveSurface(new URL("https://ops.predictionmarketlitigation.com/"))
    ).toBe("ops");
  });

  it("resolves /admin to admin", () => {
    expect(
      resolveSurface(new URL("https://predictionmarketlitigation.com/admin"))
    ).toBe("admin");
  });

  it("resolves nested admin paths to admin", () => {
    expect(
      resolveSurface(
        new URL("https://predictionmarketlitigation.com/admin/queue")
      )
    ).toBe("admin");
  });

  it("does not treat /administrivia as admin", () => {
    expect(
      resolveSurface(
        new URL("https://predictionmarketlitigation.com/administrivia")
      )
    ).toBe("apex");
  });

  // Precedence: path beats host. An operator on ops. who navigates to /admin
  // must land on admin chrome, not the public ops. shell.
  it("prefers /admin over the ops. host when they disagree", () => {
    expect(
      resolveSurface(
        new URL("https://ops.predictionmarketlitigation.com/admin")
      )
    ).toBe("admin");
  });

  it("honours ?surface= when dev overrides are allowed", () => {
    const url = new URL("http://localhost:5173/?surface=ops");
    expect(resolveSurface(url, { allowQueryOverride: true })).toBe("ops");
    expect(
      resolveSurface(new URL("http://localhost:5173/?surface=admin"), {
        allowQueryOverride: true
      })
    ).toBe("admin");
  });

  it("IGNORES ?surface= when dev overrides are not allowed", () => {
    // The security property: pasting ?surface=admin at a production origin must
    // never reach admin chrome.
    const url = new URL(
      "https://predictionmarketlitigation.com/?surface=admin"
    );
    expect(resolveSurface(url, { allowQueryOverride: false })).toBe("apex");
    expect(resolveSurface(url)).toBe("apex");
  });

  it("ignores an unrecognised ?surface= value", () => {
    expect(
      resolveSurface(new URL("http://localhost:5173/?surface=nope"), {
        allowQueryOverride: true
      })
    ).toBe("apex");
  });

  it("still prefers the real /admin path over a ?surface= override", () => {
    expect(
      resolveSurface(new URL("http://localhost:5173/admin?surface=apex"), {
        allowQueryOverride: true
      })
    ).toBe("admin");
  });

  it("treats an ops.localhost dev host as ops", () => {
    expect(resolveSurface(new URL("http://ops.localhost:5173/"))).toBe("ops");
  });
});

describe("surfaceHref", () => {
  it("uses query overrides in dev so a single origin can reach every surface", () => {
    expect(surfaceHref("ops", { dev: true })).toBe("/?surface=ops");
    expect(surfaceHref("apex", { dev: true })).toBe("/?surface=apex");
  });

  it("uses the real origins in production", () => {
    expect(surfaceHref("apex", { dev: false })).toBe(
      "https://predictionmarketlitigation.com"
    );
    expect(surfaceHref("ops", { dev: false })).toBe(
      "https://ops.predictionmarketlitigation.com"
    );
  });

  it("keeps admin path-relative in both modes — it is never a separate origin", () => {
    expect(surfaceHref("admin", { dev: false })).toBe("/admin");
    expect(surfaceHref("admin", { dev: true })).toBe("/admin");
  });

  it("appends a path to the target surface", () => {
    expect(surfaceHref("ops", { dev: false, path: "/runs" })).toBe(
      "https://ops.predictionmarketlitigation.com/runs"
    );
    expect(surfaceHref("ops", { dev: true, path: "/runs" })).toBe(
      "/runs?surface=ops"
    );
  });
});
