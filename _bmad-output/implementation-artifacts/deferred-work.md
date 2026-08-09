## Deferred from: code review of 1-1-scaffold-cloudflare-agents-starter.md (2026-08-09)

- Unauthenticated starter agent surface (chat + Workers AI + `@callable` MCP add/remove with no auth/allowlist) — owned by Stories 1.4 (Access) and 1.5 (deploy hardening); do not treat scaffold demo agent as production-safe.
- Starter HTML still titled “Agent Starter” / Cloudflare Agents description — branding/replaceable UI owned by Story 1.2.
- Starter UI edge cases in `src/app.tsx`: blob URL leak on Chat unmount, Approve/Reject no-op when `approval.id` missing, send clears input before encode/send can fail, concurrent send while encoding, no attachment size/count caps, unguarded `mediaType`/`text` access, MCP connect failures only `console.error` — leave with template UI until 1.2 replacement.
