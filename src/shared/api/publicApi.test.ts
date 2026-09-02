import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import worker from "../../server";
import { US_ATLAS_STATE_NAMES } from "../../surfaces/apex/circuits/atlasStateNames";

/**
 * Story 2.1 — public F1 REST. Runs against Miniflare D1 with migrations
 * applied by src/test/apply-migrations.ts. Zero cloud credentials.
 */

function get(path: string) {
  return new Request(`https://pml.example.com${path}`);
}

const testEnv = env as Env;

describe("public F1 API (story 2.1)", () => {
  it("lists circuits in the architecture list envelope", async () => {
    const res = await worker.fetch!(get("/api/circuits"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor?: string;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(13);
    expect(body).not.toHaveProperty("nextCursor");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/has_split|published_at|provenance_kind/);
  });

  it("lists states and distinguishes untracked from unknown", async () => {
    const res = await worker.fetch!(get("/api/states"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        code: string;
        posture: string;
        operationalStatus: string;
      }>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(51);
    expect(body.items).toContainEqual(
      expect.objectContaining({
        code: "AK",
        posture: "untracked",
        operationalStatus: "unknown"
      })
    );
    for (const s of body.items) {
      if (s.posture === "untracked") {
        expect(s.operationalStatus).toBe("unknown");
      }
    }
  });

  it("returns a sourced state detail with platform breakdowns", async () => {
    const res = await worker.fetch!(get("/api/states/NJ"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      code: string;
      sources: Array<{ tier: string; url: string }>;
      platformStatuses: Array<{
        operationalStatusBasis: string;
        entity: { slug: string; provenanceKind: string };
        sources: Array<{ tier: string }>;
      }>;
    };
    expect(body.code).toBe("NJ");
    expect(body.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ tier: "tier1" })])
    );
    expect(body.platformStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationalStatusBasis: "inferred",
          entity: expect.objectContaining({
            slug: "kalshi",
            provenanceKind: "human"
          }),
          sources: expect.arrayContaining([
            expect.objectContaining({ tier: "tier1" })
          ])
        })
      ])
    );
  });

  it("404s unknown state codes with the error envelope", async () => {
    const res = await worker.fetch!(get("/api/states/ZZ"), testEnv);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("not_found");
    expect(typeof body.message).toBe("string");
  });

  it("lists the complete illustrative case and entity seed", async () => {
    for (const [path, count] of [
      ["/api/cases", 25],
      ["/api/entities", 5]
    ] as const) {
      const res = await worker.fetch!(get(path), testEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(count);
    }
  });

  it("enriches the entity list with matters and footprint without a slug route", async () => {
    const res = await worker.fetch!(get("/api/entities"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        slug: string;
        name: string;
        role: string | null;
        provenanceKind: string;
        matters: Array<{ caseId: string; role: string }>;
        footprint: Array<{ stateCode: string; operationalStatus: string }>;
      }>;
    };
    expect(body.items).toHaveLength(5);
    const kalshi = body.items.find((row) => row.slug === "kalshi");
    expect(kalshi).toBeDefined();
    expect(kalshi!.name).toBeTruthy();
    expect(kalshi!.role).toBe("DCM");
    expect(kalshi!.provenanceKind).toBe("human");
    expect(kalshi!.matters).toContainEqual(
      expect.objectContaining({ caseId: "case-flaherty", role: "plaintiff" })
    );
    expect(kalshi!.footprint).toContainEqual(
      expect.objectContaining({ stateCode: "NJ", operationalStatus: "go" })
    );

    const missing = await worker.fetch!(get("/api/entities/kalshi"), testEnv);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: "not_found",
      message: expect.any(String)
    });
  });

  it("enriches the case list with filter fields without a partyRole scalar", async () => {
    const res = await worker.fetch!(get("/api/cases"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        partyRole?: unknown;
        listIssueTags: Array<{ slug: string }>;
        affectedStateCodes: string[];
        entityRoles: string[];
        firstOccurredAt: string | null;
      }>;
    };
    const flaherty = body.items.find((row) => row.id === "case-flaherty");
    expect(flaherty).toBeDefined();
    expect(flaherty).not.toHaveProperty("partyRole");
    expect(flaherty!.listIssueTags.length).toBeGreaterThan(0);
    expect(flaherty!.affectedStateCodes).toContain("NJ");
    expect(Array.isArray(flaherty!.entityRoles)).toBe(true);
    expect(flaherty!.firstOccurredAt).toBe("2026-04-06");
    expect(flaherty!.firstOccurredAt).not.toBe("2025-04-01");
  });

  it("returns rich case detail with Tier-1 docket evidence", async () => {
    const res = await worker.fetch!(get("/api/cases/case-flaherty"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      partyRole?: unknown;
      sources: Array<{ tier: string }>;
      docketEvents: Array<{ source: { tier: string } }>;
      issueTags: unknown[];
      states: unknown[];
      entities: Array<{ role: string }>;
    };
    expect(body.id).toBe("case-flaherty");
    expect(body).not.toHaveProperty("partyRole");
    expect(body.sources.some((source) => source.tier === "tier1")).toBe(true);
    expect(body.docketEvents.length).toBeGreaterThan(0);
    expect(
      body.docketEvents.every((event) => event.source.tier === "tier1")
    ).toBe(true);
    expect(body.issueTags.length).toBeGreaterThan(0);
    expect(body.states.length).toBeGreaterThan(0);
    expect(body.entities).toContainEqual(
      expect.objectContaining({ role: "plaintiff" })
    );
  });

  it("404s an unknown case id with the error envelope", async () => {
    const res = await worker.fetch!(get("/api/cases/does-not-exist"), testEnv);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "not_found",
      message: expect.any(String)
    });
  });

  it("returns the seeded, structurally validated cert signal", async () => {
    const res = await worker.fetch!(get("/api/cert-signal"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      factors: Array<{ lead: string; explanation: string }>;
    };
    expect(body.id).toBe("current");
    expect(body.factors.length).toBeGreaterThan(0);
    expect(body.factors[0]).toEqual({
      lead: expect.any(String),
      explanation: expect.any(String)
    });
    expect(JSON.stringify(body)).not.toMatch(/factors_json|method_note/);
  });

  it("returns 400 for a malformed encoded case id", async () => {
    const res = await worker.fetch!(get("/api/cases/%E0%A4%A"), testEnv);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "bad_request",
      message: "Malformed case ID."
    });
  });

  it("returns 500 when the D1 binding is unavailable", async () => {
    const res = await worker.fetch!(get("/api/circuits"), {
      ...testEnv,
      DB: undefined
    } as unknown as Env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      code: "internal_error",
      message: "Unexpected server error."
    });
  });

  it("returns envelope 404 for unmatched /api/* paths", async () => {
    const res = await worker.fetch!(get("/api/nope"), testEnv);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "not_found",
      message: expect.any(String)
    });
  });

  it("does not claim /api/poll/votes (story 2.9)", async () => {
    const res = await worker.fetch!(get("/api/poll/votes"), testEnv);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") ?? "").not.toContain(
      "application/json"
    );
  });

  it("still 403s /api/admin/* and /agents/* (perimeter regression)", async () => {
    const anon = { ...testEnv, ACCESS_DEV_BYPASS: undefined } as Env;
    for (const path of ["/api/admin/ping", "/agents/ChatAgent"]) {
      const res = await worker.fetch!(get(path), anon);
      expect(res.status).toBe(403);
    }
  });
});

describe("apex orientation aggregates (story 2.2)", () => {
  it("returns SQL-derived KPIs as a camelCase single resource", async () => {
    const res = await worker.fetch!(get("/api/kpis"), testEnv);
    expect(res.status).toBe(200);
    const kpis = (await res.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(kpis);
    expect(serialized).not.toMatch(
      /states_tracked|matters_tracked|occurred_at|updated_at/
    );

    const casesRes = await worker.fetch!(get("/api/cases"), testEnv);
    const cases = (await casesRes.json()) as {
      items: Array<{
        id: string;
        forum: string;
        lifecycle: string;
      }>;
    };
    const statesRes = await worker.fetch!(get("/api/states"), testEnv);
    const states = (await statesRes.json()) as {
      items: Array<{
        posture: string;
        operationalStatus: string;
        updatedAt: string;
      }>;
    };

    const appellate = cases.items.filter(
      (c) => c.forum === "federal-appellate"
    );
    const appealsPending = appellate.filter((c) => c.lifecycle === "active");
    expect(cases.items.some((c) => c.id === "case-flaherty")).toBe(true);
    expect(kpis.appealsPending).toBe(appealsPending.length);
    expect(appealsPending.length).toBeLessThan(appellate.length);

    const tracked = states.items.filter((s) => s.posture !== "untracked");
    expect(kpis.statesTracked).toBe(tracked.length);
    expect(kpis.statesTracked).toBeLessThan(51);
    expect(kpis.statesTotal).toBe(51);
    expect(kpis.mattersTracked).toBe(cases.items.length);

    const circuitsRes = await worker.fetch!(get("/api/circuits"), testEnv);
    const circuits = (await circuitsRes.json()) as {
      items: Array<{ posture: string }>;
    };
    expect(kpis.circuitsTotal).toBe(circuits.items.length);
    expect(kpis.circuitsDecided).toBe(
      circuits.items.filter((c) =>
        ["platform", "state", "banned"].includes(c.posture)
      ).length
    );
    expect(kpis.circuitsWithActivity).toBe(
      circuits.items.filter((c) => c.posture !== "untracked").length
    );

    expect(kpis.operationalGo).toBe(
      states.items.filter((s) => s.operationalStatus === "go").length
    );
    expect(kpis.operationalRestricted).toBe(
      states.items.filter((s) => s.operationalStatus === "restricted").length
    );
    expect(kpis.operationalBanned).toBe(
      states.items.filter((s) => s.operationalStatus === "banned").length
    );
    const unknown = states.items.filter(
      (s) => s.operationalStatus === "unknown"
    ).length;
    expect(
      Number(kpis.operationalGo) +
        Number(kpis.operationalRestricted) +
        Number(kpis.operationalBanned) +
        unknown
    ).toBe(51);

    const freshness = String(kpis.freshness);
    const windowStart = new Date(freshness);
    windowStart.setUTCDate(windowStart.getUTCDate() - 30);
    expect(kpis.changedWindowStart).toBe(
      windowStart.toISOString().slice(0, 10)
    );
    expect(kpis.changedIn30Days).toBe(
      tracked.filter((s) => s.updatedAt >= windowStart.toISOString()).length
    );
    expect(kpis.provenanceKind).toBe("human");
  });

  it("lists recent developments newest-first, at most seven, camelCase", async () => {
    const res = await worker.fetch!(get("/api/developments"), testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ occurredAt: string; caseId: string; caption: string }>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(7);
    expect(JSON.stringify(body)).not.toMatch(/occurred_at|case_id/);
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i - 1]!.occurredAt >= body.items[i]!.occurredAt).toBe(
        true
      );
    }
  });
});

describe("F1 seed integrity", () => {
  it("gives every published tracked claim a Tier-1 source", async () => {
    const checks = [
      `SELECT 'circuit' AS kind, id
         FROM circuits c
        WHERE c.posture <> 'untracked'
          AND NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'circuits'
               AND s.owning_id = c.id
               AND s.tier = 'tier1'
          )`,
      `SELECT 'state' AS kind, id
         FROM states st
        WHERE st.posture <> 'untracked'
          AND NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'states'
               AND s.owning_id = st.id
               AND s.tier = 'tier1'
          )`,
      `SELECT 'case' AS kind, id
         FROM cases c
        WHERE NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'cases'
               AND s.owning_id = c.id
               AND s.tier = 'tier1'
          )`,
      `SELECT 'entity' AS kind, id
         FROM entities e
        WHERE NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'entities'
               AND s.owning_id = e.id
               AND s.tier = 'tier1'
          )`,
      `SELECT 'platform-status' AS kind, id
         FROM state_platform_statuses ps
        WHERE NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'state_platform_statuses'
               AND s.owning_id = ps.id
               AND s.tier = 'tier1'
          )`,
      `SELECT 'cert-signal' AS kind, id
         FROM cert_signals cs
        WHERE NOT EXISTS (
            SELECT 1 FROM sources s
             WHERE s.owning_table = 'cert_signals'
               AND s.owning_id = cs.id
               AND s.tier = 'tier1'
          )`
    ];
    const missing = (
      await Promise.all(
        checks.map((sql) =>
          testEnv.DB.prepare(sql).all<{ kind: string; id: string }>()
        )
      )
    ).flatMap(({ results }) => results ?? []);
    expect(missing).toEqual([]);
  });

  it("never labels secondary reporting as Tier-1", async () => {
    const { results } = await testEnv.DB.prepare(
      `SELECT id FROM sources
        WHERE tier = 'tier1'
          AND (
            url LIKE '%reuters.com/%'
            OR url LIKE '%bloomberg.com/%'
            OR url LIKE '%bloomberglaw.com/%'
            OR url LIKE '%natlawreview.com/%'
            OR url LIKE '%mickbransfield.com/%'
            OR url LIKE '%courthousenews.com/%'
          )`
    ).all<{ id: string }>();
    expect(results).toEqual([]);
  });

  it("keeps corrected primary records fitted to their exact claims", async () => {
    const { results } = await testEnv.DB.prepare(
      `SELECT id, url, title
         FROM sources
        WHERE id IN (
          'src-case-flaherty',
          'src-case-flaherty-dnj',
          'src-st-ct',
          'src-case-az',
          'src-case-ma-sjc',
          'src-case-mn',
          'src-case-ny-williams',
          'src-case-wi',
          'src-case-tn',
          'src-case-ut',
          'src-case-mi',
          'src-case-nv-tro'
        )`
    ).all<{ id: string; url: string; title: string }>();
    const sources = new Map(
      (results ?? []).map((source) => [source.id, source])
    );

    expect(sources.get("src-case-flaherty")?.url).toBe(
      "https://www2.ca3.uscourts.gov/opinarch/251922p.pdf"
    );
    expect(sources.get("src-case-flaherty-dnj")?.url).toContain(
      "gov.uscourts.njd.564738.21.0.pdf"
    );
    expect(sources.get("src-st-ct")?.url).toContain(
      "EnfNedLamontComplaint040226"
    );
    expect(sources.get("src-case-az")?.url).toContain(
      "USCOURTS-azd-2_26-cv-01715-2.pdf"
    );
    expect(sources.get("src-case-ma-sjc")?.url).toContain(
      "OGCMassachusettsAmicusBrief071426"
    );
    expect(sources.get("src-case-mn")?.url).toContain(
      "USCOURTS-mnd-0_26-cv-02661-0.pdf"
    );
    expect(sources.get("src-case-ny-williams")?.url).toMatch(
      /^https:\/\/ag\.ny\.gov\//
    );
    expect(sources.get("src-case-wi")?.url).toMatch(
      /^https:\/\/www\.wied\.uscourts\.gov\//
    );
    expect(sources.get("src-case-tn")?.url).toContain(
      "USCOURTS-tnmd-3_26-cv-00034-0.pdf"
    );
    expect(sources.get("src-case-ut")?.url).toContain(
      "USCOURTS-utd-2_26-cv-00151-0.pdf"
    );
    expect(sources.get("src-case-mi")?.url).toMatch(
      /^https:\/\/www\.michigan\.gov\/ag\/-\/media\//
    );
    expect(sources.get("src-case-nv-tro")?.url).toMatch(
      /^https:\/\/www\.gaming\.nv\.gov\//
    );

    expect(
      await testEnv.DB.prepare(
        "SELECT occurred_at, source_id FROM docket_events WHERE id = 'de-flaherty-ext'"
      ).first<{ occurred_at: string; source_id: string }>()
    ).toEqual({
      occurred_at: "2026-07-24",
      source_id: "src-case-flaherty-cert"
    });
    expect(
      await testEnv.DB.prepare(
        "SELECT source_id, description FROM docket_events WHERE id = 'de-nv-tro'"
      ).first<{ source_id: string; description: string }>()
    ).toEqual({
      source_id: "src-case-nv-tro",
      description: expect.not.stringContaining("first U.S.")
    });

    const { results: states } = await testEnv.DB.prepare(
      `SELECT id, operational_status
         FROM states
        WHERE id IN ('st-il', 'st-md', 'st-ny', 'st-oh', 'st-ut', 'st-wa', 'st-wi')
     ORDER BY id`
    ).all<{ id: string; operational_status: string }>();
    expect(states).toEqual([
      { id: "st-il", operational_status: "unknown" },
      { id: "st-md", operational_status: "unknown" },
      { id: "st-ny", operational_status: "unknown" },
      { id: "st-oh", operational_status: "unknown" },
      { id: "st-ut", operational_status: "unknown" },
      { id: "st-wa", operational_status: "unknown" },
      { id: "st-wi", operational_status: "unknown" }
    ]);

    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM state_platform_statuses WHERE state_id = 'st-il'"
      ).first<{ count: number }>()
    ).toEqual({ count: 0 });

    const { results: platformStatuses } = await testEnv.DB.prepare(
      `SELECT id, operational_status
         FROM state_platform_statuses
        WHERE id IN ('sps-nv-rh', 'sps-nv-nadex', 'sps-ut-kalshi', 'sps-wa-kalshi')
     ORDER BY id`
    ).all<{ id: string; operational_status: string }>();
    expect(platformStatuses).toEqual([
      { id: "sps-nv-nadex", operational_status: "unknown" },
      { id: "sps-nv-rh", operational_status: "unknown" },
      { id: "sps-ut-kalshi", operational_status: "unknown" },
      { id: "sps-wa-kalshi", operational_status: "unknown" }
    ]);
  });

  it("rejects null primary keys, malformed JSON, and non-primary docket sources", async () => {
    await expect(
      testEnv.DB.prepare(
        `INSERT INTO entities
          (id, slug, name, role, provenance_kind, published_at, updated_at)
         VALUES
          (NULL, 'null-id', 'Invalid', NULL, 'human',
           '2026-08-09T16:00:00.000Z', '2026-08-09T16:00:00.000Z')`
      ).run()
    ).rejects.toThrow();

    await expect(
      testEnv.DB.prepare(
        "UPDATE cert_signals SET factors_json = 'not-json' WHERE id = 'current'"
      ).run()
    ).rejects.toThrow();

    await expect(
      testEnv.DB.prepare(
        "UPDATE cert_signals SET factors_json = '[]' WHERE id = 'current'"
      ).run()
    ).rejects.toThrow();

    await expect(
      testEnv.DB.prepare(
        "UPDATE cases SET filed_at = '2026-02-30' WHERE id = 'case-flaherty'"
      ).run()
    ).rejects.toThrow();

    await expect(
      testEnv.DB.prepare(
        `INSERT INTO sources
          (id, owning_table, owning_id, url, title, tier, published_at)
         VALUES
          ('orphan-source', 'cases', 'missing-case',
           'https://example.gov/order', 'Missing owner', 'tier1', NULL)`
      ).run()
    ).rejects.toThrow(/owner does not exist/);

    await expect(
      testEnv.DB.prepare(
        `INSERT INTO sources
          (id, owning_table, owning_id, url, title, tier, published_at)
         VALUES
          ('http-source', 'cases', 'case-flaherty',
           'http://example.gov/order', 'Insecure URL', 'tier1', NULL)`
      ).run()
    ).rejects.toThrow();

    await expect(
      testEnv.DB.prepare(
        `INSERT INTO docket_events
          (id, case_id, occurred_at, description, source_id,
           provenance_kind, published_at, updated_at)
         VALUES
          ('bad-tier', 'case-nv-assad-9th', '2026-08-09',
           'Must fail.', 'src-case-nv-9th-secondary', 'human',
           '2026-08-09T16:00:00.000Z', '2026-08-09T16:00:00.000Z')`
      ).run()
    ).rejects.toThrow(/Tier-1/);
  });
});

/**
 * Story 2.3 — map fills join atlas features on `properties.name`.
 * Names are pinned in atlasStateNames.ts; the UI test reads the vendored file.
 */
describe("us-atlas name join (story 2.3)", () => {
  it("every seeded state name is an atlas properties.name", async () => {
    const res = await worker.fetch!(get("/api/states"), testEnv);
    const body = (await res.json()) as { items: Array<{ name: string }> };
    expect(US_ATLAS_STATE_NAMES).toHaveLength(51);
    expect(body.items).toHaveLength(51);
    const atlas = new Set<string>(US_ATLAS_STATE_NAMES);
    for (const row of body.items) {
      expect(atlas.has(row.name)).toBe(true);
    }
  });
});
