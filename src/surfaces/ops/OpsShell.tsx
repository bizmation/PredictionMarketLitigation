import { useEffect, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import { nextRunAtUtc } from "../../shared/lib/schedule";
import { surfaceHref } from "../../shared/lib/surface";
import type { DraftRecord, RunLogItem } from "../../shared/schemas/run";
import { RUN_SCHEDULE_TIMEZONE } from "../../shared/schemas/vocabulary";
import {
  EmptyState,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";
import { PendingDrafts } from "./PendingDrafts";
import { RunLog } from "./RunLog";

/**
 * ops. — the public governance record. No login, ever.
 *
 * This surface is the trust thesis made inspectable: every run the pipeline
 * takes, every draft awaiting approval, every approval and rejection, the
 * nine-layer explainer, and the build journal. It is the canonical home for
 * the explainer and the journal — apex links here and never hosts them (AC6).
 *
 * The trust bar leads with the inverse of apex's: nothing here is live tracker
 * content. A reader who lands on a pending draft must not mistake a proposal
 * for a finding.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

type OpsShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
  /** Injected run-log rows for tests. Omit in production — RunLog fetches. */
  items?: RunLogItem[];
  /** Injected drafts for tests. Omit in production — PendingDrafts fetches. */
  drafts?: DraftRecord[];
};

type Schedule = {
  timezone: string;
  nextRunAt: string;
};

function isSchedule(value: unknown): value is Schedule {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.timezone === RUN_SCHEDULE_TIMEZONE &&
    typeof row.nextRunAt === "string" &&
    row.nextRunAt.length > 0
  );
}

function useSchedule(): Schedule {
  const [schedule, setSchedule] = useState<Schedule>({
    timezone: RUN_SCHEDULE_TIMEZONE,
    nextRunAt: nextRunAtUtc()
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/schedule", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (isSchedule(body)) setSchedule(body);
      })
      .catch(() => {
        // Keep the local nextRunAtUtc() computation. Schedule is deterministic.
      });

    return () => controller.abort();
  }, []);

  return schedule;
}

export function OpsShell({ dev = false, items, drafts }: OpsShellProps) {
  const apexHref = surfaceHref("apex", { dev });
  const schedule = useSchedule();

  const links: TopBarLink[] = [
    { href: "#runs", label: "Run log" },
    { href: "#drafts", label: "Pending drafts" },
    { href: "#mode", label: "Mode" },
    { href: "#layers", label: "Nine layers" },
    { href: "#journal", label: "Journal" },
    { href: apexHref, label: "Tracker", external: true },
    { href: REPO_URL, label: "Repo", external: true }
  ];

  return (
    <div>
      <TopBar
        brand={
          <>
            ops.<em>PredictionMarketLitigation</em>
          </>
        }
        links={links}
      />

      <TrustBar
        warn={<WarnChip>Nothing here is live tracker content</WarnChip>}
        message="Runs and drafts are AI-produced and gate-controlled. Corrections welcome."
        meta={`${schedule.timezone} · Next run ${formatEtDateTime(schedule.nextRunAt)}`}
        provenance={
          // Handoff PML Ops.html:115 — a bare mode indicator, not an
          // approval claim, so this deliberately bypasses ProvenanceLabel's
          // fixed "Human-approved"/"Agent-approved" vocabulary.
          <span className="prov">
            <span className="dot" aria-hidden="true" />
            Gate: HITL
          </span>
        }
      />

      <main>
        <SectionBand
          id="runs"
          kicker="01"
          title="Run log"
          why="Every run the pipeline has taken — including the ones that changed nothing."
        >
          <RunLog dev={dev} items={items} />
        </SectionBand>

        <SectionBand
          id="drafts"
          kicker="02"
          title="Pending drafts"
          why="Read the full text of anything awaiting approval, before it is live."
        >
          <PendingDrafts dev={dev} drafts={drafts} />
        </SectionBand>

        <SectionBand
          id="mode"
          kicker="03"
          title="Approval mode"
          why="Whether a human is approving each change right now, and the audit trail of that setting."
        >
          <EmptyState
            title="Mode transparency not yet wired"
            hint="The default is, and will remain, human-in-the-loop. — Story 3.13"
          >
            This band will show whether autonomous mode is enabled, the current
            auto-approve threshold, and every mode change with its timestamp.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="layers"
          kicker="04"
          title="Nine layers of governance"
          why="The framework this system is built to demonstrate, and where PML actually sits against it."
        >
          <EmptyState
            title="Explainer not yet built"
            hint="Shipped spine and phase-in will be labelled separately — no overclaiming. — Story 4.1"
          >
            Gateway · Guardrails · Action policy · Orchestration · Identity and
            scoped context · Observability · Evals · Lineage and provenance ·
            GRC.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="journal"
          kicker="05"
          title="Build journal"
          why="First-person posts on what was built, what broke, and what that cost."
        >
          <EmptyState
            title="No posts yet"
            hint="Copies published elsewhere are not the source of truth; this is. — Story 4.3"
          >
            Milestone-triggered posts, navigable by layer and by fault line,
            each able to attach the run evidence it describes.
          </EmptyState>
        </SectionBand>
      </main>

      <SiteFooter
        label="ops.PredictionMarketLitigation"
        links={[
          { href: apexHref, label: "Tracker", external: true },
          { href: REPO_URL, label: "Repo", external: true }
        ]}
        note="The litigation is the subject; the governance is the message."
      />
    </div>
  );
}
