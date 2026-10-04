import { useEffect, useState } from "react";
import { surfaceHref } from "../../shared/lib/surface";
import {
  AdminBar,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";
import { ApprovalQueue } from "./ApprovalQueue";
import { LoopControls } from "./LoopControls";
import { ModeControls } from "./ModeControls";
import { useAdminSession } from "./useAdminSession";
import { useApprovalMode } from "../useApprovalMode";

/**
 * Admin — the operator's approval gate. Deliberately lighter than the public
 * surfaces: the public observes outcomes, only the operator acts.
 *
 * PROTECTED, as of 2026-08-10 (Story 1.5 Part B). Two independent layers:
 *
 *   1. Cloudflare Access at the edge. The `PML admin` application covers
 *      `/admin`, `/admin/*` and `/api/admin/*` on the apex hostname, so an
 *      unauthenticated request is redirected to a login challenge and never
 *      reaches this document.
 *   2. `requireOperator` in the Worker, on every `/api/admin/*` request. This
 *      is the layer that matters on any hostname the Access application does
 *      NOT name — `ops.`, and historically workers.dev and preview URLs, where
 *      the Access header is forgeable. See src/shared/lib/access.ts.
 *
 * The `#mode` band is the operator's gate toggle (3.13) — `#queue` (3.10)
 * and `#loop` (3.12) sit behind the two layers below, and the chrome
 * says so.
 */

type AdminShellProps = {
  /**
   * The authenticated operator.
   *
   * Optional, and normally omitted: the shell resolves the live session itself
   * via useAdminSession. Passing it explicitly overrides that fetch, which is
   * what the static-render tests do — `renderToStaticMarkup` never runs
   * effects, so without the prop those tests would only ever see the
   * signed-out state.
   */
  operator?: { displayName: string };
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

type AdminView = "queue" | "loop" | "mode";
function viewFromHash(): AdminView {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return hash === "#loop" ? "loop" : hash === "#mode" ? "mode" : "queue";
}

export function AdminShell({ dev = false, operator }: AdminShellProps) {
  const [view, setView] = useState<AdminView>(viewFromHash);
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const apexHref = surfaceHref("apex", { dev });
  const opsHref = surfaceHref("ops", { dev });

  // An explicit prop wins; otherwise ask the Worker. Undefined from both means
  // signed out, and the strip says so — a name here is only ever server-backed.
  const session = useAdminSession();
  const resolvedOperator = operator ?? session;
  const { mode, setMode } = useApprovalMode();
  const yolo = mode.mode === "yolo";

  const links: TopBarLink[] = [
    { href: opsHref, label: "ops.", external: true },
    { href: apexHref, label: "Tracker", external: true }
  ];

  return (
    <div className="workspace-ui admin-workspace">
      <AdminBar operator={resolvedOperator} />

      <TopBar
        brand={
          <>
            PML <span className="sub">/ admin</span>
          </>
        }
        links={links}
      />

      <TrustBar
        // The handoff's warn slot carries the gate state, and now does again.
        //
        // It was displaced from 1.3 until 2026-08-10 by "Not access-controlled
        // — anyone with this URL sees it", because that outranked the gate
        // state while it was true: a surface must never look better protected
        // than it is. Story 1.5 Part B bound the Access application, so that
        // warning became the opposite failure — a surface looking *worse*
        // protected than it is, which erodes the same trust by teaching the
        // operator to discount its own chrome. Retired, not softened.
        warn={
          <WarnChip>
            {yolo
              ? "Autonomous ON — YOLO"
              : "Autonomous OFF — human-in-the-loop"}
          </WarnChip>
        }
        message={
          yolo
            ? "Gate: YOLO · eligible drafts may be approved automatically"
            : "Gate: HITL · drafts require your approval"
        }
        meta=""
      />

      <main>
        <div className="workspace-intro wrap">
          <div>
            <p className="kicker">Operator workspace</p>
            <h1>Review. Decide. Keep control.</h1>
            <p>Review drafts, follow a Run, or adjust automation.</p>
          </div>
        </div>
        <nav className="admin-task-nav wrap" aria-label="Operator tasks">
          {(
            [
              ["queue", "Review drafts", "Approve or reject proposed changes"],
              ["loop", "Manage runs", "Start a Run and inspect evidence"],
              ["mode", "Automation settings", "Control approval rules"]
            ] as const
          ).map(([id, label, description]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                if (window.location.hash !== `#${id}`)
                  window.history.pushState(null, "", `#${id}`);
                setView(id);
              }}
              aria-current={view === id ? "page" : undefined}
            >
              <strong>{label}</strong>
              <span>{description}</span>
            </a>
          ))}
        </nav>
        <div hidden={view !== "queue"}>
          <SectionBand
            id="queue"
            kicker="01"
            title="Approval queue"
            why="Approve, edit-then-approve, or reject each pending draft. Every outcome is published."
          >
            <ApprovalQueue
              threshold={mode.threshold}
              active={view === "queue"}
              dev={dev}
            />
          </SectionBand>
        </div>
        <div hidden={view !== "loop"}>
          <SectionBand
            id="loop"
            kicker="02"
            title="Loop controls"
            why="Start a Run without waiting for noon ET. Re-running a published day requires confirming supersede."
          >
            <LoopControls dev={dev} />
          </SectionBand>
        </div>
        <div hidden={view !== "mode"}>
          <SectionBand
            id="mode"
            kicker="03"
            title="Mode controls"
            why="Switching autonomous mode on or off — restricted to the operator, and audited publicly."
          >
            <ModeControls current={mode} onChange={setMode} opsHref={opsHref} />
          </SectionBand>
        </div>
      </main>

      <SiteFooter
        label="PML / admin"
        links={[
          { href: opsHref, label: "ops.", external: true },
          { href: apexHref, label: "Tracker", external: true }
        ]}
        note="Operator surface — the public observes outcomes on ops."
      />
    </div>
  );
}
