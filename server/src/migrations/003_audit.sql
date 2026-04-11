-- Audit log: every create, edit, verify, flag event on a count record
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id        INTEGER NOT NULL REFERENCES counts(id),
    editor_username TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    field_name      TEXT,
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_count ON audit_log(count_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
