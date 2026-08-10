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
