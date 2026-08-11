# Cloudflare Access runbook

How operator authentication works in PML, and what Story 1.5 must do to finish binding it.

Story 1.4 shipped the Worker-side half. The Zero Trust half is deliberately not done yet — see [Why this is split](#why-this-is-split).

---

## Decision: the identity provider is Cloudflare's own IdP

**Chosen 2026-08-10.** Cloudflare shipped a first-party identity provider and made it the default for new Zero Trust organizations on 2026-06-18. For a single solo operator it wins on every axis that matters here:

| | Cloudflare IdP | One-time PIN | GitHub | Google |
|---|---|---|---|---|
| Setup steps | 0 — present by default | ~3 | ~8 (OAuth App) | ~14 (GCP project) |
| External account needed | none | none | GitHub | Google Cloud |
| Secret to rotate | none | none | client secret | client secret |
| MFA | inherited from the Cloudflare account | none (email possession only) | via GitHub | via Google |

Policy is a single selector: **Cloudflare Account Member → this account**.

> `architecture.md:627` lists the options as "Google vs GitHub vs one-time PIN". That list predates Cloudflare's own IdP and is **stale** — it is not a constraint, and no artifact had recorded a decision until this one.

One-time PIN is worth adding later as a **break-glass** second method in case of Cloudflare account lockout (~3 clicks). It is no longer added automatically to new organizations. Not done in 1.4.

---

## Why this is split

A path-scoped Access application requires **an active zone in your Cloudflare account**. The Zero Trust UI's Domain field is a dropdown limited to zones you own; an arbitrary `*.workers.dev` hostname cannot be entered.

The one-click Access toggle that *does* work on `workers.dev` (Workers & Pages → your Worker → Settings → Domains & Routes → Enable Cloudflare Access) protects the **entire hostname**, with no path scoping. Turning it on today would gate apex and `ops.` too — violating the requirement that public routes stay reachable without login.

Custom domains are bound in Story 1.5. So:

- **Story 1.4 (done):** Worker-side JWT verification, operator allowlist, `/api/admin/*` guard, session chrome, dev bypass, offline tests.
- **Story 1.5 (config, done):** single-environment Wrangler config, `workers_dev`/`preview_urls` disabled, `/agents/*` gated behind the same operator guard.
- **Story 1.5 (account setup, to do):** everything in [The 1.5 checklist](#the-15-checklist) — sequenced with the D1/domain/Builds steps in [`deploy-runbook.md`](deploy-runbook.md).

---

## How verification works today

`src/shared/lib/access.ts` → `verifyOperator(request, env)` returns an `Operator` or `null`.

1. If `env.ACCESS_DEV_BYPASS === "true"` **and the request hostname is loopback** → stub operator. Both gates are required: a tunnelled `wrangler dev` loads `.dev.vars` and is publicly reachable, so the var alone is not enough.
2. Read the token: header `Cf-Access-Jwt-Assertion`, falling back to the `CF_Authorization` cookie **for safe methods only**. The cookie is attached automatically by the browser, so accepting it for POST/PUT/PATCH/DELETE would be a CSRF hole once story 3.10 adds mutating handlers. All matching cookies are tried, not just the first, so an empty shadowing cookie cannot lock the operator out.
3. `jwtVerify` against `${TEAM_DOMAIN}/cdn-cgi/access/certs`, pinned to `issuer`, `audience`, and `algorithms: ["RS256"]`. Secrets are trimmed and a trailing slash stripped from `TEAM_DOMAIN` — one stray character would otherwise lock the operator out silently.
4. Compare the `email` claim to `OPERATOR_EMAIL`, case-insensitively.
5. Any failure → `null`. Nothing throws.

`src/shared/lib/adminGuard.ts` → `requireOperator` turns `null` into `403 { code: "forbidden", message }`. No `details`, no reason. "No token" and "wrong identity" are indistinguishable from outside on purpose.

### Why the Worker verifies at all, when Access is an edge product

**Access only covers hostnames an Access application names.** After 1.5 binds `predictionmarketlitigation.com`, this Worker is *still* reachable at its `workers.dev` hostname and at every preview URL. A request arriving there can set `Cf-Access-Jwt-Assertion` to any value it likes. Cloudflare documents this failure mode directly for the analogous case: a hostname that does not pass through the zone "keeps answering unauthenticated requests and defeats the policy."

Signature + audience verification is what turns that from a breach into a 403. **Do not simplify this module into a header read.**

`audience` in particular is not optional — the AUD tag is per-application, so without it a token minted for *any other* Access app on the same Cloudflare account would pass on signature and issuer alone.

### Two questions, deliberately separate

- *Is this token real?* → cryptographic verification
- *Is this token Patrick's?* → the `OPERATOR_EMAIL` allowlist

Story 3.13 requires that non-operator identities cannot change gate mode, so "authenticated" alone is insufficient. Both must pass.

---

## Configuration

| Name | Kind | Where | Notes |
|---|---|---|---|
| `TEAM_DOMAIN` | secret | Wrangler secret | `https://<team-name>.cloudflareaccess.com` |
| `POLICY_AUD` | secret | Wrangler secret | Access application AUD tag |
| `OPERATOR_EMAIL` | secret | Wrangler secret | the single authorized identity |
| `OPERATOR_DISPLAY_NAME` | config | `.dev.vars` / secret | public-safe name; defaults to `Patrick` |
| `ACCESS_DEV_BYPASS` | dev only | `.dev.vars` **only** | exactly `"true"` enables the bypass |

Types are declared in `src/access-env.d.ts` — hand-authored, because `env.d.ts` is generated by `wrangler types` and overwritten wholesale.

**`ACCESS_DEV_BYPASS` is deliberately absent from `wrangler.jsonc`.** `.dev.vars` is gitignored (`.dev.vars*`) and read only by `wrangler dev` — never bundled, never deployed. Do not "tidy" it into `wrangler.jsonc` vars: with no `env` blocks defined yet, a plain `wrangler deploy` would carry it straight to production. `src/shared/lib/wranglerConfig.test.tsx` fails if it ever appears there.

That is only the first of two gates. The bypass **also** requires a loopback request hostname, because a tunnelled `wrangler dev` — which the section below recommends — loads `.dev.vars` *and* publishes the dev server on a public hostname. Either gate alone is insufficient.

---

## Local development

`npm run dev` picks up `.dev.vars` automatically. With the bypass on, `/api/admin/*` is open and `verifyOperator` returns a stub operator.

To exercise the **real** verification path locally, either set `ACCESS_DEV_BYPASS` to anything other than `"true"`, or use a named tunnel:

- Press `t + Enter` in `vite dev` (built-in tunnel support landed 2026-05-18), or `wrangler dev --tunnel-name=<name>`.
- Use a **named** tunnel, not a quick one: quick tunnels are public, and Cloudflare's docs warn specifically about exposing "ungated preview or admin endpoints".
- A named tunnel needs a zone — so this option only becomes available after 1.5.
- Note the bypass does **not** fire over a tunnel regardless: the request hostname is not loopback, so `/api/admin/*` demands a real token. That is the point — it is what makes tunnelling safe to recommend.

Service tokens (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) are for **CI against a deployed environment**, not localhost — they are validated at the edge, and localhost has no edge in front of it. They do not consume Zero Trust seats.

---

## The 1.5 checklist

> **DONE 2026-08-10.** Created via the Cloudflare API, not the dashboard. Application `PML admin`, id `b13e527e-4441-4940-b6dd-34e1809fd33d`, AUD `0170fec17ba3f12af09260df14ffc4af237f7b85ae99577be57bd7bf637779bb`, team domain `https://bizmation.cloudflareaccess.com`. Verified live: `/admin` returns a 302 to the Access login whose `kid` is that AUD. **Two steps below were deliberately not followed as written — see [Deviations](#deviations-from-this-checklist-2026-08-10) immediately after.**

**Single environment** (revised 2026-08-10 — staging was cut; see `deploy-runbook.md`). One Access application, one AUD tag, one set of secrets.

1. **Bind the custom domains first** — `predictionmarketlitigation.com` and `ops.` — so a zone exists.
2. **Create a self-hosted Access application** with destinations:
   - `predictionmarketlitigation.com/admin`
   - `predictionmarketlitigation.com/admin/*`
   - `predictionmarketlitigation.com/api/admin/*`
   > A wildcard `/admin/*` does **not** match the bare `/admin` path. Both entries are required or the bare route falls through unprotected.
3. **Add the policy:** Allow → Cloudflare Account Member → this account. An application with **no** policy denies everything.
4. **Copy the AUD tag** (Application → Configure → Additional settings → *Application Audience (AUD) Tag*) into `POLICY_AUD`.
5. **Set the secrets** via `wrangler secret put` (or `--secrets-file` on the first deploy — see `deploy-runbook.md`).
6. **Cover the residual doors.** Enable Access on the `workers.dev` hostname and on preview URLs too, or `/api/admin/*` stays reachable there. The Worker-side verification is the backstop; belt and braces is the point.
7. **Verify the public surfaces are untouched** — `/`, `ops.`, and `POST /api/poll/votes` must all answer without login. There are tests for this (`src/server.test.ts`, "public routes stay public"), but confirm in a browser too.
8. **Reconsider `/admin` in `run_worker_first`.** It is currently omitted on purpose (the document leaks nothing and there was no Access to enforce). Once Access is bound, decide whether the Worker should render server-side session chrome for that route.

### Deviations from this checklist (2026-08-10)

Both were judgement calls made while executing it. Recorded rather than silently applied, because each contradicts an instruction above.

**1. The policy is an explicit email include, not "Cloudflare Account Member."**

Step 3 says *Allow → Cloudflare Account Member → this account*. An `email` include admits any login method for the same identity, where the account-member selector admits only one.

> **Superseded rationale, kept honest.** This deviation was originally justified by the break-glass path — a one-time PIN login is not a Cloudflare account member, so the account-member selector would have denied it. Deviation 3 below then removed one-time PIN from this application entirely, which makes that specific argument moot. The deviation still stands on the reason below, but it no longer rests on break-glass, and this note exists so nobody re-derives a rationale that has quietly expired.

It is also strictly tighter. "Account member" is a set that grows silently whenever a member is added; `patrick@bizmation.com` is the one address `access.ts` will accept anyway, so pinning it here makes the edge policy and the Worker allowlist agree by construction instead of by coincidence. Both IdPs are in `allowed_idps`, so the login page offers Cloudflare IdP *and* one-time PIN.

> The account currently has exactly one member, so the two selectors are equivalent **today**. They stop being equivalent the moment a second member is added — which is the case worth being correct about in advance.

**2. `path_cookie_attribute` is left OFF.**

The gotcha below recommends it, to keep the admin cookie off public apex requests. It was not set, because this application spans two disjoint path prefixes — `/admin*` and `/api/admin/*` — and a cookie scoped to the app path would not be sent to the other one. The admin SPA calling its own API would break. The gotcha appears to have been written assuming a single prefix; it is sound advice for that shape and wrong for this one.

**Also set, beyond the checklist:** `http_only_cookie_attribute: true`. Verified safe first — nothing under `src/` reads `document.cookie` or `CF_Authorization` client-side; `access.ts` reads the token server-side from the `Cookie` header, which HttpOnly does not affect. XSS can no longer exfiltrate a live session token.

**3. Cloudflare IdP only, with Instant Auth — one-time PIN removed from this application.**

Changed 2026-08-11, after Patrick loaded `/admin` and got a login page branded **King of the Floor**: its logo, its colours, "Private preview — enter with your invited email", and the footer "Long live the floor. · kingofthefloor.com". The heading did read *Log in to PML admin*, so the right application was always being used — the branding around it was the problem.

**The constraint that forces the workaround: `login_design` is organization-level.** Logo, header text, footer text and colours live on `/accounts/{id}/access/organizations` and nowhere else — confirmed against the OpenAPI spec, where no application endpoint accepts any of those fields. Every Access application in the Bizmation account therefore shares one login page, and that page is dressed for a different product. There is no per-application override to reach for.

So the page is skipped rather than restyled: `allowed_idps` narrowed to the Cloudflare IdP alone, plus `auto_redirect_to_identity: true`. With a single allowed IdP, Instant Auth sends the browser straight to Cloudflare sign-in and the shared chooser never renders. This touches only the PML application — King of the Floor's own login page is unchanged, which is why it was preferred over editing the org design.

> Instant Auth is a **client-side** redirect. `curl -L` still lands on the login page with a `200`, because the hop is JavaScript, not an HTTP `302`. Verify this one in a real browser; curl cannot tell you whether it works.

**The cost, stated plainly: PML admin no longer has a break-glass login.** Section "Decision: the identity provider" above still recommends one-time PIN as a second method against Cloudflare account lockout. That recommendation now applies to the account in general but **not** to this application. If the Cloudflare account login breaks, `/admin` is unreachable, and restoring it requires Cloudflare account access — the same credential that just failed. There is no Worker-side bypass in production: `ACCESS_DEV_BYPASS` is `.dev.vars`-only and additionally gated on a loopback hostname.

To restore break-glass, put the one-time PIN IdP back and drop Instant Auth (which is what makes the chooser reappear — the two go together):

```jsonc
// PUT /accounts/{account_id}/access/apps/b13e527e-4441-4940-b6dd-34e1809fd33d
"allowed_idps": [
  "77fd9a44-3b18-4fe2-8a9b-1167db2e3066",  // Cloudflare IdP
  "b26ffcb9-ddc5-48bb-a986-fb4efdb3e933"   // one-time PIN
],
"auto_redirect_to_identity": false
```

**The AUD is unchanged** by any of this (`0170fec1…79bb`), so the deployed `POLICY_AUD` secret stays valid and no redeploy is needed. Confirm that before and after any future edit to this application — a changed AUD locks the operator out until the secret is updated, with a 403 that deliberately explains nothing.

**Known asymmetry, not a deviation:** destinations name the apex hostname only, so `ops.predictionmarketlitigation.com/api/admin/*` is **not** edge-gated. Verified: it returns the Worker's own 403 rather than an Access redirect. That is the documented backstop working as designed, but if `ops.` should be edge-gated too, add its `/api/admin/*` to `destinations`.

---

### Gotchas worth knowing before you start

- **A payment method is required at Zero Trust onboarding even on the Free plan.** You will not be charged. Easy to trip over mid-setup.
- **Choose the team name before configuring anything** — every callback URL embeds `<team-name>.cloudflareaccess.com`.
- **Free tier covers 50 users**; one operator is 1 of 50. Service tokens and Bypass policies do not consume seats.
- **Break-glass:** a leaked JWT stays valid until `exp` even after the identity is removed in Zero Trust. To revoke immediately, rotate the `OPERATOR_EMAIL` secret and redeploy.
- **`path_cookie_attribute`** scopes the JWT cookie to the app path rather than the whole hostname — worth setting so the admin cookie is not sent on public apex requests.
- **Expired sessions return a 302 to the login page, not a 401**, for XHR. If that becomes a problem for admin fetches, Access's **Managed OAuth** option returns `401` + `WWW-Authenticate` for non-browser clients instead.
- **`self_hosted_domains` is deprecated** in the API in favour of `destinations`. Use `destinations` in any scripted setup.

---

## References

- [Validating the Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Application token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Self-hosted application prerequisites](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/)
- [Local dev tunnels](https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/)
- [Static assets: SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
