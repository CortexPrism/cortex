-- Migration 037: Add metadata column to graph_entities
-- graph.ts already references metadata on graph_entities at runtime,
-- but the initial 002_memory.sql schema never included this column.

ALTER TABLE graph_entities ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
