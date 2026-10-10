import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("Workers fetch redirect mode", () => {
  it("fails if any non-test fetch in src sets redirect to error", () => {
    const offenders = walk("src").filter((file) => {
      if (/\.test\.tsx?$/.test(file)) return false;
      try {
        return /redirect\s*:\s*["']error["']/.test(readFileSync(file, "utf8"));
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });
});
