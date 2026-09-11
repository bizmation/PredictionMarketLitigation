import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as runsRepo from "../../shared/db/repos/runsRepo";
import {
  complete,
  createWorkersAiProvider,
  invokeTool,
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
        costCents: overrides.costCents ?? 0
      };
    }
  };
}

let idSeq = 0;
const deterministicNewId = () => `id-${++idSeq}`;

function deps(provider: LlmProvider) {
  return {
    db: testEnv.DB,
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
    const provider = fakeProvider();
    await expect(
      complete(deps(provider), {
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
          provider: null as unknown as LlmProvider,
          now: () => NOW,
          newId: deterministicNewId
        },
        { role: "drafter", runId: RUN_ID, prompt: "hi" }
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
    await complete(
      deps(fakeProvider({ inputTokens: null, outputTokens: null })),
      { role: "drafter", runId: RUN_ID, prompt: "draft this" }
    );
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

  it("falls back to the config default ceiling when the Run has no budget_cents", async () => {
    await insertRun({ budgetCents: null });
    await seedConfig(
      { orchestrator: { provider: "fake", model: "orch-v1" } },
      50
    );
    await recordPriorSpend(50);
    await expect(
      complete(deps(fakeProvider()), {
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

describe("createWorkersAiProvider adapter (story 3.2)", () => {
  it("returns text and tokens from a string AI.run response", async () => {
    const provider = createWorkersAiProvider({
      AI: {
        run: async () => ({
          response: "hello from workers",
          usage: { prompt_tokens: 4, completion_tokens: 6 }
        })
      }
    } as unknown as Env);
    expect(provider).not.toBeNull();
    await expect(
      provider!.complete({ model: "@cf/test", prompt: "hi" })
    ).resolves.toEqual({
      text: "hello from workers",
      inputTokens: 4,
      outputTokens: 6,
      costCents: 0
    });
  });

  it.each([undefined, null, 12, { nested: true }])(
    "rejects non-string AI.run response %s",
    async (response) => {
      const provider = createWorkersAiProvider({
        AI: {
          run: async () => ({
            response,
            usage: { prompt_tokens: 1, completion_tokens: 1 }
          })
        }
      } as unknown as Env);
      await expect(
        provider!.complete({ model: "@cf/test", prompt: "hi" })
      ).rejects.toThrow("non-text model output");
    }
  );
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
