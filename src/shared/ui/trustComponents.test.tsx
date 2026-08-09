import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EmptyState,
  LastUpdated,
  NotLiveDraftBanner,
  OriginFlag,
  PostureSwatch,
  ProvenanceLabel,
  RunStatusChip,
  StatusBadge,
  UpdatedBadge,
  WarnChip
} from "./index";

// These assertions are the contract Stories 1.3 / 2.x / 3.x build on:
// the class names come from the UX handoff, and the enum strings must match
// what D1 stores and Zod validates later. Changing either here is a breaking
// change, not a refactor.

describe("NotLiveDraftBanner", () => {
  it("carries the ticket edge and the banner", () => {
    const html = renderToStaticMarkup(
      <NotLiveDraftBanner>
        <p>draft body</p>
      </NotLiveDraftBanner>
    );
    expect(html).toContain('class="draft"');
    expect(html).toContain('class="draftbanner"');
    expect(html).toContain("draft body");
  });

  it("states 'Not live · awaiting approval' verbatim (UX-DR5)", () => {
    const html = renderToStaticMarkup(
      <NotLiveDraftBanner>x</NotLiveDraftBanner>
    );
    expect(html).toContain("Not live · awaiting approval");
  });
});

describe("ProvenanceLabel", () => {
  it("marks agent approval with the dashed variant", () => {
    const html = renderToStaticMarkup(<ProvenanceLabel kind="agent" />);
    expect(html).toContain('class="prov agent"');
    expect(html).toContain("Agent-approved");
  });

  it("marks human approval without the agent variant", () => {
    const html = renderToStaticMarkup(<ProvenanceLabel kind="human" />);
    expect(html).toContain('class="prov"');
    expect(html).not.toContain("agent");
    expect(html).toContain("Human-approved");
  });

  it("appends the detail suffix when given", () => {
    const html = renderToStaticMarkup(
      <ProvenanceLabel kind="agent" detail="gate-v2.1" />
    );
    expect(html).toContain("Agent-approved · gate-v2.1");
  });
});

describe("PostureSwatch", () => {
  // UX-DR2: the ramp is never carried by fill alone — every step ships its label.
  const steps = [
    ["untracked", "No tracked activity"],
    ["platform", "Decided for platform"],
    ["pending", "Pending — skeptical"],
    ["state", "Decided for state"],
    ["banned", "Banned"]
  ] as const;

  it.each(steps)(
    "renders the %s step with its paired label",
    (posture, label) => {
      const html = renderToStaticMarkup(<PostureSwatch posture={posture} />);
      expect(html).toContain(`class="sw ${posture}"`);
      expect(html).toContain(label);
    }
  );
});

describe("StatusBadge", () => {
  // Enum strings match the PRD glossary and the D1 column exactly.
  it.each(["go", "restricted", "banned"] as const)(
    "renders the %s operational status",
    (status) => {
      const html = renderToStaticMarkup(<StatusBadge status={status} />);
      expect(html).toContain(`class="badge ${status}"`);
      expect(html).toContain(status);
    }
  );
});

describe("UpdatedBadge", () => {
  it("renders the updated marker", () => {
    const html = renderToStaticMarkup(<UpdatedBadge />);
    expect(html).toContain('class="badge upd"');
    expect(html).toContain("updated");
  });
});

describe("RunStatusChip", () => {
  it.each([
    ["published", "run published"],
    ["awaiting", "run awaiting"],
    ["empty", "run noop"],
    ["failed", "run failed"],
    ["stopped", "run stopped"],
    ["rejected", "run rejected"]
  ] as const)("maps status %s to class %s", (status, className) => {
    const html = renderToStaticMarkup(<RunStatusChip status={status} />);
    expect(html).toContain(`class="${className}"`);
  });

  it("labels the empty run as 'no material change', not as an error", () => {
    const html = renderToStaticMarkup(<RunStatusChip status="empty" />);
    expect(html).toContain("no material change");
  });
});

describe("OriginFlag", () => {
  it.each(["scheduled", "catch-up", "manual"] as const)(
    "renders the %s origin using the DB enum string",
    (origin) => {
      const html = renderToStaticMarkup(<OriginFlag origin={origin} />);
      expect(html).toContain('class="origin"');
      expect(html).toContain(origin);
    }
  );
});

describe("EmptyState", () => {
  it("renders title and reason with no default apology copy", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No material change">
        The run completed and proposed nothing.
      </EmptyState>
    );
    expect(html).toContain('class="empty"');
    expect(html).toContain("<b>No material change</b>");
    expect(html).toContain("The run completed and proposed nothing.");
    expect(html.toLowerCase()).not.toContain("sorry");
  });

  it("renders the hint as a separate line when given", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Evals not run"
        hint="An empty eval is not a passing eval."
      >
        This run predates the eval suite.
      </EmptyState>
    );
    expect(html).toContain('class="hint"');
    expect(html).toContain("An empty eval is not a passing eval.");
  });
});

describe("WarnChip", () => {
  it("defaults to the not-legal-advice disclaimer with a decorative glyph", () => {
    const html = renderToStaticMarkup(<WarnChip />);
    expect(html).toContain('class="warn"');
    expect(html).toContain("General legal information — not legal advice");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("LastUpdated", () => {
  it("formats an ISO-8601 UTC instant in reader-facing ET", () => {
    // 2026-08-09T10:12:00Z === 06:12 EDT
    const html = renderToStaticMarkup(
      <LastUpdated at="2026-08-09T10:12:00.000Z" />
    );
    expect(html).toContain('class="lastupd"');
    expect(html).toContain("Updated 9 Aug 2026, 06:12 ET");
  });
});
