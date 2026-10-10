import { z } from "zod";

import type { Db } from "../../shared/db/client";
import {
  fetchWithTimeout,
  isAbortError,
  isTimeoutError,
  SOURCE_FETCH_TIMEOUT_MS
} from "../../shared/lib/timeouts";
import { IsoDateSchema } from "../../shared/schemas/common";
import {
  SourceUnavailableError,
  SourcePersistenceError,
  type EntityChange,
  type SourceCheck,
  type SourceCheckContext,
  type SourceItem
} from "./connector";

/**
 * Story 3.21 — the first live connector. Polls CourtListener's v4
 * `docket-entries` API for every case whose Tier-1 source is a
 * `courtlistener.com/docket/<id>/` page and turns each unseen entry into a
 * `docket_events` Draft whose `diff` is the verbatim record (LLM read-only)
 * plus a `context` block the drafter classifies from.
 *
 * Failure is typed: a missing token, a 401/403/5xx, a network error or
 * a per-request timeout throws `SourceUnavailableError`, which
 * `runConnector` records as `source.skipped { reason }` with `failed: true`.
 * An isolated 4xx or malformed body stays on that docket. When every polled
 * docket errors, the summary is still `source.fetched` and the connector
 * returns `failed: true` (story 3.23).
 * Story 3.38 paces request starts and retries HTTP 429 only. Other failures
 * still fail on the first response. An exhausted 429 is still source-level
 * `http_429`. Newness is decided against `docket_events` and prior Drafts,
 * and the Draft id embeds the CourtListener entry id so a re-Run is idempotent.
 *
 * RECAP data is crowd-sourced and may lag PACER; the `source.fetched`
 * summary says so and records only what was seen.
 */

export const COURTLISTENER_SOURCE_NAME = "CourtListener";
export const COURTLISTENER_API_BASE =
  "https://www.courtlistener.com/api/rest/v4/docket-entries/";
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

// v4 rejects the legacy `limit` filter. Follow its pagination links; the
// connector enforces COURTLISTENER_MAX_PAGES independently of server page size.
export function entriesUrl(docketId: string): string {
  const params = new URLSearchParams({
    docket: docketId,
    order_by: "-date_filed",
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

const RESPONSE_DETAIL_MAX = 180;

/** Collapse whitespace, drop the API token, and cap length for Evidence. */
export function scrubResponseDetail(text: string, token: string): string {
  const redacted = token ? text.split(token).join("[redacted]") : text;
  const collapsed = redacted.replace(/\s+/g, " ").trim();
  return collapsed.length > RESPONSE_DETAIL_MAX
    ? collapsed.slice(0, RESPONSE_DETAIL_MAX)
    : collapsed;
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
) => Promise<Pick<Response, "status" | "ok" | "json" | "text" | "headers">>;

/** Four starts per minute, under CourtListener's about-5-per-minute limit. */
export const COURTLISTENER_MIN_INTERVAL_MS = 15_000;
/** One initial request plus two retries. */
export const COURTLISTENER_MAX_ATTEMPTS = 3;
/** Used when Retry-After is missing or unparseable. Matches the 5/minute window. */
export const COURTLISTENER_DEFAULT_BACKOFF_MS = 60_000;
/** Cap delta-seconds and HTTP-date delays so one header cannot stall the Run. */
export const COURTLISTENER_MAX_BACKOFF_MS = 60_000;
/** Deliberate 429 and spacing waits per check. Fetches are outside this budget. */
export const COURTLISTENER_WAIT_BUDGET_MS = 6 * 60 * 1000;
/**
 * Whole CourtListener poll, including waits. Inside the default 10-minute
 * Workflow step timeout and above the generic 60-second connector deadline.
 */
export const COURTLISTENER_POLL_TIMEOUT_MS = 8 * 60 * 1000;

export type CourtListenerWait = (
  ms: number,
  signal: AbortSignal
) => Promise<void>;

export interface CourtListenerCheckDeps {
  db: Db;
  /** `env.COURTLISTENER_API_TOKEN`; absent → `source.skipped { "unconfigured" }`. */
  token: string | undefined;
  /** Defaults to `fetchWithTimeout` over the global `fetch`. */
  fetchImpl?: FetchImpl;
  now?: () => string;
  /** Clock for spacing. Defaults to `Date.now`. */
  nowMs?: () => number;
  /** Defaults to an abortable `setTimeout`. Tests inject an instant wait. */
  wait?: CourtListenerWait;
  /** Defaults to `COURTLISTENER_WAIT_BUDGET_MS`. */
  waitBudgetMs?: number;
}

/**
 * `Retry-After` as delay-seconds or an HTTP-date, capped at one limit window.
 * Unparseable values return null so the caller uses the default window.
 */
export function retryAfterMs(
  headers: { get(name: string): string | null } | undefined,
  now = Date.now()
): number | null {
  const raw = headers?.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const ms = Math.ceil(Number(raw) * 1000);
    if (!Number.isFinite(ms)) return null;
    return Math.min(ms, COURTLISTENER_MAX_BACKOFF_MS);
  }
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) return null;
  return Math.min(Math.max(0, when - now), COURTLISTENER_MAX_BACKOFF_MS);
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

const defaultWait: CourtListenerWait = (ms, signal) => {
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : abortError()
    );
  }
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
};

const defaultFetch: FetchImpl = (input, init) =>
  fetchWithTimeout(input, init, SOURCE_FETCH_TIMEOUT_MS);

async function readSourceState<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    throw new SourcePersistenceError(cause);
  }
}

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
  readonly detail: string | undefined;
  readonly attempts: number | undefined;

  constructor(
    reason: string,
    status?: number,
    detail?: string,
    attempts?: number
  ) {
    super(`docket ${reason}`);
    this.name = "DocketError";
    this.reason = reason;
    this.status = status;
    this.detail = detail;
    this.attempts = attempts;
  }
}

type Pace = (extraMs: number, signal: AbortSignal) => Promise<void>;

/** Resolve links against the current page, then check before adding the token. */
function validatedPageUrl(input: string, base: string): string {
  let url: URL;
  try {
    // Do not accept URL parser repairs of control characters or backslashes.
    if (
      !input ||
      input.includes("\\") ||
      /%(?![0-9a-f]{2})/i.test(input) ||
      Array.from(input).some((char) => {
        const code = char.charCodeAt(0);
        return code <= 0x20 || code === 0x7f;
      })
    ) {
      throw new Error("invalid URL");
    }
    url = new URL(input, base);
  } catch {
    throw new DocketError("unsafe_url");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== new URL(COURTLISTENER_API_BASE).origin ||
    url.username !== "" ||
    url.password !== ""
  ) {
    // Never put the rejected URL or parser error into public Evidence.
    throw new DocketError("unsafe_url");
  }
  return url.href;
}

async function responseDetail(
  response: Awaited<ReturnType<FetchImpl>>,
  token: string
): Promise<string | undefined> {
  try {
    const scrubbed = scrubResponseDetail(await response.text(), token);
    return scrubbed || undefined;
  } catch {
    return undefined;
  }
}

async function fetchPage(
  fetchImpl: FetchImpl,
  token: string,
  input: string,
  pace: Pace,
  noteStart: () => void,
  context?: SourceCheckContext
): Promise<{ entries: DocketEntry[]; next: string | null }> {
  const url = validatedPageUrl(input, COURTLISTENER_API_BASE);
  const signal = context?.signal ?? new AbortController().signal;
  let backoff = 0;
  for (let attempt = 1; attempt <= COURTLISTENER_MAX_ATTEMPTS; attempt++) {
    await context?.beforeRequest();
    signal.throwIfAborted();
    await pace(backoff, signal);
    signal.throwIfAborted();
    noteStart();
    let response: Awaited<ReturnType<FetchImpl>>;
    try {
      response = await fetchImpl(url, {
        signal,
        redirect: "manual",
        headers: {
          authorization: `Token ${token}`,
          accept: "application/json"
        }
      });
    } catch (err) {
      if (isAbortError(err) || signal.aborted) throw err;
      throw new DocketError(isTimeoutError(err) ? "timeout" : "network");
    }
    signal.throwIfAborted();
    // Redirects are unsupported, including same-origin ones. Do not inspect
    // their body or Location, which may contain credentials or unsafe URLs.
    if (response.status >= 300 && response.status < 400) {
      throw new DocketError("redirect", response.status);
    }
    if (response.status === 429) {
      const detail = await responseDetail(response, token);
      backoff =
        retryAfterMs(response.headers) ?? COURTLISTENER_DEFAULT_BACKOFF_MS;
      if (attempt === COURTLISTENER_MAX_ATTEMPTS) {
        throw new DocketError("http_429", 429, detail, attempt);
      }
      continue;
    }
    if (!response.ok) {
      throw new DocketError(
        reasonForStatus(response.status),
        response.status,
        await responseDetail(response, token)
      );
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
      body != null && typeof body === "object"
        ? (body as { next?: unknown }).next
        : null;
    if (next != null && typeof next !== "string") {
      throw new DocketError("malformed");
    }
    // Validate even if the baseline/page cap later means this link is unused.
    return {
      entries,
      next: next == null ? null : validatedPageUrl(next, url)
    };
  }
  throw new DocketError("http_429", 429, undefined, COURTLISTENER_MAX_ATTEMPTS);
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
  baseline: string | null,
  pace: Pace,
  noteStart: () => void,
  context?: SourceCheckContext
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
    const page = await fetchPage(
      fetchImpl,
      token,
      url,
      pace,
      noteStart,
      context
    );
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
  row: DocketRow,
  pace: Pace,
  noteStart: () => void,
  context?: SourceCheckContext
): Promise<DocketOutcome> {
  const [latest, seen, parties, trackedSince] = await readSourceState(() =>
    Promise.all([
      latestOccurredAt(deps.db, row.case_id),
      seenEventIds(deps.db, row.case_id),
      listParties(deps.db, row.case_id),
      sourcePublishedAt(deps.db, row.case_id, row.url)
    ])
  );
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
    baseline?.date ?? null,
    pace,
    noteStart,
    context
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
  const check: SourceCheck = async (
    _source,
    context
  ): Promise<SourceItem[]> => {
    const siblings = new AbortController();
    const signal = context
      ? AbortSignal.any([context.signal, siblings.signal])
      : siblings.signal;
    const guarded: SourceCheckContext = {
      signal,
      beforeRequest: async () => {
        signal.throwIfAborted();
        await context?.beforeRequest();
        signal.throwIfAborted();
      }
    };
    const token = deps.token?.trim();
    if (!token) throw new SourceUnavailableError("unconfigured");

    const dockets = await readSourceState(() => listDockets(deps.db));
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
    // One pace clock per poll. Starts are serial so four dockets stay under
    // 5 requests/minute. A docket that fails on its own (404, other 4xx,
    // malformed JSON) is recorded and the rest continue; auth, exhausted
    // rate limit, outage, network, and timeout fail the source.
    let lastRequestAt: number | null = null;
    let waitSpent = 0;
    const nowMs = deps.nowMs ?? Date.now;
    const wait = deps.wait ?? defaultWait;
    const budget = deps.waitBudgetMs ?? COURTLISTENER_WAIT_BUDGET_MS;
    const noteStart = () => {
      lastRequestAt = nowMs();
    };
    const pace: Pace = async (extraMs, paceSignal) => {
      const elapsed =
        lastRequestAt == null
          ? COURTLISTENER_MIN_INTERVAL_MS
          : nowMs() - lastRequestAt;
      const intervalWait =
        lastRequestAt == null
          ? 0
          : Math.max(0, COURTLISTENER_MIN_INTERVAL_MS - elapsed);
      const waitMs = Math.max(intervalWait, extraMs);
      if (waitMs <= 0) return;
      if (waitSpent + waitMs > budget) {
        throw new DocketError(
          "http_429",
          429,
          "rate limit wait budget exhausted"
        );
      }
      waitSpent += waitMs;
      await wait(waitMs, paceSignal);
    };
    const outcomes: DocketOutcome[] = [];
    for (const [key, row] of byDocket) {
      const docketId = key.slice(0, key.indexOf(":"));
      try {
        outcomes.push(
          await pollDocket(
            deps,
            fetchImpl,
            token,
            docketId,
            row,
            pace,
            noteStart,
            guarded
          )
        );
      } catch (err) {
        if (err instanceof DocketError) {
          if (SOURCE_LEVEL_REASONS.has(err.reason)) {
            siblings.abort();
            throw new SourceUnavailableError(err.reason, {
              docketId,
              ...(err.status == null ? {} : { status: err.status }),
              ...(err.detail ? { detail: err.detail } : {}),
              ...(err.attempts == null ? {} : { attempts: err.attempts })
            });
          }
          outcomes.push({
            docketId,
            entities: [],
            summary: {
              docketId,
              caseId: row.case_id,
              error: err.reason,
              ...(err.status == null ? {} : { status: err.status }),
              ...(err.detail ? { detail: err.detail } : {})
            }
          });
          continue;
        }
        siblings.abort();
        throw err;
      }
    }

    const everyDocketErrored =
      outcomes.length > 0 &&
      outcomes.every((outcome) => typeof outcome.summary.error === "string");
    return [
      {
        entities: outcomes.flatMap((outcome) => outcome.entities),
        ...(everyDocketErrored ? { failed: true } : {}),
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
  Object.assign(check, { pollTimeoutMs: COURTLISTENER_POLL_TIMEOUT_MS });
  return check;
}
