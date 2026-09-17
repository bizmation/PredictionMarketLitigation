import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SteeringPanel } from "./SteeringPanel";

describe("SteeringPanel markup (story 3.14)", () => {
  it("renders the composer with a private checkbox next to submit", () => {
    const html = renderToStaticMarkup(
      <SteeringPanel runId="run-20260914-aaa1" draftId="d-1" />
    );
    expect(html).toContain('class="composer"');
    expect(html).toContain('id="steering-content"');
    expect(html).toContain('id="steering-private"');
    expect(html).toContain("Mark private at submit");
    expect(html).toContain("Privacy is chosen at submit and cannot be undone");
    expect(html).toContain("Submit turn");
    expect(html).toContain("Revise draft");
    expect(html).not.toContain("content withheld");
    expect(html.indexOf("steering-private")).toBeLessThan(
      html.indexOf("Submit turn")
    );
    expect(html.indexOf("Submit turn")).toBeLessThan(
      html.indexOf("Revise draft")
    );
  });
});
