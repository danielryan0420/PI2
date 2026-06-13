from database import db

HIT_OUTCOMES = ('single', 'double', 'triple', 'home_run')
AT_BAT_OUTCOMES = (
    'single', 'double', 'triple', 'home_run',
    'strikeout', 'groundout', 'flyout', 'lineout', 'popout',
    'error', 'fielders_choice', 'double_play'
)
WALK_OUTCOMES = ('walk', 'hit_by_pitch')


class StatsService:
    @staticmethod
    def player_batting_line(game_id, player_id):
        plays = db.fetch_all(
            "SELECT at_bat_result, runs_scored, rbi FROM plays WHERE game_id = ? AND batter_id = ? AND is_undone = 0",
            (game_id, player_id)
        )
        return StatsService._summarize_batting(plays)

    @staticmethod
    def player_season_batting(player_id):
        plays = db.fetch_all(
            """SELECT pl.at_bat_result, pl.runs_scored, pl.rbi
               FROM plays pl JOIN games g ON g.id = pl.game_id
               WHERE pl.batter_id = ? AND pl.is_undone = 0 AND g.status = 'completed'""",
            (player_id,)
        )
        return StatsService._summarize_batting(plays)

    @staticmethod
    def _summarize_batting(plays):
        ab = h = doubles = triples = hr = bb = k = runs = rbi = sac = 0
        for p in plays:
            outcome = p['at_bat_result']
            runs += p['runs_scored']
            rbi += p['rbi']
            if outcome in AT_BAT_OUTCOMES:
                ab += 1
            if outcome in HIT_OUTCOMES:
                h += 1
                if outcome == 'double':
                    doubles += 1
                elif outcome == 'triple':
                    triples += 1
                elif outcome == 'home_run':
                    hr += 1
            if outcome in WALK_OUTCOMES:
                bb += 1
            if outcome == 'strikeout':
                k += 1
            if outcome in ('sac_fly', 'sac_bunt'):
                sac += 1

        singles = h - doubles - triples - hr
        total_bases = singles + 2 * doubles + 3 * triples + 4 * hr
        plate_appearances = ab + bb + sac

        avg = round(h / ab, 3) if ab else 0.0
        obp = round((h + bb) / plate_appearances, 3) if plate_appearances else 0.0
        slg = round(total_bases / ab, 3) if ab else 0.0
        ops = round(obp + slg, 3)

        return {
            'ab': ab, 'h': h, '2b': doubles, '3b': triples, 'hr': hr,
            'bb': bb, 'k': k, 'r': runs, 'rbi': rbi, 'sac': sac,
            'avg': avg, 'obp': obp, 'slg': slg, 'ops': ops,
        }

    @staticmethod
    def box_score(game_id):
        game = db.fetch_one("SELECT * FROM games WHERE id = ?", (game_id,))
        if not game:
            return None

        lineups = db.fetch_all("""
            SELECT l.*, p.first_name, p.last_name, p.jersey_number
            FROM lineups l JOIN players p ON p.id = l.player_id
            WHERE l.game_id = ? ORDER BY l.team_id, l.batting_order
        """, (game_id,))

        result = {'home': [], 'away': []}
        for l in lineups:
            side = 'home' if l['team_id'] == game['home_team_id'] else 'away'
            line = StatsService.player_batting_line(game_id, l['player_id'])
            result[side].append({
                'player_id': l['player_id'],
                'first_name': l['first_name'],
                'last_name': l['last_name'],
                'jersey_number': l['jersey_number'],
                'batting_order': l['batting_order'],
                'position': l['position'],
                **line,
            })
        return result

    @staticmethod
    def pitching_line(game_id, player_id):
        plays = db.fetch_all(
            "SELECT at_bat_result, runs_scored, outs_recorded FROM plays WHERE game_id = ? AND pitcher_id = ? AND is_undone = 0",
            (game_id, player_id)
        )
        outs = sum(p['outs_recorded'] for p in plays)
        runs = sum(p['runs_scored'] for p in plays)
        k = sum(1 for p in plays if p['at_bat_result'] == 'strikeout')
        bb = sum(1 for p in plays if p['at_bat_result'] in WALK_OUTCOMES)
        h = sum(1 for p in plays if p['at_bat_result'] in HIT_OUTCOMES)
        innings_pitched = outs / 3.0
        era = round((runs * 9) / innings_pitched, 2) if innings_pitched else 0.0
        whip = round((bb + h) / innings_pitched, 2) if innings_pitched else 0.0
        return {
            'outs': outs, 'ip': round(innings_pitched, 1), 'r': runs,
            'k': k, 'bb': bb, 'h': h, 'era': era, 'whip': whip,
        }
