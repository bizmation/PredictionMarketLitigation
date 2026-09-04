import { useState } from "react";

import { EmptyState } from "../../../shared/ui";
import type { EntityListItem } from "../../../shared/schemas/entity";
import { useApexF1 } from "../ApexF1Context";
import {
  selectionForCase,
  selectionForState,
  type ApexSelection
} from "../selection";
import { jumpToBand } from "../useApexSelection";
import { EntityDetail } from "./EntityDetail";
import { EntityTabs } from "./EntityTabs";
import { useEntityLedger, type LedgerStatus } from "./useEntityLedger";

export { jumpToBand };

/** IssueBoard hides until listsReady; the ledger can paint earlier. Do not commit. */
export function commitEntityJump(
  listsReady: boolean,
  next: ApexSelection,
  commit: (selection: ApexSelection) => void
): boolean {
  if (!listsReady) return false;
  commit(next);
  return true;
}

export function selectionFromEntityMatter(
  caseId: string,
  current: ApexSelection
): ApexSelection {
  return selectionForCase(caseId, current);
}

type EntityBoardProps = {
  items?: EntityListItem[];
  status?: LedgerStatus;
  initialSlug?: string | null;
};

export function EntityBoard({
  items: injectedItems,
  status: injectedStatus,
  initialSlug = null
}: EntityBoardProps = {}) {
  const fetched = useEntityLedger();
  const { states, selection, commit, listsReady } = useApexF1();
  const items = injectedItems ?? fetched.items;
  const status = injectedStatus ?? fetched.status;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const selected = items.find((item) => item.slug === selectedSlug) ?? null;
  const pending = status === "idle" || status === "loading";

  function onOpenCase(caseId: string) {
    if (
      !commitEntityJump(
        listsReady,
        selectionFromEntityMatter(caseId, selection),
        commit
      )
    ) {
      return;
    }
    jumpToBand("cases");
  }

  function onOpenState(code: string) {
    if (
      !commitEntityJump(
        listsReady,
        selectionForState(code, states, selection),
        commit
      )
    ) {
      return;
    }
    jumpToBand("states");
  }

  if (status === "error" || (!pending && items.length === 0)) {
    return (
      <EmptyState
        title="Entity list could not be loaded"
        hint="A missing ledger is not an empty docket."
      >
        Retry the page. Platforms stay unpublished until the list arrives.
      </EmptyState>
    );
  }

  return (
    <>
      {pending ? (
        <div className="etabs" role="tablist" aria-label="Tracked platforms">
          <span className="kicker">Loading entity record</span>
          <span className="issuehint">
            The published list has not settled yet. That is a retrieval wait,
            not a finding about the litigation.
          </span>
        </div>
      ) : (
        <EntityTabs
          items={items}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
        />
      )}
      {pending ? null : selected ? (
        <EntityDetail
          item={selected}
          onOpenCase={onOpenCase}
          onOpenState={onOpenState}
        />
      ) : (
        <div className="ent">
          <div>
            <span className="kicker">Nothing selected</span>
            <p className="issuehint">
              The tabs are the published platforms. Selecting one names that
              record; it is not a finding about the others.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
