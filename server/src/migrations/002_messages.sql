-- Counter <-> Office Q&A messages
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id   INTEGER NOT NULL REFERENCES counts(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id),
    sender     TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('counter','office')),
    body       TEXT NOT NULL,
    sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_count ON messages(count_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
