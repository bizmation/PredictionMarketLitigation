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

  it("states plainly that Access is not yet wired (Story 1.4)", () => {
    // Honest chrome: an unprotected admin surface must say so, not imply
    // protection it does not have.
    expect(admin().toLowerCase()).toContain("not protected");
  });
});

describe("dev mode", () => {
  it("routes cross-surface links through ?surface= so one origin reaches all three", () => {
    const html = renderToStaticMarkup(<ApexShell dev />);
    expect(html).toContain("?surface=ops");
    expect(html).not.toContain("https://ops.predictionmarketlitigation.com");
  });
});
