import {
  SourceUnavailableError,
  type SourceCheck,
  type SourceCheckContext
} from "./connector";
import { reasonForStatus, scrubResponseDetail } from "./courtListener";
import { POLL_SOURCES } from "./sources";
import {
  fetchWithTimeout,
  isAbortError,
  isTimeoutError,
  SOURCE_FETCH_TIMEOUT_MS
} from "../../shared/lib/timeouts";

/** One seeded page poll. Three of these plus CourtListener stay under 10 minutes. */
export const SEEDED_PAGE_POLL_TIMEOUT_MS = 20_000;
/** A 200 body larger than this is `response_too_large` and is not parsed. */
export const SEEDED_PAGE_MAX_BYTES = 1_000_000;
/** Non-200 bodies are scrubbed from this prefix only. */
export const SEEDED_PAGE_ERROR_BODY_MAX_BYTES = 8192;

const CONTENT_TYPE_MAX = 120;

const ACCEPT =
  "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";

const SEEDED_NAMES = new Set([
  "CFTC press",
  "SCOTUS docket",
  "Legal news leads"
]);

function allowedOrigin(name: string): string | null {
  if (!SEEDED_NAMES.has(name)) return null;
  const seeded = POLL_SOURCES.find((source) => source.name === name);
  if (seeded == null) return null;
  return new URL(seeded.url).origin;
}

/** Same-origin https only. The rejected URL stays out of the error. */
function guardedUrl(input: string, origin: string): string {
  let url: URL;
  try {
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
    url = new URL(input);
  } catch {
    throw new SourceUnavailableError("unsafe_url");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new SourceUnavailableError("unsafe_url");
  }
  return url.href;
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function unavailable(
  reason: string,
  detail: Record<string, unknown>
): SourceUnavailableError {
  return new SourceUnavailableError(reason, detail);
}

/**
 * `reader.read()` uses the same map as `fetch`. Do not `cancel()` the
 * remainder: in this runtime that drains the rest of the stream.
 */
async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await reader.read();
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (isTimeoutError(err)) throw unavailable("timeout", {});
    throw unavailable("network", {});
  }
}

/** Read at most `maxBytes` and leave the rest of the stream unread. */
async function readAtMost(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await readChunk(reader);
    if (done) break;
    if (value == null || value.byteLength === 0) continue;
    const room = maxBytes - total;
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      total += room;
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return concatBytes(chunks, total);
}

function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length")?.trim();
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function readSuccessBody(response: Response): Promise<Uint8Array> {
  const declared = declaredLength(response);
  if (declared != null && declared > SEEDED_PAGE_MAX_BYTES) {
    throw new SourceUnavailableError("response_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await readChunk(reader);
    if (done) break;
    if (value == null || value.byteLength === 0) continue;
    if (total + value.byteLength > SEEDED_PAGE_MAX_BYTES) {
      throw new SourceUnavailableError("response_too_large");
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return concatBytes(chunks, total);
}

function contentTypeOf(response: Response): string | null {
  const value = response.headers.get("content-type");
  if (value == null) return null;
  return value.length > CONTENT_TYPE_MAX
    ? value.slice(0, CONTENT_TYPE_MAX)
    : value;
}

async function errorDetail(response: Response): Promise<string> {
  const bytes = await readAtMost(response, SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
  return scrubResponseDetail(new TextDecoder().decode(bytes), "");
}

async function fetchSeededPage(
  url: string,
  context: SourceCheckContext | undefined
): Promise<Response> {
  try {
    return await fetchWithTimeout(
      url,
      {
        signal: context?.signal,
        redirect: "manual",
        headers: { accept: ACCEPT }
      },
      SOURCE_FETCH_TIMEOUT_MS
    );
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (isTimeoutError(err)) throw unavailable("timeout", {});
    throw unavailable("network", {});
  }
}

/**
 * One same-origin fetch for a seeded page. `origin` is the factory's host.
 * It must match the `POLL_SOURCES` origin for `source.name`.
 */
export function createSeededPageCheck(origin: string): SourceCheck {
  const check: SourceCheck = async (source, context) => {
    const allowed = allowedOrigin(source.name);
    if (allowed == null || allowed !== origin) {
      throw unavailable("unsafe_url", {});
    }
    const url = guardedUrl(source.url, allowed);
    await context?.beforeRequest();
    const response = await fetchSeededPage(url, context);
    if (response.status >= 300 && response.status < 400) {
      throw unavailable("redirect", { status: response.status });
    }
    if (response.status !== 200) {
      const detail = await errorDetail(response);
      throw unavailable(reasonForStatus(response.status), {
        status: response.status,
        ...(detail ? { detail } : {})
      });
    }
    const contentType = contentTypeOf(response);
    const bytes = await readSuccessBody(response);
    return [
      {
        entities: [],
        fetched: { status: 200, contentType, bytes: bytes.byteLength }
      }
    ];
  };
  Object.assign(check, { pollTimeoutMs: SEEDED_PAGE_POLL_TIMEOUT_MS });
  return check;
}
