import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { complete, type LlmProvider } from "../ai/gateway";
import { append } from "./evidence";

/**
 * Story 3.8 — Evidence projector: scrub on write, and the gateway budget-stop
 * path must go through this module rather than a raw `evidence_events` INSERT.
 */

const testEnv = env as Env;
const NOW = "2026-09-11T16:00:00.000Z";

let seq = 0xc00;
function newRunId(): string {
  seq += 1;
  return `run-20260911-${seq.toString(16).padStart(4, "0")}`;
}

async function seedRun(): Promise<string> {
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
    budgetCents: 100,
    scheduledFor: "2026-09-11"
  });
  return id;
}

describe("evidence projector (story 3.8)", () => {
  it("strips secret-bearing keys before D1 insert and keeps the rest", async () => {
    const runId = await seedRun();
    await append(testEnv.DB, {
      id: `e:${runId}:secret`,
      runId,
      event: "source.fetched",
      payload: { apiKey: "x", source: "cl" },
      createdAt: NOW
    });

    const rows = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ source: "cl" });
    expect(JSON.stringify(rows[0]!.payload)).not.toContain("apiKey");
    expect(JSON.stringify(rows[0]!.payload)).not.toContain('"x"');

    const stored = await testEnv.DB.prepare(
      `SELECT payload_json FROM evidence_events WHERE id = ?`
    )
      .bind(`e:${runId}:secret`)
      .first<{ payload_json: string }>();
    expect(stored?.payload_json).toBe('{"source":"cl"}');
    expect(stored?.payload_json).not.toContain("apiKey");
  });

  it("strips compound secret keys and embedded credential-shaped values", async () => {
    const runId = await seedRun();
    await append(testEnv.DB, {
      id: `e:${runId}:compound`,
      runId,
      event: "source.fetched",
      payload: {
        source: "cl",
        tool: "publish_f1",
        reason: "error",
        draftId: "d-1",
        openaiApiKey: "x",
        api_token: "y",
        "x-api-key": "z",
        aws_secret_access_key: "w",
        note: "prefix Bearer sk-live-abcdefghijklmnopqrstuv suffix"
      },
      createdAt: NOW
    });

    const rows = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(rows[0]!.payload).toEqual({
      source: "cl",
      tool: "publish_f1",
      reason: "error",
      draftId: "d-1"
    });
    expect(JSON.stringify(rows[0]!.payload)).not.toMatch(
      /openaiApiKey|api_token|x-api-key|aws_secret_access_key|Bearer|sk-live/i
    );
  });

  it("strips credential-shaped values nested under ordinary keys", async () => {
    const runId = await seedRun();
    await append(testEnv.DB, {
      id: `e:${runId}:cred`,
      runId,
      event: "source.fetched",
      payload: {
        source: "cl",
        header: "Bearer sk-live-abcdefghijklmnopqrstuv",
        nested: { authorization: "secret-token", keep: "ok" }
      },
      createdAt: NOW
    });

    const rows = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(rows[0]!.payload).toEqual({ source: "cl", nested: { keep: "ok" } });
    expect(JSON.stringify(rows[0]!.payload)).not.toMatch(
      /Bearer|sk-live|authorization/i
    );
  });

  it("gateway budget-stop writes run.stopped through the projector", async () => {
    const runId = await seedRun();
    await testEnv.DB.prepare(
      `INSERT INTO llm_calls (id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at)
       VALUES (?, ?, 'drafter', 'fake', 'prior-model', NULL, 100, 'USD', ?)`
    )
      .bind(`prior-${runId}`, runId, NOW)
      .run();
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          orchestrator: { provider: "fake", model: "orch-v1" }
        }),
        NOW
      )
      .run();

    const provider: LlmProvider = {
      name: "fake",
      complete: async () => {
        throw new Error("provider must not be called");
      }
    };

    await expect(
      complete(
        {
          db: testEnv.DB,
          provider,
          now: () => NOW,
          newId: () => "id-stop"
        },
        { role: "orchestrator", runId, prompt: "go" }
      )
    ).rejects.toMatchObject({ code: "budget_stopped" });

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const stopped = evidence.find((row) => row.event === "run.stopped");
    expect(stopped?.id).toBe(`ev-budget-stop-${runId}`);
    expect(stopped?.payload).toEqual({ reason: "budget_stopped" });
  });
});
