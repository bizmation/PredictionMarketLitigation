import { surfaceHref } from "../../shared/lib/surface";
import {
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
 * NOT PROTECTED YET. Cloudflare Access lands in Story 1.4. Until then this
 * route is reachable by anyone who knows the path, and the chrome says so out
 * loud — an unprotected surface that looks protected is worse than one that
 * admits it. There is nothing sensitive to leak yet: every band below is an
 * empty placeholder, and no mutating API exists.
 */

type AdminShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

export function AdminShell({ dev = false }: AdminShellProps) {
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
      <TopBar
        brand={
          <>
            PML <span className="sub">/ admin</span>
          </>
        }
        links={links}
      />

      <TrustBar
        warn={<WarnChip>Not protected — Access lands in Story 1.4</WarnChip>}
        message="Gate: human-in-the-loop · autonomous mode off"
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
