import { describe, expect, it } from "vitest";
import {
  COST_POLICIES,
  reportedUsdCents,
  resolveCostPolicy,
  tokenCostCents,
  validatePolicy
} from "./costPolicy";
describe("bounded-text-v1", () => {
  const now = "2026-09-26T15:00:00.000Z";
  it("computes approved bounds by summing before ceiling", () => {
    expect(
      COST_POLICIES.map((p) => tokenCostCents(p, p.inputTokens, p.outputTokens))
    ).toEqual([2, 124]);
    expect(
      tokenCostCents(
        {
          ...COST_POLICIES[0]!,
          inputUsdPerMillion: "5",
          outputUsdPerMillion: "5"
        },
        1000,
        1000
      )
    ).toBe(1);
    expect(
      tokenCostCents(
        {
          ...COST_POLICIES[0]!,
          inputUsdPerMillion: "5",
          outputUsdPerMillion: "5"
        },
        1000,
        1001
      )
    ).toBe(2);
  });
  it.each([
    [0, 0],
    [0.01, 1],
    [0.0100000001, 2],
    [1e-8, 1],
    [1, 100]
  ])("rounds reported %s dollars to %s cents exactly", (usd, cents) =>
    expect(reportedUsdCents(usd)).toBe(cents)
  );
  it.each([null, undefined, NaN, Infinity, -1, "0.01"])(
    "rejects invalid usage cost %s",
    (value) => expect(reportedUsdCents(value)).toBeNull()
  );
  it("requires exact models, validates expiry and future verification", () => {
    const p = COST_POLICIES[0]!;
    expect(resolveCostPolicy(p.provider, p.model, now)).toEqual(p);
    expect(() =>
      resolveCostPolicy("openrouter", "openrouter/auto", now)
    ).toThrow();
    expect(() => validatePolicy(p, p.validUntil)).toThrow();
    expect(() => validatePolicy(p, "2026-09-25T23:59:59.999Z")).toThrow();
    expect(validatePolicy(p, "2026-10-03T14:01:48.999Z")).toEqual(p);
  });
  it.each([
    { inputUsdPerMillion: "NaN" },
    { inputUsdPerMillion: "-1" },
    { dimensions: "unknown" },
    { outputTokens: 4096 },
    { validUntil: "2026-10-04T00:00:00.000Z" }
  ])("rejects malformed policy", (change) =>
    expect(() =>
      validatePolicy({ ...COST_POLICIES[0], ...change }, now)
    ).toThrow()
  );
});
