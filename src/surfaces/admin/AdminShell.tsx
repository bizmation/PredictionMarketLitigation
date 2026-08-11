import { surfaceHref } from "../../shared/lib/surface";
import {
  AdminBar,
  EmptyState,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";
import { useAdminSession } from "./useAdminSession";

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
 * The bands below are still empty placeholders and the approval queue is
 * Story 3.10's, so there is not yet anything here worth protecting — but the
 * protection is real now, and the chrome says so rather than continuing to
 * warn about a gap that closed.
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

export function AdminShell({ dev = false, operator }: AdminShellProps) {
  const apexHref = surfaceHref("apex", { dev });
  const opsHref = surfaceHref("ops", { dev });

  // An explicit prop wins; otherwise ask the Worker. Undefined from both means
  // signed out, and the strip says so — a name here is only ever server-backed.
  const session = useAdminSession();
  const resolvedOperator = operator ?? session;

  const links: TopBarLink[] = [
    { href: "#queue", label: "Approval queue" },
    { href: "#mode", label: "Mode controls" },
    { href: opsHref, label: "ops.", external: true },
    { href: apexHref, label: "Tracker", external: true }
  ];

  return (
    <div>
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
        warn={<WarnChip>Autonomous OFF — human-in-the-loop</WarnChip>}
        message="Gate: HITL · this surface and the admin APIs both require a verified operator"
        meta="Queue not yet wired"
        provenance={
          // Handoff PML Admin.html:99 — static placeholder, no data until 3.x.
          <span className="num">Budget today $0.38 of $2.00</span>
        }
      />

      <main>
        <SectionBand
          id="queue"
          kicker="01"
          title="Approval queue"
          why="Approve, edit-then-approve, or reject each pending draft. Every outcome is published."
        >
          <EmptyState
            title="Nothing awaiting approval"
            hint="An empty queue means the pipeline proposed nothing, not that it failed."
          >
            Pending drafts appear here with their full text and proposed
            changes. Editing before approving preserves both versions, so the
            public diff shows exactly what the operator changed.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="mode"
          kicker="02"
          title="Mode controls"
          why="Switching autonomous mode on or off — restricted to the operator, and audited publicly."
        >
          <EmptyState
            title="Controls not yet wired"
            hint="Default is human-in-the-loop and stays that way until deliberately changed."
          >
            Enabling autonomous mode writes an audit event visible on ops., with
            its timestamp and the threshold in force.
          </EmptyState>
        </SectionBand>
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
