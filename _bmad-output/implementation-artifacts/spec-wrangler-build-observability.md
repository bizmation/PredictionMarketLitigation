---
title: 'Enable full Workers Observability on the build environment'
type: 'chore'
created: '2026-10-10'
status: 'in-progress'
baseline_revision: '54ef6f3a8f3b621604ff072eed53194a57a329c3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Staging (`env.build`, Worker `pml-build`) inherits top-level `observability: { enabled: true }`, which turns on Workers Logs and leaves traces and invocation logs unspecified. Operator diagnosis of the staging pipeline needs traces and invocation logs sampled at 100%, without changing production.

**Approach:** Add an `observability` object on `env.build` only, using the keys already defined by installed Wrangler 4.120. Pin that shape, and the unchanged top-level object, in the existing Wrangler config test.

## Boundaries & Constraints

**Always:** Put the block only under `env.build`. Keep top-level `observability` exactly `{ "enabled": true }`. Keep `env.build.vars` exactly `{ "FIRST_FETCH_WINDOW_DAYS": "3" }`. Use schema keys from `node_modules/wrangler/config-schema.json` `definitions.Observability` (Wrangler 4.120.0). Repeat `enabled: true` inside the build block, because an environment `observability` object replaces the inherited one. Update the env comment that still says observability inherits from the top level. JSON numbers for sampling rates (`1`, not `"1"`).

**Never:** Do not edit any other environment, route, binding, secret, or the top-level observability object. Do not add `observability.issues` (absent from the 4.120 schema; current Cloudflare docs require Wrangler >= 4.134). Do not deploy. Do not run `bmad-code-review`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Production observability | Parsed top-level `config.observability` | Exactly `{ enabled: true }` | Test fails on any extra or missing key |
| Build traces and invocation logs | Parsed `config.env.build.observability` | `traces.enabled === true` and `logs.invocation_logs === true`, with `enabled: true`, `head_sampling_rate: 1`, `logs.enabled: true`, and `traces.head_sampling_rate: 1` | Test fails if any of those are missing |
| Staging vars survive | Parsed `config.env.build.vars` | `{ FIRST_FETCH_WINDOW_DAYS: "3" }` | Existing vars test fails if the var is dropped or moved |
| Schema key check | Requested keys vs `definitions.Observability` | `enabled`, `head_sampling_rate`, `logs.enabled`, `logs.invocation_logs`, `traces.enabled`, `traces.head_sampling_rate` all exist | No rename; do not invent keys |

</intent-contract>

## Code Map

- `wrangler.jsonc:31` — top-level `"observability": { "enabled": true }`. Read-only. Production deploys without `-e build`, so this remains production behaviour.
- `wrangler.jsonc:196-199` — comment lists `observability` as inherited. Remove it from the inherits list and name it as an env-level override. Do not rewrite the rest of the comment.
- `wrangler.jsonc:203-277` — `env.build` for Worker `pml-build`. Insert the observability object here. `vars` at lines 217-219 stay `{ "FIRST_FETCH_WINDOW_DAYS": "3" }`. No other `env.*` block exists.
- `src/shared/lib/wranglerConfig.test.tsx:45-61` — parses `wrangler.jsonc` with `ts.parseConfigFileTextToJson` and already pins `env.build.vars`. Reuse that parser. File is `.test.tsx` so it runs in the node `ui` Vitest project (workers pool has no `fs`).
- `src/shared/lib/wranglerConfig.test.tsx:191-230` — `staging domain ownership` is the nearest `env.build` assertion. Add the observability assertions beside it; do not weaken the route, D1, or binding expects.
- `node_modules/wrangler/config-schema.json` `definitions.Observability` (about lines 3889-3966) — property set matched the requested snippet exactly on 2026-10-10. `additionalProperties: false`. No `issues` property. Environment configs `$ref` this definition (about line 2101).
- `package.json` — `"wrangler": "^4.120.0"`; installed `node_modules/wrangler/package.json` version is `4.120.0`. `npm run check` is `oxfmt --check . && oxlint src/ && tsc`. `npm test` is `vitest run`. `deploy:build` uses `wrangler deploy --config wrangler.jsonc -e build` and must not be run.

Context7 has no Wrangler CLI entry (resolve returned wrangler-action only). Cloudflare docs (`/workers/wrangler/configuration/#observability`, `/workers/observability/logs/workers-logs/`, `/workers/observability/traces/`) use the same key names as the installed schema. Schema wins over the docs' newer `issues` field.

## Tasks & Acceptance

**Execution:**
- `wrangler.jsonc` — Add this object on `env.build` only, and correct the inherits comment so it no longer claims observability is inherited:

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1,
  "logs": { "enabled": true, "invocation_logs": true },
  "traces": { "enabled": true, "head_sampling_rate": 1 }
}
```

- `src/shared/lib/wranglerConfig.test.tsx` — Extend the config parse tests so top-level `config.observability` is exactly `{ enabled: true }`, `env.build.observability.traces.enabled === true`, and `env.build.observability.logs.invocation_logs === true`. Also expect the full build observability object above so the sampling rates cannot drift.

**Acceptance Criteria:**
- Given `wrangler.jsonc` is parsed with `ts.parseConfigFileTextToJson`, when the observability test runs, then `config.observability` deep-equals `{ enabled: true }`.
- Given the same parse, when the build environment is read, then `env.build.observability.traces.enabled` is `true` and `env.build.observability.logs.invocation_logs` is `true`.
- Given the same parse, when `env.build.vars` is read, then it is still `{ FIRST_FETCH_WINDOW_DAYS: "3" }`.
- Given `npm run check` and `npm test`, when both run, then each exits 0.
- Given an offline Wrangler dry run is available, when `npx wrangler deploy --dry-run --config wrangler.jsonc --env build` runs, then config parsing succeeds and no deploy is performed. Skip the command if it requires network or account credentials, and record that skip.

## Spec Change Log

## Review Triage Log

## Design Notes

Wrangler environment overrides replace `observability`; they do not deep-merge it. The build object therefore includes `enabled: true` plus the new logs and traces settings. Top-level `{ enabled: true }` keeps enabling Workers Logs for production and does not enable traces (Cloudflare still treats automatic tracing as off until `traces.enabled`). `head_sampling_rate: 1` means 100% of requests. That is the approved staging setting.

## Verification

**Commands:**
- `npm test -- src/shared/lib/wranglerConfig.test.tsx` -- expected: the new observability assertions pass
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
- `npx wrangler deploy --dry-run --config wrangler.jsonc --env build` -- expected: config accepted, or a recorded skip if the command cannot run offline. Never drop `--dry-run`.
