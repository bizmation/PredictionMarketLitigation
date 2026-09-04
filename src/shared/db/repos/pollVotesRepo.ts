import { PollVoteSchema, type PollVote } from "../../schemas/poll";
import type { Db } from "../client";

/**
 * Story 2.9 — `poll_votes` repo. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `voter_token` never leaves the repo
 * on the wire; it is the HttpOnly cookie's identity.
 */

type VoteRow = {
  id: string;
  cert: string;
  term: string | null;
};

type TallyRow = {
  total: number;
  cert_yes: number;
  cert_no: number;
  term_ot26: number;
  term_ot27: number;
  term_ot28: number;
  term_later: number;
};

export type PollTally = {
  total: number;
  cert: { yes: number; no: number };
  terms: { ot26: number; ot27: number; ot28: number; later: number };
};

function mapVote(row: VoteRow): PollVote {
  return PollVoteSchema.parse({
    id: row.id,
    cert: row.cert,
    term: row.term
  });
}

export async function insertVote(
  db: Db,
  input: {
    id: string;
    voterToken: string;
    cert: string;
    term: string | null;
    now: string;
  }
): Promise<PollVote> {
  await db
    .prepare(
      `INSERT INTO poll_votes (id, voter_token, cert, term, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.voterToken,
      input.cert,
      input.term,
      input.now,
      input.now
    )
    .run();
  return PollVoteSchema.parse({
    id: input.id,
    cert: input.cert,
    term: input.term
  });
}

export async function getByToken(
  db: Db,
  token: string
): Promise<PollVote | null> {
  const row = await db
    .prepare(`SELECT id, cert, term FROM poll_votes WHERE voter_token = ?`)
    .bind(token)
    .first<VoteRow>();
  return row ? mapVote(row) : null;
}

/**
 * First-write-wins for the term: only fills in a null, never overwrites.
 * Returns whether THIS call's UPDATE stored the term — a concurrent pick can
 * win the `term IS NULL` race first, and the loser must not report success
 * with a term it did not store (review 2-9).
 */
export async function setTermIfNull(
  db: Db,
  token: string,
  term: string,
  now: string
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE poll_votes SET term = ?, updated_at = ?
        WHERE voter_token = ? AND term IS NULL`
    )
    .bind(term, now, token)
    .run();
  return res.meta.changes > 0;
}

export async function tally(db: Db): Promise<PollTally> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN cert = 'yes' THEN 1 ELSE 0 END), 0) AS cert_yes,
              COALESCE(SUM(CASE WHEN cert = 'no' THEN 1 ELSE 0 END), 0) AS cert_no,
              COALESCE(SUM(CASE WHEN term = 'ot26' THEN 1 ELSE 0 END), 0) AS term_ot26,
              COALESCE(SUM(CASE WHEN term = 'ot27' THEN 1 ELSE 0 END), 0) AS term_ot27,
              COALESCE(SUM(CASE WHEN term = 'ot28' THEN 1 ELSE 0 END), 0) AS term_ot28,
              COALESCE(SUM(CASE WHEN term = 'later' THEN 1 ELSE 0 END), 0) AS term_later
         FROM poll_votes`
    )
    .first<TallyRow>();
  if (!row) {
    return {
      total: 0,
      cert: { yes: 0, no: 0 },
      terms: { ot26: 0, ot27: 0, ot28: 0, later: 0 }
    };
  }
  return {
    total: row.total,
    cert: { yes: row.cert_yes, no: row.cert_no },
    terms: {
      ot26: row.term_ot26,
      ot27: row.term_ot27,
      ot28: row.term_ot28,
      later: row.term_later
    }
  };
}
