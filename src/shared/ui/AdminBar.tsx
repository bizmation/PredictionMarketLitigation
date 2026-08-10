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
   * Optional because the shell renders client-side with no server data until
   * story 1.5 wires a real Access session — and a name shown while unverified
   * would be a claim the app cannot back. Absent means absent.
   */
  operator?: { displayName: string };
  /** Status note, e.g. that edge protection is still pending. */
  note?: ReactNode;
};

export function AdminBar({ operator, note }: AdminBarProps) {
  return (
    <div className="adminbar">
      <div className="wrap">
        <strong>Private · operator only</strong>
        <span>
          Actions taken here are published on ops. within seconds, including
          rejections.
        </span>
        {note}
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
