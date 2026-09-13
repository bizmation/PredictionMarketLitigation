import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";
import { ModeControls } from "./ModeControls";

describe("ModeControls (story 3.13)", () => {
  it("renders the HITL toggle and integer threshold", () => {
    const html = renderToStaticMarkup(
      <ModeControls current={DEFAULT_APPROVAL_MODE} />
    );
    expect(html).toContain("Autonomous mode is OFF");
    expect(html).toContain('class="toggle"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("70");
    expect(html).toContain("No mode changes recorded.");
    expect(html).not.toContain("@");
  });

  it("renders YOLO on and audit displayNames only", () => {
    const html = renderToStaticMarkup(
      <ModeControls
        current={{
          ...DEFAULT_APPROVAL_MODE,
          mode: "yolo",
          audit: [
            {
              id: "a1",
              createdAt: "2026-09-13T16:00:00.000Z",
              actorDisplayName: "Distinctive Queue Operator",
              kind: "mode",
              prior: { mode: "hitl" },
              next: { mode: "yolo" }
            }
          ]
        }}
      />
    );
    expect(html).toContain("Autonomous mode is ON");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Distinctive Queue Operator");
    expect(html).toContain("mode hitl → yolo");
    expect(html).not.toContain("@");
  });
});
