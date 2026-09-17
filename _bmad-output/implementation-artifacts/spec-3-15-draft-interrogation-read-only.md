---
title: 'Story 3.15: Draft Interrogation (Read-Only)'
type: 'feature'
created: '2026-09-17'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 2ebbba2cc14ca776686a46b57be106645b3df6f4
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** The 3.14 channel persists the operator's question and may spend a steward call, but the prompt has no Run Evidence, `complete()` text is discarded, and neither the queue nor ops. shows a grounded answer about a pending Draft's basis.

**Approach:** When the operator interrogates a pending Draft, ground the steward in that Run's Evidence plus that Draft's recorded fields, project the reply on ops. attached to the Draft, and assert the turn writes nothing to Drafts, config, standing guidance, or live F1.

## Boundaries & Constraints

**Always:**
- Reuse `POST /api/admin/runs/:runId/steering` (requireOperator). Queue keeps sending `draftId`. Persist the operator turn first (3.14); never roll it back if `complete()` fails or steward is unconfigured.
- Ground `complete({ role: "steward" })` in (a) the selected Draft's stored `diff`, `body`, `tier2Only`, `confidence`, `evalSummary` and (b) that Run's Evidence rows (`source.fetched` / `source.skipped`, `draft.created`, `draft.evaluated`, `guardrails.*`). Prompt law: answer only from this packet; if a asked fact is absent, say `not recorded` — do not reconstruct.
- After a successful steward `complete()`, append-only Evidence: a second `steering.applied` row, id `evidenceId(runId, "steering.applied", turn.id, "reply")`, payload `{ effect: "none", turnId, draftId, reply }` with `reply` redacted the same way as turn `content` when `private`. No new event name (0013 CHECK stays).
- Admin POST JSON includes `reply` (`null` if private, unconfigured, or complete failed). Public `GET /api/runs/:id` `evidence[]` is the system of record — do not add a raw `steering_turns` array.
- `ALLOWED_TOOLS.steward` stays `[]`. Injection in question, Draft body, or reply still deny-only.
- Queue: composer stays on the selected Draft. Submit must not change `selected`. J/K/A/E/R stay as 3.10 (`ApprovalQueue.tsx` already ignores `input`/`textarea`). No new steering hotkey this story — UX-DR20 parity is preservation; the panel is already inline (3.14).
- Spend still hits that Run when a steward mapping exists (`running` | `awaiting`).

**Never:**
- 3.16 Draft revision writes, 3.17 `pipeline_config_versions`, 3.18 `standing_guidance`, live-F1 publish, seeding `gateway_config`, as-you-type public streaming, retroactive privatize, `surfaces/*` → `pipeline/*`.
- Updating `steering_turns.private` or rewriting the original `steering.turn` / first `steering.applied` rows.
- Putting live F1 rows or unsourced “likely reasoning” into the steward prompt.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grounded public ask | Awaiting Run, pending Draft, steward mapped, Evidence has skipped source + draft eval, `private: false` | Turn + `steering.turn` as 3.14; POST `reply` is steward text; GET `/api/runs/:id` has `steering.applied` `…:reply` with same `draftId` and `reply`; prompt passed to `complete()` contains those Evidence/Draft fields and the `not recorded` rule | N/A |
| Gap in Evidence | Draft has `evalSummary: null`; operator asks how the band was derived | Prompt omits fabricated eval numbers and includes `not recorded`; projected `reply` is whatever the fake provider returns from that prompt (test pins the prompt, not model creativity) | N/A |
| Zero writes | Same as happy path | Draft row (`body`,`diff`,`outcome`,`updatedAt`), `GET /api/mode`, F1 entity tables, `ALLOWED_TOOLS.steward` unchanged | Fail closed if any write slips |
| Private | `private: true`, complete() returns text | Public Evidence: no `content`, no `reply` text; `actor`, time, `draftId`, `private: true`, `effect: "none"` remain | N/A |
| Unconfigured steward | No `gateway_config` steward mapping | Operator turn + 3.14 Evidence persist; no `:reply` row; POST `reply: null`; no steward `llm_calls` | No 500 |
| Injection | Draft/turn/reply asks `publish_f1` | F1 unchanged; allowlist `[]`; deny path may emit `guardrails.failed` | Fail closed |
| Queue context | Selected index 2; submit interrogation | `selected` stays 2; after blur, J/K still move the list | N/A |

</intent-contract>

## Code Map

- `src/pipeline/agents/StewardAgent.ts:7-22` -- REPLACE `buildStewardPrompt` (keep no-draftId 3.14 fallback). NEW `buildInterrogationPrompt({ content, draft, evidence })` — Draft fields + Run Evidence packet + `not recorded` rule. No F1, no tools.
- `src/pipeline/steering/submitTurn.ts:69-165` -- After persist + deny, `evidenceRepo.listByRun` (READ); if `draftId`, load Draft (already) and call interrogation prompt. After `complete()`, `appendStmt` reply Evidence; return `turn` with `reply`. Snapshot Draft/mode before vs after for tests. READ ONLY: `actionPolicy.ts:37-43` allowlist, `gateway.ts` steward complete, `projector/evidence.ts` append.
- `src/shared/db/repos/evidenceRepo.ts:35` -- READ `listByRun` for the packet.
- `src/shared/schemas/steering.ts:39-67` -- ADD `reply: string | null` on `PublicSteeringTurn` (private → null). Record schema unchanged (operator `content` only).
- `src/shared/schemas/vocabulary.ts:265-283` -- READ ONLY event enum (no new name).
- `src/surfaces/admin/SteeringPanel.tsx` -- After 200, show last `reply` (or “content withheld” if private) under the composer; do not touch queue selection. 403 EmptyState unchanged.
- `src/surfaces/admin/ApprovalQueue.tsx:338-376,514` -- READ ONLY keyboard + mount. Do not remount in a way that resets `selected`.
- `src/surfaces/ops/EvidenceDetail.tsx:172-193` -- ADD `reply` to `stepLabel` extras (private still withheld).
- `src/server.ts:422-470` -- READ: already JSON-serializes `result.turn`; reply rides the schema.
- `src/shared/schemas/run.ts:161-179` -- READ Draft fields for the packet.
- Tests: `submitTurn.test.ts`, `adminApi.test.ts`, `publicApi.test.ts`, `SteeringPanel*.tsx`, `approvalQueue.mount.test.tsx`, `evidenceDetail.test.ts`, `actionPolicy.test.ts` (allowlist still empty).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:86` -- backlog → in-progress then done.

## Tasks & Acceptance

**Execution:**
- `src/pipeline/agents/StewardAgent.ts` -- Grounded interrogation prompt (+ 3.14 ungrounded fallback when no draft)
- `src/pipeline/steering/submitTurn.ts` -- Packet load, `complete()`, append `:reply` Evidence, return `reply`; zero-write assertions in tests
- `src/shared/schemas/steering.ts` -- Public `reply`
- `src/surfaces/admin/SteeringPanel.tsx` -- Render last reply without changing queue selection
- `src/surfaces/ops/EvidenceDetail.tsx` -- Project `reply` on the step line
- tests + `sprint-status.yaml` -- I/O matrix, prompt pins, private redaction, keyboard/selected parity

**Acceptance Criteria:**
- Given a pending Draft on an awaiting Run, when I ask why a field changed and which sources were skipped, then ops. Evidence for that Run shows a steward `reply` on that `draftId` (and the admin POST returns the same text)
- Given the Run does not record an eval band, when I ask how confidence was derived, then the visible reply is the unmodified steward `complete()` text (our code does not invent a band), and that prompt includes `not recorded` with no fabricated eval numbers
- Given any interrogation submit, when I re-read the Draft, mode, and live F1 tables, then they are byte-equal to before the turn
- Given I mark the turn private, when a reader loads `/api/runs/:id`, then they see that an interrogation happened on that Draft (time, actor, `effect`) but not the question or the answer
- Given I am on a queue item, when I interrogate from the inline composer, then that item stays selected and J/K/A/E/R still work once the textarea is not focused

## Spec Change Log

## Review Triage Log

### 2026-09-17 — Review pass
- verdicts: 22 findings — high 0, medium 10, low 10, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` Private interrogation answers discarded for the operator as well as the public — 3.14 already nulls POST `content` when private; matching that for `reply` is the exceptional path, not the everyday queue ask
  - `[medium]` `[patch]` Run Evidence packet mixed sibling Drafts’ `draft.evaluated` / `guardrails.*` — keep run-level `source.*`, drop events whose payload `draftId` is another Draft
  - `[medium]` `[patch]` Grounding tests never pinned Draft `diff` (also named `confidence` / `source.fetched`) — added `"from":"untracked"` prompt pin; extra pins rejected as low/not everyday
  - `[low]` `[reject]` No admin HTTP case with a mapped steward asserting non-null `reply` — server JSON-serializes `submitTurn`; the happy path is covered at that function
  - `[low]` `[reject]` Queue test named J/K/A/E/R but only fired J/K/E — A/R handlers are unchanged 3.10; wiring A would need extra fetch mocks
  - `[low]` `[patch]` Prompt law “If a asked fact is absent” — changed to “If an asked fact is absent”
  - `[low]` `[reject]` Zero-write checks not whole-row byte-equal / no 3.17–3.18 tables — those stores do not exist; the compared Draft/mode/F1 fields are the ones interrogation could write
  - `[medium]` `[patch]` `reply` assigned before `:reply` append, so a failed append could return POST `reply` with no public row — assign `reply` only after append succeeds
  - `[low]` `[reject]` Composer last reply unlabeled / silent when steward unconfigured — 3.14 already clears the textarea; adding chrome is more than a direct correction
  - `[low]` `[reject]` `sprint-status.yaml` `done` while spec was `in-review` — bookkeeping; finalize sets spec `done`
  - `[low]` `[reject]` Injection deny-scan skips `draft.diff` — everyday diffs are field maps; body/question/reply already scanned
  - `[false]` `[reject]` Happy-path spend unasserted — 3.14 `submitTurn` already pins steward `llm_calls` and `spendCents` on awaiting Runs
  - `[medium]` `[patch]` In-flight submit can stamp `lastReply` after the operator moved Drafts — ignore the response unless `runId`/`draftId` still match the request
  - `[medium]` `[patch]` Composer `content` survived Draft changes, so text typed for A could submit on B — reset `content` and `private` with `lastReply` on selection change
  - `[medium]` `[patch]` `complete()` then `:reply` append throw (same defect as reply-before-append) — grouped; reply set after append
  - `[false]` `[reject]` EvidenceDetail would print reply text when `private: true` — `submitTurn` stores `reply: null` whenever `private` is true
  - `[low]` `[reject]` Whitespace-only `complete()` text nulls POST `reply` but could land on Evidence — not an everyday model output
  - `[low]` `[reject]` Credential-shaped reply scrubbed from Evidence but still on POST — same 3.14 Evidence-scrub trade
  - `[medium]` `[patch]` Interrogation accepted a decided Draft on the same Run — reject with `invalid` when `outcome != null`
  - `[medium]` `[patch]` POST `reply` and public Evidence reply could diverge — grouped with append-after-complete; public row is written before POST returns the text
  - `[medium]` `[patch]` Queue test never asserted the previous Draft’s reply is gone after `j` — after selecting `d-a`, assert the `d-c` reply text is absent
  - `[medium]` `[patch]` Interrogation prompt not pinned to include Draft `diff` — grouped with the grounded-ask pin; assert `"from":"untracked"`

## Design Notes

- Reply is a **second** `steering.applied` so we stay append-only and keep the 0013 event CHECK. First applied stays `{effect:"none"}` (3.14 receipt). 3.16 may later change effect; this story must not.
- Diffs and eval live on the **Draft row**, not `draft.created` payloads — the packet must load both.
- 3.10's proposed "steering binding" is not a 3.15 AC; FR-46 is grounded answers. Do not invent a hotkey.
- Unconfigured steward: same honesty as 3.14 — persist the question, no fake answer.

## Verification

**Commands:**
- `npm test` -- expected: pass, including interrogation I/O matrix and unchanged empty steward allowlist
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `/admin#queue` ask a public question on a pending Draft → ops. `/runs/:id` shows `reply` on that `draftId`; private checkbox withholds question and answer; J/K still move the queue after leaving the composer

## Auto Run Result

Status: done

Summary: Pending-Draft interrogation reuses the 3.14 steering POST. With a `draftId`, the steward prompt is grounded in that Draft’s stored fields plus Run Evidence (`source.*` plus this Draft’s eval/guardrail rows). After a successful `complete()`, an append-only second `steering.applied` (`…:reply`) projects the answer on ops. attached to the Draft. Admin POST returns `reply` (null if private, unconfigured, or complete/append failed). The queue composer shows the last reply without moving selection. Zero writes to Drafts, mode, live F1, or the empty steward allowlist.

Files changed:
- `src/pipeline/agents/StewardAgent.ts` — `buildInterrogationPrompt` with Draft packet, run-level sources, sibling-draft filter, `not recorded` rule
- `src/pipeline/steering/submitTurn.ts` — load packet, reject decided Drafts, append `:reply` then return `reply`
- `src/shared/schemas/steering.ts` — public `reply` (null when private)
- `src/surfaces/admin/SteeringPanel.tsx` — last reply, selection reset, ignore stale in-flight
- `src/surfaces/ops/EvidenceDetail.tsx` — `reply` on the Evidence step line
- tests + `sprint-status.yaml` + this spec

Review: 4 layers, 22 findings — 0 high, 10 medium. Patches: sibling Evidence filter; `diff` prompt pin; grammar; reply only after `:reply` append; composer content reset + stale-response ignore; decided-Draft reject; queue test that the previous reply is gone. Rejected lows/false as recorded above. No deferrals.

Follow-up review recommended: true — five medium patch entries on the first pass. Unverified risk: the queue composer → ops. Evidence round-trip and in-flight Draft-switch race were jsdom/HTTP-unit tested, not walked in a live browser on `/admin#queue`.

Patch counts by verdict: high 0, medium 5 entries (sibling packet, prompt `diff` pin, reply-after-append, composer selection/stale, decided Draft).

Verification: `npm test` — 751 passed (42 files). `npm run check` — oxfmt/oxlint/tsc exit 0. No live-browser pass of `/admin#queue`.

Residual risks: production steward spend still skipped until a `gateway_config` steward mapping exists; Workers AI still records `costCents: 0`; remote D1 already at 0013 (no new migration).
