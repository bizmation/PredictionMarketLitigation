import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { EvalSummary } from "../../shared/schemas/run";
import type { GatewayDeps, LlmProvider } from "../ai/gateway";
import { completeDailyStep } from "../workflow/dailyRunSteps";
import {
  AUTO_APPROVE_CONFIDENCE_THRESHOLD,
  buildScopedPrompt,
  draftAndReview
} from "./draftAndReview";

/**
 * Story 3.5 — drafter/reviewer I/O matrix, run against Miniflare D1 with a
 * fake LlmProvider (same seam as gateway.test.ts).
 */

const testEnv = env as Env;
const NOW = "2026-09-08T16:00:00.000Z";
const SHELL_BODY = "Packaging shell for Nevada.";
const SHELL_DIFF = { operationalStatus: { from: "go", to: "restricted" } };
const DRAFTER_BODY = "Drafter: Nevada operationalStatus flipped to restricted.";
const DRAFTER_DIFF = {
  operationalStatus: { from: "go", to: "restricted" }
};

let runSeq = 0xc00;
function newRunId(): string {
  runSeq += 1;
  return `run-20260908-${runSeq.toString(16).padStart(4, "0")}`;
}

let idSeq = 0;
const deterministicNewId = () => `eval-id-${++idSeq}`;

const OK_REVIEW = {
  confidence: 72,
  citationCompleteness: 90,
  notes: "Tier-1 docket event supports the operationalStatus change.",
  disagrees: false,
  disagreement: ""
};

const FLAGGED_REVIEW = {
  confidence: 40,
  citationCompleteness: 30,
  notes: "Drafter overstates the holding.",
  disagrees: true,
  disagreement: "Reviewer does not agree the posture flipped."
};

function drafterJson(overrides: { body?: string; diff?: unknown } = {}) {
  return JSON.stringify({
    body: overrides.body ?? DRAFTER_BODY,
    diff: overrides.diff ?? DRAFTER_DIFF
  });
}

function reviewJson(overrides: Partial<typeof OK_REVIEW> = {}) {
  return JSON.stringify({ ...OK_REVIEW, ...overrides });
}

function fakeProvider(
  script: Array<{
    text?: string;
    fail?: boolean;
    costCents?: number;
  }> = []
): LlmProvider & {
  count: () => number;
  roles: () => string[];
  prompts: () => string[];
} {
  let calls = 0;
  const roles: string[] = [];
  const prompts: string[] = [];
  return {
    name: "fake",
    count: () => calls,
    roles: () => roles,
    prompts: () => prompts,
    complete: async ({ model, prompt }) => {
      const step = script[calls];
      calls += 1;
      roles.push(model);
      prompts.push(prompt);
      if (step?.fail) throw new Error("boom");
      return {
        text: step?.text ?? `unscripted reply from ${model}`,
        inputTokens: 3,
        outputTokens: 5,
        costCents: step?.costCents ?? 0
      };
    }
  };
}

function deps(provider: LlmProvider): GatewayDeps {
  return {
    db: testEnv.DB,
    provider,
    now: () => NOW,
    newId: deterministicNewId
  };
}

async function seedConfig(
  roles: Record<string, { provider: string; model: string }>,
  defaultBudgetCents: number | null = 100
) {
  await testEnv.DB.prepare(
    `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
     VALUES ('current', 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       roles_json = excluded.roles_json,
       default_budget_cents = excluded.default_budget_cents,
       updated_at = excluded.updated_at`
  )
    .bind(JSON.stringify(roles), defaultBudgetCents, NOW)
    .run();
}

const DRAFTER_REVIEWER_ROLES = {
  drafter: { provider: "fake", model: "drafter-v1" },
  reviewer: { provider: "fake", model: "reviewer-v1" }
};

async function insertRun(overrides: { budgetCents?: number | null } = {}) {
  const id = newRunId();
  await runsRepo.insertRun(testEnv.DB, {
    id,
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: NOW,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents:
      overrides.budgetCents === undefined ? 100 : overrides.budgetCents,
    scheduledFor: "2026-09-08"
  });
  return id;
}

async function insertShellDraft(
  runId: string,
  opts: { id?: string; tier2Only?: boolean; confidence?: number | null } = {}
) {
  const id = opts.id ?? `d:${runId}:states:st-nv`;
  await draftsRepo.insertDraft(testEnv.DB, {
    id,
    runId,
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: SHELL_DIFF,
    body: SHELL_BODY,
    tier2Only: opts.tier2Only ?? false,
    confidence: opts.confidence === undefined ? 80 : opts.confidence,
    evalSummary: null,
    createdAt: NOW
  });
  return id;
}

async function finalizeIfRunning(
  runId: string,
  result: { draftCount: number; anyFailure: boolean }
) {
  const run = await runsRepo.getRunById(testEnv.DB, runId);
  if (!run || run.status !== "running") return;
  await completeDailyStep(testEnv.DB, runId, result);
}

function evalOf(draft: { evalSummary: EvalSummary | null }): EvalSummary {
  expect(draft.evalSummary).not.toBeNull();
  return draft.evalSummary as EvalSummary;
}

async function evaluatedEvents(runId: string) {
  return (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
    (e) => e.event === "draft.evaluated"
  );
}

describe("draftAndReview (story 3.5)", () => {
  it("makes zero gateway calls when the Run has no Drafts", async () => {
    const runId = await insertRun();
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider();
    const result = await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(result.budgetStopped).toBe(false);
    expect(provider.count()).toBe(0);
    await finalizeIfRunning(runId, { draftCount: 0, anyFailure: false });
    const run = await runsRepo.getRunById(testEnv.DB, runId);
    expect(run?.status).toBe("empty");
  });

  it("overwrites body/diff, sets confidence from the reviewer, and writes draft.evaluated", async () => {
    const runId = await insertRun();
    const draftId = await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(2);
    expect(provider.roles()).toEqual(["drafter-v1", "reviewer-v1"]);

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe(draftId);
    expect(drafts[0]?.body).toBe(DRAFTER_BODY);
    expect(drafts[0]?.diff).toEqual(DRAFTER_DIFF);
    expect(drafts[0]?.confidence).toBe(72);
    const summary = evalOf(drafts[0]!);
    expect(summary).toEqual({
      status: "ok",
      basis: OK_REVIEW.notes,
      citationCompleteness: 90,
      disagreement: { flagged: false, description: null },
      ineligible: []
    });

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const evaluated = evidence.filter((e) => e.event === "draft.evaluated");
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]?.payload).toEqual({
      draftId,
      disagreement: { flagged: false, description: null }
    });

    await finalizeIfRunning(runId, { draftCount: 1, anyFailure: false });
    const run = await runsRepo.getRunById(testEnv.DB, runId);
    expect(run?.status).toBe("awaiting");
  });

  it("marks eval_fail when reviewer output is unusable and keeps the Run awaiting", async () => {
    const runId = await insertRun();
    const draftId = await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: "not-json" }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("eval_fail");
    expect(summary.ineligible).toContain("eval_fail");
    expect(summary.basis).toBe("eval-fail");
    expect(summary.disagreement.flagged).toBe(false);
    expect(await evaluatedEvents(runId)).toEqual([
      expect.objectContaining({
        payload: {
          draftId,
          disagreement: { flagged: false, description: null }
        }
      })
    ]);

    await finalizeIfRunning(runId, { draftCount: 1, anyFailure: false });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("marks eval_fail when confidence or citationCompleteness is missing", async () => {
    const runId = await insertRun();
    const draftId = await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: JSON.stringify({ notes: "incomplete", disagrees: false }) }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("eval_fail");
    expect(summary.ineligible).toEqual(["eval_fail"]);
    expect((await evaluatedEvents(runId))[0]?.payload).toEqual({
      draftId,
      disagreement: { flagged: false, description: null }
    });
  });

  it("budget-stops mid-review: remaining Drafts evals_not_run, Run stays stopped", async () => {
    const runId = await insertRun({ budgetCents: 50 });
    const firstId = await insertShellDraft(runId, {
      id: `d:${runId}:01`
    });
    const secondId = await insertShellDraft(runId, {
      id: `d:${runId}:02`,
      confidence: 50
    });
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson(), costCents: 50 },
      { text: reviewJson(), costCents: 50 }
    ]);

    const result = await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(result.budgetStopped).toBe(true);
    expect(provider.count()).toBe(1);

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    const first = drafts.find((d) => d.id === firstId)!;
    const second = drafts.find((d) => d.id === secondId)!;
    expect(evalOf(first).status).toBe("evals_not_run");
    expect(evalOf(first).ineligible).toContain("evals_not_run");
    expect(first.body).toBe(DRAFTER_BODY);
    expect(evalOf(second).status).toBe("evals_not_run");
    expect(second.body).toBe(SHELL_BODY);

    const run = await runsRepo.getRunById(testEnv.DB, runId);
    expect(run?.status).toBe("stopped");
    await finalizeIfRunning(runId, { draftCount: 2, anyFailure: false });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "stopped"
    );
    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(evidence.some((e) => e.event === "gate.awaiting_approval")).toBe(
      false
    );
    expect(evidence.filter((e) => e.event === "run.stopped")).toHaveLength(1);
    const evaluated = evidence.filter((e) => e.event === "draft.evaluated");
    expect(evaluated).toHaveLength(2);
    expect(
      evaluated.map((e) => (e.payload as { draftId: string }).draftId).sort()
    ).toEqual([firstId, secondId].sort());
  });

  it("treats a per-Draft provider error as evals_not_run and continues; Run stays awaiting", async () => {
    const runId = await insertRun();
    const failId = await insertShellDraft(runId, {
      id: `d:${runId}:01`
    });
    const okId = await insertShellDraft(runId, {
      id: `d:${runId}:02`
    });
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { fail: true },
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(evalOf(drafts.find((d) => d.id === failId)!).status).toBe(
      "evals_not_run"
    );
    expect(evalOf(drafts.find((d) => d.id === okId)!).status).toBe("ok");
    expect(drafts.find((d) => d.id === okId)?.confidence).toBe(72);
    const evaluated = await evaluatedEvents(runId);
    expect(evaluated).toHaveLength(2);
    expect(
      evaluated.map((e) => (e.payload as { draftId: string }).draftId).sort()
    ).toEqual([failId, okId].sort());

    await finalizeIfRunning(runId, { draftCount: 2, anyFailure: false });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("marks evals_not_run when the gateway is not configured", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    await draftAndReview(testEnv.DB, runId, {
      db: testEnv.DB,
      provider: null as unknown as LlmProvider,
      now: () => NOW,
      newId: deterministicNewId
    });
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("evals_not_run");
    expect(summary.ineligible).toContain("evals_not_run");
    expect(await evaluatedEvents(runId)).toHaveLength(1);
    await finalizeIfRunning(runId, { draftCount: 1, anyFailure: false });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("records tier2_only on ineligible even when evals succeed", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId, { tier2Only: true });
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("ok");
    expect(summary.ineligible).toEqual(["tier2_only"]);
  });

  it("does not mark below_threshold when confidence equals the versioned floor", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      {
        text: reviewJson({
          confidence: AUTO_APPROVE_CONFIDENCE_THRESHOLD,
          citationCompleteness: 80
        })
      }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.confidence).toBe(AUTO_APPROVE_CONFIDENCE_THRESHOLD);
    expect(evalOf(draft).ineligible).not.toContain("below_threshold");
  });

  it("records below_threshold when confidence is under the versioned floor", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      {
        text: reviewJson({
          confidence: AUTO_APPROVE_CONFIDENCE_THRESHOLD - 1,
          citationCompleteness: 80
        })
      }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.confidence).toBe(69);
    expect(evalOf(draft).ineligible).toEqual(["below_threshold"]);
  });

  it("flags disagreement on Evidence and evalSummary when disagrees is true with a description", async () => {
    const runId = await insertRun();
    const draftId = await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: JSON.stringify(FLAGGED_REVIEW) }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("ok");
    expect(summary.disagreement).toEqual({
      flagged: true,
      description: FLAGGED_REVIEW.disagreement
    });
    expect(summary.ineligible).toEqual(["below_threshold"]);

    const evaluated = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (e) => e.event === "draft.evaluated"
    );
    expect(evaluated?.payload).toEqual({
      draftId,
      disagreement: {
        flagged: true,
        description: FLAGGED_REVIEW.disagreement
      }
    });
  });

  it("treats missing disagrees as false", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      {
        text: JSON.stringify({
          confidence: 72,
          citationCompleteness: 90,
          notes: OK_REVIEW.notes,
          disagreement: ""
        })
      }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("ok");
    expect(summary.disagreement).toEqual({
      flagged: false,
      description: null
    });
  });

  it("treats disagrees without a description as eval_fail with no disagreement flag", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      {
        text: reviewJson({
          disagrees: true,
          disagreement: ""
        })
      }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const summary = evalOf((await draftsRepo.listByRun(testEnv.DB, runId))[0]!);
    expect(summary.status).toBe("eval_fail");
    expect(summary.ineligible).toContain("eval_fail");
    expect(summary.disagreement).toEqual({
      flagged: false,
      description: null
    });
  });

  it("skips LLM and does not duplicate draft.evaluated when evalSummary is already set", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: reviewJson() },
      { text: drafterJson({ body: "second pass" }) },
      { text: reviewJson({ notes: "should not land" }) }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(2);

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts[0]?.body).toBe(DRAFTER_BODY);
    expect(evalOf(drafts[0]!).basis).toBe(OK_REVIEW.notes);

    const evaluated = (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
      (e) => e.event === "draft.evaluated"
    );
    expect(evaluated).toHaveLength(1);
  });

  it("does not overwrite body/diff when drafter output is unparseable, but still reviews", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: "not a draft json" },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(2);
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.body).toBe(SHELL_BODY);
    expect(draft.diff).toEqual(SHELL_DIFF);
    expect(evalOf(draft).status).toBe("ok");
    expect(draft.confidence).toBe(72);
  });

  it("treats whitespace-only drafter body as unparseable and still reviews", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson({ body: "   " }) },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(2);
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.body).toBe(SHELL_BODY);
    expect(evalOf(draft).status).toBe("ok");
  });

  it("never calls the yolo role", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig({
      ...DRAFTER_REVIEWER_ROLES,
      yolo: { provider: "fake", model: "yolo-v1" }
    });
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.roles()).not.toContain("yolo-v1");
  });

  it("stamps remaining Drafts evals_not_run if persist throws in the catch path", async () => {
    const runId = await insertRun();
    const failId = await insertShellDraft(runId, {
      id: `d:${runId}:01`
    });
    const restId = await insertShellDraft(runId, {
      id: `d:${runId}:02`
    });
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const spy = vi
      .spyOn(draftsRepo, "applyDraftReviewStmt")
      .mockRejectedValueOnce(new Error("write failed"));
    const provider = fakeProvider([{ fail: true }]);
    await expect(
      draftAndReview(testEnv.DB, runId, deps(provider))
    ).rejects.toThrow();
    spy.mockRestore();
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts.find((d) => d.id === failId)?.evalSummary).toBeNull();
    expect(evalOf(drafts.find((d) => d.id === restId)!).status).toBe(
      "evals_not_run"
    );
  });

  it("omits private Draft fields from the scoped prompt builder", () => {
    const prompt = buildScopedPrompt("drafter", {
      targetEntityType: "states",
      targetEntityId: "st-nv",
      body: SHELL_BODY,
      diff: SHELL_DIFF,
      tier2Only: false,
      decidedBy: "operator@secret.example",
      editedBody: "career notes must not leak",
      evalSummary: { status: "ok" }
    } as Parameters<typeof buildScopedPrompt>[1] & {
      decidedBy: string;
      editedBody: string;
      evalSummary: { status: string };
    });
    expect(prompt).toContain(SHELL_BODY);
    expect(prompt).not.toContain("operator@secret.example");
    expect(prompt).not.toContain("career notes must not leak");
    expect(prompt).not.toContain('"status":"ok"');
  });

  it("short-circuits remaining LLM when the drafter returns tool JSON", async () => {
    const runId = await insertRun();
    const failId = await insertShellDraft(runId, { id: `d:${runId}:01` });
    const okId = await insertShellDraft(runId, { id: `d:${runId}:02` });
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: '{"tool":"publish_f1"}' },
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(3);

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    const failed = drafts.find((d) => d.id === failId)!;
    expect(evalOf(failed).status).toBe("evals_not_run");
    expect(evalOf(failed).ineligible).toContain("guardrail_fail");
    expect(evalOf(drafts.find((d) => d.id === okId)!).status).toBe("ok");

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const denied = evidence.filter((e) => e.event === "guardrails.failed");
    expect(denied).toHaveLength(1);
    expect(denied[0]?.payload).toEqual({
      draftId: failId,
      ruleId: "tool.allowlist",
      tool: "publish_f1"
    });

    await finalizeIfRunning(runId, { draftCount: 2, anyFailure: false });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("short-circuits when the reviewer returns tool JSON and keeps drafter body", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: '{"tool":"web_search"}' }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(2);
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.body).toBe(DRAFTER_BODY);
    expect(evalOf(draft).ineligible).toContain("guardrail_fail");
    expect(evalOf(draft).status).toBe("evals_not_run");
  });

  it("treats tool JSON with extra keys as a tool request, not a drafter overwrite", async () => {
    const runId = await insertRun();
    await insertShellDraft(runId);
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      {
        text: JSON.stringify({
          tool: "publish_f1",
          body: "should not land",
          diff: { operationalStatus: { from: "go", to: "restricted" } }
        })
      }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    expect(provider.count()).toBe(1);
    const draft = (await draftsRepo.listByRun(testEnv.DB, runId))[0]!;
    expect(draft.body).toBe(SHELL_BODY);
    expect(evalOf(draft).ineligible).toContain("guardrail_fail");
  });

  it("does not put decidedBy or editedBody into the gateway prompt", async () => {
    const runId = await insertRun();
    const draftId = await insertShellDraft(runId);
    await testEnv.DB.prepare(
      `UPDATE drafts
          SET outcome = 'approved', decided_at = ?, decided_by = ?, edited_body = ?
        WHERE id = ?`
    )
      .bind(
        NOW,
        "operator@secret.example",
        "career notes must not leak",
        draftId
      )
      .run();
    await seedConfig(DRAFTER_REVIEWER_ROLES);
    const provider = fakeProvider([
      { text: drafterJson() },
      { text: reviewJson() }
    ]);

    await draftAndReview(testEnv.DB, runId, deps(provider));
    const joined = provider.prompts().join("\n");
    expect(joined).toContain(SHELL_BODY);
    expect(joined).not.toContain("operator@secret.example");
    expect(joined).not.toContain("career notes must not leak");
  });
});
