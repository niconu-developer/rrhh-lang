import re
import sqlite3

from .settings import DATABASE_URL, DB_PATH


POSTGRES_SCHEMA = "rrhh"
IS_POSTGRES = bool(DATABASE_URL)
IDENTITY_TABLES = {
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
    "observaciones_jornal",
    "jornales",
    "sesiones",
    "tokens_acceso",
    "rostros_personas",
    "reconocimientos_faciales_log",
}


def require_psycopg():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ModuleNotFoundError as exc:
        raise RuntimeError("Falta instalar psycopg. Ejecuta: python3 -m pip install -r requirements.txt") from exc
    return psycopg, dict_row


def sqlite_connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def connect():
    if not IS_POSTGRES:
        return sqlite_connect()
    psycopg, dict_row = require_psycopg()
    raw = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    raw.execute(f"SET search_path TO {POSTGRES_SCHEMA}")
    return PostgresConnection(raw)


def rows(sql, params=()):
    with connect() as connection:
        return [dict(row) for row in connection.execute(sql, params).fetchall()]


def one(sql, params=()):
    with connect() as connection:
        row = connection.execute(sql, params).fetchone()
        return dict(row) if row else None


def execute_script(connection, script):
    if hasattr(connection, "executescript"):
        connection.executescript(script)
        return
    for statement in split_sql(script):
        connection.execute(statement)


def split_sql(script):
    return [statement.strip() for statement in script.split(";") if statement.strip()]


class CursorAdapter:
    def __init__(self, cursor=None, rows_data=None, lastrowid=None, rowcount=None):
        self.cursor = cursor
        self.rows_data = rows_data
        self._lastrowid = lastrowid
        self.rowcount = rowcount if rowcount is not None else (cursor.rowcount if cursor else -1)

    @property
    def lastrowid(self):
        if self._lastrowid is not None:
            return self._lastrowid
        if self.cursor and self.cursor.description:
            row = self.cursor.fetchone()
            if row and "id" in row:
                self._lastrowid = row["id"]
                return self._lastrowid
        return None

    def fetchone(self):
        if self.rows_data is not None:
            return self.rows_data[0] if self.rows_data else None
        return self.cursor.fetchone()

    def fetchall(self):
        if self.rows_data is not None:
            return self.rows_data
        return self.cursor.fetchall()

    def __iter__(self):
        return iter(self.fetchall())


class PostgresConnection:
    def __init__(self, raw):
        self.raw = raw
        self._last_rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc_type:
            self.raw.rollback()
        else:
            self.raw.commit()
        self.raw.close()

    def commit(self):
        self.raw.commit()

    def rollback(self):
        self.raw.rollback()

    def cursor(self):
        return self.raw.cursor()

    def execute(self, sql, params=()):
        translated = translate_sql(sql)
        if is_changes_query(translated):
            return CursorAdapter(rows_data=[{"total": self._last_rowcount}])
        if translated.startswith("PRAGMA table_info"):
            table = translated.split("(", 1)[1].split(")", 1)[0].strip()
            return self.table_info(table)

        translated = add_returning_id(translated)
        params = normalize_params(params)
        if not params:
            translated = translated.replace("%", "%%")
        cursor = self.raw.cursor()
        cursor.execute(translated, params)
        self._last_rowcount = cursor.rowcount if cursor.rowcount is not None else 0
        return CursorAdapter(cursor=cursor, rowcount=self._last_rowcount)

    def executemany(self, sql, seq_of_params):
        translated = translate_sql(sql)
        cursor = self.raw.cursor()
        cursor.executemany(translated, [normalize_params(params) for params in seq_of_params])
        self._last_rowcount = cursor.rowcount if cursor.rowcount is not None else 0
        return CursorAdapter(cursor=cursor, rowcount=self._last_rowcount)

    def executescript(self, script):
        for statement in split_sql(script):
            self.execute(statement)

    def table_info(self, table):
        cursor = self.raw.cursor()
        cursor.execute(
            """
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            ORDER BY ordinal_position
            """,
            (POSTGRES_SCHEMA, table),
        )
        return CursorAdapter(cursor=cursor)


def normalize_params(params):
    if params is None:
        return ()
    if isinstance(params, list):
        return tuple(params)
    if isinstance(params, tuple):
        return params
    return (params,)


def is_changes_query(sql):
    return re.sub(r"\s+", " ", sql.strip()).lower() == "select changes() as total"


def add_returning_id(sql):
    stripped = sql.strip()
    if re.search(r"\bRETURNING\b", stripped, flags=re.IGNORECASE):
        return sql
    match = re.match(r"INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)\b", stripped, flags=re.IGNORECASE)
    if not match:
        return sql
    table = match.group(1)
    if table not in IDENTITY_TABLES:
        return sql
    return f"{sql.rstrip()} RETURNING id"


def translate_sql(sql):
    translated = str(sql)
    translated = translated.replace("INSERT OR IGNORE INTO", "INSERT INTO")
    translated = translated.replace("insert or ignore into", "insert into")
    translated = re.sub(r"SELECT\s+changes\(\)\s+AS\s+total", "SELECT changes() AS total", translated, flags=re.IGNORECASE)
    translated = re.sub(
        r"datetime\(sesiones\.fecha_expiracion\)\s*>\s*datetime\('now'\)",
        "CAST(sesiones.fecha_expiracion AS timestamp) > __PG_CURRENT_TIMESTAMP__",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"GROUP_CONCAT\(([^,]+),\s*('(?:[^']|'')*')\)",
        r"STRING_AGG(\1, \2)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"\bdate\(([^,\)]+)\)",
        lambda match: f"substr(CAST({match.group(1)} AS text), 1, 10)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = translated.replace("CURRENT_TIMESTAMP", "(CURRENT_TIMESTAMP::text)")
    translated = translated.replace("__PG_(CURRENT_TIMESTAMP::text)__", "CURRENT_TIMESTAMP")
    translated = ensure_ignore_conflict(translated)
    return replace_qmark_placeholders(translated)


def ensure_ignore_conflict(sql):
    if "INSERT INTO persona_operacion_tarifas" not in sql:
        return sql
    if re.search(r"\bON\s+CONFLICT\b", sql, flags=re.IGNORECASE):
        return sql
    return f"{sql.rstrip()} ON CONFLICT DO NOTHING"


def replace_qmark_placeholders(sql):
    output = []
    in_single = False
    in_double = False
    index = 0
    for char in sql:
        if char == "'" and not in_double:
            in_single = not in_single
            output.append(char)
            continue
        if char == '"' and not in_single:
            in_double = not in_double
            output.append(char)
            continue
        if char == "?" and not in_single and not in_double:
            output.append("%s")
            index += 1
            continue
        output.append(char)
    return "".join(output)
