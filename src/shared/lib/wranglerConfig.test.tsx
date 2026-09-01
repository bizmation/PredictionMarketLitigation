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
 * Wrangler config it becomes deployable — and this is a single-environment
 * config with a plain `deploy` script, so there is exactly one Worker for it
 * to reach: production, with the admin API wide open.
 */

const configs = ["wrangler.jsonc", "wrangler.test.jsonc"];

function readRunWorkerFirst(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const match = /"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(source);
  expect(match, `${file} must declare run_worker_first`).not.toBeNull();
  return JSON.parse(match![1]!) as string[];
}

function ruleMatches(rule: string, pathname: string): boolean {
  return rule.endsWith("/*")
    ? pathname.startsWith(rule.slice(0, -1))
    : pathname === rule;
}

describe("dev bypass cannot be deployed", () => {
  it.each(configs)("%s does not declare ACCESS_DEV_BYPASS", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("ACCESS_DEV_BYPASS");
  });

  it.each(configs)("%s declares no vars block at all", (file) => {
    // No code currently reads a Wrangler `vars` value (the single-environment
    // config has nothing left to distinguish via one). The invariant that
    // matters: nothing dev-only or secret-shaped can become deployable, and
    // the simplest version of that is "there is no vars block to smuggle
    // anything into" — narrow this again, deliberately, the day something
    // legitimately needs one.
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/"vars"\s*:/);
  });

  it(".dev.vars is gitignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore).toMatch(/^\.dev\.vars\*?$/m);
  });
});

describe("worker-first route parity", () => {
  it("keeps production and test routing rules identical", () => {
    expect(readRunWorkerFirst("wrangler.test.jsonc")).toEqual(
      readRunWorkerFirst("wrangler.jsonc")
    );
  });

  it.each(["/api", "/api/circuits", "/api/admin/session", "/oauth"])(
    "routes %s through the Worker before assets",
    (pathname) => {
      const rules = readRunWorkerFirst("wrangler.jsonc");
      expect(rules.some((rule) => ruleMatches(rule, pathname))).toBe(true);
    }
  );

  it("does not route /geo static assets through the Worker", () => {
    const rules = readRunWorkerFirst("wrangler.jsonc");
    expect(
      rules.some((rule) => ruleMatches(rule, "/geo/states-10m.json"))
    ).toBe(false);
  });
});

/**
 * Story 1.5 — access.ts verifies the Access JWT itself precisely because
 * workers_dev and preview URLs are doors Access at the edge does not cover;
 * the cheapest fix is for those doors not to exist. Nothing else in this
 * file (or anywhere in src/) previously asserted these two keys survive —
 * a well-meaning edit could drop either line and every other test would
 * stay green.
 *
 * wrangler.jsonc only: wrangler.test.jsonc is never deployed (workers pool
 * test config only), so these settings don't apply to it.
 */
describe("no residual public hostnames", () => {
  it("wrangler.jsonc disables workers_dev and preview_urls", () => {
    const source = readFileSync("wrangler.jsonc", "utf8");
    expect(source).toMatch(/"workers_dev"\s*:\s*false/);
    expect(source).toMatch(/"preview_urls"\s*:\s*false/);
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
// existsSync alone would pass vacuously on an interrupted/empty build,
// scanning nothing and reporting a clean bundle that was never checked.
const hasBuild = existsSync(distClient) && readdirSync(distClient).length > 0;

const distPmlConfig = "dist/pml/wrangler.json";
const hasServerBuild = existsSync(distPmlConfig);

const FORBIDDEN_ACCESS_CONFIG = [
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

function findOffenders(dir: string, needle: string): string[] {
  return walk(dir).filter((file) => {
    try {
      return readFileSync(file, "utf8").includes(needle);
    } catch {
      return false; // binary asset
    }
  });
}

describe.skipIf(!hasBuild)("no Access config reaches the client bundle", () => {
  it.each(FORBIDDEN_ACCESS_CONFIG)("no bundled file mentions %s", (needle) => {
    expect(findOffenders(distClient, needle)).toEqual([]);
  });
});

if (!hasBuild) {
  // eslint-disable-next-line no-console
  console.warn(
    `[wranglerConfig.test] skipped bundle scan: ${distClient} absent. Run \`npm run build\` first for the full check.`
  );
}

/**
 * vite.config.ts drops the `ai` binding in serve mode only (tokenless local
 * dev). README and vite.config.ts's own comment both claimed "a test pins"
 * that `vite build` leaves it in `dist/pml/wrangler.json` — no such test
 * existed. This is that test: silently shipping a Worker with no AI binding
 * is the obvious way this regresses.
 */
describe.skipIf(!hasServerBuild)(
  "the built server config still declares the ai binding",
  () => {
    it("dist/pml/wrangler.json contains an ai binding", () => {
      const config = JSON.parse(readFileSync(distPmlConfig, "utf8"));
      expect(config.ai).toBeDefined();
      expect(config.ai.binding).toBe("AI");
    });
  }
);

if (!hasServerBuild) {
  // eslint-disable-next-line no-console
  console.warn(
    `[wranglerConfig.test] skipped ai-binding check: ${distPmlConfig} absent. Run \`npm run build\` first for the full check.`
  );
}
