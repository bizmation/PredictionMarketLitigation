import { ApiError, type ApiErrorBody } from "./errors";

/**
 * Response helpers for the public REST surface (Story 2.1).
 *
 * Envelopes (architecture #API-Response-Formats):
 *   - single resource → bare JSON
 *   - list → `{ items, nextCursor? }`
 *   - error → `{ code, message, details? }`
 *
 * Public GETs are cacheable; do NOT apply ADMIN_CACHE_HEADERS here.
 */

export const PUBLIC_CACHE_HEADERS = {
  "cache-control": "public, max-age=60",
  "content-type": "application/json; charset=utf-8"
} as const;

export type ListEnvelope<T> = {
  items: T[];
  nextCursor?: string;
};

export function jsonOk<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    status: 200,
    ...init,
    headers: {
      ...PUBLIC_CACHE_HEADERS,
      ...(init?.headers ?? {})
    }
  });
}

export function jsonList<T>(
  items: T[],
  nextCursor?: string,
  init?: ResponseInit
): Response {
  const body: ListEnvelope<T> = { items };
  if (nextCursor !== undefined) body.nextCursor = nextCursor;
  return jsonOk(body, init);
}

export function jsonError(
  error: ApiError | ApiErrorBody,
  init?: ResponseInit
): Response {
  const status = error instanceof ApiError ? error.status : 400;
  const body = error instanceof ApiError ? error.toBody() : error;
  const allow =
    error instanceof ApiError &&
    error.code === "method_not_allowed" &&
    typeof error.details === "object" &&
    error.details !== null &&
    "allow" in error.details
      ? String((error.details as { allow: string }).allow)
      : undefined;

  return Response.json(body, {
    status,
    ...init,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...(allow ? { allow } : {}),
      ...(init?.headers ?? {})
    }
  });
}
