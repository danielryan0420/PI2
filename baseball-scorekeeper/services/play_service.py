import json
from database import db

VALID_OUTCOMES = [
    'single', 'double', 'triple', 'home_run', 'walk', 'hit_by_pitch',
    'strikeout', 'groundout', 'flyout', 'lineout', 'popout',
    'error', 'fielders_choice', 'sac_fly', 'sac_bunt', 'double_play'
]

# Outcomes where runs scored are NOT credited as RBI
NO_RBI_OUTCOMES = {'error', 'fielders_choice', 'double_play'}

# Batter's destination base for each outcome ('1B','2B','3B','HOME','OUT')
BATTER_DESTINATION = {
    'single': '1B',
    'double': '2B',
    'triple': '3B',
    'home_run': 'HOME',
    'walk': '1B',
    'hit_by_pitch': '1B',
    'strikeout': 'OUT',
    'groundout': 'OUT',
    'flyout': 'OUT',
    'lineout': 'OUT',
    'popout': 'OUT',
    'error': '1B',
    'fielders_choice': '1B',
    'sac_fly': 'OUT',
    'sac_bunt': 'OUT',
    'double_play': 'OUT',
}


def default_runner_actions(outcome, bases):
    """Returns default actions for runners on 1b/2b/3b given the outcome
    and which bases are currently occupied. bases = {'1b': bool, '2b': bool, '3b': bool}
    Action values: 'stay' | 'to_2b' | 'to_3b' | 'score' | 'out'
    """
    actions = {'1b': 'stay', '2b': 'stay', '3b': 'stay'}

    if outcome in ('single',):
        if bases['3b']:
            actions['3b'] = 'score'
        if bases['2b']:
            actions['2b'] = 'to_3b'
        if bases['1b']:
            actions['1b'] = 'to_2b'
    elif outcome in ('double', 'error'):
        if bases['3b']:
            actions['3b'] = 'score'
        if bases['2b']:
            actions['2b'] = 'score'
        if bases['1b']:
            actions['1b'] = 'to_3b'
    elif outcome == 'triple' or outcome == 'home_run':
        if bases['3b']:
            actions['3b'] = 'score'
        if bases['2b']:
            actions['2b'] = 'score'
        if bases['1b']:
            actions['1b'] = 'score'
    elif outcome in ('walk', 'hit_by_pitch'):
        # Force-chain: batter takes 1B, runners forced ahead only while occupied
        if bases['1b']:
            actions['1b'] = 'to_2b'
            if bases['2b']:
                actions['2b'] = 'to_3b'
                if bases['3b']:
                    actions['3b'] = 'score'
    elif outcome == 'sac_bunt':
        if bases['3b']:
            actions['3b'] = 'score'
        if bases['2b']:
            actions['2b'] = 'to_3b'
        if bases['1b']:
            actions['1b'] = 'to_2b'
    elif outcome == 'sac_fly':
        if bases['3b']:
            actions['3b'] = 'score'
    elif outcome == 'fielders_choice':
        if bases['1b']:
            actions['1b'] = 'out'
    elif outcome == 'double_play':
        if bases['1b']:
            actions['1b'] = 'out'
        elif bases['2b']:
            actions['2b'] = 'out'
        elif bases['3b']:
            actions['3b'] = 'out'
    # strikeout, groundout, flyout, lineout, popout -> all runners stay by default

    # Runners only present on bases that are actually occupied
    for base in ('1b', '2b', '3b'):
        if not bases[base]:
            actions[base] = 'stay'

    return actions


def _build_base_state_after(base_state_before, batter_destination, runner_actions, batter_id):
    after = {'1b': None, '2b': None, '3b': None}

    runner_3b = base_state_before.get('3b')
    runner_2b = base_state_before.get('2b')
    runner_1b = base_state_before.get('1b')

    if runner_3b is not None:
        action = runner_actions.get('3b', 'stay')
        if action == 'stay':
            after['3b'] = runner_3b

    if runner_2b is not None:
        action = runner_actions.get('2b', 'stay')
        if action == 'stay':
            after['2b'] = runner_2b
        elif action == 'to_3b':
            after['3b'] = runner_2b

    if runner_1b is not None:
        action = runner_actions.get('1b', 'stay')
        if action == 'stay':
            after['1b'] = runner_1b
        elif action == 'to_2b':
            after['2b'] = runner_1b
        elif action == 'to_3b':
            after['3b'] = runner_1b

    if batter_destination == '1B':
        after['1b'] = batter_id
    elif batter_destination == '2B':
        after['2b'] = batter_id
    elif batter_destination == '3B':
        after['3b'] = batter_id

    return after


def _compute_outcome(outcome, base_state_before, runner_actions, batter_id):
    batter_destination = BATTER_DESTINATION[outcome]

    outs_recorded = 1 if batter_destination == 'OUT' else 0
    runs_scored = 1 if batter_destination == 'HOME' else 0

    for base in ('1b', '2b', '3b'):
        if base_state_before.get(base) is None:
            continue
        action = runner_actions.get(base, 'stay')
        if action == 'out':
            outs_recorded += 1
        elif action == 'score':
            runs_scored += 1

    rbi = 0 if outcome in NO_RBI_OUTCOMES else runs_scored

    base_state_after = _build_base_state_after(base_state_before, batter_destination, runner_actions, batter_id)

    return batter_destination, outs_recorded, runs_scored, rbi, base_state_after


class PlayService:
    @staticmethod
    def get_state(game_id):
        game = db.fetch_one("""
            SELECT g.*, ht.name AS home_team_name, ht.short_name AS home_team_short,
                   ht.primary_color AS home_primary_color, ht.secondary_color AS home_secondary_color,
                   at.name AS away_team_name, at.short_name AS away_team_short,
                   at.primary_color AS away_primary_color, at.secondary_color AS away_secondary_color
            FROM games g
            JOIN teams ht ON ht.id = g.home_team_id
            JOIN teams at ON at.id = g.away_team_id
            WHERE g.id = ?
        """, (game_id,))
        if not game:
            return None

        state = db.fetch_one("SELECT * FROM game_state WHERE game_id = ?", (game_id,))
        line_score_rows = db.fetch_all(
            "SELECT team_id, inning, runs FROM line_score WHERE game_id = ? ORDER BY inning",
            (game_id,)
        )
        line_score = {}
        for r in line_score_rows:
            line_score.setdefault(str(r['team_id']), {})[str(r['inning'])] = r['runs']

        lineups = db.fetch_all("""
            SELECT l.*, p.first_name, p.last_name, p.jersey_number
            FROM lineups l JOIN players p ON p.id = l.player_id
            WHERE l.game_id = ? ORDER BY l.team_id, l.batting_order
        """, (game_id,))

        result = {'game': game, 'game_state': state, 'line_score': line_score, 'lineups': lineups}

        if not state:
            return result

        batting_team_id = game['home_team_id'] if state['half'] == 'bottom' else game['away_team_id']
        pitching_team_id = game['away_team_id'] if state['half'] == 'bottom' else game['home_team_id']
        batting_index_field = 'home_batting_index' if state['half'] == 'bottom' else 'away_batting_index'

        team_lineup = [l for l in lineups if l['team_id'] == batting_team_id]
        team_lineup_sorted = sorted(team_lineup, key=lambda l: l['batting_order'])
        lineup_size = len(team_lineup_sorted)

        current_batter = None
        if lineup_size:
            idx = state[batting_index_field] % lineup_size
            current_batter = team_lineup_sorted[idx]

        current_pitcher_id = (
            state['current_pitcher_home_id'] if pitching_team_id == game['home_team_id']
            else state['current_pitcher_away_id']
        )
        current_pitcher = db.fetch_one("SELECT * FROM players WHERE id = ?", (current_pitcher_id,)) if current_pitcher_id else None

        def runner_info(player_id):
            if not player_id:
                return None
            return db.fetch_one("SELECT id, first_name, last_name, jersey_number FROM players WHERE id = ?", (player_id,))

        result['current_batter'] = current_batter
        result['current_pitcher'] = current_pitcher
        result['batting_team_id'] = batting_team_id
        result['pitching_team_id'] = pitching_team_id
        result['runners'] = {
            '1b': runner_info(state['runner_1b']),
            '2b': runner_info(state['runner_2b']),
            '3b': runner_info(state['runner_3b']),
        }
        result['bases_occupied'] = {
            '1b': state['runner_1b'] is not None,
            '2b': state['runner_2b'] is not None,
            '3b': state['runner_3b'] is not None,
        }
        return result

    @staticmethod
    def get_default_actions(game_id, outcome):
        if outcome not in VALID_OUTCOMES:
            raise ValueError("Invalid outcome")
        state = db.fetch_one("SELECT runner_1b, runner_2b, runner_3b FROM game_state WHERE game_id = ?", (game_id,))
        if not state:
            raise ValueError("Game has not started")
        bases = {
            '1b': state['runner_1b'] is not None,
            '2b': state['runner_2b'] is not None,
            '3b': state['runner_3b'] is not None,
        }
        return {
            'batter_destination': BATTER_DESTINATION[outcome],
            'runner_actions': default_runner_actions(outcome, bases),
        }

    @staticmethod
    def record_at_bat(game_id, outcome, runner_actions=None, description=None):
        if outcome not in VALID_OUTCOMES:
            raise ValueError("Invalid outcome")

        game = db.fetch_one("SELECT * FROM games WHERE id = ?", (game_id,))
        if not game:
            raise ValueError("Game not found")
        if game['status'] != 'in_progress':
            raise ValueError("Game is not in progress")

        state = db.fetch_one("SELECT * FROM game_state WHERE game_id = ?", (game_id,))
        if not state:
            raise ValueError("Game state not initialized")

        base_state_before = {
            '1b': state['runner_1b'],
            '2b': state['runner_2b'],
            '3b': state['runner_3b'],
        }
        bases = {k: v is not None for k, v in base_state_before.items()}

        if runner_actions is None:
            runner_actions = default_runner_actions(outcome, bases)
        else:
            defaults = default_runner_actions(outcome, bases)
            merged = dict(defaults)
            merged.update({k: v for k, v in runner_actions.items() if k in ('1b', '2b', '3b')})
            runner_actions = merged

        half = state['half']
        batting_team_id = game['home_team_id'] if half == 'bottom' else game['away_team_id']
        pitching_team_id = game['away_team_id'] if half == 'bottom' else game['home_team_id']
        batting_index_field = 'home_batting_index' if half == 'bottom' else 'away_batting_index'

        lineup = db.fetch_all(
            "SELECT player_id, batting_order FROM lineups WHERE game_id = ? AND team_id = ? ORDER BY batting_order",
            (game_id, batting_team_id)
        )
        if not lineup:
            raise ValueError("Batting team has no lineup set")
        lineup_size = len(lineup)
        batter_id = lineup[state[batting_index_field] % lineup_size]['player_id']

        pitcher_id = (
            state['current_pitcher_home_id'] if pitching_team_id == game['home_team_id']
            else state['current_pitcher_away_id']
        )

        batter_destination, outs_recorded, runs_scored, rbi, base_state_after = _compute_outcome(
            outcome, base_state_before, runner_actions, batter_id
        )

        seq_row = db.fetch_one("SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM plays WHERE game_id = ?", (game_id,))
        sequence = seq_row['max_seq'] + 1

        new_outs = state['outs'] + outs_recorded
        inning_ends = new_outs >= 3

        if inning_ends:
            new_half = 'bottom' if half == 'top' else 'top'
            new_inning = state['inning'] if half == 'top' else state['inning'] + 1
            new_outs_value = 0
            new_runners = {'1b': None, '2b': None, '3b': None}
        else:
            new_half = half
            new_inning = state['inning']
            new_outs_value = new_outs
            new_runners = base_state_after

        new_home_score = state['home_score'] + (runs_scored if batting_team_id == game['home_team_id'] else 0)
        new_away_score = state['away_score'] + (runs_scored if batting_team_id == game['away_team_id'] else 0)

        new_batting_index = (state[batting_index_field] + 1) % lineup_size

        with db.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("""
                    INSERT INTO plays (
                        game_id, sequence, inning, half, batting_team_id, batter_id, pitcher_id,
                        at_bat_result, runs_scored, rbi, outs_recorded,
                        base_state_before, base_state_after, description, is_undone
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (
                    game_id, sequence, state['inning'], half, batting_team_id, batter_id, pitcher_id,
                    outcome, runs_scored, rbi, outs_recorded,
                    json.dumps(base_state_before), json.dumps(base_state_after), description
                ))

                update_fields = {
                    'inning': new_inning,
                    'half': new_half,
                    'outs': new_outs_value,
                    'balls': 0,
                    'strikes': 0,
                    'home_score': new_home_score,
                    'away_score': new_away_score,
                    'runner_1b': new_runners['1b'],
                    'runner_2b': new_runners['2b'],
                    'runner_3b': new_runners['3b'],
                    batting_index_field: new_batting_index,
                }
                set_clause = ", ".join(f"{k} = ?" for k in update_fields)
                conn.execute(
                    f"UPDATE game_state SET {set_clause}, updated_at = datetime('now') WHERE game_id = ?",
                    (*update_fields.values(), game_id)
                )

                if runs_scored:
                    conn.execute("""
                        INSERT INTO line_score (game_id, team_id, inning, runs) VALUES (?, ?, ?, ?)
                        ON CONFLICT(game_id, team_id, inning) DO UPDATE SET runs = runs + excluded.runs
                    """, (game_id, batting_team_id, state['inning'], runs_scored))

                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise

        return PlayService.get_state(game_id)

    @staticmethod
    def undo_last_play(game_id):
        game = db.fetch_one("SELECT * FROM games WHERE id = ?", (game_id,))
        if not game:
            raise ValueError("Game not found")

        last_play = db.fetch_one(
            "SELECT * FROM plays WHERE game_id = ? AND is_undone = 0 ORDER BY sequence DESC LIMIT 1",
            (game_id,)
        )
        if not last_play:
            raise ValueError("No plays to undo")

        with db.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("UPDATE plays SET is_undone = 1 WHERE id = ?", (last_play['id'],))
                conn.execute("UPDATE line_score SET runs = 0 WHERE game_id = ?", (game_id,))
                PlayService._replay(conn, game_id)
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise

        return PlayService.get_state(game_id)

    @staticmethod
    def _replay(conn, game_id):
        """Rebuild game_state and line_score from the non-undone plays log."""
        game = conn.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()

        home_lineup_size = conn.execute(
            "SELECT COUNT(*) AS c FROM lineups WHERE game_id = ? AND team_id = ?",
            (game_id, game['home_team_id'])
        ).fetchone()['c'] or 1
        away_lineup_size = conn.execute(
            "SELECT COUNT(*) AS c FROM lineups WHERE game_id = ? AND team_id = ?",
            (game_id, game['away_team_id'])
        ).fetchone()['c'] or 1

        # Preserve original starting pitchers (no substitutions tracked in MVP)
        existing_state = conn.execute("SELECT * FROM game_state WHERE game_id = ?", (game_id,)).fetchone()

        inning = 1
        half = 'top'
        outs = 0
        home_score = 0
        away_score = 0
        runners = {'1b': None, '2b': None, '3b': None}
        home_batting_index = 0
        away_batting_index = 0

        plays = conn.execute(
            "SELECT * FROM plays WHERE game_id = ? AND is_undone = 0 ORDER BY sequence ASC",
            (game_id,)
        ).fetchall()

        for play in plays:
            runs_scored = play['runs_scored']
            batting_team_id = play['batting_team_id']

            if runs_scored:
                if batting_team_id == game['home_team_id']:
                    home_score += runs_scored
                else:
                    away_score += runs_scored
                conn.execute("""
                    INSERT INTO line_score (game_id, team_id, inning, runs) VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id, team_id, inning) DO UPDATE SET runs = runs + excluded.runs
                """, (game_id, batting_team_id, play['inning'], runs_scored))

            if batting_team_id == game['home_team_id']:
                home_batting_index = (home_batting_index + 1) % home_lineup_size
            else:
                away_batting_index = (away_batting_index + 1) % away_lineup_size

            new_outs = outs + play['outs_recorded']
            if new_outs >= 3:
                outs = 0
                runners = {'1b': None, '2b': None, '3b': None}
                if play['half'] == 'top':
                    half = 'bottom'
                else:
                    half = 'top'
                    inning += 1
            else:
                outs = new_outs
                runners = json.loads(play['base_state_after'])
                half = play['half']
                inning = play['inning']

        conn.execute("""
            UPDATE game_state SET
                inning = ?, half = ?, outs = ?, balls = 0, strikes = 0,
                home_score = ?, away_score = ?,
                runner_1b = ?, runner_2b = ?, runner_3b = ?,
                home_batting_index = ?, away_batting_index = ?,
                updated_at = datetime('now')
            WHERE game_id = ?
        """, (
            inning, half, outs, home_score, away_score,
            runners['1b'], runners['2b'], runners['3b'],
            home_batting_index, away_batting_index, game_id
        ))
