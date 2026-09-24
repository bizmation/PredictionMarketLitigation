/**
 * Surface resolution — which of PML's three shells a URL belongs to.
 *
 * PML is one codebase serving three surfaces:
 *   apex  — the litigation tracker (predictionmarketlitigation.com)
 *   ops.  — the public governance record (ops.predictionmarketlitigation.com)
 *   admin — the operator's approval gate (/admin, Access-gated from Story 1.4)
 *
 * This is deliberately *resolution*, not routing. v1 apex is a single
 * long-scroll page and ops. is a single page of anchored bands plus a
 * hand-rolled `/runs/:runId` Evidence page (Story 3.8), so nothing here
 * needs a router library.
 *
 * No React or imports. Resolution is pure; links default to the browser
 * hostname when available and production when rendered outside a browser.
 */

export type Surface = "apex" | "ops" | "admin";

const APEX_ORIGIN = "https://predictionmarketlitigation.com";
const OPS_ORIGIN = "https://ops.predictionmarketlitigation.com";
const BUILD_HOST = "build.predictionmarketlitigation.com";
const OPS_BUILD_HOST = "ops-build.predictionmarketlitigation.com";
const OPS_BUILD_ORIGIN = `https://${OPS_BUILD_HOST}`;
const ADMIN_PATH = "/admin";

/** `/admin` and `/admin/...`, but never `/administrivia`. */
function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);
}

function isOpsHost(hostname: string): boolean {
  return hostname === OPS_BUILD_HOST || hostname.startsWith("ops.");
}

function asSurface(value: string | null): Surface | null {
  return value === "apex" || value === "ops" || value === "admin"
    ? value
    : null;
}

type ResolveOptions = {
  /**
   * Allow `?surface=` to pick the surface.
   *
   * Custom domains are not bound until Story 1.5, and `ops.localhost` resolves
   * in Chrome but not reliably elsewhere — so local development needs a way to
   * reach all three shells from one origin.
   *
   * Defaults to FALSE: on production this must never be honoured, or anyone
   * could reach admin chrome by pasting a query string. Callers pass
   * `import.meta.env.DEV`.
   */
  allowQueryOverride?: boolean;
};

/**
 * First match wins: real path, then real host, then the dev-only override.
 * Path beats host on purpose — an operator on ops. who navigates to /admin
 * must land on admin chrome, not the public ops. shell.
 */
export function resolveSurface(
  url: URL,
  { allowQueryOverride = false }: ResolveOptions = {}
): Surface {
  if (isAdminPath(url.pathname)) return "admin";
  if (isOpsHost(url.hostname)) return "ops";

  if (allowQueryOverride) {
    const override = asSurface(url.searchParams.get("surface"));
    if (override) return override;
  }

  return "apex";
}

type HrefOptions = {
  /** True in local development. Callers pass `import.meta.env.DEV`. */
  dev?: boolean;
  /** Path within the target surface, e.g. `/runs`. */
  path?: string;
  /** Defaults to the current browser host; explicit input supports pure callers. */
  hostname?: string;
};

/**
 * Link to another surface.
 *
 * Every cross-surface link in the app goes through here, so Story 1.5 changes
 * one function when the real domains are bound rather than editing every shell.
 *
 * Admin is always path-relative — it is a path on whichever host you are
 * already on, never its own origin.
 */
export function surfaceHref(
  target: Surface,
  {
    dev = false,
    path = "",
    hostname = typeof window === "undefined" ? "" : window.location.hostname
  }: HrefOptions = {}
): string {
  const normalizedPath = path && !path.startsWith("/") ? `/${path}` : path;

  if (target === "admin") return `${ADMIN_PATH}${normalizedPath}`;

  if (dev) {
    const base = normalizedPath || "/";
    return `${base}${base.includes("?") ? "&" : "?"}surface=${target}`;
  }

  const opsOrigin =
    hostname === BUILD_HOST || hostname === OPS_BUILD_HOST
      ? OPS_BUILD_ORIGIN
      : OPS_ORIGIN;
  return `${target === "ops" ? opsOrigin : APEX_ORIGIN}${normalizedPath}`;
}
