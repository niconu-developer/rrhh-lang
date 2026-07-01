import os
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = Path(os.environ.get("PLANNER_FRONTEND_DIR", PROJECT_DIR / "frontend"))
BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("PLANNER_DB", BACKEND_DIR / "planner.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
HOST = os.environ.get("PLANNER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLANNER_PORT", "8765"))
SERVE_STATIC = os.environ.get("PLANNER_SERVE_STATIC", "1").lower() in {"1", "true", "yes", "si"}
BASE_PATH = "/" + os.environ.get("PLANNER_BASE_PATH", "").strip().strip("/")
if BASE_PATH == "/":
    BASE_PATH = ""
SESSION_TTL_HOURS = int(os.environ.get("PLANNER_SESSION_TTL_HOURS", "12"))
ACCESS_LINK_TTL_HOURS = int(os.environ.get("PLANNER_ACCESS_LINK_TTL_HOURS", "48"))
PUBLIC_BASE_URL = os.environ.get("PLANNER_PUBLIC_BASE_URL", "").strip().rstrip("/")
ADMIN_BOOTSTRAP_PASSWORD = os.environ.get("PLANNER_ADMIN_PASSWORD", "LANG1234")
PASSWORD_ITERATIONS = int(os.environ.get("PLANNER_PASSWORD_ITERATIONS", "260000"))
EXTERNAL_AUTH_ME_URL = os.environ.get("PLANNER_EXTERNAL_AUTH_ME_URL", "").strip()
EXTERNAL_AUTH_COOKIE_NAME = os.environ.get("PLANNER_EXTERNAL_AUTH_COOKIE_NAME", "connect.sid").strip()
EXTERNAL_AUTH_TIMEOUT_SECONDS = float(os.environ.get("PLANNER_EXTERNAL_AUTH_TIMEOUT_SECONDS", "3"))
EXTERNAL_AUTH_DEBUG = os.environ.get("PLANNER_EXTERNAL_AUTH_DEBUG", "0").lower() in {"1", "true", "yes", "si"}
RUN_DATA_SEED = os.environ.get("PLANNER_RUN_DATA_SEED", "0").lower() in {"1", "true", "yes", "si"}
INTEGRATION_API_KEY = os.environ.get("PLANNER_INTEGRATION_API_KEY", "").strip()
