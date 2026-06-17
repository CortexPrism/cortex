-- Migration 020: Add updated_at to episodic_memory; register missing relation types

ALTER TABLE episodic_memory ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE episodic_memory SET updated_at = created_at WHERE updated_at = '';

INSERT OR IGNORE INTO graph_relation_types VALUES
  ('related_to',   'Entity A is related to Entity B (general co-occurrence)'),
  ('is_part_of',   'Entity A is a part or sub-component of Entity B'),
  ('is_instance_of', 'Entity A is an instance or example of Entity B'),
  ('contradicts',  'Entity A contradicts or conflicts with Entity B'),
  ('supports',     'Entity A supports or corroborates Entity B'),
  ('causes',       'Entity A causes or leads to Entity B');
