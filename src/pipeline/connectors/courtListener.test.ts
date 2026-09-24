import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import {
  CONNECTOR_TIMEOUT_MS,
  SOURCE_FETCH_TIMEOUT_MS
} from "../../shared/lib/timeouts";
import { completeDailyStep } from "../workflow/dailyRunSteps";
import { runConnector } from "./connector";
import {
  COURTLISTENER_MAX_PAGES,
  COURTLISTENER_SOURCE_NAME,
  createCourtListenerCheck,
  docketIdFromUrl,
  entriesUrl,
  entryUrl,
  parseEntries,
  reasonForStatus
} from "./courtListener";
import { POLL_SOURCES } from "./sources";

/**
 * Story 3.21 — the CourtListener connector against Miniflare D1 with a
 * stubbed global `fetch` (same seam as server.test.ts). The seed carries
 * four case-owned `courtlistener.com/docket/<id>/` sources; Furcolo
 * (73375343) is the docket the fixtures answer for, the rest answer empty.
 */

const testEnv = env as Env;
const NOW = "2026-09-18T16:00:00.000Z";
const SOURCE = POLL_SOURCES.find((s) => s.name === COURTLISTENER_SOURCE_NAME)!;
const FURCOLO = "73375343";
const FURCOLO_CASE = "case-ri-furcolo";
/** Seed `sources.published_at` for the Furcolo docket page (0003). */
const FURCOLO_TRACKED_SINCE = "2026-05-21";
const ILLINOIS = "73133459";
const ILLINOIS_CASE = "case-il-cftc";
const TOKEN = "cl-test-token";

let seq = 0xf00;
async function newRun(): Promise<string> {
  const id = `run-20260918-${(seq++).toString(16).padStart(4, "0")}`;
  await runsRepo.insertRun(testEnv.DB, {
    id,
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: NOW,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: null,
    scheduledFor: "2026-09-18"
  });
  return id;
}

const ENTRIES = [
  {
    id: 501,
    entry_number: 12,
    date_filed: "2026-09-15",
    description:
      "ORDER granting Motion for Preliminary Injunction. Defendants are enjoined."
  },
  {
    id: 500,
    entry_number: 11,
    date_filed: "2026-09-10",
    description: "NOTICE of Appearance by counsel for Defendant."
  },
  {
    id: 499,
    entry_number: null,
    date_filed: null,
    description: "undated minute entry"
  },
  { id: 498, entry_number: 9, date_filed: "2026-09-01", description: "" }
];

type Answer =
  | { status: number; body?: unknown }
  | { text: string }
  | { throws: unknown }
  | { hang: true };

function stubFetch(answer: (docketId: string | null, url: string) => Answer) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const docketId = new URL(url).searchParams.get("docket");
      const reply = answer(docketId, url);
      if ("throws" in reply) throw reply.throws;
      if ("hang" in reply) return new Promise<Response>(() => {});
      if ("text" in reply) {
        return new Response(reply.text, {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return Response.json(reply.body ?? { results: [] }, {
        status: reply.status
      });
    })
  );
  return calls;
}

function docketSummary(payload: unknown, docketId: string) {
  const dockets = (payload as { dockets: Array<Record<string, unknown>> })
    .dockets;
  return dockets.find((d) => d.docketId === docketId);
}

async function fetchedPayload(runId: string) {
  const events = await evidenceRepo.listByRun(testEnv.DB, runId);
  return events.find((e) => e.event === "source.fetched")?.payload as
    | Record<string, unknown>
    | undefined;
}

function check(token: string | undefined = TOKEN) {
  return createCourtListenerCheck({
    db: testEnv.DB,
    token,
    now: () => NOW
  });
}

async function skippedReason(runId: string) {
  const events = await evidenceRepo.listByRun(testEnv.DB, runId);
  const skipped = events.find((e) => e.event === "source.skipped");
  return skipped?.payload as Record<string, unknown> | undefined;
}

afterEach(() => vi.unstubAllGlobals());

describe("CourtListener helpers", () => {
  it("extracts docket ids, builds entry URLs, and maps statuses to typed reasons", () => {
    expect(
      docketIdFromUrl(
        "https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/"
      )
    ).toBe("73375343");
    expect(
      docketIdFromUrl("https://storage.courtlistener.com/recap/x.pdf")
    ).toBeNull();
    expect(
      entryUrl(
        "https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/",
        12
      )
    ).toBe(
      "https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=12"
    );
    const url = new URL(entriesUrl("73375343"));
    expect(url.origin + url.pathname).toBe(
      "https://www.courtlistener.com/api/rest/v4/docket-entries/"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      docket: "73375343",
      order_by: "-date_filed",
      limit: "20",
      fields: "id,entry_number,date_filed,description"
    });
    expect(reasonForStatus(401)).toBe("http_401");
    expect(reasonForStatus(403)).toBe("http_403");
    expect(reasonForStatus(429)).toBe("http_429");
    expect(reasonForStatus(500)).toBe("http_5xx");
    expect(reasonForStatus(503)).toBe("http_5xx");
    expect(reasonForStatus(404)).toBe("http_error");
  });

  it("parses the v4 envelope tolerantly", () => {
    expect(parseEntries({ results: ENTRIES })).toHaveLength(4);
    expect(parseEntries({ results: [{ nope: true }, ENTRIES[0]] })).toEqual([
      {
        id: 501,
        entryNumber: 12,
        dateFiled: "2026-09-15",
        description: ENTRIES[0]!.description
      }
    ]);
    expect(parseEntries({ count: 0 })).toBeNull();
    expect(parseEntries("nope")).toBeNull();
  });
});

describe("CourtListener connector (story 3.21)", () => {
  afterEach(() => vi.useRealTimers());

  it("skips as unconfigured when the token is absent, without calling the API", async () => {
    const calls = stubFetch(() => ({ status: 200 }));
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check(""));
    expect(result).toEqual({ draftCount: 0, failed: true });
    expect(await skippedReason(runId)).toEqual({
      source: COURTLISTENER_SOURCE_NAME,
      tier: "tier1",
      reason: "unconfigured"
    });
    expect(calls).toHaveLength(0);
    const events = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(events.some((e) => e.event === "run.failed")).toBe(false);
  });

  it.each([
    [401, "http_401"],
    [403, "http_403"],
    [429, "http_429"],
    [500, "http_5xx"],
    [502, "http_5xx"]
  ])(
    "escalates HTTP %s on any docket to source.skipped %s with failed: true",
    async (status, reason) => {
      stubFetch((docketId) =>
        docketId === FURCOLO ? { status } : { status: 200 }
      );
      const runId = await newRun();
      const result = await runConnector(testEnv.DB, runId, SOURCE, check());
      expect(result).toEqual({ draftCount: 0, failed: true });
      expect(await skippedReason(runId)).toMatchObject({
        reason,
        status,
        docketId: FURCOLO
      });
      expect(await draftsRepo.listByRun(testEnv.DB, runId)).toHaveLength(0);
      const events = await evidenceRepo.listByRun(testEnv.DB, runId);
      expect(events.some((e) => e.event === "run.failed")).toBe(false);
    }
  );

  it("maps a thrown fetch to network", async () => {
    stubFetch(() => ({ throws: new TypeError("fetch failed") }));
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 0,
      failed: true
    });
    expect(await skippedReason(runId)).toMatchObject({ reason: "network" });
  });

  it("times out a hung request at the per-request deadline and skips the source as timeout", async () => {
    stubFetch((docketId) =>
      docketId === FURCOLO ? { hang: true } : { status: 200 }
    );
    const runId = await newRun();
    vi.useFakeTimers();
    const pending = runConnector(testEnv.DB, runId, SOURCE, check());
    await vi.advanceTimersByTimeAsync(SOURCE_FETCH_TIMEOUT_MS);
    const result = await pending;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    expect(result).toEqual({ draftCount: 0, failed: true });
    expect(await skippedReason(runId)).toMatchObject({
      reason: "timeout",
      docketId: FURCOLO
    });
  });

  it("isolates a dead docket (404 / malformed JSON / missing results) and still drafts the healthy ones", async () => {
    const calls = stubFetch((docketId) => {
      if (docketId === ILLINOIS) return { status: 404 };
      if (docketId === "73242633") return { text: "<html>not json</html>" };
      if (docketId === FURCOLO) {
        return {
          status: 200,
          body: {
            results: ENTRIES.map((entry) => ({ ...entry, id: entry.id + 50 }))
          }
        };
      }
      return { status: 200, body: { count: 0 } };
    });
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(result).toEqual({ draftCount: 2, failed: false });

    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("authorization")).toBe(`Token ${TOKEN}`);
    }
    // One request per docket, four case-owned dockets in the seed; the
    // circuit-owned Ninth Circuit docket is not polled.
    const polled = calls.map((call) =>
      new URL(call.url).searchParams.get("docket")
    );
    expect(new Set(polled).size).toBe(polled.length);
    expect(polled).toContain(FURCOLO);
    expect(polled).not.toContain("73324497");

    const payload = await fetchedPayload(runId);
    expect(payload).toMatchObject({
      source: COURTLISTENER_SOURCE_NAME,
      tier: "tier1",
      fetchedAt: NOW,
      docketIds: expect.arrayContaining([FURCOLO, ILLINOIS]),
      note: expect.stringContaining("RECAP")
    });
    expect(docketSummary(payload, ILLINOIS)).toEqual({
      docketId: ILLINOIS,
      caseId: ILLINOIS_CASE,
      error: "http_error",
      status: 404,
      detail: '{"results":[]}'
    });
    expect(docketSummary(payload, "73242633")).toMatchObject({
      error: "malformed"
    });
    expect(docketSummary(payload, "72237443")).toMatchObject({
      error: "malformed"
    });
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, runId)).some(
        (e) => e.event === "source.skipped"
      )
    ).toBe(false);
  });

  it("fails the Run when every docket errors, and stores a scrubbed reason", async () => {
    stubFetch(() => ({
      status: 400,
      body: { detail: `query rejected ${TOKEN}` }
    }));
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(result).toEqual({ draftCount: 0, failed: true });
    await completeDailyStep(testEnv.DB, runId, {
      draftCount: result.draftCount,
      anyFailure: result.failed
    });

    const payload = await fetchedPayload(runId);
    expect(payload).toMatchObject({
      source: COURTLISTENER_SOURCE_NAME,
      itemCount: 0
    });
    const dockets = payload?.dockets as Array<Record<string, unknown>>;
    expect(dockets.length).toBeGreaterThan(0);
    for (const docket of dockets) {
      expect(docket).toMatchObject({
        error: "http_error",
        status: 400,
        detail: '{"detail":"query rejected [redacted]"}'
      });
    }
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
    const events = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(events.some((e) => e.event === "source.fetched")).toBe(true);
    expect(events.some((e) => e.event === "run.failed")).toBe(true);
    expect(events.some((e) => e.event === "run.empty")).toBe(false);
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "failed"
    );
  });

  it("drafts each new entry verbatim with a source_published_at baseline before any development exists", async () => {
    stubFetch((docketId) =>
      docketId === FURCOLO
        ? {
            status: 200,
            body: {
              next: null,
              previous: null,
              results: [
                ...ENTRIES,
                {
                  id: 400,
                  entry_number: 1,
                  date_filed: "2026-05-01",
                  description: "COMPLAINT filed before tracking began."
                }
              ]
            }
          }
        : { status: 200 }
    );
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(result).toEqual({ draftCount: 2, failed: false });

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    const pi = drafts.find(
      (d) => d.targetEntityId === `de-${FURCOLO_CASE}-501`
    );
    expect(pi).toMatchObject({
      targetEntityType: "docket_events",
      tier2Only: false,
      confidence: null,
      outcome: null
    });
    expect(pi?.diff).toMatchObject({
      caseId: FURCOLO_CASE,
      occurredAt: "2026-09-15",
      description: ENTRIES[0]!.description,
      sourceUrl:
        "https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=12",
      entryNumber: 12,
      entryId: 501,
      docketId: FURCOLO,
      context: {
        caption: "KalshiEX LLC v. Furcolo",
        lifecycle: "active",
        posture: "pending",
        decidedAt: null
      }
    });
    const context = (pi!.diff as { context: { parties: unknown[] } }).context;
    expect(context.parties.length).toBeGreaterThan(0);
    expect(pi?.body).toContain(ENTRIES[0]!.description);
    expect(
      drafts.some((d) => d.targetEntityId === `de-${FURCOLO_CASE}-500`)
    ).toBe(true);
    // Undated / text-less rows never become records; the pre-tracking
    // complaint is history the tracker never claimed to follow.
    expect(
      drafts.some((d) =>
        ["499", "498", "400"].some(
          (id) => d.targetEntityId === `de-${FURCOLO_CASE}-${id}`
        )
      )
    ).toBe(false);

    const payload = await fetchedPayload(runId);
    expect(docketSummary(payload, FURCOLO)).toEqual({
      docketId: FURCOLO,
      caseId: FURCOLO_CASE,
      baseline: { kind: "source_published_at", date: FURCOLO_TRACKED_SINCE },
      latestEntryDate: "2026-09-15",
      entries: 5,
      pages: 1,
      truncated: false,
      newEntries: 2,
      seen: 1,
      skippedIncomplete: 2
    });
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
        (e) => e.event === "draft.created"
      )
    ).toHaveLength(2);
  });

  it("uses the latest published development as the baseline and skips entries already Drafted (any outcome)", async () => {
    stubFetch((docketId) =>
      docketId === FURCOLO
        ? { status: 200, body: { results: ENTRIES } }
        : { status: 200 }
    );
    const priorRun = await newRun();
    await draftsRepo.insertDraft(testEnv.DB, {
      id: `d:${priorRun}:CourtListener:docket_events:de-${FURCOLO_CASE}-501`,
      runId: priorRun,
      targetEntityType: "docket_events",
      targetEntityId: `de-${FURCOLO_CASE}-501`,
      diff: { caseId: FURCOLO_CASE },
      body: "prior",
      tier2Only: false,
      confidence: null,
      evalSummary: null,
      createdAt: NOW
    });
    await testEnv.DB.prepare(
      `UPDATE drafts SET outcome = 'rejected', decided_at = ?, decided_by = 'Patrick',
              reject_reason = 'dup' WHERE target_entity_id = ?`
    )
      .bind(NOW, `de-${FURCOLO_CASE}-501`)
      .run();
    // A published development on 2026-09-12 makes entry 500 (09-10) old news.
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
         VALUES ('src-test-furcolo', 'cases', ?, 'https://www.courtlistener.com/docket/73375343/x/', 'test', 'tier1', '2026-09-12')`
      ).bind(FURCOLO_CASE),
      testEnv.DB.prepare(
        `INSERT INTO docket_events (id, case_id, occurred_at, description, source_id,
            provenance_kind, published_at, updated_at)
         VALUES ('de-test-furcolo', ?, '2026-09-12', 'published', 'src-test-furcolo',
            'human', ?, ?)`
      ).bind(FURCOLO_CASE, NOW, NOW)
    ]);

    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(result).toEqual({ draftCount: 0, failed: false });
    expect(await draftsRepo.listByRun(testEnv.DB, runId)).toHaveLength(0);
    const payload = await fetchedPayload(runId);
    expect(docketSummary(payload, FURCOLO)).toMatchObject({
      baseline: { kind: "docket_events", date: "2026-09-12" },
      newEntries: 0,
      seen: 2
    });
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, runId)).some(
        (e) => e.event === "source.skipped"
      )
    ).toBe(false);
  });

  it("treats a same-day unseen entry as new", async () => {
    stubFetch((docketId) =>
      docketId === FURCOLO
        ? {
            status: 200,
            body: {
              results: [
                {
                  id: 777,
                  entry_number: 30,
                  date_filed: "2026-09-12",
                  description: "MINUTE ENTRY for hearing."
                }
              ]
            }
          }
        : { status: 200 }
    );
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(result).toEqual({ draftCount: 1, failed: false });
  });

  it("follows next while the page's oldest entry is still on or after the baseline", async () => {
    const page2Url = `${entriesUrl(FURCOLO)}&cursor=p2`;
    const page3Url = `${entriesUrl(FURCOLO)}&cursor=p3`;
    const calls = stubFetch((docketId, url) => {
      if (docketId !== FURCOLO) return { status: 200 };
      if (url === page3Url) {
        return {
          status: 200,
          body: {
            next: null,
            results: [
              {
                id: 800,
                entry_number: 50,
                date_filed: "2026-09-01",
                description: "OLD entry, below the baseline."
              }
            ]
          }
        };
      }
      if (url === page2Url) {
        return {
          status: 200,
          body: {
            next: page3Url,
            results: [
              {
                id: 802,
                entry_number: 52,
                date_filed: "2026-09-14",
                description: "SECOND-PAGE entry, newer than the baseline."
              },
              {
                id: 801,
                entry_number: 51,
                date_filed: "2026-09-11",
                description: "SECOND-PAGE entry, older than the baseline."
              }
            ]
          }
        };
      }
      return {
        status: 200,
        body: {
          next: page2Url,
          results: [
            {
              id: 803,
              entry_number: 53,
              date_filed: "2026-09-16",
              description: "FIRST-PAGE entry."
            }
          ]
        }
      };
    });
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    // Baseline is the 2026-09-12 development: 803 and 802 are new, 801 is
    // not, and page 3 is never requested because page 2 already dipped
    // below the baseline.
    expect(result).toEqual({ draftCount: 2, failed: false });
    const urls = calls.map((c) => c.url);
    expect(urls).toContain(page2Url);
    expect(urls).not.toContain(page3Url);
    expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject({
      pages: 2,
      truncated: false,
      newEntries: 2,
      seen: 1
    });
  });

  it("caps paging at COURTLISTENER_MAX_PAGES and records truncated", async () => {
    let served = 0;
    stubFetch((docketId) => {
      if (docketId !== FURCOLO) return { status: 200 };
      served += 1;
      return {
        status: 200,
        body: {
          next: `${entriesUrl(FURCOLO)}&cursor=${served + 1}`,
          results: [
            {
              id: 900 + served,
              entry_number: 60 + served,
              date_filed: "2026-09-20",
              description: `Endless entry ${served}.`
            }
          ]
        }
      };
    });
    const runId = await newRun();
    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(served).toBe(COURTLISTENER_MAX_PAGES);
    expect(result).toEqual({
      draftCount: COURTLISTENER_MAX_PAGES,
      failed: false
    });
    expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject({
      pages: COURTLISTENER_MAX_PAGES,
      truncated: true
    });
  });

  it("is idempotent across a step retry — the Draft id embeds the entry id", async () => {
    // Fresh entry ids: D1 storage persists across the tests in this file.
    const fresh = [
      {
        id: 601,
        entry_number: 40,
        date_filed: "2026-09-21",
        description: "ORDER setting briefing schedule."
      },
      {
        id: 602,
        entry_number: 41,
        date_filed: "2026-09-22",
        description: "BRIEF in support of motion."
      }
    ];
    stubFetch((docketId) =>
      docketId === FURCOLO
        ? { status: 200, body: { results: fresh } }
        : { status: 200 }
    );
    const runId = await newRun();
    const first = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(first).toEqual({ draftCount: 2, failed: false });
    const again = await runConnector(testEnv.DB, runId, SOURCE, check());
    expect(again.failed).toBe(false);
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.id).sort()).toEqual(
      [
        `d:${runId}:CourtListener:docket_events:de-${FURCOLO_CASE}-601`,
        `d:${runId}:CourtListener:docket_events:de-${FURCOLO_CASE}-602`
      ].sort()
    );
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
        (e) => e.event === "draft.created"
      )
    ).toHaveLength(2);
  });

  it("polls five dockets concurrently inside the connector deadline and reports an unmatched docket URL", async () => {
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
         VALUES ('src-test-fifth', 'cases', 'case-flaherty',
                 'https://www.courtlistener.com/docket/99999999/fifth/', 'fifth', 'tier1', '2026-09-01')`
      ),
      testEnv.DB.prepare(
        `INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
         VALUES ('src-test-unmatched', 'cases', 'case-flaherty',
                 'https://www.courtlistener.com/docket/not-a-number/', 'odd', 'tier1', NULL)`
      )
    ]);
    try {
      // Each docket takes 11 s: serial polling would need 55 s of the 60 s
      // deadline; concurrent polling needs 11 s.
      const SLOW_MS = SOURCE_FETCH_TIMEOUT_MS - 1_000;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input: string | URL | Request) =>
            new Promise<Response>((resolve) =>
              setTimeout(() => resolve(Response.json({ results: [] })), SLOW_MS)
            )
        )
      );
      const runId = await newRun();
      vi.useFakeTimers();
      const pending = runConnector(testEnv.DB, runId, SOURCE, check());
      await vi.advanceTimersByTimeAsync(SLOW_MS + 100);
      const result = await pending;
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
      expect(result).toEqual({ draftCount: 0, failed: false });
      const payload = await fetchedPayload(runId);
      expect((payload!.docketIds as string[]).sort()).toEqual(
        [FURCOLO, ILLINOIS, "73242633", "72237443", "99999999"].sort()
      );
      expect(payload?.unmatched).toEqual([
        "https://www.courtlistener.com/docket/not-a-number/"
      ]);
      expect(SLOW_MS * 5).toBeGreaterThan(CONNECTOR_TIMEOUT_MS - 10_000);
    } finally {
      vi.useRealTimers();
      await testEnv.DB.prepare(
        "DELETE FROM sources WHERE id IN ('src-test-fifth', 'src-test-unmatched')"
      ).run();
    }
  });

  it("skips as no_dockets when no case-owned docket URL is configured", async () => {
    stubFetch(() => ({ status: 200 }));
    await testEnv.DB.prepare(
      `UPDATE sources SET url = replace(url, 'courtlistener.com/docket/', 'courtlistener.com/hidden/')
        WHERE owning_table = 'cases' AND url GLOB 'https://www.courtlistener.com/docket/*'`
    ).run();
    try {
      const runId = await newRun();
      const result = await runConnector(testEnv.DB, runId, SOURCE, check());
      expect(result).toEqual({ draftCount: 0, failed: true });
      expect(await skippedReason(runId)).toMatchObject({
        reason: "no_dockets"
      });
    } finally {
      await testEnv.DB.prepare(
        `UPDATE sources SET url = replace(url, 'courtlistener.com/hidden/', 'courtlistener.com/docket/')
          WHERE owning_table = 'cases' AND url GLOB 'https://www.courtlistener.com/hidden/*'`
      ).run();
    }
  });
});

// Story 3.27: exercise the real connector, timeout wrapper, and D1 Evidence
// with deterministic upstream responses; no live credentials or requests.
describe("CourtListener credential boundary (story 3.27)", () => {
  let entryId = 30_000;
  const freshEntry = () => ({
    id: ++entryId,
    entry_number: entryId,
    date_filed: "2026-09-24",
    description: "New docket entry for pagination boundary verification."
  });
  const pagePath = "/api/rest/v4/docket-entries/";

  it.each([
    [
      "absolute",
      `https://www.courtlistener.com${pagePath}?docket=${FURCOLO}&cursor=2`
    ],
    ["root-relative", `${pagePath}?docket=${FURCOLO}&cursor=2`],
    ["query-relative", `?docket=${FURCOLO}&cursor=2`],
    ["path-relative", `./?docket=${FURCOLO}&cursor=2`],
    ["percent-encoded cursor", `?docket=${FURCOLO}&cursor=%2F%3D`]
  ])(
    "preserves %s same-origin next links and authorized paging",
    async (_, next) => {
      const secondUrl = new URL(next, entriesUrl(FURCOLO)).href;
      const calls = stubFetch((docket, url) => {
        if (docket !== FURCOLO) return { status: 200 };
        return {
          status: 200,
          body: {
            results: [freshEntry()],
            next: url === secondUrl ? null : next
          }
        };
      });
      const runId = await newRun();
      expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
        draftCount: 2,
        failed: false
      });
      expect(calls.filter(({ url }) => url === secondUrl)).toHaveLength(1);
      for (const { url, init } of calls) {
        expect(new URL(url).origin).toBe("https://www.courtlistener.com");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Token ${TOKEN}`
        );
        expect(init?.redirect).toBe("manual");
      }
      expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject(
        {
          pages: 2,
          newEntries: 2,
          truncated: false
        }
      );
    }
  );

  it.each([
    `https://attacker.invalid/collect?secret=${TOKEN}`,
    "//attacker.invalid/collect",
    `http://www.courtlistener.com${pagePath}`,
    `https://www.courtlistener.com.attacker.invalid${pagePath}`,
    `https://www.courtlistener.com@attacker.invalid${pagePath}`,
    `https://${TOKEN}@www.courtlistener.com${pagePath}`,
    `https://www.courtlistener.com:444${pagePath}`,
    `https://courtlistener.com${pagePath}`,
    "https://[malformed",
    "?cursor=%ZZ",
    "?cursor=%F",
    "?cursor=%",
    "javascript:alert(1)",
    "data:application/json,{}",
    "https:\\attacker.invalid\\collect",
    "https://www.courtlistener.com\n.attacker.invalid/collect",
    "",
    " "
  ])("rejects unsafe next URL %j before issuing a request", async (next) => {
    const calls = stubFetch((docket) =>
      docket === FURCOLO
        ? { status: 200, body: { results: [freshEntry()], next } }
        : { status: 200 }
    );
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 0,
      failed: false // Other dockets succeeded; keep the per-docket failure visible.
    });
    expect(
      calls.filter(
        ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
      )
    ).toHaveLength(1);
    expect(
      calls.every(
        ({ url }) =>
          url === entriesUrl(new URL(url).searchParams.get("docket")!)
      )
    ).toBe(true);
    const payload = await fetchedPayload(runId);
    expect(docketSummary(payload, FURCOLO)).toEqual({
      docketId: FURCOLO,
      caseId: FURCOLO_CASE,
      error: "unsafe_url"
    });
    const evidence = JSON.stringify(
      await evidenceRepo.listByRun(testEnv.DB, runId)
    );
    expect(evidence).not.toContain(TOKEN);
    expect(evidence).not.toContain("attacker.invalid");
  });

  it("resolves a later relative link against the current page, not the initial page", async () => {
    const secondUrl = `https://www.courtlistener.com/api/rest/v4/pages/two?docket=${FURCOLO}`;
    const thirdUrl = `https://www.courtlistener.com/api/rest/v4/pages/three?docket=${FURCOLO}`;
    const calls = stubFetch((docket, url) => {
      if (docket !== FURCOLO) return { status: 200 };
      return {
        status: 200,
        body: {
          results: [freshEntry()],
          next:
            url === thirdUrl
              ? null
              : url === secondUrl
                ? `three?docket=${FURCOLO}`
                : secondUrl
        }
      };
    });
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 3,
      failed: false
    });
    expect(
      calls
        .filter(
          ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
        )
        .map(({ url }) => url)
    ).toEqual([entriesUrl(FURCOLO), secondUrl, thirdUrl]);
  });

  it("does not report an all-docket unsafe pagination response as an empty success", async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: { results: [freshEntry()], next: "//attacker.invalid/collect" }
    }));
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 0,
      failed: true
    });
    expect(
      calls.every(
        ({ url }) => new URL(url).origin === "https://www.courtlistener.com"
      )
    ).toBe(true);
    const payload = await fetchedPayload(runId);
    expect(
      (payload!.dockets as Array<{ error: string }>).every(
        ({ error }) => error === "unsafe_url"
      )
    ).toBe(true);
  });

  it.each([301, 302, 303, 307, 308])(
    "rejects HTTP %i redirects without forwarding credentials or reading the body",
    async (status) => {
      const destination = `https://attacker.invalid/collect?secret=${TOKEN}`;
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      const readBody = vi.fn(async () => destination);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          calls.push({ url, init });
          // Simulate Workers' follow-mode credential forwarding to make removal
          // of manual mode observable, even with this deterministic transport.
          if (init?.redirect !== "manual")
            calls.push({ url: destination, init });
          return {
            status,
            ok: false,
            headers: new Headers({ location: destination }),
            text: readBody,
            json: readBody
          };
        })
      );
      const runId = await newRun();
      expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
        draftCount: 0,
        failed: true
      });
      expect(readBody).not.toHaveBeenCalled();
      expect(calls.length).toBeGreaterThan(0);
      expect(
        calls.every(
          ({ url, init }) =>
            new URL(url).origin === "https://www.courtlistener.com" &&
            init?.redirect === "manual"
        )
      ).toBe(true);
      const payload = await fetchedPayload(runId);
      expect(
        (payload!.dockets as Array<{ error: string; status: number }>).every(
          (d) => d.error === "redirect" && d.status === status
        )
      ).toBe(true);
      const evidence = JSON.stringify(
        await evidenceRepo.listByRun(testEnv.DB, runId)
      );
      expect(evidence).not.toContain(TOKEN);
      expect(evidence).not.toContain("attacker.invalid");
    }
  );

  it("also rejects a same-origin redirect instead of adding a redirect-following path", async () => {
    const calls = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        return new Response(TOKEN, {
          status: 302,
          headers: { location: `${entriesUrl(FURCOLO)}&redirected=1` }
        });
      }
    );
    vi.stubGlobal("fetch", calls);
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 0,
      failed: true
    });
    expect(
      calls.mock.calls.every(
        ([input]) => !String(input).includes("redirected=1")
      )
    ).toBe(true);
    expect((await fetchedPayload(runId))!.dockets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: "redirect", status: 302 })
      ])
    );
    const evidence = JSON.stringify(
      await evidenceRepo.listByRun(testEnv.DB, runId)
    );
    expect(evidence).not.toContain(TOKEN);
    expect(evidence).not.toContain("redirected=1");
  });

  it("rejects a malformed pagination value rather than silently declaring completion", async () => {
    stubFetch(() => ({
      status: 200,
      body: { results: [freshEntry()], next: { url: "//attacker.invalid" } }
    }));
    const runId = await newRun();
    expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
      draftCount: 0,
      failed: true
    });
    expect((await fetchedPayload(runId))!.dockets).toEqual(
      expect.arrayContaining([expect.objectContaining({ error: "malformed" })])
    );
  });

  it.each(["empty", "baseline", "page-cap"])(
    "rejects an unsafe next link even at the %s stopping boundary",
    async (boundary) => {
      let pages = 0;
      const calls = stubFetch((docket) => {
        if (docket !== FURCOLO) return { status: 200 };
        pages += 1;
        return {
          status: 200,
          body: {
            results:
              boundary === "empty"
                ? []
                : [
                    {
                      ...freshEntry(),
                      date_filed:
                        boundary === "baseline" ? "1900-01-01" : "2026-09-24"
                    }
                  ],
            next:
              boundary === "page-cap" && pages < COURTLISTENER_MAX_PAGES
                ? `${entriesUrl(FURCOLO)}&cursor=${pages}`
                : "//attacker.invalid/collect"
          }
        };
      });
      const runId = await newRun();
      expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
        draftCount: 0,
        failed: false
      });
      expect(pages).toBe(boundary === "page-cap" ? COURTLISTENER_MAX_PAGES : 1);
      expect(
        calls.every(
          ({ url }) => new URL(url).origin === "https://www.courtlistener.com"
        )
      ).toBe(true);
      expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject(
        { error: "unsafe_url" }
      );
    }
  );

  it.each(["unsafe-next", "later-redirect"])(
    "preserves a healthy docket's Draft alongside %s failure",
    async (failure) => {
      const healthy = freshEntry();
      const secondUrl = `${entriesUrl(FURCOLO)}&cursor=redirect`;
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          calls.push({ url, init });
          const docket = new URL(url).searchParams.get("docket");
          if (url === secondUrl) {
            return new Response(TOKEN, {
              status: 307,
              headers: { location: `https://attacker.invalid/${TOKEN}` }
            });
          }
          return Response.json(
            docket === ILLINOIS
              ? { results: [healthy], next: null }
              : docket === FURCOLO
                ? {
                    results: [freshEntry()],
                    next:
                      failure === "later-redirect"
                        ? secondUrl
                        : "//attacker.invalid/collect"
                  }
                : { results: [] }
          );
        })
      );
      const runId = await newRun();
      expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
        draftCount: 1,
        failed: false
      });
      const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
      expect(drafts).toHaveLength(1);
      expect(JSON.stringify(drafts)).toContain(ILLINOIS_CASE);
      expect(JSON.stringify(drafts)).not.toContain(FURCOLO_CASE);
      const payload = await fetchedPayload(runId);
      expect(docketSummary(payload, ILLINOIS)).toMatchObject({ newEntries: 1 });
      expect(docketSummary(payload, FURCOLO)).toMatchObject({
        error: failure === "later-redirect" ? "redirect" : "unsafe_url"
      });
      expect(calls.filter(({ url }) => url === secondUrl)).toHaveLength(
        failure === "later-redirect" ? 1 : 0
      );
      expect(
        calls.every(
          ({ url, init }) =>
            new URL(url).origin === "https://www.courtlistener.com" &&
            init?.redirect === "manual"
        )
      ).toBe(true);
      const evidence = JSON.stringify(
        await evidenceRepo.listByRun(testEnv.DB, runId)
      );
      expect(evidence).not.toContain(TOKEN);
      expect(evidence).not.toContain("attacker.invalid");
    }
  );
});
