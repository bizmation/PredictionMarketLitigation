# Deploy runbook

Story 1.5 shipped the configuration. This is the part that needs a Cloudflare account — Patrick's to execute, in this order, because each step depends on the one before it.

Nothing here is automated on purpose: creating databases, binding domains and provisioning secrets are one-time acts with real consequences, and a script that does them silently is worse than a checklist you read.

**Order matters.** Secrets cannot be set for a Worker that does not exist, and a custom domain cannot be bound without a zone. Working top to bottom avoids both dead ends.

---

## 0. Before you start

- The production branch is assumed to be `main`.
- Zero Trust onboarding **requires a payment method even on the Free plan.** You will not be charged, but it stops you mid-setup if you are not expecting it.
- Pick the Zero Trust **team name before** configuring any identity provider — every callback URL embeds `<team-name>.cloudflareaccess.com`.

---

## 1. Create the D1 databases

```bash
npx wrangler d1 create pml-dev
npx wrangler d1 create pml-staging
npx wrangler d1 create pml-production
```

Each prints a `database_id`. Paste them into `wrangler.jsonc`, replacing the three `PLACEHOLDER-see-docs/deploy-runbook.md` values.

> **Do not delete a `d1_databases` block to make a deploy error go away.** Wrangler's automatic provisioning is on by default: a binding with no `database_id` makes it create a database and write the id back into your config — and when the deploy runs from Workers Builds, that write is not persisted to the repo. Production would silently drift from source.

The `database_name` sits next to the id deliberately, so a mismatched pair is visible on inspection. Copying the wrong environment's id is an invisible cross-environment write.

This story creates **no tables**. Schema and migrations are Story 2.1.

---

## 2. Bootstrap each environment with its secrets

Secrets are per-Worker-script, and `pml-staging` / `pml-production` do not exist until first deploy. `wrangler secret put --env staging` against an undeployed environment fails with API error **10007** — a genuine chicken-and-egg.

Upload the secrets *with* the first deploy instead:

```bash
# .env.staging / .env.production — gitignored (.env* is already in .gitignore).
# NEVER commit these.
npx cross-env CLOUDFLARE_ENV=staging vite build
npx wrangler deploy --env staging --secrets-file .env.staging

npx cross-env CLOUDFLARE_ENV=production vite build
npx wrangler deploy --env production --secrets-file .env.production
```

Secrets survive later deploys, so after this bootstrap Workers Builds can run a plain `wrangler deploy --env <env>` forever.

**The secrets each environment needs** (see `docs/access-runbook.md` for what they mean):

| Name | Notes |
|---|---|
| `TEAM_DOMAIN` | `https://<team-name>.cloudflareaccess.com` — same in both environments |
| `POLICY_AUD` | **different per environment** — see the warning below |
| `OPERATOR_EMAIL` | the single authorized identity |
| `OPERATOR_DISPLAY_NAME` | public-safe name; defaults to `Patrick` if unset |

> **`POLICY_AUD` must differ between staging and production.** The AUD tag is per Access application, and staging and production are two applications. Reusing one value means a staging-issued token authenticates against production.

`ACCESS_DEV_BYPASS` belongs in **`.dev.vars` only** and must never appear in a Wrangler config or a secrets file. `src/shared/lib/wranglerConfig.test.tsx` fails if it does.

---

## 3. Bind the custom domains

In the dashboard: **Workers & Pages → pml-production → Settings → Domains & Routes → Add → Custom Domain**. The `routes` entries in `wrangler.jsonc` declare them; the zone has to exist for the deploy to attach them.

| Environment | Hostnames |
|---|---|
| production | `predictionmarketlitigation.com`, `ops.predictionmarketlitigation.com` |
| staging | `staging.predictionmarketlitigation.com`, `ops-staging.predictionmarketlitigation.com` |

Prerequisites and gotchas:

- **An active zone in the account.** Custom Domains cannot be bound to a `workers.dev` hostname.
- **No pre-existing CNAME** on the hostname — "You cannot create a Custom Domain on a hostname with an existing CNAME DNS record". Delete it first.
- Cloudflare creates the DNS record and manages the certificate. Nothing to do by hand.
- **Wildcards do not work.** `www.` will not reach a Worker bound to the apex; it needs its own proxied record plus a redirect rule if you want it.
- Environment names land in public certificate-transparency logs — `staging.` is fine, anything revealing is not.

---

## 4. Connect Workers Builds

Workers Builds has **no environment concept**, so connect the repo once per environment-Worker. Both connections point at the same repo.

**Worker → Settings → Builds → Connect**, then:

| Setting | `pml-production` | `pml-staging` |
|---|---|---|
| Root directory | `/` | `/` |
| Build command | `CLOUDFLARE_ENV=production npm run build` | `CLOUDFLARE_ENV=staging npm run build` |
| Deploy command | `npx wrangler deploy --env production` | `npx wrangler deploy --env staging` |
| Branch | `main` | your staging branch |

**`CLOUDFLARE_ENV` at build time is not optional.** The Vite plugin resolves the environment during `vite build` and emits a flattened `dist/pml/wrangler.json`; `wrangler deploy --env` then validates the match. Setting `CLOUDFLARE_ENV` only on the deploy command has no effect, and the build would produce the wrong environment's config.

**Leave "Builds for non-production branches" OFF.** It mints preview URLs on every push — exactly the surface `workers_dev: false` / `preview_urls: false` exists to remove.

The dashboard Worker name must match the config's resolved name (`pml-staging`, `pml-production`) or the build fails.

Builds run `npm clean-install`, so the lockfile must be in sync. `npm ci` currently exits 0; keep it that way.

---

## 5. Create the Access application

Follow **`docs/access-runbook.md` → "The 1.5 checklist"**, which already carries the destination list, the policy, the AUD-tag step and the residual-door warning. It is not duplicated here.

The short version: two applications (staging and production), each with destinations `/admin`, `/admin/*` and `/api/admin/*` — the bare path *and* the wildcard, because a wildcard does not match its parent.

---

## 6. Verify (this closes AC7)

```bash
curl -sI https://predictionmarketlitigation.com/            # 200, apex shell
curl -sI https://ops.predictionmarketlitigation.com/        # 200, ops shell
curl -sI https://predictionmarketlitigation.com/admin       # Access challenge
curl -s  https://predictionmarketlitigation.com/api/admin/x # 403 {"code":"forbidden"}
curl -s  https://predictionmarketlitigation.com/agents/x    # 403 {"code":"forbidden"}
```

Then in a browser, signed in as the operator: `/admin` loads, and the public surfaces still load in a private window with no login.

Confirm the residual doors are shut:

```bash
curl -sI https://pml.<your-subdomain>.workers.dev/          # expect failure — workers_dev is false
```

Tick AC7 in `_bmad-output/implementation-artifacts/1-5-deploy-pipeline-environments.md` once all of the above hold. Until then it stays open — that is the intended state, not an oversight.

---

## Record the values as they land

| Value | Where it goes | Status |
|---|---|---|
| `pml-dev` database id | `wrangler.jsonc` | ☐ |
| `pml-staging` database id | `wrangler.jsonc` | ☐ |
| `pml-production` database id | `wrangler.jsonc` | ☐ |
| `TEAM_DOMAIN` | secret, both envs | ☐ |
| `POLICY_AUD` (staging) | secret | ☐ |
| `POLICY_AUD` (production) | secret | ☐ |
| `OPERATOR_EMAIL` | secret, both envs | ☐ |
| Zero Trust team name | this file | ☐ |

---

## Environment matrix

| Environment | Worker | D1 | Domains | Deploy |
|---|---|---|---|---|
| local | — (miniflare) | `pml-dev` (`--local`) | `localhost:5173` | `npm run dev` |
| staging | `pml-staging` | `pml-staging` | `staging.` + `ops-staging.` | `npm run deploy:staging` |
| production | `pml-production` | `pml-production` | apex + `ops.` | `npm run deploy:production` |

There is deliberately **no bare `npm run deploy`**. With named environments defined, an env-less `wrangler deploy` publishes a *third* Worker called `pml` with its own Durable Object namespace — agent state would fork from production's — and no D1 binding at all.
