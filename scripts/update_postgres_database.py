#!/usr/bin/env python3
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "backend" / "schema.postgres.sql"
SEED_PATH = ROOT / "backend" / "seed.postgres.sql"

TABLES = [
    "roles_app",
    "roles_operativos",
    "personas",
    "usuarios",
    "configuracion",
    "ubicaciones",
    "operacion_tarifas",
    "persona_operacion_tarifas",
    "turnos",
    "marcas",
    "operaciones",
    "facturacion",
    "incidencias",
    "jornales",
    "sesiones",
]


def require_psycopg():
    try:
        import psycopg
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Falta instalar psycopg. Ejecuta: python3 -m pip install -r requirements.txt"
        ) from exc
    return psycopg


def split_sql(script):
    return [statement.strip() for statement in script.split(";") if statement.strip()]


def run_script(connection, path):
    script = path.read_text(encoding="utf-8")
    with connection.cursor() as cursor:
        for statement in split_sql(script):
            cursor.execute(statement)


def table_count(connection, table):
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM rrhh.{table}")
        return cursor.fetchone()[0]


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Falta DATABASE_URL. Revisa .env.postgres.example.")

    psycopg = require_psycopg()
    with psycopg.connect(database_url) as connection:
        run_script(connection, SCHEMA_PATH)
        run_script(connection, SEED_PATH)
        connection.commit()

        print("Base PostgreSQL actualizada.")
        for table in TABLES:
            try:
                total = table_count(connection, table)
            except Exception:
                total = "sin tabla"
            print(f"{table}: {total}")


if __name__ == "__main__":
    main()
