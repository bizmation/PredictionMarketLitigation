import { resolveSurface } from "./shared/lib/surface";
import { DesignSystemGallery } from "./shared/ui/DesignSystemGallery";
import { AdminShell } from "./surfaces/admin/AdminShell";
import { ApexShell } from "./surfaces/apex/ApexShell";
import { OpsShell } from "./surfaces/ops/OpsShell";

/**
 * Root — resolve which surface this URL belongs to, render its shell.
 *
 * Not a router: v1 apex is one long-scroll page and ops. is one page of
 * anchored bands, so there is nothing to route between yet. Story 3.8 brings
 * the first real nested route (/runs/:runId) and can adopt a router then —
 * resolveSurface stays valid either way, because it reads a URL rather than
 * owning navigation.
 *
 * The query-string override is dev-only, and enforced as such inside
 * resolveSurface: on production, ?surface=admin must never reach admin chrome.
 */

const GALLERY_PATH = "/design-system";

export default function App() {
  const dev = import.meta.env.DEV;
  const url = new URL(window.location.href);

  // The design-system reference — the in-app recreation of the handoff's
  // component page (UX-DR24). Development only; never part of a public surface.
  if (
    dev &&
    (url.pathname === GALLERY_PATH ||
      url.pathname.startsWith(`${GALLERY_PATH}/`))
  ) {
    return <DesignSystemGallery />;
  }

  switch (resolveSurface(url, { allowQueryOverride: dev })) {
    case "ops":
      return <OpsShell dev={dev} />;
    case "admin":
      return <AdminShell dev={dev} />;
    default:
      return <ApexShell dev={dev} />;
  }
}
