/**
 * Public API error envelope — matches architecture #API-Response-Formats and
 * the shape already used by `requireOperator` in adminGuard.ts.
 *
 * `{ code, message, details? }` — never stacks, never secrets.
 */

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

export function notFound(message = "Resource not found."): ApiError {
  return new ApiError(404, "not_found", message);
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "bad_request", message, details);
}

export function methodNotAllowed(allow: string): ApiError {
  return new ApiError(405, "method_not_allowed", "Method not allowed.", {
    allow
  });
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, "conflict", message, details);
}

export function internalError(): ApiError {
  return new ApiError(500, "internal_error", "Unexpected server error.");
}
