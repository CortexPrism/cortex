-- Migration 008: Add embedding blob + decay columns to memory tables

ALTER TABLE semantic_memory ADD COLUMN embedding BLOB;
ALTER TABLE semantic_memory ADD COLUMN embedding_model TEXT;
ALTER TABLE semantic_memory ADD COLUMN half_life_days REAL NOT NULL DEFAULT 30.0;
ALTER TABLE semantic_memory ADD COLUMN decay_score REAL NOT NULL DEFAULT 1.0;

ALTER TABLE episodic_memory ADD COLUMN embedding BLOB;
ALTER TABLE episodic_memory ADD COLUMN embedding_model TEXT;
ALTER TABLE episodic_memory ADD COLUMN half_life_days REAL NOT NULL DEFAULT 14.0;
ALTER TABLE episodic_memory ADD COLUMN decay_score REAL NOT NULL DEFAULT 1.0;
