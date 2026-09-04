## Deferred from: code review of 1-4-admin-access-protection.md (2026-08-10)

- ~~**AC4, display-name half:** the admin session strip renders "Not signed in" rather than the operator's name~~ â€” **RESOLVED 2026-08-10 (Story 1.5 Part B):** closed the same day Access went live, since that is what it was waiting for. Took the `GET /api/admin/session` route of the two options, not server-rendered chrome: the app is a client-side SPA served from a prebuilt document, so adding `/admin` to `run_worker_first` would let the Worker see the request without giving it anywhere to inject a name â€” that needs HTMLRewriter or an SSR pipeline, for one route. `/api/admin/*` already runs through the Worker and is already gated twice. `useAdminSession` fetches it and fails closed to "Not signed in" on every error path, including the 302-to-login that Access returns for an expired session. **Only `displayName` crosses the wire** â€” never the email, which `access.ts` types as unsafe to render and which Story 3.13 would otherwise risk publishing on ops.
  - Two things went stale with it and were fixed in the same change: the admin chrome's warn chip still read "Not access-controlled â€” anyone with this URL sees it", which had become the *opposite* falsehood once Access was bound; and its test carried an explicit "delete this only when Access is actually in front of /admin" instruction, whose condition had been met.

- ~~`/agents/*` and `ChatAgent`'s `@callable() addServer` remain fully unauthenticated~~ â€” **RESOLVED 2026-08-10 (Story 1.5):** `/agents` and `/agents/*` now run through the same `requireOperator` guard as `/api/admin/*`, with the same opaque 403 and the same normalization against encoding/slash bypasses. The `ChatAgent` Durable Object is untouched â€” Epic 3 builds on that wiring; only the door is locked.
- ~~`workers_dev` and `preview_urls` are not disabled in `wrangler.jsonc`~~ â€” **RESOLVED 2026-08-10 (Story 1.5):** both set `false` at the top level (inheritable, so every environment gets them), stated explicitly rather than inferred from `routes` because the `preview_urls` default changed twice in wrangler 4.34/4.44.
- ~~AC6 (no Access config in the client bundle) rests on a one-time manual `grep` of `dist/`~~ â€” **RESOLVED 2026-08-10 (Story 1.5):** `src/shared/lib/wranglerConfig.test.tsx` walks `dist/client/` and asserts no bundled file mentions `TEAM_DOMAIN`, `POLICY_AUD`, `OPERATOR_EMAIL`, `ACCESS_DEV_BYPASS` or `cloudflareaccess`. Skips cleanly when `dist/` is absent; `npm run build && npm test` is the full check.
- No revocation awareness: a leaked Access JWT stays valid until `exp` even after the identity is removed in Zero Trust. Inherent to stateless verification; the runbook should document rotating `OPERATOR_EMAIL` as the break-glass step.
- Unauthenticated callers can trigger outbound JWKS fetches by spraying tokens with unknown `kid` values. Mitigated by jose's built-in fetch cooldown; revisit if a rate-limiting binding lands.
- `access.ts` sits in `src/shared/lib/`, which client surfaces already import from (`surface.ts`). Nothing structurally prevents a future surface importing `verifyOperator` and pulling `jose` plus the auth logic into the browser bundle. Wants a lint boundary rule.
- `src/access-env.d.ts` relies on being a global script for its `interface Env` declaration merge; one stray `import` turns it into a module and silently breaks the merge.

## Deferred from: code review of 1-3-dual-site-shells-trust-chrome.md (2026-08-10)

- ~~`oxfmt --check .` fails repo-wide because there is no `.gitattributes`~~ â€” **RESOLVED 2026-08-10 (Story 1.5):** `.gitattributes` pins `* text=auto eol=lf`, the working tree was renormalized, and `npm run check` now exits 0 across all 48 files. Only four vendored BMAD CSVs had CRLF in the index; all project source was already LF, so there was no whole-tree history diff.

## Deferred from: code review of 1-2-design-tokens-core-trust-components.md (2026-08-10)

- EmptyState does not guard empty/whitespace `title` â€” presentational primitive; callers own copy until a real empty-state surface lands.
- NotLiveDraftBanner has no `role="status"` / live-region semantics â€” a11y enhancement beyond Story 1.2 ACs; revisit with admin/ops draft surfaces.
- ~~Google Fonts third-party load with no self-hosted fallback~~ â€” **CLOSED BY DECISION 2026-08-10 (Patrick, during Story 1.5):** keep the Google Fonts CDN load. Not a defect; a deliberate choice recorded so it is not re-raised.
- RunStatusChip reader labels mostly untested beyond empty â†’ â€œno material changeâ€ â€” Task 8 only required class/enum contract; deepen when Run log UI ships.

## Deferred from: code review of 1-1-scaffold-cloudflare-agents-starter.md (2026-08-09)

- ~~Unauthenticated starter agent surface (chat + Workers AI + `@callable` MCP add/remove with no auth/allowlist)~~ â€” **partially retired 2026-08-10 (Story 1.3):** the client chat UI is gone, so the surface is no longer reachable from the app. The `ChatAgent` Durable Object and its `/agents/*` route still exist in `src/server.ts` and remain **unauthenticated** â€” still owned by Stories 1.4 (Access) and 1.5 (deploy hardening). Do not treat the scaffold demo agent as production-safe.
- ~~Starter HTML still titled "Agent Starter" / Cloudflare Agents description~~ â€” **RESOLVED 2026-08-09 (Story 1.2):** `index.html` title and description are PML's.
- ~~Starter UI edge cases in `src/app.tsx`: blob URL leak on Chat unmount, Approve/Reject no-op when `approval.id` missing, send clears input before encode/send can fail, concurrent send while encoding, no attachment size/count caps, unguarded `mediaType`/`text` access, MCP connect failures only `console.error`~~ â€” **RESOLVED 2026-08-10 (Story 1.3):** the starter chat UI was deleted wholesale when `src/app.tsx` became the surface router. None of this code remains; the defects died with the template rather than being fixed. `@cloudflare/kumo`, `@phosphor-icons/react`, `streamdown` and `@streamdown/code` were removed with it.

## ~~Open from: Story 1.3 (2026-08-10)~~ â€” CLOSED

- ~~`/admin` is reachable by anyone who knows the path until Story 1.4 wires Cloudflare Access... the route must not ship to a real domain unprotected.~~ â€” **RESOLVED 2026-08-10 (Story 1.5 Part B).** The condition this entry set was met before the domain went live, in the order it demanded: 1.4 shipped the Worker-side verification, then 1.5 bound the domains and created the Access application in the same session, so `/admin` was never reachable unprotected on a real domain. Verified against production: `/admin` answers `302` to the Access login, and the admin chrome no longer claims to be unprotected.

## Deferred from: code review of 2-1-f1-data-model-apis-case-law-seed.md (2026-08-31)

- `npm run deploy` still publishes the repository SPA over the stable root landing page because `/preview/*` routing and a repository-owned landing document have not landed. This predates Story 2.1's migration-script change and remains governed by the explicit warning in `docs/deploy-runbook.md`; do not run a live deploy until that routing work is completed or the operator deliberately accepts the overwrite.
- ~~Story 2.2 must delete the unconditional launch-state `LaunchNote` before any later Epic 2 story wires a reader-facing band; otherwise its â€œviews are not wiredâ€ copy would sit above live findings.~~ â€” **RESOLVED 2026-08-31 (Story 2.2):** `LaunchNote.tsx` is deleted. Apex orientation is credibility â†’ masthead â†’ KPI â†’ `#brief`; remaining bands stay EmptyState.
- Brand `Posture` and `OperationalStatus` at the TypeScript boundary so their shared `banned` literal cannot be passed between UI components. This is a cross-UI type refactor, not a Story 2.1 data-contract fix.
- ~~**[LOW][edge][Deferred to 2.5] No FTS index for Story 2.5's free-text case search.** Fine at seed scale; recorded for the story that implements search.~~ â€” **RESOLVED 2026-09-01 (Story 2.5):** client-side AND-token match on the 25-row list payload. D1 FTS5 is postponed until `GET /api/cases` list-all is no longer sufficient.
- FR9's future `pending-primary` ingestion state still needs a first-class representation when the governed write pipeline lands. Every current seeded tracked claim has Tier-1 coverage, so no live row needs that state today.
- The ops and admin documents still have no `<h1>`. Their future chrome stories should fix the pre-existing outline gap without changing Story 2.1's apex-only UI.

## Deferred from: code review of 2-2-apex-orientation-chrome.md (2026-09-01)

- Founder portrait remains a `.plate` lettermark (`PB`) and the founder LinkedIn link is omitted. Both are the story's documented fallbacks until a real `public/assets/patrick-bland.jpg` and a real profile URL are supplied.

## Deferred from: code review of 2-3-circuit-split-heat-map.md (2026-09-01)

- ~~`history.replaceState` writes `?state=` / `?circuit=` but does not listen for `popstate`. Story 2.4 owns board sync and can attach Back/Forward traversal if the shareable URL contract needs it.~~ â€” **RESOLVED 2026-09-01 (Story 2.4):** `useApexSelection` now listens for `popstate` and re-runs `nextApexSearch`; clicks still use `replaceState`.

## Deferred from: code review of 2-4-state-status-board-synced-with-map.md (2026-09-01)

- Failed or empty F1 list still prints "0 of 0 tracked states" with absence-is-not-a-finding copy. `useCircuitData` fail-closes to `states: []` and `listsReady: true`; the map already had this empty-list path. Distinguish fetch-fail from "nothing tracked" when a later story owns list-error chrome.

## Deferred from: code review of 2-5-case-list-detail-rich-filters.md (2026-09-02)

- `useCircuitData` `load()` still uses `items.every(guard)`, so one invalid `/api/cases` item discards the whole list (same helper as circuits/states). Empty `caseIds` then cannot constrain `?case=`.
- `listCases` `CaseListItemSchema.parse`s every assembled row in one pass; one invalid `case_role` 500s `GET /api/cases`. Same all-or-nothing parse as the other F1 list repos.
- `/api/cases` (and the sibling F1 list fetches) have no timeout; a hung request leaves `listsReady` false so invalid `state` / `circuit` / `case` params are never stripped.

## Deferred from: code review of 2-6-issue-map-synced-to-cases.md (2026-09-02)

- Client `isCase` still uses `items.every(guard)`, so one invalid `/api/cases` item discards the whole list. Story 2.6 added `firstOccurredAt === null || typeof string` to that guard, so a mixed-deploy or cached payload missing the new field now fails the same all-or-nothing check. Same 2.5 blast radius; do not change the `every()` contract here.

## Deferred from: code review of 2-7-entity-ledger.md (2026-09-02)

- Entity tests pin `selectionFromEntityMatter` / `selectionForState` and static â€œOpen case recordâ€ markup instead of clicking `commit`. Epic 2 UI tests are `renderToStaticMarkup` only; there is no click driver and Story 2.7 forbids a new npm dependency. Revisit if a later story adds a harness.

## Deferred from: code review of 2-8-qualitative-cert-signal.md (2026-09-02)

- Seed `methodNote` is now public `#cert` copy and still says the reading was â€œSeeded qualitatively from the Aug 9, 2026 case-law survey corpus (docs/research/)â€. Story 2.8 was required to print D1 `methodNote` and not migrate; rewrite the seed sentence if the public gauge should not name a repo path.
- Apex top-nav still labels `#cert` as â€œCert signalâ€ after the band title became â€œCertiorari likelihoodâ€. The nav string is pre-2.8 chrome; this story only rewrote the SectionBand title.

## Deferred from: code review of 2-9-reader-cert-poll-tally-api.md (2026-09-03)

- **Unthrottled anonymous INSERT endpoint allows ballot stuffing.** `POST /api/poll/votes` mints a fresh `crypto.randomUUID()` token per cookieless request and inserts unconditionally; a script can insert unbounded rows and inflate the public tally. â€” **ACCEPTED (Patrick, 2026-09-03):** it is an unscientific reader poll, and the identity options that would stop stuffing (IP columns, fingerprinting, reader accounts) are all forbidden by FR44/A7/NFR11. Revisit only if stuffing becomes visible; a Cloudflare rate-limit rule on the path is the no-code lever if it does.

