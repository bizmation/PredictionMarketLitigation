# DeepInfra acceptance runbook

DeepInfra capability is implemented. The parent has provisioned the staging
Secrets Store secret `PML_DEEPINFRA_AI` in store
`74197b544ea642c086a7d02133350a91`, the custom provider route, and the shared
USD 1 campaign cap. Deployment and genuine live inference remain pending. Local
HTTP fixtures are not live-provider acceptance. This implementation does not
change remote configuration, production, or Draft approval/publication.

## Route and credentials

The provisioned Cloudflare AI Gateway custom provider uses slug `deepinfra` and
base URL `https://api.deepinfra.com`. Inference uses only:

`https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/custom-deepinfra/v1/openai/chat/completions`

Use a centralized Cloudflare Secrets Store secret with `workers` scope,
bound to the Worker as **`DEEPINFRA_API_KEY`**. The parent/operator owns the Store
ID, secret name, and binding configuration in the intended staging `pml-build` environment. Production remains `pml`; no cutover is authorized. The registry recognizes the binding without reading the secret;
the adapter calls its asynchronous `.get()` separately for each request. It does
not cache credentials across request contexts or fall back if Store access fails.
Both credentials resolve in bounded, request-scoped free preparation before reservation.
Authorization headers are constructed and validated during free preparation.
A failed, blank, invalid-header, or timed-out lookup creates no paid liability and cannot dispatch
when a delayed lookup eventually resolves. Policy validity is checked again after
preparation and immediately before inference.

Plain string `DEEPINFRA_API_KEY` remains supported for local development and
existing per-Worker secret setups. Provision `CLOUDFLARE_ACCOUNT_ID` and
`AI_GATEWAY_ID` for the intended environment. Missing or blank required values
leave DeepInfra unregistered. If gateway-level authentication is enabled,
provision the separate `AI_GATEWAY_TOKEN` as an asynchronous Secrets Store binding
(the same local string fixture support applies): it supplies `cf-aig-authorization`;
`Authorization` remains the DeepInfra bearer credential. The existing default
gateway has gateway-level authentication disabled. Never put credentials into
source, D1, prompts, logs, evidence, or commands that print their values.

Select provider `deepinfra` and exact model `deepseek-ai/DeepSeek-V4-Flash` in the
existing role configuration. Workers AI and OpenRouter remain selectable with their
original policies and expiry dates. The 2026-10-04 GLM-5.3-Flash selection is
superseded. Unsupported or expired policies fail closed; this change does not
renew them.

## Reviewed bound and request restrictions

The reviewed V4-Flash policy is valid from **2026-10-11T00:10:57.000Z** until
(exclusive) **2026-10-18T00:10:57.000Z**, exactly seven days. Catalog
`cents_per_*` prices are cents per token. Cache-write values are multipliers on
the input cents, so the 1h × 2.0 multiplier on `9e-06` cents/token is `$0.18`
per million input tokens. Output is `1.8e-05` cents/token, `$0.18` per million.
The output maximum is 2,048. Context `max_tokens` is 1,048,576. The per-call
reservation is:

`ceil(100 * (1048576 * 0.18 + 2048 * 0.18) / 1000000) = 19 cents`

The earlier GLM-5.3-Flash policy (16 cents, through 2026-10-11T19:10:00.000Z)
stays in the allowlist and is not the configured model.

The public catalog is fetched without authentication before reservation, with a
full-body deadline. The exact active public text-generation model, context,
capabilities, regular token prices, cache multiplier, and other pricing dimensions
must remain compatible with the review. Unknown pricing structures fail closed.
Scientific numeric notation in JSON is accepted with exact decimal comparison.
The temporary 50% discount is never used to reduce liability.

Requests contain text only, `max_tokens: 2048`, `reasoning_effort: "none"`,
`reasoning: { enabled: false }`, `stream: false`, and `n: 1`. Service tier is
omitted (standard service). There are no tools, media inputs, cache writes, or
priority/flex options. Preflight requires the `can-disable-reasoning` tag on
DeepSeek-V4-Flash. Cache-read and cache-write figures are multipliers on the
input cents-per-token price; a multiplier that pushes that price above the
reviewed input rate fails closed. A DeepInfra reply keeps only the text after
the last `</think>`. An unclosed `<think>` drops the rest of the reply. The
parser then takes the last JSON object. Tags match case-insensitively and may
carry attributes. The only
automatic retry is a chat 429 whose error code is `engine_overloaded` (see
Evidence and failures).
Gateway caching is skipped and maximum attempts is one. Credentialed redirects
are rejected. Reasoning text is never substituted for message content.

## USD 1 campaign controls before activation

The operator responsible for remote configuration must keep paid execution
inactive until all of these controls are persisted and verified in real D1:

1. Set `gateway_config.default_budget_cents` to **100**, and explicitly set the
   budget of every participating Run to **100** or less. A per-Run cap alone
   does not cap the campaign across Runs.
2. Insert a dedicated `llm_periods` row with `cap_cents = 100`. Set `starts_at`
   before the first campaign call and `ends_at` after every possible acceptance
   call. Use a fixed campaign period covering the whole reviewed policy window;
   do not reset it between Runs. Keep acceptance inactive outside that period.
3. Inspect the corresponding `llm_period_accounting.total_cents` and participating
   `llm_run_accounting` rows. Existing spend, reservations, and uncertain
   liabilities consume capacity. Do not delete ledger rows or bypass admission
   to regain budget. Confirm no unresolved accounting issues exist.
4. Verify the configured exact provider/model, route, secure credentials, policy
   validity, existing admission gate, and the real period before permitting a
   bounded acceptance attempt. Stop when the remaining capacity is below 19 cents.

The implementation deliberately does not insert this remote period or activate
execution. Its gateway uses the existing atomic reservation/dispatch accounting:
all applicable shared periods constrain concurrent Runs, and a stable business
operation key prevents duplicate paid dispatch on replay. Campaign state and
remote activation remain the operator's responsibility.

## Evidence and failures

Successful usage settles in the real D1 ledger and public Run evidence with
provider `deepinfra`, the exact model, `costBasis: token_estimate`, and reviewed
policy evidence. `estimated_cost` is not an actual charge and is never mapped to
`reportedCostUsd` or `reportedCostSource`. Even a provider `usage.cost` field is
ignored by this adapter; reconciliation with authoritative billing evidence is
required to claim an actual charge.

A returned model identity, when supplied, must match the requested model; a
mismatch gives no usable completion and retains liability. A bounded safe provider
request ID is retained in the existing private receipt for reconciliation.

Missing/invalid usage, non-text content, or token counts over the bound retain at
least the conservative liability and block further inference pending
reconciliation. Failed, aborted, and unknown outcomes keep their reservation;
replaying the operation cannot retry inference. One exception, which Patrick
approved on 2026-10-10: a chat response whose headers were received, whose status
is 429, and whose error code is `engine_overloaded`. The chat closure may retry
that refusal under the same reservation, inside the 120-second chat deadline.
At most three fetches. Backoff is 5 seconds, then 15 seconds. The attempt cap
is the count, and the minimum-80-second rule is a second guard. If that
refusal persists, the reservation is released with no issue and evidence reason
`provider_definite_refusal`
(status, error code, and the AI Gateway log id when present). Drafter plus
reviewer chats still fit in the 250-second steering client timeout. Catalog
preflight plus prepare, and sizing the 20-minute draft-and-review step by draft
count, stay deferred. Every other HTTP failure keeps its reservation. Public
evidence excludes prompts,
completion/reasoning text, credentials, and raw provider error bodies. Never
approve or publish Draft content as part of acceptance.

## Review sources

- [DeepInfra public model catalog](https://api.deepinfra.com/models/list)
- [DeepSeek-V4-Flash model page](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash)
- [GLM-5.3-Flash model prices](https://deepinfra.com/zai-org/GLM-5.3-Flash)
- [DeepInfra chat parameters and standard service](https://docs.deepinfra.com/chat/overview)
- [Disabling reasoning](https://docs.deepinfra.com/chat/reasoning)
- [Cloudflare custom provider routing](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)
