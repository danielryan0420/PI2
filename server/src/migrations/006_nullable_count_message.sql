-- Allow messages not linked to a specific count (general session Q&A)
PRAGMA foreign_keys = OFF;

CREATE TABLE messages_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id   INTEGER REFERENCES counts(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id),
    sender     TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('counter','office')),
    body       TEXT NOT NULL,
    sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO messages_new SELECT * FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

PRAGMA foreign_keys = ON;
