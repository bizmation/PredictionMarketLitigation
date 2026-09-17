import type { PollSource } from "../../shared/schemas/pipelineConfig";

export type { PollSource };

export const POLL_SOURCES: readonly PollSource[] = [
  {
    name: "CourtListener",
    url: "https://www.courtlistener.com/",
    tier: "tier1"
  },
  {
    name: "CFTC press",
    url: "https://www.cftc.gov/PressRoom/PressReleases",
    tier: "tier1"
  },
  {
    name: "SCOTUS docket",
    url: "https://www.supremecourt.gov/docket/",
    tier: "tier1"
  },
  {
    name: "Legal news leads",
    url: "https://news.bloomberglaw.com/securities-law",
    tier: "tier2"
  }
];

/** Version-0 seed. Used by `pipelineConfigRepo` when no D1 row exists. */
export function loadSeedPollSources(): PollSource[] {
  return POLL_SOURCES.map((source) => ({
    name: source.name,
    url: source.url,
    tier: source.tier
  }));
}
