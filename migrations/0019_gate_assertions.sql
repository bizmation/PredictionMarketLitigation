-- A false predicate must fail the statement and roll back its D1 batch.
CREATE TABLE gate_assertions (
  assertion TEXT NOT NULL,
  satisfied INTEGER NOT NULL CONSTRAINT gate_assertion_failed CHECK (satisfied = 1)
);
