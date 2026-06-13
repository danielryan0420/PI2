from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

from services import TeamService, PlayerService, AuthService, GameService, PlayService, StatsService, VALID_OUTCOMES
from sockets import register_socket_handlers, broadcast_state, broadcast_play, broadcast_undo, broadcast_status

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

DIST_DIR = Path(__file__).parent / 'client' / 'dist'

AuthService.ensure_default_user()
register_socket_handlers(socketio)


@app.after_request
def _security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


# ===== AUTH =====
@app.post('/api/login')
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password') or ''
    if not username:
        return jsonify({'error': 'Username required'}), 400

    user = AuthService.get_user(username)
    if not user or not AuthService.verify_password(username, password):
        return jsonify({'error': 'Invalid username or password'}), 401

    return jsonify({'id': user['id'], 'username': user['username'], 'role': user['role']}), 200


# ===== TEAMS =====
@app.get('/api/teams')
def list_teams():
    return jsonify(TeamService.list_teams())


@app.post('/api/teams')
def create_team():
    data = request.json or {}
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Team name is required'}), 400
    team = TeamService.create_team(
        name, data.get('short_name'), data.get('primary_color'), data.get('secondary_color')
    )
    return jsonify(team), 201


@app.get('/api/teams/<int:team_id>')
def get_team(team_id):
    team = TeamService.get_team(team_id)
    if not team:
        return jsonify({'error': 'Team not found'}), 404
    return jsonify(team)


@app.put('/api/teams/<int:team_id>')
def update_team(team_id):
    data = request.json or {}
    team = TeamService.update_team(
        team_id, data.get('name'), data.get('short_name'), data.get('primary_color'), data.get('secondary_color')
    )
    if not team:
        return jsonify({'error': 'Team not found'}), 404
    return jsonify(team)


# ===== PLAYERS / ROSTERS =====
@app.get('/api/teams/<int:team_id>/players')
def list_players(team_id):
    active_only = request.args.get('all') != '1'
    return jsonify(PlayerService.list_players(team_id, active_only))


@app.post('/api/teams/<int:team_id>/players')
def create_player(team_id):
    data = request.json or {}
    if not data.get('first_name') or not data.get('last_name'):
        return jsonify({'error': 'First and last name are required'}), 400
    player = PlayerService.create_player(
        team_id, data['first_name'], data['last_name'],
        data.get('jersey_number'), data.get('primary_position'), data.get('bats'), data.get('throws')
    )
    return jsonify(player), 201


@app.put('/api/players/<int:player_id>')
def update_player(player_id):
    data = request.json or {}
    player = PlayerService.update_player(player_id, **data)
    if not player:
        return jsonify({'error': 'Player not found'}), 404
    return jsonify(player)


@app.delete('/api/players/<int:player_id>')
def delete_player(player_id):
    PlayerService.delete_player(player_id)
    return jsonify({'ok': True})


# ===== GAMES =====
@app.get('/api/games')
def list_games():
    return jsonify(GameService.list_games(request.args.get('status')))


@app.post('/api/games')
def create_game():
    data = request.json or {}
    try:
        game = GameService.create_game(
            data['home_team_id'], data['away_team_id'],
            data.get('scheduled_at'), data.get('venue'),
            data.get('innings_scheduled', 9), data.get('notes')
        )
        return jsonify(game), 201
    except (KeyError, ValueError) as e:
        return jsonify({'error': str(e)}), 400


@app.get('/api/games/<int:game_id>')
def get_game(game_id):
    game = GameService.get_game(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(game)


@app.post('/api/games/<int:game_id>/lineups')
def set_lineup(game_id):
    data = request.json or {}
    try:
        lineups = GameService.set_lineup(game_id, data['team_id'], data['entries'])
        return jsonify(lineups), 200
    except (KeyError, ValueError) as e:
        return jsonify({'error': str(e)}), 400


@app.get('/api/games/<int:game_id>/lineups')
def get_lineups(game_id):
    return jsonify(GameService.get_lineups(game_id))


@app.post('/api/games/<int:game_id>/start')
def start_game(game_id):
    try:
        game = GameService.start_game(game_id)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_state(socketio, game_id)
    broadcast_status(socketio, game_id, 'in_progress')
    return jsonify(game)


@app.post('/api/games/<int:game_id>/end')
def end_game(game_id):
    try:
        game = GameService.end_game(game_id)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_status(socketio, game_id, 'completed')
    return jsonify(game)


# ===== LIVE SCORING =====
@app.get('/api/games/<int:game_id>/state')
def get_state(game_id):
    state = PlayService.get_state(game_id)
    if not state:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(state)


@app.get('/api/games/<int:game_id>/at-bat/defaults')
def at_bat_defaults(game_id):
    outcome = request.args.get('outcome')
    try:
        defaults = PlayService.get_default_actions(game_id, outcome)
        return jsonify(defaults)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.post('/api/games/<int:game_id>/at-bat')
def record_at_bat(game_id):
    data = request.json or {}
    outcome = data.get('outcome')
    if outcome not in VALID_OUTCOMES:
        return jsonify({'error': 'Invalid or missing outcome'}), 400
    try:
        state = PlayService.record_at_bat(
            game_id, outcome, data.get('runner_actions'), data.get('description')
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_state(socketio, game_id)
    broadcast_play(socketio, game_id, state)
    return jsonify(state)


@app.post('/api/games/<int:game_id>/pitch')
def record_pitch(game_id):
    data = request.json or {}
    pitch_type = data.get('type')
    try:
        state = PlayService.record_pitch(game_id, pitch_type)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_state(socketio, game_id)
    if state['game_state']['balls'] == 0 and state['game_state']['strikes'] == 0:
        # The pitch ended the at-bat (walk or strikeout) -> notify like an at-bat.
        broadcast_play(socketio, game_id, state)
    return jsonify(state)


@app.post('/api/games/<int:game_id>/pitch/undo')
def undo_pitch(game_id):
    try:
        state = PlayService.undo_pitch(game_id)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_state(socketio, game_id)
    return jsonify(state)


@app.post('/api/games/<int:game_id>/undo')
def undo_play(game_id):
    try:
        state = PlayService.undo_last_play(game_id)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    broadcast_state(socketio, game_id)
    broadcast_undo(socketio, game_id)
    return jsonify(state)


@app.get('/api/games/<int:game_id>/plays')
def get_plays(game_id):
    from database import db
    plays = db.fetch_all(
        "SELECT * FROM plays WHERE game_id = ? AND is_undone = 0 ORDER BY sequence", (game_id,)
    )
    return jsonify(plays)


# ===== STATS =====
@app.get('/api/games/<int:game_id>/box-score')
def box_score(game_id):
    result = StatsService.box_score(game_id)
    if result is None:
        return jsonify({'error': 'Game not found'}), 404
    return jsonify(result)


@app.get('/api/players/<int:player_id>/stats')
def player_stats(player_id):
    return jsonify(StatsService.player_season_batting(player_id))


@app.get('/api/games/<int:game_id>/players/<int:player_id>/pitching')
def pitching_line(game_id, player_id):
    return jsonify(StatsService.pitching_line(game_id, player_id))


# ===== STATIC FRONTEND (production) =====
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and (DIST_DIR / path).exists():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')


def _print_lan_urls(port):
    """Print the LAN address(es) the app is reachable at, so the host knows
    which URL to open / share (e.g. over a phone hotspot)."""
    import socket
    addrs = set()
    try:
        # Doesn't actually send packets; just picks the default outbound interface.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        addrs.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.'):
                addrs.add(ip)
    except Exception:
        pass

    print('\n  Baseball Scorekeeper is running:')
    print(f'    Local:   http://localhost:{port}')
    for ip in sorted(addrs):
        print(f'    Network: http://{ip}:{port}   <- open this on other devices on the same Wi-Fi/hotspot')
    print('  Open the Network URL on each device, then use the in-app "Share / stream" QR codes.\n')


if __name__ == '__main__':
    PORT = 8082
    _print_lan_urls(PORT)
    socketio.run(app, host='0.0.0.0', port=PORT, debug=True)
