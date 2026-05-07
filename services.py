from datetime import datetime
from typing import List, Dict, Optional, Any
from database import db
from werkzeug.security import generate_password_hash, check_password_hash


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
    ) -> int:
        count_id = db.insert(
            """
            INSERT INTO counts (session_id, username, material_number, quantity, sloc, wm_bin, zbin, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, username, material_number, quantity, sloc, wm_bin, zbin, 'pending')
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

        query += " ORDER BY created_at DESC"
        return db.fetch_all(query, tuple(params))

    @staticmethod
    def update_count(
        count_id: int,
        editor_username: str,
        **updates
    ) -> None:
        count = CountService.get_count(count_id)
        if not count:
            return

        for field, new_value in updates.items():
            if field in ['quantity', 'wm_bin', 'zbin', 'status']:
                old_value = count.get(field)
                if old_value != new_value:
                    db.execute(
                        f"UPDATE counts SET {field} = ?, updated_at = ? WHERE id = ?",
                        (new_value, datetime.now().isoformat(), count_id)
                    )
                    AuditService.log_event(
                        count_id, editor_username, 'edit',
                        field, str(old_value), str(new_value)
                    )

    @staticmethod
    def verify_count(count_id: int, editor_username: str) -> None:
        CountService.update_count(count_id, editor_username, status='verified')

    @staticmethod
    def flag_count(count_id: int, editor_username: str, reason: str) -> None:
        db.execute(
            "UPDATE counts SET status = ? WHERE id = ?",
            ('flagged', count_id)
        )
        AuditService.log_event(count_id, editor_username, 'flag', None, None, None, reason)


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
        db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))


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
    def get_messages(session_id: int, count_id: Optional[int] = None) -> List[Dict]:
        if count_id:
            return db.fetch_all(
                "SELECT * FROM messages WHERE session_id = ? AND count_id = ? ORDER BY sent_at ASC",
                (session_id, count_id)
            )
        return db.fetch_all(
            "SELECT * FROM messages WHERE session_id = ? AND count_id IS NULL ORDER BY sent_at ASC",
            (session_id,)
        )


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
            SELECT a.* FROM audit_log a
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
        return db.fetch_all("SELECT id, username, role, created_at FROM users ORDER BY username ASC")

    @staticmethod
    def update_user_role(username: str, role: str) -> None:
        db.execute(
            "UPDATE users SET role = ? WHERE LOWER(username) = LOWER(?)",
            (role, username)
        )


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


class MaterialService:
    @staticmethod
    def create_or_update_material(material_number: str, description: str = "", base_uom: str = "", material_type: str = "", material_group: str = "") -> None:
        existing = db.fetch_one(
            "SELECT * FROM sap_materials WHERE material_number = ?",
            (material_number,)
        )
        if existing:
            db.execute(
                """
                UPDATE sap_materials
                SET description = ?, base_uom = ?, material_type = ?, material_group = ?, updated_at = ?
                WHERE material_number = ?
                """,
                (description, base_uom, material_type, material_group, datetime.now().isoformat(), material_number)
            )
        else:
            db.insert(
                """
                INSERT INTO sap_materials (material_number, description, base_uom, material_type, material_group)
                VALUES (?, ?, ?, ?, ?)
                """,
                (material_number, description, base_uom, material_type, material_group)
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


class DashboardService:
    @staticmethod
    def get_session_summary(session_id: int) -> Dict[str, Any]:
        stats = db.fetch_one(
            """
            SELECT
                COUNT(*) as total_counts,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_counts,
                SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged_counts,
                COUNT(DISTINCT username) as unique_counters,
                COUNT(DISTINCT material_number) as unique_materials,
                SUM(quantity) as total_quantity
            FROM counts WHERE session_id = ?
            """,
            (session_id,)
        )
        return stats or {}

    @staticmethod
    def get_material_summary(session_id: int) -> List[Dict]:
        return db.fetch_all(
            """
            SELECT
                material_number,
                COUNT(*) as count_frequency,
                SUM(quantity) as total_quantity,
                AVG(quantity) as avg_quantity,
                GROUP_CONCAT(DISTINCT username) as counted_by
            FROM counts
            WHERE session_id = ?
            GROUP BY material_number
            ORDER BY count_frequency DESC
            """,
            (session_id,)
        )

    @staticmethod
    def get_user_summary(session_id: int) -> List[Dict]:
        return db.fetch_all(
            """
            SELECT
                username,
                COUNT(*) as total_counts,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_counts,
                COUNT(DISTINCT material_number) as unique_materials
            FROM counts
            WHERE session_id = ?
            GROUP BY username
            ORDER BY total_counts DESC
            """,
            (session_id,)
        )

    @staticmethod
    def get_discrepancies(session_id: int) -> List[Dict]:
        return db.fetch_all(
            """
            SELECT
                c.id,
                c.material_number,
                c.quantity as counted_quantity,
                s.sap_quantity,
                ABS(c.quantity - COALESCE(s.sap_quantity, 0)) as variance,
                c.username,
                c.status
            FROM counts c
            LEFT JOIN sap_snapshot s ON c.session_id = s.session_id
                AND c.material_number = s.material_number
                AND c.sloc = s.sloc
            WHERE c.session_id = ?
            ORDER BY variance DESC
            """,
            (session_id,)
        )
