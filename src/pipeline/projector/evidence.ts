import type { Db } from "../../shared/db/client";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import type { EvidenceEvent } from "../../shared/schemas/run";
import type { EvidenceEventType } from "../../shared/schemas/vocabulary";

/**
 * Story 3.8 — the sole Evidence write path. Pipeline callers append through
 * `append` / `appendStmt`; this module scrubs secret-bearing keys and
 * credential-shaped values, then binds via `evidenceRepo`. Vendor logs never
 * land in D1. The public GET returns whatever survived this write.
 *
 * Review pass 2 (2026-09-11) refined the matching, by decision: a secret token
 * must be the whole key or one of its word segments ("openaiApiKey" and
 * "api_token" are dropped; "author" and "authenticationStatus" survive), the
 * credential regex matches whole values only (incidental "Bearer …" prose
 * survives — an accepted recall trade), and a key match never drops a value
 * that cannot hold a secret (numbers, booleans, null — "tokenCount: 42"
 * stays).
 */

export type EvidenceAppendInput = {
  id: string;
  runId: string;
  event: EvidenceEventType;
  payload: unknown;
  createdAt: string;
};

const SECRET_KEYS = new Set([
  "apikey",
  "password",
  "passwd",
  "pwd",
  "secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "bearertoken",
  "bearer",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "privatekey",
  "accesskey",
  "secretkey",
  "sessionkey",
  "authtoken"
]);

const CREDENTIAL_VALUE =
  /^(sk-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Word segments of a key: splits on non-alphanumerics and camelCase humps. */
function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/**
 * True when a secret token is the whole key or appears as one of its word
 * segments (single or joined): "openaiApiKey" → api+key → "apikey".
 */
function isSecretKey(key: string): boolean {
  if (SECRET_KEYS.has(normalizeKey(key))) return true;
  const segments = keySegments(key);
  for (let start = 0; start < segments.length; start += 1) {
    let joined = "";
    for (let end = start; end < segments.length && end - start < 3; end += 1) {
      joined += segments[end]!;
      if (SECRET_KEYS.has(joined)) return true;
    }
  }
  return false;
}

/** A key match alone never drops a value that cannot hold a secret. */
function canHoldSecret(value: unknown): boolean {
  return (
    value != null && (typeof value === "string" || typeof value === "object")
  );
}

function isCredentialValue(value: string): boolean {
  return CREDENTIAL_VALUE.test(value.trim());
}

function scrubValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return isCredentialValue(value) ? undefined : value;
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (isSecretKey(key) && canHoldSecret(nested)) continue;
      const scrubbed = scrubValue(nested);
      if (scrubbed === undefined) continue;
      out[key] = scrubbed;
    }
    return out;
  }
  return value;
}

/**
 * Drop secret-bearing keys and whole-value credentials. Null stays null;
 * prose and non-string values survive.
 */
export function scrubPayload(payload: unknown): unknown {
  if (payload == null) return payload;
  const scrubbed = scrubValue(payload);
  return scrubbed === undefined ? null : scrubbed;
}

function scrubbedInput(input: EvidenceAppendInput): EvidenceAppendInput {
  return { ...input, payload: scrubPayload(input.payload) };
}

/** Statement form so callers can `db.batch` this insert with another write. */
export function appendStmt(
  db: Db,
  input: EvidenceAppendInput
): D1PreparedStatement {
  return evidenceRepo.appendEventStmt(db, scrubbedInput(input));
}

export async function append(
  db: Db,
  input: EvidenceAppendInput
): Promise<EvidenceEvent> {
  return evidenceRepo.appendEvent(db, scrubbedInput(input));
}
