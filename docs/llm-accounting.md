# Atomic paid-call accounting

The gateway reserves the reviewed conservative bound against the Run and **every** configured UTC period that includes admission time. The 500-cent default seed, existing Run ceilings, reviewed pricing timestamps and provider bounds are unchanged. No active period is seeded. Reservations are not actual charges. Public budget accounting is ledger amounts + held liabilities + explicit legacy adjustments; missing provider reports remain unknown. Legacy adjustments preserve pre-migration Run totals above the old ledger without inventing a provider charge.

A logical call is Run + persisted Draft + drafter/reviewer purpose, or Run + persisted steering turn + purpose. Its fingerprint covers the caller's role, Run and prompt. A changed request under that key conflicts. A completed call replays its private durable result even after pricing expiry; pricing expiry still blocks new dispatch. A reservation or dispatch response lost in transit does not grant another dispatch owner. There is no timeout takeover. Unknown outcomes keep their bound and require operator evidence; cancellation or elapsed time never proves no charge. Settlement atomically commits the ledger, private result, state and cached Run total. Over-bound observations retain their full amount and block the Run and attributed periods until explicit reconciliation; exhausted numeric caps still apply afterward.

Production steering requires `requestId`. The browser keeps only that opaque ID in session storage across ambiguous failures and reloads, never message text. Re-enter the same content and settings to retry. Completed submissions return their stored public-safe authorized result. Pending/uncertain submissions refuse execution. Changed payloads conflict. The composer offers **Start a new intentional submission** after a refusal; this clears the pending key and composer and explicitly creates a distinct operation. It is not a retry of the original turn.

## Operator reconciliation

`POST /api/admin/llm-calls/:id/reconcile` requires the existing Cloudflare Access operator session. The actor is taken from verified Access configuration, never the JSON body. Use the operation ID and current version exposed in Run Evidence. Reconciliation is outside steering/chat mutation and does not authorize evaluation, Draft approval, or publication.

Example request for a confirmed charge:

```json
{
  "requestId": "reconcile-incident-20261002-1",
  "expectedVersion": 3,
  "decision": "confirmed_charge",
  "originalUsd": "0.01234",
  "evidenceReference": "invoice:provider-20261002-line-17",
  "note": "Operator checked the invoice against the recorded provider request ID."
}
```

The original decimal USD string is retained and rounded up exactly to integer cents. A response includes `id`, terminal `state: "reconciled"`, incremented `version`, `costCents: 2`, decision and original period IDs. For no charge, use `decision: "confirmed_no_charge"` and omit `originalUsd`. A reserved operation proven never dispatched can also be explicitly released this way. An identical request ID/body/operator repeat returns the stored response. Changed or stale requests return HTTP 409. Invalid bodies return 400; unauthenticated requests return 403. A reconciled operation with no stored completion returns typed `result_unavailable` on gateway replay, without another paid call. A late provider response cannot overwrite a newer reconciliation.

Evidence is a human attestation, not automated provider verification. Receipts retain actor, time, before/after state/accounting and original period attribution. Their evidence references and notes are public: use safe ticket/invoice identifiers, not credentials, private prompts, private completions or secret-bearing URLs. Original dispatch metadata and settlement evidence remain stored server-side.

## Period provisioning

Provision periods deliberately through a reviewed database migration. Rows are append-only and cannot be updated/deleted. Use canonical `YYYY-MM-DDTHH:mm:ss.sssZ` UTC bounds and a nonnegative integer-cent cap, with an audit/provenance reference. The start is inclusive and end exclusive; overlapping rows all apply. Example SQL for a **hypothetical**, unprovisioned interval:

```sql
INSERT INTO llm_periods (id, starts_at, ends_at, cap_cents, provenance)
VALUES ('reviewed-example', '2026-11-01T00:00:00.000Z',
        '2026-11-02T00:00:00.000Z', 500, 'approval:example-only');
```

Do not execute this example as a policy decision. No daily or monthly allowance is inferred. Historical ledger entries in a newly configured interval count, as do existing operations admitted in that interval. Attribution remains with admission windows even if settlement arrives after they close. Provisioning a window cannot discard spend or raise a Run's limit.

## Platform verification

Implementation checked the documented [D1 transactional batch rollback](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [OpenRouter generation metadata lookup](https://openrouter.ai/docs/api/api-reference/generations/get-request-%26-usage-metadata-for-a-generation). A known generation ID can support an operator's investigation; the lookup does not prove idempotent POST replay or no charge after a lost response. Free endpoint metadata validation is separated from paid dispatch. All verification uses local D1 and deterministic providers; no deployment, live provisioning, reconciliation, or paid provider experiment is performed.

## Recovery evidence

When settlement fails but D1 accepts the recovery write, the operation retains the available private response, provider request ID, accounting issue, and at least the larger of its original bound and observed amount. A late response from an adapter that ignores cancellation uses the same guarded path. Neither path overwrites a settled or reconciled operation or authorizes a paid retry. An unavailable database cannot guarantee that this evidence write succeeds, and late-response capture requires the worker to remain alive; the previously committed liability remains authoritative meanwhile.

A local policy-expiry refusal proved to occur before the adapter's paid invocation releases that reservation into terminal `released` history. HTTP failures, timeouts and cancellation never qualify. Reconciliation receipts include the original public-safe ledger provenance and transactional before/after totals for both frozen attribution and applicable periods provisioned after admission. The Evidence view exposes operation version, bound, retained liability and provider request ID for the operator request.
