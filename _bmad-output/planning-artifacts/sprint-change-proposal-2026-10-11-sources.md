---
project: PredictionMarketLitigation
date: 2026-10-11
workflow: bmad-correct-course
status: proposed
mode: batch
scope: moderate
approach: direct-adjustment
baseline_commit: 4dba6b57e96ed5572e07223b2cbba6a53f4acf63
---

# Sprint change proposal — FR-9 source coverage

The workflow default path is `sprint-change-proposal-{date}.md`. `sprint-change-proposal-2026-10-11.md` already records story 4.8, so this document is `sprint-change-proposal-2026-10-11-sources.md`.

This document is the proposal. It does not edit the PRD, `epics.md`, the architecture, the UX brief, or `sprint-status.yaml`. Status stays `proposed` until Patrick answers section 5.

## 1. Issue summary

**Problem.** FR-9 requires the daily pipeline to monitor Tier-1 and Tier-2 sources. The architecture names CourtListener, the Federal Register, and Tier-2 connectors. The epics built one live connector, story 3.21 (CourtListener). CFTC press, the SCOTUS docket, and Legal news leads stay unwired. Each Run polls four case dockets. Weekend Runs `run-20261011-0000` and `run-20261011-0002` were empty.

**When found.** PML Eng Manager, 2026-10-11. Patrick added, the same day: more web searches, across additional publications. PML Code Review required publish targets, the full FR-9 Tier-2 rules, architecture fit, and a cost check before any story text was treated as final.

**Issue type.** The original requirements were already written. The epic plan implemented a narrower source set than FR-9 and the architecture. This is a scope gap. It is not a defect in those two empty Runs.

**Empty Runs.** Under FR-8 and FR-10, a day with no material change still produces a Run and Evidence with zero drafts. `prd.md` lines 171–177 and 189–193. Those weekend Runs are correct behavior for the sources that were actually polled. The gap is source coverage.

**Evidence.**

- `prd.md` lines 180–187 define FR-9: Tier-1 and Tier-2, a tier label on every item, the pending-primary label, Tier-2-only ineligible for auto-approval, and a public skip reason for a blocked source.
- `prd.md` line 71 defines a primary source as a court docket or opinion, a Federal Register entry, a regulatory filing, or a statute or bill.
- `architecture.md` lines 491–494 name `pipeline/connectors/courtlistener.ts`, `federalRegister.ts`, and `tier2News.ts`. Line 569 names CourtListener, the Federal Register, and Tier-2 sources. `src/pipeline/connectors/` contains `courtListener.ts` and the stub registry. `federalRegister.ts` and `tier2News.ts` are not in the tree.
- `src/pipeline/connectors/sources.ts` lines 5–26 register four poll sources: CourtListener (tier1), CFTC press (tier1, `https://www.cftc.gov/PressRoom/PressReleases`), SCOTUS docket (tier1, `https://www.supremecourt.gov/docket/`), and Legal news leads (tier2, `https://news.bloomberglaw.com/securities-law`).
- `src/pipeline/workflow/dailyRun.ts` lines 89–116 register a live check only for CourtListener. Any other name falls through to the stub.
- `src/pipeline/connectors/connector.ts` lines 187–195 record `source.skipped` with reason `not wired` when the stub runs.
- `src/pipeline/connectors/courtListener.ts` lines 476–486 poll only rows where `owning_table = 'cases'`, `tier = 'tier1'`, and the URL matches `https://www.courtlistener.com/docket/*`. The story 3.21 test states that the seed carries four such case-owned URLs (`courtListener.test.ts` lines 36–40). They are Illinois `73133459`, New York `73242633`, and Furcolo `73375343` (`migrations/0003_source_fit_corrections.sql` lines 81–109) and the Ninth Circuit Assad docket `72237443` (`migrations/0002_seed_f1.sql` line 147). The Johnson docket `73324497` is stored on a circuit row (`0003` lines 110–117), so `listDockets` does not poll it.
- Story 3.21 (`epics.md` lines 946–963) says the remaining sources stay stubs with explicit `source.skipped` reasons.
- `epics.md` line 308 defers FR-7. `prd.md` lines 154–159 require a regulatory tracker for CFTC NPRMs, comment deadlines, state legislation and bans, and enforcement actions, marked `[phase-in]`. `prd.md` lines 622–623 place FR-7 after v1.

**What this proposal adds, still as proposed text.** Six stories: a CFTC press connector, a SCOTUS docket connector, a Federal Register connector, a Tier-2 news-leads connector, a wider CourtListener docket set, and a broad web/news search across more publications. Placement is a decision in section 5. Recommended ids are 3b.1–3b.6.

**Workflow record.** This run resolved customization with `uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/bmad-correct-course --project-root . --key workflow`. The resolved block is empty `activation_steps_prepend`, empty `activation_steps_append`, empty `persistent_facts`, and empty `on_complete`. No team or user override file exists under `_bmad/custom/`. Config was loaded with `resolve_config.py`. Communication language is English. User skill level is intermediate. Document language is English. The date is 2026-10-11. Mode is batch: the trigger and the follow-ups already named the full change set and told this run to stop at the approval checkpoint, so the edit proposals are collected once. `on_complete` is empty and is not a step to run before approval. Checklist section 6.3 stays open. `sprint-status.yaml` is not modified.

## 2. Impact analysis

### Checklist

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Triggering story | [x] | Story 3.21 shipped CourtListener and left the other poll sources as stubs (`epics.md` lines 946–963). The empty weekend Runs showed the coverage gap. 3.21 is done and is not reopened. |
| 1.2 | Core problem | [x] | Scope gap. FR-9 and the architecture name more sources than the epics built. Issue type: the implemented plan is narrower than the written requirements. |
| 1.3 | Evidence | [x] | Section 1. The weekend Run ids are the Eng Manager's report. They are not stored in this repo. |
| 2.1 | Can the trigger epic finish as planned? | [x] | Epic 3 is `done` (Patrick, 10:07 AM ET, 2026-10-11). It can stay finished. The gap is unmet FR-9 scope, not an unfinished 3.21 task. |
| 2.2 | Epic-level changes | [x] | Add stories. Do not reopen Epic 3. Placement A or B is a Patrick decision (section 5). Recommended: a new epic sequenced before Epic 4. |
| 2.3 | Future epics | [x] | Epic 4's entry gate is met: story 3.37 is done and the Epic 3 retrospective is accepted with open items (`epics.md` lines 1186–1188). Story 4.8 stays in the Epic 4 backlog. These source stories do not change 4.1–4.8. |
| 2.4 | Obsolete or new epics | [!] | No planned epic becomes obsolete. A new epic is the recommended way to hold the stories. Patrick chooses A or B in section 5. |
| 2.5 | Order and priority | [!] | Recommended order is the new epic before Epic 4 implementation. Epic 4 ids stay. SCOTUS and the docket expansion can be specified before the FR-7 decision. CFTC press and the Federal Register wait on that decision. Search waits on the provider, page-fetch, and accounting decisions. |
| 3.1 | PRD | [!] | FR-9, FR-8, and FR-10 already say the right things. FR-7 is the conflict: enforcement press and NPRMs need a v1 entity, and the PRD plus `epics.md` defer that entity. See the publish-target finding below. No PRD sentence is edited in this pull request. |
| 3.2 | Architecture | [x] | The connector names already match the work. The tree has no web-search file. New hosts keep story 3.38's serial pacing and story 3.27's HTTPS credential rule. Proposed text is in section 4. Not applied. |
| 3.3 | UI/UX | [x] | The glossary already says Tier-2 is leads only (`ux-brief-pack.md` lines 79–80). It does not state the pending-primary label. One proposed line is in section 4. Not applied. No new screen. |
| 3.4 | Other artifacts | [x] | No `*spec-*.md` under planning artifacts. `AGENTS.md` has no `bmad:context` block. `sprint-status.yaml` is shown in section 4 and is not written. `deferred-work.md` and the Epic 3 retro are cited, not edited. No deploy. |
| 4.1 | Direct adjustment | [x] Viable | Add stories inside the current plan. Planning effort medium. Implementation effort medium to high (six connectors, tests, no deploy in this proposal). Risk medium: ToS, the FR-7 entity, and the 100-cent cap. |
| 4.2 | Rollback | [x] Not viable | Reverting story 3.21 or the Epic 3 close would remove a working CourtListener path and contradict the 10:07 AM ET ruling. Effort high. Risk high. |
| 4.3 | MVP review | [x] Viable, not selected | FR-9 is locked v1 (`prd.md` lines 611–612). Cutting it down to CourtListener would make the empty Runs match the plan and would drop a locked requirement. Effort medium. Risk high against the locked PRD. |
| 4.4 | Selected path | [x] | Option 1, direct adjustment. Placement and the FR-7 scope change stay open in section 5. |
| 5.1 | Issue summary | [x] | Section 1. |
| 5.2 | Epic and artifact adjustments | [x] | This section and section 4. |
| 5.3 | Path and rationale | [x] | Section 3. |
| 5.4 | MVP impact and action plan | [x] | MVP text stays unless Patrick un-defers a narrow FR-7. The action is stories after approval, with the sequencing in section 3. |
| 5.5 | Handoff | [!] | Section 5 names Product Owner and Developer after a yes. A yes that un-defers FR-7 also needs the Product Manager. Handoff is not executed. |
| 6.1 | Checklist completion | [x] | Sections 1–5 are decided. Section 6 items that need Patrick are marked below. |
| 6.2 | Proposal accuracy | [x] | Citations in this document were read from the files named. Prices were fetched on 2026-10-11. Unverified cells stay unverified. |
| 6.3 | Explicit approval | [!] | Open. Section 5 asks for yes, no, or revise. This proposal stays `proposed`. |
| 6.4 | Sprint status | [!] | Not done. `sprint-status.yaml` is untouched until Patrick answers. The keys in section 4 are the text that would be added after a yes. |
| 6.5 | Next steps | [!] | Written in section 5. They start after an explicit yes. |

### Publish targets and FR-7

A connector that emits a Draft with no F1 entity produces text the Approval Gate cannot promote. `prd.md` lines 189–196 require each Draft to name the F1 entities it would change. Live F1 changes only through the gate.

| Story | Publish target | Requirement |
|---|---|---|
| SCOTUS docket | Docket events on the tracked case, and the disclosed basis of the cert signal | FR-3 (`prd.md` lines 118–124) and FR-4 (`prd.md` lines 128–129). The seed already points the Flaherty case and the cert signal at SCOTUS No. 25A1465 (`migrations/0003_source_fit_corrections.sql` lines 15–23; `migrations/0002_seed_f1.sql` line 351). |
| CourtListener docket expansion | `docket_events` on existing cases | Same contract as story 3.21. FR-3. |
| CFTC press | A regulatory-tracker item for enforcement press | FR-7 (`prd.md` lines 154–159). `epics.md` line 46 and line 308 list FR-7 as deferred post-v1. |
| Federal Register | A regulatory-tracker item for CFTC rules and NPRMs, including comment deadlines and effective dates | FR-7. Architecture file `federalRegister.ts` (`architecture.md` line 493). |
| Tier-2 news leads | A lead attached to an existing case, state, circuit, or cert signal, labeled `reported by [source], pending primary confirmation` | FR-9 (`prd.md` lines 184–186) and FR-10. An unmatched lead is Evidence only and cannot be approved onto live F1. |
| Web/news search | The same lead target as Tier-2 news, after outlets covering one event are collapsed into one lead | FR-9. Patrick, 2026-10-11: additional publications, legal and trade press plus mainstream outlets covering Kalshi, Polymarket, the CFTC, and state actions. |

**Decision for Patrick, recorded here and repeated in section 5.** Un-defer FR-7, or name another publish target for regulatory items.

- **Option A (recommended).** Un-defer FR-7 only for CFTC rules, NPRMs, and CFTC enforcement press. State legislation and bans stay deferred. FR-5, the timeline, stays deferred (`prd.md` line 623; `epics.md` line 308). Comment deadlines and effective dates are fields on the regulatory item. They do not require the calendar. This is a v1 scope change and has to be explicit.
- **Option B.** Leave FR-7 deferred. The CFTC press and Federal Register stories record public Evidence and do not create an approvable Draft until a v1 entity exists.
- **Option C.** When a press release names a tracked case, draft a case or docket update under FR-3. An NPRM that is not a case still has no entity, so this option does not cover the Federal Register story.

Option A is the recommendation because the PRD already describes those regulatory items, and a Draft with nowhere to land cannot clear the gate.

### FR-9 rules the Tier-2 stories carry

`prd.md` lines 180–187 and line 306, plus the YOLO bound at lines 267–269. Both the news-leads story and the web-search story include all of the following:

- Every ingested item is labeled Tier-1 or Tier-2 on the Run's Evidence.
- A published factual claim has a Tier-1 citation or the exact label `reported by [source], pending primary confirmation`.
- A Draft supported only by Tier-2 sources is flagged low-confidence and is ineligible for agent auto-approval, including in Autonomous mode. `tier2Only` already escalates in `src/pipeline/gate/yoloPolicy.ts` (the `tier2_only` reason).
- A source blocked by its terms or by a paywall is `source.skipped` with a public reason, not a silent omission.
- Untrusted Tier-2 text cannot expand tool permissions (`prd.md` line 306, enforced with the existing L4/L6 action policy). The connector and the drafter treat titles, snippets, and article text as data. A test feeds an instruction-shaped string in that text and asserts no new tool grant and no publish.

**`isThinSourceText`.** `src/pipeline/gate/yoloPolicy.ts` lines 82–90 return true only when `descriptionSource === "recap_short_description"`. On `run-20261010-0005`, New York entries 174, 175, and 176, and Furcolo, carried one-line titles in `recap_documents.description`. The connector labeled those `recap_description`, so the check did not flag them. Epic 3 retro action item 5 (`epic-3-retro-2026-10-11.md` line 122) and `deferred-work.md` line 333. The Tier-2 news story owns the extension: the same check also flags a one-line `recap_description` and a Tier-2 snippet or short lead, using one of the heuristics already named in `deferred-work.md` (text length, a short-title heuristic, or `description === short_description`). The spec picks the heuristic. This proposal does not pick a character count. The web-search story reuses that check and does not add a second one.

The Legal news leads URL is a single Bloomberg Law section (`sources.ts` lines 21–24). This pass did not verify a Bloomberg Law license that allows PML to fetch and store that page. The recommended story records a public ToS skip for that URL until a license exists. Broad coverage is the search story, not a Bloomberg scrape.

### Architecture fit

`architecture.md` lines 491–494 and 569. Connectors read sources and never write F1 (`architecture.md` line 545).

| New work | File the architecture already names, or the proposed addition |
|---|---|
| Federal Register | `src/pipeline/connectors/federalRegister.ts` (`architecture.md` line 493). Absent today. |
| Tier-2 news leads | `src/pipeline/connectors/tier2News.ts` (`architecture.md` line 494). Absent today. |
| Web/news search | Proposed `src/pipeline/connectors/webSearch.ts`, added beside `tier2News.ts` in section 4. |
| CFTC press and SCOTUS | Same connector folder. The architecture line 569 names the source families. It does not name these two files. Section 4 adds `cftcPress.ts` and `scotusDocket.ts` to the tree. |

**Serial pacing.** Story 3.38 (`epics.md` lines 1176–1184) stopped CourtListener from starting every docket at once. The shipped pace is serial, 15 seconds apart, inside a 6-minute wait budget and an 8-minute poll (`courtListener.ts` lines 322, 330, 335, and 1058–1059). CourtListener's own published limit in that story is about 5 requests per minute. Every new host uses that same serial-start pattern: one request in flight for that host, a configured gap, bounded retry only for HTTP 429, and fail-on-first for 401, 403, 5xx, network, timeout, unsafe URLs, and redirects. The CourtListener 5-per-minute figure stays on CourtListener. This pass did not verify a published rate limit for cftc.gov, supremecourt.gov, or federalregister.gov, so those stories set an explicit gap and do not copy the number 5.

**HTTPS credentials.** Story 3.27 (`epics.md` lines 1047–1056): the initial URL and every next URL are checked against the configured exact HTTPS origin before any credential is attached. Redirects do not carry the credential to another origin. The search API key is sent only to the provider host named in the chosen row of the table below. A test shows a hostile next URL and a cross-origin redirect receive no key.

Adding dockets stays inside the existing CourtListener poll deadline. At 15 seconds between requests, the 8-minute poll cannot absorb an unbounded docket list plus pagination. The expansion story adds the missing tracked-case URLs, keeps the serial clock, and records a public partial-poll reason if the deadline would be exceeded. It does not raise CourtListener's rate.

### Cost

Staging period `staging-deepinfra-v4flash-20261011` has `cap_cents = 100` and ends `2026-10-18T00:10:57.000Z` (`migrations/0025_staging_deepinfra_v4flash_period.sql` lines 36–39). The comment on lines 29–31 says staging `default_budget_cents` is already 100, so the per-Run ceiling and the period ceiling are both 100 cents. The DeepSeek-V4-Flash policy bound is 19 cents per call (`src/pipeline/ai/costPolicy.ts` lines 79–88, `validUntil` the same instant). 100 / 19 admits 5 calls. The sixth call does not fit.

A Draft that reaches review makes at least two `complete()` calls, drafter then reviewer (`src/pipeline/agents/draftAndReview.ts` lines 768–821). A tool-shaped reply can add further calls in that loop. Two finished drafts are 4 admissions (76 cents). A third finished draft needs at least 6 admissions (114 cents) and does not fit. One busy Run can spend the whole period.

| Source | Expected drafts per day | Basis |
|---|---|---|
| CourtListener, four dockets today | 0 on a quiet day. One observed material day produced 12 model calls on `run-20261010-0005` (Epic 3 retro, line 98). At two calls per finished draft, that is on the order of 6 drafts. | Eng Manager: weekend Runs `run-20261011-0000` and `run-20261011-0002` were empty. Retro line 98 is the 12-call count. This is not a measured daily average. |
| CourtListener after expansion | Quiet days stay at 0. The ceiling rises with each added docket and with pagination. | `listDockets` currently selects four case URLs. The Johnson docket is the known extra URL on a circuit row. A full count of tracked cases that still lack a case-owned docket URL was not measured in this pass. |
| CFTC press | Not measured. Planning ceiling: 0 on days with no matching release, and 1 to 2 drafts when matching enforcement releases land. | No CFTC press archive was counted in this pass. Each matched release is one Draft if it has a publish target. |
| SCOTUS docket | 0 on most days. 1 draft on a day the seeded docket 25A1465 changes. | One public SCOTUS docket URL in the seed (`0003` lines 15–23). Filing frequency was not measured. |
| Federal Register | 0 on most days. 1 draft on a day a CFTC rule or NPRM is published. | NPRMs are occasional. Frequency was not measured. A fee for the Federal Register API was not verified in this pass. |
| Tier-2 news leads | 0 when the Bloomberg Law URL is skipped for ToS, which is the recommendation. | The configured URL is one section. A license to fetch it was not verified. |
| Web/news search, after dedupe | Planning range 0 to 3 leads per day. | Four topic queries per Run (Kalshi, Polymarket, CFTC, state actions). Several outlets can cover one event. The range is a planning bound, not a count of past articles. |

Three search leads after dedupe, plus a drafter and a reviewer each, are 6 admissions. That is over the 100-cent period even with every other source at zero. A CourtListener day like `0005` is already over that period. **The per-Run cap and the period cap need a Patrick ruling before any of these stories run on staging.** The recommendation in section 5 is to leave both caps at 100 cents in this proposal and to require `budget-stopped` (FR-19, `prd.md` lines 292–297) when the next admission would not fit. Raising a cap is a separate yes.

### Web-search providers

Checked 2026-10-11. Figures below are copied from the fetched page. Anything that page did not state is marked unverified. No price was filled in from memory.

| Provider | Cost per query | Rate limits | ToS that matter | Snippets or page fetch | Source checked 2026-10-11 |
|---|---|---|---|---|---|
| Brave Search API, Search plan | $5 per 1,000 requests. Capacity on that plan: 50 queries per second. A second product, Answers, is $4 per 1,000 requests plus $5 per million input/output tokens and is not the Search plan. | The rate-limit guide uses a 1-second sliding window. Its sample header `1, 15000` is an example, not this plan's quota. | General terms forbid storing, caching, or creating a database of Search Results except transient storage required to operate the application. Storage rights require a plan that grants them. Redistribution and model training on the results are forbidden. The marketing page says the API returns up to five snippets and that fetching the result URL is the caller's copyright problem. | Snippets (up to five). A PML page fetch is a separate request. | https://brave.com/search/api/ ; https://api-dashboard.search.brave.com/terms-of-service ; https://api-dashboard.search.brave.com/documentation/guides/rate-limiting. The pricing dashboard URL returned no plan table. |
| Bing Search APIs / Grounding with Bing | Grounding with Bing Search and Grounding with Bing Custom Search: $14 per 1,000 transactions. Legacy Bing Search APIs were retired on 2025-08-11. | 150 transactions per second and 1 million transactions per day, on the grounding plans. | The product page says outputs are not directly accessible for use in other applications. Use is as a tool inside Azure AI Foundry Agent Service or as a knowledge source in Azure AI Search. Display requirements apply to citations. | Summarized grounding inside those Microsoft products. Not a snippet feed PML can store on its own. | https://www.microsoft.com/en-us/bing/apis ; https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement |
| Google Custom Search JSON API | $5 per 1,000 queries after 100 free queries per day, up to 10,000 queries per day. Closed to new customers. Existing customers have until 2027-01-01. | 10,000 queries per day on the JSON API. | Commercial, caching, and display terms were not on the overview page fetched here. Mark those terms unverified. | The overview says JSON web or image results. It does not say whether the payload is snippets only. Mark that unverified. | https://developers.google.com/custom-search/v1/overview (page says last updated 2026-02-18 UTC) |
| Exa `/search` | `instant`: $4 per 1,000 requests, up to 10 results. `fast` and `auto`: $7 per 1,000. Each result above 10: $1 per 1,000 results. `/contents`: $1 per 1,000 pages, per content type (`text`, `highlights`, or `summary`). AI page summaries: $1 per 1,000 pages. Free tier: $10 in credits on signup, reset to $10 on the first of each month (up to 2,500 instant searches). | `/search` 10 QPS. `/contents` 100 QPS. HTTP 429 over the limit. `/contents` can return `ROBOTS_FILTER_FAILED` when robots.txt blocks every requested URL. | Terms grant a license to access and display content provided as part of the services, for use of the services, and require compliance with the docs and call-volume limits. Whether a durable D1 copy of the result text is covered by "display" is not stated. Mark durable storage unverified beyond that display license. | Search returns results. Full page text is the separate `/contents` call, which is a provider fetch, not a fetch from the PML Worker. This proposal does not call `/contents`. | https://exa.ai/docs/admin/pricing ; https://exa.ai/docs/reference/rate-limits ; https://exa.ai/terms |
| Tavily Search, `basic` | 1 credit per basic request. Pay-as-you-go is $0.008 per credit, so $0.008 per basic query. Free plan: 1,000 credits per month. Project plan: $30 for 4,000 credits ($0.0075 per credit). `advanced` search is 2 credits. Extract is a separate credit charge. | Development keys 100 requests per minute. Production keys 1,000 requests per minute. Production keys require a paid plan or pay-as-you-go. HTTP 429 uses `Retry-After` when present. | Commercial use, caching, and display terms were not fetched from a Tavily terms page in this pass. Mark those terms unverified. | `basic` returns snippet chunks in `results[].content` (about 500 characters, up to 3 chunks). `include_raw_content` is a separate flag and returns parsed page content. Leaving it false avoids a page body. | https://docs.tavily.com/documentation/api-credits ; https://docs.tavily.com/documentation/api-reference/endpoint/search ; https://docs.tavily.com/documentation/rate-limits |
| NewsAPI.org | Developer: $0, 100 requests per day, articles delayed 24 hours, not allowed in staging or production. Business: $449 per month for 250,000 requests, then $0.0018 per extra request. That is the cheapest plan the pricing page allows outside a development environment. | Developer: 100 requests per day. Business: 250,000 requests per month included. | The pricing page states the Developer plan cannot be used in staging or production, including internally. The same page says full article content is not included. | Metadata and a URL. The page says the caller may scrape the URL. A PML scrape would be a page fetch. | https://newsapi.org/pricing |
| GDELT DOC 2.0 | No price was stated on the official debut page fetched here. Mark the price unverified. Do not treat it as free on the strength of this pass. | No rate limit was stated on that debut page. A 5-second limit appears on third-party writeups and is not used here. Mark the rate limit unverified. | Commercial use, caching, and attribution were not stated on the debut page. `gdeltcloud.com` is a different site and is not cited as GDELT Project terms. Mark ToS unverified. | Article list mode returns titles, sources, and URLs. Whether the payload includes a snippet or requires a page fetch was not confirmed on the fetched debut page. Mark unverified. | https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ |

**Recommendation.** Exa `/search` with type `instant`, at the verified $4 per 1,000 requests. Do not call `/contents`. Do not fetch result pages from the PML Worker. The hard cap is **$5 per calendar month**, which is 1,250 instant requests at that rate. Four topic queries a day for 31 days is 124 requests, about $0.50. The cap is about ten times that plan, and it is a ceiling the Run enforces before the call. It is not the expected bill.

Brave Search is the cheaper snippet API at $5 per 1,000, and its 50 QPS limit is ample, but the general terms forbid a database of Search Results. PML Drafts and public Evidence are durable. Brave is the alternative only if the stored lead keeps the outlet name, the URL, the tier, and the pending-primary label, and does not store the snippet. That alternative's hard cap is also $5 per calendar month (1,000 Search requests).

Tavily's basic search returns snippets inside the credit price, and the unit price is higher ($0.008). Its commercial terms were not verified, so it is not the recommendation. Google's JSON API is closed to new customers. Grounding with Bing does not give PML a snippet row it can store. NewsAPI's production entry price is $449 per month, which is the wrong cap for about 124 queries. GDELT's price and terms were not verified.

### Page fetch, search spend, and dedupe

**Page fetch.** Recommended: the Worker does not fetch result pages. It uses the provider's snippets or result list. The search API key goes only to the provider's validated HTTPS host (story 3.27). If Patrick instead requires page fetches, that story must add a host allowlist, an SSRF guard, robots.txt and paywall respect, and size and time caps, and it must not attach the search key to those page requests. That is option B in section 5. Exa's `/contents` and Tavily's `include_raw_content` are provider-side fetches and are out of the recommended story.

**Search spend.** Recommended: a separate hard-capped search budget, reserved before the query and settled after it, with public Evidence for the query, the skip, and a cap stop. It does not draw on period `staging-deepinfra-v4flash-20261011` and it does not consume a 19-cent LLM admission. Folding a fraction-of-a-cent query into the 100-cent LLM period would make search and drafts share five admissions, and the units do not match. The reserve/settle shape can follow the LLM ledger. The cap and the period row are their own.

**Dedupe.** Before `draftAndReview`, collapse outlets that describe the same event into one lead with more than one source. Ten articles do not become ten paid drafts. The planning range after that collapse is 0 to 3 leads per day, from the four topic queries above. Three leads are already over the 100-cent LLM period.

### Other FR-9 and source scope not given its own story

These are in the PRD and are not in the six stories. They are named so the gap list is complete.

- **Court opinions** as a feed distinct from docket entries. `prd.md` line 71. CourtListener's live connector polls docket entries, not an opinions API. No story in this proposal.
- **Statutes and bills, and state legislation and bans.** `prd.md` line 71 and FR-7 lines 155–159. They stay in the deferred part of FR-7 under option A. The product brief's legislative trackers are this same gap. No story in this proposal.
- **Regulatory filings that are not Federal Register documents.** `prd.md` line 71. The seed already attaches static CFTC complaint PDFs and DCM records. There is no polled connector for new filings. No story in this proposal. A later story can add one if Patrick wants it beside the Federal Register connector.
- **Kalshi and Robinhood market data.** Out of v1. `prd.md` line 573. Not part of this gap.
- **FR-5 timeline.** Stays deferred. Regulatory dates live on the item if option A is chosen. They do not create the calendar.

### Epic impact

Epic 3 stays `done`. Story 3.21 stays `done`. Its stub rule remains true until a later story replaces that stub. Epic 4 stays `backlog`. Stories 4.1–4.8 stay as written. Story 4.8 remains the approver-help story from `sprint-change-proposal-2026-10-11.md`.

Recommended placement is a new epic, Epic 3b, sequenced before Epic 4, so Epic 4's ids and goal stay the governance narrative. The alternate is stories 4.9–4.14 at the front of Epic 4. Both texts are in section 4. Patrick chooses in section 5.

### Story impact

No existing story text changes in this pull request. After approval, the new stories are inserts. 3.21's "remaining sources stay stubs" sentence becomes historical for each source a new story wires, and that sentence is updated in the same approved edit so the epic does not contradict itself.

### Artifact conflicts

**PRD.** FR-9 needs no new rule. The conditional edit is the narrow FR-7 un-defer, option A, shown in section 4. FR-8 and FR-10 stay as the definition of a correct empty Run.

**Architecture.** Add the missing connector files to the tree and state the serial-pacing and HTTPS rules for every new host. No new LLM provider. No change to the Approval Gate.

**UX.** One glossary line for the pending-primary label. The admin queue already renders a Tier-2 flag. No new screen. UX-DR26 and story 4.8 stay as they are.

**Planning specs.** None matched `*spec-*.md`.

**Project context.** `AGENTS.md` has no `bmad:context` block. Staging remains `pml-build`. Production remains `pml`. This pull request does not deploy and does not call staging, production, or a paid provider.

### Technical impact

New connector modules, tests, and poll-source wiring. Secrets for a search provider go to Cloudflare Secrets Store, account level, bound only to the intended Worker, read with `.get()`. Local tests use fixture credentials. No secret value is committed. CourtListener's token handling stays as it is. D1 may gain a regulatory-item table only if Patrick chooses FR-7 option A; that migration is part of the later implementation story, not this pull request. Search accounting is a separate cap, as specified above. No Workers deploy in this proposal.

## 3. Recommended approach

| Option | Effort | Risk | Assessment |
|---|---|---|---|
| 1. Direct adjustment | Medium for the planning record. Implementation of six connectors is medium to high. | Medium. ToS, a missing F1 entity, and the 100-cent cap can each make a connector produce drafts that cannot be approved or calls that budget-stop. | Recommended. |
| 2. Rollback | High. Would unset story 3.21 and the Epic 3 close. | High. Contradicts the 10:07 AM ET ruling. | Not viable. |
| 3. MVP review | Medium. The edit is a narrower FR-9. | High. FR-9 is locked v1 (`prd.md` lines 611–612). | Viable and not selected. |

**Selected approach: Option 1, direct adjustment.**

Add the six stories. Do not reopen Epic 3. Do not edit story 4.8. Do not change a cap, a secret, or a status file in this pull request.

**Placement, inside this option.**

- **A (recommended).** New epic **Epic 3b: Live source coverage**, sequenced before Epic 4. Stories 3b.1–3b.6. Epic 4 stays the governance narrative (`epics.md` lines 304–308). Story 4.8 stays `4-8-admin-approver-control-help`. Epic 3 stays done, which matches the 10:07 AM ET ruling. FR-9 is mapped to Epic 3 today (`epics.md` line 242); the new epic takes the unwired remainder without renumbering 4.1–4.8.
- **B.** Stories 4.9–4.14 at the front of Epic 4, ahead of 4.1 in work order. The entry gate is already met, so they can be specified immediately. Epic 4's goal sentence would then cover both the narrative and the connectors. 4.8 stays in that epic as approver help.

A is the recommendation because the connector work is the FR-9 remainder, and Epic 4's existing stories are a different product. B is the smaller backlog edit if Patrick wants a single open epic.

**Sequencing after a yes.** 3b.2 (SCOTUS) and 3b.5 (docket expansion) have F1 targets today. 3b.4 (Tier-2 leads) owns the `isThinSourceText` extension and the Bloomberg skip. 3b.1 and 3b.3 wait on the FR-7 decision. 3b.6 waits on the provider, the page-fetch choice, and the search-accounting choice. None of them start a paid staging Run until the cap ruling is recorded.

**MVP.** The locked FR-9 text stays. Option A for FR-7 moves CFTC rules, NPRMs, and enforcement press from phase-in into v1 and leaves state legislation and FR-5 in phase-in. That MVP sentence is in section 4 and is not applied until Patrick chooses.

This proposal does not deploy. It does not estimate a calendar duration. The implementation risk is the entity gap, the terms of the search provider, and a busy day that exceeds five admissions.

## 4. Detailed change proposals

These are the edits a later yes would apply. This pull request does not apply them.

### Stories

Ids below are option A. Under option B the same bodies are stories 4.9 through 4.14, in this order, inserted at the front of Epic 4 ahead of story 4.1. Story 4.8's text does not change under either option.

#### Story 3b.1 (option B: 4.9): CFTC press releases connector

```
Story: 3b.1 CFTC press releases connector
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want the CFTC press-room source polled for real,
So that enforcement releases become reviewable drafts instead of a "not wired" skip.

Publish target: a regulatory-tracker item (narrow FR-7, section 5 option A).
Depends on: that FR-7 decision. If Patrick chooses option B, replace the draft
paragraph with Evidence-only and do not create an approvable Draft.
If Patrick chooses option C, a release that names a tracked case drafts that
case under FR-3, and a release that does not name one stays Evidence-only.

Acceptance criteria:
- The host is https://www.cftc.gov. Requests are serial, with an explicit gap.
  HTTP 429 retries are bounded. 401, 403, 5xx, network, timeout, unsafe URLs,
  and redirects fail the source on the first response (story 3.38 pattern,
  epics.md lines 1176–1184). The CourtListener 5-per-minute number is not copied.
- Story 3.27: every URL is checked against that exact HTTPS origin before any
  credential is attached. Redirects do not carry a credential. No token in Evidence.
- Each item is labeled tier1 on Evidence (FR-9, prd.md lines 184–187).
- A matching enforcement release becomes one Draft whose entity is the
  regulatory item: status, key dates, and a primary-source link (prd.md lines
  157–159). The Draft does not write live F1.
- A day with no matching release still finishes the Run. Zero drafts is an
  empty contribution from this source, not a failure (prd.md lines 189–193).
- The stub reason "not wired" is no longer used for "CFTC press".

Rationale: sources.ts lines 12–15 name this Tier-1 URL, and dailyRun.ts does
not register a check for it. FR-7 is the entity, and it is deferred until Patrick
chooses.
```

#### Story 3b.2 (option B: 4.10): SCOTUS docket connector

```
Story: 3b.2 SCOTUS docket connector
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want the SCOTUS docket source polled for real,
So that a change on a tracked Supreme Court docket becomes a case and cert draft.

Publish target: docket events on the existing case (FR-3, prd.md lines 118–124)
and the disclosed basis of the cert signal (FR-4, prd.md lines 128–129).
The seed docket is No. 25A1465.

Acceptance criteria:
- The host is https://www.supremecourt.gov. Serial pacing and the story 3.27
  HTTPS rule, as in 3b.1. No copied CourtListener rate.
- Each item is labeled tier1 on Evidence.
- A new docket entry becomes one Draft for that case's docket events, with a
  primary-source link. When the entry bears on cert timing, the same Draft or
  a sibling Draft updates the cert signal's disclosed basis and last-review
  fields. It does not invent a numeric probability.
- The Run stays empty from this source when the docket is unchanged.
- "SCOTUS docket" is no longer "not wired".

Rationale: sources.ts lines 16–19 and the seed URL in migration 0003 lines
15–23. The poll source is a stub today.
```

#### Story 3b.3 (option B: 4.11): Federal Register connector

```
Story: 3b.3 Federal Register connector
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want CFTC rules and NPRMs read from the Federal Register,
So that regulatory activity named in FR-7 has a Tier-1 draft.

Publish target: the same regulatory-tracker item as 3b.1 (narrow FR-7).
File: src/pipeline/connectors/federalRegister.ts (architecture.md line 493).
Depends on the same FR-7 decision as 3b.1. A fee for the public API was not
verified in the 2026-10-11 proposal; the implementation spec confirms the
access terms before the first live call.

Acceptance criteria:
- Serial pacing and the story 3.27 HTTPS rule against the Federal Register
  host the spec names. Credential rules apply if a key exists; a keyless
  public API still rejects unsafe URLs and cross-origin redirects.
- Each item is labeled tier1. The Draft carries status, comment deadline,
  effective date when the document has them, and the Federal Register link
  (prd.md lines 157–159).
- Scope is CFTC rules and NPRMs. State legislation is not this story.
- An unchanged day produces no Draft from this source. The file
  federalRegister.ts replaces the missing module. The poll list gains a
  Federal Register source; it is not one of the four names in sources.ts today.

Rationale: architecture.md lines 493 and 569 name the connector. The PRD's
regulatory-activity requirement is FR-7. The module is absent.
```

#### Story 3b.4 (option B: 4.12): Tier-2 news leads connector

```
Story: 3b.4 Tier-2 news leads connector
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want Tier-2 leads labeled, contained, and ineligible for auto-approval,
So that FR-9's news path exists without treating trade press as a citation.

Publish target: a lead on an existing case, state, circuit, or cert signal,
with the label "reported by [source], pending primary confirmation"
(prd.md lines 184–186). An unmatched lead is Evidence only and cannot be
approved onto live F1.
File: src/pipeline/connectors/tier2News.ts (architecture.md line 494).

Acceptance criteria:
- Every item this connector ingests is labeled tier1 or tier2 on Evidence.
  Leads from this source are tier2.
- The pending-primary label is on the Draft and on any later published claim
  that still lacks a Tier-1 citation.
- tier2Only drafts are low-confidence and ineligible for auto-approval, in
  HITL and in Autonomous mode (prd.md lines 186 and 267–269).
- A ToS-blocked or paywalled source is source.skipped with a public reason.
  The Bloomberg Law URL in sources.ts lines 21–24 is skipped with that public
  reason unless a later, separate approval records a license. This story does
  not scrape that URL.
- Prompt-injection: untrusted Tier-2 text cannot expand tool permissions
  (prd.md line 306). A test puts an instruction-shaped string in the lead
  text and asserts the action policy is unchanged and nothing publishes.
- isThinSourceText (yoloPolicy.ts lines 82–90) also flags a one-line
  recap_description and a short Tier-2 lead, using one heuristic named in
  deferred-work.md line 333. The spec chooses the heuristic. It does not
  choose a character count in this proposal. Epic 3 retro action item 5.
- Serial pacing and the story 3.27 HTTPS rule for any host this story calls.
- "Legal news leads" is no longer a bare "not wired" stub. A deliberate ToS
  skip is a different public reason.

Rationale: FR-9 is v1. The only Tier-2 poll source is unwired and points at
one Bloomberg Law section. The thin-text gap was observed on CourtListener
text and has to hold for Tier-2 text as well. This story owns that check.
```

#### Story 3b.5 (option B: 4.13): Expand CourtListener dockets

```
Story: 3b.5 Expand tracked CourtListener dockets
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want every tracked case that has a CourtListener docket id to be polled,
So that the daily Run is not limited to the four case-owned URLs.

Publish target: docket_events on the existing case (FR-3), the story 3.21
contract.

Acceptance criteria:
- listDockets (courtListener.ts lines 476–486) continues to require a
  case-owned tier1 URL under https://www.courtlistener.com/docket/. The
  Johnson docket 73324497, stored on a circuit row (migration 0003 lines
  110–117), is also polled by giving that case a case-owned docket URL or
  by teaching the query to follow a circuit docket that belongs to a tracked
  case. The spec names each added id.
- Pacing stays serial: 15 seconds, 6-minute wait budget, 8-minute poll
  (courtListener.ts lines 322, 330, 335). More dockets do not start together
  and do not raise the 5-per-minute limit from story 3.38.
- If the next request would miss the poll deadline, the source records a
  public partial-poll reason and does not burst.
- Story 3.27 still applies to pagination and redirects.
- A one-line recap_description on these dockets is covered by the
  isThinSourceText extension in story 3b.4. This story depends on that check
  before a short entry can be auto-approved. It does not add a second check.
- An unchanged docket still contributes zero drafts (prd.md lines 189–193).

Rationale: the weekend Runs polled four dockets. The architecture's
CourtListener path is already live; the tracked set is the gap.
```

#### Story 3b.6 (option B: 4.14): Broad web and news search

```
Story: 3b.6 Broad web and news search
Section: new story

OLD:
(no story)

NEW:
As the operator,
I want a Tier-2 search across legal press, trade press, and mainstream
outlets covering Kalshi, Polymarket, the CFTC, and state actions,
So that leads are not limited to one Bloomberg Law URL.

Publish target: the same lead target as story 3b.4, after dedupe.
File: src/pipeline/connectors/webSearch.ts (proposed in the architecture edit).
Depends on: the provider choice, the page-fetch choice, and the search-spend
choice in section 5. Depends on story 3b.4 for isThinSourceText and the
Tier-2 auto-approval rule.

Acceptance criteria:
- Queries cover those four topics. The outlet set is legal and trade press
  plus mainstream coverage of those topics. The provider is the one Patrick
  selects. The recommended provider is Exa /search type instant.
- The hard cap is the monthly dollar cap Patrick selects. The recommendation
  is $5 per calendar month (1,250 instant requests at $4 per 1,000). The Run
  refuses the next query when the cap would be exceeded and records that stop
  on public Evidence. The cap is enforced. It is not an estimate.
- Search spend uses the accounting choice in section 5. The recommendation is
  a separate reserved budget, not period staging-deepinfra-v4flash-20261011.
- The API key is sent only to the provider's exact HTTPS host (story 3.27).
- Page fetch follows section 5. The recommendation is snippets or the
  provider result list only. The Worker does not GET article URLs. If Patrick
  chooses fetches, the story adds a host allowlist, an SSRF guard, robots.txt
  and paywall respect, and size and time caps, and the search key is not
  attached to those GETs.
- Before any drafter or reviewer call, outlets on the same event collapse to
  one lead with multiple sources. Expected leads after dedupe are in the
  planning range 0 to 3 per day (section 2). That range is not a measurement.
- FR-9 rules from story 3b.4 apply: tier label, pending-primary label,
  never auto-approved, public ToS skip, prompt-injection containment
  (prd.md line 306), and the shared thin-text check.
- A blocked provider or a blocked outlet is source.skipped with a public reason.

Rationale: Patrick, 2026-10-11, asked for more web searches and additional
publications. One Bloomberg Law URL does not cover that, and its license
was not verified.
```

#### Story 3.21 stub sentence

```
Story: 3.21 First Live Connector
Section: Acceptance Criteria, last bullet (epics.md line 963)

OLD:
And the remaining sources stay stubs with explicit `source.skipped` reasons

NEW:
And any poll source that no later story has wired stays a stub with an
explicit `source.skipped` reason. Stories 3b.1–3b.6 (or 4.9–4.14 if Patrick
chooses placement B) are the stories that retire each stub they name.

Rationale: Leaving the original sentence beside new connectors would make
the epic contradict itself. 3.21's shipped behavior stays in git history.
```

### PRD

FR-9 lines 180–187 stay as they are. The conditional edit is FR-7 and the MVP list, and only if Patrick chooses section 5 option A. Options B and C leave this text unchanged.

```
Story: PRD FR-7 and MVP phase-in
Section: prd.md lines 154–159 and lines 622–623

OLD:
#### FR-7: Regulatory tracker `[phase-in]`
A reader can track non-litigation regulatory activity — CFTC rulemakings (NPRMs + comment deadlines), state legislation/bans, and enforcement actions.

**Phase-in after v1:**
- F1: FR-3 rich filter/search, FR-5 timeline, FR-6 player map, FR-7 regulatory tracker; market-derived cert later if ToS resolved.

NEW (only if Patrick chooses narrow un-defer):
#### FR-7: Regulatory tracker `[v1 for CFTC rules, NPRMs, and enforcement press; state legislation remains phase-in]`
A reader can track CFTC rulemakings (NPRMs and comment deadlines) and CFTC enforcement press in v1. State legislation and bans remain phase-in.

**Phase-in after v1:**
- F1: FR-3 rich filter/search, FR-5 timeline, FR-6 player map, FR-7 state legislation and bans; market-derived cert later if ToS resolved.
- F1 v1 also includes FR-7 for CFTC rules, NPRMs, and CFTC enforcement press (sprint-change-proposal-2026-10-11-sources).

Rationale: Those three regulatory classes are the publish target for the
CFTC press and Federal Register connectors. State legislation and the
timeline stay out of v1. This edit is not applied while the proposal is
`proposed`.
```

### Architecture

```
Story: architecture connector tree and host rules
Section: architecture.md lines 491–494 and line 569

OLD:
│   │   ├── connectors/
│   │   │   ├── courtlistener.ts
│   │   │   ├── federalRegister.ts
│   │   │   └── tier2News.ts

- CourtListener, Federal Register, Tier-2 sources via `pipeline/connectors`

NEW:
│   │   ├── connectors/
│   │   │   ├── courtlistener.ts
│   │   │   ├── federalRegister.ts
│   │   │   ├── cftcPress.ts
│   │   │   ├── scotusDocket.ts
│   │   │   ├── tier2News.ts
│   │   │   └── webSearch.ts

- CourtListener, Federal Register, CFTC press, SCOTUS dockets, and Tier-2
  sources via `pipeline/connectors`. The shipped CourtListener module is
  `src/pipeline/connectors/courtListener.ts`.
- Every new host starts requests serially, using story 3.38's pattern and
  that host's own gap. Story 3.27's exact-HTTPS-origin rule applies before
  any credential is attached, including a search API key.

Rationale: The tree already named the two missing Tier-1/Tier-2 files.
CFTC press, SCOTUS, and web search were not named as files. The pacing and
HTTPS sentences keep new hosts on the rules Epic 3 already shipped.
```

### UI/UX

```
Story: UX glossary Tier-2 line
Section: ux-brief-pack.md lines 79–80

OLD:
| **Tier-2 source** | News/trade press — leads only; not alone sufficient for agent auto-approval |

NEW:
| **Tier-2 source** | News/trade press — leads only; not alone sufficient for agent auto-approval. A claim that still lacks a Tier-1 citation shows "reported by [source], pending primary confirmation." |

Rationale: FR-9 line 185 requires that label. The glossary told the reader
the lead rule and did not state the words. No new screen.
```

### Sprint status

Not applied. After an explicit yes, and only then, the keys below would be added. No existing status token changes. Epic 3 stays `done`. Epic 4 stays `backlog`. Story 4.8 stays `backlog`.

```
Story: sprint-status.yaml development_status
Section: new keys only

OLD:
(no epic-3b keys; epic-4 and 4-8 unchanged)

NEW if placement A:
  epic-3b: backlog
  3b-1-cftc-press-releases-connector: backlog
  3b-2-scotus-docket-connector: backlog
  3b-3-federal-register-connector: backlog
  3b-4-tier-2-news-leads-connector: backlog
  3b-5-expand-courtlistener-dockets: backlog
  3b-6-broad-web-news-search: backlog

NEW if placement B, inserted with the Epic 4 backlog:
  4-9-cftc-press-releases-connector: backlog
  4-10-scotus-docket-connector: backlog
  4-11-federal-register-connector: backlog
  4-12-tier-2-news-leads-connector: backlog
  4-13-expand-courtlistener-dockets: backlog
  4-14-broad-web-news-search: backlog

Rationale: Checklist item 6.4 runs after approval. This pull request
records the keys and does not write the file.
```

## 5. Implementation handoff

**Scope.** Moderate: backlog reorganization and new stories, for the Product Owner and the Developer after a yes. It becomes major if Patrick un-defers FR-7, because that changes the phase-in line in a locked PRD. In that case the Product Manager confirms the MVP sentence in section 4 before a developer writes the regulatory-item schema. This proposal does not route the work yet.

**Success criteria, after a yes and after implementation.** A scheduled Run records a tier label for every consulted source. CFTC press, SCOTUS, Federal Register, Tier-2 leads, and web search no longer use the bare reason `not wired`, except where a story deliberately skips with a public ToS reason. CourtListener polls the expanded case docket set inside the existing pace. Tier-2-only and thin-text drafts are not auto-approved. Search queries stop at the hard cap and show that stop on public Evidence. An empty source still leaves the Run valid under FR-8. No secret is logged. Staging and production are untouched by this proposal's pull request.

**Checklist 6.3 is open.** Explicit approval has not been given.

**Checklist 6.4 is not done.** `sprint-status.yaml` is untouched.

**Checklist 6.5 waits.** The next step is Patrick's answer. A yes sends the approved story text to the Product Owner to place the backlog, then to the Developer. A no or a revise returns to the edit proposals in section 4. `workflow.on_complete` is empty and is not run before that yes.

### Decisions for Patrick

1. **Placement.** A: new Epic 3b sequenced before Epic 4, stories 3b.1–3b.6, Epic 4 ids unchanged. B: stories 4.9–4.14 at the front of Epic 4, ahead of 4.1; story 4.8 stays. Recommendation: **A**. Epic 3 stays done, and Epic 4 stays the narrative epic.

2. **FR-7 publish target.** A: un-defer FR-7 only for CFTC rules, NPRMs, and CFTC enforcement press; state legislation and FR-5 stay deferred. B: leave FR-7 deferred and do not create approvable drafts for those connectors. C: map a press release onto an existing case when it names one; NPRMs that are not cases still have no entity. Recommendation: **A**.

3. **Per-Run and period cap.** Both are 100 cents through `2026-10-18T00:10:57Z`, and 19 cents per LLM call admits 5 calls. A: leave both caps and budget-stop when the next admission would not fit. B: raise the period cap only. C: raise the per-Run cap and the period cap together. Recommendation: **A** inside this proposal. A ruling is still required before a paid staging Run, because three deduped leads or a day like `run-20261010-0005` exceeds 5 admissions.

4. **Search provider and hard cap.** Exa `/search` type `instant` at $4 per 1,000 requests, hard cap **$5 per calendar month** (1,250 requests). Alternative: Brave Search at $5 per 1,000, hard cap **$5 per calendar month** (1,000 requests), and only if snippet text is not stored. Tavily, Google, Bing grounding, NewsAPI, and GDELT are not recommended, for the reasons in section 2. Recommendation: **Exa instant, $5 per calendar month hard cap.**

5. **Search spend accounting.** A: a separate reserved budget with that hard cap and public Evidence, not the LLM period. B: fold queries into the 100-cent LLM period. Recommendation: **A**.

6. **Page fetch.** A: provider snippets or result lists only; the Worker does not fetch article pages. B: fetch pages with a host allowlist, an SSRF guard, robots.txt and paywall respect, and size and time caps, without sending the search key on those fetches. Recommendation: **A**.

7. **Bloomberg Law URL.** A: public ToS skip until a license is recorded; coverage of other publications is story 3b.6. B: fetch `https://news.bloomberglaw.com/securities-law` directly. Recommendation: **A**. A license to fetch and store that page was not verified.

8. **Unmatched Tier-2 leads.** A: Evidence only; they cannot be approved onto live F1. B: a new lead entity that can be approved somewhere other than the current case, state, circuit, and cert records. Recommendation: **A**, because FR-10 drafts name F1 entities that already exist.

9. **Named gaps with no story.** Court opinions, statutes and bills, state legislation, and non-Federal-Register regulatory filings stay out of this proposal. Recommendation: **leave them out.** State legislation stays with the deferred part of FR-7. Say so in the approval if one of them should become a seventh story.

Do you approve this Sprint Change Proposal for implementation? (yes / no / revise)

A yes that changes any recommendation above should name the option. Until that answer, this document stays `proposed`, and checklist items 6.3, 6.4, and 6.5 stay open.
