## Deferred from: code review of 1-4-admin-access-protection.md (2026-08-10)

- **AC4, display-name half (decided 2026-08-10):** the admin session strip renders "Not signed in" rather than the operator's name. `app.tsx` passes no `operator` prop and there is no verified session to draw one from until Access is bound in Story 1.5. `AdminShell` and `AdminBar` already accept the prop, so 1.5 only needs to supply it — via a guarded `GET /api/admin/session` or server-rendered chrome once `/admin` runs through the Worker.

- `/agents/*` and `ChatAgent`'s `@callable() addServer` remain fully unauthenticated — an anonymous caller can attach an attacker-controlled MCP server and drive `env.AI`. Already ledgered under 1.1; 1.4 deliberately did not touch `server.ts`'s agent routing. Owned by Story 1.5 deploy hardening.
- `workers_dev` and `preview_urls` are not disabled in `wrangler.jsonc`, so every deploy mints the exact public hostnames that `access.ts`'s own comments name as the reason JWT verification exists. Story 1.5 should set both false or cover them with Access.
- AC6 (no Access config in the client bundle) rests on a one-time manual `grep` of `dist/` recorded in the Completion Notes — no committed test or CI step pins it. Needs the pipeline from Story 1.5.
- No revocation awareness: a leaked Access JWT stays valid until `exp` even after the identity is removed in Zero Trust. Inherent to stateless verification; the runbook should document rotating `OPERATOR_EMAIL` as the break-glass step.
- Unauthenticated callers can trigger outbound JWKS fetches by spraying tokens with unknown `kid` values. Mitigated by jose's built-in fetch cooldown; revisit if a rate-limiting binding lands.
- `access.ts` sits in `src/shared/lib/`, which client surfaces already import from (`surface.ts`). Nothing structurally prevents a future surface importing `verifyOperator` and pulling `jose` plus the auth logic into the browser bundle. Wants a lint boundary rule.
- `src/access-env.d.ts` relies on being a global script for its `interface Env` declaration merge; one stray `import` turns it into a module and silently breaks the merge.

## Deferred from: code review of 1-3-dual-site-shells-trust-chrome.md (2026-08-10)

- `oxfmt --check .` fails repo-wide (including files this story never touched, e.g. `README.md`, `package.json`) because `core.autocrlf=true` checks the repo out as CRLF on Windows and there is no `.gitattributes` pinning LF — pre-existing since before Story 1.1; fix with a repo-root `.gitattributes` (`* text=auto eol=lf` or similar).

## Deferred from: code review of 1-2-design-tokens-core-trust-components.md (2026-08-10)

- EmptyState does not guard empty/whitespace `title` — presentational primitive; callers own copy until a real empty-state surface lands.
- NotLiveDraftBanner has no `role="status"` / live-region semantics — a11y enhancement beyond Story 1.2 ACs; revisit with admin/ops draft surfaces.
- Google Fonts third-party load with no self-hosted fallback — already an Open Question for Patrick; decide before Story 1.5 custom domain.
- RunStatusChip reader labels mostly untested beyond empty → “no material change” — Task 8 only required class/enum contract; deepen when Run log UI ships.

## Deferred from: code review of 1-1-scaffold-cloudflare-agents-starter.md (2026-08-09)

- ~~Unauthenticated starter agent surface (chat + Workers AI + `@callable` MCP add/remove with no auth/allowlist)~~ — **partially retired 2026-08-10 (Story 1.3):** the client chat UI is gone, so the surface is no longer reachable from the app. The `ChatAgent` Durable Object and its `/agents/*` route still exist in `src/server.ts` and remain **unauthenticated** — still owned by Stories 1.4 (Access) and 1.5 (deploy hardening). Do not treat the scaffold demo agent as production-safe.
- ~~Starter HTML still titled "Agent Starter" / Cloudflare Agents description~~ — **RESOLVED 2026-08-09 (Story 1.2):** `index.html` title and description are PML's.
- ~~Starter UI edge cases in `src/app.tsx`: blob URL leak on Chat unmount, Approve/Reject no-op when `approval.id` missing, send clears input before encode/send can fail, concurrent send while encoding, no attachment size/count caps, unguarded `mediaType`/`text` access, MCP connect failures only `console.error`~~ — **RESOLVED 2026-08-10 (Story 1.3):** the starter chat UI was deleted wholesale when `src/app.tsx` became the surface router. None of this code remains; the defects died with the template rather than being fixed. `@cloudflare/kumo`, `@phosphor-icons/react`, `streamdown` and `@streamdown/code` were removed with it.

## Open from: Story 1.3 (2026-08-10)

- `/admin` is reachable by anyone who knows the path until Story 1.4 wires Cloudflare Access. The admin chrome says so explicitly, and every band on it is an empty placeholder with no mutating API behind it — but the route must not ship to a real domain unprotected. Story 1.5 binds domains, so 1.4 must land first.
