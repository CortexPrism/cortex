-- Migration 036: Add source tracking column to jobs table

ALTER TABLE jobs ADD COLUMN source TEXT;
