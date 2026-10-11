---
title: 'Admit CourtListener entries whose only text is a RECAP short description'
type: 'bugfix'
created: '2026-10-11'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '450d45659948e353323c41d9e2dbaf75563ea345'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging `run-20261010-0004` (cutoff 2026-10-07) counted four dated CourtListener entries as `skippedIncomplete` with `newEntries` 0: docket `73242633` / `case-ny-cftc` #174 (2026-10-07), #175 (2026-10-08), #176 (2026-10-09), and docket `73375343` / `case-ri-furcolo` on 2026-10-07. Each has a blank top-level `description` and text only on `recap_documents[].short_description`. Furcolo's `entry_number` is null. PACER RSS never fills the long text unless someone buys the docket.

**Approach:** Select nested RECAP `description`, `short_description`, and `attachment_number` with v4 double-underscore fields, and omit `plain_text`. If the trimmed entry description is empty, use the first non-empty document description, then the first non-empty short description. Record `descriptionSource`. Short-description-only text is labeled in both prompts and in ops evidence.

**Decision (2026-10-11):** Keep the full spec (about 1,830 tokens). Implement now on the candidate `id,entry_number,date_filed,description,recap_documents__description,recap_documents__short_description,recap_documents__attachment_number`. Do not wait for the operator curl. Parse `recap_documents[].description`, `short_description`, and `attachment_number` defensively and tolerate those keys missing. Switching to a plain `recap_documents` request is a one-line change to `COURTLISTENER_FIELDS`. When the live body arrives, lock `fields` to the keys it actually returned, commit that body as the fixture, and make the fixture test green.

## Boundaries & Constraints

**Always:** Order is entry `description`, then document `description`, then `short_description`. Documents sort `attachment_number` null first, then ascending, stable for ties. `descriptionSource` is `entry` | `recap_description` | `recap_short_description`. Only `recap_short_description` adds `Source text is the CourtListener short description only; the full filing text is not available` to the drafter prompt, the reviewer prompt, and ops evidence. `docketEventId(caseId, entry.id)` stays. Null `entry_number` yields a docket URL with no `?entry=`. Undated entries, and entries with no text after the fallback, stay `skippedIncomplete` and are not inserted into `docket_events` or `drafts`. The fixture is the operator's real response; the parse test fails if `short_description` is missing.

**Never:** Do not change the dedupe id or publish a second row. Do not use the search API as the fixture. Do not request `plain_text` or add `page_size` to the poll. Do not deploy, start a Run, or log the token. Do not invent a live body. Until the paste arrives, the candidate `fields` string is the request, and a missing nested key is an empty document, not a crash.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Short description only | Dated; entry description blank; document short description set | Draft; source `recap_short_description`; sentence in both prompts and evidence | N/A |
| Recap description wins | Entry blank; attachment has `description`; main has only a short description | That description; source `recap_description`; no sentence | N/A |
| Main document wins | Two short descriptions; main attachment null | Main text; source `recap_short_description` | N/A |
| Blank everywhere | All text empty or whitespace | `skippedIncomplete`; id absent from `docket_events` and `drafts` | N/A |
| Undated | No ISO `date_filed`; short description present | `skippedIncomplete`; id absent from both stores | N/A |
| Retry after skip | First poll blank; second poll same id with a short description | Admitted; id still `de-<caseId>-<entryId>` | N/A |
| Null entry number | Dated; `entry_number` null; short description set | `entryUrl` and draft `sourceUrl` have no `?entry=` | N/A |
| Entry text present | Trimmed entry description non-empty | Source `entry`; document text ignored | N/A |
| Request URL | Any poll | `fields` is the candidate nested list, not `plain_text` | N/A |
| Missing nested keys | `recap_documents` absent, or a document missing the three keys | Entry text still works; missing document text does not throw | Skip only when no text remains |
| Live fixture | Recorded 73242633 body, after the paste | Parse yields a non-empty `short_description` | Fail if the key is absent |

</frozen-after-approval>

## Code Map

- `src/pipeline/connectors/courtListener.ts` — `COURTLISTENER_FIELDS` (~49), `entriesUrl` (~72), `parseEntries` (~128), `entryUrl` (~65, already bare when null), `seenEventIds` (~401, reads `docket_events` and `drafts` only), skip (~796, continues before insert; skipped ids are not stored today), `toEntityChange` (~721), `skippedIncomplete` (~847). Leave `docketEventId` (~60) and pacing.
- `src/pipeline/connectors/courtListener.test.ts` — URL assertion (~184); `skippedIncomplete: 2` (~836).
- `src/pipeline/agents/draftAndReview.ts` — `buildDocketPrompt` (~436); `draft.evaluated` payload (~862). `pickAuthorizedContext` passes `diff` through.
- `src/surfaces/ops/EvidenceDetail.tsx` — `DocketDraftBlock` (~586). `ApprovalQueue.tsx` (~340) already omits `entry N` when null and links `sourceUrl`.
- `src/pipeline/connectors/connector.ts` — leave `draft.created` as `{ source, entityType, entityId }`.
- `docs/deploy-runbook.md` (~340) and `spec-3-21-first-live-connector.md` (~122) — add the runbook note and a one-line pointer. Do not reopen 3.21's tasks.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/connectors/courtListener.ts` — locked nested fields, two-pass fallback, `descriptionSource`; skip-before-insert stays.
- [x] `src/pipeline/connectors/courtListener.test.ts` — matrix rows, including retry, null entry number, unchanged id, and `fields`.
- [ ] `src/pipeline/connectors/fixtures/` — operator's 73242633 body; fail if parsed `short_description` is missing.
- [x] `src/pipeline/agents/draftAndReview.ts` and `draftAndReview.test.ts` — sentence in both prompts and `draft.evaluated`; one test asserts all three.
- [x] `src/surfaces/ops/EvidenceDetail.tsx` — render the sentence on the docket record.
- [x] `docs/deploy-runbook.md` and `spec-3-21-first-live-connector.md` — `skippedIncomplete` is undated or still text-less after the fallback; cite run 0004.

**Acceptance Criteria:**
- Given source `recap_short_description`, when prompts are built and `draft.evaluated` is written, then the drafter prompt, the reviewer prompt, and that evidence payload all contain the thin-text sentence.

## Implementation Notes

- 2026-10-11: Implemented on the candidate `COURTLISTENER_FIELDS` value. Nested keys are read from the raw row, so a missing `recap_documents` array, a non-object document, or a missing `description` / `short_description` / `attachment_number` does not drop a valid entry. Switching the request to plain `recap_documents` is that one constant. Context7 Zod 4 docs: `z.object` strips unknown keys, so document fields are read before that strip matters.
- `seenEventIds` still only reads `docket_events` and `drafts`. The incomplete check returns before any insert. The second-poll test locks that. No extra write was found.
- `npm run check` exit 0. `npm test` 66 files, 1637 passed, 6 skipped, exit 0. The skips were already in the suite.
- Live fixture is not committed. The matrix row stays open until the operator pastes the curl JSON.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0

**Manual checks (if no CLI):**
- Operator curl. Paste the JSON before the fixture is committed:

```bash
curl -sS \
  -H "Authorization: Token $COURTLISTENER_TOKEN" \
  "https://www.courtlistener.com/api/rest/v4/docket-entries/?docket=73242633&order_by=-entry_number&page_size=3&fields=id,entry_number,date_filed,description,recap_documents__description,recap_documents__short_description,recap_documents__attachment_number"
```
