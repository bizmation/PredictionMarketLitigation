---
title: 'Admit CourtListener entries whose only text is a RECAP short description'
type: 'bugfix'
created: '2026-10-11'
status: 'draft'
route: 'dispatch'
baseline_commit: '450d45659948e353323c41d9e2dbaf75563ea345'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging `run-20261010-0004` (cutoff 2026-10-07) counted four dated CourtListener entries as `skippedIncomplete` with `newEntries` 0: docket `73242633` / `case-ny-cftc` #174 (2026-10-07), #175 (2026-10-08), #176 (2026-10-09), and docket `73375343` / `case-ri-furcolo` on 2026-10-07. Each has a blank top-level `description` and text only on `recap_documents[].short_description`. Furcolo's `entry_number` is null. PACER RSS never fills the long text unless someone buys the docket.

**Approach:** Select nested RECAP `description`, `short_description`, and `attachment_number` with v4 double-underscore fields, and omit `plain_text`. If the trimmed entry description is empty, use the first non-empty document description, then the first non-empty short description. Record `descriptionSource`. Short-description-only text is labeled in both prompts and in ops evidence. Lock the exact `fields` value only after a live `docket-entries` body shows the keys.

## Boundaries & Constraints

**Always:** Order is entry `description`, then document `description`, then `short_description`. Documents sort `attachment_number` null first, then ascending, stable for ties. `descriptionSource` is `entry` | `recap_description` | `recap_short_description`. Only `recap_short_description` adds `Source text is the CourtListener short description only; the full filing text is not available` to the drafter prompt, the reviewer prompt, and ops evidence. `docketEventId(caseId, entry.id)` stays. Null `entry_number` yields a docket URL with no `?entry=`. Undated entries, and entries with no text after the fallback, stay `skippedIncomplete` and are not inserted into `docket_events` or `drafts`. The fixture is the operator's real response; the parse test fails if `short_description` is missing.

**Never:** Do not change the dedupe id or publish a second row. Do not guess a `fields` value the live body did not return. Do not use the search API as the fixture. Do not request `plain_text` or add `page_size` to the poll. Do not deploy, start a Run, or log the token.

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
| Request URL | Any poll | `fields` has the locked nested keys, not `plain_text` | N/A |
| Live fixture | Recorded 73242633 body | Parse yields a non-empty `short_description` | Fail if the key is absent |

</frozen-after-approval>

## Open Questions

- Exact `fields` value. No `COURTLISTENER_API_TOKEN` here. Context7 (https://www.courtlistener.com/help/api/rest/v4) shows nested selection as `parent__child` (`educations__id`). Unknown fields are silently omitted, so this is not proof. Unverified candidate: `id,entry_number,date_filed,description,recap_documents__description,recap_documents__short_description,recap_documents__attachment_number`. Options: paste the authenticated response first (locks `fields` to keys the body returns, and that body is the fixture) / proceed on the candidate with the fixture test red until the paste (a wrong candidate still drops the four entries).

## Code Map

- `src/pipeline/connectors/courtListener.ts` — `COURTLISTENER_FIELDS` (~49), `entriesUrl` (~72), `parseEntries` (~128), `entryUrl` (~65, already bare when null), `seenEventIds` (~401, reads `docket_events` and `drafts` only), skip (~796, continues before insert; skipped ids are not stored today), `toEntityChange` (~721), `skippedIncomplete` (~847). Leave `docketEventId` (~60) and pacing.
- `src/pipeline/connectors/courtListener.test.ts` — URL assertion (~184); `skippedIncomplete: 2` (~836).
- `src/pipeline/agents/draftAndReview.ts` — `buildDocketPrompt` (~436); `draft.evaluated` payload (~862). `pickAuthorizedContext` passes `diff` through.
- `src/surfaces/ops/EvidenceDetail.tsx` — `DocketDraftBlock` (~586). `ApprovalQueue.tsx` (~340) already omits `entry N` when null and links `sourceUrl`.
- `src/pipeline/connectors/connector.ts` — leave `draft.created` as `{ source, entityType, entityId }`.
- `docs/deploy-runbook.md` (~340) and `spec-3-21-first-live-connector.md` (~122) — add the runbook note and a one-line pointer. Do not reopen 3.21's tasks.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/connectors/courtListener.ts` — locked nested fields, two-pass fallback, `descriptionSource`; skip-before-insert stays.
- [ ] `src/pipeline/connectors/courtListener.test.ts` — matrix rows, including retry, null entry number, unchanged id, and `fields`.
- [ ] `src/pipeline/connectors/fixtures/` — operator's 73242633 body; fail if parsed `short_description` is missing.
- [ ] `src/pipeline/agents/draftAndReview.ts` and `draftAndReview.test.ts` — sentence in both prompts and `draft.evaluated`; one test asserts all three.
- [ ] `src/surfaces/ops/EvidenceDetail.tsx` — render the sentence on the docket record.
- [ ] `docs/deploy-runbook.md` and `spec-3-21-first-live-connector.md` — `skippedIncomplete` is undated or still text-less after the fallback; cite run 0004.

**Acceptance Criteria:**
- Given source `recap_short_description`, when prompts are built and `draft.evaluated` is written, then the drafter prompt, the reviewer prompt, and that evidence payload all contain the thin-text sentence.

## Implementation Notes

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
