import { describe, expect, it } from "vitest";
import recordedCatalog from "./fixtures/deepseek-v4-flash-catalog-row.json";
import {
  COST_POLICIES,
  decimalProductAtMost,
  reportedUsdCents,
  resolveCostPolicy,
  tokenCostCents,
  usdPerMillionToCentsPerToken,
  validatePolicy
} from "./costPolicy";
describe("bounded-text-v1", () => {
  const now = "2026-09-26T15:00:00.000Z";
  it("computes approved bounds by summing before ceiling", () => {
    expect(
      COST_POLICIES.map((p) => tokenCostCents(p, p.inputTokens, p.outputTokens))
    ).toEqual([2, 124, 16, 19]);
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
  it("pins the V4-Flash 19-cent bound from the recorded catalog row", () => {
    const policy = COST_POLICIES.find(
      (entry) => entry.model === "deepseek-ai/DeepSeek-V4-Flash"
    )!;
    const pricing = recordedCatalog.pricing;
    const hourWrite = pricing.rate_per_explicit_cache_write_token["1h"];
    // cents/token × multiplier × 10_000 = USD per million tokens.
    const inputUsdPerMillion =
      pricing.cents_per_input_token * hourWrite * 10_000;
    const outputUsdPerMillion = pricing.cents_per_output_token * 10_000;
    expect(pricing.cents_per_input_token).toBe(9e-6);
    expect(hourWrite).toBe(2);
    expect(inputUsdPerMillion).toBe(0.18);
    expect(outputUsdPerMillion).toBe(0.18);
    expect(policy.inputTokens).toBe(recordedCatalog.max_tokens);
    expect(policy.inputUsdPerMillion).toBe(String(inputUsdPerMillion));
    expect(policy.outputUsdPerMillion).toBe(String(outputUsdPerMillion));
    expect(
      tokenCostCents(policy, policy.inputTokens, policy.outputTokens)
    ).toBe(19);
    expect(
      resolveCostPolicy(policy.provider, policy.model, policy.verifiedAt)
    ).toEqual(policy);
  });
  it("converts USD per million tokens to cents per token", () => {
    expect(usdPerMillionToCentsPerToken("10000")).toBe("1");
    expect(usdPerMillionToCentsPerToken("0.18")).toBe("0.000018");
    expect(usdPerMillionToCentsPerToken("0.15")).toBe("0.000015");
    expect(usdPerMillionToCentsPerToken("0.50")).toBe("0.00005");
  });
  it("compares a decimal product without floating-point conversion", () => {
    expect(decimalProductAtMost("2", "3", "6")).toBe(true);
    expect(decimalProductAtMost("2", "4", "6")).toBe(false);
    expect(decimalProductAtMost("2.0", "1.50", "3.000")).toBe(true);
    expect(decimalProductAtMost("2.00", "0.000009", "0.000018")).toBe(true);
    expect(decimalProductAtMost("nope", "1", "1")).toBe(false);
    expect(decimalProductAtMost("1", "1", "")).toBe(false);
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
