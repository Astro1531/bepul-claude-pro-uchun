#!/usr/bin/env python3
"""Saltinup - Custom HTTP server (pure Python stdlib)."""

import json
import os
import sys
import base64
import mimetypes
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

# ── simple loguru-style logger using stdlib ────────────────────────────────
import logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.path.dirname(__file__), "saltinup.log")),
    ]
)

try:
    from loguru import logger
    logger.add(os.path.join(os.path.dirname(__file__), "saltinup.log"),
               rotation="10 MB", retention="30 days",
               format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {message}")
    logger.info("Loguru logger active")
except ImportError:
    class _Logger:
        def info(self, m):    logging.info(m)
        def warning(self, m): logging.warning(m)
        def error(self, m):   logging.error(m)
        def debug(self, m):   logging.debug(m)
        def success(self, m): logging.info("[SUCCESS] " + m)
    logger = _Logger()
    logger.info("stdlib logger active (loguru not installed)")

from database import (
    init_db, get_db, get_user_by_email, get_user_by_token,
    create_session, delete_session, hash_password, verify_password,
    log_activity, get_user_stats, get_user_by_id
)

BASE_DIR    = os.path.dirname(__file__)
STATIC_DIR  = os.path.join(BASE_DIR, "static")
UPLOAD_DIR  = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)



# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def json_response(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", len(body))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def html_response(handler, html: str, status=200):
    body = html.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", len(body))
    handler.end_headers()
    handler.wfile.write(body)


def get_token(handler):
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("token="):
            return part[6:]
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def get_current_user(handler):
    token = get_token(handler)
    if not token:
        return None
    return get_user_by_token(token)


def read_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    ct = handler.headers.get("Content-Type", "")
    if "application/json" in ct:
        try:
            return json.loads(raw.decode())
        except Exception:
            return {}
    # multipart / form-urlencoded fallback
    try:
        return json.loads(raw.decode())
    except Exception:
        return {}


def save_base64_image(b64_data: str, folder: str):
    """Save base64 image, return filename."""
    try:
        if "," in b64_data:
            header, data = b64_data.split(",", 1)
        else:
            data = b64_data
        raw = base64.b64decode(data)
        import secrets as _s
        fname = _s.token_hex(12) + ".jpg"
        path = os.path.join(folder, fname)
        with open(path, "wb") as f:
            f.write(raw)
        return fname
    except Exception as e:
        logger.error(f"save_base64_image error: {e}")
        return None



# ══════════════════════════════════════════════════════════════════════════════
#  API ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def handle_api(handler, method, path, body):
    """Route /api/* requests."""
    p = path.lstrip("/api").lstrip("/")
    parts = p.split("/")
    ep = parts[0]

    # ── AUTH ──────────────────────────────────────────────────────────────
    if ep == "register" and method == "POST":
        return api_register(handler, body)
    if ep == "login" and method == "POST":
        return api_login(handler, body)
    if ep == "logout" and method == "POST":
        return api_logout(handler)
    if ep == "me" and method == "GET":
        return api_me(handler)
    if ep == "profile" and method == "PUT":
        return api_update_profile(handler, body)

    # ── TASKS ─────────────────────────────────────────────────────────────
    if ep == "tasks":
        if method == "GET":   return api_get_tasks(handler)
        if method == "POST":  return api_create_task(handler, body)
    if ep == "tasks" and len(parts) >= 2:
        tid = parts[1]
        if method == "PUT":    return api_update_task(handler, tid, body)
        if method == "DELETE": return api_delete_task(handler, tid)
    if ep == "task-done" and method == "POST":
        return api_mark_task_done(handler, body)

    # ── POSTS ─────────────────────────────────────────────────────────────
    if ep == "posts":
        if method == "GET":  return api_get_posts(handler)
        if method == "POST": return api_create_post(handler, body)
    if ep == "posts" and len(parts) >= 2:
        pid = parts[1]
        if len(parts) == 2 and method == "DELETE": return api_delete_post(handler, pid)
        if len(parts) == 3 and parts[2] == "like" and method == "POST":
            return api_like_post(handler, pid)
        if len(parts) == 3 and parts[2] == "comments":
            if method == "GET":  return api_get_comments(handler, pid)
            if method == "POST": return api_add_comment(handler, pid, body)

    # ── USERS / PROFILES ──────────────────────────────────────────────────
    if ep == "users" and len(parts) >= 2:
        uid = parts[1]
        if len(parts) == 2 and method == "GET": return api_get_user(handler, uid)
        if len(parts) == 3 and parts[2] == "subscribe" and method == "POST":
            return api_subscribe(handler, uid)
        if len(parts) == 3 and parts[2] == "posts" and method == "GET":
            return api_user_posts(handler, uid)
        if len(parts) == 3 and parts[2] == "stats" and method == "GET":
            return api_user_stats(handler, uid)

    # ── SEARCH ────────────────────────────────────────────────────────────
    if ep == "search" and method == "GET":
        return api_search(handler)

    # ── NOTIFICATIONS ─────────────────────────────────────────────────────
    if ep == "notifications":
        if method == "GET":  return api_get_notifications(handler)
        if method == "POST": return api_mark_notifications_read(handler)

    # ── STATS / ACTIVITY ──────────────────────────────────────────────────
    if ep == "activity" and method == "GET":
        return api_get_activity(handler)
    if ep == "stats" and method == "GET":
        return api_global_stats(handler)

    # ── ADMIN ─────────────────────────────────────────────────────────────
    if ep == "admin":
        return handle_admin_api(handler, method, parts, body)

    json_response(handler, {"error": "Not found"}, 404)



# ══════════════════════════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def api_register(handler, body):
    username = body.get("username", "").strip()
    email    = body.get("email", "").strip().lower()
    phone    = body.get("phone", "").strip()
    password = body.get("password", "")

    if not all([username, email, phone, password]):
        return json_response(handler, {"error": "Barcha maydonlarni to'ldiring"}, 400)
    if len(password) < 6:
        return json_response(handler, {"error": "Parol kamida 6 ta belgidan iborat bo'lishi kerak"}, 400)

    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
        conn.close()
        return json_response(handler, {"error": "Bu email allaqachon ro'yxatdan o'tgan"}, 409)
    if conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone():
        conn.close()
        return json_response(handler, {"error": "Bu username band"}, 409)

    c = conn.execute("""
        INSERT INTO users (username, email, phone, password)
        VALUES (?,?,?,?)
    """, (username, email, phone, hash_password(password)))
    user_id = c.lastrowid
    conn.commit()
    conn.close()

    token = create_session(user_id)
    log_activity(user_id, "register", f"New user: {username}")
    logger.info(f"New user registered: {username} ({email})")
    json_response(handler, {"ok": True, "token": token, "user_id": user_id, "need_profile": True})


def api_login(handler, body):
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "")

    user = get_user_by_email(email)
    if not user or not verify_password(password, user["password"]):
        logger.warning(f"Failed login attempt: {email}")
        return json_response(handler, {"error": "Email yoki parol noto'g'ri"}, 401)
    if not user["is_active"]:
        return json_response(handler, {"error": "Hisobingiz bloklangan"}, 403)

    token = create_session(user["id"])
    conn = get_db()
    conn.execute("UPDATE users SET last_seen=datetime('now') WHERE id=?", (user["id"],))
    conn.commit()
    conn.close()
    log_activity(user["id"], "login", "User logged in")
    logger.info(f"User logged in: {user['username']}")

    need_profile = not user.get("avatar") and not user.get("bio")
    json_response(handler, {
        "ok": True, "token": token,
        "user_id": user["id"],
        "is_admin": bool(user["is_admin"]),
        "need_profile": need_profile
    })


def api_logout(handler):
    token = get_token(handler)
    if token:
        delete_session(token)
    json_response(handler, {"ok": True})


def api_me(handler):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    u = dict(user)
    u.pop("password", None)
    u["stats"] = get_user_stats(u["id"])
    json_response(handler, u)


def api_update_profile(handler, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)

    bio      = body.get("bio", user["bio"])
    bg_color = body.get("bg_color", user["bg_color"])
    username = body.get("username", user["username"]).strip()
    avatar_b64 = body.get("avatar")

    avatar_fname = user["avatar"]
    if avatar_b64:
        fname = save_base64_image(avatar_b64, UPLOAD_DIR)
        if fname:
            avatar_fname = fname

    conn = get_db()
    conn.execute("""
        UPDATE users SET bio=?, bg_color=?, username=?, avatar=?
        WHERE id=?
    """, (bio, bg_color, username, avatar_fname, user["id"]))
    conn.commit()
    conn.close()
    log_activity(user["id"], "profile_update", "Profile updated")
    logger.info(f"Profile updated: user_id={user['id']}")
    json_response(handler, {"ok": True})



# ══════════════════════════════════════════════════════════════════════════════
#  TASK ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def api_get_tasks(handler):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM tasks WHERE user_id=? ORDER BY time_start", (user["id"],)
    ).fetchall()
    conn.close()
    json_response(handler, [dict(r) for r in rows])


def api_create_task(handler, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    title      = body.get("title", "").strip()
    time_start = body.get("time_start", "")
    time_end   = body.get("time_end", "")
    if not all([title, time_start, time_end]):
        return json_response(handler, {"error": "title, time_start, time_end majburiy"}, 400)

    conn = get_db()
    c = conn.execute("""
        INSERT INTO tasks (user_id, title, description, time_start, time_end, day_of_week, category, color)
        VALUES (?,?,?,?,?,?,?,?)
    """, (user["id"], title,
          body.get("description",""), time_start, time_end,
          body.get("day_of_week","daily"), body.get("category","general"),
          body.get("color","#3b82f6")))
    new_id = c.lastrowid
    conn.commit()
    conn.close()
    log_activity(user["id"], "task_created", title)
    logger.info(f"Task created: {title} by user_id={user['id']}")
    json_response(handler, {"ok": True, "id": new_id})


def api_update_task(handler, tid, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id=? AND user_id=?", (tid, user["id"])).fetchone()
    if not row:
        conn.close()
        return json_response(handler, {"error": "Topilmadi"}, 404)
    r = dict(row)
    conn.execute("""
        UPDATE tasks SET title=?, description=?, time_start=?, time_end=?,
        day_of_week=?, category=?, color=?
        WHERE id=?
    """, (body.get("title", r["title"]),
          body.get("description", r["description"]),
          body.get("time_start", r["time_start"]),
          body.get("time_end", r["time_end"]),
          body.get("day_of_week", r["day_of_week"]),
          body.get("category", r["category"]),
          body.get("color", r["color"]), tid))
    conn.commit()
    conn.close()
    json_response(handler, {"ok": True})


def api_delete_task(handler, tid):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id=? AND user_id=?", (tid, user["id"]))
    conn.commit()
    conn.close()
    log_activity(user["id"], "task_deleted", f"task_id={tid}")
    json_response(handler, {"ok": True})


def api_mark_task_done(handler, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    task_id = body.get("task_id")
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id=? AND user_id=?", (task_id, user["id"])).fetchone()
    if not row:
        conn.close()
        return json_response(handler, {"error": "Topilmadi"}, 404)
    already = conn.execute(
        "SELECT id FROM task_completions WHERE task_id=? AND user_id=? AND date(completed_at)=date('now')",
        (task_id, user["id"])
    ).fetchone()
    if not already:
        conn.execute("INSERT INTO task_completions (task_id, user_id) VALUES (?,?)", (task_id, user["id"]))
        conn.execute("UPDATE tasks SET is_done=1 WHERE id=?", (task_id,))
        conn.commit()
    conn.close()
    log_activity(user["id"], "task_done", f"task_id={task_id}")
    json_response(handler, {"ok": True})



# ══════════════════════════════════════════════════════════════════════════════
#  POST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def _post_row_to_dict(row, viewer_id=None):
    d = dict(row)
    if viewer_id:
        conn = get_db()
        liked = conn.execute(
            "SELECT id FROM likes WHERE post_id=? AND user_id=?", (d["id"], viewer_id)
        ).fetchone()
        conn.close()
        d["liked_by_me"] = bool(liked)
    else:
        d["liked_by_me"] = False
    return d


def api_get_posts(handler):
    user = get_current_user(handler)
    viewer_id = user["id"] if user else None
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, u.username, u.avatar, u.bg_color
        FROM posts p JOIN users u ON u.id=p.user_id
        ORDER BY p.created_at DESC LIMIT 50
    """).fetchall()
    conn.close()
    json_response(handler, [_post_row_to_dict(r, viewer_id) for r in rows])


def api_create_post(handler, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    content  = body.get("content", "").strip()
    image_b64 = body.get("image")
    if not content and not image_b64:
        return json_response(handler, {"error": "Content yoki rasm kerak"}, 400)

    image_fname = None
    if image_b64:
        image_fname = save_base64_image(image_b64, UPLOAD_DIR)

    conn = get_db()
    c = conn.execute(
        "INSERT INTO posts (user_id, content, image) VALUES (?,?,?)",
        (user["id"], content, image_fname)
    )
    post_id = c.lastrowid
    conn.commit()
    conn.close()
    log_activity(user["id"], "post_created", f"post_id={post_id}")
    logger.info(f"Post created by user_id={user['id']}")
    json_response(handler, {"ok": True, "id": post_id})


def api_delete_post(handler, pid):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    row = conn.execute("SELECT * FROM posts WHERE id=?", (pid,)).fetchone()
    if not row:
        conn.close()
        return json_response(handler, {"error": "Topilmadi"}, 404)
    if row["user_id"] != user["id"] and not user["is_admin"]:
        conn.close()
        return json_response(handler, {"error": "Ruxsat yo'q"}, 403)
    conn.execute("DELETE FROM posts WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    json_response(handler, {"ok": True})


def api_like_post(handler, pid):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM likes WHERE post_id=? AND user_id=?", (pid, user["id"])
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM likes WHERE post_id=? AND user_id=?", (pid, user["id"]))
        conn.execute("UPDATE posts SET likes_count=MAX(0,likes_count-1) WHERE id=?", (pid,))
        liked = False
    else:
        conn.execute("INSERT INTO likes (post_id, user_id) VALUES (?,?)", (pid, user["id"]))
        conn.execute("UPDATE posts SET likes_count=likes_count+1 WHERE id=?", (pid,))
        liked = True
        # notify post owner
        post = conn.execute("SELECT user_id FROM posts WHERE id=?", (pid,)).fetchone()
        if post and post["user_id"] != user["id"]:
            conn.execute("""
                INSERT INTO notifications (user_id, type, message, ref_id)
                VALUES (?,?,?,?)
            """, (post["user_id"], "like", f"{user['username']} postingizga ✊ bosdi", pid))
    count = conn.execute("SELECT likes_count FROM posts WHERE id=?", (pid,)).fetchone()[0]
    conn.commit()
    conn.close()
    json_response(handler, {"ok": True, "liked": liked, "count": count})


def api_get_comments(handler, pid):
    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, u.username, u.avatar, u.bg_color
        FROM comments c JOIN users u ON u.id=c.user_id
        WHERE c.post_id=? ORDER BY c.created_at
    """, (pid,)).fetchall()
    conn.close()
    json_response(handler, [dict(r) for r in rows])


def api_add_comment(handler, pid, body):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    content = body.get("content", "").strip()
    if not content:
        return json_response(handler, {"error": "Izoh bo'sh bo'lishi mumkin emas"}, 400)
    conn = get_db()
    conn.execute("INSERT INTO comments (post_id, user_id, content) VALUES (?,?,?)",
                 (pid, user["id"], content))
    conn.execute("UPDATE posts SET comments_count=comments_count+1 WHERE id=?", (pid,))
    post = conn.execute("SELECT user_id FROM posts WHERE id=?", (pid,)).fetchone()
    if post and post["user_id"] != user["id"]:
        conn.execute("""
            INSERT INTO notifications (user_id, type, message, ref_id)
            VALUES (?,?,?,?)
        """, (post["user_id"], "comment", f"{user['username']} izoh qoldirdi", pid))
    conn.commit()
    conn.close()
    json_response(handler, {"ok": True})



# ══════════════════════════════════════════════════════════════════════════════
#  USER / SUBSCRIPTION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def api_get_user(handler, uid):
    viewer = get_current_user(handler)
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        conn.close()
        return json_response(handler, {"error": "Topilmadi"}, 404)
    u = dict(row)
    u.pop("password", None)
    u["stats"] = get_user_stats(int(uid))
    if viewer:
        sub = conn.execute(
            "SELECT id FROM subscriptions WHERE follower_id=? AND following_id=?",
            (viewer["id"], uid)
        ).fetchone()
        u["is_following"] = bool(sub)
    else:
        u["is_following"] = False
    conn.close()
    json_response(handler, u)


def api_subscribe(handler, uid):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    if str(user["id"]) == str(uid):
        return json_response(handler, {"error": "O'zingizga obuna bo'lib bo'lmaydi"}, 400)
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM subscriptions WHERE follower_id=? AND following_id=?",
        (user["id"], uid)
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM subscriptions WHERE follower_id=? AND following_id=?",
                     (user["id"], uid))
        following = False
    else:
        conn.execute("INSERT INTO subscriptions (follower_id, following_id) VALUES (?,?)",
                     (user["id"], uid))
        following = True
        conn.execute("""
            INSERT INTO notifications (user_id, type, message, ref_id)
            VALUES (?,?,?,?)
        """, (uid, "follow", f"{user['username']} sizga obuna bo'ldi", user["id"]))
    conn.commit()
    conn.close()
    log_activity(user["id"], "subscribe" if following else "unsubscribe", f"target_id={uid}")
    json_response(handler, {"ok": True, "following": following})


def api_user_posts(handler, uid):
    viewer = get_current_user(handler)
    viewer_id = viewer["id"] if viewer else None
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, u.username, u.avatar, u.bg_color
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE p.user_id=? ORDER BY p.created_at DESC
    """, (uid,)).fetchall()
    conn.close()
    json_response(handler, [_post_row_to_dict(r, viewer_id) for r in rows])


def api_user_stats(handler, uid):
    stats = get_user_stats(int(uid))
    # weekly task completion
    conn = get_db()
    weekly = conn.execute("""
        SELECT date(completed_at) as day, COUNT(*) as cnt
        FROM task_completions WHERE user_id=?
        AND completed_at >= datetime('now','-7 days')
        GROUP BY day ORDER BY day
    """, (uid,)).fetchall()
    stats["weekly"] = [dict(r) for r in weekly]
    conn.close()
    json_response(handler, stats)


def api_search(handler):
    parsed = urlparse(handler.path)
    qs = parse_qs(parsed.query)
    q = qs.get("q", [""])[0].strip()
    if not q:
        return json_response(handler, [])
    conn = get_db()
    rows = conn.execute("""
        SELECT id, username, avatar, bg_color, bio FROM users
        WHERE username LIKE ? OR bio LIKE ? LIMIT 20
    """, (f"%{q}%", f"%{q}%")).fetchall()
    conn.close()
    json_response(handler, [dict(r) for r in rows])


def api_get_notifications(handler):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM notifications WHERE user_id=?
        ORDER BY created_at DESC LIMIT 30
    """, (user["id"],)).fetchall()
    conn.close()
    json_response(handler, [dict(r) for r in rows])


def api_mark_notifications_read(handler):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    conn.execute("UPDATE notifications SET is_read=1 WHERE user_id=?", (user["id"],))
    conn.commit()
    conn.close()
    json_response(handler, {"ok": True})


def api_get_activity(handler):
    user = get_current_user(handler)
    if not user:
        return json_response(handler, {"error": "Unauthorized"}, 401)
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM activity_log WHERE user_id=?
        ORDER BY created_at DESC LIMIT 50
    """, (user["id"],)).fetchall()
    conn.close()
    json_response(handler, [dict(r) for r in rows])


def api_global_stats(handler):
    user = get_current_user(handler)
    if not user or not user["is_admin"]:
        return json_response(handler, {"error": "Forbidden"}, 403)
    conn = get_db()
    stats = {
        "total_users":    conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "total_posts":    conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0],
        "total_tasks":    conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0],
        "total_comments": conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0],
        "total_likes":    conn.execute("SELECT COUNT(*) FROM likes").fetchone()[0],
        "active_today":   conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE date(created_at)=date('now')"
        ).fetchone()[0],
        "new_users_week": conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at>=datetime('now','-7 days')"
        ).fetchone()[0],
        "posts_per_day": [dict(r) for r in conn.execute("""
            SELECT date(created_at) as day, COUNT(*) as cnt FROM posts
            WHERE created_at>=datetime('now','-7 days')
            GROUP BY day ORDER BY day
        """).fetchall()],
    }
    conn.close()
    json_response(handler, stats)



# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN API
# ══════════════════════════════════════════════════════════════════════════════

def handle_admin_api(handler, method, parts, body):
    user = get_current_user(handler)
    if not user or not user["is_admin"]:
        return json_response(handler, {"error": "Admin only"}, 403)

    sub = parts[1] if len(parts) > 1 else ""
    eid = parts[2] if len(parts) > 2 else None

    conn = get_db()

    # ── USERS ────────────────────────────────────────────
    if sub == "users":
        if method == "GET":
            rows = conn.execute("""
                SELECT u.*, 
                  (SELECT COUNT(*) FROM posts WHERE user_id=u.id) as posts_count,
                  (SELECT COUNT(*) FROM tasks WHERE user_id=u.id) as tasks_count
                FROM users u ORDER BY u.created_at DESC
            """).fetchall()
            conn.close()
            result = []
            for r in rows:
                d = dict(r); d.pop("password", None); result.append(d)
            return json_response(handler, result)
        if method == "PUT" and eid:
            is_active = body.get("is_active")
            is_admin  = body.get("is_admin")
            if is_active is not None:
                conn.execute("UPDATE users SET is_active=? WHERE id=?", (int(is_active), eid))
            if is_admin is not None:
                conn.execute("UPDATE users SET is_admin=? WHERE id=?", (int(is_admin), eid))
            conn.commit(); conn.close()
            return json_response(handler, {"ok": True})
        if method == "DELETE" and eid:
            if int(eid) == user["id"]:
                conn.close()
                return json_response(handler, {"error": "O'zingizni o'chira olmaysiz"}, 400)
            conn.execute("DELETE FROM users WHERE id=?", (eid,))
            conn.commit(); conn.close()
            return json_response(handler, {"ok": True})

    # ── POSTS ────────────────────────────────────────────
    if sub == "posts":
        if method == "GET":
            rows = conn.execute("""
                SELECT p.*, u.username FROM posts p
                JOIN users u ON u.id=p.user_id
                ORDER BY p.created_at DESC LIMIT 100
            """).fetchall()
            conn.close()
            return json_response(handler, [dict(r) for r in rows])
        if method == "DELETE" and eid:
            conn.execute("DELETE FROM posts WHERE id=?", (eid,))
            conn.commit(); conn.close()
            return json_response(handler, {"ok": True})

    # ── TASKS ────────────────────────────────────────────
    if sub == "tasks":
        if method == "GET":
            rows = conn.execute("""
                SELECT t.*, u.username FROM tasks t
                JOIN users u ON u.id=t.user_id
                ORDER BY t.created_at DESC LIMIT 100
            """).fetchall()
            conn.close()
            return json_response(handler, [dict(r) for r in rows])
        if method == "DELETE" and eid:
            conn.execute("DELETE FROM tasks WHERE id=?", (eid,))
            conn.commit(); conn.close()
            return json_response(handler, {"ok": True})

    # ── COMMENTS ─────────────────────────────────────────
    if sub == "comments":
        if method == "GET":
            rows = conn.execute("""
                SELECT c.*, u.username FROM comments c
                JOIN users u ON u.id=c.user_id
                ORDER BY c.created_at DESC LIMIT 100
            """).fetchall()
            conn.close()
            return json_response(handler, [dict(r) for r in rows])
        if method == "DELETE" and eid:
            conn.execute("DELETE FROM comments WHERE id=?", (eid,))
            conn.execute("""
                UPDATE posts SET comments_count=MAX(0,comments_count-1)
                WHERE id=(SELECT post_id FROM comments WHERE id=?)
            """, (eid,))
            conn.commit(); conn.close()
            return json_response(handler, {"ok": True})

    # ── ACTIVITY LOG ──────────────────────────────────────
    if sub == "activity":
        rows = conn.execute("""
            SELECT a.*, u.username FROM activity_log a
            JOIN users u ON u.id=a.user_id
            ORDER BY a.created_at DESC LIMIT 200
        """).fetchall()
        conn.close()
        return json_response(handler, [dict(r) for r in rows])

    conn.close()
    json_response(handler, {"error": "Not found"}, 404)



# ══════════════════════════════════════════════════════════════════════════════
#  HTTP HANDLER
# ══════════════════════════════════════════════════════════════════════════════

class SaltinupHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logger.debug(f"{self.address_string()} - {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization,Cookie")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _route(self, method):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/") or "/"
        body   = {}
        if method in ("POST", "PUT"):
            body = read_body(self)

        try:
            # ── Static files ──────────────────────────────────────────────
            if path.startswith("/static/"):
                rel  = path[8:]  # strip "/static/"
                fpath = os.path.join(STATIC_DIR, rel.replace("/", os.sep))
                if os.path.isfile(fpath):
                    mime, _ = mimetypes.guess_type(fpath)
                    mime = mime or "application/octet-stream"
                    with open(fpath, "rb") as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", len(data))
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    self.send_response(404); self.end_headers()
                return

            # ── API ───────────────────────────────────────────────────────
            if path.startswith("/api"):
                return handle_api(self, method, path, body)

            # ── SPA – serve index.html for everything else ─────────────────
            index = os.path.join(BASE_DIR, "templates", "index.html")
            if os.path.isfile(index):
                with open(index, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", len(data))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()

        except Exception as e:
            logger.error(f"Handler error: {e}\n{traceback.format_exc()}")
            try:
                json_response(self, {"error": "Internal server error"}, 500)
            except Exception:
                pass

    def do_GET(self):    self._route("GET")
    def do_POST(self):   self._route("POST")
    def do_PUT(self):    self._route("PUT")
    def do_DELETE(self): self._route("DELETE")


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    init_db()
    PORT = int(os.environ.get("PORT", 8000))
    server = HTTPServer(("0.0.0.0", PORT), SaltinupHandler)
    logger.success(f"🚀 Saltinup running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopped.")
        server.server_close()
