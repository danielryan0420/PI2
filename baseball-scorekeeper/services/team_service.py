from database import db


class TeamService:
    @staticmethod
    def list_teams():
        return db.fetch_all("SELECT * FROM teams ORDER BY name")

    @staticmethod
    def get_team(team_id):
        return db.fetch_one("SELECT * FROM teams WHERE id = ?", (team_id,))

    @staticmethod
    def create_team(name, short_name=None, primary_color=None, secondary_color=None):
        team_id = db.insert(
            "INSERT INTO teams (name, short_name, primary_color, secondary_color) VALUES (?, ?, ?, ?)",
            (name, short_name, primary_color, secondary_color)
        )
        return TeamService.get_team(team_id)

    @staticmethod
    def update_team(team_id, name=None, short_name=None, primary_color=None, secondary_color=None):
        team = TeamService.get_team(team_id)
        if not team:
            return None
        db.execute(
            "UPDATE teams SET name = ?, short_name = ?, primary_color = ?, secondary_color = ? WHERE id = ?",
            (
                name if name is not None else team['name'],
                short_name if short_name is not None else team['short_name'],
                primary_color if primary_color is not None else team['primary_color'],
                secondary_color if secondary_color is not None else team['secondary_color'],
                team_id
            )
        )
        return TeamService.get_team(team_id)
