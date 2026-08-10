import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminShell } from "./admin/AdminShell";
import { ApexShell } from "./apex/ApexShell";
import { OpsShell } from "./ops/OpsShell";

const apex = () => renderToStaticMarkup(<ApexShell />);
const ops = () => renderToStaticMarkup(<OpsShell />);
const admin = () => renderToStaticMarkup(<AdminShell />);

describe("every surface", () => {
  it.each([
    ["apex", apex],
    ["ops", ops],
    ["admin", admin]
  ])("%s renders the top bar and trust bar", (_name, render) => {
    const html = render();
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="trustbar"');
  });
});

describe("ApexShell", () => {
  it("carries the positioning line verbatim (UX-DR7)", () => {
    expect(apex()).toContain(
      "Built by AI, governed and approved by a human; corrections welcome."
    );
  });

  it("carries the not-legal-advice warn and a last-updated placeholder", () => {
    const html = apex();
    expect(html).toContain('class="warn"');
    expect(html).toContain("not legal advice");
    expect(html).toContain('class="lastupd"');
  });

  it("links to ops. and to the public repo", () => {
    const html = apex();
    expect(html).toContain("ops.predictionmarketlitigation.com");
    expect(html).toContain("github.com/bizmation/PredictionMarketLitigation");
  });

  it("renders the long-scroll section anchors in handoff order", () => {
    const html = apex();
    for (const id of [
      "brief",
      "circuits",
      "states",
      "issues",
      "cases",
      "entities",
      "cert"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  // AC6 — the IA split. This is the assertion most likely to be broken by a
  // well-meaning future edit that "helpfully" surfaces governance on apex.
  // Checks content, not just ids — a future band under a different id could
  // still carry this content and violate AC6 while passing an id-only guard.
  it("does NOT host the nine-layer explainer or the canonical journal", () => {
    const html = apex();
    expect(html).not.toContain('id="layers"');
    expect(html).not.toContain('id="journal"');
    expect(html).not.toContain("Nine layers of governance");
    expect(html).not.toContain("Build journal");
    expect(html).not.toContain("Gateway · Guardrails");
  });

  it("uses EmptyState for every unwired band", () => {
    expect(apex()).toContain('class="empty"');
  });
});

describe("OpsShell", () => {
  it("renders the run log, explainer and journal bands", () => {
    const html = ops();
    for (const id of ["runs", "drafts", "mode", "layers", "journal"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("wraps unwired bands in EmptyState", () => {
    expect(ops()).toContain('class="empty"');
  });

  it("links back to apex", () => {
    expect(ops()).toContain("https://predictionmarketlitigation.com");
  });

  it("warns that nothing on ops. is live tracker content", () => {
    expect(ops()).toContain("Nothing here is live tracker content");
  });
});

describe("AdminShell", () => {
  it("links to both apex and ops.", () => {
    const html = admin();
    expect(html).toContain("https://predictionmarketlitigation.com");
    expect(html).toContain("ops.predictionmarketlitigation.com");
  });

  it("renders the approval queue and mode control bands", () => {
    const html = admin();
    expect(html).toContain('id="queue"');
    expect(html).toContain('id="mode"');
  });

  it("renders the operator session strip (story 1.4)", () => {
    const html = admin();
    expect(html).toContain('class="adminbar"');
    expect(html).toContain("Private · operator only");
    expect(html).toContain(
      "Actions taken here are published on ops. within seconds, including rejections."
    );
    expect(html).toContain('class="who"');
  });

  it("shows the public-safe display name, never an email", () => {
    const html = renderToStaticMarkup(
      <AdminShell operator={{ displayName: "Patrick" }} />
    );
    expect(html).toContain("Patrick — operator identity");
    // Story 3.13 renders mode-change audits publicly on ops. using this same
    // name. An email must never be the thing that gets published.
    expect(html).not.toContain("@");
  });

  it("invents no session duration when there is no session to measure", () => {
    // The handoff shows "· session 41m". There is no source for that number
    // until Access issues real sessions (story 1.5), and a fabricated receipt
    // on a provenance project is worse than an absent one.
    expect(admin()).not.toMatch(/session \d/);
  });

  it("offers no sign-out control", () => {
    // Not in the handoff, and Access owns session lifecycle — a button that
    // did nothing would be a lie about who controls the session.
    const html = admin().toLowerCase();
    expect(html).not.toContain("sign out");
    expect(html).not.toContain("log out");
    expect(html).not.toContain("logout");
  });

  it("states plainly that edge protection is still pending (story 1.5)", () => {
    // Honest chrome: the API perimeter is live, but Cloudflare Access is not
    // in front of the edge yet. Claim exactly that much and no more.
    expect(admin().toLowerCase()).toContain(
      "access binding lands in story 1.5"
    );
  });
});

describe("dev mode", () => {
  it("routes cross-surface links through ?surface= so one origin reaches all three", () => {
    const html = renderToStaticMarkup(<ApexShell dev />);
    expect(html).toContain("?surface=ops");
    expect(html).not.toContain("https://ops.predictionmarketlitigation.com");
  });
});
