-- Add origin tracking and full content storage to procedural memory skills
-- origin: 'human' for hand-authored skills, 'llm' for agent-extracted patterns
-- content: full markdown body for human-authored skills (like SKILL.md files)

ALTER TABLE procedural_memory ADD COLUMN origin TEXT NOT NULL DEFAULT 'llm';
ALTER TABLE procedural_memory ADD COLUMN content TEXT;
