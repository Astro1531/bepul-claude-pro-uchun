import sqlite3
import os
import hashlib
import secrets
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "saltinup.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":")
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    except Exception:
        return False


def init_db():
    conn = get_db()
    c = conn.cursor()

    # ── USERS ──────────────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    UNIQUE NOT NULL,
            email       TEXT    UNIQUE NOT NULL,
            phone       TEXT    NOT NULL,
            password    TEXT    NOT NULL,
            avatar      TEXT    DEFAULT NULL,
            bg_color    TEXT    DEFAULT '#3b82f6',
            bio         TEXT    DEFAULT '',
            is_admin    INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now')),
            last_seen   TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── SESSIONS ───────────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token       TEXT    PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── TASKS (schedule) ──────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            time_start  TEXT    NOT NULL,
            time_end    TEXT    NOT NULL,
            day_of_week TEXT    DEFAULT 'daily',
            category    TEXT    DEFAULT 'general',
            color       TEXT    DEFAULT '#3b82f6',
            is_done     INTEGER DEFAULT 0,
            notified    INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── TASK COMPLETIONS (history) ─────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS task_completions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            completed_at TEXT   DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── POSTS ──────────────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            content     TEXT    DEFAULT '',
            image       TEXT    DEFAULT NULL,
            likes_count INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now')),
            updated_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── LIKES ──────────────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS likes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            UNIQUE(post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── COMMENTS ───────────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            content     TEXT    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── SUBSCRIPTIONS (follow) ─────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id  INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at   TEXT    DEFAULT (datetime('now')),
            UNIQUE(follower_id, following_id),
            FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── NOTIFICATIONS ──────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            type        TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            is_read     INTEGER DEFAULT 0,
            ref_id      INTEGER DEFAULT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── ACTIVITY LOG ──────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            action      TEXT    NOT NULL,
            details     TEXT    DEFAULT '',
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── DEFAULT ADMIN ──────────────────────────────────────────────────────
    c.execute("SELECT id FROM users WHERE username='admin'")
    if not c.fetchone():
        c.execute("""
            INSERT INTO users (username, email, phone, password, is_admin, bg_color)
            VALUES (?, ?, ?, ?, 1, ?)
        """, (
            "admin",
            "admin@saltinup.uz",
            "+998900000000",
            hash_password("admin123"),
            "#1e40af"
        ))

    conn.commit()
    conn.close()
    print("[DB] Database initialized successfully.")


# ── HELPER QUERIES ─────────────────────────────────────────────────────────

def get_user_by_id(user_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_email(email):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_token(token):
    conn = get_db()
    row = conn.execute("""
        SELECT u.* FROM users u
        JOIN sessions s ON s.user_id = u.id
        WHERE s.token=?
    """, (token,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_session(user_id):
    token = secrets.token_hex(32)
    conn = get_db()
    conn.execute("INSERT INTO sessions (token, user_id) VALUES (?,?)", (token, user_id))
    conn.commit()
    conn.close()
    return token


def delete_session(token):
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()


def log_activity(user_id, action, details=""):
    conn = get_db()
    conn.execute(
        "INSERT INTO activity_log (user_id, action, details) VALUES (?,?,?)",
        (user_id, action, details)
    )
    conn.commit()
    conn.close()


def get_user_stats(user_id):
    conn = get_db()
    stats = {}
    stats["tasks_total"]     = conn.execute("SELECT COUNT(*) FROM tasks WHERE user_id=?", (user_id,)).fetchone()[0]
    stats["tasks_done"]      = conn.execute("SELECT COUNT(*) FROM task_completions WHERE user_id=?", (user_id,)).fetchone()[0]
    stats["posts_total"]     = conn.execute("SELECT COUNT(*) FROM posts WHERE user_id=?", (user_id,)).fetchone()[0]
    stats["followers"]       = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE following_id=?", (user_id,)).fetchone()[0]
    stats["following"]       = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE follower_id=?", (user_id,)).fetchone()[0]
    stats["likes_received"]  = conn.execute("""
        SELECT COALESCE(SUM(p.likes_count),0) FROM posts p WHERE p.user_id=?
    """, (user_id,)).fetchone()[0]
    conn.close()
    return stats


if __name__ == "__main__":
    init_db()
