from flask_socketio import join_room, leave_room
from services import PlayService


def register_socket_handlers(socketio):
    @socketio.on('join_game')
    def handle_join_game(data):
        game_id = data.get('game_id')
        if game_id is None:
            return
        room = f"game:{game_id}"
        join_room(room)
        state = PlayService.get_state(game_id)
        if state:
            socketio.emit('state_sync', state, room=room, include_self=True)

    @socketio.on('leave_game')
    def handle_leave_game(data):
        game_id = data.get('game_id')
        if game_id is None:
            return
        leave_room(f"game:{game_id}")


def broadcast_state(socketio, game_id):
    state = PlayService.get_state(game_id)
    if state:
        socketio.emit('state_sync', state, room=f"game:{game_id}")
    return state


def broadcast_play(socketio, game_id, play_state):
    socketio.emit('play_recorded', play_state, room=f"game:{game_id}")


def broadcast_undo(socketio, game_id):
    socketio.emit('play_undone', {'game_id': game_id}, room=f"game:{game_id}")


def broadcast_status(socketio, game_id, status):
    socketio.emit('game_status_changed', {'game_id': game_id, 'status': status}, room=f"game:{game_id}")
