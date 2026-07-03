#!/usr/bin/env python3
import argparse
import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_DB = ROOT / "backend" / "planner.db"

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
    "incidencias",
    "jornales",
    "sesiones",
]

IDENTITY_TABLES = [
    "roles_app",
    "roles_operativos",
    "personas",
    "usuarios",
    "ubicaciones",
    "operacion_tarifas",
    "turnos",
    "marcas",
    "operaciones",
    "incidencias",
    "jornales",
    "sesiones",
]


def require_psycopg():
    try:
        import psycopg
        from psycopg import sql
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Falta instalar psycopg. Ejecuta: python3 -m pip install -r requirements.txt"
        ) from exc
    return psycopg, sql


def sqlite_connect(path):
    if not path.exists():
        raise SystemExit(f"No existe la base SQLite: {path}")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def sqlite_table_exists(connection, table):
    row = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def truncate_postgres(connection, sql):
    identifiers = [sql.Identifier("rrhh", table) for table in reversed(TABLES)]
    statement = sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
        sql.SQL(", ").join(identifiers)
    )
    connection.execute(statement)


def insert_rows(sqlite_connection, postgres_connection, sql, table):
    if not sqlite_table_exists(sqlite_connection, table):
        return 0

    rows = sqlite_connection.execute(f"SELECT * FROM {table}").fetchall()
    if not rows:
        return 0

    columns = list(rows[0].keys())
    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING").format(
        sql.Identifier("rrhh", table),
        sql.SQL(", ").join(sql.Identifier(column) for column in columns),
        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
    )

    with postgres_connection.cursor() as cursor:
        for row in rows:
            cursor.execute(statement, [row[column] for column in columns])

    return len(rows)


def reset_identity(postgres_connection, sql, table):
    statement = sql.SQL(
        """
        SELECT setval(
          pg_get_serial_sequence(%s, 'id'),
          GREATEST(COALESCE((SELECT MAX(id) FROM {}), 0), 1),
          (SELECT COUNT(*) FROM {}) > 0
        )
        """
    ).format(sql.Identifier("rrhh", table), sql.Identifier("rrhh", table))
    postgres_connection.execute(statement, (f"rrhh.{table}",))


def main():
    parser = argparse.ArgumentParser(
        description="Copia datos desde SQLite hacia PostgreSQL."
    )
    parser.add_argument(
        "--sqlite-db",
        default=os.environ.get("SQLITE_DB", str(DEFAULT_SQLITE_DB)),
        help="Ruta al planner.db local.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Vaciar tablas Postgres antes de copiar.",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Falta DATABASE_URL. Revisa .env.postgres.example.")

    psycopg, sql = require_psycopg()
    sqlite_path = Path(args.sqlite_db).expanduser().resolve()

    with sqlite_connect(sqlite_path) as sqlite_connection:
        with psycopg.connect(database_url) as postgres_connection:
            if args.truncate:
                truncate_postgres(postgres_connection, sql)

            copied = {}
            for table in TABLES:
                copied[table] = insert_rows(
                    sqlite_connection,
                    postgres_connection,
                    sql,
                    table,
                )

            for table in IDENTITY_TABLES:
                reset_identity(postgres_connection, sql, table)

            postgres_connection.commit()

    print(f"Migracion finalizada desde: {sqlite_path}")
    for table in TABLES:
        print(f"{table}: {copied[table]}")


if __name__ == "__main__":
    main()
