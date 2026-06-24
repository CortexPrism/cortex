-- Migration 044c: Add user/team scoping columns to memory tables (memory.db)

ALTER TABLE episodic_memory ADD COLUMN user_id TEXT;
ALTER TABLE episodic_memory ADD COLUMN team_id TEXT;

ALTER TABLE semantic_memory ADD COLUMN user_id TEXT;
ALTER TABLE semantic_memory ADD COLUMN team_id TEXT;

ALTER TABLE procedural_memory ADD COLUMN user_id TEXT;
ALTER TABLE procedural_memory ADD COLUMN team_id TEXT;

ALTER TABLE reflection_memory ADD COLUMN user_id TEXT;
ALTER TABLE reflection_memory ADD COLUMN team_id TEXT;

ALTER TABLE graph_entities ADD COLUMN user_id TEXT;
ALTER TABLE graph_entities ADD COLUMN team_id TEXT;

ALTER TABLE shared_context ADD COLUMN user_id TEXT;
ALTER TABLE shared_context ADD COLUMN team_id TEXT;

CREATE INDEX IF NOT EXISTS idx_episodic_user ON episodic_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_episodic_team ON episodic_memory(team_id);
CREATE INDEX IF NOT EXISTS idx_semantic_user ON semantic_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_semantic_team ON semantic_memory(team_id);
CREATE INDEX IF NOT EXISTS idx_procedural_user ON procedural_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_procedural_team ON procedural_memory(team_id);
CREATE INDEX IF NOT EXISTS idx_graph_user ON graph_entities(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_team ON graph_entities(team_id);
