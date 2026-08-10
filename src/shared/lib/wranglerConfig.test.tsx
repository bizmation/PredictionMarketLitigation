import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Config invariants for the dev bypass (story 1.4, AC7).
 *
 * Named `.test.tsx` despite containing no JSX so it lands in the "ui" Vitest
 * project, which runs in plain node and can read the filesystem. The "workers"
 * project runs inside workerd, where there is no fs.
 *
 * The point: ACCESS_DEV_BYPASS must exist ONLY in .dev.vars, which is
 * gitignored and read only by `wrangler dev`. The moment it appears in a
 * Wrangler config it becomes deployable — and `npm run deploy` is a bare
 * `wrangler deploy` with no --env, so a top-level var would ship straight to
 * production with the admin API wide open.
 */

const configs = ["wrangler.jsonc", "wrangler.test.jsonc"];

describe("dev bypass cannot be deployed", () => {
  it.each(configs)("%s does not declare ACCESS_DEV_BYPASS", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("ACCESS_DEV_BYPASS");
  });

  it.each(configs)("%s declares only allowlisted vars", (file) => {
    // Story 1.5 added per-environment `vars` blocks, so the original "no vars
    // at all" assertion was narrowed rather than deleted — the invariant that
    // matters is that no dev-only or secret-shaped value becomes deployable.
    // Adding a var means deciding, deliberately, that it is safe in production.
    const allowed = new Set(["PML_ENV"]);
    const source = readFileSync(file, "utf8");

    const varsBlocks = source.matchAll(/"vars"\s*:\s*\{([^}]*)\}/g);
    for (const [, body] of varsBlocks) {
      for (const [, key] of body.matchAll(/"([^"]+)"\s*:/g)) {
        expect(allowed, `${file} declares unexpected var "${key}"`).toContain(
          key
        );
      }
    }
  });

  it(".dev.vars is gitignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore).toMatch(/^\.dev\.vars\*?$/m);
  });
});

/**
 * Story 1.5, AC6 — replaces the one-time manual `grep dist/` recorded in
 * Story 1.4's completion notes with something that actually runs.
 *
 * Skips when there is no build output rather than failing: a fresh clone has
 * no `dist/`, and a test that fails on a clean checkout gets deleted by the
 * next person who hits it. `npm run build && npm test` is the full-fidelity
 * check — documented in the README.
 */
const distClient = "dist/client";
const hasBuild = existsSync(distClient);

describe.skipIf(!hasBuild)("no Access config reaches the client bundle", () => {
  const forbidden = [
    "TEAM_DOMAIN",
    "POLICY_AUD",
    "OPERATOR_EMAIL",
    "ACCESS_DEV_BYPASS",
    "cloudflareaccess"
  ];

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = `${dir}/${entry.name}`;
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  it.each(forbidden)("no bundled file mentions %s", (needle) => {
    const offenders = walk(distClient).filter((file) => {
      try {
        return readFileSync(file, "utf8").includes(needle);
      } catch {
        return false; // binary asset
      }
    });
    expect(offenders).toEqual([]);
  });
});

if (!hasBuild) {
  // eslint-disable-next-line no-console
  console.warn(
    `[wranglerConfig.test] skipped bundle scan: ${distClient} absent. Run \`npm run build\` first for the full check.`
  );
}
