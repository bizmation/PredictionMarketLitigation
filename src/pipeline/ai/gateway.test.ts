import { COST_POLICIES } from "./costPolicy";
import { fixtureCostPolicy } from "../../test/costPolicyFixture";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureRun } from "../workflow/dailyRunSteps";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { PROVIDER_TIMEOUT_MS } from "../../shared/lib/timeouts";
import {
  complete,
  createOpenRouterProvider,
  createWorkersAiProvider,
  invokeTool,
  llmProvidersFromEnv,
  type LlmProvider
} from "./gateway";

/**
 * Story 3.2 — AI gateway I/O matrix (the spec's edge-case table), run against
 * Miniflare D1 with migrations applied (src/test/apply-migrations.ts). The
 * provider is injected as a fake: the test config (wrangler.test.jsonc) omits
 * the `ai` binding, so any test reaching the real `env.AI` would need a live
 * token — the seam is exactly what makes the gateway testable here.
 */

const testEnv = env as Env;

const NOW = "2026-09-08T16:00:00.000Z";

let runSeq = 0;
/** Unique, valid `run-YYYYMMDD-xxxx` id (4 hex suffix), fresh per insert. */
function newRunId(): string {
  runSeq += 1;
  return `run-20260908-${runSeq.toString(16).padStart(4, "0")}`;
}

let RUN_ID = newRunId();

type RunFixture = Parameters<typeof runsRepo.insertRun>[1];

function runInput(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: RUN_ID,
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: NOW,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 100,
    scheduledFor: "2026-09-08",
    ...overrides
  };
}

function fakeProvider(
  overrides: Partial<{
    fail: boolean;
    costCents: number;
    inputTokens: number | null;
    outputTokens: number | null;
  }> = {}
): LlmProvider & { count: () => number } {
  let calls = 0;
  return {
    name: "fake",
    count: () => calls,
    complete: async ({ model }) => {
      calls += 1;
      if (overrides.fail) throw new Error("boom");
      return {
        text: `fake reply from ${model}`,
        inputTokens:
          overrides.inputTokens === undefined ? 11 : overrides.inputTokens,
        outputTokens:
          overrides.outputTokens === undefined ? 7 : overrides.outputTokens,
        reportedCostUsd: (overrides.costCents ?? 0) / 100
      };
    }
  };
}

let idSeq = 0;
const deterministicNewId = () => `id-${++idSeq}`;

function deps(provider: LlmProvider) {
  return {
    db: testEnv.DB,
    costPolicy: fixtureCostPolicy,
    provider,
    now: () => NOW,
    newId: deterministicNewId
  };
}

async function seedConfig(
  roles: Record<string, { provider: string; model: string }>,
  defaultBudgetCents: number | null
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

async function insertRun(overrides: Partial<RunFixture> = {}) {
  RUN_ID = newRunId();
  await runsRepo.insertRun(testEnv.DB, runInput(overrides));
}

/**
 * Seed prior spend directly into the llm_calls ledger — the authoritative spend
 * source the budget check reads (`totalSpendForRun`).
 */
async function recordPriorSpend(costCents: number) {
  await testEnv.DB.prepare(
    `INSERT INTO llm_calls (id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at)
     VALUES (?, ?, 'drafter', 'fake', 'prior-model', NULL, ?, 'USD', ?)`
  )
    .bind(`prior-${RUN_ID}`, RUN_ID, costCents, NOW)
    .run();
}

describe("gateway.complete (story 3.2)", () => {
  it("rejects an unknown role without touching the provider or storage", async () => {
    RUN_ID = newRunId();
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "nope" as never,
        runId: RUN_ID,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "unknown_role" });

    expect(provider.count()).toBe(0);
    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(calls?.count).toBe(0);
  });

  it("fails closed with gateway_not_configured when no provider is present", async () => {
    expect(createWorkersAiProvider({} as Env)).toBeNull();
    expect(
      createWorkersAiProvider({ AI: undefined } as unknown as Env)
    ).toBeNull();
    await expect(
      complete(
        {
          db: testEnv.DB,
          provider: null,
          now: () => NOW,
          newId: deterministicNewId
        },
        {
          operationKey: crypto.randomUUID(),
          role: "drafter",
          runId: RUN_ID,
          prompt: "hi"
        }
      )
    ).rejects.toMatchObject({ code: "gateway_not_configured" });
  });

  it("rejects a missing Run with run_not_found and makes zero provider calls", async () => {
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    const missingId = "run-20260908-ffff";
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "drafter",
        runId: missingId,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "run_not_found" });
    expect(provider.count()).toBe(0);
    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(missingId)
      .first<{ count: number }>();
    expect(calls?.count).toBe(0);
  });

  it("rejects an unconfigured role with role_not_configured and no spend row", async () => {
    await insertRun();
    await seedConfig({}, null);
    await expect(
      complete(deps(fakeProvider()), {
        operationKey: crypto.randomUUID(),
        role: "drafter",
        runId: RUN_ID,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "role_not_configured" });

    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(calls?.count).toBe(0);
  });

  it("completes under budget: records role/provider/model/tokens and returns the result", async () => {
    await insertRun();
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    const provider = fakeProvider({
      costCents: 0,
      inputTokens: 3,
      outputTokens: 5
    });

    const result = await complete(deps(provider), {
      operationKey: crypto.randomUUID(),
      role: "drafter",
      runId: RUN_ID,
      prompt: "draft this"
    });

    expect(result.text).toBe("fake reply from fake-model-v1");
    expect(result.provider).toBe("fake");
    expect(result.model).toBe("fake-model-v1");
    expect(result.inputTokens).toBe(3);
    expect(result.outputTokens).toBe(5);

    const row = await testEnv.DB.prepare(
      `SELECT role, provider, model, tokens_json, cost_cents, currency
         FROM llm_calls WHERE run_id = ?`
    )
      .bind(RUN_ID)
      .first<{
        role: string;
        provider: string;
        model: string;
        tokens_json: string;
        cost_cents: number;
        currency: string;
      }>();
    expect(row).toMatchObject({
      role: "drafter",
      provider: "fake",
      model: "fake-model-v1",
      cost_cents: 0,
      currency: "USD"
    });
    expect(JSON.parse(row!.tokens_json)).toEqual({ input: 3, output: 5 });
  });

  it("stores null token usage as SQL NULL, not zeroed JSON", async () => {
    await insertRun();
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    await expect(
      complete(deps(fakeProvider({ inputTokens: null, outputTokens: null })), {
        operationKey: crypto.randomUUID(),
        role: "drafter",
        runId: RUN_ID,
        prompt: "draft this"
      })
    ).rejects.toMatchObject({ code: "accounting_uncertain" });
    const row = await testEnv.DB.prepare(
      `SELECT tokens_json FROM llm_calls WHERE run_id = ?`
    )
      .bind(RUN_ID)
      .first<{ tokens_json: string | null }>();
    expect(row?.tokens_json).toBeNull();
  });

  it("accrues spend cents onto the Run for a non-zero cost call", async () => {
    await insertRun();
    await seedConfig(
      { reviewer: { provider: "fake", model: "reviewer-v2" } },
      null
    );
    await complete(deps(fakeProvider({ costCents: 12 })), {
      operationKey: crypto.randomUUID(),
      role: "reviewer",
      runId: RUN_ID,
      prompt: "review"
    });

    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.spendCents).toBe(12);

    const total = await (
      await import("../../shared/db/repos/llmCallsRepo")
    ).totalSpendForRun(testEnv.DB, RUN_ID);
    expect(total).toBe(12);
  });

  it("budget-stops before the provider: marks Run stopped and writes run.stopped evidence", async () => {
    // Spend already AT the ceiling (budget 100, ledger spend 100) — the next
    // call must be refused before the provider, the Run stopped, evidence written.
    await insertRun({ budgetCents: 100 });
    await recordPriorSpend(100);
    await seedConfig(
      { orchestrator: { provider: "fake", model: "orch-v1" } },
      null
    );

    let providerCalls = 0;
    const provider: LlmProvider = {
      name: "fake",
      complete: async () => {
        providerCalls += 1;
        return { text: "x", inputTokens: 1, outputTokens: 1, costCents: 0 };
      }
    };

    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "orchestrator",
        runId: RUN_ID,
        prompt: "go"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(providerCalls).toBe(0);

    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.status).toBe("stopped");
    expect(run?.completedAt).toBe(NOW);

    const evidence = await testEnv.DB.prepare(
      `SELECT event, payload_json FROM evidence_events
        WHERE run_id = ? AND event = 'run.stopped'`
    )
      .bind(RUN_ID)
      .first<{ event: string; payload_json: string }>();
    expect(evidence?.event).toBe("run.stopped");
    expect(JSON.parse(evidence!.payload_json)).toEqual({
      reason: "budget_stopped"
    });

    // No NEW call was recorded by the refused attempt — just the one
    // prior-spend row this test seeded to reach the ceiling.
    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(calls?.count).toBe(1);

    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "orchestrator",
        runId: RUN_ID,
        prompt: "go again"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(providerCalls).toBe(0);
    const again = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(again?.status).toBe("stopped");
    expect(again?.completedAt).toBe(NOW);
    const stopped = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM evidence_events
        WHERE run_id = ? AND event = 'run.stopped'`
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(stopped?.count).toBe(1);
  });

  it("refuses complete() on a non-running Run when spend is under the ceiling", async () => {
    await insertRun({ status: "published", completedAt: NOW });
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "drafter",
        runId: RUN_ID,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(provider.count()).toBe(0);
    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.status).toBe("published");
    expect(run?.completedAt).toBe(NOW);
  });

  it("allows steward complete on an awaiting Run under budget", async () => {
    await insertRun({ status: "awaiting", completedAt: NOW, budgetCents: 100 });
    await seedConfig(
      { steward: { provider: "fake", model: "steward-v1" } },
      null
    );
    const provider = fakeProvider({ costCents: 4 });
    const result = await complete(deps(provider), {
      operationKey: crypto.randomUUID(),
      role: "steward",
      runId: RUN_ID,
      prompt: "steer"
    });
    expect(result.role).toBe("steward");
    expect(provider.count()).toBe(1);
    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.status).toBe("awaiting");
    expect(run?.spendCents).toBe(4);
    const row = await testEnv.DB.prepare(
      `SELECT role FROM llm_calls WHERE run_id = ?`
    )
      .bind(RUN_ID)
      .first<{ role: string }>();
    expect(row?.role).toBe("steward");
  });

  it("allows drafter and reviewer complete on an awaiting Run under budget", async () => {
    await insertRun({ status: "awaiting", completedAt: NOW, budgetCents: 100 });
    await seedConfig(
      {
        drafter: { provider: "fake", model: "drafter-v1" },
        reviewer: { provider: "fake", model: "reviewer-v1" }
      },
      null
    );
    const provider = fakeProvider({ costCents: 4 });
    const drafter = await complete(deps(provider), {
      operationKey: crypto.randomUUID(),
      role: "drafter",
      runId: RUN_ID,
      prompt: "draft"
    });
    expect(drafter.role).toBe("drafter");
    const reviewer = await complete(deps(provider), {
      operationKey: crypto.randomUUID(),
      role: "reviewer",
      runId: RUN_ID,
      prompt: "review"
    });
    expect(reviewer.role).toBe("reviewer");
    expect(provider.count()).toBe(2);
    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.status).toBe("awaiting");
  });

  it("refuses other roles on an awaiting Run even under budget", async () => {
    await insertRun({ status: "awaiting", completedAt: NOW });
    await seedConfig(
      { yolo: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "yolo",
        runId: RUN_ID,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(provider.count()).toBe(0);
  });

  it("refuses steward complete on a published Run", async () => {
    await insertRun({ status: "published", completedAt: NOW });
    await seedConfig(
      { steward: { provider: "fake", model: "steward-v1" } },
      null
    );
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "steward",
        runId: RUN_ID,
        prompt: "hi"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(provider.count()).toBe(0);
  });

  it("falls back to the config default ceiling when the Run has no budget_cents", async () => {
    await insertRun({ budgetCents: null });
    await seedConfig(
      { orchestrator: { provider: "fake", model: "orch-v1" } },
      50
    );
    await recordPriorSpend(50);
    await expect(
      complete(deps(fakeProvider()), {
        operationKey: crypto.randomUUID(),
        role: "orchestrator",
        runId: RUN_ID,
        prompt: "go"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
  });

  it("fails closed with gateway_not_configured when no ceiling exists and makes zero provider calls", async () => {
    // Run has null budget AND the config carries no default (null) — no ceiling
    // is resolvable, so the gateway refuses before the provider.
    await insertRun({ budgetCents: null });
    await seedConfig(
      { orchestrator: { provider: "fake", model: "orch-v1" } },
      null
    );
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
        operationKey: crypto.randomUUID(),
        role: "orchestrator",
        runId: RUN_ID,
        prompt: "go"
      })
    ).rejects.toMatchObject({ code: "gateway_not_configured" });
    expect(provider.count()).toBe(0);
  });

  it("surfaces a provider error as provider_error with no spend row", async () => {
    await insertRun();
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    await expect(
      complete(deps(fakeProvider({ fail: true })), {
        operationKey: crypto.randomUUID(),
        role: "drafter",
        runId: RUN_ID,
        prompt: "draft"
      })
    ).rejects.toMatchObject({ code: "provider_error" });

    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(calls?.count).toBe(0);
  });
});

describe("gateway.invokeTool (story 3.6)", () => {
  async function f1Snapshot() {
    async function rows(table: string) {
      const { results } = await testEnv.DB.prepare(
        `SELECT id, updated_at AS updatedAt FROM ${table} ORDER BY id`
      ).all<{ id: string; updatedAt: string }>();
      return results ?? [];
    }
    return {
      states: await rows("states"),
      cases: await rows("cases"),
      entities: await rows("entities"),
      circuits: await rows("circuits")
    };
  }

  it("denies publish_f1, logs guardrails.failed, and does not throw", async () => {
    await insertRun();
    const provider = fakeProvider();
    const draftId = `d:${RUN_ID}:CFTC press:states:st-nv`;
    const result = await invokeTool(deps(provider), {
      role: "drafter",
      runId: RUN_ID,
      draftId,
      tool: "publish_f1"
    });
    expect(result).toEqual({
      denied: true,
      ruleId: "tool.allowlist",
      tool: "publish_f1"
    });
    expect(provider.count()).toBe(0);

    const evidence = await testEnv.DB.prepare(
      `SELECT event, payload_json FROM evidence_events
        WHERE run_id = ? AND event = 'guardrails.failed'`
    )
      .bind(RUN_ID)
      .first<{ event: string; payload_json: string }>();
    expect(evidence?.event).toBe("guardrails.failed");
    expect(JSON.parse(evidence!.payload_json)).toEqual({
      draftId,
      ruleId: "tool.allowlist",
      tool: "publish_f1"
    });
  });

  it("denies web_search the same way and is not a provider_error", async () => {
    await insertRun();
    const provider = fakeProvider();
    const result = await invokeTool(deps(provider), {
      role: "reviewer",
      runId: RUN_ID,
      draftId: `d:${RUN_ID}:web`,
      tool: "web_search"
    });
    expect(result.denied).toBe(true);
    expect(result.tool).toBe("web_search");
    expect(provider.count()).toBe(0);
  });

  it("throws run_not_found when the Run is missing and writes no evidence", async () => {
    const missingId = "run-20260908-eeee";
    const provider = fakeProvider();
    await expect(
      invokeTool(deps(provider), {
        role: "drafter",
        runId: missingId,
        draftId: "d:missing",
        tool: "publish_f1"
      })
    ).rejects.toMatchObject({ code: "run_not_found" });
    expect(provider.count()).toBe(0);
    const evidence = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM evidence_events WHERE run_id = ?"
    )
      .bind(missingId)
      .first<{ count: number }>();
    expect(evidence?.count).toBe(0);
  });

  it("does not UPDATE live F1 rows when publish_f1 is requested", async () => {
    await insertRun();
    const before = await f1Snapshot();
    await invokeTool(deps(fakeProvider()), {
      role: "yolo",
      runId: RUN_ID,
      draftId: `d:${RUN_ID}:publish`,
      tool: "publish_f1"
    });
    expect(await f1Snapshot()).toEqual(before);
  });

  it("denies publish_f1 for steward the same way", async () => {
    await insertRun();
    const before = await f1Snapshot();
    const result = await invokeTool(deps(fakeProvider()), {
      role: "steward",
      runId: RUN_ID,
      draftId: `d:${RUN_ID}:steer`,
      tool: "publish_f1"
    });
    expect(result.denied).toBe(true);
    expect(await f1Snapshot()).toEqual(before);
  });

  it("does not duplicate guardrails.failed on retry", async () => {
    await insertRun();
    const draftId = `d:${RUN_ID}:retry`;
    const input = {
      role: "drafter" as const,
      runId: RUN_ID,
      draftId,
      tool: "publish_f1"
    };
    await invokeTool(deps(fakeProvider()), input);
    await invokeTool(deps(fakeProvider()), input);
    const count = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM evidence_events
        WHERE run_id = ? AND event = 'guardrails.failed'`
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});

describe("role→model config repo (story 3.2 config)", () => {
  it("setRoleModel upserts a mapping and bumps the singleton version", async () => {
    const { setRoleModel, readConfig } =
      await import("../../shared/db/repos/roleModelsRepo");
    await setRoleModel(testEnv.DB, {
      role: "yolo",
      provider: "fake",
      model: "yolo-v1",
      updatedAt: NOW
    });
    const config = await readConfig(testEnv.DB);
    expect(config?.version).toBeGreaterThan(0);
    expect(config?.roles.yolo).toEqual({ provider: "fake", model: "yolo-v1" });

    // Bump again: version increments, existing mapping is preserved.
    const firstVersion = config!.version;
    await setRoleModel(testEnv.DB, {
      role: "drafter",
      provider: "fake",
      model: "drafter-v2",
      updatedAt: NOW
    });
    const again = await readConfig(testEnv.DB);
    expect(again?.version).toBe(firstVersion + 1);
    expect(again?.roles.yolo).toEqual({ provider: "fake", model: "yolo-v1" });
    expect(again?.roles.drafter).toEqual({
      provider: "fake",
      model: "drafter-v2"
    });
  });

  it("rejects an unknown role key in the config JSON", async () => {
    const { readConfig } = await import("../../shared/db/repos/roleModelsRepo");
    await testEnv.DB.prepare(
      `UPDATE gateway_config SET roles_json = ? WHERE id = 'current'`
    )
      .bind(JSON.stringify({ notarole: { provider: "fake", model: "x" } }))
      .run();
    // The `.strict()` role map rejects the unknown key rather than serving it.
    await expect(readConfig(testEnv.DB)).rejects.toThrow();
  });
});

describe("bounded provider cost", () => {
  const now = "2026-09-26T15:00:00.000Z";
  const model = COST_POLICIES[0]!.model;
  async function setup(
    budget = 500,
    provider = "workersai",
    selectedModel = model
  ) {
    await insertRun({ budgetCents: budget });
    await seedConfig({ drafter: { provider, model: selectedModel } }, 500);
  }
  const input = () => ({
    operationKey: crypto.randomUUID(),
    role: "drafter" as const,
    runId: RUN_ID,
    prompt: "hello"
  });
  function workers(
    usage: unknown = { prompt_tokens: 24000, completion_tokens: 2048 }
  ) {
    const run = vi.fn(async () => ({ response: "reply", usage }));
    const provider = createWorkersAiProvider({
      AI: { run }
    } as unknown as Env)!;
    return {
      run,
      provider,
      deps: { db: testEnv.DB, provider, now: () => now }
    };
  }
  afterEach(() => vi.unstubAllGlobals());
  it("uses the full context and output cap; equality is admitted; no free allowance", async () => {
    await setup(2);
    const w = workers();
    const result = await complete(w.deps, input());
    expect(w.run).toHaveBeenCalledWith(model, {
      prompt: "hello",
      max_tokens: 2048
    });
    expect(result.costCents).toBe(2);
    const calls = await (
      await import("../../shared/db/repos/llmCallsRepo")
    ).listByRun(testEnv.DB, RUN_ID);
    expect(calls[0]).toMatchObject({
      admissionBoundCents: 2,
      costBasis: "token_estimate",
      estimatedCostCents: 2,
      reportedCostCents: null,
      policy: { version: "bounded-text-v1" }
    });
  });
  it("refuses insufficient budget before invoking the provider", async () => {
    await setup(1);
    const w = workers();
    await expect(complete(w.deps, input())).rejects.toMatchObject({
      code: "budget_stopped"
    });
    expect(w.run).not.toHaveBeenCalled();
    expect((await runsRepo.getRunById(testEnv.DB, RUN_ID))?.status).toBe(
      "stopped"
    );
  });
  it.each(["openrouter/auto", "other-model"])(
    "refuses unsupported model %s",
    async (unknown) => {
      await setup(500, "workersai", unknown);
      const w = workers();
      await expect(complete(w.deps, input())).rejects.toMatchObject({
        code: "cost_policy_invalid"
      });
      expect(w.run).not.toHaveBeenCalled();
    }
  );
  it("refuses expired policy at the exact boundary", async () => {
    await setup();
    const w = workers();
    await expect(
      complete({ ...w.deps, now: () => COST_POLICIES[0]!.validUntil }, input())
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(w.run).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { prompt_tokens: NaN, completion_tokens: 1 },
    { prompt_tokens: 1, completion_tokens: 2049 },
    { prompt_tokens: 24001, completion_tokens: 1 }
  ])(
    "retains uncertain/discrepant usage and blocks subsequent inference",
    async (usage) => {
      await setup();
      const w = workers(usage === undefined ? null : usage);
      await expect(complete(w.deps, input())).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      await expect(complete(w.deps, input())).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      expect(w.run).toHaveBeenCalledTimes(1);
      const [call] = await (
        await import("../../shared/db/repos/llmCallsRepo")
      ).listByRun(testEnv.DB, RUN_ID);
      expect(call?.costCents).toBeGreaterThanOrEqual(2);
      expect(call?.accountingIssue).not.toBeNull();
      expect(call?.reportedCostCents).toBeNull();
    }
  );
  function router() {
    return createOpenRouterProvider({
      OPENROUTER_API_KEY: "test-key",
      AI_GATEWAY_ID: "test",
      CLOUDFLARE_ACCOUNT_ID: "test"
    } as Env)!;
  }
  const endpoint = {
    tag: "amazon-bedrock",
    context_length: 200000,
    supported_parameters: ["max_tokens"],
    pricing: {
      prompt: "0.000003",
      completion: "0.000015",
      input_cache_write: "0.000006",
      web_search: "0.01"
    }
  };
  function routerFetch(cost: unknown = 0.012, metadata: unknown = endpoint) {
    return vi.fn(
      async (url: RequestInfo | URL) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/endpoints")
              ? { data: { endpoints: [metadata] } }
              : {
                  choices: [{ message: { content: "reply" } }],
                  usage: { prompt_tokens: 100, completion_tokens: 20, cost }
                }
          ),
          { status: 200 }
        )
    );
  }
  it.each(["workersai", "openrouter"])(
    "records billable non-text %s output and blocks the Run",
    async (providerName) => {
      await setup(
        500,
        providerName,
        COST_POLICIES[providerName === "workersai" ? 0 : 1]!.model
      );
      const run = vi.fn(async () => ({
        response: { unexpected: true },
        usage: { prompt_tokens: 100, completion_tokens: 20 }
      }));
      const fetch = vi.fn(async (url: RequestInfo | URL) =>
        Response.json(
          String(url).endsWith("/endpoints")
            ? { data: { endpoints: [endpoint] } }
            : {
                choices: [{ message: { content: null } }],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 20,
                  cost: 0.012
                }
              }
        )
      );
      vi.stubGlobal("fetch", fetch);
      const provider =
        providerName === "workersai"
          ? createWorkersAiProvider({ AI: { run } } as unknown as Env)!
          : router();
      const args = { db: testEnv.DB, provider, now: () => now };
      await expect(complete(args, input())).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      await expect(complete(args, input())).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      const [call] = await (
        await import("../../shared/db/repos/llmCallsRepo")
      ).listByRun(testEnv.DB, RUN_ID);
      expect(call).toMatchObject({
        tokens: { input: 100, output: 20 },
        accountingIssue: "non_text_output",
        costCents: providerName === "workersai" ? 2 : 124
      });
      if (providerName === "openrouter") {
        expect(call).toMatchObject({
          reportedCostUsd: "0.012",
          reportedCostCents: 2
        });
        expect(fetch).toHaveBeenCalledTimes(2);
      } else expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it("rechecks expiry after metadata retrieval before inference", async () => {
    await setup(500, "openrouter", COST_POLICIES[1]!.model);
    let time = now;
    const fetch = vi.fn(async (_url: RequestInfo | URL) => {
      time = COST_POLICIES[1]!.validUntil;
      return Response.json({ data: { endpoints: [endpoint] } });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      complete({ db: testEnv.DB, provider: router(), now: () => time }, input())
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0] ?? "")).not.toContain(
      "chat/completions"
    );
  });
  it("refuses a valid base route when a regional variant is unsafe", async () => {
    await setup(500, "openrouter", COST_POLICIES[1]!.model);
    const fetch = vi.fn(async () =>
      Response.json({
        data: {
          endpoints: [
            endpoint,
            {
              ...endpoint,
              tag: "amazon-bedrock/eu-west-1",
              pricing: { ...endpoint.pricing, completion: "0.00003" }
            }
          ]
        }
      })
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      complete({ db: testEnv.DB, provider: router(), now: () => now }, input())
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("Sonnet refuses 123 cents before even endpoint lookup", async () => {
    await setup(123, "openrouter", COST_POLICIES[1]!.model);
    const fetch = routerFetch();
    vi.stubGlobal("fetch", fetch);
    await expect(
      complete({ db: testEnv.DB, provider: router(), now: () => now }, input())
    ).rejects.toMatchObject({ code: "budget_stopped" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces Sonnet routing, price ceilings, max tokens and one gateway attempt", async () => {
    await setup(124, "openrouter", COST_POLICIES[1]!.model);
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!String(url).endsWith("/endpoints")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          model: COST_POLICIES[1]!.model,
          messages: [{ role: "user", content: "hello" }],
          max_tokens: 2048,
          stream: false,
          transforms: [],
          provider: {
            only: ["amazon-bedrock"],
            allow_fallbacks: false,
            require_parameters: true,
            max_price: { prompt: 3, completion: 15, request: 0, image: 0 }
          }
        });
        expect(init?.headers).toMatchObject({ "cf-aig-max-attempts": "1" });
      }
      return routerFetch()(url);
    });
    vi.stubGlobal("fetch", fetch);
    await complete(
      { db: testEnv.DB, provider: router(), now: () => now },
      input()
    );
    const [call] = await (
      await import("../../shared/db/repos/llmCallsRepo")
    ).listByRun(testEnv.DB, RUN_ID);
    expect(call).toMatchObject({
      admissionBoundCents: 124,
      reportedCostCents: 2,
      estimatedCostCents: 1,
      costBasis: "provider_reported",
      reportedCostSource: "openrouter.usage.cost"
    });
  });
  it.each([undefined, -1, 2])(
    "preserves missing/invalid/excessive reported charge %s",
    async (cost) => {
      await setup(500, "openrouter", COST_POLICIES[1]!.model);
      vi.stubGlobal("fetch", routerFetch(cost === undefined ? null : cost));
      await expect(
        complete(
          { db: testEnv.DB, provider: router(), now: () => now },
          input()
        )
      ).rejects.toMatchObject({ code: "accounting_uncertain" });
      const [call] = await (
        await import("../../shared/db/repos/llmCallsRepo")
      ).listByRun(testEnv.DB, RUN_ID);
      expect(call?.costCents).toBe(cost === 2 ? 200 : 124);
      expect(call?.reportedCostCents).toBe(cost === 2 ? 200 : null);
    }
  );
  it.each([
    { request: "0.01" },
    { unknown_fee: "0.01" },
    { overrides: [{ min_prompt_tokens: 200000, completion: "0.0000225" }] }
  ])("refuses unreviewed endpoint charges before inference", async (extra) => {
    await setup(500, "openrouter", COST_POLICIES[1]!.model);
    const fetch = routerFetch(0, {
      ...endpoint,
      pricing: { ...endpoint.pricing, ...extra }
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      complete({ db: testEnv.DB, provider: router(), now: () => now }, input())
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("classifies legacy zero amounts as estimates with unknown measured cost", async () => {
    await setup();
    await recordPriorSpend(0);
    const [call] = await (
      await import("../../shared/db/repos/llmCallsRepo")
    ).listByRun(testEnv.DB, RUN_ID);
    expect(call).toMatchObject({
      costCents: 0,
      costBasis: "legacy_estimate",
      estimatedCostCents: 0,
      reportedCostCents: null,
      policy: null
    });
  });
});

describe("gateway.complete provider deadline (story 3.19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function hungProvider(): LlmProvider & { called: Promise<void> } {
    let fire: () => void = () => {};
    const called = new Promise<void>((resolve) => {
      fire = resolve;
    });
    return {
      name: "fake",
      called,
      complete: () => {
        fire();
        return new Promise(() => {});
      }
    };
  }

  it("retains bound liability after a provider timeout without fabricating a ledger charge", async () => {
    await insertRun();
    await seedConfig({ drafter: { provider: "fake", model: "slow-v1" } }, 500);
    const provider = hungProvider();
    vi.useFakeTimers();
    const pending = complete(deps(provider), {
      operationKey: crypto.randomUUID(),
      role: "drafter",
      runId: RUN_ID,
      prompt: "draft"
    });
    const settled = pending.then(
      () => "resolved",
      (err: unknown) => err
    );
    await provider.called;
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS - 1);
    // Still pending one tick before the deadline.
    let done = false;
    void settled.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await settled;
    vi.useRealTimers();

    expect(err).toMatchObject({ name: "GatewayError", code: "provider_error" });
    expect(String((err as Error).message)).toContain("fake");
    expect(String((err as Error).message)).toContain("60000 ms");

    const calls = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM llm_calls WHERE run_id = ?"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(calls?.count).toBe(0);
    const run = await runsRepo.getRunById(testEnv.DB, RUN_ID);
    expect(run?.status).toBe("running");
    expect(run?.spendCents).toBe(50);
    expect(run?.uncertainCents).toBe(50);
    const stopped = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM evidence_events WHERE run_id = ? AND event = 'run.stopped'"
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(stopped?.count).toBe(0);
  });

  it("does not fire the deadline on a provider that answers in time", async () => {
    await insertRun();
    await seedConfig({ drafter: { provider: "fake", model: "fast-v1" } }, 500);
    vi.useFakeTimers();
    const result = await complete(deps(fakeProvider()), {
      operationKey: crypto.randomUUID(),
      role: "drafter",
      runId: RUN_ID,
      prompt: "draft"
    });
    expect(result.text).toBe("fake reply from fast-v1");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("snapshotted Run budget enforcement (story 3.25)", () => {
  it.each([0, 500])(
    "stops a production-created Run at its own %s-cent ceiling after config increases",
    async (budget) => {
      await seedConfig(
        { drafter: { provider: "fake", model: "fake-model-v1" } },
        budget
      );
      RUN_ID = await ensureRun(
        testEnv.DB,
        "scheduled",
        budget === 0 ? "2027-03-01" : "2027-03-02"
      );
      if (budget > 0) await recordPriorSpend(budget);
      await seedConfig(
        { drafter: { provider: "fake", model: "fake-model-v1" } },
        900
      );
      const provider = fakeProvider();
      await expect(
        complete(
          { ...deps(provider), now: () => new Date().toISOString() },
          {
            operationKey: crypto.randomUUID(),
            role: "drafter",
            runId: RUN_ID,
            prompt: "hi"
          }
        )
      ).rejects.toMatchObject({ code: "budget_stopped" });
      expect(provider.count()).toBe(0);
      expect(await runsRepo.getRunById(testEnv.DB, RUN_ID)).toMatchObject({
        budgetCents: budget,
        status: "stopped"
      });
      const evidence = await testEnv.DB.prepare(
        "SELECT payload_json FROM evidence_events WHERE run_id = ? AND event = 'run.stopped'"
      )
        .bind(RUN_ID)
        .first<{ payload_json: string }>();
      expect(JSON.parse(evidence!.payload_json)).toMatchObject({
        reason: "budget_stopped"
      });
    }
  );

  it("fails closed for a production-created null budget on a valid provider/model call", async () => {
    await seedConfig(
      { drafter: { provider: "fake", model: "fake-model-v1" } },
      null
    );
    const runId = await ensureRun(testEnv.DB, "scheduled", "2027-03-03");
    const provider = fakeProvider();
    await expect(
      complete(
        { ...deps(provider), now: () => new Date().toISOString() },
        {
          operationKey: crypto.randomUUID(),
          role: "drafter",
          runId,
          prompt: "hi"
        }
      )
    ).rejects.toMatchObject({ code: "gateway_not_configured" });
    expect(provider.count()).toBe(0);
  });
});

describe("provider factories", () => {
  it("requires bindings/secrets and registers providers without changing model choices", () => {
    expect(createWorkersAiProvider({} as Env)).toBeNull();
    expect(createOpenRouterProvider({} as Env)).toBeNull();
    expect(
      llmProvidersFromEnv({
        AI: { run: vi.fn() },
        OPENROUTER_API_KEY: "test",
        AI_GATEWAY_ID: "test",
        CLOUDFLARE_ACCOUNT_ID: "test"
      } as unknown as Env).map((p) => p.name)
    ).toEqual(["workersai", "openrouter"]);
  });
  it.each([undefined, null, 12, { nested: true }])(
    "preserves non-text output %s for accounting",
    async (response) => {
      const p = createWorkersAiProvider({
        AI: { run: async () => ({ response }) }
      } as unknown as Env)!;
      await expect(
        p.complete({
          model: COST_POLICIES[0]!.model,
          prompt: "hello",
          policy: COST_POLICIES[0]!,
          now: () => "2026-09-26T15:00:00.000Z"
        })
      ).resolves.toMatchObject({
        text: "",
        accountingIssue: "non_text_output"
      });
    }
  );
});

describe("atomic gateway dispatch and replay (3.31)", () => {
  it("dispatches at most one competing bounded call and exposes the reservation immediately", async () => {
    await insertRun({ budgetCents: 50 });
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 50);
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((r) => (release = r)),
      reached = new Promise<void>((r) => (entered = r));
    const invoke = vi.fn(async () => {
      entered();
      await held;
      return {
        text: "PRIVATE completion",
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0.01
      };
    });
    const d = deps({ name: "fake", complete: invoke });
    const input = {
      operationKey: "draft:race:drafter",
      role: "drafter" as const,
      runId: RUN_ID,
      prompt: "PRIVATE prompt"
    };
    const first = complete(d, input);
    await reached;
    const worker = (await import("../../server")).default;
    const detail = (await (
      await worker.fetch(
        new Request(`https://pml.example.com/api/runs/${RUN_ID}`),
        testEnv
      )
    ).json()) as { spendCents: number; reservedCents: number };
    expect(detail).toMatchObject({ spendCents: 50, reservedCents: 50 });
    expect(JSON.stringify(detail)).not.toContain("PRIVATE");
    await expect(complete(d, input)).rejects.toMatchObject({
      code: "operation_pending"
    });
    await expect(
      complete(d, { ...input, operationKey: "draft:other:drafter" })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    release();
    const completed = await first;
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(
      await complete({ ...d, now: () => "2030-01-01T00:00:00.000Z" }, input)
    ).toEqual(completed);
    await expect(
      complete(d, { ...input, prompt: "changed" })
    ).rejects.toMatchObject({ code: "operation_conflict" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("enforces all shared periods across concurrent Runs and original settlement attribution", async () => {
    const now = "2026-12-01T00:00:00.000Z";
    await insertRun({ budgetCents: 100 });
    const firstRun = RUN_ID;
    await insertRun({ budgetCents: 100 });
    const secondRun = RUN_ID;
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
    for (const [id, cap] of [
      ["broad", 100],
      ["tight", 50]
    ] as const)
      await testEnv.DB.prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
        .bind(id, now, "2026-12-02T00:00:00.000Z", cap, "test reviewed period")
        .run();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((r) => (release = r)),
      reached = new Promise<void>((r) => (entered = r));
    const invoke = vi.fn(async () => {
      entered();
      await held;
      return {
        text: "ok",
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0.01
      };
    });
    let time = now;
    const d = { ...deps({ name: "fake", complete: invoke }), now: () => time };
    const first = complete(d, {
      operationKey: "first",
      runId: firstRun,
      role: "drafter",
      prompt: "x"
    });
    await reached;
    await expect(
      complete(d, {
        operationKey: "second",
        runId: secondRun,
        role: "drafter",
        prompt: "y"
      })
    ).rejects.toMatchObject({ code: "budget_stopped" });
    time = "2026-12-03T00:00:00.000Z";
    release();
    await first;
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(
      (
        await testEnv.DB.prepare(
          "SELECT total_cents FROM llm_period_accounting WHERE period_id IN ('broad','tight')"
        ).all()
      ).results
    ).toEqual([{ total_cents: 1 }, { total_cents: 1 }]);
  });
  it("retains unknown outcomes on identical retries and returns a typed result-unavailable after reconciliation", async () => {
    await insertRun();
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
    const provider = fakeProvider({ fail: true });
    const d = deps(provider);
    const input = {
      operationKey: "unknown",
      runId: RUN_ID,
      role: "drafter" as const,
      prompt: "x"
    };
    await expect(complete(d, input)).rejects.toMatchObject({
      code: "provider_error"
    });
    await expect(complete(d, input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    const accounting = await import("../../shared/db/repos/llmAccountingRepo");
    const op = (await accounting.getOperation(
      testEnv.DB,
      RUN_ID,
      input.operationKey
    ))!;
    await accounting.reconcile(
      testEnv.DB,
      op.id,
      {
        requestId: "reconcile-" + op.id,
        expectedVersion: op.version,
        decision: "confirmed_no_charge",
        evidenceReference: "provider-support:1",
        note: "Provider attested no charge"
      },
      "Operator",
      NOW
    );
    await expect(complete(d, input)).rejects.toMatchObject({
      code: "result_unavailable"
    });
    expect(provider.count()).toBe(1);
  });
});

describe("accounting recovery boundaries", () => {
  it("retains observed over-bound response evidence after atomic settlement rollback", async () => {
    await insertRun({ budgetCents: 100 });
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
    let batches = 0;
    const real = testEnv.DB;
    const db = new Proxy(real, {
      get(target, prop) {
        if (prop === "batch")
          return (statements: D1PreparedStatement[]) =>
            ++batches === 3
              ? target.batch([
                  ...statements,
                  target.prepare(
                    "INSERT INTO gate_assertions VALUES ('settlement-injected',0)"
                  )
                ])
              : target.batch(statements);
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
    const provider: LlmProvider = {
      name: "fake",
      complete: async () => ({
        text: "private observed output",
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0.75,
        providerRequestId: "observed-generation"
      })
    };
    const input = {
      operationKey: "rollback-observed",
      runId: RUN_ID,
      role: "drafter" as const,
      prompt: "private prompt"
    };
    await expect(complete({ ...deps(provider), db }, input)).rejects.toThrow();
    const op = await real
      .prepare("SELECT * FROM llm_operations WHERE run_id=?")
      .bind(RUN_ID)
      .first<{
        liability_cents: number;
        provider_request_id: string;
        response_evidence_json: string;
        state: string;
      }>();
    expect(op).toMatchObject({
      liability_cents: 75,
      provider_request_id: "observed-generation",
      state: "uncertain"
    });
    expect(op?.response_evidence_json).toContain("private observed output");
    expect(
      await real
        .prepare("SELECT id FROM llm_calls WHERE run_id=?")
        .bind(RUN_ID)
        .first()
    ).toBeNull();
    await expect(
      complete(deps(provider), { ...input, operationKey: "other" })
    ).rejects.toMatchObject({ code: "accounting_uncertain" });
  });
  it.each([false, true])(
    "captures a late uncancellable provider response without overwriting reconciliation (%s)",
    async (reconciled) => {
      await insertRun();
      await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
      let resolve!: (
        value: Awaited<ReturnType<LlmProvider["complete"]>>
      ) => void;
      let enter!: () => void;
      const reached = new Promise<void>((r) => (enter = r));
      const provider: LlmProvider = {
        name: "fake",
        complete: () => {
          enter();
          return new Promise((r) => (resolve = r));
        }
      };
      const input = {
        operationKey: "late",
        runId: RUN_ID,
        role: "drafter" as const,
        prompt: "x"
      };
      let evidenceWritten!: () => void;
      const evidenceAttempt = new Promise<void>((r) => (evidenceWritten = r));
      let batches = 0;
      const trackingDb = new Proxy(testEnv.DB, {
        get(target, prop) {
          if (prop === "batch")
            return async (statements: D1PreparedStatement[]) => {
              const n = ++batches;
              try {
                return await target.batch(statements);
              } finally {
                if (n === 3) evidenceWritten();
              }
            };
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      vi.useFakeTimers();
      const failed = expect(
        complete({ ...deps(provider), db: trackingDb }, input)
      ).rejects.toMatchObject({ code: "provider_error" });
      await reached;
      await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS);
      await failed;
      vi.useRealTimers();
      const a = await import("../../shared/db/repos/llmAccountingRepo");
      const op = (await a.getOperation(testEnv.DB, RUN_ID, "late"))!;
      if (reconciled)
        await a.reconcile(
          testEnv.DB,
          op.id,
          {
            requestId: "late-reconcile-" + op.id,
            expectedVersion: op.version,
            decision: "confirmed_no_charge",
            evidenceReference: "ticket:late",
            note: "Confirmed"
          },
          "Operator",
          NOW
        );
      resolve({
        text: "late private answer",
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0.75,
        providerRequestId: "late-generation"
      });
      await evidenceAttempt;
      expect(await a.getOperationById(testEnv.DB, op.id)).toMatchObject(
        reconciled
          ? {
              liability_cents: 0,
              provider_request_id: null,
              state: "reconciled"
            }
          : {
              liability_cents: 75,
              provider_request_id: "late-generation",
              state: "uncertain"
            }
      );
    }
  );
  it("releases only a proven local policy refusal between claim and paid Workers invocation", async () => {
    const policy = COST_POLICIES[0]!;
    let clock = policy.verifiedAt;
    await insertRun();
    await seedConfig(
      { drafter: { provider: "workersai", model: policy.model } },
      100
    );
    let batches = 0;
    const db = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === "batch")
          return async (statements: D1PreparedStatement[]) => {
            const result = await target.batch(statements);
            if (++batches === 2) clock = policy.validUntil;
            return result;
          };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
    const run = vi.fn();
    const provider = createWorkersAiProvider({
      AI: { run }
    } as unknown as Env)!;
    await expect(
      complete(
        { db, provider, now: () => clock },
        {
          operationKey: "expiry-before-invoke",
          runId: RUN_ID,
          role: "drafter",
          prompt: "x"
        }
      )
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(run).not.toHaveBeenCalled();
    expect(
      await testEnv.DB.prepare(
        "SELECT state,liability_cents FROM llm_operations WHERE run_id=?"
      )
        .bind(RUN_ID)
        .first()
    ).toEqual({ state: "released", liability_cents: 0 });
  });
  it("rechecks identity when a duplicate reservation appears after the initial identity read", async () => {
    await insertRun({ budgetCents: 50 });
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 50);
    let resume!: () => void;
    let arrived!: () => void;
    const paused = new Promise<void>((r) => (arrived = r)),
      hold = new Promise<void>((r) => (resume = r));
    let intercepted = false;
    const db = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === "prepare")
          return (sql: string) => {
            const wrap = (st: D1PreparedStatement): D1PreparedStatement =>
              new Proxy(st, {
                get(stmt, key) {
                  if (key === "bind")
                    return (...v: unknown[]) => wrap(stmt.bind(...v));
                  if (
                    key === "first" &&
                    !intercepted &&
                    sql.includes("SELECT * FROM llm_operations WHERE run_id")
                  )
                    return async () => {
                      intercepted = true;
                      const value = await stmt.first();
                      arrived();
                      await hold;
                      return value;
                    };
                  const v = Reflect.get(stmt, key);
                  return typeof v === "function" ? v.bind(stmt) : v;
                }
              });
            return wrap(target.prepare(sql));
          };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
    let release!: () => void;
    let enter!: () => void;
    const running = new Promise<void>((r) => (enter = r)),
      providerHold = new Promise<void>((r) => (release = r));
    const invoke = vi.fn(async () => {
      enter();
      await providerHold;
      return {
        text: "ok",
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0
      };
    });
    const provider = { name: "fake", complete: invoke };
    const input = {
      operationKey: "identical",
      runId: RUN_ID,
      role: "drafter" as const,
      prompt: "x"
    };
    const duplicate = expect(
      complete({ ...deps(provider), db }, input)
    ).rejects.toMatchObject({ code: "operation_pending" });
    await paused;
    const winner = complete(deps(provider), input);
    await running;
    resume();
    await duplicate;
    expect((await runsRepo.getRunById(testEnv.DB, RUN_ID))?.status).toBe(
      "running"
    );
    release();
    await winner;
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

it.each(["run", "period"])(
  "refuses dispatch if an %s anomaly appears after reservation but before claim",
  async (scope) => {
    const clock =
      scope === "run" ? "2027-01-02T00:00:00.000Z" : "2027-01-03T00:00:00.000Z";
    await insertRun({ budgetCents: 100 });
    const targetRun = RUN_ID;
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
    const a = await import("../../shared/db/repos/llmAccountingRepo");
    let issueRun = targetRun;
    if (scope === "period") {
      await insertRun({ budgetCents: 100 });
      issueRun = RUN_ID;
      await testEnv.DB.prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
        .bind(
          "claim-" + targetRun,
          clock,
          "2027-01-04T00:00:00.000Z",
          500,
          "reviewed claim race"
        )
        .run();
    }
    let arrive!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>((r) => (arrive = r)),
      held = new Promise<void>((r) => (resume = r));
    let batches = 0;
    const db = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (++batches === 2) {
              arrive();
              await held;
            }
            return target.batch(statements);
          };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
    const provider = fakeProvider();
    const refused = expect(
      complete(
        { ...deps(provider), db, now: () => clock },
        {
          operationKey: "claim-race",
          runId: targetRun,
          role: "drafter",
          prompt: "x"
        }
      )
    ).rejects.toThrow();
    await reached;
    await testEnv.DB.prepare(
      "INSERT INTO llm_calls (id,run_id,role,provider,model,cost_cents,currency,created_at,accounting_issue) VALUES (?,?,'reviewer','fake','m',60,'USD',?,'reported_cost_exceeds_bound')"
    )
      .bind("late-issue-" + targetRun, issueRun, clock)
      .run();
    resume();
    await refused;
    expect(provider.count()).toBe(0);
    expect(
      await a.getOperation(testEnv.DB, targetRun, "claim-race")
    ).toMatchObject({ state: "reserved" });
  }
);

it.each([
  "run",
  "fallback",
  "shared-period",
  "new-period",
  "run-equality",
  "period-equality"
])(
  "rechecks numeric %s capacity in the dispatch claim transaction",
  async (scenario) => {
    const index = [
      "run",
      "fallback",
      "shared-period",
      "new-period",
      "run-equality",
      "period-equality"
    ].indexOf(scenario);
    const clock = new Date(Date.UTC(2028, 0, index + 1)).toISOString();
    const end = new Date(Date.parse(clock) + 86400000).toISOString();
    await insertRun({ budgetCents: scenario === "fallback" ? null : 100 });
    const targetRun = RUN_ID;
    await seedConfig({ drafter: { provider: "fake", model: "m" } }, 100);
    const a = await import("../../shared/db/repos/llmAccountingRepo");
    const hasPrior = !["new-period", "period-equality"].includes(scenario);
    let prior: Awaited<ReturnType<typeof a.reserve>> | undefined;
    if (hasPrior) {
      let priorRun = targetRun;
      if (scenario === "shared-period") {
        await insertRun({ budgetCents: 100 });
        priorRun = RUN_ID;
        await testEnv.DB.prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
          .bind(
            "numeric-" + targetRun,
            clock,
            end,
            100,
            "numeric claim regression"
          )
          .run();
      }
      prior = await a.reserve(testEnv.DB, {
        id: "numeric-prior-" + targetRun,
        runId: priorRun,
        role: "reviewer",
        key: "prior",
        fingerprint: "prior",
        owner: "prior-owner",
        bound: 50,
        budget: 100,
        policy: fixtureCostPolicy("fake", "m", clock),
        now: clock,
        awaiting: false
      });
      await a.claimDispatch(testEnv.DB, prior, prior.owner, clock);
    }
    let arrive!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>((r) => (arrive = r)),
      held = new Promise<void>((r) => (resume = r));
    let batches = 0;
    const db = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (++batches === 2) {
              arrive();
              await held;
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const provider = fakeProvider();
    const outcome = complete(
      { ...deps(provider), db, now: () => clock },
      {
        operationKey: "numeric-claim",
        runId: targetRun,
        role: "drafter",
        prompt: "x"
      }
    ).then(
      (result) => ({ result }),
      (error) => ({ error })
    );
    await reached;
    if (prior) {
      await a.markUncertain(
        testEnv.DB,
        prior.id,
        prior.owner,
        "charge_under_review"
      );
      await a.reconcile(
        testEnv.DB,
        prior.id,
        {
          requestId: "numeric-reconcile-" + targetRun,
          expectedVersion: 3,
          decision: "confirmed_charge",
          originalUsd: scenario === "run-equality" ? "0.50" : "0.60",
          evidenceReference: "invoice:numeric",
          note: "Verified higher provider amount"
        },
        "Operator",
        clock
      );
      expect(await a.accountingForRun(testEnv.DB, targetRun)).toMatchObject({
        issueCount: 0
      });
      expect(await a.getOperationById(testEnv.DB, prior.id)).toMatchObject({
        state: "reconciled",
        issue: null
      });
    } else {
      await testEnv.DB.prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
        .bind(
          "new-numeric-" + targetRun,
          clock,
          end,
          scenario === "period-equality" ? 50 : 49,
          "provisioned after reservation"
        )
        .run();
    }
    resume();
    const result = await outcome;
    const allowed = scenario.endsWith("equality");
    expect("error" in result).toBe(!allowed);
    expect(provider.count()).toBe(allowed ? 1 : 0);
    expect(
      await a.getOperation(testEnv.DB, targetRun, "numeric-claim")
    ).toMatchObject({ state: allowed ? "settled" : "reserved" });
  }
);
