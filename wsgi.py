"""
WSGI entry point for production deployment with Gunicorn.
Handles 25+ concurrent users with proper worker configuration.
"""

from server import app

if __name__ == '__main__':
    app.run(debug=False)
