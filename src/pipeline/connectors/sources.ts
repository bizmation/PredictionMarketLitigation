export interface PollSource {
  name: string;
  url: string;
  tier: "tier1" | "tier2";
}

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
