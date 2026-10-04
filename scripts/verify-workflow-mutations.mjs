import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = new URL("../src/pipeline/workflow/dailyRun.ts", import.meta.url);
const original = readFileSync(source, "utf8");
const suite = "src/pipeline/workflow/dailyRun.native.test.ts";
const mutations = [
  {
    name: "missing source registry forwarding",
    from: "packageDailyRun(db, runId, this.gatewayDeps(db), this.sourceChecks(db))",
    to: "packageDailyRun(db, runId, this.gatewayDeps(db))",
    assertion:
      "native material must persist a Draft from the forwarded registry"
  },
  {
    name: "missing Draft review dispatch",
    from: "reviewDailyRun(db, packaged, this.gatewayDeps(db))",
    to: "Promise.resolve()",
    assertion: "native review must persist completed evaluation"
  }
];
function restore() {
  writeFileSync(source, original);
}
// Also restore on ordinary interruption. SIGKILL cannot run a cleanup handler.
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
function run(focused) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      suite,
      "--reporter=verbose",
      ...(focused
        ? ["-t", "native material persists evaluated Draft and accounting"]
        : [])
    ],
    { cwd: root, encoding: "utf8", timeout: 120000 }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.error || result.signal)
    throw new Error(`Runtime failed: ${result.error ?? result.signal}`);
  return { status: result.status, output: stripVTControlCharacters(output) };
}
try {
  if (run(false).status !== 0)
    throw new Error("Baseline native suite must be green before mutation");
  for (const mutation of mutations) {
    if (original.split(mutation.from).length !== 2)
      throw new Error(`Mutation anchor is not unique: ${mutation.name}`);
    try {
      writeFileSync(source, original.replace(mutation.from, mutation.to));
      const result = run(true);
      if (
        result.status !== 1 ||
        !result.output.includes(`AssertionError: ${mutation.assertion}`)
      )
        throw new Error(
          `Expected persisted-behavior assertion was not detected: ${mutation.name}`
        );
      console.log(`EXPECTED FAILURE VERIFIED: ${mutation.name}`);
    } finally {
      restore();
    }
    if (readFileSync(source, "utf8") !== original)
      throw new Error("Source restoration mismatch");
    if (run(false).status !== 0)
      throw new Error(`Restored native suite failed after ${mutation.name}`);
    console.log(`RESTORED GREEN: ${mutation.name}`);
  }
} finally {
  restore();
}
