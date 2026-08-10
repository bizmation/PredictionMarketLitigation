import { readFileSync } from "node:fs";
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

  it.each(configs)("%s declares no vars block at all", (file) => {
    // Nothing needs one yet. If a future story adds vars, this test should be
    // narrowed rather than deleted — the invariant that matters is that the
    // bypass never becomes a deployable value.
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/^\s*"vars"\s*:/m);
  });

  it(".dev.vars is gitignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore).toMatch(/^\.dev\.vars\*?$/m);
  });
});
