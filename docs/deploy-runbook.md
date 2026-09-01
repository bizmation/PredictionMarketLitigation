# Deploy runbook

## PROJECT RULE — everything in-progress ships under `/preview/*`

**Adopted 2026-08-11 (Patrick). Applies until the stack is built; it is not a permanent architecture.**

The public root must be a stable landing page at all times. While Epics 2–4 are under construction, no half-built surface may occupy `/`.

| Path | Serves | Rule |
|---|---|---|
| `/` | The static landing page | **Always up.** Never replaced by a build artifact. Carries a "see our progress" link into `/preview/`. |
| `/preview/*` | The in-progress React app — apex tracker, `ops.`, admin | Everything we are building. Free to be empty, broken, or mid-migration. |
| `/api/*` | Worker routes | **Unchanged.** APIs keep their real paths — no `/preview` prefix. They are consumed by the preview app and must not need rewriting when it graduates. |

**Why the APIs are exempt.** Prefixing them would mean every fetch path changes again at launch, and `run_worker_first`, the Access application destinations, and `adminGuard`'s prefix matching would all need a second edit. The API contract is already the thing we want stable; only the *presentation* is provisional.

**Why not a staging environment.** Story 1.5 deliberately cut multi-environment for a solo operator, and that decision stands. `/preview` gives the same "look without being seen" benefit at a fraction of the setup, on the domain that already exists.

### The hazard this rule exists to prevent — and one that already happened

**2026-08-11: production and the repo diverged.** A static landing page was deployed to `/` from outside this working tree. `public/` in git contains only `favicon.ico`, so **any `npm run deploy` from the repo replaces that landing page with the SPA build** and the root goes back to being a construction site.

Until the rule below is implemented, treat `npm run deploy` as destructive to the landing page. Confirm what `/` serves before and after every deploy.

### What implementing this requires

1. **The landing page must live in the repo**, in `public/`, and be committed. A page that only exists on Cloudflare is one deploy away from gone, and cannot be reviewed. Recover the deployed HTML (`curl https://predictionmarketlitigation.com/ -o public/index.html`) before anything else overwrites it.
2. **`index.html` conflict.** Vite emits the SPA as `dist/client/index.html`, which currently lands at `/`. The landing page needs that slot, so the SPA's document has to be emitted or routed under `/preview/` instead.
3. **`not_found_handling: "single-page-application"` is now wrong at the root.** It makes *every* unmatched path serve the SPA shell. Under this rule, unmatched paths under `/preview/*` should serve the SPA shell, and unmatched paths elsewhere should not resolve to it.
4. **`resolveSurface` (`src/shared/lib/surface.ts`) reads the URL to choose apex / ops / admin.** It needs a base-path concept so `/preview/`, `/preview/admin` and the `ops.` host all still resolve correctly. Its tests pin the current behaviour and will need extending, not replacing.
5. **Access application destinations** currently name `/admin`, `/admin/*`, `/api/admin/*` on the apex host. If admin moves under `/preview/admin`, the Access app's `destinations` must move with it **or the admin surface silently loses its edge gate.** The Worker-side `requireOperator` still holds, but do not rely on the backstop alone — see `docs/access-runbook.md`.
6. **`run_worker_first` stays as-is.** `/api` and `/api/*` are unaffected; `/preview/*` is asset-served and must NOT be added, or every preview page becomes a billed Worker invocation.

> Item 5 is the one with teeth. Everything else fails visibly; that one fails by quietly serving an ungated admin path. Verify with `curl` against the real domain after any move — the test pool has no asset layer and no Access, so nothing local can catch it.



Story 1.5 shipped the configuration. This is the part that needs a Cloudflare account, in this order, because each step depends on the one before it.

> **Status: COMPLETE as of 2026-08-10.** The site is live on both domains, Access gates `/admin`, AC7 is verified, and step 5 (Workers Builds) was **dropped by decision** rather than left open — deploys are `npm run deploy` from the laptop, with the test gate moved into that script.
>
> The steps below are kept in full rather than deleted: they record *why* each setting is what it is, and the next environment (or the next project) reruns them from scratch. Each carries its own done-marker and the values it produced.

**Single environment.** Originally scoped for staging + production (per `architecture.md`'s early "dev/staging/prod" line); reconsidered 2026-08-10 — for a solo operator the real safety net is the human-in-the-loop approval queue (Epic 3), not environment isolation, and two environments doubled every step below. One Worker (`pml`), one D1 database, one Access application, one set of secrets, one Workers Builds connection. Nothing stops a later story from reintroducing a staging environment the same way it was built the first time, if it's ever actually needed.

Nothing here is automated on purpose: creating a database, binding a domain and provisioning secrets are one-time acts with real consequences, and a script that does them silently is worse than a checklist you read.

**Order matters.** Secrets cannot be set for a Worker that does not exist, and a custom domain cannot be bound without a zone. Working top to bottom avoids both dead ends.

---

## 0. Before you start

- The production branch is assumed to be `main`.
- Zero Trust onboarding **requires a payment method even on the Free plan.** You will not be charged, but it stops you mid-setup if you are not expecting it.
- Pick the Zero Trust **team name before** configuring any identity provider — every callback URL embeds `<team-name>.cloudflareaccess.com`.

---

## 1. D1 database

**Done — created 2026-08-10** via the Cloudflare D1 API. `wrangler.jsonc` already carries the real `database_id`; nothing left to do here.

```bash
# for reference — this is what ran, you don't need to run it again
npx wrangler d1 create pml
```

Story 2.1 now owns the F1 schema and seed. Migrations `0001`–`0004` were
applied to production D1 on 2026-08-31; `npm run migrate:remote` currently
reports no pending migration. Migration `0004` replaces available third-party
mirrors with verified official court/agency-hosted copies while preserving the
fixed August 9 snapshot.

---

## 2. Bind the custom domain

**Done — 2026-08-10.** Both domains bound automatically by the first `wrangler deploy`; no dashboard step was needed, because the `routes` entries in `wrangler.jsonc` declare them and the zone already existed. Cloudflare created the two proxied `AAAA` records itself (the zone had **zero** DNS records beforehand, so the pre-existing-CNAME gotcha below never applied).

Zone: `predictionmarketlitigation.com`, id `6721b40b2ed914e6364597852938e516`, status active.

> **Expect a propagation window.** Immediately after the deploy, apex returned `500` and `ops.` refused connections entirely. Both were transient — DNS and certificate provisioning settling, not a broken deploy. Roughly a minute later both served `200`. Do not start debugging the Worker on the strength of a verification run made seconds after the first deploy; re-run it before concluding anything.

Kept for reference, in case a domain ever needs binding by hand — in the dashboard: **Workers & Pages → pml → Settings → Domains & Routes → Add → Custom Domain**.

| Hostname | Surface |
|---|---|
| `predictionmarketlitigation.com` | apex — the litigation tracker |
| `ops.predictionmarketlitigation.com` | ops. — the governance record |

Prerequisites and gotchas:

- **An active zone in the account.** Custom Domains cannot be bound to a `workers.dev` hostname.
- **No pre-existing CNAME** on either hostname — "You cannot create a Custom Domain on a hostname with an existing CNAME DNS record". Delete it first.
- Cloudflare creates the DNS record and manages the certificate. Nothing to do by hand.
- **Wildcards do not work.** `www.` will not reach a Worker bound to the apex; it needs its own proxied record plus a redirect rule if you want it.

---

## 3. Create the Access application

**Done — 2026-08-10**, created via the Cloudflare API rather than the dashboard.

| | |
|---|---|
| Application | `PML admin`, id `b13e527e-4441-4940-b6dd-34e1809fd33d` |
| Destinations | `predictionmarketlitigation.com/admin`, `/admin/*`, `/api/admin/*` |
| Policy | `operator only` — allow, include email `patrick@bizmation.com` |
| IdPs allowed | Cloudflare IdP + one-time PIN (break-glass) |
| Session | 24h, `http_only_cookie_attribute: true` |

`docs/access-runbook.md` → "The 1.5 checklist" remains the reference for *why* each setting is what it is, and records two deliberate departures from its own original instructions (the policy selector and `path_cookie_attribute`). Read it before changing any of the above.

---

## 4. Set the secrets and deploy

**Done — 2026-08-10.** First deploy succeeded: Worker `pml`, version `44d951f2-a214-4b83-86bb-040041c7923d`, both custom domains attached, all four secrets uploaded, `ChatAgent` DO migration `v1` applied. Bindings reported on upload were exactly `ChatAgent`, `DB (pml)`, `AI` plus the four secrets.

**Wrangler auth is a separate credential path from the Cloudflare MCP tools.** This cost a previous session its whole attempt: the MCP tools were authenticated and could create the D1 database, but `wrangler` still reported "not authenticated" because it reads `CLOUDFLARE_API_TOKEN` or its own `wrangler login` config and knows nothing about an MCP OAuth session. Resolved with `npx wrangler login` (OAuth, creds in `%APPDATA%\xdg.config\.wrangler\config\default.toml`, account Bizmation `86e17509826e809459ca9f0725363c16`).

The Worker doesn't exist as a deployed entity until this step, and secrets can't be set on a Worker that doesn't exist yet — `wrangler secret put` against an undeployed Worker fails with API error **10007**. Upload the secrets *with* the first deploy instead:

> **Always rebuild immediately before deploying or dry-running.** A stale `dist/` makes `wrangler deploy --dry-run` silently omit missing-binding warnings instead of catching them — during this story's own implementation it reported bindings for the wrong target with no error at all. The command below rebuilds first; if you ever run a dry-run on its own to sanity-check something, rebuild right before that too.

```bash
# .env — gitignored (.env* is already in .gitignore). NEVER commit this.
npx vite build
npx wrangler deploy --secrets-file .env
```

Secrets survive later deploys, so after this bootstrap, Workers Builds can run a plain `wrangler deploy` forever.

**The secrets it needs** (see `docs/access-runbook.md` for what they mean):

| Name | Notes |
|---|---|
| `TEAM_DOMAIN` | `https://<team-name>.cloudflareaccess.com` |
| `POLICY_AUD` | from the Access application's AUD tag (step 3) |
| `OPERATOR_EMAIL` | the single authorized identity |
| `OPERATOR_DISPLAY_NAME` | public-safe name; defaults to `Patrick` if unset |

`ACCESS_DEV_BYPASS` belongs in **`.dev.vars` only** and must never appear in a Wrangler config or a secrets file. `src/shared/lib/wranglerConfig.test.tsx` fails if it does.

---

## 5. ~~Connect Workers Builds~~ — DROPPED (Patrick, 2026-08-10)

**Decision: no CI/CD. Deploys are `npm run deploy` from the laptop.** This supersedes `architecture.md:262`'s LOCKED "Workers Builds (GitHub) → production", the same way the single-environment revision superseded its "dev/staging/prod" line.

**Why.** For a solo operator, Workers Builds' automation buys little and costs a second deploy path. Worse, it deploys from GitHub's `main` rather than the working tree — and at the moment this was decided, `origin/main` sat **11 commits behind local**, missing `d64836f`, the fix for the critical `/agents/*` authentication bypass. A Builds connection made that day would have deployed the *vulnerable* build over the fixed one, automatically, on a schedule nobody was watching. Deploying from the laptop means you ship the tree you can see.

**What was genuinely lost, and how it was replaced.** Builds was going to be the only place `npm test` ran before a deploy — the whole reason its Build command was `npm run build && npm test`. The `deploy` script was therefore changed to carry the gate itself:

```jsonc
"deploy": "vite build && vitest run && wrangler deploy"
```

The order is load-bearing. `vite build` creates `dist/client`; **only then** does AC6's client-bundle secret scan stop `skipIf`-ing itself and actually scan (`src/shared/lib/wranglerConfig.test.tsx`). Build → test → deploy is the sequence that makes the scan gate anything. A non-zero exit from `vitest run` stops the deploy, which is what Builds' non-zero-exit behavior would have given us.

**Do not "simplify" `deploy` back to `vite build && wrangler deploy`.** That is what it was before, and in that form nothing verified the bundle carried no secrets — the gate existed only in a Workers Builds config that was never connected.

If CI is ever wanted after all, the settings that were worked out are: root `/`, build `npm run build && npm test`, deploy `npx wrangler deploy`, branch `main`, **"Builds for non-production branches" OFF** (it mints preview URLs, the exact surface `workers_dev: false` / `preview_urls: false` removes). Builds runs `npm clean-install`, so the lockfile must stay in sync — `npm ci` exits 0 today. **Push `main` first**: connecting Builds while the remote is behind is the failure described above.

---

## 6. Verify (this closes AC7)

**Run 2026-08-10 — all ten checks pass. AC7 satisfied.** Expected statuses below are the *observed* ones, corrected from what this section originally guessed.

```bash
A=https://predictionmarketlitigation.com
O=https://ops.predictionmarketlitigation.com

curl -s -o /dev/null -w "%{http_code}\n" $A/              # 200  apex shell
curl -s -o /dev/null -w "%{http_code}\n" $O/              # 200  ops shell
curl -s -o /dev/null -w "%{http_code}\n" $A/admin         # 302  -> Access login
curl -s -o /dev/null -w "%{http_code}\n" $A/api/admin/x   # 302  Access, NOT 403 — see below
curl -s -o /dev/null -w "%{http_code}\n" $O/api/admin/x   # 403  Worker guard — see below
curl -s $A/agents/x                                       # 403  {"code":"forbidden",...}
curl -s $O/agents/x                                       # 403  {"code":"forbidden",...}
curl -s -o /dev/null -w "%{http_code}\n" $A/nonexistent   # 200  SPA fallback, public
curl -s -o /dev/null -w "%{http_code}\n" https://pml.patrick-86e.workers.dev/  # 404 — door shut
```

**`/api/admin/*` on the apex answers 302, not 403.** This section originally expected the Worker's `forbidden` envelope. Once the Access application exists, Access intercepts at the edge and the request never reaches the Worker. Denial still holds — more strongly, in fact. Do not "fix" this back to a 403 expectation.

**`/api/admin/*` on `ops.` answers 403, from the Worker.** The Access application's destinations name only the apex hostname, so `ops.` admin paths are protected by the Worker-side guard alone, while apex admin is double-gated. This is precisely the residual-door case `src/shared/lib/access.ts`'s header comment exists for, and it is working — but the asymmetry is deliberate-by-omission rather than designed. If `ops.` should also be edge-gated, add `ops.predictionmarketlitigation.com/api/admin/*` to the application's destinations.

**The `%zz` bypass regression cannot be exercised in production.** `curl "$A/agents/chat-agent/%zz"` returns Cloudflare's own `400 Bad Request` from the edge, before the Worker runs. That 400 is **not** evidence that the `normalizePath` fail-closed fix works. The evidence for that fix is `adminGuard.test.ts` and `server.test.ts`, which exercise the real fetch handler directly.

Then in a browser, signed in as the operator: `/admin` loads, and the public surfaces still load in a private window with no login.

---

## Record the values as they land

All resolved 2026-08-10 by reading the live account, not by hand-transcription.

| Value | Where it goes | Status |
|---|---|---|
| `pml` database id | `wrangler.jsonc` | ☑ `d07713fe-d0f1-4708-a174-394b04fc01b9` |
| Zero Trust team name | this file | ☑ `bizmation` (org display name is "King of the Floor"; the **auth domain** is what matters) |
| `TEAM_DOMAIN` | secret | ☑ `https://bizmation.cloudflareaccess.com` |
| `POLICY_AUD` | secret | ☑ `0170fec17ba3f12af09260df14ffc4af237f7b85ae99577be57bd7bf637779bb` |
| `OPERATOR_EMAIL` | secret | ☑ `patrick@bizmation.com` |
| `OPERATOR_DISPLAY_NAME` | secret | ☑ `Patrick` |
| Account | — | ☑ Bizmation `86e17509826e809459ca9f0725363c16` |
| Zone id | — | ☑ `6721b40b2ed914e6364597852938e516` |
| Access app id | — | ☑ `b13e527e-4441-4940-b6dd-34e1809fd33d` |
| workers.dev subdomain | residual-door check | ☑ `patrick-86e` (so the dead hostname is `pml.patrick-86e.workers.dev`) |

These live in `.env` (gitignored via `.gitignore:248`; **this repo is public**). None of them is a credential — `POLICY_AUD` is an audience identifier that appears in every issued token, `TEAM_DOMAIN` is a public hostname — but they stay out of git regardless, because `--secrets-file` wants them in one place and that place should never be a tracked file.

**`OPERATOR_EMAIL` is not a free choice.** It must equal the email the Cloudflare IdP puts in the JWT `email` claim, which is the Cloudflare account member's address. The account has exactly one member, `patrick@bizmation.com`, and that is also the identity `wrangler login` authenticated as. A different address here would 403 the operator out of their own admin surface with no diagnostic.

---

## Environment matrix

| Environment | Worker | D1 | Domains | Deploy |
|---|---|---|---|---|
| local | — (miniflare, `--local`) | `pml` | `localhost:5173` | `npm run dev` |
| production | `pml` | `pml` | apex + `ops.` | `npm run deploy` |

Single environment, single Worker name (`pml`) throughout — there is no `-production` suffix because there is nothing else to disambiguate from.
