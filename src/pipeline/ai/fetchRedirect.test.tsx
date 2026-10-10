import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

export function sourceSetsRedirectError(source: string): boolean {
  return /redirect\s*:\s*["']error["']/.test(source);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("Workers fetch redirect mode", () => {
  it("detects a literal redirect error and ignores the legal modes", () => {
    expect(sourceSetsRedirectError('fetch(url, { redirect: "error" })')).toBe(
      true
    );
    expect(sourceSetsRedirectError("fetch(url, { redirect: 'error' })")).toBe(
      true
    );
    expect(sourceSetsRedirectError('fetch(url, { redirect: "manual" })')).toBe(
      false
    );
    expect(sourceSetsRedirectError('fetch(url, { redirect: "follow" })')).toBe(
      false
    );
  });

  it("fails if any non-test fetch in src sets redirect to error", () => {
    const offenders = walk("src").filter((file) => {
      if (/\.test\.tsx?$/.test(file)) return false;
      return sourceSetsRedirectError(readFileSync(file, "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});
