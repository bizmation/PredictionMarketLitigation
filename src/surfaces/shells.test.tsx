import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminShell } from "./admin/AdminShell";
import { ApexShell } from "./apex/ApexShell";
import { LaunchNote } from "./apex/LaunchNote";
import { OpsShell } from "./ops/OpsShell";

const apex = () => renderToStaticMarkup(<ApexShell />);
const launchNote = () => renderToStaticMarkup(<LaunchNote />);
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
    expect(apex().match(/class="empty"/g)).toHaveLength(10);
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

describe("ApexShell launch note (temporary, Story 2.2 removes it)", () => {
  it("gives the document exactly one h1", () => {
    // Before this band the page had none: SectionBand titles are h2 and the
    // TopBar brand is a div. An outline gap that mattered the moment the site
    // got linked to from anywhere.
    const html = apex();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("explains that empty is deliberate, not broken", () => {
    // The whole reason this band exists: nine honest EmptyStates with nothing
    // above them read as abandoned rather than early.
    const html = launchNote().toLowerCase();
    expect(html).toContain("deliberately");
    expect(html).toContain("open source");
  });

  it("keeps the absence-is-not-a-finding rule on the landing view", () => {
    expect(launchNote()).toContain("Absence of a finding is never a finding.");
  });

  it("does not claim the pipeline is running yet", () => {
    // It is not built — Epic 3 owns it. A landing page that implies a live
    // pipeline would be the exact overstatement the trust chrome forbids.
    const html = launchNote().toLowerCase();
    expect(html).toContain("what comes next");
    expect(html).not.toContain("updated daily");
    expect(html).not.toContain("live pipeline");
  });

  it("links out to the repo and to ops.", () => {
    const html = launchNote();
    expect(html).toContain("github.com/bizmation/PredictionMarketLitigation");
    expect(html).toContain("ops.predictionmarketlitigation.com");
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

  it("no longer claims the page is unprotected (Access bound 2026-08-10)", () => {
    // The predecessor of this test asserted the warn slot said "not
    // access-controlled", and carried an explicit instruction: delete it only
    // when Access is actually in front of /admin. Story 1.5 Part B did that —
    // application `PML admin` covers /admin, /admin/* and /api/admin/* — so
    // the claim became false and the test retired with it.
    //
    // The invariant did NOT change: a surface must never look better protected
    // than it is. Its mirror now applies too — looking worse protected than it
    // is teaches the operator to discount the chrome, which costs the same
    // trust by a different route.
    const html = admin().toLowerCase();
    expect(html).not.toContain("not access-controlled");
    expect(html).not.toContain("anyone with this url");
  });

  it("keeps the gate state in the warn slot", () => {
    const html = admin();
    expect(html).toContain('class="warn"');
    expect(html).toContain("Autonomous OFF");
    expect(html).toContain("Gate: HITL");
  });

  it("says nobody is signed in until the server says otherwise", () => {
    // renderToStaticMarkup runs no effects, so useAdminSession never resolves
    // here — which is exactly the first-paint and signed-out state. A name in
    // this strip is a claim that the server verified an identity; absent has
    // to keep meaning absent rather than defaulting to the configured operator.
    expect(admin()).toContain("Not signed in");
    expect(admin()).not.toContain("operator identity");
  });
});

describe("dev mode", () => {
  it("routes cross-surface links through ?surface= so one origin reaches all three", () => {
    const html = renderToStaticMarkup(<ApexShell dev />);
    expect(html).toContain("?surface=ops");
    expect(html).not.toContain("https://ops.predictionmarketlitigation.com");
  });
});
