import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import type { Db } from "../../shared/db/client";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin, RunSummary } from "../../shared/schemas/run";
import { append } from "../projector/evidence";
import { evidenceId } from "../connectors/connector";
import {
  createWorkersAiProvider,
  type GatewayDeps,
  type LlmProvider
} from "../ai/gateway";
import {
  ensureRun,
  finishFailed,
  nextFreeRunId,
  packageDailyRun,
  reviewDailyRun
} from "./dailyRunSteps";
import { etCalendarDate, isRunTime } from "./schedule";

export type OperatorRunOrigin = Extract<RunOrigin, "manual" | "catch-up">;

export interface DailyRunParams {
  origin: RunOrigin;
  scheduledFor: string;
  /** Operator path pins the pre-inserted row so packaging cannot attach elsewhere. */
  runId?: string;
}

/** Narrow enough for tests to stub without a real Workflow binding. */
export interface DailyRunCreateBinding {
  create: (options: { params: DailyRunParams; id: string }) => Promise<unknown>;
}

export type StartOperatorRunInput = {
  origin: OperatorRunOrigin;
  scheduledFor: string;
  supersedePriorPublish?: boolean;
  now: Date;
};

export type StartOperatorRunResult =
  | { status: "started"; run: RunSummary }
  | { status: "conflict" }
  | { status: "supersede_required"; priorRunId: string }
  | { status: "workflow_unavailable"; run: RunSummary };

/**
 * Cron entry: only the noon-ET twin creates an instance. Duplicate `create`
 * (same-day retry, or a delayed twin) is a no-op — Workflow ids are unique
 * even after completion. Operator triggers use `startOperatorRun` (no ET guard,
 * never `daily-{date}`).
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

function operatorInstanceId(
  origin: OperatorRunOrigin,
  scheduledFor: string,
  runId: string
): string {
  return `${origin}-${scheduledFor}-${runId.slice(-4)}`;
}

/**
 * Story 3.12 — Access-gated operator start. Inserts the D1 `running` row
 * before `workflow.create` so `GET /api/runs` lists it immediately. Skips the
 * noon-ET guard. Same-date published Runs require `supersedePriorPublish`.
 */
export async function startOperatorRun(
  db: Db,
  workflow: DailyRunCreateBinding | undefined,
  input: StartOperatorRunInput
): Promise<StartOperatorRunResult> {
  const { origin, scheduledFor, now } = input;
  const existing = await runsRepo.listRunsForDate(db, scheduledFor);
  const sameOrigin = existing.find((run) => run.origin === origin);

  if (sameOrigin?.status === "running") {
    return { status: "started", run: sameOrigin };
  }
  if (sameOrigin?.status === "awaiting") {
    return { status: "conflict" };
  }
  if (
    existing.some(
      (run) =>
        run.origin !== origin &&
        (run.status === "running" || run.status === "awaiting")
    )
  ) {
    return { status: "conflict" };
  }

  const published = existing.find((run) => run.status === "published");
  if (published && input.supersedePriorPublish !== true) {
    return { status: "supersede_required", priorRunId: published.id };
  }

  const startedAt = now.toISOString();
  const id = nextFreeRunId(
    scheduledFor,
    origin,
    existing.map((run) => run.id)
  );
  let run: RunSummary;
  try {
    run = await runsRepo.insertRun(db, {
      id,
      origin,
      mode: "hitl",
      status: "running",
      startedAt,
      completedAt: null,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor
    });
  } catch {
    const raced = await runsRepo.findRunForDate(db, scheduledFor, origin);
    if (raced?.status === "running") {
      return { status: "started", run: raced };
    }
    throw new Error("operator_run_insert_failed");
  }

  try {
    if (published && input.supersedePriorPublish === true) {
      await append(db, {
        id: evidenceId(run.id, "run.superseded"),
        runId: run.id,
        event: "run.superseded",
        payload: { priorRunId: published.id },
        createdAt: startedAt
      });
    }
    if (!workflow) {
      throw new Error("workflow_unavailable");
    }
    await workflow.create({
      params: { origin, scheduledFor, runId: run.id },
      id: operatorInstanceId(origin, scheduledFor, run.id)
    });
  } catch {
    try {
      await finishFailed(db, run.id);
    } catch {
      // Best-effort: still mark the row failed so a cleanup throw cannot
      // leave a running orphan after insert-then-create failed.
      try {
        await runsRepo.completeRun(
          db,
          run.id,
          "failed",
          new Date().toISOString()
        );
      } catch {
        /* last resort — response still reports unavailable below */
      }
    }
    const failed =
      (await runsRepo.getRunById(db, run.id)) ?? {
        ...run,
        status: "failed" as const
      };
    return { status: "workflow_unavailable", run: failed };
  }

  return { status: "started", run };
}

export class DailyRunWorkflow extends WorkflowEntrypoint<Env, DailyRunParams> {
  async run(
    event: WorkflowEvent<DailyRunParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { origin, scheduledFor } = event.payload;
    const db = this.env.DB;

    const attached = await step.do("attach-run", () =>
      ensureRun(db, origin, scheduledFor, event.payload.runId)
    );
    const runId =
      typeof attached === "string" && attached.length > 0
        ? attached
        : (event.payload.runId ??
          (await runsRepo.findRunForDate(db, scheduledFor, origin))?.id);
    if (!runId) return;

    const packaged = await step.do("run-daily-step", () =>
      packageDailyRun(db, runId, gatewayDepsFromEnv(this.env, db))
    );

    if (packaged.skip) return;
    if (packaged.draftCount === 0) return;

    await step.do("draft-and-review", () =>
      reviewDailyRun(db, packaged, gatewayDepsFromEnv(this.env, db))
    );
  }
}
