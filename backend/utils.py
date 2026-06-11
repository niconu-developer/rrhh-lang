import json
import re
from datetime import datetime


def parse_iso_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def date_from_db_datetime(value):
    return str(value or "").replace("T", " ").split(" ")[0]


def time_from_db_datetime(value):
    parts = str(value or "").replace("T", " ").split(" ")
    return parts[1][:5] if len(parts) > 1 and len(parts[1]) >= 5 else "00:00"


def minutes_from_time(value):
    match = re.match(r"^(\d{1,2})(?::(\d{2}))?$", str(value or ""))
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2) or 0)


def shift_diff_minutes(real_time, expected_time):
    real = minutes_from_time(real_time)
    expected = minutes_from_time(expected_time)
    if real is None or expected is None:
        return None
    direct = real - expected
    if direct > 720:
        direct -= 1440
    if direct < -720:
        direct += 1440
    return direct


def app_config_json(connection, key, fallback):
    row = connection.execute("SELECT valor FROM configuracion WHERE clave = ?", (key,)).fetchone()
    if not row:
        return fallback
    try:
        return json.loads(row["valor"] or "null") or fallback
    except (TypeError, json.JSONDecodeError):
        return fallback
