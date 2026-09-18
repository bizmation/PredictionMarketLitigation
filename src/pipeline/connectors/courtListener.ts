import { z } from "zod";

import type { Db } from "../../shared/db/client";
import {
  fetchWithTimeout,
  isTimeoutError,
  SOURCE_FETCH_TIMEOUT_MS
} from "../../shared/lib/timeouts";
import { IsoDateSchema } from "../../shared/schemas/common";
import {
  SourceUnavailableError,
  type EntityChange,
  type SourceCheck,
  type SourceItem
} from "./connector";

/**
 * Story 3.21 — the first live connector. Polls CourtListener's v4
 * `docket-entries` API for every case whose Tier-1 source is a
 * `courtlistener.com/docket/<id>/` page and turns each unseen entry into a
 * `docket_events` Draft whose `diff` is the verbatim record (LLM read-only)
 * plus a `context` block the drafter classifies from.
 *
 * Failure is typed: a missing token, a 401/403/429/5xx, a network error or
 * a per-request timeout throws `SourceUnavailableError`, which
 * `runConnector` records as `source.skipped { reason }` with `failed: true`.
 * No retries, no backoff, no connector state table — newness is decided
 * against `docket_events` and prior Drafts, and the Draft id embeds the
 * CourtListener entry id so a re-Run is idempotent.
 *
 * RECAP data is crowd-sourced and may lag PACER; the `source.fetched`
 * summary says so and records only what was seen.
 */

export const COURTLISTENER_SOURCE_NAME = "CourtListener";
export const COURTLISTENER_API_BASE =
  "https://www.courtlistener.com/api/rest/v4/docket-entries/";
export const COURTLISTENER_PAGE_LIMIT = 20;
export const COURTLISTENER_FIELDS = "id,entry_number,date_filed,description";
export const RECAP_LAG_NOTE =
  "RECAP is crowd-sourced and may lag PACER; dates are as seen on CourtListener.";

const DOCKET_URL = /^https:\/\/www\.courtlistener\.com\/docket\/(\d+)\//;

export function docketIdFromUrl(url: string): string | null {
  const match = DOCKET_URL.exec(url);
  return match ? match[1]! : null;
}

export function docketEventId(caseId: string, entryId: number | string) {
  return `de-${caseId}-${entryId}`;
}

/** The entry's CourtListener URL: the docket page, anchored on the entry. */
export function entryUrl(docketUrl: string, entryNumber: number | null) {
  const base = docketUrl.split("?")[0]!.split("#")[0]!;
  return entryNumber == null ? base : `${base}?entry=${entryNumber}`;
}

export function entriesUrl(docketId: string): string {
  const params = new URLSearchParams({
    docket: docketId,
    order_by: "-date_filed",
    limit: String(COURTLISTENER_PAGE_LIMIT),
    fields: COURTLISTENER_FIELDS
  });
  return `${COURTLISTENER_API_BASE}?${params.toString()}`;
}

export function reasonForStatus(status: number): string {
  if (status === 401) return "http_401";
  if (status === 403) return "http_403";
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  return "http_error";
}

const EntrySchema = z.object({
  id: z.number().int(),
  entry_number: z.number().int().nullable().optional(),
  date_filed: z.string().nullable().optional(),
  description: z.string().nullable().optional()
});

const PageSchema = z.object({ results: z.array(z.unknown()) });

export type DocketEntry = {
  id: number;
  entryNumber: number | null;
  dateFiled: string | null;
  description: string;
};

/** Tolerant parse: malformed rows are dropped, never fatal. */
export function parseEntries(body: unknown): DocketEntry[] | null {
  const page = PageSchema.safeParse(body);
  const rows = page.success
    ? page.data.results
    : Array.isArray(body)
      ? body
      : null;
  if (rows == null) return null;
  const entries: DocketEntry[] = [];
  for (const row of rows) {
    const parsed = EntrySchema.safeParse(row);
    if (!parsed.success) continue;
    entries.push({
      id: parsed.data.id,
      entryNumber: parsed.data.entry_number ?? null,
      dateFiled: parsed.data.date_filed ?? null,
      description: (parsed.data.description ?? "").trim()
    });
  }
  return entries;
}

type DocketRow = {
  url: string;
  case_id: string;
  caption: string;
  court: string;
  lifecycle: string;
  posture: string;
  decided_at: string | null;
};

type PartyRow = {
  name: string;
  entity_role: string | null;
  case_role: string;
};

export type DocketEventRecord = {
  caseId: string;
  occurredAt: string;
  description: string;
  sourceUrl: string;
  entryNumber: number | null;
  entryId: number;
  docketId: string;
  context: {
    caption: string;
    court: string;
    lifecycle: string;
    posture: string;
    decidedAt: string | null;
    parties: Array<{ name: string; entityRole: string | null; role: string }>;
  };
};

export type FetchImpl = (
  input: string,
  init: RequestInit
) => Promise<Pick<Response, "status" | "ok" | "json">>;

export interface CourtListenerCheckDeps {
  db: Db;
  /** `env.COURTLISTENER_API_TOKEN`; absent → `source.skipped { "unconfigured" }`. */
  token: string | undefined;
  /** Defaults to `fetchWithTimeout` over the global `fetch`. */
  fetchImpl?: FetchImpl;
  now?: () => string;
}

const defaultFetch: FetchImpl = (input, init) =>
  fetchWithTimeout(input, init, SOURCE_FETCH_TIMEOUT_MS);

async function listDockets(db: Db): Promise<DocketRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.url, s.owning_id AS case_id, c.caption, c.court,
              c.lifecycle, c.posture, c.decided_at
         FROM sources s
         JOIN cases c ON c.id = s.owning_id
        WHERE s.owning_table = 'cases'
          AND s.tier = 'tier1'
          AND s.url GLOB 'https://www.courtlistener.com/docket/*'
     ORDER BY s.owning_id ASC, s.id ASC`
    )
    .all<DocketRow>();
  return results ?? [];
}

async function listParties(db: Db, caseId: string): Promise<PartyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT e.name, e.role AS entity_role, ce.role AS case_role
         FROM case_entities ce
         JOIN entities e ON e.id = ce.entity_id
        WHERE ce.case_id = ?
     ORDER BY e.name ASC`
    )
    .bind(caseId)
    .all<PartyRow>();
  return results ?? [];
}

async function latestOccurredAt(
  db: Db,
  caseId: string
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT MAX(occurred_at) AS latest FROM docket_events WHERE case_id = ?"
    )
    .bind(caseId)
    .first<{ latest: string | null }>();
  return row?.latest ?? null;
}

/**
 * Entry ids already on the record or already Drafted for this case (any
 * outcome). Both id spaces embed the CourtListener entry id.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function seenEventIds(db: Db, caseId: string): Promise<Set<string>> {
  const pattern = `${escapeLike(docketEventId(caseId, ""))}%`;
  const [published, drafted] = await Promise.all([
    db
      .prepare("SELECT id FROM docket_events WHERE id LIKE ? ESCAPE '\\'")
      .bind(pattern)
      .all<{ id: string }>(),
    db
      .prepare(
        `SELECT target_entity_id AS id FROM drafts
          WHERE target_entity_type = 'docket_events'
            AND target_entity_id LIKE ? ESCAPE '\\'`
      )
      .bind(pattern)
      .all<{ id: string }>()
  ]);
  const seen = new Set<string>();
  for (const row of published.results ?? []) seen.add(row.id);
  for (const row of drafted.results ?? []) seen.add(row.id);
  return seen;
}

export const COURTLISTENER_MAX_PAGES = 5;

/** Source-level failures: nothing on this account can be polled. */
const SOURCE_LEVEL_REASONS = new Set([
  "http_401",
  "http_403",
  "http_429",
  "http_5xx",
  "network",
  "timeout"
]);

/** A docket that failed in isolation — recorded in the summary, not fatal. */
class DocketError extends Error {
  readonly reason: string;
  readonly status: number | undefined;

  constructor(reason: string, status?: number) {
    super(`docket ${reason}`);
    this.name = "DocketError";
    this.reason = reason;
    this.status = status;
  }
}

async function fetchPage(
  fetchImpl: FetchImpl,
  token: string,
  url: string
): Promise<{ entries: DocketEntry[]; next: string | null }> {
  let response: Awaited<ReturnType<FetchImpl>>;
  try {
    response = await fetchImpl(url, {
      headers: {
        authorization: `Token ${token}`,
        accept: "application/json"
      }
    });
  } catch (err) {
    throw new DocketError(isTimeoutError(err) ? "timeout" : "network");
  }
  if (!response.ok) {
    throw new DocketError(reasonForStatus(response.status), response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DocketError("malformed");
  }
  const entries = parseEntries(body);
  if (entries == null) throw new DocketError("malformed");
  const next =
    body != null &&
    typeof body === "object" &&
    typeof (body as { next?: unknown }).next === "string"
      ? (body as { next: string }).next
      : null;
  return { entries, next };
}

/**
 * Newest-first pages. Follow `next` while the page's oldest dated entry is
 * still on or after the baseline (an older page cannot hold a new entry);
 * stop at `COURTLISTENER_MAX_PAGES` and say so.
 */
async function fetchEntries(
  fetchImpl: FetchImpl,
  token: string,
  docketId: string,
  baseline: string | null
): Promise<{ entries: DocketEntry[]; pages: number; truncated: boolean }> {
  const entries: DocketEntry[] = [];
  let url: string | null = entriesUrl(docketId);
  let pages = 0;
  let truncated = false;
  while (url != null) {
    if (pages >= COURTLISTENER_MAX_PAGES) {
      truncated = true;
      break;
    }
    const page = await fetchPage(fetchImpl, token, url);
    pages += 1;
    entries.push(...page.entries);
    let oldest: string | null = null;
    for (const entry of page.entries) {
      const dated = IsoDateSchema.safeParse(entry.dateFiled);
      if (dated.success && (oldest == null || dated.data < oldest)) {
        oldest = dated.data;
      }
    }
    const mayHoldMore =
      page.next != null &&
      page.entries.length > 0 &&
      (baseline == null || oldest == null || oldest >= baseline);
    url = mayHoldMore ? page.next : null;
  }
  return { entries, pages, truncated };
}

/** The docket-page `sources.published_at` for this case: the date tracking began. */
async function sourcePublishedAt(
  db: Db,
  caseId: string,
  url: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT published_at FROM sources
        WHERE owning_table = 'cases' AND owning_id = ? AND url = ?
        LIMIT 1`
    )
    .bind(caseId, url)
    .first<{ published_at: string | null }>();
  return row?.published_at ?? null;
}

export type Baseline = {
  kind: "docket_events" | "source_published_at";
  date: string;
} | null;

function bodyFor(record: DocketEventRecord): string {
  const number =
    record.entryNumber == null
      ? "unnumbered entry"
      : `entry ${record.entryNumber}`;
  return `${record.context.caption} — docket ${number}, filed ${record.occurredAt}: ${record.description}`;
}

export function toEntityChange(record: DocketEventRecord): EntityChange {
  const { entryId, docketId, ...diff } = record;
  return {
    type: "docket_events",
    id: docketEventId(record.caseId, entryId),
    diff: { ...diff, docketId, entryId },
    body: bodyFor(record)
  };
}

type DocketOutcome = {
  docketId: string;
  entities: EntityChange[];
  summary: Record<string, unknown>;
};

async function pollDocket(
  deps: CourtListenerCheckDeps,
  fetchImpl: FetchImpl,
  token: string,
  docketId: string,
  row: DocketRow
): Promise<DocketOutcome> {
  const [latest, seen, parties, trackedSince] = await Promise.all([
    latestOccurredAt(deps.db, row.case_id),
    seenEventIds(deps.db, row.case_id),
    listParties(deps.db, row.case_id),
    sourcePublishedAt(deps.db, row.case_id, row.url)
  ]);
  // Baseline floor: the latest published development, or — before any
  // exists — the day the docket source was recorded, so the first live Run
  // never backfills history the tracker never claimed to follow.
  const baseline: Baseline =
    latest != null
      ? { kind: "docket_events", date: latest }
      : trackedSince != null
        ? { kind: "source_published_at", date: trackedSince }
        : null;

  const fetched = await fetchEntries(
    fetchImpl,
    token,
    docketId,
    baseline?.date ?? null
  );

  const entities: EntityChange[] = [];
  let latestEntryDate: string | null = null;
  let seenCount = 0;
  let undated = 0;
  for (const entry of fetched.entries) {
    const dated = IsoDateSchema.safeParse(entry.dateFiled);
    if (!dated.success || entry.description.length === 0) {
      undated += 1;
      continue;
    }
    if (latestEntryDate == null || dated.data > latestEntryDate) {
      latestEntryDate = dated.data;
    }
    const id = docketEventId(row.case_id, entry.id);
    if (seen.has(id) || (baseline != null && dated.data < baseline.date)) {
      seenCount += 1;
      continue;
    }
    entities.push(
      toEntityChange({
        caseId: row.case_id,
        occurredAt: dated.data,
        description: entry.description,
        sourceUrl: entryUrl(row.url, entry.entryNumber),
        entryNumber: entry.entryNumber,
        entryId: entry.id,
        docketId,
        context: {
          caption: row.caption,
          court: row.court,
          lifecycle: row.lifecycle,
          posture: row.posture,
          decidedAt: row.decided_at,
          parties: parties.map((party) => ({
            name: party.name,
            entityRole: party.entity_role,
            role: party.case_role
          }))
        }
      })
    );
  }
  return {
    docketId,
    entities,
    summary: {
      docketId,
      caseId: row.case_id,
      baseline,
      latestEntryDate,
      entries: fetched.entries.length,
      pages: fetched.pages,
      truncated: fetched.truncated,
      newEntries: entities.length,
      seen: seenCount,
      skippedIncomplete: undated
    }
  };
}

export function createCourtListenerCheck(
  deps: CourtListenerCheckDeps
): SourceCheck {
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  return async (): Promise<SourceItem[]> => {
    const token = deps.token?.trim();
    if (!token) throw new SourceUnavailableError("unconfigured");

    const dockets = await listDockets(deps.db);
    const byDocket = new Map<string, DocketRow>();
    const unmatched: string[] = [];
    for (const row of dockets) {
      const docketId = docketIdFromUrl(row.url);
      if (docketId == null) {
        unmatched.push(row.url);
        continue;
      }
      const key = `${docketId}:${row.case_id}`;
      if (!byDocket.has(key)) byDocket.set(key, row);
    }
    if (byDocket.size === 0) {
      throw new SourceUnavailableError("no_dockets", { unmatched });
    }

    const fetchedAt = deps.now?.() ?? new Date().toISOString();
    // Dockets poll concurrently so N dockets cost one request-deadline, not
    // N. A docket that fails on its own (404, other 4xx, malformed JSON) is
    // recorded and the rest continue; a failure that means the whole account
    // cannot poll (auth, rate limit, outage, network, timeout) fails the
    // source.
    const outcomes = await Promise.all(
      [...byDocket].map(async ([key, row]) => {
        const docketId = key.slice(0, key.indexOf(":"));
        try {
          return await pollDocket(deps, fetchImpl, token, docketId, row);
        } catch (err) {
          if (err instanceof DocketError) {
            if (SOURCE_LEVEL_REASONS.has(err.reason)) {
              throw new SourceUnavailableError(err.reason, {
                docketId,
                ...(err.status == null ? {} : { status: err.status })
              });
            }
            return {
              docketId,
              entities: [],
              summary: {
                docketId,
                caseId: row.case_id,
                error: err.reason,
                ...(err.status == null ? {} : { status: err.status })
              }
            } satisfies DocketOutcome;
          }
          throw err;
        }
      })
    );

    return [
      {
        entities: outcomes.flatMap((outcome) => outcome.entities),
        fetched: {
          docketIds: outcomes.map((outcome) => outcome.docketId),
          fetchedAt,
          dockets: outcomes.map((outcome) => outcome.summary),
          ...(unmatched.length > 0 ? { unmatched } : {}),
          note: RECAP_LAG_NOTE
        }
      }
    ];
  };
}
