/**
 * Story 3.19 — the one home for every deadline in the system.
 *
 * Client: `fetchWithTimeout` wraps the global `fetch` so a hung request
 * rejects with a `TimeoutError` (a `DOMException`, name `"TimeoutError"`)
 * after `ms`. The caller's own `signal` (the per-effect unmount controller
 * every hook already owns) is combined with the deadline via
 * `AbortSignal.any`, so unmount still aborts as an `AbortError` and the two
 * are distinguishable by `name`. Hooks swallow `AbortError` and route
 * `TimeoutError` to their designed error/empty state.
 *
 * The deadline is a plain `setTimeout`, NOT `AbortSignal.timeout(ms)`:
 * that built-in schedules on the runtime's internal timer queue, which
 * `vi.useFakeTimers()` does not drive in either jsdom 30 or workerd (probed
 * during 3.19 — the signal never aborted after `advanceTimersByTimeAsync`).
 * A `setTimeout` deadline is observable under fake timers and behaves the
 * same in production. The wrapper also races the timer against the fetch
 * promise itself, so a `fetch` implementation (or test stub) that ignores
 * the signal still rejects on time.
 *
 * Server: `withDeadline` races any promise against a timer; the timer is
 * always cleared in `finally` so a settled call never leaves a dangling
 * handle. Callers map the rejection to their own typed outcome
 * (`provider_error`, `source.skipped { reason: "timeout" }`).
 *
 * No retries, no backoff, no per-site overrides — the values are constants
 * here and nowhere else.
 */

/** Public/ops GETs, apex hooks, and best-effort admin GETs. */
export const CLIENT_GET_TIMEOUT_MS = 15_000;
/** Admin mutations: run trigger, decisions, mode, steering. */
export const ADMIN_POST_TIMEOUT_MS = 30_000;
/** One `SourceCheck` call inside `runConnector`. */
export const CONNECTOR_TIMEOUT_MS = 60_000;
/**
 * One upstream HTTP request made by a live connector (story 3.21). Short
 * enough that a connector polling several dockets in series still finishes
 * inside `CONNECTOR_TIMEOUT_MS`; a hung request surfaces as the connector's
 * own typed skip rather than the whole-source deadline.
 */
export const SOURCE_FETCH_TIMEOUT_MS = 12_000;
/** One `provider.complete` call inside `gateway.complete`. */
export const PROVIDER_TIMEOUT_MS = 60_000;
/**
 * The steering POST only: a revise turn runs drafter + reviewer, each under
 * `PROVIDER_TIMEOUT_MS`, so the client must outlast two provider deadlines
 * (plus persistence slack) or a slow-but-successful turn reads as a timeout.
 */
export const STEERING_POST_TIMEOUT_MS = 2 * PROVIDER_TIMEOUT_MS + 10_000;

export class DeadlineError extends Error {
  readonly label: string;
  readonly ms: number;

  constructor(label: string, ms: number) {
    super(`${label} did not complete within ${ms} ms`);
    this.name = "DeadlineError";
    this.label = label;
    this.ms = ms;
  }
}

/** True for the browser-style timeout rejection `fetchWithTimeout` raises. */
export function isTimeoutError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "TimeoutError"
  );
}

/** True for the unmount/abort rejection every hook already swallows. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

function timeoutReason(ms: number): DOMException {
  return new DOMException(`Request timed out after ${ms} ms`, "TimeoutError");
}

/**
 * Combine the internal deadline controller with the caller's signal.
 * `AbortSignal.any` where available (TS 6 lib.dom, Node 24, jsdom 30); on
 * older browsers (Safari < 17.4, Chrome < 116) forward the caller's abort
 * onto the deadline controller instead, honouring an already-aborted signal.
 */
function combineSignals(
  deadline: AbortController,
  callerSignal: AbortSignal | undefined
): AbortSignal {
  if (!callerSignal) return deadline.signal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([deadline.signal, callerSignal]);
  }
  if (callerSignal.aborted) {
    deadline.abort(callerSignal.reason);
  } else {
    callerSignal.addEventListener(
      "abort",
      () => deadline.abort(callerSignal.reason),
      { once: true }
    );
  }
  return deadline.signal;
}

/**
 * `fetch` with a hard deadline. Rejects with a `TimeoutError` after `ms`;
 * an abort from `init.signal` still surfaces as that signal's own reason
 * (an `AbortError` for the hooks' unmount controllers).
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number
): Promise<Response> {
  const deadline = new AbortController();
  const callerSignal = init?.signal ?? undefined;
  const signal = combineSignals(deadline, callerSignal);

  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      const reason = timeoutReason(ms);
      deadline.abort(reason);
      reject(reason);
    }, ms);
    let request: Promise<Response>;
    try {
      request = fetch(input, { ...init, signal });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    request.then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Race `promise` against a deadline. Rejects with `DeadlineError` naming
 * `label` when the timer wins; the timer is cleared either way.
 */
export async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Story 3.20 — like `withDeadline`, but owns an `AbortController` whose
 * signal is handed to `factory`. When the timer wins the controller is
 * aborted and the race still rejects with `DeadlineError` (not the abort
 * reason), so gateway callers keep mapping timeouts to `provider_error`.
 */
export async function withAbortableDeadline<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new DeadlineError(label, ms));
      }, ms);
      factory(controller.signal).then(
        (value) => {
          if (timer !== undefined) clearTimeout(timer);
          timer = undefined;
          resolve(value);
        },
        (err: unknown) => {
          // Abort-induced rejection is noise — the timer already (or will)
          // reject with DeadlineError.
          if (controller.signal.aborted) return;
          if (timer !== undefined) clearTimeout(timer);
          timer = undefined;
          reject(err);
        }
      );
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
