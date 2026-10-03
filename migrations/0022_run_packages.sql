-- Actual consumed inputs are immutable even when version zero's compiled seed changes.
CREATE TABLE run_source_snapshots (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES runs(id),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 0),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json) AND json_type(sources_json) = 'array')
);
CREATE TRIGGER run_source_snapshots_immutable BEFORE UPDATE ON run_source_snapshots
BEGIN SELECT RAISE(ABORT, 'run source snapshot is immutable'); END;

-- An observation is journaled before any Draft writes. Completion follows every
-- intended Draft and receipt; replay drains this journal without refetch/dedup loss.
CREATE TABLE run_source_packages (
  run_id TEXT NOT NULL REFERENCES runs(id),
  source_name TEXT NOT NULL,
  observation_json TEXT NOT NULL CHECK (json_valid(observation_json)),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  PRIMARY KEY (run_id, source_name)
);
CREATE TRIGGER run_source_packages_immutable BEFORE UPDATE ON run_source_packages
WHEN NEW.observation_json != OLD.observation_json OR NEW.run_id != OLD.run_id
  OR NEW.source_name != OLD.source_name OR NEW.completed < OLD.completed
BEGIN SELECT RAISE(ABORT, 'source observation is immutable'); END;
