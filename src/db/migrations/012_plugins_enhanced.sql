ALTER TABLE plugins ADD COLUMN dependencies_json TEXT;
ALTER TABLE plugins ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'untrusted';
ALTER TABLE plugins ADD COLUMN error_message TEXT;
ALTER TABLE plugins ADD COLUMN load_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN config_schema_json TEXT;
