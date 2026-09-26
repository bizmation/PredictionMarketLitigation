import { COST_POLICIES, type CostPolicy } from "../pipeline/ai/costPolicy";
/** Explicit synthetic pricing for non-provider integration fakes, never production config. */
export function fixtureCostPolicy(
  provider: string,
  model: string,
  now: string
): CostPolicy {
  return {
    ...COST_POLICIES[0]!,
    provider,
    model,
    inputTokens: 200000,
    inputUsdPerMillion: "2.5",
    outputUsdPerMillion: "0",
    verifiedAt: now,
    validUntil: new Date(Date.parse(now) + 7 * 86400000).toISOString()
  };
}
