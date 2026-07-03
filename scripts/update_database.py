#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app import ensure_database
from backend.database import connect
from backend.settings import DB_PATH


TABLES = [
    "personas",
    "usuarios",
    "roles_app",
    "roles_operativos",
    "turnos",
    "marcas",
    "incidencias",
    "jornales",
    "operaciones",
    "operacion_tarifas",
    "persona_operacion_tarifas",
    "ubicaciones",
    "configuracion",
]


def table_count(connection, table):
    try:
        return connection.execute(f"SELECT COUNT(*) AS total FROM {table}").fetchone()["total"]
    except Exception:
        return "sin tabla"


def main():
    ensure_database()
    print(f"Base actualizada: {DB_PATH}")
    with connect() as connection:
        for table in TABLES:
            print(f"{table}: {table_count(connection, table)}")


if __name__ == "__main__":
    main()
