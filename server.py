import os
import json
from pathlib import Path
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import uuid
from services import (
    UserService, SessionService, CountService, PhotoService,
    MessageService, AuditService, SlocConfigService, MaterialService,
    WmBinService, DashboardService
)

app = Flask(__name__, static_folder='client/dist', static_url_path='')
CORS(app)

UPLOAD_FOLDER = Path('uploads')
UPLOAD_FOLDER.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ===== AUTH =====
@app.post('/api/login')
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    user = UserService.get_user(username)
    if not user or not UserService.verify_password(username, password):
        return jsonify({'error': 'Invalid username or password'}), 401

    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'role': user['role']
    }), 200

# ===== USERS =====
@app.get('/api/users')
def list_users():
    users = UserService.list_users()
    return jsonify(users)

@app.post('/api/users')
def create_user():
    data = request.json
    username = data.get('username')
    role = data.get('role')
    password = data.get('password', '')

    if not username or not role:
        return jsonify({'error': 'Username and role required'}), 400

    try:
        user = UserService.get_user(username)
        if user:
            UserService.update_user_role(username, role)
            if password:
                UserService.set_password(username, password)
            return jsonify({'id': user['id'], 'username': user['username'], 'role': user['role']})
        else:
            UserService.create_user(username, role, password)
            return jsonify(UserService.get_user(username)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/users/<username>')
def get_user(username):
    user = UserService.get_user(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'id': user['id'], 'username': user['username'], 'role': user['role'], 'created_at': user['created_at']})

# ===== SESSIONS =====
@app.get('/api/sessions')
def list_sessions():
    sessions = SessionService.list_sessions()
    return jsonify(sessions)

@app.post('/api/sessions')
def create_session():
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Session name required'}), 400

    try:
        session_id = SessionService.create_session(name)
        return jsonify(SessionService.get_session(session_id)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/sessions/<int:session_id>')
def get_session(session_id):
    session = SessionService.get_session(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    return jsonify(session)

@app.post('/api/sessions/<int:session_id>/close')
def close_session(session_id):
    try:
        SessionService.close_session(session_id)
        return jsonify(SessionService.get_session(session_id))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/sessions/<int:session_id>/stats')
def get_session_stats(session_id):
    stats = SessionService.get_session_stats(session_id)
    return jsonify(stats)

# ===== COUNTS =====
@app.post('/api/sessions/<int:session_id>/counts')
def create_count(session_id):
    data = request.json

    try:
        count_id = CountService.create_count(
            session_id=session_id,
            username=data.get('username'),
            material_number=data.get('material_number'),
            quantity=float(data.get('quantity')),
            sloc=data.get('sloc'),
            wm_bin=data.get('wm_bin'),
            zbin=data.get('zbin')
        )
        return jsonify(CountService.get_count(count_id)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/sessions/<int:session_id>/counts')
def list_counts(session_id):
    material = request.args.get('material')
    status = request.args.get('status')
    username = request.args.get('username')

    filters = {}
    if material:
        filters['material'] = material
    if status:
        filters['status'] = status
    if username:
        filters['username'] = username

    counts = CountService.list_counts(session_id, filters)
    return jsonify(counts)

@app.get('/api/sessions/<int:session_id>/counts/mine')
def list_my_counts(session_id):
    username = request.args.get('username') or request.headers.get('x-username')
    if not username:
        return jsonify({'error': 'username required'}), 400

    counts = CountService.list_counts(session_id, {'username': username})
    return jsonify(counts)

@app.get('/api/counts/<int:count_id>')
def get_count(count_id):
    count = CountService.get_count(count_id)
    if not count:
        return jsonify({'error': 'Count not found'}), 404
    return jsonify(count)

@app.patch('/api/counts/<int:count_id>')
def update_count(count_id):
    data = request.json
    editor_username = data.get('editor_username')

    try:
        CountService.update_count(count_id, editor_username, **{k: v for k, v in data.items() if k != 'editor_username'})
        return jsonify(CountService.get_count(count_id))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.post('/api/counts/<int:count_id>/verify')
def verify_count(count_id):
    data = request.json
    editor_username = data.get('editor_username')

    try:
        CountService.verify_count(count_id, editor_username)
        return jsonify(CountService.get_count(count_id))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.post('/api/counts/<int:count_id>/flag')
def flag_count(count_id):
    data = request.json
    editor_username = data.get('editor_username')
    reason = data.get('reason')

    try:
        CountService.flag_count(count_id, editor_username, reason)
        return jsonify(CountService.get_count(count_id))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ===== PHOTOS =====
@app.post('/api/counts/<int:count_id>/photos')
def upload_photo(count_id):
    if 'photo' not in request.files:
        return jsonify({'error': 'No photo provided'}), 400

    file = request.files['photo']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{count_id}_{uuid.uuid4()}.{ext}"
        filepath = UPLOAD_FOLDER / filename
        file.save(filepath)

        photo_id = PhotoService.add_photo(count_id, filename, file.filename)
        return jsonify({'id': photo_id, 'filename': filename}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/counts/<int:count_id>/photos')
def get_photos(count_id):
    photos = PhotoService.get_photos(count_id)
    return jsonify(photos)

@app.delete('/api/photos/<int:photo_id>')
def delete_photo(photo_id):
    try:
        PhotoService.delete_photo(photo_id)
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/photos/<filename>')
def serve_photo(filename):
    try:
        return send_from_directory(UPLOAD_FOLDER, filename)
    except Exception as e:
        return jsonify({'error': 'Photo not found'}), 404

# ===== MESSAGES =====
@app.post('/api/sessions/<int:session_id>/messages')
def create_message(session_id):
    data = request.json

    try:
        message_id = MessageService.create_message(
            session_id=session_id,
            sender=data.get('sender'),
            role=data.get('role'),
            body=data.get('body'),
            count_id=data.get('count_id')
        )
        return jsonify({'id': message_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/sessions/<int:session_id>/messages')
def get_messages(session_id):
    count_id = request.args.get('count_id', type=int)
    messages = MessageService.get_messages(session_id, count_id)
    return jsonify(messages)

# ===== SLOC CONFIG =====
@app.get('/api/sloc-config')
def list_sloc_config():
    slocs = SlocConfigService.list_slocs()
    return jsonify(slocs)

@app.post('/api/sloc-config')
def create_sloc_config():
    data = request.json

    try:
        SlocConfigService.create_sloc(
            sloc=data.get('sloc'),
            description=data.get('description'),
            wm_enabled=data.get('wm_enabled', False),
            im_enabled=data.get('im_enabled', False)
        )
        return jsonify(SlocConfigService.get_sloc(data.get('sloc'))), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/sloc-config/<sloc>')
def get_sloc_config(sloc):
    config = SlocConfigService.get_sloc(sloc)
    if not config:
        return jsonify({'error': 'SLOC not found'}), 404
    return jsonify(config)

@app.delete('/api/sloc-config/<sloc>')
def delete_sloc_config(sloc):
    try:
        SlocConfigService.delete_sloc(sloc)
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ===== MATERIALS =====
@app.post('/api/materials')
def create_material():
    data = request.json

    try:
        MaterialService.create_or_update_material(
            material_number=data.get('material_number'),
            description=data.get('description'),
            base_uom=data.get('base_uom'),
            material_type=data.get('material_type'),
            material_group=data.get('material_group')
        )
        return jsonify(MaterialService.get_material(data.get('material_number'))), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/materials/<material_number>')
def get_material(material_number):
    material = MaterialService.get_material(material_number)
    if not material:
        return jsonify({'error': 'Material not found'}), 404
    return jsonify(material)

@app.get('/api/materials/search/<query>')
def search_materials(query):
    materials = MaterialService.search_materials(query)
    return jsonify(materials)

# ===== WM BINS =====
@app.post('/api/wm-bins')
def create_wm_bin():
    data = request.json

    try:
        bin_id = WmBinService.create_bin(
            bin_name=data.get('bin'),
            storage_type=data.get('storage_type'),
            sloc=data.get('sloc'),
            description=data.get('description')
        )
        return jsonify({'id': bin_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/wm-bins')
def list_wm_bins():
    sloc = request.args.get('sloc')
    storage_type = request.args.get('storage_type')

    if not sloc:
        return jsonify({'error': 'SLOC required'}), 400

    bins = WmBinService.list_bins(sloc, storage_type)
    return jsonify(bins)

@app.post('/api/wm-bins/<int:bin_id>/materials')
def add_material_to_bin(bin_id):
    data = request.json
    material_number = data.get('material_number')

    try:
        WmBinService.add_material_to_bin(bin_id, material_number)
        return '', 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.get('/api/wm-bins/<int:bin_id>/materials')
def get_bin_materials(bin_id):
    materials = WmBinService.get_bin_materials(bin_id)
    return jsonify(materials)

# ===== AUDIT LOG =====
@app.get('/api/counts/<int:count_id>/audit')
def get_count_audit(count_id):
    logs = AuditService.get_audit_log(count_id)
    return jsonify(logs)

@app.get('/api/sessions/<int:session_id>/audit')
def get_session_audit(session_id):
    logs = AuditService.get_session_audit(session_id)
    return jsonify(logs)

# ===== DASHBOARD =====
@app.get('/api/sessions/<int:session_id>/dashboard/summary')
def get_dashboard_summary(session_id):
    summary = DashboardService.get_session_summary(session_id)
    return jsonify(summary)

@app.get('/api/sessions/<int:session_id>/dashboard/materials')
def get_material_summary(session_id):
    materials = DashboardService.get_material_summary(session_id)
    return jsonify(materials)

@app.get('/api/sessions/<int:session_id>/dashboard/users')
def get_user_summary(session_id):
    users = DashboardService.get_user_summary(session_id)
    return jsonify(users)

@app.get('/api/sessions/<int:session_id>/dashboard/discrepancies')
def get_discrepancies(session_id):
    discrepancies = DashboardService.get_discrepancies(session_id)
    return jsonify(discrepancies)

# ===== HEALTH CHECK =====
@app.get('/health')
def health():
    return jsonify({'ok': True, 'time': datetime.now().isoformat()})

# ===== SERVE REACT FRONTEND =====
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # Don't serve React for API routes
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404

    # Special files that should be served from dist
    if path and '.' in path.split('/')[-1]:
        file_path = Path('client/dist') / path
        if file_path.exists() and file_path.is_file():
            return send_from_directory('client/dist', path)

    # For all other routes (client-side routes), serve index.html
    return send_from_directory('client/dist', 'index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8081)
