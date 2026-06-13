import json
from database import db


class GameService:
    @staticmethod
    def list_games(status=None):
        if status:
            return db.fetch_all("""
                SELECT g.*, ht.name AS home_team_name, ht.short_name AS home_team_short,
                       at.name AS away_team_name, at.short_name AS away_team_short
                FROM games g
                JOIN teams ht ON ht.id = g.home_team_id
                JOIN teams at ON at.id = g.away_team_id
                WHERE g.status = ?
                ORDER BY g.scheduled_at DESC, g.id DESC
            """, (status,))
        return db.fetch_all("""
            SELECT g.*, ht.name AS home_team_name, ht.short_name AS home_team_short,
                   at.name AS away_team_name, at.short_name AS away_team_short
            FROM games g
            JOIN teams ht ON ht.id = g.home_team_id
            JOIN teams at ON at.id = g.away_team_id
            ORDER BY g.scheduled_at DESC, g.id DESC
        """)

    @staticmethod
    def get_game(game_id):
        return db.fetch_one("""
            SELECT g.*, ht.name AS home_team_name, ht.short_name AS home_team_short,
                   ht.primary_color AS home_primary_color, ht.secondary_color AS home_secondary_color,
                   at.name AS away_team_name, at.short_name AS away_team_short,
                   at.primary_color AS away_primary_color, at.secondary_color AS away_secondary_color
            FROM games g
            JOIN teams ht ON ht.id = g.home_team_id
            JOIN teams at ON at.id = g.away_team_id
            WHERE g.id = ?
        """, (game_id,))

    @staticmethod
    def create_game(home_team_id, away_team_id, scheduled_at=None, venue=None, innings_scheduled=9, notes=None):
        if home_team_id == away_team_id:
            raise ValueError("Home and away teams must be different")
        game_id = db.insert(
            """INSERT INTO games (home_team_id, away_team_id, scheduled_at, venue, innings_scheduled, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (home_team_id, away_team_id, scheduled_at, venue, innings_scheduled, notes)
        )
        return GameService.get_game(game_id)

    @staticmethod
    def get_lineups(game_id):
        return db.fetch_all("""
            SELECT l.*, p.first_name, p.last_name, p.jersey_number
            FROM lineups l
            JOIN players p ON p.id = l.player_id
            WHERE l.game_id = ?
            ORDER BY l.team_id, l.batting_order
        """, (game_id,))

    @staticmethod
    def set_lineup(game_id, team_id, entries):
        """entries: list of {player_id, batting_order, position}. Replaces existing lineup for this team/game."""
        game = GameService.get_game(game_id)
        if not game:
            raise ValueError("Game not found")
        if team_id not in (game['home_team_id'], game['away_team_id']):
            raise ValueError("Team is not part of this game")
        if not entries:
            raise ValueError("Lineup cannot be empty")

        with db.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("DELETE FROM lineups WHERE game_id = ? AND team_id = ?", (game_id, team_id))
                for e in entries:
                    conn.execute(
                        """INSERT INTO lineups (game_id, team_id, player_id, batting_order, position, is_starter)
                           VALUES (?, ?, ?, ?, ?, 1)""",
                        (game_id, team_id, e['player_id'], e['batting_order'], e['position'])
                    )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise

        return GameService.get_lineups(game_id)

    @staticmethod
    def start_game(game_id):
        game = GameService.get_game(game_id)
        if not game:
            raise ValueError("Game not found")
        if game['status'] != 'scheduled':
            raise ValueError("Game has already been started")

        lineups = GameService.get_lineups(game_id)
        home_lineup = [l for l in lineups if l['team_id'] == game['home_team_id']]
        away_lineup = [l for l in lineups if l['team_id'] == game['away_team_id']]
        if not home_lineup or not away_lineup:
            raise ValueError("Both teams must have a lineup set before starting the game")

        home_pitcher = next((l['player_id'] for l in home_lineup if l['position'] == 'P'), None)
        away_pitcher = next((l['player_id'] for l in away_lineup if l['position'] == 'P'), None)

        with db.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("UPDATE games SET status = 'in_progress' WHERE id = ?", (game_id,))
                conn.execute("""
                    INSERT OR REPLACE INTO game_state
                        (game_id, inning, half, outs, balls, strikes, home_score, away_score,
                         runner_1b, runner_2b, runner_3b, home_batting_index, away_batting_index,
                         current_pitcher_home_id, current_pitcher_away_id, updated_at)
                    VALUES (?, 1, 'top', 0, 0, 0, 0, 0, NULL, NULL, NULL, 0, 0, ?, ?, datetime('now'))
                """, (game_id, home_pitcher, away_pitcher))
                for inning in range(1, game['innings_scheduled'] + 1):
                    conn.execute(
                        "INSERT OR IGNORE INTO line_score (game_id, team_id, inning, runs) VALUES (?, ?, ?, 0)",
                        (game_id, game['home_team_id'], inning)
                    )
                    conn.execute(
                        "INSERT OR IGNORE INTO line_score (game_id, team_id, inning, runs) VALUES (?, ?, ?, 0)",
                        (game_id, game['away_team_id'], inning)
                    )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise

        return GameService.get_game(game_id)

    @staticmethod
    def end_game(game_id):
        game = GameService.get_game(game_id)
        if not game:
            raise ValueError("Game not found")
        db.execute(
            "UPDATE games SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
            (game_id,)
        )
        return GameService.get_game(game_id)

    @staticmethod
    def get_line_score(game_id):
        rows = db.fetch_all(
            "SELECT team_id, inning, runs FROM line_score WHERE game_id = ? ORDER BY inning",
            (game_id,)
        )
        result = {}
        for r in rows:
            result.setdefault(str(r['team_id']), {})[str(r['inning'])] = r['runs']
        return result
