import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
import {
  createWorkersAiProvider,
  type GatewayDeps,
  type LlmProvider
} from "../ai/gateway";
import {
  afterPackaging,
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

function gatewayDepsFromEnv(env: Env, db: GatewayDeps["db"]): GatewayDeps {
  // Tests omit the AI binding; complete() then throws gateway_not_configured
  // and draftAndReview marks that Draft evals_not_run (per-Draft catch).
  return {
    db,
    provider: createWorkersAiProvider(env) as LlmProvider
  };
}

export class DailyRunWorkflow extends WorkflowEntrypoint<Env, DailyRunParams> {
  async run(
    event: WorkflowEvent<DailyRunParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { origin, scheduledFor } = event.payload;
    const db = this.env.DB;

    await step.do("attach-run", () => ensureRun(db, origin, scheduledFor));

    const packaged = await step.do("run-daily-step", async () => {
      const run = await runsRepo.findRunForDate(db, scheduledFor, origin);
      if (!run || run.status !== "running") {
        return { skip: true as const };
      }
      try {
        const result = await monitorAndPackage(db, run.id);
        if (result.draftCount === 0) {
          await afterPackaging(
            db,
            run.id,
            result,
            gatewayDepsFromEnv(this.env, db)
          );
        }
        return {
          skip: false as const,
          runId: run.id,
          draftCount: result.draftCount,
          anyFailure: result.anyFailure
        };
      } catch {
        await finishFailed(db, run.id);
        return { skip: true as const };
      }
    });

    if (packaged.skip) return;
    if (packaged.draftCount === 0) return;

    await step.do("draft-and-review", async () => {
      try {
        await afterPackaging(
          db,
          packaged.runId,
          {
            draftCount: packaged.draftCount,
            anyFailure: packaged.anyFailure
          },
          gatewayDepsFromEnv(this.env, db)
        );
      } catch {
        await finishFailed(db, packaged.runId);
      }
    });
  }
}
