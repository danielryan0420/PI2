"""WSGI/ASGI entry point for production deployment (gunicorn with eventlet worker)."""

from server import app, socketio

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8082)
