import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
import {
  completeDailyStep,
  ensureRun,
  finishFailed,
  monitorAndPackage
} from "./dailyRunSteps";
import { etCalendarDate, isRunTime } from "./schedule";

export interface DailyRunParams {
  origin: RunOrigin;
  scheduledFor: string;
}

/** Narrow enough for tests to stub without a real Workflow binding. */
export interface DailyRunCreateBinding {
  create: (options: { params: DailyRunParams; id: string }) => Promise<unknown>;
}

/**
 * Cron entry: only the noon-ET twin creates an instance. Duplicate `create`
 * (same-day retry, or a delayed twin) is a no-op — Workflow ids are unique
 * even after completion.
 */
export async function kickDailyRun(
  workflow: DailyRunCreateBinding | undefined,
  at: Date
): Promise<void> {
  if (!workflow) return;
  if (!isRunTime(at)) return;
  const scheduledFor = etCalendarDate(at);
  try {
    await workflow.create({
      params: { origin: "scheduled", scheduledFor },
      id: `daily-${scheduledFor}`
    });
  } catch {
    // Instance id already used (completed or running). Same-day idempotent.
  }
}

export class DailyRunWorkflow extends WorkflowEntrypoint<Env, DailyRunParams> {
  async run(
    event: WorkflowEvent<DailyRunParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { origin, scheduledFor } = event.payload;
    const db = this.env.DB;

    await step.do("attach-run", () => ensureRun(db, origin, scheduledFor));
    await step.do("run-daily-step", async () => {
      const run = await runsRepo.findRunForDate(db, scheduledFor, origin);
      if (!run || run.status !== "running") return;
      try {
        const result = await monitorAndPackage(db, run.id);
        await completeDailyStep(db, run.id, result);
      } catch {
        await finishFailed(db, run.id);
      }
    });
  }
}
