import os
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = Path(os.environ.get("PLANNER_FRONTEND_DIR", PROJECT_DIR / "frontend"))
BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("PLANNER_DB", BACKEND_DIR / "planner.db"))
HOST = os.environ.get("PLANNER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLANNER_PORT", "8765"))
SERVE_STATIC = os.environ.get("PLANNER_SERVE_STATIC", "1").lower() in {"1", "true", "yes", "si"}
SESSION_TTL_HOURS = int(os.environ.get("PLANNER_SESSION_TTL_HOURS", "12"))
ADMIN_BOOTSTRAP_PASSWORD = os.environ.get("PLANNER_ADMIN_PASSWORD")
RRHH_BOOTSTRAP_PASSWORD = os.environ.get("PLANNER_RRHH_PASSWORD")
PUBLIC_FACE_CLOCK = os.environ.get("PLANNER_PUBLIC_FACE_CLOCK", "0").lower() in {"1", "true", "yes", "si"}
PASSWORD_ITERATIONS = int(os.environ.get("PLANNER_PASSWORD_ITERATIONS", "260000"))
