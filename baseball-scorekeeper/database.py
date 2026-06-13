import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

DB_PATH = Path(__file__).parent / "baseball.db"

MIGRATION_FILES = [
    ("001_core.sql", """
-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    short_name      TEXT,
    primary_color   TEXT,
    secondary_color TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Players
CREATE TABLE IF NOT EXISTS players (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id          INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    first_name       TEXT NOT NULL,
    last_name        TEXT NOT NULL,
    jersey_number    TEXT,
    primary_position TEXT,
    bats             TEXT CHECK(bats IN ('L','R','S')),
    throws           TEXT CHECK(throws IN ('L','R')),
    active           INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

-- Users (scorekeepers / admins)
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('admin','scorekeeper')) DEFAULT 'scorekeeper',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Games
CREATE TABLE IF NOT EXISTS games (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    home_team_id      INTEGER NOT NULL REFERENCES teams(id),
    away_team_id      INTEGER NOT NULL REFERENCES teams(id),
    scheduled_at      TEXT,
    venue             TEXT,
    status            TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK(status IN ('scheduled','in_progress','completed')),
    innings_scheduled INTEGER NOT NULL DEFAULT 9,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- Lineups: batting order + starting fielding position per team per game
CREATE TABLE IF NOT EXISTS lineups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id       INTEGER NOT NULL REFERENCES teams(id),
    player_id     INTEGER NOT NULL REFERENCES players(id),
    batting_order INTEGER NOT NULL,
    position      TEXT NOT NULL,
    is_starter    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_lineups_game ON lineups(game_id);

-- Mutable "current state" - one row per game, updated on every play
CREATE TABLE IF NOT EXISTS game_state (
    game_id            INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    inning             INTEGER NOT NULL DEFAULT 1,
    half               TEXT NOT NULL DEFAULT 'top' CHECK(half IN ('top','bottom')),
    outs               INTEGER NOT NULL DEFAULT 0,
    balls              INTEGER NOT NULL DEFAULT 0,
    strikes            INTEGER NOT NULL DEFAULT 0,
    home_score         INTEGER NOT NULL DEFAULT 0,
    away_score         INTEGER NOT NULL DEFAULT 0,
    runner_1b          INTEGER REFERENCES players(id),
    runner_2b          INTEGER REFERENCES players(id),
    runner_3b          INTEGER REFERENCES players(id),
    home_batting_index INTEGER NOT NULL DEFAULT 0,
    away_batting_index INTEGER NOT NULL DEFAULT 0,
    current_pitcher_home_id INTEGER REFERENCES players(id),
    current_pitcher_away_id INTEGER REFERENCES players(id),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Immutable event log: every recorded at-bat result (source of truth)
CREATE TABLE IF NOT EXISTS plays (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    sequence        INTEGER NOT NULL,
    inning          INTEGER NOT NULL,
    half            TEXT NOT NULL CHECK(half IN ('top','bottom')),
    batting_team_id INTEGER NOT NULL REFERENCES teams(id),
    batter_id       INTEGER REFERENCES players(id),
    pitcher_id      INTEGER REFERENCES players(id),
    at_bat_result   TEXT NOT NULL CHECK(at_bat_result IN (
        'single','double','triple','home_run','walk','hit_by_pitch',
        'strikeout','groundout','flyout','lineout','popout',
        'error','fielders_choice','sac_fly','sac_bunt','double_play'
    )),
    runs_scored      INTEGER NOT NULL DEFAULT 0,
    rbi              INTEGER NOT NULL DEFAULT 0,
    outs_recorded    INTEGER NOT NULL DEFAULT 0,
    base_state_before TEXT,
    base_state_after  TEXT,
    description       TEXT,
    is_undone         INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game_id, sequence);
CREATE INDEX IF NOT EXISTS idx_plays_batter ON plays(batter_id);
CREATE INDEX IF NOT EXISTS idx_plays_pitcher ON plays(pitcher_id);

-- Line score: runs per inning per team (denormalized for scoreboard grid)
CREATE TABLE IF NOT EXISTS line_score (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    inning  INTEGER NOT NULL,
    runs    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, team_id, inning)
);
"""),
]


class Database:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None  # Autocommit mode for explicit transaction control
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA cache_size = -64000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        with self.get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS _migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            conn.commit()

            applied = set()
            cursor = conn.execute("SELECT filename FROM _migrations")
            for row in cursor:
                applied.add(row[0])

            for filename, sql in MIGRATION_FILES:
                if filename not in applied:
                    conn.executescript(sql)
                    conn.execute("INSERT INTO _migrations (filename) VALUES (?)", (filename,))
                    conn.commit()

    def execute(self, query: str, params: tuple = ()) -> None:
        with self.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(query, params)
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise

    def insert(self, query: str, params: tuple = ()) -> int:
        with self.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.execute(query, params)
                lastid = cursor.lastrowid
                conn.execute("COMMIT")
                return lastid
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise

    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            return dict(row) if row else None

    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]


db = Database()
