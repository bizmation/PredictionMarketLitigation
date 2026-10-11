import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  COST_POLICIES,
  resolveCostPolicy
} from "../../../pipeline/ai/costPolicy";
import { fixtureCostPolicy } from "../../../test/costPolicyFixture";
import * as accounting from "./llmAccountingRepo";

const OLD_ID = "acceptance-3-36-deepinfra-20261004";
const NEW_ID = "staging-deepinfra-v4flash-20261011";
const OLD_START = "2026-10-04T19:10:00.000Z";
const HANDOFF = "2026-10-11T19:10:00.000Z";
const BEFORE = "2026-10-11T19:09:59.000Z";
const NEW_END = "2026-10-18T00:10:57.000Z";
const INSIDE_END = "2026-10-18T00:10:56.999Z";
const QUOTED_MODEL = '"model":"deepseek-ai/DeepSeek-V4-Flash"';
const RULING =
  'Patrick 2026-10-11 10:07 AM ET: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."';

type Migration = { name: string; queries: string[] };
type PeriodRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  cap_cents: number;
  provenance: string;
};

function bindings() {
  return env as unknown as {
    DB: D1Database;
    UPGRADE_DB: D1Database;
    TEST_MIGRATIONS: Migration[];
  };
}

function migration0025(): Migration {
  const found = bindings().TEST_MIGRATIONS.find((entry) =>
    entry.name.startsWith("0025")
  );
  expect(found?.queries.length).toBeGreaterThan(0);
  return found!;
}

async function period(db: D1Database, id: string) {
  return db
    .prepare(
      "SELECT id, starts_at, ends_at, cap_cents, provenance FROM llm_periods WHERE id=?"
    )
    .bind(id)
    .first<PeriodRow>();
}

async function attributed(db: D1Database, operationId: string) {
  const { results } = await db
    .prepare(
      "SELECT period_id FROM llm_operation_periods WHERE operation_id=? ORDER BY period_id"
    )
    .bind(operationId)
    .all<{ period_id: string }>();
  return results.map((row) => row.period_id);
}

it("does not insert the renewal on the Workers AI seed", async () => {
  const db = bindings().DB;
  const applied = await db
    .prepare("SELECT name FROM d1_migrations WHERE name LIKE '0025%'")
    .first<{ name: string }>();
  expect(applied?.name.startsWith("0025")).toBe(true);
  const roles = await db
    .prepare("SELECT roles_json FROM gateway_config WHERE id='current'")
    .first<{ roles_json: string }>();
  expect(roles?.roles_json).not.toContain(QUOTED_MODEL);
  expect(await period(db, NEW_ID)).toBeNull();
});

it("renews the V4-Flash period once and hands off at 19:10:00Z", async () => {
  const { UPGRADE_DB: db, TEST_MIGRATIONS: migrations } = bindings();
  const migration = migration0025();
  const v4 = COST_POLICIES.find(
    (entry) =>
      entry.provider === "deepinfra" &&
      entry.model === "deepseek-ai/DeepSeek-V4-Flash"
  );
  expect(v4?.validUntil).toBe(NEW_END);
  const startMs = Date.parse(HANDOFF);
  const plus7 = startMs + 7 * 86400000;
  expect(Math.min(plus7, Date.parse(v4!.validUntil))).toBe(
    Date.parse(v4!.validUntil)
  );
  expect(plus7 - Date.parse(v4!.validUntil)).toBe(
    (18 * 3600 + 59 * 60 + 3) * 1000
  );
  expect(new Date(plus7).toISOString()).toBe("2026-10-18T19:10:00.000Z");
  expect(resolveCostPolicy("deepinfra", v4!.model, HANDOFF).validUntil).toBe(
    NEW_END
  );
  expect(() => resolveCostPolicy("deepinfra", v4!.model, NEW_END)).toThrow(
    /Expired or invalid cost policy validity/
  );
  await applyD1Migrations(
    db,
    migrations.filter((entry) => entry.name < migration.name)
  );
  await db
    .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
    .bind(OLD_ID, OLD_START, HANDOFF, 100, "acceptance fixture")
    .run();
  const oldBefore = await period(db, OLD_ID);
  await db.batch(migration.queries.map((sql) => db.prepare(sql)));
  expect(await period(db, NEW_ID)).toBeNull();
  await db
    .prepare("UPDATE gateway_config SET roles_json=? WHERE id='current'")
    .bind(
      JSON.stringify({
        drafter: {
          provider: "deepinfra",
          model: "deepseek-ai/DeepSeek-V4-Flash-extra"
        }
      })
    )
    .run();
  await db.batch(migration.queries.map((sql) => db.prepare(sql)));
  expect(await period(db, NEW_ID)).toBeNull();
  await db
    .prepare("UPDATE gateway_config SET roles_json=? WHERE id='current'")
    .bind(
      JSON.stringify({
        drafter: {
          provider: "deepinfra",
          model: "deepseek-ai/DeepSeek-V4-Flash"
        }
      })
    )
    .run();
  await applyD1Migrations(db, [migration]);
  expect(
    await db
      .prepare("SELECT name FROM d1_migrations WHERE name LIKE '0025%'")
      .first<{ name: string }>()
  ).toMatchObject({ name: expect.stringMatching(/^0025/) });
  await db.batch(migration.queries.map((sql) => db.prepare(sql)));
  await applyD1Migrations(db, [migration]);
  const created = await period(db, NEW_ID);
  expect(created).toEqual({
    id: NEW_ID,
    starts_at: HANDOFF,
    ends_at: v4!.validUntil,
    cap_cents: 100,
    provenance: RULING
  });
  expect(
    await db
      .prepare("SELECT COUNT(*) AS n FROM llm_periods WHERE id=?")
      .bind(NEW_ID)
      .first<{ n: number }>()
  ).toEqual({ n: 1 });
  expect(await period(db, OLD_ID)).toEqual(oldBefore);
  const runId = "run-20261011-aa01";
  await db
    .prepare(
      "INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES (?,'manual','hitl','running',?,0,'USD',100)"
    )
    .bind(runId, BEFORE)
    .run();
  async function reserveAt(now: string, key: string) {
    const id = crypto.randomUUID();
    await accounting.reserve(db, {
      id,
      runId,
      role: "drafter",
      key,
      fingerprint: "fp",
      owner: crypto.randomUUID(),
      bound: 1,
      budget: 100,
      policy: fixtureCostPolicy("deepinfra", v4!.model, now),
      now,
      awaiting: false
    });
    return id;
  }
  const beforeId = await reserveAt(BEFORE, "draft:1:drafter");
  const handoffId = await reserveAt(HANDOFF, "draft:2:drafter");
  const insideEndId = await reserveAt(INSIDE_END, "draft:3:drafter");
  const endId = await reserveAt(NEW_END, "draft:4:drafter");
  expect(await attributed(db, beforeId)).toEqual([OLD_ID]);
  expect(await attributed(db, handoffId)).toEqual([NEW_ID]);
  expect(await attributed(db, insideEndId)).toEqual([NEW_ID]);
  expect(await attributed(db, endId)).toEqual([]);
  const capRun = "run-20261011-aa02";
  await db
    .prepare(
      "INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES (?,'manual','hitl','running',?,0,'USD',200)"
    )
    .bind(capRun, HANDOFF)
    .run();
  async function reserveBound(bound: number, key: string) {
    return accounting.reserve(db, {
      id: crypto.randomUUID(),
      runId: capRun,
      role: "drafter",
      key,
      fingerprint: "fp",
      owner: crypto.randomUUID(),
      bound,
      budget: 200,
      policy: fixtureCostPolicy("deepinfra", v4!.model, HANDOFF),
      now: HANDOFF,
      awaiting: false
    });
  }
  const first = await reserveBound(60, "draft:cap:1");
  expect(await attributed(db, first.id)).toEqual([NEW_ID]);
  await expect(reserveBound(50, "draft:cap:2")).rejects.toBeInstanceOf(
    accounting.AccountingRefused
  );
});
