import { describe, expect, it } from "vitest";

import worker from "./server";

// Smoke test (story 1.1): the Worker module exposes the shape wrangler deploys.
// Runs inside workerd via @cloudflare/vitest-pool-workers against wrangler.jsonc.
describe("worker module", () => {
  it("exports a default fetch handler", () => {
    expect(worker).toBeDefined();
    expect(typeof worker.fetch).toBe("function");
  });
});
