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

/**
 * Admin — the operator's approval gate. Deliberately lighter than the public
 * surfaces: the public observes outcomes, only the operator acts.
 *
 * PARTIALLY PROTECTED. Story 1.4 put a verified perimeter around
 * `/api/admin/*`: every request there must carry a Cloudflare Access JWT whose
 * signature and audience check out AND whose email matches the configured
 * operator, or it gets a 403.
 *
 * This document is NOT behind Access yet. A path-scoped Access application
 * needs an active zone, and no custom domain is bound until Story 1.5 — so
 * this route still renders for anyone who knows the path. That is tolerable
 * precisely because it leaks nothing: every band below is an empty
 * placeholder and no admin API exists to call. The chrome says exactly this
 * much, because a surface that overstates its own protection is worse than
 * one that admits the gap.
 */

type AdminShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
  /**
   * The authenticated operator, once a real Access session exists (Story 1.5).
   * Until then the shell renders client-side with nothing to verify against,
   * so the session strip honestly reads "Not signed in".
   */
  operator?: { displayName: string };
};

export function AdminShell({ dev = false, operator }: AdminShellProps) {
  const apexHref = surfaceHref("apex", { dev });
  const opsHref = surfaceHref("ops", { dev });

  const links: TopBarLink[] = [
    { href: "#queue", label: "Approval queue" },
    { href: "#mode", label: "Mode controls" },
    { href: opsHref, label: "ops.", external: true },
    { href: apexHref, label: "Tracker", external: true }
  ];

  return (
    <div>
      <AdminBar operator={operator} />

      <TopBar
        brand={
          <>
            PML <span className="sub">/ admin</span>
          </>
        }
        links={links}
      />

      <TrustBar
        warn={<WarnChip>Gate: HITL · autonomous OFF</WarnChip>}
        message="Admin APIs are verified; edge Access binding lands in Story 1.5"
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
