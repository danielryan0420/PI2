import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from database import db
from werkzeug.security import generate_password_hash, check_password_hash

UPLOADS_DIR = Path(__file__).parent / 'uploads'


class SessionService:
    @staticmethod
    def create_session(name: str) -> int:
        return db.insert(
            "INSERT INTO inventory_sessions (name, status) VALUES (?, ?)",
            (name, 'open')
        )

    @staticmethod
    def get_session(session_id: int) -> Optional[Dict]:
        return db.fetch_one(
            "SELECT * FROM inventory_sessions WHERE id = ?",
            (session_id,)
        )

    @staticmethod
    def list_sessions() -> List[Dict]:
        return db.fetch_all(
            "SELECT * FROM inventory_sessions ORDER BY created_at DESC"
        )

    @staticmethod
    def close_session(session_id: int) -> None:
        db.execute(
            "UPDATE inventory_sessions SET status = ?, closed_at = ? WHERE id = ?",
            ('closed', datetime.now().isoformat(), session_id)
        )

    @staticmethod
    def get_session_stats(session_id: int) -> Dict[str, Any]:
        counts = db.fetch_one(
            """
            SELECT COUNT(*) as total, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified
            FROM counts WHERE session_id = ?
            """,
            (session_id,)
        )
        return counts or {"total": 0, "verified": 0}


class CountService:
    @staticmethod
    def create_count(
        session_id: int,
        username: str,
        material_number: str,
        quantity: float,
        sloc: str,
        wm_bin: Optional[str] = None,
        zbin: Optional[str] = None,
        validation_warnings: Optional[str] = None,
    ) -> int:
        count_id = db.insert(
            """
            INSERT INTO counts (session_id, username, material_number, quantity, sloc, wm_bin, zbin, status, validation_warnings)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, username, material_number, quantity, sloc, wm_bin, zbin, 'pending', validation_warnings)
        )
        AuditService.log_event(count_id, username, 'create', None, None, material_number)
        return count_id

    @staticmethod
    def get_count(count_id: int) -> Optional[Dict]:
        return db.fetch_one("SELECT * FROM counts WHERE id = ?", (count_id,))

    @staticmethod
    def list_counts(session_id: int, filters: Optional[Dict] = None) -> List[Dict]:
        query = "SELECT * FROM counts WHERE session_id = ?"
        params = [session_id]

        if filters:
            if material := filters.get('material'):
                query += " AND material_number LIKE ?"
                params.append(f"%{material}%")
            if status := filters.get('status'):
                query += " AND status = ?"
                params.append(status)
            if username := filters.get('username'):
                query += " AND username = ?"
                params.append(username)
            if sloc := filters.get('sloc'):
                query += " AND sloc = ?"
                params.append(sloc)

        query += " ORDER BY created_at DESC"
        return db.fetch_all(query, tuple(params))

    @staticmethod
    def update_count(
        count_id: int,
        editor_username: str,
        reason: Optional[str] = None,
        **updates
    ) -> None:
        count = CountService.get_count(count_id)
        if not count:
            return

        allowed = {'quantity', 'wm_bin', 'zbin', 'status', 'material_number', 'sloc'}
        changes: Dict[str, tuple] = {}
        for field, new_value in updates.items():
            if field not in allowed:
                continue
            old_value = count.get(field)
            if old_value != new_value:
                changes[field] = (old_value, new_value)

        if not changes:
            return

        set_clause = ', '.join(f"{f} = ?" for f in changes)
        values = tuple(nv for _, nv in changes.values())
        values += (datetime.now().isoformat(), count_id)
        db.execute(
            f"UPDATE counts SET {set_clause}, updated_at = ? WHERE id = ?",
            values
        )

        for field, (old_value, new_value) in changes.items():
            AuditService.log_event(
                count_id, editor_username, 'edit',
                field, str(old_value), str(new_value), reason
            )

    @staticmethod
    def verify_count(count_id: int, editor_username: str) -> None:
        CountService.update_count(count_id, editor_username, status='verified')

    @staticmethod
    def flag_count(count_id: int, editor_username: str, reason: str = '') -> None:
        db.execute(
            "UPDATE counts SET status = 'flagged', updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), count_id)
        )
        AuditService.log_event(count_id, editor_username, 'flag', None, None, None, reason)

    @staticmethod
    def delete_count(count_id: int, editor_username: str) -> None:
        AuditService.log_event(count_id, editor_username, 'delete', None, None, None, 'Record deleted by admin')
        db.execute("DELETE FROM photos WHERE count_id = ?", (count_id,))
        db.execute("DELETE FROM messages WHERE count_id = ?", (count_id,))
        db.execute("DELETE FROM counts WHERE id = ?", (count_id,))


class PhotoService:
    @staticmethod
    def add_photo(count_id: int, filename: str, original_name: Optional[str] = None) -> int:
        return db.insert(
            "INSERT INTO photos (count_id, filename, original_name) VALUES (?, ?, ?)",
            (count_id, filename, original_name)
        )

    @staticmethod
    def get_photos(count_id: int) -> List[Dict]:
        return db.fetch_all(
            "SELECT * FROM photos WHERE count_id = ? ORDER BY uploaded_at DESC",
            (count_id,)
        )

    @staticmethod
    def delete_photo(photo_id: int) -> None:
        photo = db.fetch_one("SELECT filename FROM photos WHERE id = ?", (photo_id,))
        db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
        if photo:
            try:
                filepath = UPLOADS_DIR / photo['filename']
                if filepath.exists():
                    filepath.unlink()
            except OSError:
                pass


class MessageService:
    @staticmethod
    def create_message(
        session_id: int,
        sender: str,
        role: str,
        body: str,
        count_id: Optional[int] = None
    ) -> int:
        return db.insert(
            """
            INSERT INTO messages (count_id, session_id, sender, role, body)
            VALUES (?, ?, ?, ?, ?)
            """,
            (count_id, session_id, sender, role, body)
        )

    @staticmethod
    def get_count_messages(count_id: int) -> List[Dict]:
        return db.fetch_all(
            "SELECT * FROM messages WHERE count_id = ? ORDER BY sent_at ASC",
            (count_id,)
        )

    @staticmethod
    def get_messages(session_id: int, count_id: Optional[int] = None) -> List[Dict]:
        if count_id is not None:
            return db.fetch_all(
                """SELECT m.*, c.material_number, c.sloc
                   FROM messages m LEFT JOIN counts c ON m.count_id = c.id
                   WHERE m.session_id = ? AND m.count_id = ? ORDER BY m.sent_at ASC""",
                (session_id, count_id)
            )
        # Return ALL messages for the session (general + count-linked)
        return db.fetch_all(
            """SELECT m.*, c.material_number, c.sloc
               FROM messages m LEFT JOIN counts c ON m.count_id = c.id
               WHERE m.session_id = ? ORDER BY m.sent_at ASC""",
            (session_id,)
        )

    @staticmethod
    def get_general_messages(session_id: int) -> List[Dict]:
        return db.fetch_all(
            "SELECT * FROM messages WHERE session_id = ? AND count_id IS NULL ORDER BY sent_at ASC",
            (session_id,)
        )

    @staticmethod
    def get_user_messages(session_id: int, username: str) -> List[Dict]:
        return db.fetch_all("""
            SELECT m.*, c.material_number, c.sloc, c.username as counter_username
            FROM messages m
            LEFT JOIN counts c ON m.count_id = c.id
            WHERE m.session_id = ?
            AND (
                (m.count_id IS NULL AND m.sender = ?)
                OR (c.username = ?)
            )
            ORDER BY m.sent_at ASC
        """, (session_id, username, username))

    @staticmethod
    def delete_message(message_id: int) -> bool:
        existing = db.fetch_one("SELECT id FROM messages WHERE id = ?", (message_id,))
        if not existing:
            return False
        db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        return True


class AuditService:
    @staticmethod
    def log_event(
        count_id: int,
        editor_username: str,
        event_type: str,
        field_name: Optional[str] = None,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        reason: Optional[str] = None
    ) -> None:
        db.insert(
            """
            INSERT INTO audit_log (count_id, editor_username, event_type, field_name, old_value, new_value, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (count_id, editor_username, event_type, field_name, old_value, new_value, reason)
        )

    @staticmethod
    def get_audit_log(count_id: int) -> List[Dict]:
        return db.fetch_all(
            "SELECT * FROM audit_log WHERE count_id = ? ORDER BY created_at ASC",
            (count_id,)
        )

    @staticmethod
    def get_session_audit(session_id: int) -> List[Dict]:
        return db.fetch_all(
            """
            SELECT a.*, c.material_number, c.sloc FROM audit_log a
            JOIN counts c ON a.count_id = c.id
            WHERE c.session_id = ?
            ORDER BY a.created_at DESC
            """,
            (session_id,)
        )


class UserService:
    @staticmethod
    def create_user(username: str, role: str, password: str = "") -> int:
        hashed_password = generate_password_hash(password) if password else generate_password_hash("")
        return db.insert(
            "INSERT INTO users (username, role, password) VALUES (?, ?, ?)",
            (username, role, hashed_password)
        )

    @staticmethod
    def get_user(username: str) -> Optional[Dict]:
        return db.fetch_one(
            "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
            (username,)
        )

    @staticmethod
    def verify_password(username: str, password: str) -> bool:
        user = UserService.get_user(username)
        if not user:
            return False
        return check_password_hash(user['password'], password)

    @staticmethod
    def set_password(username: str, password: str) -> None:
        hashed_password = generate_password_hash(password)
        db.execute(
            "UPDATE users SET password = ? WHERE LOWER(username) = LOWER(?)",
            (hashed_password, username)
        )

    @staticmethod
    def list_users() -> List[Dict]:
        return db.fetch_all("SELECT id, username, role, created_at, last_active FROM users ORDER BY username ASC")

    @staticmethod
    def update_last_active(username: str) -> None:
        db.execute(
            "UPDATE users SET last_active = datetime('now') WHERE LOWER(username) = LOWER(?)",
            (username,)
        )

    @staticmethod
    def update_user_role(username: str, role: str) -> None:
        db.execute(
            "UPDATE users SET role = ? WHERE LOWER(username) = LOWER(?)",
            (role, username)
        )

    @staticmethod
    def update_user_role_by_id(user_id: int, role: str) -> None:
        db.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))

    @staticmethod
    def delete_user(user_id: int) -> None:
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))


class SlocConfigService:
    @staticmethod
    def create_sloc(sloc: str, description: str = "", wm_enabled: bool = False, im_enabled: bool = False) -> None:
        db.insert(
            """
            INSERT OR REPLACE INTO sloc_config (sloc, description, wm_enabled, im_enabled)
            VALUES (?, ?, ?, ?)
            """,
            (sloc, description, int(wm_enabled), int(im_enabled))
        )

    @staticmethod
    def get_sloc(sloc: str) -> Optional[Dict]:
        return db.fetch_one(
            "SELECT * FROM sloc_config WHERE sloc = ?",
            (sloc,)
        )

    @staticmethod
    def list_slocs() -> List[Dict]:
        return db.fetch_all("SELECT * FROM sloc_config ORDER BY sloc ASC")

    @staticmethod
    def delete_sloc(sloc: str) -> None:
        db.execute("DELETE FROM sloc_config WHERE sloc = ?", (sloc,))

    @staticmethod
    def get_available_slocs() -> List[Dict]:
        result = db.fetch_all("""
            SELECT
                COALESCE(sl.code, sc.sloc) as sloc,
                COALESCE(sl.description, sc.description, '') as description,
                COALESCE(sc.wm_enabled, 0) as wm_enabled,
                COALESCE(sc.im_enabled, 0) as im_enabled
            FROM sap_storage_locations sl
            LEFT JOIN sloc_config sc ON sl.code = sc.sloc
            UNION
            SELECT
                sc.sloc,
                sc.description,
                sc.wm_enabled,
                sc.im_enabled
            FROM sloc_config sc
            WHERE sc.sloc NOT IN (SELECT code FROM sap_storage_locations)
            ORDER BY sloc ASC
        """)
        return result


class WmBinService:
    @staticmethod
    def create_bin(bin_name: str, storage_type: str, sloc: str, description: str = "") -> int:
        return db.insert(
            """
            INSERT INTO wm_bins (bin, storage_type, sloc, description)
            VALUES (?, ?, ?, ?)
            """,
            (bin_name, storage_type, sloc, description)
        )

    @staticmethod
    def list_bins(sloc: str, storage_type: Optional[str] = None) -> List[Dict]:
        if storage_type:
            return db.fetch_all(
                "SELECT * FROM wm_bins WHERE sloc = ? AND storage_type = ? ORDER BY bin ASC",
                (sloc, storage_type)
            )
        return db.fetch_all(
            "SELECT * FROM wm_bins WHERE sloc = ? ORDER BY bin ASC",
            (sloc,)
        )

    @staticmethod
    def add_material_to_bin(bin_id: int, material_number: str) -> None:
        db.insert(
            """
            INSERT OR IGNORE INTO wm_bin_materials (bin_id, material_number)
            VALUES (?, ?)
            """,
            (bin_id, material_number)
        )

    @staticmethod
    def get_bin_materials(bin_id: int) -> List[Dict]:
        return db.fetch_all(
            "SELECT material_number FROM wm_bin_materials WHERE bin_id = ? ORDER BY material_number ASC",
            (bin_id,)
        )

    @staticmethod
    def delete_bin(bin_id: int) -> None:
        db.execute("DELETE FROM wm_bin_materials WHERE bin_id = ?", (bin_id,))
        db.execute("DELETE FROM wm_bins WHERE id = ?", (bin_id,))

    @staticmethod
    def bin_exists(bin_code: str) -> bool:
        result = db.fetch_one(
            "SELECT id FROM sap_lgap WHERE UPPER(bin_code) = ? LIMIT 1",
            (bin_code.upper(),)
        )
        return result is not None

    @staticmethod
    def check_fixed_bin(material_number: str, bin_code: str) -> Dict[str, Any]:
        """
        For storage-type-100 bins: verify the material's fixed bin assignment
        matches the entered bin. Returns a dict with:
          is_fixed_bin_type: bool  (True if bin is storage type 100)
          has_assignment:    bool  (True if material has a fixed bin row in LGPLO)
          expected_bin:      str | None
          matches:           bool
        """
        bin_row = db.fetch_one(
            "SELECT storage_type FROM sap_lgap WHERE UPPER(bin_code) = ? LIMIT 1",
            (bin_code.upper(),)
        )
        if not bin_row or str(bin_row.get('storage_type', '')).strip() != '100':
            return {'is_fixed_bin_type': False, 'has_assignment': False, 'expected_bin': None, 'matches': True}

        assignment = db.fetch_one(
            "SELECT fixed_bin FROM sap_lgplo WHERE material_number = ? AND storage_type = '100' LIMIT 1",
            (material_number.upper(),)
        )
        if not assignment:
            return {'is_fixed_bin_type': True, 'has_assignment': False, 'expected_bin': None, 'matches': True}

        expected = assignment['fixed_bin'].upper()
        matches = expected == bin_code.upper()
        return {'is_fixed_bin_type': True, 'has_assignment': True, 'expected_bin': expected, 'matches': matches}

    @staticmethod
    def delete_bin_material(bin_id: int, material_number: str) -> None:
        db.execute(
            "DELETE FROM wm_bin_materials WHERE bin_id = ? AND material_number = ?",
            (bin_id, material_number)
        )


class MaterialService:
    @staticmethod
    def create_or_update_material(material_number: str, description: str = "", base_uom: str = "", material_type: str = "", material_group: str = "") -> None:
        db.execute(
            """
            INSERT INTO sap_materials (material_number, description, base_uom, material_type, material_group, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(material_number) DO UPDATE SET
                description = excluded.description,
                base_uom = excluded.base_uom,
                material_type = excluded.material_type,
                material_group = excluded.material_group,
                updated_at = excluded.updated_at
            """,
            (material_number, description, base_uom, material_type, material_group, datetime.now().isoformat())
        )

    @staticmethod
    def get_material(material_number: str) -> Optional[Dict]:
        return db.fetch_one(
            "SELECT * FROM sap_materials WHERE material_number = ?",
            (material_number,)
        )

    @staticmethod
    def search_materials(query: str) -> List[Dict]:
        return db.fetch_all(
            """
            SELECT * FROM sap_materials
            WHERE material_number LIKE ? OR description LIKE ?
            ORDER BY material_number ASC
            LIMIT 50
            """,
            (f"%{query}%", f"%{query}%")
        )


class ImportService:
    @staticmethod
    def get_import_status() -> Dict[str, Any]:
        tables = {
            'sap_materials': ('SELECT COUNT(*) as count, MAX(updated_at) as updated_at FROM sap_materials', 'updated_at'),
            'sap_plant_data': ('SELECT COUNT(*) as count, MAX(updated_at) as updated_at FROM sap_plant_data', 'updated_at'),
            'sap_valuation': ('SELECT COUNT(*) as count, MAX(updated_at) as updated_at FROM sap_valuation', 'updated_at'),
            'sap_mard': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_mard', 'uploaded_at'),
            'sap_mlgt': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_mlgt', 'uploaded_at'),
            'sap_mlgn': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_mlgn', 'uploaded_at'),
            'sap_lqua': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_lqua', 'uploaded_at'),
            'sap_storage_locations': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_storage_locations', 'uploaded_at'),
            'sap_lgap': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_lgap', 'uploaded_at'),
            'sap_mseg': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_mseg', 'uploaded_at'),
            'sap_lgplo': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_lgplo', 'uploaded_at'),
            'sap_ekko': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_ekko', 'uploaded_at'),
            'sap_ekpo': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_ekpo', 'uploaded_at'),
            'sap_aufk': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_aufk', 'uploaded_at'),
            'sap_resb': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM sap_resb', 'uploaded_at'),
            'material_exclusions': ('SELECT COUNT(*) as count, MAX(uploaded_at) as uploaded_at FROM material_exclusions', 'uploaded_at'),
            'wm_bins': ('SELECT COUNT(*) as count FROM wm_bins', None),
        }
        result = {}
        for key, (query, date_col) in tables.items():
            row = db.fetch_one(query)
            updated_at = row.get(date_col) if date_col and row else None
            result[key] = {'count': row['count'] if row else 0, 'updated_at': updated_at}
        return result

    @staticmethod
    def import_mard(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_mard")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            sloc = (row.get('storage_location') or row.get('LGORT') or '').strip()
            if not mat or not plant or not sloc:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_mard
                    (material_number, plant, storage_location, unrestricted_qty, restricted_qty,
                     quality_qty, return_qty, uom, currency, total_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    mat, plant, sloc,
                    float(row.get('unrestricted_qty') or row.get('LABST') or 0),
                    float(row.get('restricted_qty') or row.get('SPERR') or 0),
                    float(row.get('quality_qty') or row.get('EINQU') or 0),
                    float(row.get('return_qty') or row.get('RETRU') or 0),
                    row.get('uom') or row.get('MEINS') or '',
                    row.get('currency') or row.get('WAERS') or '',
                    float(row.get('total_value') or row.get('SALK3') or 0)
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_materials(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_materials")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            if not mat:
                continue
            desc = (row.get('description') or row.get('MAKTX') or row.get('MAKTG') or '').strip()
            uom = (row.get('base_uom') or row.get('MEINS') or '').strip()
            mtype = (row.get('material_type') or row.get('MTART') or '').strip()
            mgroup = (row.get('material_group') or row.get('MATKL') or '').strip()
            MaterialService.create_or_update_material(mat, desc, uom, mtype, mgroup)
            count += 1
        return count

    @staticmethod
    def import_plant_data(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_plant_data")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            if not mat or not plant:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_plant_data
                    (material_number, plant, mrp_type, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (
                    mat, plant,
                    row.get('mrp_type') or row.get('DISMM') or '',
                    datetime.now().isoformat()
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_valuation(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_valuation")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            val_area = (row.get('valuation_area') or row.get('BWKEY') or '').strip()
            if not mat or not val_area:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_valuation
                    (material_number, valuation_area, price_control, standard_price, moving_avg_price, total_stock, total_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    mat, val_area,
                    row.get('price_control') or row.get('VPRSV') or '',
                    float(row.get('standard_price') or row.get('STPRS') or 0),
                    float(row.get('moving_avg_price') or row.get('VERPR') or 0),
                    float(row.get('total_stock') or row.get('LBKUM') or 0),
                    float(row.get('total_value') or row.get('SALK3') or 0),
                    datetime.now().isoformat()
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_snapshot(session_id: int, rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_snapshot WHERE session_id = ?", (session_id,))
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            sloc = (row.get('sloc') or row.get('LGORT') or '').strip()
            if not mat or not sloc:
                continue
            try:
                db.insert("""
                    INSERT INTO sap_snapshot (session_id, material_number, sloc, sap_quantity, uom)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    session_id, mat, sloc,
                    float(row.get('sap_quantity') or row.get('quantity') or row.get('LABST') or 0),
                    row.get('uom') or row.get('MEINS') or ''
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_mlgt(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_mlgt")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            val_area = (row.get('valuation_area') or row.get('BWKEY') or '').strip()
            if not mat or not plant or not val_area:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_mlgt
                    (material_number, plant, valuation_area, gl_account, currency, amount, quantity)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    mat, plant, val_area,
                    row.get('gl_account') or row.get('KONTO') or '',
                    row.get('currency') or row.get('WAERS') or '',
                    float(row.get('amount') or row.get('DMBTR') or 0),
                    float(row.get('quantity') or row.get('MENGE') or 0)
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_mlgn(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_mlgn")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            if not mat or not plant:
                continue
            try:
                db.insert("""
                    INSERT INTO sap_mlgn
                    (material_number, plant, document_number, item_number, posting_date, document_type, quantity, value)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    mat, plant,
                    row.get('document_number') or row.get('DOCNUM') or '',
                    row.get('item_number') or row.get('ITEMNUM') or '',
                    row.get('posting_date') or row.get('BUDAT') or '',
                    row.get('document_type') or row.get('DOCTYPE') or '',
                    float(row.get('quantity') or row.get('MENGE') or 0),
                    float(row.get('value') or row.get('DMBTR') or 0)
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_storage_locations(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_storage_locations")
        count = 0
        for row in rows:
            code = (row.get('code') or row.get('LGORT') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            if not code or not plant:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_storage_locations (code, plant, description, storage_type)
                    VALUES (?, ?, ?, ?)
                """, (
                    code, plant,
                    row.get('description') or row.get('LGOBE') or '',
                    row.get('storage_type') or row.get('LOTYP') or ''
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_lgap(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_lgap")
        count = 0
        for row in rows:
            bin_code = (row.get('bin_code') or row.get('LGPLA') or row.get('BINID') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            sloc = (row.get('storage_location') or row.get('LGORT') or '').strip()
            if not bin_code or not plant or not sloc:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_lgap
                    (bin_code, plant, storage_location, bin_type, storage_type, description, capacity_qty, capacity_uom)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    bin_code, plant, sloc,
                    row.get('bin_type') or row.get('LGTYP') or row.get('BINTYPE') or '',
                    row.get('storage_type') or row.get('LGTYP') or row.get('LOTYP') or '',
                    row.get('description') or row.get('LGPLT') or row.get('BINTEXT') or '',
                    float(row.get('capacity_qty') or row.get('MAXKG') or 0) if row.get('capacity_qty') or row.get('MAXKG') else None,
                    row.get('capacity_uom') or row.get('MEINS') or ''
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_mseg(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_mseg")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            plant = (row.get('plant') or row.get('WERKS') or '').strip()
            mvtype = (row.get('movement_type') or row.get('BWART') or '').strip()
            if not mat or not plant or not mvtype:
                continue
            try:
                db.insert("""
                    INSERT INTO sap_mseg
                    (material_number, plant, document_number, year_number, line_item, storage_location,
                     movement_type, posting_date, quantity, aufnr, ebeln, ebelp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    mat, plant,
                    row.get('document_number') or row.get('MBLNR') or '',
                    row.get('year_number') or row.get('MJAHR') or '',
                    row.get('line_item') or row.get('ZEILE') or '',
                    row.get('storage_location') or row.get('LGORT') or '',
                    mvtype,
                    row.get('posting_date') or row.get('BUDAT') or '',
                    float(row.get('quantity') or row.get('MENGE') or 0),
                    row.get('aufnr') or row.get('AUFNR') or '',
                    row.get('ebeln') or row.get('EBELN') or '',
                    row.get('ebelp') or row.get('EBELP') or '',
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_lgplo(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_lgplo")
        count = 0
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            lgnum = (row.get('warehouse_number') or row.get('LGNUM') or '').strip()
            lgtyp = (row.get('storage_type') or row.get('LGTYP') or '').strip()
            lgpla = (row.get('fixed_bin') or row.get('LGPLA') or '').strip()
            if not mat or not lgnum or not lgtyp or not lgpla:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_lgplo
                    (material_number, warehouse_number, storage_type, fixed_bin)
                    VALUES (?, ?, ?, ?)
                """, (mat, lgnum, lgtyp, lgpla))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def _raw_data(row: Dict, known: set) -> str:
        extra = {k: v for k, v in row.items() if k.upper() not in known and k not in known}
        return json.dumps(extra) if extra else ''

    @staticmethod
    def import_lqua(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_lqua")
        count = 0
        _KNOWN = {'LGNUM','LGTYP','LGPLA','LQNUM','MATNR','WERKS','LGORT','CHARG','BESTQ','SOBKZ','VERME','MENGE','MEINS',
                  'lgnum','lgtyp','lgpla','lqnum','material_number','plant','storage_location','batch','stock_category','special_stock',
                  'available_qty','total_qty','uom'}
        for row in rows:
            mat = (row.get('material_number') or row.get('MATNR') or '').strip()
            if not mat:
                continue
            try:
                db.insert("""
                    INSERT INTO sap_lqua
                    (lgnum, lgtyp, lgpla, lqnum, matnr, werks, lgort, charg, bestq, sobkz, verme, menge, meins, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    row.get('lgnum') or row.get('LGNUM') or '',
                    row.get('lgtyp') or row.get('LGTYP') or '',
                    row.get('lgpla') or row.get('LGPLA') or '',
                    row.get('lqnum') or row.get('LQNUM') or '',
                    mat,
                    row.get('plant') or row.get('WERKS') or '',
                    row.get('storage_location') or row.get('LGORT') or '',
                    row.get('batch') or row.get('CHARG') or '',
                    row.get('stock_category') or row.get('BESTQ') or '',
                    row.get('special_stock') or row.get('SOBKZ') or '',
                    float(row.get('available_qty') or row.get('VERME') or row.get('verme') or 0),
                    float(row.get('total_qty') or row.get('MENGE') or row.get('menge') or 0),
                    row.get('uom') or row.get('MEINS') or '',
                    ImportService._raw_data(row, _KNOWN),
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_ekko(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_ekko")
        count = 0
        _KNOWN = {'EBELN','BSTYP','BSART','LOEKZ','STATUS','AEDAT','ERDAT','ERNAM','LIFNR','ZTERM','EKGRP','BUKRS','BEDAT','KDATB','KDATE',
                  'ebeln','doc_type','doc_category','deletion_flag','status','change_date','create_date','created_by','vendor','payment_terms',
                  'purchasing_group','company_code','doc_date','validity_start','validity_end'}
        for row in rows:
            ebeln = (row.get('ebeln') or row.get('EBELN') or row.get('po_number') or '').strip()
            if not ebeln:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_ekko
                    (ebeln, bstyp, bsart, loekz, status, aedat, erdat, ernam, lifnr, zterm, ekgrp, bukrs, bedat, kdatb, kdate, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ebeln,
                    row.get('bstyp') or row.get('BSTYP') or row.get('doc_category') or '',
                    row.get('bsart') or row.get('BSART') or row.get('doc_type') or '',
                    row.get('loekz') or row.get('LOEKZ') or row.get('deletion_flag') or '',
                    row.get('status') or row.get('STATUS') or '',
                    row.get('aedat') or row.get('AEDAT') or row.get('change_date') or '',
                    row.get('erdat') or row.get('ERDAT') or row.get('create_date') or '',
                    row.get('ernam') or row.get('ERNAM') or row.get('created_by') or '',
                    row.get('lifnr') or row.get('LIFNR') or row.get('vendor') or '',
                    row.get('zterm') or row.get('ZTERM') or row.get('payment_terms') or '',
                    row.get('ekgrp') or row.get('EKGRP') or row.get('purchasing_group') or '',
                    row.get('bukrs') or row.get('BUKRS') or row.get('company_code') or '',
                    row.get('bedat') or row.get('BEDAT') or row.get('doc_date') or '',
                    row.get('kdatb') or row.get('KDATB') or row.get('validity_start') or '',
                    row.get('kdate') or row.get('KDATE') or row.get('validity_end') or '',
                    ImportService._raw_data(row, _KNOWN),
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_ekpo(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_ekpo")
        count = 0
        _KNOWN = {'EBELN','EBELP','LOEKZ','STATU','AEDAT','TXZ01','MATNR','EMATN','BUKRS','WERKS','LGORT','MATKL','MENGE','MEINS',
                  'NETPR','PEINH','NETWR','BRTWR','BSTAE','ELIKZ','EREKZ',
                  'ebeln','ebelp','deletion_flag','status','change_date','short_text','material_number','ematn','company_code','plant',
                  'storage_location','material_group','order_qty','uom','net_price','price_unit','net_value','gross_value','po_quantity',
                  'delivery_completed','final_invoice'}
        for row in rows:
            ebeln = (row.get('ebeln') or row.get('EBELN') or row.get('po_number') or '').strip()
            ebelp = (row.get('ebelp') or row.get('EBELP') or row.get('po_item') or '').strip()
            if not ebeln or not ebelp:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_ekpo
                    (ebeln, ebelp, loekz, statu, aedat, txz01, matnr, ematn, bukrs, werks, lgort, matkl,
                     menge, meins, netpr, peinh, netwr, brtwr, bstae, elikz, erekz, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ebeln, ebelp,
                    row.get('loekz') or row.get('LOEKZ') or row.get('deletion_flag') or '',
                    row.get('statu') or row.get('STATU') or row.get('status') or '',
                    row.get('aedat') or row.get('AEDAT') or row.get('change_date') or '',
                    row.get('txz01') or row.get('TXZ01') or row.get('short_text') or '',
                    (row.get('matnr') or row.get('MATNR') or row.get('material_number') or '').strip(),
                    row.get('ematn') or row.get('EMATN') or '',
                    row.get('bukrs') or row.get('BUKRS') or row.get('company_code') or '',
                    row.get('werks') or row.get('WERKS') or row.get('plant') or '',
                    row.get('lgort') or row.get('LGORT') or row.get('storage_location') or '',
                    row.get('matkl') or row.get('MATKL') or row.get('material_group') or '',
                    float(row.get('menge') or row.get('MENGE') or row.get('order_qty') or row.get('po_quantity') or 0),
                    row.get('meins') or row.get('MEINS') or row.get('uom') or '',
                    float(row.get('netpr') or row.get('NETPR') or row.get('net_price') or 0),
                    float(row.get('peinh') or row.get('PEINH') or row.get('price_unit') or 0),
                    float(row.get('netwr') or row.get('NETWR') or row.get('net_value') or 0),
                    float(row.get('brtwr') or row.get('BRTWR') or row.get('gross_value') or 0),
                    row.get('bstae') or row.get('BSTAE') or '',
                    row.get('elikz') or row.get('ELIKZ') or row.get('delivery_completed') or '',
                    row.get('erekz') or row.get('EREKZ') or row.get('final_invoice') or '',
                    ImportService._raw_data(row, _KNOWN),
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_aufk(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_aufk")
        count = 0
        _KNOWN = {'AUFNR','AUART','WERKS','BUKRS','KTEXT','ERDAT','ERNAM','GSTRP','GLTRP','FTRMI','MATNR','GAMNG','GMEIN','WEMNG',
                  'LGORT','SYSST','LOEKZ',
                  'aufnr','order_number','order_type','plant','company_code','description','create_date','created_by',
                  'basic_start','basic_finish','scheduled_finish','material_number','order_qty','uom','delivered_qty',
                  'storage_location','system_status','deletion_flag'}
        for row in rows:
            aufnr = (row.get('aufnr') or row.get('AUFNR') or row.get('order_number') or '').strip()
            if not aufnr:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_aufk
                    (aufnr, auart, werks, bukrs, ktext, erdat, ernam, gstrp, gltrp, ftrmi,
                     matnr, gamng, gmein, wemng, lgort, sysst, loekz, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    aufnr,
                    row.get('auart') or row.get('AUART') or row.get('order_type') or '',
                    row.get('werks') or row.get('WERKS') or row.get('plant') or '',
                    row.get('bukrs') or row.get('BUKRS') or row.get('company_code') or '',
                    row.get('ktext') or row.get('KTEXT') or row.get('description') or '',
                    row.get('erdat') or row.get('ERDAT') or row.get('create_date') or '',
                    row.get('ernam') or row.get('ERNAM') or row.get('created_by') or '',
                    row.get('gstrp') or row.get('GSTRP') or row.get('basic_start') or '',
                    row.get('gltrp') or row.get('GLTRP') or row.get('basic_finish') or '',
                    row.get('ftrmi') or row.get('FTRMI') or row.get('scheduled_finish') or '',
                    (row.get('matnr') or row.get('MATNR') or row.get('material_number') or '').strip(),
                    float(row.get('gamng') or row.get('GAMNG') or row.get('order_qty') or 0),
                    row.get('gmein') or row.get('GMEIN') or row.get('uom') or '',
                    float(row.get('wemng') or row.get('WEMNG') or row.get('delivered_qty') or 0),
                    row.get('lgort') or row.get('LGORT') or row.get('storage_location') or '',
                    row.get('sysst') or row.get('SYSST') or row.get('system_status') or '',
                    row.get('loekz') or row.get('LOEKZ') or row.get('deletion_flag') or '',
                    ImportService._raw_data(row, _KNOWN),
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_resb(rows: List[Dict]) -> int:
        db.execute("DELETE FROM sap_resb")
        count = 0
        _KNOWN = {'RSNUM','RSPOS','RSART','MATNR','WERKS','LGORT','BDMNG','ENMNG','BDTER','AUFNR','EBELN','KZEAR','SOBKZ','BWART',
                  'rsnum','rspos','reservation_type','material_number','plant','storage_location','required_qty','withdrawn_qty',
                  'requirement_date','production_order','purchase_order','final_issue','special_stock','movement_type'}
        for row in rows:
            rsnum = (row.get('rsnum') or row.get('RSNUM') or '').strip()
            rspos = (row.get('rspos') or row.get('RSPOS') or '').strip()
            mat = (row.get('matnr') or row.get('MATNR') or row.get('material_number') or '').strip()
            if not rsnum or not rspos or not mat:
                continue
            try:
                db.insert("""
                    INSERT OR REPLACE INTO sap_resb
                    (rsnum, rspos, rsart, matnr, werks, lgort, bdmng, enmng, bdter, aufnr, ebeln, kzear, sobkz, bwart, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    rsnum, rspos,
                    row.get('rsart') or row.get('RSART') or row.get('reservation_type') or '',
                    mat,
                    row.get('werks') or row.get('WERKS') or row.get('plant') or '',
                    row.get('lgort') or row.get('LGORT') or row.get('storage_location') or '',
                    float(row.get('bdmng') or row.get('BDMNG') or row.get('required_qty') or 0),
                    float(row.get('enmng') or row.get('ENMNG') or row.get('withdrawn_qty') or 0),
                    row.get('bdter') or row.get('BDTER') or row.get('requirement_date') or '',
                    row.get('aufnr') or row.get('AUFNR') or row.get('production_order') or '',
                    row.get('ebeln') or row.get('EBELN') or row.get('purchase_order') or '',
                    row.get('kzear') or row.get('KZEAR') or row.get('final_issue') or '',
                    row.get('sobkz') or row.get('SOBKZ') or row.get('special_stock') or '',
                    row.get('bwart') or row.get('BWART') or row.get('movement_type') or '',
                    ImportService._raw_data(row, _KNOWN),
                ))
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def import_exclusions(rows: List[Dict]) -> int:
        db.execute("DELETE FROM material_exclusions")
        count = 0
        for row in rows:
            matnr = (row.get('MATNR') or row.get('matnr') or row.get('material_number') or row.get('material') or '').strip().lstrip('0')
            reason = (row.get('reason') or row.get('REASON') or row.get('note') or row.get('NOTE') or row.get('text') or '').strip()
            if not matnr:
                continue
            try:
                db.insert(
                    "INSERT OR REPLACE INTO material_exclusions (material_number, reason) VALUES (?, ?)",
                    (matnr, reason)
                )
                count += 1
            except Exception:
                continue
        return count

    @staticmethod
    def get_adjustment_export(session_id: int) -> List[Dict]:
        """Final SAP adjustment list: materials where counted qty differs from snapshot, excluding the exclusion list."""
        rows = db.fetch_all("""
            SELECT
                s.material_number,
                COALESCE(mat.description, '') AS description,
                COALESCE(m.plant, '')          AS plant,
                s.sloc,
                COALESCE(s.uom, '')            AS uom,
                s.sap_quantity                 AS snapshot_qty,
                COALESCE(SUM(c.quantity), 0)   AS counted_qty,
                COALESCE(SUM(c.quantity), 0) - s.sap_quantity AS adjustment
            FROM sap_snapshot s
            LEFT JOIN counts c ON c.material_number = s.material_number
                               AND c.sloc = s.sloc
                               AND c.session_id = ?
                               AND c.status NOT IN ('deleted', 'flagged')
            LEFT JOIN sap_materials mat ON mat.material_number = s.material_number
            LEFT JOIN sap_mard m ON m.material_number = s.material_number
                                 AND m.storage_location = s.sloc
            WHERE s.session_id = ?
              AND s.material_number NOT IN (SELECT material_number FROM material_exclusions)
            GROUP BY s.material_number, s.sloc
            HAVING COUNT(c.id) > 0
               AND ABS(COALESCE(SUM(c.quantity), 0) - s.sap_quantity) > 0.0001
            ORDER BY s.sloc, s.material_number
        """, (session_id, session_id))
        return [dict(r) for r in rows]

    @staticmethod
    def get_excluded_materials() -> List[Dict]:
        rows = db.fetch_all("SELECT material_number, reason, uploaded_at FROM material_exclusions ORDER BY material_number")
        return [dict(r) for r in rows]


class OrderValidationService:
    @staticmethod
    def get_material_warnings(material_number: str) -> Dict[str, Any]:
        mat = material_number.strip().upper()

        # Open purchase orders: EKPO rows for this material not marked delivery-complete
        open_pos = db.fetch_all("""
            SELECT p.ebeln, p.ebelp, p.menge, p.meins, p.werks, p.lgort,
                   p.txz01, h.lifnr, h.bedat,
                   COALESCE(gr.gr_qty, 0) as gr_qty,
                   (p.menge - COALESCE(gr.gr_qty, 0)) as open_qty
            FROM sap_ekpo p
            LEFT JOIN sap_ekko h ON h.ebeln = p.ebeln
            LEFT JOIN (
                SELECT ebeln, ebelp, SUM(quantity) as gr_qty
                FROM sap_mseg
                WHERE movement_type IN ('101','161') AND ebeln != ''
                GROUP BY ebeln, ebelp
            ) gr ON gr.ebeln = p.ebeln AND gr.ebelp = p.ebelp
            WHERE p.matnr = ?
              AND (p.loekz IS NULL OR p.loekz = '')
              AND (p.elikz IS NULL OR p.elikz = '')
              AND (p.menge - COALESCE(gr.gr_qty, 0)) > 0
        """, (mat,))

        # Open production orders: AUFK rows for this material not technically complete
        open_orders = db.fetch_all("""
            SELECT a.aufnr, a.auart, a.ktext, a.werks, a.lgort,
                   a.gamng, a.gmein, a.wemng, a.gstrp, a.gltrp, a.sysst,
                   (a.gamng - COALESCE(a.wemng, 0)) as open_qty
            FROM sap_aufk a
            WHERE a.matnr = ?
              AND (a.loekz IS NULL OR a.loekz = '')
              AND (a.sysst NOT LIKE '%TECO%' AND a.sysst NOT LIKE '%CLSD%')
              AND (a.gamng - COALESCE(a.wemng, 0)) > 0
        """, (mat,))

        # Open reservations: RESB rows not fully issued
        open_resb = db.fetch_all("""
            SELECT rsnum, rspos, rsart, werks, lgort, bdmng, enmng,
                   (bdmng - COALESCE(enmng, 0)) as remaining_qty,
                   aufnr, ebeln, bdter, bwart
            FROM sap_resb
            WHERE matnr = ?
              AND (kzear IS NULL OR kzear = '')
              AND (bdmng - COALESCE(enmng, 0)) > 0
        """, (mat,))

        return {
            'open_pos': [dict(r) for r in open_pos],
            'open_orders': [dict(r) for r in open_orders],
            'open_reservations': [dict(r) for r in open_resb],
            'has_open_pos': len(open_pos) > 0,
            'has_open_orders': len(open_orders) > 0,
            'has_open_reservations': len(open_resb) > 0,
        }

    @staticmethod
    def get_counts_over_snapshot(session_id: int) -> List[Dict]:
        rows = db.fetch_all("""
            SELECT
                s.material_number,
                s.sloc,
                s.sap_quantity     AS snapshot_qty,
                s.uom,
                COALESCE(m.unrestricted_qty, 0) AS mard_qty,
                COALESCE(SUM(c.quantity), 0)    AS counted_qty,
                COALESCE(SUM(c.quantity), 0) - s.sap_quantity AS variance,
                mat.description,
                v.standard_price,
                v.moving_avg_price,
                v.total_value,
                (SELECT COUNT(*) FROM sap_resb r WHERE r.matnr = s.material_number
                 AND (r.kzear IS NULL OR r.kzear = '')
                 AND (r.bdmng - COALESCE(r.enmng,0)) > 0) AS open_reservation_count,
                (SELECT COUNT(*) FROM sap_ekpo p WHERE p.matnr = s.material_number
                 AND (p.loekz IS NULL OR p.loekz = '')
                 AND (p.elikz IS NULL OR p.elikz = '')) AS open_po_count,
                (SELECT COUNT(*) FROM sap_aufk a WHERE a.matnr = s.material_number
                 AND (a.loekz IS NULL OR a.loekz = '')
                 AND (a.sysst NOT LIKE '%TECO%' AND a.sysst NOT LIKE '%CLSD%')) AS open_order_count
            FROM sap_snapshot s
            LEFT JOIN sap_mard m ON m.material_number = s.material_number
                                 AND m.storage_location = s.sloc
            LEFT JOIN counts c ON c.material_number = s.material_number
                               AND c.sloc = s.sloc
                               AND c.session_id = ?
                               AND c.status != 'deleted'
            LEFT JOIN sap_materials mat ON mat.material_number = s.material_number
            LEFT JOIN sap_valuation v ON v.material_number = s.material_number
            WHERE s.session_id = ?
            GROUP BY s.material_number, s.sloc
            HAVING COALESCE(SUM(c.quantity), 0) > s.sap_quantity
            ORDER BY variance DESC
        """, (session_id, session_id))
        return [dict(r) for r in rows]

    @staticmethod
    def get_wm_discrepancies(session_id: int) -> List[Dict]:
        rows = db.fetch_all("""
            SELECT
                c.material_number,
                c.wm_bin          AS counted_bin,
                c.sloc,
                SUM(c.quantity)   AS counted_qty,
                c.username,
                mat.description,
                COALESCE(q.verme, 0) AS lqua_available,
                COALESCE(q.menge, 0) AS lqua_total,
                q.lgtyp,
                ABS(SUM(c.quantity) - COALESCE(q.verme, 0)) AS discrepancy
            FROM counts c
            LEFT JOIN sap_materials mat ON mat.material_number = c.material_number
            LEFT JOIN sap_lqua q ON q.matnr = c.material_number
                                 AND q.lgpla = c.wm_bin
            WHERE c.session_id = ?
              AND c.wm_bin IS NOT NULL
              AND c.wm_bin != ''
              AND c.status != 'deleted'
            GROUP BY c.material_number, c.wm_bin, c.sloc
            HAVING ABS(SUM(c.quantity) - COALESCE(q.verme, 0)) > 0
               OR q.verme IS NULL
            ORDER BY discrepancy DESC
        """, (session_id,))
        return [dict(r) for r in rows]

    @staticmethod
    def get_reservation_output_warnings(session_id: int) -> List[Dict]:
        """Materials where counted qty is LESS than snapshot AND open reservations exist — risk of over-adjusting stock out."""
        rows = db.fetch_all("""
            SELECT
                s.material_number,
                s.sloc,
                s.sap_quantity     AS snapshot_qty,
                COALESCE(SUM(c.quantity), 0) AS counted_qty,
                s.sap_quantity - COALESCE(SUM(c.quantity), 0) AS shortage,
                mat.description,
                GROUP_CONCAT(r.rsnum || '/' || r.rspos || ' (' || r.aufnr || ')') AS reservations,
                SUM(r.bdmng - COALESCE(r.enmng, 0)) AS total_reserved_qty
            FROM sap_snapshot s
            LEFT JOIN counts c ON c.material_number = s.material_number
                               AND c.sloc = s.sloc
                               AND c.session_id = ?
                               AND c.status != 'deleted'
            LEFT JOIN sap_materials mat ON mat.material_number = s.material_number
            LEFT JOIN sap_resb r ON r.matnr = s.material_number
                                 AND (r.kzear IS NULL OR r.kzear = '')
                                 AND (r.bdmng - COALESCE(r.enmng,0)) > 0
            WHERE s.session_id = ?
            GROUP BY s.material_number, s.sloc
            HAVING COALESCE(SUM(c.quantity), 0) < s.sap_quantity
               AND total_reserved_qty > 0
            ORDER BY shortage DESC
        """, (session_id, session_id))
        return [dict(r) for r in rows]


class DashboardService:
    @staticmethod
    def get_session_summary(session_id: int) -> Dict[str, Any]:
        # Count totals by status
        totals_row = db.fetch_one("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged
            FROM counts WHERE session_id = ?
        """, (session_id,))

        totals = {
            'total': (totals_row['total'] or 0) if totals_row else 0,
            'pending': (totals_row['pending'] or 0) if totals_row else 0,
            'verified': (totals_row['verified'] or 0) if totals_row else 0,
            'flagged': (totals_row['flagged'] or 0) if totals_row else 0,
        }

        # First pass yield: verified counts that were never edited
        first_pass = db.fetch_one("""
            SELECT COUNT(*) as count
            FROM counts c
            WHERE session_id = ? AND status = 'verified'
            AND NOT EXISTS (
                SELECT 1 FROM audit_log al
                WHERE al.count_id = c.id AND al.event_type = 'edit'
            )
        """, (session_id,))
        first_pass_count = (first_pass['count'] or 0) if first_pass else 0
        first_pass_yield = (
            round((first_pass_count / totals['verified']) * 100, 1)
            if totals['verified'] > 0 else None
        )

        # Snapshot info
        snapshot_row = db.fetch_one(
            "SELECT COUNT(*) as total FROM sap_snapshot WHERE session_id = ?",
            (session_id,)
        )
        snapshot_total = (snapshot_row['total'] or 0) if snapshot_row else 0
        snapshot_loaded = snapshot_total > 0

        snapshot_counted = 0
        if snapshot_loaded:
            counted_row = db.fetch_one("""
                SELECT COUNT(DISTINCT material_number || '|' || sloc) as counted
                FROM counts WHERE session_id = ?
            """, (session_id,))
            snapshot_counted = (counted_row['counted'] or 0) if counted_row else 0

        # Open (unanswered) question threads
        unread_row = db.fetch_one(
            "SELECT COUNT(*) as count FROM message_threads WHERE session_id = ? AND answered = 0",
            (session_id,)
        )
        unread_messages = (unread_row['count'] or 0) if unread_row else 0

        # SLOC breakdown
        sloc_rows = db.fetch_all("""
            SELECT
                sloc,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged
            FROM counts WHERE session_id = ?
            GROUP BY sloc ORDER BY total DESC
        """, (session_id,))

        # Counter activity
        counter_rows = db.fetch_all("""
            SELECT
                username,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged,
                MIN(created_at) as first_count,
                MAX(created_at) as last_count
            FROM counts WHERE session_id = ?
            GROUP BY username ORDER BY last_count DESC
        """, (session_id,))

        # Count trend last 24h by hour
        trend_rows = db.fetch_all("""
            SELECT
                strftime('%Y-%m-%dT%H:00', created_at) as hour,
                COUNT(*) as count
            FROM counts WHERE session_id = ?
            AND created_at >= datetime('now', '-24 hours')
            GROUP BY hour ORDER BY hour
        """, (session_id,))

        return {
            'session_id': session_id,
            'totals': totals,
            'first_pass_yield': first_pass_yield,
            'first_pass_count': first_pass_count,
            'snapshot_loaded': snapshot_loaded,
            'snapshot_total': snapshot_total,
            'snapshot_counted': snapshot_counted,
            'unread_messages': unread_messages,
            'sloc_breakdown': sloc_rows,
            'counter_activity': counter_rows,
            'count_trend': trend_rows,
        }

    @staticmethod
    def get_material_summary(session_id: int) -> List[Dict]:
        rows = db.fetch_all("""
            SELECT
                s.material_number,
                m.description,
                s.sloc,
                s.sap_quantity,
                COALESCE(SUM(c.quantity), 0) as counted_qty,
                COUNT(c.id) as submission_count,
                MAX(c.status) as count_status,
                (COALESCE(SUM(c.quantity), 0) - s.sap_quantity) as variance,
                v.total_value
            FROM sap_snapshot s
            LEFT JOIN sap_materials m ON s.material_number = m.material_number
            LEFT JOIN counts c ON c.session_id = s.session_id
                AND c.material_number = s.material_number
                AND c.sloc = s.sloc
            LEFT JOIN sap_valuation v ON v.material_number = s.material_number
            WHERE s.session_id = ?
            GROUP BY s.material_number, s.sloc
            ORDER BY s.material_number
        """, (session_id,))

        result = []
        for row in rows:
            sub_count = row['submission_count'] or 0
            if sub_count == 0:
                derived = 'not_counted'
            elif row['count_status'] == 'flagged':
                derived = 'flagged'
            elif row['count_status'] == 'verified':
                derived = 'variance' if (row['variance'] or 0) != 0 else 'verified'
            else:
                derived = 'pending'

            result.append({
                'material_number': row['material_number'],
                'description': row['description'],
                'sloc': row['sloc'],
                'sap_quantity': row['sap_quantity'] or 0,
                'counted_qty': row['counted_qty'] or 0,
                'count_status': row['count_status'],
                'submission_count': sub_count,
                'variance': row['variance'] or 0,
                'total_value': row['total_value'],
                'derived_status': derived,
            })
        return result

    @staticmethod
    def get_user_summary(session_id: int) -> List[Dict]:
        return db.fetch_all("""
            SELECT
                username,
                COUNT(*) as total_counts,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_counts,
                COUNT(DISTINCT material_number) as unique_materials
            FROM counts
            WHERE session_id = ?
            GROUP BY username ORDER BY total_counts DESC
        """, (session_id,))

    @staticmethod
    def get_discrepancies(session_id: int) -> List[Dict]:
        return db.fetch_all("""
            SELECT
                s.sloc,
                SUM(s.sap_quantity) as sap_total,
                COALESCE(SUM(c.quantity), 0) as counted_total,
                COUNT(DISTINCT s.material_number) as material_count,
                COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN s.material_number END) as counted_materials
            FROM sap_snapshot s
            LEFT JOIN counts c ON c.session_id = s.session_id
                AND c.material_number = s.material_number
                AND c.sloc = s.sloc
            WHERE s.session_id = ?
            GROUP BY s.sloc
            ORDER BY ABS(COALESCE(SUM(c.quantity), 0) - SUM(s.sap_quantity)) DESC
        """, (session_id,))

    @staticmethod
    def get_problem_materials() -> List[Dict]:
        return db.fetch_all("""
            SELECT
                m.material_number,
                sm.description,
                COUNT(*) as movement_count,
                SUM(CASE WHEN m.movement_type IN ('911','912') THEN 1 ELSE 0 END) as adj_count,
                SUM(CASE WHEN m.movement_type = '309' THEN 1 ELSE 0 END) as transfer_count,
                SUM(CASE WHEN m.movement_type IN ('201','202','221','222') THEN 1 ELSE 0 END) as issue_count,
                MAX(m.posting_date) as last_movement,
                GROUP_CONCAT(DISTINCT m.movement_type) as movement_types
            FROM sap_mseg m
            LEFT JOIN sap_materials sm ON sm.material_number = m.material_number
            GROUP BY m.material_number
            HAVING adj_count >= 2 OR movement_count >= 5
            ORDER BY adj_count DESC, movement_count DESC
            LIMIT 50
        """)

    @staticmethod
    def get_high_value_materials(session_id: int) -> List[Dict]:
        return db.fetch_all("""
            SELECT
                v.material_number,
                sm.description,
                v.total_value,
                v.total_stock,
                COALESCE(c.status, 'not_counted') as status,
                c.quantity as counted_qty
            FROM sap_valuation v
            LEFT JOIN sap_materials sm ON sm.material_number = v.material_number
            LEFT JOIN (
                SELECT material_number, status, quantity,
                       ROW_NUMBER() OVER (PARTITION BY material_number ORDER BY updated_at DESC) as rn
                FROM counts WHERE session_id = ?
            ) c ON c.material_number = v.material_number AND c.rn = 1
            WHERE v.total_value > 0
            ORDER BY v.total_value DESC
            LIMIT 20
        """, (session_id,))


class ThreadService:
    @staticmethod
    def create_thread(session_id: int, title: str, created_by: str, created_by_role: str, count_id: Optional[int] = None) -> int:
        return db.insert(
            """INSERT INTO message_threads (session_id, count_id, title, created_by, created_by_role)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, count_id, title, created_by, created_by_role)
        )

    @staticmethod
    def get_threads(session_id: int, username: str, role: str) -> List[Dict]:
        if role == 'counter':
            rows = db.fetch_all("""
                SELECT mt.*, COUNT(m.id) as message_count
                FROM message_threads mt
                LEFT JOIN messages m ON mt.id = m.thread_id
                WHERE mt.session_id = ?
                  AND (
                    mt.created_by = ? COLLATE NOCASE
                    OR EXISTS (SELECT 1 FROM counts c WHERE c.id = mt.count_id AND c.username = ? COLLATE NOCASE)
                  )
                GROUP BY mt.id
                ORDER BY mt.created_at DESC
            """, (session_id, username, username))
        else:
            rows = db.fetch_all("""
                SELECT mt.*, COUNT(m.id) as message_count
                FROM message_threads mt
                LEFT JOIN messages m ON mt.id = m.thread_id
                WHERE mt.session_id = ?
                GROUP BY mt.id
                ORDER BY mt.answered ASC, mt.created_at DESC
            """, (session_id,))
        return rows

    @staticmethod
    def get_thread(thread_id: int) -> Optional[Dict]:
        return db.fetch_one("SELECT * FROM message_threads WHERE id = ?", (thread_id,))

    @staticmethod
    def get_thread_messages(thread_id: int) -> List[Dict]:
        return db.fetch_all("""
            SELECT m.*,
                   r.sender   AS reply_to_sender,
                   SUBSTR(r.body, 1, 200) AS reply_to_body
            FROM messages m
            LEFT JOIN messages r ON m.reply_to_id = r.id
            WHERE m.thread_id = ?
            ORDER BY m.sent_at ASC
        """, (thread_id,))

    @staticmethod
    def post_message(thread_id: int, sender: str, role: str, body: str, reply_to_id: Optional[int] = None) -> Dict:
        thread = db.fetch_one("SELECT session_id FROM message_threads WHERE id = ?", (thread_id,))
        if not thread:
            raise ValueError("Thread not found")
        msg_id = db.insert(
            "INSERT INTO messages (thread_id, session_id, sender, role, body, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)",
            (thread_id, thread['session_id'], sender, role, body, reply_to_id)
        )
        if role == 'admin':
            db.execute(
                "UPDATE message_threads SET answered = 1, answered_by = ?, answered_at = datetime('now') WHERE id = ?",
                (sender, thread_id)
            )
        row = db.fetch_one("""
            SELECT m.*, r.sender AS reply_to_sender, SUBSTR(r.body, 1, 200) AS reply_to_body
            FROM messages m LEFT JOIN messages r ON m.reply_to_id = r.id
            WHERE m.id = ?
        """, (msg_id,))
        return row
