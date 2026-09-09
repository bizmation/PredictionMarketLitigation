import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import { ensureRun, finishEmpty, runIdFor } from "./dailyRunSteps";
import { isRunTime, nextRunAtUtc, timezoneOffsetMs } from "./schedule";

const testEnv = env as Env;

describe("schedule (story 3.3)", () => {
  it("derives a UTC offset in the America/New_York zone", () => {
    // Noon ET on 2026-01-15 is 17:00Z (EST, -5h).
    const jan = new Date("2026-01-15T17:00:00.000Z");
    expect(timezoneOffsetMs(jan)).toBe(-5 * 3_600_000);
    // Noon ET on 2026-07-15 is 16:00Z (EDT, -4h).
    const jul = new Date("2026-07-15T16:00:00.000Z");
    expect(timezoneOffsetMs(jul)).toBe(-4 * 3_600_000);
  });

  it("computes the next noon-ET instant strictly after now, DST-correct", () => {
    const beforeNoonUtc = new Date("2026-01-15T16:00:00.000Z"); // 11:00 ET
    expect(nextRunAtUtc(beforeNoonUtc)).toBe("2026-01-15T17:00:00.000Z");
    const afterNoonUtc = new Date("2026-01-15T18:00:00.000Z"); // 13:00 ET
    expect(nextRunAtUtc(afterNoonUtc)).toBe("2026-01-16T17:00:00.000Z");
  });

  it("the ET-hour guard fires only at noon ET", () => {
    expect(isRunTime(new Date("2026-01-15T17:00:00.000Z"))).toBe(true); // noon ET
    expect(isRunTime(new Date("2026-01-15T18:00:00.000Z"))).toBe(false); // 1pm ET
    expect(isRunTime(new Date("2026-07-15T16:00:00.000Z"))).toBe(true); // noon EDT
  });
});

describe("daily run (story 3.3)", () => {
  const date = "2026-09-08";

  it("creates a scheduled Run with run.started evidence, then completes it empty", async () => {
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.origin).toBe("scheduled");
    expect(run?.status).toBe("running");
    expect(run?.scheduledFor).toBe(date);

    await finishEmpty(testEnv.DB, id);
    const done = await runsRepo.getRunById(testEnv.DB, id);
    expect(done?.status).toBe("empty");

    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.map((e) => e.event)).toEqual(["run.started", "run.empty"]);
    expect(evidence[1]?.payload).toEqual({ drafts: 0 });
  });

  it("is idempotent: a second ensure for the same day returns the existing Run", async () => {
    await ensureRun(testEnv.DB, "scheduled", date);
    await ensureRun(testEnv.DB, "scheduled", date);
    const matches = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM runs WHERE scheduled_for = ? AND origin = 'scheduled'"
    )
      .bind(date)
      .first<{ n: number }>();
    expect(matches?.n).toBe(1);
  });

  it("records a catch-up (origin) Run alongside, never replacing the day's record", async () => {
    await ensureRun(testEnv.DB, "catch-up", date);
    const matches = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM runs WHERE scheduled_for = ?"
    )
      .bind(date)
      .first<{ n: number }>();
    // scheduled + catch-up for the same calendar date.
    expect(matches?.n).toBe(2);
  });

  it("resumes an awaiting Run under the same id (no new Run, no duplicate start)", async () => {
    // Mark the scheduled run awaiting, then ensure again — it must not re-create.
    const id = runIdFor(date, "scheduled");
    await testEnv.DB.prepare(
      "UPDATE runs SET status = 'awaiting', completed_at = NULL WHERE id = ?"
    )
      .bind(id)
      .run();
    await ensureRun(testEnv.DB, "scheduled", date);
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.filter((e) => e.event === "run.started")).toHaveLength(1);
  });

  it("does not complete a non-running Run (terminal stays terminal)", async () => {
    const id = runIdFor(date, "scheduled");
    await finishEmpty(testEnv.DB, id); // already empty → no-op, no extra evidence
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    const emptyCount = evidence.filter((e) => e.event === "run.empty").length;
    expect(emptyCount).toBe(1);
  });
});
