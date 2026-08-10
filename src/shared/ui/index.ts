/**
 * PML shared UI primitives — the trust vocabulary.
 *
 * Leaf presentational components only: no data fetching, no D1, no pipeline
 * imports (architecture #Architectural-Boundaries). Surfaces import from here.
 *
 * The CSS these classes resolve against lives in tokens.css + pml.css, imported
 * once from src/styles.css.
 */

export { EmptyState } from "./EmptyState";
export { LastUpdated } from "./LastUpdated";
export { SectionBand } from "./SectionBand";
export { SiteFooter } from "./SiteFooter";
export { TopBar, type TopBarLink } from "./TopBar";
export { TrustBar } from "./TrustBar";
export { NOT_LIVE_LABEL, NotLiveDraftBanner } from "./NotLiveDraftBanner";
export { OriginFlag, type RunOrigin } from "./OriginFlag";
export { POSTURE_LABELS, PostureSwatch, type Posture } from "./PostureSwatch";
export { ProvenanceLabel, type ProvenanceKind } from "./ProvenanceLabel";
export { RunStatusChip, type RunStatus } from "./RunStatusChip";
export { StatusBadge, type OperationalStatus } from "./StatusBadge";
export { UpdatedBadge } from "./UpdatedBadge";
export { WarnChip } from "./WarnChip";
