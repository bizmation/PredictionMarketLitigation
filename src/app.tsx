import { lazy, Suspense } from "react";

import { resolveSurface } from "./shared/lib/surface";
import { AdminShell } from "./surfaces/admin/AdminShell";
import { ApexShell } from "./surfaces/apex/ApexShell";
import {
  EvidenceDetail,
  runIdFromOpsPath
} from "./surfaces/ops/EvidenceDetail";
import { OpsShell } from "./surfaces/ops/OpsShell";

// Dynamic import — dev-only and rarely visited, so it should not bloat the
// production bundle every reader downloads just to sit unreachable.
const DesignSystemGallery = lazy(() =>
  import("./shared/ui/DesignSystemGallery").then((m) => ({
    default: m.DesignSystemGallery
  }))
);

/**
 * Root — resolve which surface this URL belongs to, render its shell.
 *
 * Not a router: v1 apex is one long-scroll page and ops. is one page of
 * anchored bands plus a hand-rolled `/runs/:runId` Evidence page (Story 3.8).
 * `resolveSurface` stays valid because it reads a URL rather than owning
 * navigation — do not add react-router or wouter.
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
    return (
      <Suspense fallback={null}>
        <DesignSystemGallery />
      </Suspense>
    );
  }

  switch (resolveSurface(url, { allowQueryOverride: dev })) {
    case "ops": {
      const runId = runIdFromOpsPath(url.pathname);
      if (runId) return <EvidenceDetail runId={runId} dev={dev} />;
      return <OpsShell dev={dev} />;
    }
    case "admin":
      return <AdminShell dev={dev} />;
    default:
      return <ApexShell dev={dev} />;
  }
}
