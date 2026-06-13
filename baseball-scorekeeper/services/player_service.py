from database import db


class PlayerService:
    @staticmethod
    def list_players(team_id, active_only=True):
        if active_only:
            return db.fetch_all(
                "SELECT * FROM players WHERE team_id = ? AND active = 1 ORDER BY jersey_number IS NULL, CAST(jersey_number AS INTEGER), last_name",
                (team_id,)
            )
        return db.fetch_all(
            "SELECT * FROM players WHERE team_id = ? ORDER BY last_name",
            (team_id,)
        )

    @staticmethod
    def get_player(player_id):
        return db.fetch_one("SELECT * FROM players WHERE id = ?", (player_id,))

    @staticmethod
    def create_player(team_id, first_name, last_name, jersey_number=None, primary_position=None, bats=None, throws=None):
        player_id = db.insert(
            """INSERT INTO players (team_id, first_name, last_name, jersey_number, primary_position, bats, throws)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (team_id, first_name, last_name, jersey_number, primary_position, bats, throws)
        )
        return PlayerService.get_player(player_id)

    @staticmethod
    def update_player(player_id, **fields):
        player = PlayerService.get_player(player_id)
        if not player:
            return None
        allowed = ['first_name', 'last_name', 'jersey_number', 'primary_position', 'bats', 'throws', 'active']
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if not updates:
            return player
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        db.execute(f"UPDATE players SET {set_clause} WHERE id = ?", (*updates.values(), player_id))
        return PlayerService.get_player(player_id)

    @staticmethod
    def delete_player(player_id):
        db.execute("UPDATE players SET active = 0 WHERE id = ?", (player_id,))
