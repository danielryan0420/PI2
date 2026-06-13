from werkzeug.security import generate_password_hash, check_password_hash
from database import db


class AuthService:
    @staticmethod
    def get_user(username):
        return db.fetch_one("SELECT * FROM users WHERE username = ?", (username,))

    @staticmethod
    def verify_password(username, password):
        user = AuthService.get_user(username)
        if not user:
            return False
        return check_password_hash(user['password_hash'], password)

    @staticmethod
    def create_user(username, password, role='scorekeeper'):
        password_hash = generate_password_hash(password)
        user_id = db.insert(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, password_hash, role)
        )
        return db.fetch_one("SELECT id, username, role FROM users WHERE id = ?", (user_id,))

    @staticmethod
    def ensure_default_user():
        """Seed a default scorekeeper account if no users exist yet."""
        existing = db.fetch_one("SELECT id FROM users LIMIT 1")
        if existing:
            return
        AuthService.create_user('scorekeeper', 'baseball', role='admin')
