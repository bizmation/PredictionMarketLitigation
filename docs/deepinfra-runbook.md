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

Select provider `deepinfra` and exact model `zai-org/GLM-5.3-Flash` in the existing
role configuration. Workers AI and OpenRouter remain selectable with their
original policies and expiry dates. Unsupported or expired policies fail closed;
this change does not renew them.

## Reviewed bound and request restrictions

The reviewed policy is valid from **2026-10-04T19:10:00.000Z** until (exclusive)
**2026-10-11T19:10:00.000Z**, exactly seven days. The implementation clock was
checked after verification on October 4. Renewal requires another review.

The full context is 1,048,576 input tokens, at undiscounted USD 0.15 per million
input tokens and USD 0.50 per million output tokens. The output maximum is 2,048.
The conservative per-call reservation is:

`ceil(100 * (1048576 * 0.15 + 2048 * 0.50) / 1000000) = 16 cents`

The public catalog is fetched without authentication before reservation, with a
full-body deadline. The exact active public text-generation model, context,
capabilities, regular token prices, cache multiplier, and other pricing dimensions
must remain compatible with the review. Unknown pricing structures fail closed.
Scientific numeric notation in JSON is accepted with exact decimal comparison.
The temporary 50% discount is never used to reduce liability.

Requests contain text only, `max_tokens: 2048`, `reasoning_effort: "none"`,
`stream: false`, and `n: 1`. Service tier is omitted (standard service). There are
no tools, media inputs, cache writes, priority/flex options, or automatic retries.
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
   bounded acceptance attempt. Stop when the remaining capacity is below 16 cents.

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
replaying the operation cannot retry inference. Public evidence excludes prompts,
completion/reasoning text, credentials, and raw provider error bodies. Never
approve or publish Draft content as part of acceptance.

## Review sources

- [DeepInfra public model catalog](https://api.deepinfra.com/models/list)
- [GLM-5.3-Flash model prices](https://deepinfra.com/zai-org/GLM-5.3-Flash)
- [DeepInfra chat parameters and standard service](https://docs.deepinfra.com/chat/overview)
- [Disabling reasoning](https://docs.deepinfra.com/chat/reasoning)
- [Cloudflare custom provider routing](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)
