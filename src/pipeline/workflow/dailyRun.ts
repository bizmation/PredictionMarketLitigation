import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import { defaultBudgetCents } from "../config/modelRoles";
import type { Db } from "../../shared/db/client";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import * as admission from "../../shared/db/repos/runAdmissionRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin, RunSummary } from "../../shared/schemas/run";
import { type SourceCheck } from "../connectors/connector";
import {
  COURTLISTENER_SOURCE_NAME,
  createCourtListenerCheck,
  firstFetchWindowDays,
  type CourtListenerWait
} from "../connectors/courtListener";
import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
import {
  ensureRun,
  nextFreeRunId,
  packageDailyRun,
  reviewDailyRun
} from "./dailyRunSteps";
import { etCalendarDate, isRunTime } from "./schedule";

export type OperatorRunOrigin = Extract<RunOrigin, "manual" | "catch-up">;

export interface DailyRunParams {
  origin: RunOrigin;
  scheduledFor: string;
  /** All new dispatches pin the admitted Run; optional only for legacy instances. */
  runId?: string;
}

/** Narrow enough for tests to stub without a real Workflow binding. */
export interface DailyRunCreateBinding {
  create: (options: { params: DailyRunParams; id: string }) => Promise<unknown>;
  get?: (id: string) => Promise<{ status: () => Promise<{ status: string }> }>;
}

export type StartOperatorRunInput = {
  origin: OperatorRunOrigin;
  scheduledFor: string;
  supersedePriorPublish?: boolean;
  /** Omission is a legacy one-shot/fresh request; retries must supply the same key. */
  requestId?: string;
  now: Date;
};

export type StartOperatorRunResult =
  | { status: "started"; run: RunSummary }
  | { status: "conflict" }
  | { status: "scheduled_duplicate"; run: RunSummary }
  | { status: "supersede_required"; priorRunId: string }
  | { status: "workflow_unavailable"; run: RunSummary }
  | {
      status: "dispatch_pending";
      run: RunSummary;
      dispatch: admission.Admission;
    };

/** Noon-ET twins share a durable scheduled request identity, independent of
 * date ownership. Even terminal scheduled retries inspect the original Run. */
export async function kickDailyRun(
  workflow: DailyRunCreateBinding | undefined,
  at: Date,
  db: Db
): Promise<StartOperatorRunResult | undefined> {
  if (!isRunTime(at)) return;
  return startRun(db, workflow, {
    origin: "scheduled",
    scheduledFor: etCalendarDate(at),
    now: at,
    requestId: `scheduled-${etCalendarDate(at)}`
  });
}

export function gatewayDepsFromEnv(
  env: Env,
  db: GatewayDeps["db"]
): GatewayDeps {
  // Empty registry (no AI binding, no OpenRouter secrets) →
  // gateway_not_configured; draftAndReview marks that Draft evals_not_run.
  return { db, providers: llmProvidersFromEnv(env) };
}

/**
 * Story 3.21 — the live connector registry, keyed on the exact source name
 * (3.17 makes names operator-editable; an unknown name falls back to
 * `stubCheck` → `"not wired"`). The token is a per-Worker secret typed as
 * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
 */
export function sourceChecksFromEnv(
  env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
    /** Tests inject an instant wait. Production leaves this unset. */
    courtListenerWait?: CourtListenerWait;
    /**
     * Tests pin the run instant. A date-only string is UTC midnight, which
     * is still the previous calendar date in America/New_York. Production
     * leaves this unset and uses the wall clock.
     */
    now?: () => string;
  },
  db: Db
): Record<string, SourceCheck> {
  return {
    [COURTLISTENER_SOURCE_NAME]: createCourtListenerCheck({
      db,
      token: env.COURTLISTENER_API_TOKEN,
      firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
      ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
      ...(env.now ? { now: env.now } : {})
    })
  };
}

/** Every retry inspects the same durable identity. A failed lookup proves nothing. */
export async function recoverRunDispatch(
  db: Db,
  workflow: DailyRunCreateBinding | undefined,
  runId: string,
  resolve = false
): Promise<StartOperatorRunResult> {
  let claim = await admission.get(db, runId);
  const run = await runsRepo.getRunById(db, runId);
  if (!claim || !run) return { status: "conflict" };
  if (resolve) {
    await admission.resolve(db, runId);
    return {
      status: "dispatch_pending",
      run: (await runsRepo.getRunById(db, runId))!,
      dispatch: (await admission.get(db, runId))!
    };
  }
  try {
    if (claim.released)
      return { status: "dispatch_pending", run, dispatch: claim };
    if (!workflow) {
      if (claim.state === "pending")
        await admission.record(db, runId, "unavailable");
      return { status: "workflow_unavailable", run };
    }
    let accepted = false;
    if (await admission.claimSubmission(db, runId)) {
      try {
        await workflow.create({
          id: claim.instance_id,
          params: {
            origin: run.origin,
            scheduledFor: claim.scheduled_for,
            runId
          }
        });
        accepted = true;
      } catch {
        /* Positive inspection below is the only duplicate confirmation. */
      }
    }
    let observed: string | null = null;
    try {
      observed =
        (await (await workflow.get?.(claim.instance_id))?.status())?.status ??
        null;
    } catch {
      /* Unknown is retained. */
    }
    const known = [
      "queued",
      "running",
      "paused",
      "waiting",
      "waitingForPause",
      "complete",
      "errored",
      "terminated"
    ];
    if (observed && known.includes(observed)) {
      await admission.record(db, runId, "confirmed", observed);
    } else if (accepted && observed === null && !workflow.get) {
      await admission.record(db, runId, "confirmed", "queued");
    } else await admission.record(db, runId, "uncertain");
    claim = (await admission.get(db, runId))!;
    const actualRun = (await runsRepo.getRunById(db, runId))!;
    const confirmedThisAttempt =
      (observed !== null && known.includes(observed)) ||
      (accepted && observed === null && !workflow.get);
    if (
      confirmedThisAttempt &&
      !claim.released &&
      claim.state === "confirmed" &&
      !claim.finished &&
      ["queued", "running", "waiting"].includes(claim.instance_status ?? "")
    )
      return { status: "started", run: actualRun };
    return {
      status: "dispatch_pending",
      run: actualRun,
      dispatch: claim
    };
  } catch {
    // A receipt failure is never success. Keep the identified durable intent
    // inspectable even if the database remains unavailable during this response.
    const durable = await admission.get(db, runId).catch(() => claim);
    const actualRun = await runsRepo.getRunById(db, runId).catch(() => run);
    return {
      status: "dispatch_pending",
      run: actualRun ?? run,
      dispatch: durable ?? claim
    };
  }
}
export async function startOperatorRun(
  db: Db,
  workflow: DailyRunCreateBinding | undefined,
  input: StartOperatorRunInput
): Promise<StartOperatorRunResult> {
  return startRun(db, workflow, input);
}
async function startRun(
  db: Db,
  workflow: DailyRunCreateBinding | undefined,
  input: Omit<StartOperatorRunInput, "origin"> & { origin: RunOrigin }
): Promise<StartOperatorRunResult> {
  const { origin, scheduledFor, now } = input;
  const requestId =
    origin === "scheduled"
      ? `internal:scheduled:${scheduledFor}`
      : `operator:${input.requestId ?? crypto.randomUUID()}`;
  const retry = await admission.byRequest(db, requestId);
  if (retry) {
    const run = await runsRepo.getRunById(db, retry.run_id);
    if (run?.origin !== origin || retry.scheduled_for !== scheduledFor)
      return { status: "conflict" };
    return recoverRunDispatch(db, workflow, retry.run_id);
  }
  const existing = await runsRepo.listRunsForDate(db, scheduledFor);
  if (origin === "scheduled") {
    const legacy = existing.find((r) => r.origin === "scheduled");
    if (legacy) return { status: "scheduled_duplicate", run: legacy };
  }
  const published = existing.find((r) => r.status === "published");
  if (published && !input.supersedePriorPublish)
    return { status: "supersede_required", priorRunId: published.id };
  const id = nextFreeRunId(
    scheduledFor,
    origin,
    existing.map((r) => r.id)
  );
  const live = await modeRepo.get(db);
  const budgetCents = await defaultBudgetCents(db);
  try {
    await admission.admit(
      db,
      {
        id,
        origin,
        scheduledFor,
        mode: live.mode,
        status: "running",
        startedAt: now.toISOString(),
        completedAt: null,
        spendCents: 0,
        spendCurrency: "USD",
        budgetCents
      },
      requestId,
      input.supersedePriorPublish === true,
      published?.id
    );
  } catch (error) {
    const raced = await admission.byRequest(db, requestId);
    if (raced) {
      const winner = await runsRepo.getRunById(db, raced.run_id);
      if (winner?.origin !== origin || raced.scheduled_for !== scheduledFor)
        return { status: "conflict" };
      return recoverRunDispatch(db, workflow, raced.run_id);
    }
    if (
      (await admission.active(db, scheduledFor)) ||
      (await runsRepo.listRunsForDate(db, scheduledFor)).some(
        (r) =>
          r.status === "running" ||
          r.status === "awaiting" ||
          (r.reservedCents ?? 0) > 0 ||
          (r.uncertainCents ?? 0) > 0 ||
          (r.accountingIssueCount ?? 0) > 0
      )
    )
      return { status: "conflict" };
    throw error;
  }
  return recoverRunDispatch(db, workflow, id);
}

export class DailyRunWorkflow extends WorkflowEntrypoint<Env, DailyRunParams> {
  protected sourceChecks(db: Db): Record<string, SourceCheck> {
    return sourceChecksFromEnv(this.env, db);
  }

  protected gatewayDeps(db: Db): GatewayDeps {
    return gatewayDepsFromEnv(this.env, db);
  }

  async run(
    event: WorkflowEvent<DailyRunParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { origin, scheduledFor } = event.payload;
    const db = this.env.DB;

    if (event.payload.runId) {
      const pinned = await runsRepo.getRunById(db, event.payload.runId);
      if (!pinned) throw new Error("attached_run_missing");
      if (pinned.origin !== origin || pinned.scheduledFor !== scheduledFor)
        throw new Error("attached_run_identity_mismatch");
    }
    const attached = await step.do("attach-run", () =>
      ensureRun(db, origin, scheduledFor, event.payload.runId, event.instanceId)
    );
    if (
      typeof attached !== "string" ||
      !/^run-[0-9]{8}-[0-9a-f]{4}$/.test(attached)
    ) {
      throw new Error("invalid_attached_run_identity");
    }
    const runId = attached;
    const run = await runsRepo.getRunById(db, runId);
    if (
      !run ||
      run.origin !== origin ||
      run.scheduledFor !== scheduledFor ||
      (event.payload.runId && event.payload.runId !== runId)
    ) {
      throw new Error("attached_run_identity_mismatch");
    }

    // This also runs when attach-run was cached before admission existed.
    const claim = await admission.get(db, runId);
    if (
      !event.payload.runId &&
      claim &&
      claim.request_id !== admission.legacyRequestId(runId)
    )
      throw new Error("run_admission_fenced");
    if (!claim || claim.request_id === admission.legacyRequestId(runId))
      await admission.attachLegacy(db, runId, event.instanceId);
    await admission.enter(db, runId);
    const packaged = await step.do("run-daily-step", () =>
      packageDailyRun(db, runId, this.gatewayDeps(db), this.sourceChecks(db))
    );

    if (packaged.skip) {
      await admission.finish(db, runId);
      return;
    }
    if (packaged.runId !== runId)
      throw new Error("packaged_run_identity_mismatch");
    if (packaged.draftCount === 0) {
      await admission.finish(db, runId);
      return;
    }

    await admission.assertOwned(db, runId);
    await step.do("draft-and-review", () =>
      reviewDailyRun(db, packaged, this.gatewayDeps(db))
    );
    await admission.finish(db, runId);
  }
}
