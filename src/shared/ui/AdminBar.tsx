import type { ReactNode } from "react";

/**
 * Operator strip — the dark band above the admin top bar.
 *
 * Admin-only. Its job is to make two things unmissable before the operator
 * acts: that this surface is private, and that acting here is public. The
 * handoff's copy says so directly (PML Admin.html:78-82) and is reproduced
 * verbatim — this is a warning, not marketing, so it is not ours to reword.
 *
 * Not a TrustBar variant. TrustBar's four slots carry reader-facing
 * disclosure; this carries operator identity on a different ground.
 */

type AdminBarProps = {
  /**
   * The authenticated operator, when known.
   *
   * Optional, and it stays optional now that story 1.5 has wired a real Access
   * session: the shell resolves it asynchronously, so undefined is the normal
   * state for the first paint and the permanent state when signed out. A name
   * rendered here is a claim that the server verified an identity, so absent
   * must keep meaning absent rather than "probably Patrick".
   *
   * Only ever the display name. access.ts types the operator's email as never
   * safe to render, and story 3.13 publishes this same name in mode-change
   * audit entries on the public ops. surface.
   */
  operator?: { displayName: string };
  /** Status note, e.g. that edge protection is still pending. */
  sessionNote?: ReactNode;
};

export function AdminBar({ operator, sessionNote }: AdminBarProps) {
  return (
    <div className="adminbar">
      <div className="wrap">
        <strong>Private · operator only</strong>
        <span>
          Actions taken here are published on ops. within seconds, including
          rejections.
        </span>
        {sessionNote}
        <span className="who">
          {/* 6px status dot — decorative, per the handoff's bare <i>. */}
          <i aria-hidden="true" />
          {operator
            ? `${operator.displayName} — operator identity`
            : "Not signed in"}
        </span>
      </div>
    </div>
  );
}
