-- Message threads for separating Q&A conversations
CREATE TABLE IF NOT EXISTS message_threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    count_id   INTEGER REFERENCES counts(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_by_role TEXT NOT NULL CHECK(created_by_role IN ('counter','office','admin')),
    answered   INTEGER NOT NULL DEFAULT 0,
    answered_by TEXT,
    answered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_threads_session ON message_threads(session_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_count ON message_threads(count_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_answered ON message_threads(answered);

-- Refactor messages table to use threads instead of count_id
ALTER TABLE messages ADD COLUMN thread_id INTEGER REFERENCES message_threads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

-- Notifications for thread updates
CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id  INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK(type IN ('new_question','new_answer','thread_answered')),
    read_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_thread ON notifications(thread_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);
