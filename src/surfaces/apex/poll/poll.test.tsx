import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PollResults } from "../../../shared/schemas/poll";
import { PollPanel } from "./PollPanel";
import {
  CERT_LABELS,
  formatVoteCount,
  percent,
  percentSplit,
  termLabel
} from "./pollView";

const unvoted: PollResults = {
  voted: false,
  mine: { cert: null, term: null },
  total: 0,
  cert: null,
  terms: null
};

const voted: PollResults = {
  voted: true,
  mine: { cert: "yes", term: null },
  total: 4,
  cert: { yes: 3, no: 1 },
  terms: null
};

const votedWithTerm: PollResults = {
  voted: true,
  mine: { cert: "yes", term: "ot26" },
  total: 4,
  cert: { yes: 3, no: 1 },
  terms: { ot26: 2, ot27: 1, ot28: 0, later: 1 }
};

const votedNo: PollResults = {
  voted: true,
  mine: { cert: "no", term: null },
  total: 4,
  cert: { yes: 3, no: 1 },
  terms: null
};

describe("pollView", () => {
  it("labels terms and computes whole percents without dividing by zero", () => {
    expect(termLabel("ot26")).toBe("OT 2026");
    expect(termLabel("later")).toBe("Later or never");
    expect(percent(3, 4)).toBe(75);
    expect(percent(0, 0)).toBe(0);
    expect(formatVoteCount(1284)).toBe("1,284");
    expect(CERT_LABELS.yes).toBe("They grant");
    expect(CERT_LABELS.no).toBe("They deny");
  });

  it("splits a column's percents so they always sum to exactly 100", () => {
    expect(percentSplit([3, 1])).toEqual([75, 25]);
    expect(percentSplit([1, 7])).toEqual([13, 87]);
    expect(percentSplit([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentSplit([2, 1, 0, 1])).toEqual([50, 25, 0, 25]);
    expect(percentSplit([0, 0])).toEqual([0, 0]);
    for (const counts of [
      [1, 7],
      [1, 1, 1],
      [2, 1, 0, 1]
    ]) {
      expect(percentSplit(counts).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe("PollPanel", () => {
  it("shows the wait hint before voting, with no bars and no fake counts", () => {
    const html = renderToStaticMarkup(
      <PollPanel results={unvoted} status="success" />
    );
    expect(html).toContain("readers have called it");
    expect(html).toContain("Vote to see the split");
    expect(html).not.toContain("%");
    expect(html).not.toContain("1,284");
    expect(html).not.toContain("742");
  });

  it("reveals percentage bars with .me on my grant but not on deny", () => {
    const html = renderToStaticMarkup(
      <PollPanel results={voted} status="success" />
    );
    expect(html).toContain("75%");
    expect(html).toContain("25%");
    expect(html).toContain("4 votes");
    expect(
      html.match(/<div class="row me"><span class="lab">They grant<\/span>/)
    ).not.toBeNull();
    expect(
      html.match(/<div class="row"><span class="lab">They deny<\/span>/)
    ).not.toBeNull();
  });

  it("locks cert buttons after voting and keeps term buttons grant-only", () => {
    const granted = renderToStaticMarkup(
      <PollPanel results={voted} status="success" />
    );
    expect((granted.match(/ disabled=""/g) ?? []).length).toBe(2);

    const denied = renderToStaticMarkup(
      <PollPanel results={votedNo} status="success" />
    );
    expect((denied.match(/ disabled=""/g) ?? []).length).toBe(6);
  });

  it("reveals term bars only after a term pick", () => {
    const noTerm = renderToStaticMarkup(
      <PollPanel results={voted} status="success" />
    );
    expect(noTerm).toContain("petition was docketed 28 July 2026");
    expect(noTerm).not.toContain("OT 2026%");

    const withTerm = renderToStaticMarkup(
      <PollPanel results={votedWithTerm} status="success" />
    );
    expect(withTerm).toContain("OT 2026");
    expect(withTerm).toMatch(
      /<div class="row me"><span class="lab">OT 2026<\/span>/
    );
  });

  it("carries the FR44 footer disclaimer verbatim with a #cert link", () => {
    const html = renderToStaticMarkup(
      <PollPanel results={unvoted} status="success" />
    );
    expect(html).toContain("unscientific");
    expect(html).toContain("not evidence");
    expect(html).toContain("not a forecast");
    expect(html).toContain("not connected to any market");
    expect(html).toContain("One vote per browser");
    expect(html).toContain('href="#cert"');
    expect(html).not.toContain("stored locally");
    expect(html).not.toContain("nothing is sent");
  });

  it("keeps market/probability language out and inlines the thumb SVGs", () => {
    const html = renderToStaticMarkup(
      <PollPanel results={voted} status="success" />
    );
    expect(html.toLowerCase()).not.toContain("kalshi.com");
    expect(html.toLowerCase()).not.toContain("robinhood.com");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('d="M7 10v12"');
    expect(html.toLowerCase()).not.toContain("lucide");
  });

  it("fails closed with an honest empty state, not a forecast", () => {
    const html = renderToStaticMarkup(<PollPanel status="error" />);
    expect(html).toContain("Reader poll unavailable");
    expect(html).toContain("not a forecast of the outcome");
    expect(html).not.toContain("%");
  });
});
