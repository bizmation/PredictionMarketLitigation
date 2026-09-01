import { surfaceHref } from "../../shared/lib/surface";
import { EmptyState } from "../../shared/ui";

/**
 * Launch-state masthead — TEMPORARY, and it says so on the page.
 *
 * WHY THIS EXISTS. Epic 1 shipped the platform; every content band below is an
 * honest EmptyState naming the story that fills it. That is correct, but nine
 * empty bands with nothing above them read as *abandoned* rather than *early* —
 * and the project's own rule cuts both ways: a surface must never look better
 * protected or further along than it is, but it must not look worse either.
 * A first-time visitor arriving from a link deserves to know what this is and
 * why it is empty, in that order.
 *
 * WHAT IT IS NOT. Not the real masthead. Story 2.2 owns the credibility strip,
 * the H1 + bottom line, the KPI row derived from real counts, and the executive
 * brief. This band is the placeholder that 2.2 DELETES — not a component it
 * extends. Do not grow features here.
 *
 * It also carries the page's only `<h1>`. Every SectionBand title is an `<h2>`
 * and the TopBar brand is a div, so before this the document had no `h1` at
 * all — an outline and SEO gap that mattered the moment the site got linked to.
 *
 * Styled entirely with existing classes and the shared EmptyState primitive,
 * so it ships no CSS or duplicate empty-state markup for Story 2.2 to unpick.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

type LaunchNoteProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

export function LaunchNote({ dev = false }: LaunchNoteProps) {
  const opsHref = surfaceHref("ops", { dev });

  return (
    <section className="band" id="what-this-is">
      <div className="wrap">
        <div className="kicker">00 · Day one</div>

        <h1>
          A public tracker for U.S. prediction-market litigation — built by AI,
          governed by a human, in the open.
        </h1>

        {/* Deliberately asserts no counts, outcomes, or direction of blame.
            Those claims belong to the sourced API, never hardcoded JSX. */}
        {/* `.muted`, not `.why`: pml.css only ever defines `.sec-head .why`
            (as a descendant), so a bare `.why` outside a section header renders
            completely unstyled. `.muted` and `.kicker` are the standalone rules. */}
        <p className="muted">
          Whether regulated prediction markets are lawful in a given U.S. state
          is being litigated in both directions at once: platforms suing state
          regulators on the argument that federal commodities law preempts state
          gambling law, and states bringing their own enforcement actions
          against the platforms. Courts have gone both ways. This site will
          track where that actually stands, state by state, with the primary
          source behind every claim.
        </p>

        <EmptyState
          title="The tracker views are not wired yet — deliberately"
          hint={
            <>
              An untracked state is not a permissive one. Absence of a finding
              is never a finding.
            </>
          }
        >
          The initial, human-curated case-law seed is available through the
          read-only API, but the sections below do not render it until their
          dedicated stories land. They stay labelled rather than filled with
          plausible-looking mock content, because a reader cannot tell a
          convincing mock from a finding. An unwired view is the honest state.
        </EmptyState>

        <p className="muted">
          <b>What is live today:</b> the two public surfaces, the design system,
          an access-gated operator area, and the sanctioned F1 seed behind the
          public API. There is no ongoing write path yet; the curated seed is
          the only publish operation. <b>What comes next:</b> the tracker views,
          then the governed daily pipeline whose every run — including the runs
          that propose nothing — <b>will be</b> published next door on{" "}
          <a href={opsHref} rel="noopener">
            ops.
          </a>
        </p>

        <p className="muted">
          The whole thing is open source and being built in public, one layer at
          a time:{" "}
          <a href={REPO_URL} rel="noopener noreferrer" target="_blank">
            github.com/bizmation/PredictionMarketLitigation
          </a>
          . The litigation is the subject; the governed pipeline underneath it
          is the point, and it is designed to be pointed at other domains.
        </p>
      </div>
    </section>
  );
}
