import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { pauseBatch } from "../../test/failingDb";
import { insertReviewedDraft } from "../../test/reviewedDraft";
import * as drafts from "../../shared/db/repos/draftsRepo";
import * as runs from "../../shared/db/repos/runsRepo";
import * as evidence from "../../shared/db/repos/evidenceRepo";
import { assertStmt } from "../../shared/db/repos/gateAssertions";
import { decide } from "./approval";

const db = (env as Env).DB;
const now = "2026-09-25T10:00:00.000Z";
let seq = 0;
beforeEach(async () => {
  await db
    .prepare("UPDATE states SET name = 'Alaska' WHERE id = 'st-ak'")
    .run();
});
async function fixture(
  type = "states",
  target = "st-ak",
  diff: unknown = { name: { from: "Alaska", to: "Alaska reviewed" } }
) {
  const runId = `run-20260925-${(++seq).toString(16).padStart(4, "0")}`;
  await runs.insertRun(db, {
    id: runId,
    origin: "scheduled",
    mode: "hitl",
    status: "awaiting",
    startedAt: now,
    completedAt: now,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-25"
  });
  const id = `atomic:${runId}`;
  await insertReviewedDraft(db, {
    id,
    runId,
    targetEntityType: type,
    targetEntityId: target,
    diff,
    body: "Original reviewed text",
    tier2Only: false,
    confidence: 90,
    evalSummary: {
      status: "ok",
      basis: "Cited",
      citationCompleteness: 100,
      disagreement: { flagged: false, description: null },
      ineligible: []
    },
    createdAt: now
  });
  return (await drafts.getById(db, id))!;
}
const approve = (draftId: string) => ({
  draftId,
  action: "approve" as const,
  operator: { displayName: "Winner" },
  now
});
const reject = (draftId: string) => ({
  ...approve(draftId),
  action: "reject" as const,
  rejectReason: "Not supported",
  rejectReasonPrivate: null
});
async function receipts(runId: string) {
  return (await evidence.listByRun(db, runId)).filter(
    (e) => e.event === "gate.decided" || e.event === "run.completed"
  );
}

it("a failed assertion rolls back earlier real D1 writes", async () => {
  await expect(
    db.batch([
      db.prepare("UPDATE states SET name = 'rollback' WHERE id = 'st-ak'"),
      assertStmt(db, "test", "0")
    ])
  ).rejects.toThrow("gate_assertion_failed");
  expect(
    (await db.prepare("SELECT name FROM states WHERE id = 'st-ak'").first())
      ?.name
  ).toBe("Alaska");
});

it("concurrent duplicate decisions preserve the winner's publication and actor", async () => {
  const d = await fixture();
  const a = pauseBatch(db),
    b = pauseBatch(db);
  const first = decide(a.db, approve(d.id));
  const second = decide(b.db, {
    ...approve(d.id),
    operator: { displayName: "Loser" }
  });
  await Promise.all([a.arrived, b.arrived]);
  a.release();
  expect((await first).status).toBe("decided");
  b.release();
  expect((await second).status).toBe("conflict");
  expect((await drafts.getById(db, d.id))?.decidedBy).toBe("Winner");
  expect((await receipts(d.runId)).map((e) => e.event)).toEqual([
    "gate.decided",
    "run.completed"
  ]);
});

it.each([true, false])(
  "concurrent last siblings derive a single completion (published=%s)",
  async (published) => {
    const d = await fixture();
    await insertReviewedDraft(db, {
      ...d,
      id: `${d.id}:sibling`,
      createdAt: now
    });
    const a = pauseBatch(db),
      b = pauseBatch(db);
    const first = decide(a.db, published ? approve(d.id) : reject(d.id));
    const second = decide(b.db, reject(`${d.id}:sibling`));
    await Promise.all([a.arrived, b.arrived]);
    a.release();
    expect((await first).status).toBe("decided");
    expect((await runs.getRunById(db, d.runId))?.status).toBe("awaiting");
    b.release();
    expect((await second).status).toBe("decided");
    const events = await receipts(d.runId);
    expect(events.map((e) => e.event)).toEqual([
      "gate.decided",
      "gate.decided",
      "run.completed"
    ]);
    expect(events[2]?.payload).toEqual({
      status: published ? "published" : "rejected"
    });
  }
);

it.each(["body", "diff_json", "eval_summary_json", "run", "receipt"])(
  "refuses a changed prepared snapshot: %s",
  async (field) => {
    const d = await fixture();
    const barrier = pauseBatch(db);
    const pending = decide(barrier.db, approve(d.id));
    await barrier.arrived;
    if (field === "run")
      await db
        .prepare(
          "UPDATE runs SET status = 'running', completed_at = NULL WHERE id = ?"
        )
        .bind(d.runId)
        .run();
    else if (field === "receipt")
      await db
        .prepare(
          "DELETE FROM evidence_events WHERE run_id = ? AND event = 'guardrails.passed'"
        )
        .bind(d.runId)
        .run();
    else
      await db
        .prepare(`UPDATE drafts SET ${field} = ? WHERE id = ?`)
        .bind(
          field === "body"
            ? "Changed text"
            : field === "diff_json"
              ? "{}"
              : null,
          d.id
        )
        .run();
    barrier.release();
    expect((await pending).status).toBe("conflict");
    expect(await receipts(d.runId)).toEqual([]);
    expect(
      (await db.prepare("SELECT name FROM states WHERE id='st-ak'").first())
        ?.name
    ).toBe("Alaska");
  }
);

it.each([
  ["states", "st-ak", "name", "name", "Alaska", "New Alaska"],
  [
    "cases",
    "case-nv-kalshi-state",
    "decidedAt",
    "decided_at",
    null,
    "2026-09-25"
  ],
  ["circuits", "cir-5", "hasSplit", "has_split", false, true],
  ["entities", "ent-kalshi", "name", "name", "Kalshi", "New Kalshi"],
  [
    "cert_signals",
    "current",
    "factors",
    "factors_json",
    [{ lead: "Old", explanation: "Old fact" }],
    [{ lead: "New", explanation: "New fact" }]
  ]
])(
  "normalizes and rejects stale %s priors even when live equals proposed",
  async (type, target, field, column, from, to) => {
    const table = String(type),
      col = String(column);
    const bind = (value: unknown) =>
      col === "factors_json"
        ? JSON.stringify(value)
        : typeof value === "boolean"
          ? Number(value)
          : value;
    await db
      .prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`)
      .bind(bind(from), target)
      .run();
    const d = await fixture(table, String(target), {
      [String(field)]: { from, to }
    });
    const barrier = pauseBatch(db);
    const pending = decide(barrier.db, approve(d.id));
    await barrier.arrived;
    await db
      .prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`)
      .bind(bind(to), target)
      .run();
    barrier.release();
    expect((await pending).status).toBe("conflict");
    expect((await drafts.getById(db, d.id))?.outcome).toBeNull();
    expect(await receipts(d.runId)).toEqual([]);
    const fresh = await fixture(table, String(target), {
      [String(field)]: { from: to, to: from }
    });
    expect((await decide(db, approve(fresh.id))).status).toBe("decided");
  }
);

it("child-first prevents a prepared parent decision; approval-first refuses admission", async () => {
  const d = await fixture();
  const barrier = pauseBatch(db);
  const pending = decide(barrier.db, approve(d.id));
  await barrier.arrived;
  expect(await drafts.insertRevision(db, d, now)).toBe(true);
  expect(await drafts.insertRevision(db, d, now)).toBe(false);
  barrier.release();
  expect((await pending).status).toBe("conflict");
  expect(await receipts(d.runId)).toEqual([]);
  const other = await fixture();
  expect((await decide(db, approve(other.id))).status).toBe("decided");
  expect(await drafts.insertRevision(db, other, now)).toBe(false);
});

it("late real constraint failures roll back publication, decision and evidence", async () => {
  const d = await fixture();
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === "batch")
        return (stmts: D1PreparedStatement[]) =>
          target.batch([
            ...stmts,
            target.prepare("UPDATE states SET name = NULL WHERE id = 'st-ak'")
          ]);
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  expect((await decide(proxy, approve(d.id))).status).toBe("invalid");
  expect((await drafts.getById(db, d.id))?.outcome).toBeNull();
  expect(await receipts(d.runId)).toEqual([]);
  expect((await runs.getRunById(db, d.runId))?.status).toBe("awaiting");
  expect(
    (await db.prepare("SELECT name FROM states WHERE id='st-ak'").first())?.name
  ).toBe("Alaska");
});

it("a docket case CAS race rolls back source, event, provenance and receipts", async () => {
  const caseId = "case-nv-kalshi-state";
  await db
    .prepare("UPDATE cases SET posture = 'pending' WHERE id = ?")
    .bind(caseId)
    .run();
  const target = `atomic-docket-${seq}`;
  const d = await fixture("docket_events", target, {
    caseId,
    occurredAt: "2026-09-25",
    description: "Court entry",
    sourceUrl: "https://www.courtlistener.com/docket/123/",
    entryNumber: 1,
    statePatch: { posture: { from: "pending", to: "platform" } }
  });
  const barrier = pauseBatch(db);
  const pending = decide(barrier.db, approve(d.id));
  await barrier.arrived;
  await db
    .prepare("UPDATE cases SET posture = 'platform' WHERE id = ?")
    .bind(caseId)
    .run();
  const before = await db
    .prepare("SELECT * FROM cases WHERE id = ?")
    .bind(caseId)
    .first();
  barrier.release();
  expect((await pending).status).toBe("conflict");
  expect(
    await db.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first()
  ).toEqual(before);
  expect(
    await db
      .prepare("SELECT id FROM sources WHERE id = ?")
      .bind(`src-${target}`)
      .first()
  ).toBeNull();
  expect(
    await db
      .prepare("SELECT id FROM docket_events WHERE id = ?")
      .bind(target)
      .first()
  ).toBeNull();
  expect(await receipts(d.runId)).toEqual([]);
});

it("a missing target at commit aborts the entire decision", async () => {
  const target = `atomic-entity-${seq}`;
  await db
    .prepare(
      "INSERT INTO entities (id, slug, name, role, provenance_kind, published_at, updated_at) VALUES (?, ?, 'Temporary', NULL, 'human', ?, ?)"
    )
    .bind(target, target, now, now)
    .run();
  const d = await fixture("entities", target, {
    name: { from: "Temporary", to: "Reviewed" }
  });
  const barrier = pauseBatch(db);
  const pending = decide(barrier.db, approve(d.id));
  await barrier.arrived;
  await db.prepare("DELETE FROM entities WHERE id = ?").bind(target).run();
  barrier.release();
  expect((await pending).status).toBe("conflict");
  expect((await drafts.getById(db, d.id))?.outcome).toBeNull();
  expect(await receipts(d.runId)).toEqual([]);
});

it("historical branches do not keep a Run pending after its maximum revision is decided", async () => {
  const d = await fixture();
  for (const revisionIndex of [1, 2]) {
    await insertReviewedDraft(db, {
      ...d,
      id: `${d.id}:r${revisionIndex}`,
      parentDraftId: d.id,
      revisionIndex,
      createdAt: now
    });
  }
  expect((await decide(db, reject(`${d.id}:r2`))).status).toBe("decided");
  expect((await runs.getRunById(db, d.runId))?.status).toBe("rejected");
  expect((await drafts.getById(db, `${d.id}:r1`))?.outcome).toBeNull();
});

it("factors accept reordered object properties but reject true mutation after preparation", async () => {
  const stored = '[ { "explanation": "Old fact", "lead": "Old" } ]';
  const from = [{ lead: "Old", explanation: "Old fact" }];
  const to = [{ lead: "New", explanation: "New fact" }];
  await db
    .prepare("UPDATE cert_signals SET factors_json = ? WHERE id='current'")
    .bind(stored)
    .run();
  const first = await fixture("cert_signals", "current", {
    factors: { from, to }
  });
  expect((await decide(db, approve(first.id))).status).toBe("decided");
  await db
    .prepare("UPDATE cert_signals SET factors_json = ? WHERE id='current'")
    .bind(stored)
    .run();
  const second = await fixture("cert_signals", "current", {
    factors: { from, to }
  });
  const barrier = pauseBatch(db);
  const request = decide(barrier.db, approve(second.id));
  await barrier.arrived;
  await db
    .prepare("UPDATE cert_signals SET factors_json = ? WHERE id='current'")
    .bind(JSON.stringify(to))
    .run();
  barrier.release();
  expect((await request).status).toBe("conflict");
  expect(await receipts(second.runId)).toEqual([]);
});

it.each(["approve", "edit", "reject"] as const)(
  "unchanged stored JSON representations allow %s",
  async (action) => {
    const d = await fixture("circuits", "cir-5", {
      number: { from: 5, to: 5 }
    });
    const summary = JSON.stringify(
      {
        ineligible: [],
        disagreement: { description: null, flagged: false },
        citationCompleteness: 100,
        basis: "Cited",
        status: "ok"
      },
      null,
      2
    ).replace("100,", "1e2,");
    const diff = '{ "number" : { "to" : 5e0, "from" : 5.0 } }';
    await db
      .prepare(
        "UPDATE drafts SET diff_json = ?, eval_summary_json = ? WHERE id = ?"
      )
      .bind(diff, summary, d.id)
      .run();
    const input =
      action === "reject"
        ? reject(d.id)
        : {
            ...approve(d.id),
            action,
            ...(action === "edit" ? { editedBody: "Human edit" } : {})
          };
    expect((await decide(db, input)).status).toBe("decided");
  }
);

it.each([
  "run_id",
  "target_entity_type",
  "target_entity_id",
  "confidence",
  "tier2_only",
  "edited_body",
  "parent_draft_id",
  "revision_index"
])("commit rejects changed guarded snapshot field %s", async (field) => {
  const root = await fixture();
  const d = {
    ...root,
    id: `${root.id}:child`,
    parentDraftId: root.id,
    revisionIndex: 1
  };
  await insertReviewedDraft(db, d);
  const other = await fixture();
  const barrier = pauseBatch(db);
  const request = decide(barrier.db, approve(d.id));
  await barrier.arrived;
  const values: Record<string, unknown> = {
    run_id: other.runId,
    target_entity_type: "entities",
    target_entity_id: "st-al",
    confidence: 12,
    tier2_only: 1,
    edited_body: "Concurrent edit",
    parent_draft_id: other.id,
    revision_index: 2
  };
  await db
    .prepare(`UPDATE drafts SET ${field} = ? WHERE id = ?`)
    .bind(values[field], d.id)
    .run();
  barrier.release();
  expect((await request).status).toBe("conflict");
  expect(await receipts(root.runId)).toEqual([]);
  expect(
    (await db.prepare("SELECT name FROM states WHERE id='st-ak'").first())?.name
  ).toBe("Alaska");
});

it("awaiting-to-stopped preserves explicit-not-run eligibility and existing stop evidence", async () => {
  const d = await fixture();
  await db
    .prepare("UPDATE drafts SET eval_summary_json = ? WHERE id = ?")
    .bind(
      JSON.stringify({
        ...d.evalSummary,
        status: "evals_not_run",
        basis: "Provider unavailable",
        ineligible: ["evals_not_run"]
      }),
      d.id
    )
    .run();
  const barrier = pauseBatch(db);
  const request = decide(barrier.db, approve(d.id));
  await barrier.arrived;
  await db
    .prepare("UPDATE runs SET status = 'stopped' WHERE id = ?")
    .bind(d.runId)
    .run();
  await evidence.appendEvent(db, {
    id: `stop-${d.id}`,
    runId: d.runId,
    event: "run.stopped",
    payload: { reason: "budget" },
    createdAt: now
  });
  const before = await evidence.listByRun(db, d.runId);
  barrier.release();
  expect((await request).status).toBe("decided");
  expect((await runs.getRunById(db, d.runId))?.status).toBe("stopped");
  const after = await evidence.listByRun(db, d.runId);
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.filter((e) => e.event === "run.completed")).toEqual([]);
  expect(
    (await db.prepare("SELECT name FROM states WHERE id='st-ak'").first())?.name
  ).toBe("Alaska reviewed");
});

it("competing docket identities produce one winner and a conflict with no losing writes", async () => {
  const target = `competing-docket-${seq}`;
  const record = {
    caseId: "case-nv-kalshi-state",
    occurredAt: "2026-09-25",
    description: "Court entry",
    sourceUrl: "https://www.courtlistener.com/docket/123/",
    entryNumber: 1
  };
  const first = await fixture("docket_events", target, record);
  const second = await fixture("docket_events", target, record);
  const a = pauseBatch(db),
    b = pauseBatch(db);
  const winner = decide(a.db, approve(first.id));
  const loser = decide(b.db, approve(second.id));
  await Promise.all([a.arrived, b.arrived]);
  a.release();
  expect((await winner).status).toBe("decided");
  const snapshot = await db
    .prepare("SELECT * FROM cases WHERE id=?")
    .bind(record.caseId)
    .first();
  b.release();
  expect((await loser).status).toBe("conflict");
  expect((await drafts.getById(db, second.id))?.outcome).toBeNull();
  expect(await receipts(second.runId)).toEqual([]);
  expect(
    await db
      .prepare("SELECT * FROM cases WHERE id=?")
      .bind(record.caseId)
      .first()
  ).toEqual(snapshot);
  expect(
    (
      await db
        .prepare("SELECT count(*) AS n FROM docket_events WHERE id=?")
        .bind(target)
        .first()
    )?.n
  ).toBe(1);
  expect(
    (
      await db
        .prepare("SELECT count(*) AS n FROM sources WHERE id=?")
        .bind(`src-${target}`)
        .first()
    )?.n
  ).toBe(1);
});

it.each(["approve", "edit", "reject"] as const)(
  "%s rejects a real JSON snapshot mutation after the initial row read",
  async (action) => {
    const d = await fixture();
    const input =
      action === "reject"
        ? reject(d.id)
        : {
            ...approve(d.id),
            action,
            ...(action === "edit" ? { editedBody: "Human edit" } : {})
          };
    const barrier = pauseBatch(db);
    const pending = decide(barrier.db, input);
    await barrier.arrived;
    await db
      .prepare(
        "UPDATE drafts SET eval_summary_json = json_set(eval_summary_json, '$.basis', 'New evidence') WHERE id = ?"
      )
      .bind(d.id)
      .run();
    barrier.release();
    expect((await pending).status).toBe("conflict");
    expect((await drafts.getById(db, d.id))?.outcome).toBeNull();
    expect(await receipts(d.runId)).toEqual([]);
  }
);
