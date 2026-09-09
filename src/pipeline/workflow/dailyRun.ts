import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
import {
  ensureRun,
  finishAwaiting,
  finishEmpty,
  finishFailed,
  monitorAndPackage
} from "./dailyRunSteps";
import { isRunTime } from "./schedule";

export interface DailyRunParams {
  origin: RunOrigin;
  scheduledFor: string;
}

export class DailyRunWorkflow extends WorkflowEntrypoint<Env, DailyRunParams> {
  async run(
    event: WorkflowEvent<DailyRunParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { origin, scheduledFor } = event.payload;
    const db = this.env.DB;

    await step.do("attach-run", () => {
      if (origin === "scheduled" && !isRunTime()) return Promise.resolve();
      return ensureRun(db, origin, scheduledFor);
    });
    await step.do("run-daily-step", async () => {
      const run = await runsRepo.findRunForDate(db, scheduledFor, origin);
      if (!run || run.status !== "running") return;
      const { draftCount, anyFailure } = await monitorAndPackage(db, run.id);
      if (anyFailure) await finishFailed(db, run.id);
      else if (draftCount > 0) await finishAwaiting(db, run.id, draftCount);
      else await finishEmpty(db, run.id);
    });
  }
}
