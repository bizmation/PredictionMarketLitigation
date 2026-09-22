import { env } from "cloudflare:workers";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import worker from "../../server";
import * as runsRepo from "../db/repos/runsRepo";
import * as steeringTurnsRepo from "../db/repos/steeringTurnsRepo";
import { etCalendarDate } from "../lib/schedule";
import { DraftRecordSchema } from "../schemas/run";
import { PublicSteeringTurnSchema } from "../schemas/steering";

/**
 * Story 3.10 — admin approval queue I/O matrix, run through the real Worker
 * with a signed Access JWT against Miniflare D1 (migrations applied by
 * src/test/apply-migrations.ts, 0010 included). The decision path is the
 * first public writer of gate decisions: every case here asserts on the
 * wire shape AND the D1 row AND the gate.decided Evidence event together.
 */

const TEAM = "https://queue.cloudflareaccess.com";
const AUD = "queue-aud";
const EMAIL = "operator@example.com";
// Deliberately NOT a plausible default: asserting this name proves the
// handler used the configured display name rather than any fallback.
const DISPLAY_NAME = "Distinctive Queue Operator";
const TS = "2026-09-12T16:00:00.000Z";
const RUN_STARTED = "2026-09-12T00:00:00.000Z";

const anon = { ...env, ACCESS_DEV_BYPASS: undefined } as Env;
const testEnv = env as Env;

function get(path: string, init?: RequestInit) {
  return new Request(`https://pml.example.com${path}`, init);
}

/**
 * ONE keypair for the whole file — access.ts caches its JWKS per team domain
 * for the isolate's lifetime, so a second keypair under this domain would
 * fail on signature and silently turn identity tests into signature tests.
 */
let privateKey: CryptoKey;
let jwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  jwk = (await exportJWK(pair.publicKey)) as Record<string, unknown>;
  jwk.kid = "queue-1";
  jwk.alg = "RS256";
  jwk.use = "sig";
});

beforeEach(() => {
  vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
});
afterEach(() => vi.unstubAllGlobals());

const realEnv = () =>
  ({
    ...env,
    ACCESS_DEV_BYPASS: undefined,
    TEAM_DOMAIN: TEAM,
    POLICY_AUD: AUD,
    OPERATOR_EMAIL: EMAIL,
    OPERATOR_DISPLAY_NAME: DISPLAY_NAME
  }) as Env;

const sign = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "queue-1" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

const signed = (token: string, path: string, init?: RequestInit) =>
  new Request(`https://pml.example.com${path}`, {
    ...init,
    headers: { "cf-access-jwt-assertion": token, ...init?.headers }
  });

const jsonPost = (token: string, path: string, body: unknown) =>
  signed(token, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

const auth = async (path: string, init?: RequestInit): Promise<Response> => {
  const token = await sign(EMAIL);
  return worker.fetch(signed(token, path, init), realEnv());
};

async function seedRun(runId: string, mode: "hitl" | "yolo" = "hitl") {
  const existing = await testEnv.DB.prepare("SELECT id FROM runs WHERE id = ?")
    .bind(runId)
    .first();
  if (existing) return;
  await runsRepo.insertRun(testEnv.DB, {
    id: runId,
    origin: "scheduled",
    mode,
    status: "awaiting",
    startedAt: RUN_STARTED,
    completedAt: RUN_STARTED,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-12"
  });
}

const DRAFT_INSERT = `INSERT OR IGNORE INTO drafts (id, run_id, target_entity_type,
    target_entity_id, diff_json, body, tier2_only, confidence,
    eval_summary_json, outcome, decided_at, decided_by, edited_body,
    reject_reason, reject_reason_private, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function seedPendingDraft(
  id: string,
  runId: string,
  createdAt = "2026-09-12T16:05:00.000Z",
  patch?: {
    targetEntityType?: string | null;
    targetEntityId?: string | null;
    diffJson?: string;
  }
) {
  return testEnv.DB.prepare(DRAFT_INSERT)
    .bind(
      id,
      runId,
      patch?.targetEntityType === undefined ? "states" : patch.targetEntityType,
      patch?.targetEntityId === undefined ? "st-nv" : patch.targetEntityId,
      patch?.diffJson ?? '{"posture":{"from":"untracked","to":"pending"}}',
      `Pending proposal body for ${id}.`,
      0,
      80,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      createdAt,
      createdAt
    )
    .run();
}

async function evidencePayload(eventId: string): Promise<unknown> {
  const row = await testEnv.DB.prepare(
    "SELECT payload_json FROM evidence_events WHERE id = ?"
  )
    .bind(eventId)
    .first<{ payload_json: string | null }>();
  return row?.payload_json == null ? null : JSON.parse(row.payload_json);
}

async function evidenceCount(eventId: string): Promise<number> {
  const row = await testEnv.DB.prepare(
    "SELECT COUNT(*) AS count FROM evidence_events WHERE id = ?"
  )
    .bind(eventId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function draftRow(id: string): Promise<Record<string, unknown>> {
  const row = await testEnv.DB.prepare(
    `SELECT outcome, decided_at, decided_by, edited_body, reject_reason,
              reject_reason_private, body, run_id
         FROM drafts WHERE id = ?`
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new Error(`Draft ${id} not seeded.`);
  return row;
}

async function f1Snapshot() {
  async function rows(table: string) {
    const { results } = await testEnv.DB.prepare(
      `SELECT * FROM ${table} ORDER BY id`
    ).all();
    return results ?? [];
  }
  return {
    states: await rows("states"),
    cases: await rows("cases"),
    entities: await rows("entities"),
    circuits: await rows("circuits"),
    cert_signals: await rows("cert_signals")
  };
}

async function nvRow() {
  const row = await testEnv.DB.prepare(
    `SELECT posture, provenance_kind, published_at, updated_at
       FROM states WHERE id = 'st-nv'`
  ).first<{
    posture: string;
    provenance_kind: string;
    published_at: string;
    updated_at: string;
  }>();
  if (!row) throw new Error("st-nv missing.");
  return row;
}

async function runStatus(runId: string): Promise<string | null> {
  const row = await testEnv.DB.prepare("SELECT status FROM runs WHERE id = ?")
    .bind(runId)
    .first<{ status: string }>();
  return row?.status ?? null;
}

async function publicNv(): Promise<{
  posture: string;
  provenanceKind: string;
} | null> {
  const res = await worker.fetch(get("/api/states"), testEnv);
  const body = (await res.json()) as {
    items: Array<{ code: string; posture: string; provenanceKind: string }>;
  };
  return body.items.find((item) => item.code === "NV") ?? null;
}

function expectUncacheable(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("vary")).toContain("Cf-Access-Jwt-Assertion");
}

describe("admin approval queue (story 3.10)", () => {
  it("rejects anonymous queue reads with the opaque 403 envelope", async () => {
    const res = await worker.fetch(get("/api/admin/queue"), anon);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
  });

  it("rejects anonymous decisions with the opaque 403 envelope", async () => {
    const res = await worker.fetch(
      get("/api/admin/drafts/x/decision", {
        method: "POST",
        body: JSON.stringify({ action: "approve" })
      }),
      anon
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
  });

  it("lists pending drafts oldest-first, excludes decided, uncacheable", async () => {
    await testEnv.DB.prepare("DELETE FROM drafts").run();
    await seedRun("run-20260912-aaaa");
    await seedPendingDraft(
      "d-queue-old",
      "run-20260912-aaaa",
      "2026-09-12T16:05:00.000Z"
    );
    await seedPendingDraft(
      "d-queue-new",
      "run-20260912-aaaa",
      "2026-09-12T16:10:00.000Z"
    );
    await seedRun("run-20260912-bbbb");
    await testEnv.DB.prepare(DRAFT_INSERT)
      .bind(
        "d-queue-decided",
        "run-20260912-bbbb",
        null,
        null,
        "{}",
        "Already rejected.",
        0,
        null,
        null,
        "rejected",
        TS,
        "Patrick",
        null,
        "Rejected already.",
        null,
        "2026-09-12T16:20:00.000Z",
        "2026-09-12T16:20:00.000Z"
      )
      .run();

    const res = await auth("/api/admin/queue");
    expect(res.status).toBe(200);
    expectUncacheable(res);
    const raw = await res.text();
    expect(raw).not.toContain(EMAIL);
    const body = JSON.parse(raw) as { items: unknown[] };
    expect(body.items.map((item) => (item as { id: string }).id)).toEqual([
      "d-queue-old",
      "d-queue-new"
    ]);
    for (const item of body.items) {
      DraftRecordSchema.parse(item);
    }
    expect(raw).not.toContain("d-queue-decided");
    expect(raw).not.toMatch(/reject_reason_private/);
  });

  it("returns an empty items list when nothing is pending", async () => {
    await testEnv.DB.prepare("DELETE FROM drafts").run();
    const res = await auth("/api/admin/queue");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("is 405 on POST with allow GET, HEAD", async () => {
    const res = await auth("/api/admin/queue", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it.each(["/api//admin/queue", "/api/%61dmin/queue", "/api/admin//queue"])(
    "reaches the handler at %s — guard and handler normalize identically",
    async (path) => {
      const res = await auth(path);
      expect(res.status, `${path} should reach the handler`).toBe(200);
    }
  );

  it("approves: applies diff.to, freezes human provenance, terminals the run", async () => {
    await seedRun("run-20260912-c0de");
    await seedPendingDraft("d-approve", "run-20260912-c0de");

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-approve/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expectUncacheable(res);
    expect(await res.clone().text()).not.toContain(EMAIL);

    const record = DraftRecordSchema.parse(await res.json());
    expect(record).toMatchObject({
      id: "d-approve",
      outcome: "approved",
      decidedBy: DISPLAY_NAME,
      body: "Pending proposal body for d-approve.",
      editedBody: null,
      rejectReason: null
    });
    expect(record.decidedAt).toBeTruthy();

    const row = await draftRow("d-approve");
    expect(row.outcome).toBe("approved");
    expect(row.decided_by).toBe(DISPLAY_NAME);
    expect(row.reject_reason).toBeNull();
    expect(row.reject_reason_private).toBeNull();

    expect(await evidencePayload("gate-decided-d-approve")).toEqual({
      draftId: "d-approve",
      outcome: "approved",
      decidedBy: DISPLAY_NAME,
      reason: null,
      lineage: [{ draftId: "d-approve", revisionIndex: 0, turnId: null }],
      approvedText: "Pending proposal body for d-approve."
    });

    const nv = await nvRow();
    expect(nv.posture).toBe("pending");
    expect(nv.provenance_kind).toBe("human");
    expect(nv.published_at).toBe(record.decidedAt);
    expect(nv.updated_at).toBe(record.decidedAt);
    expect(await publicNv()).toMatchObject({
      posture: "pending",
      provenanceKind: "human"
    });

    expect(await runStatus("run-20260912-c0de")).toBe("published");
    expect(await evidencePayload("run-completed-run-20260912-c0de")).toEqual({
      status: "published"
    });
  });

  it("edit-then-approve applies diff.to, not the operator prose", async () => {
    await seedRun("run-20260912-ed17");
    await seedPendingDraft("d-edit", "run-20260912-ed17");

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-edit/decision", {
        action: "edit",
        editedBody: "The operator-revised body."
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    const record = DraftRecordSchema.parse(await res.json());
    expect(record).toMatchObject({
      id: "d-edit",
      outcome: "edited",
      body: "Pending proposal body for d-edit.",
      editedBody: "The operator-revised body."
    });
    expect(record.decidedBy).toBe(DISPLAY_NAME);
    expect(await evidencePayload("gate-decided-d-edit")).toEqual({
      draftId: "d-edit",
      outcome: "edited",
      decidedBy: DISPLAY_NAME,
      reason: null,
      lineage: [{ draftId: "d-edit", revisionIndex: 0, turnId: null }],
      approvedText: "The operator-revised body."
    });

    const nv = await nvRow();
    expect(nv.posture).toBe("pending");
    expect(nv.provenance_kind).toBe("human");
    expect(nv.published_at).toBe(record.decidedAt);
    expect(await publicNv()).toMatchObject({
      posture: "pending",
      provenanceKind: "human"
    });
    expect(await runStatus("run-20260912-ed17")).toBe("published");
  });

  it("rejects a public reason onto the wire, the evidence, and the public feed", async () => {
    await seedRun("run-20260912-ea11");
    await seedPendingDraft("d-reject-public", "run-20260912-ea11");
    const before = await f1Snapshot();
    const reason = "Trade-press expectation is not a docket event.";

    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-reject-public/decision",
        {
          action: "reject",
          rejectReason: reason
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);
    const record = DraftRecordSchema.parse(await res.json());
    expect(record).toMatchObject({
      id: "d-reject-public",
      outcome: "rejected",
      rejectReason: reason,
      body: "Pending proposal body for d-reject-public."
    });
    expect(await evidencePayload("gate-decided-d-reject-public")).toEqual({
      draftId: "d-reject-public",
      outcome: "rejected",
      decidedBy: DISPLAY_NAME,
      reason,
      lineage: [{ draftId: "d-reject-public", revisionIndex: 0, turnId: null }],
      approvedText: "Pending proposal body for d-reject-public."
    });

    const publicFeed = await worker.fetch(get("/api/drafts"), anon);
    expect(publicFeed.status).toBe(200);
    const feedBody = (await publicFeed.json()) as { items: unknown[] };
    const archived = feedBody.items.find(
      (item) => (item as { id: string }).id === "d-reject-public"
    );
    expect(archived).toMatchObject({
      outcome: "rejected",
      rejectReason: reason
    });

    expect(await f1Snapshot()).toEqual(before);
    expect(await runStatus("run-20260912-ea11")).toBe("rejected");
    expect(await evidencePayload("run-completed-run-20260912-ea11")).toEqual({
      status: "rejected"
    });
  });

  it("keeps a private reject reason off every public surface and payload", async () => {
    await seedRun("run-20260912-f00d");
    await seedPendingDraft("d-reject-private", "run-20260912-f00d");
    const before = await f1Snapshot();
    const secret = "PRIVATE-SECRET-REASON-9f2c";

    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-reject-private/decision",
        {
          action: "reject",
          rejectReason: secret,
          private: true
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);
    const record = DraftRecordSchema.parse(await res.clone().json());
    expect(record.outcome).toBe("rejected");
    expect(record.rejectReason).toBeNull();

    const decisionRaw = JSON.stringify(await res.json());
    expect(decisionRaw).not.toContain(secret);
    expect(decisionRaw).not.toContain("reject_reason_private");
    expect(await evidencePayload("gate-decided-d-reject-private")).toEqual({
      draftId: "d-reject-private",
      outcome: "rejected",
      decidedBy: DISPLAY_NAME,
      reason: null,
      lineage: [
        { draftId: "d-reject-private", revisionIndex: 0, turnId: null }
      ],
      approvedText: "Pending proposal body for d-reject-private."
    });

    const publicFeed = await worker.fetch(get("/api/drafts"), anon);
    const feedRaw = await publicFeed.text();
    expect(feedRaw).not.toContain(secret);
    expect(feedRaw).not.toContain("reject_reason_private");

    const queue = await auth("/api/admin/queue");
    expect(await queue.text()).not.toContain(secret);

    const row = await draftRow("d-reject-private");
    expect(row.reject_reason).toBeNull();
    expect(row.reject_reason_private).toBe(secret);
    expect(await f1Snapshot()).toEqual(before);
    expect(await runStatus("run-20260912-f00d")).toBe("rejected");
  });

  it("answers 409 on a second decision without writing", async () => {
    await seedRun("run-20260912-beef");
    await seedPendingDraft("d-double", "run-20260912-beef");
    const token = await sign(EMAIL);

    const first = await worker.fetch(
      jsonPost(token, "/api/admin/drafts/d-double/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(first.status).toBe(200);
    const afterFirst = await f1Snapshot();
    const nvAfterFirst = await nvRow();

    const second = await worker.fetch(
      jsonPost(token, "/api/admin/drafts/d-double/decision", {
        action: "reject",
        rejectReason: "Too late."
      }),
      realEnv()
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      code: "conflict",
      message: expect.any(String)
    });
    expect((await draftRow("d-double")).outcome).toBe("approved");
    expect(await evidenceCount("gate-decided-d-double")).toBe(1);
    expect(await evidenceCount("run-completed-run-20260912-beef")).toBe(1);
    expect(await f1Snapshot()).toEqual(afterFirst);
    expect(await nvRow()).toEqual(nvAfterFirst);
  });

  it("keeps the run awaiting while a sibling draft is still pending", async () => {
    await seedRun("run-20260912-511b");
    await seedPendingDraft(
      "d-sib-a",
      "run-20260912-511b",
      "2026-09-12T16:05:00.000Z"
    );
    await seedPendingDraft(
      "d-sib-b",
      "run-20260912-511b",
      "2026-09-12T16:06:00.000Z"
    );

    const first = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-sib-a/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(first.status).toBe(200);
    expect((await draftRow("d-sib-a")).outcome).toBe("approved");
    expect((await draftRow("d-sib-b")).outcome).toBeNull();
    expect((await nvRow()).posture).toBe("pending");
    expect(await runStatus("run-20260912-511b")).toBe("awaiting");
    expect(await evidenceCount("run-completed-run-20260912-511b")).toBe(0);

    const beforeReject = await f1Snapshot();
    const last = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-sib-b/decision", {
        action: "reject",
        rejectReason: "Duplicate of the approved sibling."
      }),
      realEnv()
    );
    expect(last.status).toBe(200);
    expect(await f1Snapshot()).toEqual(beforeReject);
    expect(await runStatus("run-20260912-511b")).toBe("published");
    expect(await evidenceCount("run-completed-run-20260912-511b")).toBe(1);
  });

  it("freezes provenance_kind=human when a human POST approves a yolo Run", async () => {
    await seedRun("run-20260912-311a", "yolo");
    await seedPendingDraft("d-yolo", "run-20260912-311a");

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-yolo/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect((await nvRow()).provenance_kind).toBe("human");
    expect(await publicNv()).toMatchObject({
      posture: "pending",
      provenanceKind: "human"
    });
  });

  it("approves operationalStatus on st-nv and GET /api/states reflects it", async () => {
    await seedRun("run-20260912-311b");
    await seedPendingDraft(
      "d-ops-nv",
      "run-20260912-311b",
      "2026-09-12T16:05:00.000Z",
      {
        diffJson: '{"operationalStatus":{"from":"banned","to":"restricted"}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-ops-nv/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);

    const states = await worker.fetch(get("/api/states"), testEnv);
    const body = (await states.json()) as {
      items: Array<{ code: string; operationalStatus: string }>;
    };
    expect(body.items.find((item) => item.code === "NV")).toMatchObject({
      operationalStatus: "restricted"
    });
  });

  it("approves a case-flaherty field and GET /api/cases reflects it", async () => {
    await seedRun("run-20260912-311c");
    await seedPendingDraft(
      "d-case-flaherty",
      "run-20260912-311c",
      "2026-09-12T16:05:00.000Z",
      {
        targetEntityType: "cases",
        targetEntityId: "case-flaherty",
        diffJson: '{"posture":{"from":"platform","to":"pending"}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-case-flaherty/decision",
        { action: "approve" }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);

    const cases = await worker.fetch(get("/api/cases"), testEnv);
    const body = (await cases.json()) as {
      items: Array<{ id: string; posture: string }>;
    };
    expect(
      body.items.find((item) => item.id === "case-flaherty")
    ).toMatchObject({ posture: "pending" });
  });

  it("approves cert_signals/current and stamps GET /api/cert-signal approver", async () => {
    await seedRun("run-20260912-311d");
    await seedPendingDraft(
      "d-cert",
      "run-20260912-311d",
      "2026-09-12T16:05:00.000Z",
      {
        targetEntityType: "cert_signals",
        targetEntityId: "current",
        diffJson: '{"reading":{"from":"elevated","to":"likely"}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-cert/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);

    const cert = await worker.fetch(get("/api/cert-signal"), testEnv);
    expect(cert.status).toBe(200);
    expect(await cert.json()).toMatchObject({
      id: "current",
      reading: "likely",
      approver: DISPLAY_NAME
    });
  });

  it("publishes F1 on a budget-stopped run but appends no run.completed and leaves the run stopped", async () => {
    await seedRun("run-20260912-570a");
    await testEnv.DB.prepare("UPDATE runs SET status = 'stopped' WHERE id = ?")
      .bind("run-20260912-570a")
      .run();
    await seedPendingDraft("d-stopped-run", "run-20260912-570a");
    const before = await nvRow();

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-stopped-run/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect((await draftRow("d-stopped-run")).outcome).toBe("approved");

    const after = await nvRow();
    expect(after.posture).toBe("pending");
    expect(after.provenance_kind).toBe("human");
    expect(after.updated_at).not.toBe(before.updated_at);
    expect(await evidenceCount("run-completed-run-20260912-570a")).toBe(0);
    expect(await runStatus("run-20260912-570a")).toBe("stopped");
  });

  it("publishes a circuits draft with hasSplit onto the circuit row", async () => {
    await seedRun("run-20260912-c117");
    await seedPendingDraft(
      "d-circuit-split",
      "run-20260912-c117",
      "2026-09-12T16:06:00.000Z",
      {
        targetEntityType: "circuits",
        targetEntityId: "cir-3",
        diffJson: '{"hasSplit":{"from":false,"to":true}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-circuit-split/decision",
        {
          action: "approve"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);

    const row = await testEnv.DB.prepare(
      "SELECT has_split, provenance_kind FROM circuits WHERE id = 'cir-3'"
    ).first<{ has_split: number; provenance_kind: string }>();
    expect(row?.has_split).toBe(1);
    expect(row?.provenance_kind).toBe("human");

    const publicCircuits = await worker.fetch(get("/api/circuits"), testEnv);
    expect(publicCircuits.status).toBe(200);
    const body = (await publicCircuits.json()) as {
      items: Array<{ id: string; hasSplit: boolean }>;
    };
    expect(body.items.find((item) => item.id === "cir-3")).toMatchObject({
      hasSplit: true
    });
  });

  it("publishes an entities draft onto the entity row", async () => {
    await seedRun("run-20260912-3a77");
    await seedPendingDraft(
      "d-entity-rename",
      "run-20260912-3a77",
      "2026-09-12T16:07:00.000Z",
      {
        targetEntityType: "entities",
        targetEntityId: "ent-kalshi",
        diffJson: '{"name":{"from":"KalshiEX LLC","to":"KalshiEX, LLC"}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-entity-rename/decision",
        {
          action: "approve"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);

    const row = await testEnv.DB.prepare(
      "SELECT name, provenance_kind FROM entities WHERE id = 'ent-kalshi'"
    ).first<{ name: string; provenance_kind: string }>();
    expect(row?.name).toBe("KalshiEX, LLC");
    expect(row?.provenance_kind).toBe("human");
  });

  it("publishes a cert draft whose factors value is a factor array", async () => {
    await seedRun("run-20260912-fa37");
    await seedPendingDraft(
      "d-cert-factors",
      "run-20260912-fa37",
      "2026-09-12T16:08:00.000Z",
      {
        targetEntityType: "cert_signals",
        targetEntityId: "current",
        diffJson:
          '{"factors":{"from":[],"to":[{"lead":"Docket momentum","explanation":"Re-listed at the cert stage after the July docket."}]}}'
      }
    );

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-cert-factors/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);

    const row = await testEnv.DB.prepare(
      "SELECT factors_json, approver FROM cert_signals WHERE id = 'current'"
    ).first<{ factors_json: string | null; approver: string | null }>();
    expect(JSON.parse(row?.factors_json ?? "null")).toEqual([
      {
        lead: "Docket momentum",
        explanation: "Re-listed at the cert stage after the July docket."
      }
    ]);
    expect(row?.approver).toBe(DISPLAY_NAME);
  });

  it.each([
    [
      "null target",
      {
        targetEntityType: null,
        targetEntityId: null,
        diffJson: '{"posture":{"from":"untracked","to":"pending"}}'
      }
    ],
    [
      "unknown type",
      {
        targetEntityType: "widgets",
        targetEntityId: "st-nv",
        diffJson: '{"posture":{"from":"untracked","to":"pending"}}'
      }
    ],
    [
      "unknown field",
      {
        targetEntityType: "states",
        targetEntityId: "st-nv",
        diffJson: '{"id":{"from":"st-nv","to":"st-hack"}}'
      }
    ],
    [
      "missing F1 row",
      {
        targetEntityType: "states",
        targetEntityId: "st-missing",
        diffJson: '{"posture":{"from":"untracked","to":"pending"}}'
      }
    ],
    [
      "malformed diff",
      {
        targetEntityType: "states",
        targetEntityId: "st-nv",
        diffJson: '{"posture":{"to":"pending"}}'
      }
    ],
    [
      "cert factors value that is not JSON",
      {
        targetEntityType: "cert_signals",
        targetEntityId: "current",
        diffJson: '{"factors":{"from":[],"to":"not json"}}'
      }
    ]
  ])(
    "answers 400 for unpublishable %s without writing",
    async (name, patch) => {
      const id = `d-unpub-${name.replace(/\s+/g, "-")}`;
      await seedRun("run-20260912-bad1");
      await seedPendingDraft(
        id,
        "run-20260912-bad1",
        "2026-09-12T16:07:00.000Z",
        patch
      );
      const before = await f1Snapshot();

      const res = await worker.fetch(
        jsonPost(await sign(EMAIL), `/api/admin/drafts/${id}/decision`, {
          action: "approve"
        }),
        realEnv()
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        code: "bad_request",
        message: expect.any(String)
      });
      expect((await draftRow(id)).outcome).toBeNull();
      expect(await f1Snapshot()).toEqual(before);
      expect(await runStatus("run-20260912-bad1")).toBe("awaiting");
    }
  );

  it("answers 404 for an unknown draft", async () => {
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-nope/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "not_found",
      message: expect.any(String)
    });
  });

  it.each([
    ["unknown action", { action: "stamp" }],
    ["missing action", {}],
    ["approve with an editedBody", { action: "approve", editedBody: "x" }],
    ["edit without an editedBody", { action: "edit" }],
    ["edit with an empty editedBody", { action: "edit", editedBody: "" }],
    ["reject without a reason", { action: "reject" }],
    ["reject with an empty reason", { action: "reject", rejectReason: "" }],
    [
      "reject with an empty private reason",
      { action: "reject", rejectReason: " ", private: true }
    ]
  ])("answers 400 for %s", async (_name, body) => {
    await seedRun("run-20260912-fa11");
    await seedPendingDraft("d-invalid", "run-20260912-fa11");
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-invalid/decision", body),
      realEnv()
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "bad_request",
      message: expect.any(String)
    });
    expect((await draftRow("d-invalid")).outcome).toBeNull();
  });

  it("answers 400 for a malformed JSON body", async () => {
    const res = await worker.fetch(
      signed(await sign(EMAIL), "/api/admin/drafts/x/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json"
      }),
      realEnv()
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "bad_request",
      message: expect.any(String)
    });
  });

  it("is 405 on GET of the decision route with allow POST", async () => {
    const res = await auth("/api/admin/drafts/x/decision");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("reaches the handler through an encoded draft id", async () => {
    await seedRun("run-20260912-1dea");
    await seedPendingDraft("d-encoded", "run-20260912-1dea");
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/%64-encoded/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect((await draftRow("d-encoded")).outcome).toBe("approved");
  });

  it("refuses an expired-session decision without writing (fail closed)", async () => {
    await seedRun("run-20260912-fade");
    await seedPendingDraft("d-expired", "run-20260912-fade");
    const res = await worker.fetch(
      get("/api/admin/drafts/d-expired/decision", {
        method: "POST",
        body: JSON.stringify({ action: "approve" }),
        headers: { "content-type": "application/json" }
      }),
      anon
    );
    expect(res.status).toBe(403);
    expect((await draftRow("d-expired")).outcome).toBeNull();
  });
});

describe("admin loop controls (story 3.12)", () => {
  const loopEnv = (create = vi.fn().mockResolvedValue({})) =>
    ({ ...realEnv(), DAILY_RUN: { create } }) as unknown as Env;

  async function seedDated(input: {
    id: string;
    origin: "scheduled" | "catch-up" | "manual";
    status: "running" | "published" | "awaiting" | "empty" | "failed";
    scheduledFor: string;
  }) {
    await runsRepo.insertRun(testEnv.DB, {
      id: input.id,
      origin: input.origin,
      mode: "hitl",
      status: input.status,
      startedAt: "2026-11-01T00:00:00.000Z",
      completedAt:
        input.status === "running" ? null : "2026-11-01T01:00:00.000Z",
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor: input.scheduledFor
    });
  }

  it("rejects anonymous loop reads and run triggers with the opaque 403", async () => {
    const loop = await worker.fetch(get("/api/admin/loop"), anon);
    expect(loop.status).toBe(403);
    expect(await loop.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
    const trigger = await worker.fetch(
      get("/api/admin/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: "manual" })
      }),
      anon
    );
    expect(trigger.status).toBe(403);
  });

  it("returns latest null when there are no runs", async () => {
    await testEnv.DB.prepare("DELETE FROM llm_calls").run();
    await testEnv.DB.prepare("DELETE FROM evidence_events").run();
    await testEnv.DB.prepare("DELETE FROM drafts").run();
    await testEnv.DB.prepare("DELETE FROM runs").run();
    const res = await auth("/api/admin/loop");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ latest: null });
  });

  it("defaults scheduledFor to today's ET date when omitted", async () => {
    const create = vi.fn().mockResolvedValue({});
    const expected = etCalendarDate(new Date());
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", { origin: "manual" }),
      loopEnv(create)
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as { scheduledFor: string | null };
    expect(run.scheduledFor).toBe(expected);
  });

  it("starts a manual Run, lists it on GET /api/runs, and mirrors it on /api/admin/loop", async () => {
    const create = vi.fn().mockResolvedValue({});
    const envW = loopEnv(create);
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-10"
      }),
      envW
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as {
      id: string;
      origin: string;
      status: string;
    };
    expect(run).toMatchObject({
      id: "run-20261110-0002",
      origin: "manual",
      status: "running"
    });
    expect(create).toHaveBeenCalledWith({
      params: {
        origin: "manual",
        scheduledFor: "2026-11-10",
        runId: "run-20261110-0002"
      },
      id: "manual-2026-11-10-0002"
    });

    const pub = await worker.fetch(get("/api/runs"), envW);
    expect(pub.status).toBe(200);
    const items = ((await pub.json()) as { items: Array<{ id: string }> })
      .items;
    expect(items.some((item) => item.id === run.id)).toBe(true);

    const loop = await worker.fetch(
      signed(await sign(EMAIL), "/api/admin/loop"),
      envW
    );
    expect(loop.status).toBe(200);
    const latest = ((await loop.json()) as { latest: { id: string } | null })
      .latest;
    expect(latest?.id).toBe(items[0]?.id);
  });

  it("returns 409 supersede_required, then confirms a new Run without rewriting the prior", async () => {
    await seedDated({
      id: "run-20261111-0000",
      origin: "scheduled",
      status: "published",
      scheduledFor: "2026-11-11"
    });
    const create = vi.fn().mockResolvedValue({});
    const envW = loopEnv(create);
    const blocked = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-11"
      }),
      envW
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      code: "supersede_required",
      message: expect.any(String),
      details: { priorRunId: "run-20261111-0000" }
    });
    expect(create).not.toHaveBeenCalled();

    const confirmed = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-11",
        supersedePriorPublish: true
      }),
      envW
    );
    expect(confirmed.status).toBe(200);
    const run = (await confirmed.json()) as { id: string };
    expect(run.id).toBe("run-20261111-0002");
    const prior = await testEnv.DB.prepare(
      "SELECT status FROM runs WHERE id = ?"
    )
      .bind("run-20261111-0000")
      .first<{ status: string }>();
    expect(prior?.status).toBe("published");
    const event = await testEnv.DB.prepare(
      `SELECT event, payload_json FROM evidence_events
        WHERE run_id = ? AND event = 'run.superseded'`
    )
      .bind(run.id)
      .first<{ event: string; payload_json: string }>();
    expect(event?.event).toBe("run.superseded");
    expect(JSON.parse(event?.payload_json ?? "{}")).toEqual({
      priorRunId: "run-20261111-0000"
    });
  });

  it("refuses a same-origin awaiting Run with 409 conflict and does not create", async () => {
    await seedDated({
      id: "run-20261112-0002",
      origin: "manual",
      status: "awaiting",
      scheduledFor: "2026-11-12"
    });
    const create = vi.fn().mockResolvedValue({});
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-12"
      }),
      loopEnv(create)
    );
    expect(res.status).toBe(409);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "conflict"
    });
    expect(create).not.toHaveBeenCalled();
    const count = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM runs WHERE scheduled_for = ?"
    )
      .bind("2026-11-12")
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("refuses a different-origin in-flight Run that date", async () => {
    await seedDated({
      id: "run-20261116-0000",
      origin: "scheduled",
      status: "running",
      scheduledFor: "2026-11-16"
    });
    const create = vi.fn().mockResolvedValue({});
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-16"
      }),
      loopEnv(create)
    );
    expect(res.status).toBe(409);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "conflict"
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a different-origin awaiting Run that date", async () => {
    await seedDated({
      id: "run-20261121-0000",
      origin: "scheduled",
      status: "awaiting",
      scheduledFor: "2026-11-21"
    });
    const create = vi.fn().mockResolvedValue({});
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-21"
      }),
      loopEnv(create)
    );
    expect(res.status).toBe(409);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "conflict"
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("is idempotent while the same origin is running (no second instance)", async () => {
    await seedDated({
      id: "run-20261113-0002",
      origin: "manual",
      status: "running",
      scheduledFor: "2026-11-13"
    });
    const create = vi.fn().mockResolvedValue({});
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-13"
      }),
      loopEnv(create)
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({
      id: "run-20261113-0002"
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("starts catch-up alongside a terminal scheduled row without replacing it", async () => {
    await seedDated({
      id: "run-20261114-0000",
      origin: "scheduled",
      status: "empty",
      scheduledFor: "2026-11-14"
    });
    const create = vi.fn().mockResolvedValue({});
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "catch-up",
        scheduledFor: "2026-11-14"
      }),
      loopEnv(create)
    );
    expect(res.status).toBe(200);
    const run = (await res.json()) as { id: string; origin: string };
    expect(run).toMatchObject({
      id: "run-20261114-0001",
      origin: "catch-up"
    });
    expect(
      (
        await testEnv.DB.prepare(
          "SELECT status FROM runs WHERE id = 'run-20261114-0000'"
        ).first<{ status: string }>()
      )?.status
    ).toBe("empty");
    expect(create).toHaveBeenCalledWith({
      params: {
        origin: "catch-up",
        scheduledFor: "2026-11-14",
        runId: "run-20261114-0001"
      },
      id: "catch-up-2026-11-14-0001"
    });
  });

  it("rejects a scheduled origin and a bad date with 400", async () => {
    const envW = loopEnv();
    const scheduled = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", { origin: "scheduled" }),
      envW
    );
    expect(scheduled.status).toBe(400);
    const badDate = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "13-09-2026"
      }),
      envW
    );
    expect(badDate.status).toBe(400);
  });

  it("fails closed with 500 and marks the Run failed when DAILY_RUN is missing", async () => {
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/runs", {
        origin: "manual",
        scheduledFor: "2026-11-17"
      }),
      realEnv()
    );
    expect(res.status).toBe(500);
    const row = await testEnv.DB.prepare(
      "SELECT status FROM runs WHERE id = 'run-20261117-0002'"
    ).first<{ status: string }>();
    expect(row?.status).toBe("failed");
  });

  it("keeps unknown admin paths as 404 after the new routes", async () => {
    const ping = await auth("/api/admin/ping");
    expect(ping.status).toBe(404);
  });
});

async function restoreApprovalMode() {
  await testEnv.DB.prepare(
    `UPDATE approval_mode
        SET mode = 'hitl', threshold = 70, version = 1,
            updated_at = '2026-09-13T00:00:00.000Z'
      WHERE id = 'current'`
  ).run();
  await testEnv.DB.prepare("DELETE FROM mode_audit").run();
}

describe("admin mode (story 3.13)", () => {
  beforeEach(async () => {
    await restoreApprovalMode();
  });
  afterEach(async () => {
    await restoreApprovalMode();
  });

  async function publicMode() {
    const res = await worker.fetch(get("/api/mode"), testEnv);
    return res.json() as Promise<{
      mode: string;
      threshold: number;
      audit: Array<{ actorDisplayName: string; kind: string }>;
    }>;
  }

  it("rejects anonymous and wrong-identity POSTs with the opaque 403", async () => {
    const before = await publicMode();
    const anonRes = await worker.fetch(
      get("/api/admin/mode", {
        method: "POST",
        body: JSON.stringify({ mode: "yolo" })
      }),
      anon
    );
    expect(anonRes.status).toBe(403);
    expect(await anonRes.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
    const other = await sign("other@example.com");
    const wrong = await worker.fetch(
      jsonPost(other, "/api/admin/mode", { mode: "yolo" }),
      realEnv()
    );
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
    expect(await publicMode()).toEqual(before);
  });

  it("rejects an out-of-set body with 400 and leaves the mode unchanged", async () => {
    const badMode = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { mode: "auto" }),
      realEnv()
    );
    expect(badMode.status).toBe(400);
    const badThreshold = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { threshold: 0.92 }),
      realEnv()
    );
    expect(badThreshold.status).toBe(400);
    const over = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { threshold: 101 }),
      realEnv()
    );
    expect(over.status).toBe(400);
    expect(await publicMode()).toMatchObject({ mode: "hitl", threshold: 70 });
  });

  it("enables YOLO with an audit row carrying displayName, never email", async () => {
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { mode: "yolo" }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expectUncacheable(res);
    const raw = await res.clone().text();
    expect(raw).not.toContain(EMAIL);
    const body = JSON.parse(raw) as {
      mode: string;
      threshold: number;
      audit: Array<{
        actorDisplayName: string;
        kind: string;
        prior: { mode?: string };
        next: { mode?: string };
      }>;
    };
    expect(body.mode).toBe("yolo");
    expect(body.threshold).toBe(70);
    expect(body.audit).toHaveLength(1);
    expect(body.audit[0]).toMatchObject({
      actorDisplayName: DISPLAY_NAME,
      kind: "mode",
      prior: { mode: "hitl" },
      next: { mode: "yolo" }
    });
    expect(await publicMode()).toMatchObject({ mode: "yolo", threshold: 70 });
  });

  it("disables YOLO with a new audit row and leaves the public mode HITL", async () => {
    await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { mode: "yolo" }),
      realEnv()
    );
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { mode: "hitl" }),
      realEnv()
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      audit: Array<{
        kind: string;
        prior: { mode?: string };
        next: { mode?: string };
      }>;
    };
    expect(body.mode).toBe("hitl");
    expect(body.audit[0]).toMatchObject({
      kind: "mode",
      prior: { mode: "yolo" },
      next: { mode: "hitl" }
    });
    expect(await publicMode()).toMatchObject({ mode: "hitl", threshold: 70 });
  });

  it("writes a threshold audit and does not auto-approve just because the number moved", async () => {
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { threshold: 80 }),
      realEnv()
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      threshold: number;
      audit: Array<{ kind: string; prior: { threshold?: number } }>;
    };
    expect(body.mode).toBe("hitl");
    expect(body.threshold).toBe(80);
    expect(body.audit[0]).toMatchObject({
      kind: "threshold",
      prior: { threshold: 70 }
    });
  });

  it("returns 200 with no new audit row when POST matches the current values", async () => {
    const first = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/mode", { mode: "hitl" }),
      realEnv()
    );
    expect(first.status).toBe(200);
    expect(((await first.json()) as { audit: unknown[] }).audit).toHaveLength(
      0
    );
    const count = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM mode_audit"
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

describe("admin steering (story 3.14)", () => {
  it("rejects anonymous and wrong-identity POSTs with the opaque 403 and stores nothing", async () => {
    await seedRun("run-20260914-aaaa");
    await seedPendingDraft("d-steer-1", "run-20260914-aaaa");
    const body = {
      content: "Please explain this Draft.",
      private: false,
      draftId: "d-steer-1"
    };
    const anonRes = await worker.fetch(
      get("/api/admin/runs/run-20260914-aaaa/steering", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }),
      anon
    );
    expect(anonRes.status).toBe(403);
    expect(await anonRes.json()).toEqual({
      code: "forbidden",
      message: expect.any(String)
    });
    const other = await sign("other@example.com");
    const wrong = await worker.fetch(
      jsonPost(other, "/api/admin/runs/run-20260914-aaaa/steering", body),
      realEnv()
    );
    expect(wrong.status).toBe(403);
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260914-aaaa")
    ).toHaveLength(0);
  });

  it("returns 404 for an unknown Run", async () => {
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-0ead/steering",
        {
          content: "hello",
          private: false
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a PATCH of private (no retroactive privatize route)", async () => {
    await seedRun("run-20260914-bbbb");
    const res = await worker.fetch(
      signed(await sign(EMAIL), "/api/admin/runs/run-20260914-bbbb/steering", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ private: true })
      }),
      realEnv()
    );
    expect(res.status).toBe(405);
    const missing = await worker.fetch(
      signed(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-bbbb/steering/private",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ private: true })
        }
      ),
      realEnv()
    );
    expect(missing.status).toBe(404);
  });

  it("returns 400 for empty content and for a draft on another Run", async () => {
    await seedRun("run-20260914-cccc");
    await seedRun("run-20260914-dddd");
    await seedPendingDraft("d-other-run", "run-20260914-dddd");
    const empty = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-cccc/steering",
        {
          content: "   ",
          private: false
        }
      ),
      realEnv()
    );
    expect(empty.status).toBe(400);
    const cross = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-cccc/steering",
        {
          content: "cross",
          private: false,
          draftId: "d-other-run"
        }
      ),
      realEnv()
    );
    expect(cross.status).toBe(400);
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260914-cccc")
    ).toHaveLength(0);
  });

  it("submits a public turn with displayName not email", async () => {
    await seedRun("run-20260914-eeee");
    await seedPendingDraft("d-steer-pub", "run-20260914-eeee");
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-eeee/steering",
        {
          content: "Please explain the Nevada posture change.",
          private: false,
          draftId: "d-steer-pub"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);
    expectUncacheable(res);
    const raw = await res.clone().text();
    expect(raw).not.toContain(EMAIL);
    const turn = PublicSteeringTurnSchema.parse(JSON.parse(raw));
    expect(turn.actor).toBe(DISPLAY_NAME);
    expect(turn.content).toBe("Please explain the Nevada posture change.");
    expect(turn.reply).toBeNull();
    const publicRes = await worker.fetch(
      get("/api/runs/run-20260914-eeee"),
      testEnv
    );
    const detail = (await publicRes.json()) as {
      evidence: Array<{ event: string; payload: Record<string, unknown> }>;
    };
    expect(JSON.stringify(detail)).not.toContain(EMAIL);
    expect(detail.evidence.some((e) => e.event === "steering.turn")).toBe(true);
    expect(detail.evidence.some((e) => e.event === "steering.applied")).toBe(
      true
    );
  });

  it("redacts private turn content on public GET", async () => {
    await seedRun("run-20260914-aa20");
    await seedPendingDraft("d-steer-priv", "run-20260914-aa20");
    const secret = "private steering secret must not leak";
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-aa20/steering",
        {
          content: secret,
          private: true,
          draftId: "d-steer-priv"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);
    const posted = PublicSteeringTurnSchema.parse(await res.json());
    expect(posted.reply).toBeNull();
    expect(posted.content).toBeNull();
    const publicRes = await worker.fetch(
      get("/api/runs/run-20260914-aa20"),
      testEnv
    );
    const detail = (await publicRes.json()) as {
      evidence: Array<{ event: string; payload: Record<string, unknown> }>;
    };
    const turn = detail.evidence.find((e) => e.event === "steering.turn");
    expect(turn?.payload?.content).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(secret);
    expect(
      detail.evidence.some(
        (e) =>
          e.event === "steering.applied" &&
          e.payload != null &&
          "reply" in e.payload
      )
    ).toBe(false);
  });

  it("returns 400 on a published Run", async () => {
    await runsRepo.insertRun(testEnv.DB, {
      id: "run-20260914-ffff",
      origin: "scheduled",
      mode: "hitl",
      status: "published",
      startedAt: RUN_STARTED,
      completedAt: RUN_STARTED,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 200,
      scheduledFor: "2026-09-14"
    });
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260914-ffff/steering",
        {
          content: "too late",
          private: false
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when intent is revise without a pending draftId", async () => {
    await seedRun("run-20260917-aa16");
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-aa16/steering",
        {
          content: "tighten the holding",
          private: false,
          intent: "revise"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(400);
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260917-aa16")
    ).toHaveLength(0);
  });

  it("returns 409 budget_stopped when revise hits the spend ceiling", async () => {
    await runsRepo.insertRun(testEnv.DB, {
      id: "run-20260917-b409",
      origin: "scheduled",
      mode: "hitl",
      status: "awaiting",
      startedAt: RUN_STARTED,
      completedAt: RUN_STARTED,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 0,
      scheduledFor: "2026-09-17"
    });
    await seedPendingDraft("d-b409-nv", "run-20260917-b409");
    await testEnv.DB.prepare(
      `UPDATE drafts SET eval_summary_json = ? WHERE id = ?`
    )
      .bind(
        JSON.stringify({
          status: "ok",
          basis: "all claims cited",
          citationCompleteness: 100,
          disagreement: { flagged: false, description: null },
          ineligible: []
        }),
        "d-b409-nv"
      )
      .run();
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, 500, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          drafter: { provider: "workersai", model: "drafter-v1" },
          reviewer: { provider: "workersai", model: "reviewer-v1" }
        }),
        TS
      )
      .run();
    const envWithAi = {
      ...realEnv(),
      AI: { run: async () => ({ response: "unused" }) }
    } as unknown as Env;
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-b409/steering",
        {
          content: "tighten the holding",
          private: false,
          draftId: "d-b409-nv",
          intent: "revise"
        }
      ),
      envWithAi
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "budget_stopped",
      details: expect.objectContaining({
        id: expect.stringMatching(/^st:/),
        runId: "run-20260917-b409",
        revisedDraftId: null
      })
    });
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260917-b409")
    ).toHaveLength(1);
  });
});

describe("admin pipeline config steering (story 3.17)", () => {
  const EXTRA = {
    name: "ND Cal docket",
    url: "https://www.courtlistener.com/docket/ndcal-example/",
    tier: "tier1"
  };

  async function resetPipelineConfig() {
    await testEnv.DB.prepare("DELETE FROM pipeline_config_versions").run();
  }

  async function seedStewardMapping() {
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, 500, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          steward: { provider: "workersai", model: "steward-v1" }
        }),
        TS
      )
      .run();
  }

  function envWithSteerAi(response: string): Env {
    return {
      ...realEnv(),
      AI: { run: async () => ({ response }) }
    } as unknown as Env;
  }

  async function publicConfig() {
    const res = await worker.fetch(get("/api/pipeline-config"), testEnv);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      version: number;
      sources: Array<{ name: string; url: string; tier: string }>;
      history: Array<{ version: number; actor: string }>;
    };
  }

  it("steers poll_sources through the admin POST and projects config.steered", async () => {
    await resetPipelineConfig();
    await seedRun("run-20260917-c017");
    await seedPendingDraft("d-c017-nv", "run-20260917-c017");
    await seedStewardMapping();
    const seed = await publicConfig();
    const steered = [...seed.sources, EXTRA];
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-c017/steering",
        {
          content: "Add the ND Cal docket to Tier-1.",
          private: false,
          draftId: "d-c017-nv",
          intent: "config"
        }
      ),
      envWithSteerAi(JSON.stringify({ key: "poll_sources", value: steered }))
    );
    expect(res.status).toBe(200);
    expectUncacheable(res);
    const turn = PublicSteeringTurnSchema.parse(await res.json());
    expect(turn.actor).toBe(DISPLAY_NAME);
    expect(turn.configVersion).toBe(1);
    expect(JSON.stringify(turn)).not.toContain(EMAIL);
    const config = await publicConfig();
    expect(config.version).toBe(1);
    expect(config.sources.some((row) => row.name === "ND Cal docket")).toBe(
      true
    );
    expect(config.history[0]?.actor).toBe(DISPLAY_NAME);
    const publicRes = await worker.fetch(
      get("/api/runs/run-20260917-c017"),
      testEnv
    );
    const detail = (await publicRes.json()) as {
      evidence: Array<{ event: string; payload: Record<string, unknown> }>;
    };
    expect(detail.evidence.some((e) => e.event === "config.steered")).toBe(
      true
    );
    expect(JSON.stringify(detail)).not.toContain(EMAIL);
  });

  it("OpenRouter steward config-steer hits the AI Gateway chat URL (story 3.20)", async () => {
    const SECRET = "sk-or-admin-test-do-not-leak";
    await resetPipelineConfig();
    await seedRun("run-20260922-c020");
    await seedPendingDraft("d-c020-nv", "run-20260922-c020");
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, 500, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          steward: {
            provider: "openrouter",
            model: "anthropic/claude-sonnet-4"
          }
        }),
        TS
      )
      .run();
    const seed = await publicConfig();
    const steered = [...seed.sources, EXTRA];
    const requestUrl = (input: RequestInfo | URL) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).includes("/openrouter/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    key: "poll_sources",
                    value: steered
                  })
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      return Response.json({ keys: [jwk] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260922-c020/steering",
        {
          content: "Add the ND Cal docket to Tier-1.",
          private: false,
          draftId: "d-c020-nv",
          intent: "config"
        }
      ),
      {
        ...realEnv(),
        OPENROUTER_API_KEY: SECRET,
        AI_GATEWAY_ID: "pml-gateway",
        CLOUDFLARE_ACCOUNT_ID: "acct-123"
      } as Env
    );
    expect(res.status).toBe(200);
    const openRouterCalls = fetchMock.mock.calls.filter((call) =>
      requestUrl(call[0]!).includes("/openrouter/chat/completions")
    );
    expect(openRouterCalls).toHaveLength(1);
    expect(requestUrl(openRouterCalls[0]![0]!)).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct-123/pml-gateway/openrouter/chat/completions"
    );
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    const config = await publicConfig();
    expect(config.sources.some((row) => row.name === "ND Cal docket")).toBe(
      true
    );
  });

  it("reverts poll_sources to version 0 and keeps both history rows", async () => {
    await resetPipelineConfig();
    await seedRun("run-20260917-c018");
    await seedPendingDraft("d-c018-nv", "run-20260917-c018");
    await seedStewardMapping();
    const seed = await publicConfig();
    const steered = [...seed.sources, EXTRA];
    const first = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-c018/steering",
        {
          content: "Add the ND Cal docket to Tier-1.",
          private: false,
          intent: "config"
        }
      ),
      envWithSteerAi(JSON.stringify({ key: "poll_sources", value: steered }))
    );
    expect(first.status).toBe(200);
    const revert = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-c018/steering",
        {
          content: "Revert poll_sources to version 0",
          private: false,
          intent: "config",
          key: "poll_sources",
          revertToVersion: 0
        }
      ),
      realEnv()
    );
    expect(revert.status).toBe(200);
    const turn = PublicSteeringTurnSchema.parse(await revert.json());
    expect(turn.configVersion).toBe(2);
    const config = await publicConfig();
    expect(config.version).toBe(2);
    expect(config.sources).toEqual(seed.sources);
    expect(config.history).toHaveLength(2);
  });

  it("returns 400 and persists the turn when config steward is unconfigured", async () => {
    await resetPipelineConfig();
    await seedRun("run-20260917-c019");
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, '{}', 500, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         updated_at = excluded.updated_at`
    )
      .bind(TS)
      .run();
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-c019/steering",
        {
          content: "Add a docket.",
          private: false,
          intent: "config"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "bad_request",
      message: "Config did not apply."
    });
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260917-c019")
    ).toHaveLength(1);
    expect((await publicConfig()).version).toBe(0);
  });

  it("returns 409 budget_stopped with the turn body when config complete hits the ceiling", async () => {
    await resetPipelineConfig();
    await runsRepo.insertRun(testEnv.DB, {
      id: "run-20260917-c409",
      origin: "scheduled",
      mode: "hitl",
      status: "awaiting",
      startedAt: RUN_STARTED,
      completedAt: RUN_STARTED,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 0,
      scheduledFor: "2026-09-17"
    });
    await seedStewardMapping();
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260917-c409/steering",
        {
          content: "Add a docket.",
          private: false,
          intent: "config"
        }
      ),
      envWithSteerAi(JSON.stringify({ key: "poll_sources", value: [EXTRA] }))
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "budget_stopped",
      details: expect.objectContaining({
        id: expect.stringMatching(/^st:/),
        runId: "run-20260917-c409",
        configVersion: null
      })
    });
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260917-c409")
    ).toHaveLength(1);
    expect((await publicConfig()).version).toBe(0);
  });
});

describe("admin standing guidance steering (story 3.18)", () => {
  const GUIDANCE = "Always cite the docket number in the first sentence.";

  async function resetGuidance() {
    await testEnv.DB.prepare("DELETE FROM standing_guidance").run();
  }

  async function publicGuidance() {
    const res = await worker.fetch(get("/api/standing-guidance"), testEnv);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      cap: number;
      maxChars: number;
      inForce: Array<{
        itemId: string;
        version: number;
        status: string;
        content: string;
        actor: string;
      }>;
      history: Array<{ itemId: string; version: number; status: string }>;
    };
  }

  it("records, edits, and revokes guidance through the admin POST with displayName not email", async () => {
    await resetGuidance();
    await seedRun("run-20260918-d018");
    await seedPendingDraft("d-d018-nv", "run-20260918-d018");
    const recorded = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260918-d018/steering",
        {
          content: GUIDANCE,
          private: false,
          draftId: "d-d018-nv",
          intent: "guidance"
        }
      ),
      realEnv()
    );
    expect(recorded.status).toBe(200);
    expectUncacheable(recorded);
    const turn = PublicSteeringTurnSchema.parse(await recorded.json());
    expect(turn.actor).toBe(DISPLAY_NAME);
    expect(turn.guidanceItemId).toMatch(/^sg:/);
    expect(turn.guidanceVersion).toBe(1);
    expect(turn.configVersion).toBeNull();
    expect(turn.revisedDraftId).toBeNull();
    expect(JSON.stringify(turn)).not.toContain(EMAIL);
    const itemId = turn.guidanceItemId!;

    let pub = await publicGuidance();
    expect(pub.inForce).toHaveLength(1);
    expect(pub.inForce[0]).toMatchObject({
      itemId,
      version: 1,
      content: GUIDANCE,
      actor: DISPLAY_NAME
    });
    expect(JSON.stringify(pub)).not.toContain(EMAIL);

    const edited = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260918-d018/steering",
        {
          content: "Cite the docket number and the court.",
          private: false,
          intent: "guidance",
          guidanceItemId: itemId
        }
      ),
      realEnv()
    );
    expect(edited.status).toBe(200);
    expect(PublicSteeringTurnSchema.parse(await edited.json())).toMatchObject({
      guidanceItemId: itemId,
      guidanceVersion: 2
    });
    pub = await publicGuidance();
    expect(pub.inForce[0]).toMatchObject({ version: 2 });
    expect(pub.history).toHaveLength(2);

    const revoked = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260918-d018/steering",
        {
          content: "Superseded.",
          private: false,
          intent: "guidance",
          guidanceItemId: itemId,
          revoke: true
        }
      ),
      realEnv()
    );
    expect(revoked.status).toBe(200);
    expect(PublicSteeringTurnSchema.parse(await revoked.json())).toMatchObject({
      guidanceItemId: itemId,
      guidanceVersion: 3
    });
    pub = await publicGuidance();
    expect(pub.inForce).toHaveLength(0);
    expect(pub.history.map((row) => row.status)).toEqual([
      "active",
      "active",
      "revoked"
    ]);

    const publicRes = await worker.fetch(
      get("/api/runs/run-20260918-d018"),
      testEnv
    );
    const detail = (await publicRes.json()) as {
      evidence: Array<{ event: string; payload: Record<string, unknown> }>;
    };
    expect(
      detail.evidence.filter((e) => e.event === "guidance.recorded")
    ).toHaveLength(2);
    expect(
      detail.evidence.filter((e) => e.event === "guidance.revoked")
    ).toHaveLength(1);
    expect(
      detail.evidence.filter(
        (e) => e.event === "steering.applied" && e.payload.effect === "guidance"
      )
    ).toHaveLength(3);
    expect(JSON.stringify(detail)).not.toContain(EMAIL);
  });

  it("returns 400 with a calm message and persists the turn for private guidance", async () => {
    await resetGuidance();
    await seedRun("run-20260918-d019");
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/runs/run-20260918-d019/steering",
        {
          content: "keep this off the record",
          private: true,
          intent: "guidance"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("bad_request");
    expect(body.message.toLowerCase()).toContain("public");
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260918-d019")
    ).toHaveLength(1);
    expect((await publicGuidance()).history).toHaveLength(0);
  });

  it("rejects an unknown intent and a non-boolean revoke with 400 and stores nothing", async () => {
    await resetGuidance();
    await seedRun("run-20260918-d020");
    for (const body of [
      { content: "x", private: false, intent: "standing" },
      { content: "x", private: false, intent: "guidance", revoke: "yes" },
      { content: "x", private: false, intent: "guidance", guidanceItemId: "" }
    ]) {
      const res = await worker.fetch(
        jsonPost(
          await sign(EMAIL),
          "/api/admin/runs/run-20260918-d020/steering",
          body
        ),
        realEnv()
      );
      expect(res.status).toBe(400);
    }
    expect(
      await steeringTurnsRepo.listByRun(testEnv.DB, "run-20260918-d020")
    ).toHaveLength(0);
    expect((await publicGuidance()).history).toHaveLength(0);
  });

  it("rejects anonymous guidance POSTs with the opaque 403 and writes no row", async () => {
    await resetGuidance();
    await seedRun("run-20260918-d021");
    const res = await worker.fetch(
      get("/api/admin/runs/run-20260918-d021/steering", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: GUIDANCE,
          private: false,
          intent: "guidance"
        })
      }),
      anon
    );
    expect(res.status).toBe(403);
    expect((await publicGuidance()).history).toHaveLength(0);
  });
});

describe("admin decision acceptedFields on docket_events (story 3.21)", () => {
  const RUN_ID = "run-20260912-3d21";
  const CASE_ID = "case-ri-furcolo";

  function docketDiff(entryId: number) {
    return JSON.stringify({
      caseId: CASE_ID,
      occurredAt: "2026-09-15",
      description: `ORDER granting Motion for Preliminary Injunction (${entryId}).`,
      sourceUrl: `https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=${entryId}`,
      entryNumber: entryId,
      entryId,
      docketId: "73375343",
      context: { caption: "KalshiEX LLC v. Furcolo" },
      inference: {
        kind: "pi-granted",
        favors: "platform",
        confidence: 0.9,
        basis: "ORDER granting"
      },
      statePatch: { posture: { from: "pending", to: "platform" } }
    });
  }

  afterEach(async () => {
    await testEnv.DB.prepare(
      `UPDATE cases SET posture = 'pending', provenance_kind = 'human',
              published_at = '2026-08-09T16:00:00.000Z',
              updated_at = '2026-08-09T16:00:00.000Z'
        WHERE id = ?`
    )
      .bind(CASE_ID)
      .run();
  });

  it("strips posture through the wire, publishes the development with kind/favors, and shows it on the public case", async () => {
    await seedRun(RUN_ID);
    await seedPendingDraft(
      "d-docket-strip",
      RUN_ID,
      "2026-09-12T16:05:00.000Z",
      {
        targetEntityType: "docket_events",
        targetEntityId: `de-${CASE_ID}-8101`,
        diffJson: docketDiff(8101)
      }
    );
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-docket-strip/decision", {
        action: "approve",
        acceptedFields: ["kind", "favors"]
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect(DraftRecordSchema.safeParse(await res.json()).success).toBe(true);
    expect(await evidencePayload("gate-decided-d-docket-strip")).toMatchObject({
      outcome: "approved",
      acceptedFields: ["kind", "favors"],
      strippedFields: ["posture"]
    });

    const detail = await worker.fetch(get(`/api/cases/${CASE_ID}`), testEnv);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      posture: string;
      docketEvents: Array<{
        id: string;
        kind: string | null;
        favors: string | null;
        description: string;
        source: { tier: string; url: string };
      }>;
    };
    expect(body.posture).toBe("pending");
    expect(
      body.docketEvents.find((e) => e.id === `de-${CASE_ID}-8101`)
    ).toMatchObject({
      kind: "pi-granted",
      favors: "platform",
      description: "ORDER granting Motion for Preliminary Injunction (8101).",
      source: {
        tier: "tier1",
        url: "https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=8101"
      }
    });
  });

  it("accepts posture through the wire and moves the public case", async () => {
    await seedRun(RUN_ID);
    await seedPendingDraft(
      "d-docket-accept",
      RUN_ID,
      "2026-09-12T16:06:00.000Z",
      {
        targetEntityType: "docket_events",
        targetEntityId: `de-${CASE_ID}-8102`,
        diffJson: docketDiff(8102)
      }
    );
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-docket-accept/decision",
        {
          action: "approve"
        }
      ),
      realEnv()
    );
    expect(res.status).toBe(200);
    const detail = await worker.fetch(get(`/api/cases/${CASE_ID}`), testEnv);
    const body = (await detail.json()) as {
      posture: string;
      provenanceKind: string;
    };
    expect(body).toMatchObject({
      posture: "platform",
      provenanceKind: "human"
    });
  });

  it("approves with acceptedFields: [] on the wire — record only, posture unchanged", async () => {
    await seedRun(RUN_ID);
    await seedPendingDraft(
      "d-docket-empty",
      RUN_ID,
      "2026-09-12T16:06:30.000Z",
      {
        targetEntityType: "docket_events",
        targetEntityId: `de-${CASE_ID}-8104`,
        diffJson: docketDiff(8104)
      }
    );
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-docket-empty/decision", {
        action: "approve",
        acceptedFields: []
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect(await evidencePayload("gate-decided-d-docket-empty")).toMatchObject({
      outcome: "approved",
      acceptedFields: [],
      strippedFields: ["kind", "favors", "posture"]
    });
    const detail = await worker.fetch(get(`/api/cases/${CASE_ID}`), testEnv);
    const body = (await detail.json()) as {
      posture: string;
      docketEvents: Array<{
        id: string;
        kind: string | null;
        favors: string | null;
      }>;
    };
    expect(body.posture).toBe("pending");
    expect(
      body.docketEvents.find((e) => e.id === `de-${CASE_ID}-8104`)
    ).toMatchObject({
      kind: null,
      favors: null
    });
  });

  it("forwards acceptedFields on the edit arm: classification kept, posture stripped", async () => {
    await seedRun(RUN_ID);
    await seedPendingDraft(
      "d-docket-edit",
      RUN_ID,
      "2026-09-12T16:06:45.000Z",
      {
        targetEntityType: "docket_events",
        targetEntityId: `de-${CASE_ID}-8105`,
        diffJson: docketDiff(8105)
      }
    );
    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-docket-edit/decision", {
        action: "edit",
        editedBody: "Operator note on the record.",
        // `favors` rides with `kind`; the queue always sends the pair.
        acceptedFields: ["kind", "favors"]
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect(await evidencePayload("gate-decided-d-docket-edit")).toMatchObject({
      outcome: "edited",
      acceptedFields: ["kind", "favors"],
      strippedFields: ["posture"]
    });
    const detail = await worker.fetch(get(`/api/cases/${CASE_ID}`), testEnv);
    const body = (await detail.json()) as { posture: string };
    expect(body.posture).toBe("pending");
  });

  it.each([
    ["non-string acceptedFields", { action: "approve", acceptedFields: [1] }],
    ["a coupled half alone", { action: "approve", acceptedFields: ["kind"] }],
    ["empty field name", { action: "approve", acceptedFields: [""] }],
    [
      "acceptedFields on reject",
      { action: "reject", rejectReason: "x", acceptedFields: [] }
    ]
  ])("answers 400 for %s", async (_name, body) => {
    await seedRun(RUN_ID);
    await seedPendingDraft("d-docket-bad", RUN_ID, "2026-09-12T16:07:00.000Z", {
      targetEntityType: "docket_events",
      targetEntityId: `de-${CASE_ID}-8103`,
      diffJson: docketDiff(8103)
    });
    const res = await worker.fetch(
      jsonPost(
        await sign(EMAIL),
        "/api/admin/drafts/d-docket-bad/decision",
        body
      ),
      realEnv()
    );
    expect(res.status).toBe(400);
    expect((await draftRow("d-docket-bad")).outcome).toBeNull();
  });
});
