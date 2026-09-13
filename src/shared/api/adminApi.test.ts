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
import { DraftRecordSchema } from "../schemas/run";

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
      reason: null
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
      reason: null
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
      reason
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
      reason: null
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

  it("freezes provenance_kind=agent when the run mode is yolo", async () => {
    await seedRun("run-20260912-311a", "yolo");
    await seedPendingDraft("d-yolo", "run-20260912-311a");

    const res = await worker.fetch(
      jsonPost(await sign(EMAIL), "/api/admin/drafts/d-yolo/decision", {
        action: "approve"
      }),
      realEnv()
    );
    expect(res.status).toBe(200);
    expect((await nvRow()).provenance_kind).toBe("agent");
    expect(await publicNv()).toMatchObject({
      posture: "pending",
      provenanceKind: "agent"
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
