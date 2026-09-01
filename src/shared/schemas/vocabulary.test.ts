import { describe, expect, it } from "vitest";

import { CertSignalSchema } from "./certSignal";
import { IsoDateSchema, IsoUtcSchema } from "./common";
import { SourceSchema } from "./source";
import {
  OPERATIONAL_STATUS_VALUES,
  OperationalStatusSchema,
  POSTURE_VALUES,
  PostureSchema,
  ProvenanceKindSchema
} from "./vocabulary";

/**
 * The controlled vocabularies are the spine of the F1 data model.
 *
 * These strings are stored verbatim in D1 and rendered verbatim in the UI
 * (architecture #Naming-Patterns: "store PRD glossary strings exactly"). A
 * value changed here silently changes what every seeded row means, so the
 * membership is pinned literally rather than derived — a test that computes
 * the expected set from the implementation proves nothing.
 */
describe("posture vocabulary", () => {
  it("has exactly the five ramp steps, in ramp order", () => {
    expect(POSTURE_VALUES).toEqual([
      "untracked",
      "platform",
      "pending",
      "state",
      "banned"
    ]);
  });

  it.each(["untracked", "platform", "pending", "state", "banned"])(
    "accepts %s",
    (value) => {
      expect(PostureSchema.parse(value)).toBe(value);
    }
  );

  it.each(["go", "restricted", "", "BANNED", "unknown"])(
    "rejects %s",
    (value) => {
      expect(PostureSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("operational status vocabulary", () => {
  it("has the three glossary values plus the explicit absence value", () => {
    expect(OPERATIONAL_STATUS_VALUES).toEqual([
      "go",
      "restricted",
      "banned",
      "unknown"
    ]);
  });

  it.each(["go", "restricted", "banned", "unknown"])("accepts %s", (value) => {
    expect(OperationalStatusSchema.parse(value)).toBe(value);
  });

  it("does not share its absence value with the posture ramp", () => {
    // The two axes already collide on `banned`. Naming this one `untracked`
    // would have added a second overlap and made them harder to keep apart.
    expect(OperationalStatusSchema.safeParse("unknown").success).toBe(true);
    expect(PostureSchema.safeParse("unknown").success).toBe(false);
    expect(PostureSchema.safeParse("untracked").success).toBe(true);
    expect(OperationalStatusSchema.safeParse("untracked").success).toBe(false);
  });

  it.each(["untracked", "platform", "pending", "state", ""])(
    "rejects posture value %s",
    (value) => {
      expect(OperationalStatusSchema.safeParse(value).success).toBe(false);
    }
  );
});

/**
 * THE TRAP THIS FILE EXISTS TO PIN.
 *
 * `banned` is a member of BOTH vocabularies and means something different in
 * each: as a posture it says the litigation came out against platforms; as an
 * operational status it says a platform cannot operate there today. They are
 * independent axes — a state can be operationally `restricted` while its
 * posture is `pending`, and that combination is the single most common real
 * state of the docket.
 *
 * Collapsing them into one column or one enum destroys the distinction the
 * whole apex product exists to show, and `banned` is the value that makes the
 * mistake look correct in a spot check.
 */
describe("posture and operational status are independent axes", () => {
  it("overlaps on exactly one value: banned", () => {
    const overlap = POSTURE_VALUES.filter((v) =>
      (OPERATIONAL_STATUS_VALUES as readonly string[]).includes(v)
    );
    expect(overlap).toEqual(["banned"]);
  });

  it("does not let a posture value satisfy an operational status", () => {
    // If these ever both pass, the two enums have been merged.
    expect(PostureSchema.safeParse("pending").success).toBe(true);
    expect(OperationalStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("does not let an operational status satisfy a posture", () => {
    expect(OperationalStatusSchema.safeParse("go").success).toBe(true);
    expect(PostureSchema.safeParse("go").success).toBe(false);
  });
});

describe("date integrity", () => {
  it.each(["2026-08-09T16:00:00.000Z", "2000-02-29T00:00:00.001Z"])(
    "accepts canonical real UTC timestamp %s",
    (value) => {
      expect(IsoUtcSchema.parse(value)).toBe(value);
    }
  );

  it.each([
    "2026-02-29T16:00:00.000Z",
    "2026-08-09T24:00:00.000Z",
    "2026-08-09T16:00:00Z",
    "2026-08-09T16:00:00.000Zjunk"
  ])("rejects invalid or noncanonical UTC timestamp %s", (value) => {
    expect(IsoUtcSchema.safeParse(value).success).toBe(false);
  });

  it.each(["2024-02-29", "2026-08-09"])(
    "accepts real calendar date %s",
    (value) => {
      expect(IsoDateSchema.parse(value)).toBe(value);
    }
  );

  it.each(["2026-02-29", "2026-01-01junk", "2026-13-01"])(
    "rejects invalid date %s",
    (value) => {
      expect(IsoDateSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("claim payload integrity", () => {
  it("requires canonical source ownership and an HTTPS URL", () => {
    const source = {
      id: "src-1",
      owningTable: "cases",
      owningId: "case-1",
      url: "https://example.gov/order.pdf",
      title: "Order",
      tier: "tier1",
      publishedAt: "2026-08-09"
    };
    expect(SourceSchema.parse(source)).toEqual(source);
    expect(
      SourceSchema.safeParse({ ...source, owningTable: "made_up" }).success
    ).toBe(false);
    expect(
      SourceSchema.safeParse({ ...source, url: "http://example.gov/order.pdf" })
        .success
    ).toBe(false);
  });

  it("requires structured cert-signal factors", () => {
    const base = {
      id: "current",
      reading: "elevated",
      methodNote: "Human-curated seed.",
      reviewedAt: "2026-08-09",
      approver: "Patrick",
      provenanceKind: "human",
      publishedAt: "2026-08-09T16:00:00.000Z",
      updatedAt: "2026-08-09T16:00:00.000Z"
    };
    expect(
      CertSignalSchema.safeParse({
        ...base,
        factors: [{ lead: "One merits holding", explanation: "Flaherty." }]
      }).success
    ).toBe(true);
    expect(
      CertSignalSchema.safeParse({ ...base, factors: "not-an-array" }).success
    ).toBe(false);
  });
});

describe("provenance vocabulary", () => {
  it.each(["human", "agent"])("accepts %s", (value) => {
    expect(ProvenanceKindSchema.parse(value)).toBe(value);
  });

  it("rejects anything else — provenance is not free text", () => {
    for (const value of ["", "system", "Human", "unknown"]) {
      expect(ProvenanceKindSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("DDL-supporting vocabularies are pinned", () => {
  it("pins case lifecycle, party role, and source tier", async () => {
    const {
      CASE_LIFECYCLE_VALUES,
      CASE_ENTITY_ROLE_VALUES,
      SOURCE_TIER_VALUES,
      FORUM_VALUES,
      CERT_READING_VALUES,
      OPERATIONAL_STATUS_BASIS_VALUES,
      OWNING_TABLE_VALUES
    } = await import("./vocabulary");
    expect(CASE_LIFECYCLE_VALUES).toEqual(["active", "resolved"]);
    expect(CASE_ENTITY_ROLE_VALUES).toEqual([
      "plaintiff",
      "defendant",
      "appellant",
      "appellee",
      "beneficiary",
      "affected",
      "enforcement-target"
    ]);
    expect(SOURCE_TIER_VALUES).toEqual(["tier1", "tier2"]);
    expect(FORUM_VALUES).toEqual([
      "federal-district",
      "federal-appellate",
      "state",
      "agency"
    ]);
    expect(CERT_READING_VALUES).toEqual([
      "remote",
      "low",
      "elevated",
      "likely",
      "near-certain"
    ]);
    expect(OPERATIONAL_STATUS_BASIS_VALUES).toEqual(["stated", "inferred"]);
    expect(OWNING_TABLE_VALUES).toEqual([
      "cases",
      "states",
      "circuits",
      "entities",
      "cert_signals",
      "state_platform_statuses"
    ]);
  });
});
