import base64
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, jsonify, request


DB_PATH = os.path.join(os.path.dirname(__file__), "photos.db")

app = Flask(__name__)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_base64 TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC)"
        )


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


@app.route("/api/photos", methods=["POST", "OPTIONS"])
def create_photo():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    image_base64 = payload.get("image_base64", "")
    if not image_base64:
        return jsonify({"error": "image_base64 is required"}), 400

    try:
        base64.b64decode(image_base64, validate=True)
    except Exception:
        return jsonify({"error": "invalid base64 image"}), 400

    created_at = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO photos (image_base64, created_at) VALUES (?, ?)",
            (image_base64, created_at),
        )
        photo_id = cursor.lastrowid

    return jsonify({"id": photo_id, "created_at": created_at}), 201


@app.route("/api/photos/latest", methods=["GET"])
def get_latest_photos():
    try:
        limit = int(request.args.get("limit", "1"))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if limit < 1:
        return jsonify({"error": "limit must be at least 1"}), 400

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, image_base64, created_at FROM photos ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()

    items = [
        {"id": row["id"], "image_base64": row["image_base64"], "created_at": row["created_at"]}
        for row in rows
    ]
    return jsonify({"items": items})


@app.route("/api/reset", methods=["POST"])
def reset_photos():
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM photos")
        deleted = cursor.rowcount
    return jsonify({"ok": True, "deleted": deleted})


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("BACKEND_PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
