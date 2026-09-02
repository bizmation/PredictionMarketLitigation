import { useEffect, useState } from "react";

import type {
  EntityFootprint,
  EntityListItem,
  EntityMatter
} from "../../../shared/schemas/entity";

/**
 * Fetch the published entity ledger. Pattern copied from useOrientation:
 * useEffect + AbortController, fail closed, no query library, no React 19 use().
 *
 * `import type` from schemas so zod does not follow into the client bundle.
 */

export type LedgerStatus = "idle" | "loading" | "success" | "error";

export type EntityLedger = {
  items: EntityListItem[];
  status: LedgerStatus;
};

const FORUMS: ReadonlySet<string> = new Set([
  "federal-district",
  "federal-appellate",
  "state",
  "agency"
]);
const LIFECYCLES: ReadonlySet<string> = new Set(["active", "resolved"]);
const POSTURES: ReadonlySet<string> = new Set([
  "untracked",
  "platform",
  "pending",
  "state",
  "banned"
]);
const ROLES: ReadonlySet<string> = new Set([
  "plaintiff",
  "defendant",
  "appellant",
  "appellee",
  "beneficiary",
  "affected",
  "enforcement-target"
]);
const STATUSES: ReadonlySet<string> = new Set([
  "go",
  "restricted",
  "banned",
  "unknown"
]);

function isMatter(value: unknown): value is EntityMatter {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.caseId === "string" &&
    typeof row.caption === "string" &&
    typeof row.court === "string" &&
    (row.docketNumber === null || typeof row.docketNumber === "string") &&
    typeof row.forum === "string" &&
    FORUMS.has(row.forum) &&
    typeof row.lifecycle === "string" &&
    LIFECYCLES.has(row.lifecycle) &&
    typeof row.posture === "string" &&
    POSTURES.has(row.posture) &&
    typeof row.role === "string" &&
    ROLES.has(row.role)
  );
}

function isFootprint(value: unknown): value is EntityFootprint {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.stateCode === "string" &&
    row.stateCode.length === 2 &&
    typeof row.stateName === "string" &&
    typeof row.operationalStatus === "string" &&
    STATUSES.has(row.operationalStatus) &&
    (row.note === null || typeof row.note === "string")
  );
}

export function isEntityListItem(value: unknown): value is EntityListItem {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.slug === "string" &&
    typeof row.name === "string" &&
    (row.role === null || typeof row.role === "string") &&
    typeof row.provenanceKind === "string" &&
    Array.isArray(row.matters) &&
    row.matters.every(isMatter) &&
    Array.isArray(row.footprint) &&
    row.footprint.every(isFootprint)
  );
}

function unwrapItems(body: unknown): unknown[] | null {
  if (body !== null && typeof body === "object" && "items" in body) {
    const items = (body as { items: unknown }).items;
    return Array.isArray(items) ? items : null;
  }
  return null;
}

export function useEntityLedger(): EntityLedger {
  const [items, setItems] = useState<EntityListItem[]>([]);
  const [status, setStatus] = useState<LedgerStatus>("idle");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/entities", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const raw = unwrapItems(body);
        if (raw && raw.every(isEntityListItem)) {
          setItems(raw);
          setStatus("success");
          return;
        }
        setItems([]);
        setStatus("error");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setItems([]);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return { items, status };
}
