import type { EntityListItem } from "../../../shared/schemas/entity";
import {
  entityMetrics,
  footprintBarSegments,
  groupFootprint
} from "./entityView";

type EntityTabsProps = {
  items: readonly EntityListItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

export function EntityTabs({ items, selectedSlug, onSelect }: EntityTabsProps) {
  return (
    <div className="etabs" role="tablist" aria-label="Tracked platforms">
      {items.map((item) => {
        const metrics = entityMetrics(item);
        const grouped = groupFootprint(item);
        const segments = footprintBarSegments(grouped);
        const selected = selectedSlug === item.slug;
        return (
          <button
            key={item.slug}
            type="button"
            className="etab"
            role="tab"
            aria-selected={selected}
            id={`entity-tab-${item.slug}`}
            onClick={() => onSelect(item.slug)}
          >
            <span className="en">{item.name}</span>
            {item.role ? <span className="et">{item.role}</span> : null}
            <div className="estats">
              <div>
                <b>{metrics.total}</b>
                <span>Matters</span>
              </div>
              <div>
                <b>{metrics.plaintiff}</b>
                <span>Plaintiff</span>
              </div>
              <div>
                <b>{metrics.defendant}</b>
                <span>Defendant</span>
              </div>
              <div>
                <b>{metrics.appellate}</b>
                <span>On appeal</span>
              </div>
            </div>
            {item.footprint.length > 0 ? (
              <div className="bar">
                <div className="barcap">
                  Footprint · {grouped.go.length} go ·{" "}
                  {grouped.restricted.length} restricted ·{" "}
                  {grouped.banned.length} banned
                </div>
                {segments.length > 0 ? (
                  <span className="ec">
                    {segments.map((segment) => (
                      <span
                        key={segment.status}
                        className={`sw ${segment.status}`}
                        style={{ width: `${segment.count * 9}px`, border: 0 }}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
