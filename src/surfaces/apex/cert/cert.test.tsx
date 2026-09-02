import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CertSignal } from "../../../shared/schemas/certSignal";
import { CertBoard } from "./CertBoard";
import { readingLabel, scaleFilledCount } from "./certView";
import { isCertSignal } from "./useCertSignal";

const STAMP = "2026-08-09T16:00:00.000Z";

const mock: CertSignal = {
  id: "current",
  reading: "elevated",
  factors: [
    {
      lead: "Mock appellate posture",
      explanation: "Synthetic factor for tests, not a prototype essay."
    },
    {
      lead: "Mock timing",
      explanation: "A second named factor so numbering is visible."
    }
  ],
  methodNote: "Qualitative only; no numeric probability.",
  reviewedAt: "2026-08-09",
  approver: "Test curator",
  provenanceKind: "human",
  publishedAt: STAMP,
  updatedAt: STAMP
};

describe("certView", () => {
  it("labels and fills the qualitative scale from the reading", () => {
    expect(readingLabel("elevated")).toBe("Elevated");
    expect(scaleFilledCount("elevated")).toBe(3);
    expect(readingLabel("remote")).toBe("Remote");
    expect(scaleFilledCount("remote")).toBe(1);
    expect(readingLabel("near-certain")).toBe("Near-certain");
    expect(scaleFilledCount("near-certain")).toBe(5);
  });
});

describe("isCertSignal", () => {
  it("accepts a singleton current reading and rejects envelopes", () => {
    expect(isCertSignal(mock)).toBe(true);
    expect(isCertSignal({ items: [mock] })).toBe(false);
    expect(isCertSignal({ ...mock, id: "other" })).toBe(false);
    expect(isCertSignal({ ...mock, factors: [] })).toBe(false);
  });
});

describe("CertBoard", () => {
  it("renders an injected elevated reading with named mock factors", () => {
    const html = renderToStaticMarkup(
      <CertBoard signal={mock} status="success" />
    );
    expect(html).toContain("Elevated");
    expect(html.match(/class="on"/g)).toHaveLength(3);
    expect(html).toContain("not a probability");
    expect(html).toContain("Not shipped");
    expect(html).toContain("Mock appellate posture");
    expect(html).toContain("Synthetic factor for tests, not a prototype essay.");
    expect(html).toContain("Mock timing");
    expect(html).toContain("A second named factor so numbering is visible.");
    expect(html).toContain('class="fn">1');
    expect(html).toContain('class="fn">2');
    expect(html).toContain("Qualitative only; no numeric probability.");
    expect(html).toContain("of the named factors");
    expect(html).not.toContain("at right");
    expect(html).toContain('class="factors" role="list"');
    expect(html).not.toContain("deep district-court split");
    expect(html).toContain("Reviewed 9 Aug 2026");
    expect(html).toContain("Human-approved");
    expect(html).not.toContain("Test curator");
    expect(html).toContain("no weighting, no model and no score");
    expect(html).not.toContain("%");
    expect(html.toLowerCase()).not.toContain("kalshi.com");
    expect(html.toLowerCase()).not.toContain("robinhood.com");
    expect(html.toLowerCase()).not.toContain("poll");
  });

  it("does not report a reading while the singleton is loading", () => {
    const html = renderToStaticMarkup(<CertBoard status="loading" />);
    expect(html).toContain("Loading cert reading");
    expect(html).toContain('class="cert"');
    expect(html).not.toContain("Remote");
    expect(html).not.toContain(">0</");
    expect(html).not.toContain("Elevated");
    expect(html).not.toContain('class="on"');
  });

  it("fails closed when the fetch is missing or invalid", () => {
    const html = renderToStaticMarkup(<CertBoard status="error" />);
    expect(html).toContain("could not be loaded");
    expect(html).not.toContain("Elevated");
    expect(html).toContain("not a forecast of Remote");
  });
});
