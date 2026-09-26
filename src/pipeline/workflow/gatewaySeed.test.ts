import { fixtureCostPolicy } from "../../test/costPolicyFixture";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as roleModelsRepo from "../../shared/db/repos/roleModelsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { GATEWAY_ROLE_VALUES } from "../../shared/schemas/vocabulary";
import type { GatewayDeps, LlmProvider } from "../ai/gateway";
import type { SourceCheck } from "../connectors/connector";
import { submitTurn } from "../steering/submitTurn";
import {
  ensureRun,
  packageDailyRun,
  reviewDailyRun,
  runIdFor
} from "./dailyRunSteps";

/**
 * Story 3.19 — migration 0017 seeds `gateway_config`. This file deliberately
 * seeds NOTHING into that table: storage isolation is per test file
 * (Cloudflare Vitest integration, vitest 4), so a "no test seeding" case has
 * to live in a file where no earlier test upserted the row. Everything here
 * runs against exactly what the migrations leave behind.
 */

const testEnv = env as Env;

const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SEED_STATEMENT = `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
VALUES ('current', 1, '{}', 1, '2026-09-17T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING`;

function fakeProvider(
  script: string[] = []
): LlmProvider & { count: () => number; models: () => string[] } {
  let calls = 0;
  const models: string[] = [];
  return {
    name: "workersai",
    count: () => calls,
    models: () => models,
    complete: async ({ model }) => {
      const text = script[calls] ?? "";
      calls += 1;
      models.push(model);
      return {
        text,
        inputTokens: 1,
        outputTokens: 1,
        reportedCostUsd: 0
      };
    }
  };
}

function deps(provider: LlmProvider): GatewayDeps {
  return { db: testEnv.DB, costPolicy: fixtureCostPolicy, provider };
}

const oneDraft: Record<string, SourceCheck> = {
  "CFTC press": () => [
    {
      entities: [
        {
          type: "states",
          id: "st-nv",
          diff: { operationalStatus: { from: "go", to: "restricted" } },
          body: "Nevada restricted.",
          confidence: 80
        }
      ]
    }
  ]
};

const DRAFTER_JSON = JSON.stringify({
  body: "Drafter overwrite.",
  diff: { operationalStatus: { from: "go", to: "restricted" } }
});
const REVIEWER_JSON = JSON.stringify({
  confidence: 72,
  citationCompleteness: 90,
  notes: "cited",
  disagrees: false,
  disagreement: ""
});

describe("migration 0017 gateway seed (story 3.19)", () => {
  it("seeds all five roles to Workers AI at version 1 with a 500-cent default budget", async () => {
    const config = await roleModelsRepo.readConfig(testEnv.DB);
    expect(config).not.toBeNull();
    expect(config?.version).toBe(1);
    expect(config?.defaultBudgetCents).toBe(500);
    for (const role of GATEWAY_ROLE_VALUES) {
      expect(config?.roles[role]).toEqual({
        provider: "workersai",
        model: WORKERS_AI_MODEL
      });
    }
  });

  it("adds idx_runs_started_at on runs", async () => {
    const row = await testEnv.DB.prepare(
      `SELECT name, tbl_name FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_runs_started_at'`
    ).first<{ name: string; tbl_name: string }>();
    expect(row).toEqual({ name: "idx_runs_started_at", tbl_name: "runs" });
  });

  it("is idempotent: re-running the seed statement leaves an existing row untouched", async () => {
    const before = await roleModelsRepo.readConfig(testEnv.DB);
    await testEnv.DB.prepare(SEED_STATEMENT).run();
    const after = await roleModelsRepo.readConfig(testEnv.DB);
    expect(after).toEqual(before);
    expect(after?.defaultBudgetCents).toBe(500);
  });

  it("a manual Run with no test seeding drafts and reviews on workersai and reaches awaiting", async () => {
    const date = "2026-09-17";
    await ensureRun(testEnv.DB, "manual", date);
    const id = runIdFor(date, "manual");
    const provider = fakeProvider([DRAFTER_JSON, REVIEWER_JSON]);

    const packaged = await packageDailyRun(
      testEnv.DB,
      id,
      deps(provider),
      oneDraft
    );
    expect(packaged).toMatchObject({ skip: false, draftCount: 1 });
    await reviewDailyRun(testEnv.DB, packaged, deps(provider));

    expect(provider.count()).toBe(2);
    expect(provider.models()).toEqual([WORKERS_AI_MODEL, WORKERS_AI_MODEL]);
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.status).toBe("awaiting");
    expect(run?.budgetCents).toBe(500);

    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.evalSummary?.status).toBe("ok");
    expect(drafts[0]?.confidence).toBe(72);

    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.some((e) => e.event === "draft.evaluated")).toBe(true);
    expect(evidence.some((e) => e.event === "gate.awaiting_approval")).toBe(
      true
    );
    expect(evidence.some((e) => e.event === "run.stopped")).toBe(false);

    const calls = await testEnv.DB.prepare(
      `SELECT role, provider, model FROM llm_calls WHERE run_id = ? ORDER BY role`
    )
      .bind(id)
      .all<{ role: string; provider: string; model: string }>();
    expect(calls.results).toEqual([
      { role: "drafter", provider: "workersai", model: WORKERS_AI_MODEL },
      { role: "reviewer", provider: "workersai", model: WORKERS_AI_MODEL }
    ]);
  });

  it("a steward ask with no test seeding resolves the seeded steward model and records the call", async () => {
    const date = "2026-09-15";
    await ensureRun(testEnv.DB, "manual", date);
    const id = runIdFor(date, "manual");
    const provider = fakeProvider(["steward reply"]);
    const result = await submitTurn(testEnv.DB, deps(provider), {
      runId: id,
      content: "What changed?",
      private: false,
      actorDisplayName: "Distinctive Queue Operator"
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.turn.reply).toBe("steward reply");
    expect(provider.models()).toEqual([WORKERS_AI_MODEL]);
    const call = await testEnv.DB.prepare(
      `SELECT provider, model FROM llm_calls WHERE run_id = ? AND role = 'steward'`
    )
      .bind(id)
      .first<{ provider: string; model: string }>();
    expect(call).toEqual({ provider: "workersai", model: WORKERS_AI_MODEL });
  });

  it("enforces the seeded 500-cent ceiling on a Run without its own budget", async () => {
    const date = "2026-09-16";
    await ensureRun(testEnv.DB, "manual", date);
    const id = runIdFor(date, "manual");
    await testEnv.DB.prepare(
      `INSERT INTO llm_calls (id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at)
       VALUES (?, ?, 'drafter', 'workersai', ?, NULL, 500, 'USD', ?)`
    )
      .bind(`prior-${id}`, id, WORKERS_AI_MODEL, "2026-09-16T16:00:00.000Z")
      .run();
    const provider = fakeProvider([DRAFTER_JSON, REVIEWER_JSON]);
    const packaged = await packageDailyRun(
      testEnv.DB,
      id,
      deps(provider),
      oneDraft
    );
    await reviewDailyRun(testEnv.DB, packaged, deps(provider));
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("stopped");
  });
});
