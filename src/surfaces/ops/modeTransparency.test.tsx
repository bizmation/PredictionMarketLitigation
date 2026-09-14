import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";
import { ModeTransparency } from "./ModeTransparency";

describe("ModeTransparency (story 3.13)", () => {
  it("shows HITL, the numeric threshold, and an empty audit", () => {
    const html = renderToStaticMarkup(
      <ModeTransparency current={DEFAULT_APPROVAL_MODE} />
    );
    expect(html).toContain("HITL — human in the loop");
    expect(html).toContain("auto-approve threshold 70");
    expect(html).toContain("No mode changes recorded.");
    expect(html).toContain('class="modebox"');
    expect(html).not.toContain("@");
  });

  it("shows YOLO and audit displayNames only", () => {
    const html = renderToStaticMarkup(
      <ModeTransparency
        current={{
          ...DEFAULT_APPROVAL_MODE,
          mode: "yolo",
          threshold: 80,
          audit: [
            {
              id: "a1",
              createdAt: "2026-09-13T16:00:00.000Z",
              actorDisplayName: "Patrick",
              kind: "threshold",
              prior: { threshold: 70 },
              next: { threshold: 80 }
            }
          ]
        }}
      />
    );
    expect(html).toContain("YOLO — autonomous");
    expect(html).toContain("auto-approve threshold 80");
    expect(html).toContain("Patrick");
    expect(html).toContain("threshold 70 → 80");
    expect(html).not.toContain("@");
  });
});
