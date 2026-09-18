import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  acceptableFields,
  coupledUnit,
  defaultAcceptedFields,
  deriveStatePatch,
  isCoherentAcceptance,
  DISPOSITIVE_MERITS_KINDS,
  DOCKET_EVENT_KIND_VALUES,
  FAVORS_VALUES,
  InferenceSchema,
  INTERIM_MERITS_KINDS,
  kindGroup,
  PROCEDURAL_KINDS,
  RESOLVES_WITHOUT_MERITS_KINDS,
  StatePatchSchema,
  type CaseStateSnapshot
} from "./docketInference";

/**
 * Story 3.21 — the frozen transition table, row by row. `deriveStatePatch`
 * is pure; every kind × favors × current-row combination that matters is
 * pinned here so the table is reviewed once and never drifts.
 */

const ACTIVE_PENDING: CaseStateSnapshot = {
  lifecycle: "active",
  posture: "pending",
  decidedAt: null
};
const DATE = "2026-09-18";

describe("docket inference vocabulary", () => {
  it("has 28 kinds, each in exactly one group", () => {
    expect(DOCKET_EVENT_KIND_VALUES).toHaveLength(28);
    const grouped = [
      ...PROCEDURAL_KINDS,
      ...INTERIM_MERITS_KINDS,
      ...DISPOSITIVE_MERITS_KINDS,
      ...RESOLVES_WITHOUT_MERITS_KINDS
    ];
    expect(new Set(grouped).size).toBe(DOCKET_EVENT_KIND_VALUES.length);
    for (const kind of DOCKET_EVENT_KIND_VALUES) {
      expect(grouped).toContain(kind);
    }
    expect(FAVORS_VALUES).toEqual(["platform", "state", "none"]);
  });

  it("accepts a well-formed inference and rejects out-of-vocabulary answers", () => {
    expect(
      InferenceSchema.safeParse({
        kind: "pi-granted",
        favors: "platform",
        confidence: 0.9,
        basis: "ORDER granting Motion for Preliminary Injunction"
      }).success
    ).toBe(true);
    expect(
      InferenceSchema.safeParse({
        kind: "weird",
        favors: "platform",
        confidence: 0.9,
        basis: "x"
      }).success
    ).toBe(false);
    expect(
      InferenceSchema.safeParse({
        kind: "filing",
        favors: "plaintiff",
        confidence: 0.9,
        basis: "x"
      }).success
    ).toBe(false);
    expect(
      InferenceSchema.safeParse({
        kind: "filing",
        favors: "none",
        confidence: 1.5,
        basis: "x"
      }).success
    ).toBe(false);
    expect(
      InferenceSchema.safeParse({
        kind: "filing",
        favors: "none",
        confidence: 0.5,
        basis: "x".repeat(401)
      }).success
    ).toBe(false);
    expect(
      InferenceSchema.safeParse({
        kind: "filing",
        favors: "none",
        confidence: 0.5,
        basis: "x",
        extra: true
      }).success
    ).toBe(false);
  });
});

describe("deriveStatePatch (transition table)", () => {
  it.each(PROCEDURAL_KINDS.map((kind) => [kind]))(
    "procedural %s never patches, whatever favors says",
    (kind) => {
      for (const favors of FAVORS_VALUES) {
        expect(deriveStatePatch(kind, favors, ACTIVE_PENDING, DATE)).toEqual(
          {}
        );
      }
    }
  );

  it.each(INTERIM_MERITS_KINDS.map((kind) => [kind]))(
    "interim merits %s moves posture to the favored side only",
    (kind) => {
      expect(deriveStatePatch(kind, "platform", ACTIVE_PENDING, DATE)).toEqual({
        posture: { from: "pending", to: "platform" }
      });
      expect(deriveStatePatch(kind, "state", ACTIVE_PENDING, DATE)).toEqual({
        posture: { from: "pending", to: "state" }
      });
      expect(deriveStatePatch(kind, "none", ACTIVE_PENDING, DATE)).toEqual({});
    }
  );

  it.each(DISPOSITIVE_MERITS_KINDS.map((kind) => [kind]))(
    "dispositive %s resolves, sets decidedAt, and moves posture when sided",
    (kind) => {
      expect(deriveStatePatch(kind, "platform", ACTIVE_PENDING, DATE)).toEqual({
        lifecycle: { from: "active", to: "resolved" },
        posture: { from: "pending", to: "platform" },
        decidedAt: { from: null, to: DATE }
      });
      expect(deriveStatePatch(kind, "state", ACTIVE_PENDING, DATE)).toEqual({
        lifecycle: { from: "active", to: "resolved" },
        posture: { from: "pending", to: "state" },
        decidedAt: { from: null, to: DATE }
      });
      expect(deriveStatePatch(kind, "none", ACTIVE_PENDING, DATE)).toEqual({
        lifecycle: { from: "active", to: "resolved" },
        decidedAt: { from: null, to: DATE }
      });
    }
  );

  it.each(RESOLVES_WITHOUT_MERITS_KINDS.map((kind) => [kind]))(
    "resolves-without-merits %s resolves and sets decidedAt, posture untouched",
    (kind) => {
      for (const favors of FAVORS_VALUES) {
        expect(deriveStatePatch(kind, favors, ACTIVE_PENDING, DATE)).toEqual({
          lifecycle: { from: "active", to: "resolved" },
          decidedAt: { from: null, to: DATE }
        });
      }
    }
  );

  it("omits no-op fields when the row already holds the derived value", () => {
    const resolvedPlatform: CaseStateSnapshot = {
      lifecycle: "resolved",
      posture: "platform",
      decidedAt: DATE
    };
    expect(
      deriveStatePatch("judgment", "platform", resolvedPlatform, DATE)
    ).toEqual({});
    expect(
      deriveStatePatch("pi-granted", "platform", resolvedPlatform, DATE)
    ).toEqual({});
    expect(
      deriveStatePatch("judgment", "state", resolvedPlatform, "2026-10-01")
    ).toEqual({
      posture: { from: "platform", to: "state" },
      decidedAt: { from: DATE, to: "2026-10-01" }
    });
  });

  it("never produces banned or untracked and never touches identity fields", () => {
    const rows: CaseStateSnapshot[] = [
      ACTIVE_PENDING,
      { lifecycle: "active", posture: "banned", decidedAt: null },
      { lifecycle: "active", posture: "untracked", decidedAt: null },
      { lifecycle: "resolved", posture: "state", decidedAt: "2026-01-01" }
    ];
    for (const kind of DOCKET_EVENT_KIND_VALUES) {
      for (const favors of FAVORS_VALUES) {
        for (const row of rows) {
          const patch = deriveStatePatch(kind, favors, row, DATE);
          expect(StatePatchSchema.safeParse(patch).success).toBe(true);
          for (const key of Object.keys(patch)) {
            expect(["lifecycle", "posture", "decidedAt"]).toContain(key);
          }
          if (patch.posture) {
            expect(["platform", "state"]).toContain(patch.posture.to);
          }
          if (patch.lifecycle) {
            expect(patch.lifecycle.to).toBe("resolved");
          }
        }
      }
    }
  });

  it("never moves a hand-set banned posture; untracked may still move", () => {
    const banned: CaseStateSnapshot = {
      lifecycle: "active",
      posture: "banned",
      decidedAt: null
    };
    expect(deriveStatePatch("pi-granted", "platform", banned, DATE)).toEqual(
      {}
    );
    expect(deriveStatePatch("judgment", "platform", banned, DATE)).toEqual({
      lifecycle: { from: "active", to: "resolved" },
      decidedAt: { from: null, to: DATE }
    });
    const untracked: CaseStateSnapshot = {
      lifecycle: "active",
      posture: "untracked",
      decidedAt: null
    };
    expect(deriveStatePatch("pi-granted", "platform", untracked, DATE)).toEqual(
      { posture: { from: "untracked", to: "platform" } }
    );
  });

  it("groups every kind", () => {
    expect(kindGroup("filing")).toBe("procedural");
    expect(kindGroup("pi-denied")).toBe("interim-merits");
    expect(kindGroup("sj-granted")).toBe("dispositive-merits");
    expect(kindGroup("mandate")).toBe("resolves-without-merits");
  });
});

describe("acceptableFields", () => {
  it("lists kind/favors plus the derived statePatch fields, and nothing else", () => {
    expect(
      acceptableFields({
        caseId: "case-x",
        inference: {
          kind: "judgment",
          favors: "platform",
          confidence: 0.8,
          basis: "JUDGMENT entered"
        },
        statePatch: {
          lifecycle: { from: "active", to: "resolved" },
          posture: { from: "pending", to: "platform" },
          decidedAt: { from: null, to: DATE }
        }
      })
    ).toEqual(["kind", "favors", "lifecycle", "posture", "decidedAt"]);
    expect(
      acceptableFields({
        caseId: "case-x",
        inference: {
          kind: "appearance",
          favors: "none",
          confidence: 0.8,
          basis: "NOTICE of Appearance"
        },
        statePatch: {}
      })
    ).toEqual(["kind", "favors"]);
    expect(acceptableFields({ caseId: "case-x" })).toEqual([]);
    expect(acceptableFields(null)).toEqual([]);
    expect(acceptableFields({ inference: { kind: "weird" } })).toEqual([]);
  });
});

describe("coupled fields and the default policy", () => {
  const diff = {
    inference: {
      kind: "judgment",
      favors: "platform",
      confidence: 0.75,
      basis: "JUDGMENT"
    },
    statePatch: {
      lifecycle: { from: "active", to: "resolved" },
      posture: { from: "pending", to: "platform" },
      decidedAt: { from: null, to: DATE }
    }
  };

  it("couples favors with kind and decidedAt with lifecycle", () => {
    expect(coupledUnit("favors")).toEqual(["kind", "favors"]);
    expect(coupledUnit("lifecycle")).toEqual(["lifecycle", "decidedAt"]);
    expect(coupledUnit("posture")).toEqual(["posture"]);
    const all = acceptableFields(diff);
    expect(isCoherentAcceptance(all, all)).toBe(true);
    expect(isCoherentAcceptance(all, [])).toBe(true);
    expect(isCoherentAcceptance(all, ["kind", "favors", "posture"])).toBe(true);
    expect(isCoherentAcceptance(all, ["kind"])).toBe(false);
    expect(isCoherentAcceptance(all, ["favors"])).toBe(false);
    expect(isCoherentAcceptance(all, ["kind", "favors", "decidedAt"])).toBe(
      false
    );
    // A pair with only one acceptable half is not a pair.
    expect(
      isCoherentAcceptance(["kind", "favors", "decidedAt"], ["decidedAt"])
    ).toBe(true);
  });

  it("accepts everything at or above the threshold without disagreement, else nothing", () => {
    expect(defaultAcceptedFields(diff, 70, false)).toEqual([
      "kind",
      "favors",
      "lifecycle",
      "posture",
      "decidedAt"
    ]);
    expect(defaultAcceptedFields(diff, 75, false)).toEqual(
      acceptableFields(diff)
    );
    expect(defaultAcceptedFields(diff, 76, false)).toEqual([]);
    expect(defaultAcceptedFields(diff, 70, true)).toEqual([]);
    expect(defaultAcceptedFields({ caseId: "x" }, 0, false)).toEqual([]);
  });
});

/**
 * Migration 0018's CHECKs carry the vocabulary verbatim; this pins them to
 * the schema so neither can drift. Runs against Miniflare D1.
 */
describe("migration 0018 CHECK vocabularies", () => {
  const testEnv = env as Env;
  const STAMP = "2026-09-18T16:00:00.000Z";

  it("admits every kind and favors value and nothing else", async () => {
    await testEnv.DB.prepare(
      `INSERT OR IGNORE INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
       VALUES ('src-check-0018', 'cases', 'case-flaherty',
               'https://www.courtlistener.com/docket/1/check/', 'check', 'tier1', NULL)`
    ).run();
    const insert = (id: string, kind: string | null, favors: string | null) =>
      testEnv.DB.prepare(
        `INSERT INTO docket_events (id, case_id, occurred_at, description, source_id,
            kind, favors, provenance_kind, published_at, updated_at)
         VALUES (?, 'case-flaherty', '2026-09-18', 'check', 'src-check-0018', ?, ?,
                 'human', ?, ?)`
      )
        .bind(id, kind, favors, STAMP, STAMP)
        .run();
    for (const kind of DOCKET_EVENT_KIND_VALUES) {
      await insert(`de-check-kind-${kind}`, kind, null);
    }
    for (const favors of FAVORS_VALUES) {
      await insert(`de-check-favors-${favors}`, null, favors);
    }
    const { results } = await testEnv.DB.prepare(
      "SELECT kind, favors FROM docket_events WHERE id LIKE 'de-check-%'"
    ).all<{ kind: string | null; favors: string | null }>();
    expect(results).toHaveLength(
      DOCKET_EVENT_KIND_VALUES.length + FAVORS_VALUES.length
    );
    await expect(insert("de-check-bad-kind", "weird", null)).rejects.toThrow(
      /CHECK/
    );
    await expect(
      insert("de-check-bad-favors", null, "plaintiff")
    ).rejects.toThrow(/CHECK/);
  });
});
