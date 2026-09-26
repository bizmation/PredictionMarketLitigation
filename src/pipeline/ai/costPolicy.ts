import { z } from "zod";

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const CostPolicySchema = z
  .object({
    version: z.literal("bounded-text-v1"),
    provider: z.string().min(1),
    model: z.string().min(1),
    inputTokens: z.number().int().positive().max(200000),
    outputTokens: z.literal(2048),
    inputUsdPerMillion: decimal,
    outputUsdPerMillion: decimal,
    units: z.literal("USD per million tokens"),
    dimensions: z.literal(
      "text-input-output; cache replacement rates included"
    ),
    verifiedAt: z.iso.datetime(),
    validUntil: z.iso.datetime(),
    sources: z.array(z.url()).min(1)
  })
  .strict();
export type CostPolicy = z.infer<typeof CostPolicySchema>;
const common = {
  version: "bounded-text-v1",
  outputTokens: 2048,
  units: "USD per million tokens",
  dimensions: "text-input-output; cache replacement rates included",
  verifiedAt: "2026-09-26T14:01:49.000Z",
  validUntil: "2026-10-03T14:01:49.000Z"
} as const;
export const COST_POLICIES: readonly CostPolicy[] = [
  {
    ...common,
    provider: "workersai",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    inputTokens: 24000,
    inputUsdPerMillion: "0.293",
    outputUsdPerMillion: "2.253",
    sources: [
      "https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/",
      "https://developers.cloudflare.com/workers-ai/platform/pricing/"
    ]
  },
  {
    ...common,
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    inputTokens: 200000,
    inputUsdPerMillion: "6.00",
    outputUsdPerMillion: "15.00",
    sources: [
      "https://openrouter.ai/anthropic/claude-sonnet-4",
      "https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4/endpoints",
      "https://openrouter.ai/docs/guides/routing/provider-selection",
      "https://developers.cloudflare.com/ai-gateway/configuration/request-handling/"
    ]
  }
];
export class CostPolicyError extends Error {}
function rational(value: string): [bigint, bigint] {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new CostPolicyError("Invalid decimal rate");
  const [whole, fraction = ""] = value.split(".");
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
}
function ceiling(n: bigint, d: bigint): number {
  const result = Number((n + d - 1n) / d);
  if (!Number.isSafeInteger(result))
    throw new CostPolicyError("Cost outside safe integer range");
  return result;
}
/** Sum exact rational liabilities, then round up once to integer cents. */
export function tokenCostCents(
  policy: CostPolicy,
  input: number,
  output: number
): number {
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new CostPolicyError("Invalid token usage");
  const [a, b] = rational(policy.inputUsdPerMillion);
  const [c, d] = rational(policy.outputUsdPerMillion);
  return ceiling(
    100n * (BigInt(input) * a * d + BigInt(output) * c * b),
    1000000n * b * d
  );
}
export function reportedUsdCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  // JSON numbers may use scientific notation. Expand without floating-point multiplication.
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [n, d] = rational(mantissa!);
  const power = Number(exponent);
  return power >= 0
    ? ceiling(n * 100n * 10n ** BigInt(power), d)
    : ceiling(n * 100n, d * 10n ** BigInt(-power));
}
export function validatePolicy(value: unknown, now: string): CostPolicy {
  const parsed = CostPolicySchema.safeParse(value);
  if (!parsed.success)
    throw new CostPolicyError("Missing, unsupported, or invalid cost policy");
  const p = parsed.data;
  const verified = Date.parse(p.verifiedAt),
    expires = Date.parse(p.validUntil),
    time = Date.parse(now);
  if (
    !Number.isFinite(time) ||
    verified > time ||
    time >= expires ||
    expires - verified !== 7 * 86400000
  )
    throw new CostPolicyError("Expired or invalid cost policy validity");
  if (tokenCostCents(p, p.inputTokens, p.outputTokens) <= 0)
    throw new CostPolicyError("Zero liability policy is unsupported");
  return p;
}
export function resolveCostPolicy(
  provider: string,
  model: string,
  now: string,
  policies = COST_POLICIES
): CostPolicy {
  return validatePolicy(
    policies.find((p) => p.provider === provider && p.model === model),
    now
  );
}

/** Compare provider decimal prices without binary floating-point conversion. */
export function decimalAtMost(value: unknown, limit: string): boolean {
  try {
    if (typeof value !== "string" && typeof value !== "number") return false;
    const [a, b] = rational(String(value)),
      [c, d] = rational(limit);
    return a * d <= c * b;
  } catch {
    return false;
  }
}
