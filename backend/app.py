#!/usr/bin/env python3
import json
import os
import re
import secrets
import hmac
import sys
import traceback
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import repositories as repo
from backend import routes as api_routes
from backend.database import IS_POSTGRES, connect, execute_script, one, rows
from backend.security import hash_password, is_password_hash
from backend.services import AprobacionesService, IncidenciasService, ObservacionesJornalService
from backend.settings import (
    ADMIN_BOOTSTRAP_PASSWORD,
    BACKEND_DIR,
    DB_PATH,
    EXTERNAL_AUTH_COOKIE_NAME,
    EXTERNAL_AUTH_DEBUG,
    EXTERNAL_AUTH_ME_URL,
    EXTERNAL_AUTH_TIMEOUT_SECONDS,
    FRONTEND_DIR,
    HOST,
    INTEGRATION_API_KEY,
    PORT,
    PUBLIC_BASE_URL,
    BASE_PATH,
    RUN_DATA_SEED,
    SERVE_STATIC,
)


def ensure_database():
    schema_path = BACKEND_DIR / ("schema.postgres.sql" if IS_POSTGRES else "schema.sql")
    seed_path = BACKEND_DIR / ("seed.postgres.sql" if IS_POSTGRES else "seed.sql")
    if not IS_POSTGRES:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as connection:
        if schema_path.exists():
            execute_script(connection, schema_path.read_text(encoding="utf-8"))
        ensure_reference_data(connection)
        if IS_POSTGRES:
            if seed_path.exists():
                if RUN_DATA_SEED:
                    execute_script(connection, seed_path.read_text(encoding="utf-8"))
            ensure_required_role_permissions(connection)
            ensure_identity_model(connection)
        else:
            ensure_column(connection, "personas", "codigo_privado", "TEXT")
            ensure_column(connection, "personas", "email", "TEXT")
            ensure_column(connection, "personas", "horario_fijo_json", "TEXT")
            ensure_column(connection, "personas", "horas_acordadas", "REAL NOT NULL DEFAULT 190")
            connection.execute("UPDATE personas SET horas_acordadas = 190 WHERE horas_acordadas IS NULL OR horas_acordadas <= 0")
            ensure_marcas_approval_schema(connection)
            ensure_sessions_schema(connection)
            ensure_incidencias_schema(connection)
            ensure_jornales_schema(connection)
            ensure_operation_tarifas_schema(connection)
            ensure_column(connection, "relojes_faciales", "token_visible", "TEXT")
            ensure_column(connection, "relojes_faciales", "eliminado", "INTEGER NOT NULL DEFAULT 0")
            ensure_column(connection, "relojes_faciales", "fecha_eliminacion", "TEXT")
            ensure_face_recognition_schema(connection)
            ensure_turnos_unique_index(connection)
            if seed_path.exists() and RUN_DATA_SEED:
                execute_script(connection, seed_path.read_text(encoding="utf-8"))
            ensure_required_role_permissions(connection)
            ensure_identity_model(connection)
        ensure_email_identifiers(connection)
        drop_obsolete_projects_table(connection)
        migrate_passwords_to_hash(connection)
        ensure_bootstrap_admin(connection)
        ensure_seed_named_admin(connection)
        ensure_private_person_codes(connection)
        drop_obsolete_native_host_tables(connection)
        if RUN_DATA_SEED:
            seed_default_operation_tarifas(connection)
            seed_default_persona_operation_tarifas(connection)


def ensure_column(connection, table, column, definition):
    existing = [row["name"] for row in connection.execute(f"PRAGMA table_info({table})")]
    if column not in existing:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def drop_obsolete_projects_table(connection):
    connection.execute("DROP INDEX IF EXISTS idx_proyectos_activo")
    connection.execute("DROP TABLE IF EXISTS proyectos")


def drop_obsolete_native_host_tables(connection):
    connection.execute("DROP INDEX IF EXISTS idx_facturacion_fecha")
    connection.execute("DROP TABLE IF EXISTS facturacion")


def ensure_reference_data(connection):
    connection.executemany(
        "INSERT INTO roles_app (nombre) VALUES (?) ON CONFLICT(nombre) DO NOTHING",
        [("admin",), ("rrhh",), ("usuario",)],
    )
    connection.executemany(
        """
        INSERT INTO roles_operativos (nombre, aparece_plan_semanal)
        VALUES (?, ?)
        ON CONFLICT(nombre) DO NOTHING
        """,
        [
            ("Logistico", 1),
            ("Referente", 1),
            ("Operador", 1),
            ("Depo y Mant.", 1),
            ("Admin", 0),
        ],
    )
    connection.executemany(
        """
        INSERT INTO configuracion (clave, valor)
        VALUES (?, ?)
        ON CONFLICT(clave) DO NOTHING
        """,
        [
            ("operation_bands", '["Hasta 4 horas", "4 a 8 horas", "8 a 12 horas"]'),
            ("tolerancia_alerta_verde_minutos", "15"),
            ("tolerancia_alerta_amarilla_minutos", "30"),
            ("face_recognition", '{"threshold": 78, "ambiguity_margin": 4}'),
        ],
    )


def ensure_private_person_codes(connection):
    used = {
        row["codigo_privado"]
        for row in connection.execute("SELECT codigo_privado FROM personas WHERE codigo_privado IS NOT NULL")
        if row["codigo_privado"]
    }
    people = connection.execute("""
        SELECT id
        FROM personas
        WHERE codigo_privado IS NULL OR trim(codigo_privado) = ''
        ORDER BY id
    """).fetchall()
    for person in people:
        available = [f"{number:03d}" for number in range(100, 1000) if f"{number:03d}" not in used]
        if not available:
            raise ValueError("No hay IDs privados disponibles")
        code = secrets.choice(available)
        connection.execute("UPDATE personas SET codigo_privado = ? WHERE id = ?", (code, person["id"]))
        used.add(code)
    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_codigo_privado_unique
        ON personas(codigo_privado)
        WHERE codigo_privado IS NOT NULL
    """)


def ensure_sessions_schema(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS sesiones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT NOT NULL UNIQUE,
          usuario_id INTEGER NOT NULL,
          fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          fecha_expiracion TEXT NOT NULL,
          activa INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """)
    connection.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_token_hash ON sesiones(token_hash)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id)")


def migrate_passwords_to_hash(connection):
    users = connection.execute("SELECT id, password_hash FROM usuarios").fetchall()
    for user in users:
        if not is_password_hash(user["password_hash"]):
            connection.execute(
                "UPDATE usuarios SET password_hash = ? WHERE id = ?",
                (hash_password(user["password_hash"]), user["id"]),
            )


def ensure_identity_model(connection):
    ensure_column(connection, "usuarios", "password_inicializada", "INTEGER NOT NULL DEFAULT 1")
    legacy_admin = connection.execute("SELECT id FROM roles_operativos WHERE nombre = 'Administracion'").fetchone()
    current_admin = connection.execute("SELECT id FROM roles_operativos WHERE nombre = 'Admin'").fetchone()
    if legacy_admin and not current_admin:
        connection.execute("UPDATE roles_operativos SET nombre = 'Admin', aparece_plan_semanal = 0 WHERE id = ?", (legacy_admin["id"],))
    elif legacy_admin and current_admin:
        connection.execute(
            "UPDATE personas SET rol_operativo_id = ? WHERE rol_operativo_id = ?",
            (current_admin["id"], legacy_admin["id"]),
        )
        connection.execute("DELETE FROM roles_operativos WHERE id = ?", (legacy_admin["id"],))

    connection.execute("""
        UPDATE usuarios
        SET persona_id = NULL
        WHERE usuario = 'admin'
    """)


def ensure_email_identifiers(connection):
    users = connection.execute("""
        SELECT id, email
        FROM usuarios
        WHERE persona_id IS NOT NULL
          AND email IS NOT NULL
          AND trim(email) <> ''
    """).fetchall()
    used = {
        row["usuario"].lower()
        for row in connection.execute("SELECT usuario FROM usuarios WHERE persona_id IS NULL").fetchall()
        if row["usuario"]
    }
    for user in users:
        email = user["email"].strip().lower()
        if email in used:
            continue
        connection.execute("UPDATE usuarios SET usuario = ? WHERE id = ?", (email, user["id"]))
        used.add(email)


def ensure_bootstrap_admin(connection):
    if not ADMIN_BOOTSTRAP_PASSWORD:
        return
    role = connection.execute("SELECT id FROM roles_app WHERE nombre = 'admin'").fetchone()
    if not role:
        role_id = connection.execute("INSERT INTO roles_app (nombre) VALUES ('admin')").lastrowid
    else:
        role_id = role["id"]
    existing = connection.execute("SELECT id FROM usuarios WHERE usuario = 'admin'").fetchone()
    password = hash_password(ADMIN_BOOTSTRAP_PASSWORD)
    if existing:
        connection.execute("""
            UPDATE usuarios
            SET password_hash = ?, email = 'admin@empresa.local', rol_app_id = ?, activo = 1
            WHERE id = ?
        """, (password, role_id, existing["id"]))
    else:
        connection.execute("""
            INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
            VALUES ('admin', ?, 'admin@empresa.local', NULL, ?, 1)
        """, (password, role_id))


def ensure_seed_named_admin(connection):
    if not ADMIN_BOOTSTRAP_PASSWORD:
        return
    app_role = connection.execute("SELECT id FROM roles_app WHERE nombre = 'admin'").fetchone()
    app_role_id = app_role["id"] if app_role else connection.execute("INSERT INTO roles_app (nombre) VALUES ('admin')").lastrowid
    op_role = connection.execute("SELECT id FROM roles_operativos WHERE nombre = 'Admin'").fetchone()
    op_role_id = op_role["id"] if op_role else connection.execute("INSERT INTO roles_operativos (nombre, aparece_plan_semanal) VALUES ('Admin', 0)").lastrowid

    person = connection.execute("SELECT id FROM personas WHERE lower(coalesce(email, '')) = 'niconu@lang.uy' OR nombre = 'niconu-admin'").fetchone()
    if person:
        persona_id = person["id"]
        connection.execute("""
            UPDATE personas
            SET nombre = 'niconu-admin',
                email = 'niconu@lang.uy',
                rol_operativo_id = ?,
                activo = 1
            WHERE id = ?
        """, (op_role_id, persona_id))
    else:
        persona_id = connection.execute("""
            INSERT INTO personas (nombre, email, rol_operativo_id, activo, horario_tipo)
            VALUES ('niconu-admin', 'niconu@lang.uy', ?, 1, 'variable')
        """, (op_role_id,)).lastrowid

    user = connection.execute("SELECT id FROM usuarios WHERE lower(coalesce(email, '')) = 'niconu@lang.uy' OR usuario = 'niconu@lang.uy'").fetchone()
    password = hash_password(ADMIN_BOOTSTRAP_PASSWORD)
    if user:
        connection.execute("""
            UPDATE usuarios
            SET usuario = 'niconu@lang.uy',
                password_hash = ?,
                email = 'niconu@lang.uy',
                persona_id = ?,
                rol_app_id = ?,
                activo = 1
            WHERE id = ?
        """, (password, persona_id, app_role_id, user["id"]))
    else:
        connection.execute("""
            INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
            VALUES ('niconu@lang.uy', ?, 'niconu@lang.uy', ?, ?, 1)
        """, (password, persona_id, app_role_id))


def ensure_turnos_unique_index(connection):
    ensure_column(connection, "turnos", "origen", "TEXT NOT NULL DEFAULT 'PLAN'")
    ensure_column(connection, "turnos", "origen_referencia_tipo", "TEXT")
    ensure_column(connection, "turnos", "origen_referencia_id", "INTEGER")
    ensure_column(connection, "turnos", "fecha_regularizacion", "TEXT")
    duplicates = connection.execute("""
        SELECT persona_id, fecha, MIN(id) AS keep_id
        FROM turnos
        GROUP BY persona_id, fecha
        HAVING COUNT(*) > 1
    """).fetchall()
    for duplicate in duplicates:
        connection.execute("""
            DELETE FROM turnos
            WHERE persona_id = ? AND fecha = ? AND id <> ?
        """, (duplicate["persona_id"], duplicate["fecha"], duplicate["keep_id"]))
    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_persona_fecha_unique
        ON turnos(persona_id, fecha)
    """)


def ensure_incidencias_schema(connection):
    ensure_column(connection, "incidencias", "clave", "TEXT")
    ensure_column(connection, "incidencias", "severidad", "TEXT NOT NULL DEFAULT 'INFO'")
    ensure_column(connection, "incidencias", "origen", "TEXT NOT NULL DEFAULT 'SISTEMA'")
    ensure_column(connection, "incidencias", "referencia_tipo", "TEXT")
    ensure_column(connection, "incidencias", "referencia_id", "INTEGER")
    ensure_column(connection, "incidencias", "minutos_desfasaje", "INTEGER")
    ensure_column(connection, "incidencias", "aprobado_por_usuario_id", "INTEGER")
    ensure_column(connection, "incidencias", "observacion_aprobacion", "TEXT")
    ensure_column(connection, "incidencias", "fecha_creacion", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
    ensure_column(connection, "incidencias", "fecha_actualizacion", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
    connection.execute("DROP INDEX IF EXISTS idx_incidencias_clave_unique")
    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_incidencias_clave_unique
        ON incidencias(clave)
    """)
    migrate_legacy_missing_mark_incidents(connection)


def migrate_legacy_missing_mark_incidents(connection):
    legacy_rows = connection.execute("""
        SELECT
          incidencias.*,
          personas.nombre AS persona,
          turnos.hora_inicio,
          turnos.hora_fin
        FROM incidencias
        LEFT JOIN personas ON personas.id = incidencias.persona_id
        LEFT JOIN turnos ON turnos.persona_id = incidencias.persona_id AND turnos.fecha = incidencias.fecha
        WHERE incidencias.resuelta = 0
          AND incidencias.tipo IN ('TURNO_SIN_ENTRADA', 'TURNO_SIN_SALIDA')
    """).fetchall()
    grouped = {}
    for row in legacy_rows:
        key = (row["persona_id"], row["fecha"])
        grouped.setdefault(key, {"row": row, "entrada": False, "salida": False})
        if row["tipo"] == "TURNO_SIN_ENTRADA":
            grouped[key]["entrada"] = True
        if row["tipo"] == "TURNO_SIN_SALIDA":
            grouped[key]["salida"] = True

    for (persona_id, fecha), data in grouped.items():
        row = data["row"]
        missing = []
        if data["entrada"]:
            missing.append(f"entrada {row['hora_inicio'] or '--'}")
        if data["salida"]:
            missing.append(f"salida {row['hora_fin'] or '--'}")
        clave = f"turno|{persona_id}|{fecha}|marcas_faltantes"
        connection.execute("""
            INSERT INTO incidencias (
              clave,
              persona_id,
              fecha,
              tipo,
              severidad,
              detalle,
              origen,
              referencia_tipo,
              referencia_id,
              minutos_desfasaje,
              resuelta,
              fecha_creacion,
              fecha_actualizacion
            ) VALUES (?, ?, ?, 'TURNO_CON_MARCAS_FALTANTES', 'ROJA', ?, 'SISTEMA', ?, ?, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(clave) DO UPDATE SET
              tipo = excluded.tipo,
              severidad = excluded.severidad,
              detalle = excluded.detalle,
              origen = excluded.origen,
              referencia_tipo = excluded.referencia_tipo,
              referencia_id = excluded.referencia_id,
              fecha_actualizacion = CURRENT_TIMESTAMP
        """, (
            clave,
            persona_id,
            fecha,
            f"{row['persona'] or 'Sin persona'} no tiene marca de {' ni '.join(missing)}",
            row["referencia_tipo"],
            row["referencia_id"],
        ))

    connection.execute("""
        UPDATE incidencias
        SET resuelta = 1,
            fecha_resolucion = COALESCE(fecha_resolucion, CURRENT_TIMESTAMP),
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE resuelta = 0
          AND tipo IN ('TURNO_SIN_ENTRADA', 'TURNO_SIN_SALIDA')
    """)


def ensure_marcas_approval_schema(connection):
    ensure_column(connection, "marcas", "estado_aprobacion", "TEXT NOT NULL DEFAULT 'PENDIENTE'")
    ensure_column(connection, "marcas", "fecha_aprobacion", "TEXT")
    ensure_column(connection, "marcas", "aprobado_por_usuario_id", "INTEGER")
    ensure_column(connection, "marcas", "observacion_aprobacion", "TEXT")
    ensure_column(connection, "marcas", "fecha_modificacion", "TEXT")
    ensure_column(connection, "marcas", "modificado_por_usuario_id", "INTEGER")
    ensure_column(connection, "marcas", "observacion_modificacion", "TEXT")
    ensure_column(connection, "marcas", "anulada", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(connection, "marcas", "fecha_anulacion", "TEXT")
    ensure_column(connection, "marcas", "anulada_por_usuario_id", "INTEGER")
    ensure_column(connection, "marcas", "observacion_anulacion", "TEXT")
    ensure_column(connection, "marcas", "reloj_facial_id", "INTEGER")
    connection.execute("""
        UPDATE marcas
        SET tipo_marca = 'Marca manual admin'
        WHERE tipo_marca = 'Por usuario'
          AND (modificado_por_usuario_id IS NOT NULL OR observacion_modificacion IS NOT NULL)
    """)


def ensure_face_recognition_schema(connection):
    ensure_column(connection, "rostros_personas", "descriptor_version", "TEXT")
    ensure_column(connection, "rostros_personas", "descriptor_size", "INTEGER")
    ensure_column(connection, "reconocimientos_faciales_log", "threshold", "REAL")
    ensure_column(connection, "reconocimientos_faciales_log", "segundo_score", "REAL")
    ensure_column(connection, "reconocimientos_faciales_log", "margen_score", "REAL")
    ensure_column(connection, "reconocimientos_faciales_log", "candidatos", "INTEGER")
    ensure_column(connection, "reconocimientos_faciales_log", "descriptor_version", "TEXT")
    ensure_column(connection, "reconocimientos_faciales_log", "descriptor_size", "INTEGER")


def ensure_jornales_schema(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS jornales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          persona_id INTEGER NOT NULL,
          fecha TEXT NOT NULL,
          turno_id INTEGER,
          entrada_marca_id INTEGER,
          salida_marca_id INTEGER,
          estado_turno TEXT NOT NULL DEFAULT 'VACIO',
          hora_inicio_plan TEXT,
          hora_fin_plan TEXT,
          actividad_ubicacion TEXT,
          entrada_hora TEXT,
          salida_hora TEXT,
          estado_aprobacion TEXT NOT NULL DEFAULT 'PENDIENTE',
          modo_aprobacion TEXT,
          aprobado_por_usuario_id INTEGER,
          aprobado_por TEXT,
          fecha_aprobacion TEXT,
          observacion_aprobacion TEXT,
          horas_previstas REAL NOT NULL DEFAULT 0,
          horas_trabajadas REAL NOT NULL DEFAULT 0,
          fecha_actualizacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (persona_id) REFERENCES personas(id),
          FOREIGN KEY (turno_id) REFERENCES turnos(id),
          FOREIGN KEY (entrada_marca_id) REFERENCES marcas(id),
          FOREIGN KEY (salida_marca_id) REFERENCES marcas(id),
          FOREIGN KEY (aprobado_por_usuario_id) REFERENCES usuarios(id)
        )
    """)
    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jornales_persona_fecha_unique
        ON jornales(persona_id, fecha)
    """)


def ensure_operation_tarifas_schema(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS operacion_tarifas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          categoria TEXT NOT NULL,
          tipo TEXT NOT NULL,
          hasta_4hs REAL NOT NULL DEFAULT 0,
          de_4_a_8hs REAL NOT NULL DEFAULT 0,
          de_8_a_12hs REAL NOT NULL DEFAULT 0,
          activo INTEGER NOT NULL DEFAULT 1,
          fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          fecha_actualizacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS persona_operacion_tarifas (
          persona_id INTEGER NOT NULL,
          tarifa_id INTEGER NOT NULL,
          PRIMARY KEY (persona_id, tarifa_id),
          FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
          FOREIGN KEY (tarifa_id) REFERENCES operacion_tarifas(id) ON DELETE CASCADE
        )
    """)
    ensure_column(connection, "operaciones", "operacion_tarifa_id", "INTEGER")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_operacion_tarifas_activo ON operacion_tarifas(activo)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_persona_operacion_tarifas_persona ON persona_operacion_tarifas(persona_id)")


def seed_default_operation_tarifas(connection):
    existing = connection.execute("SELECT COUNT(*) AS total FROM operacion_tarifas").fetchone()
    if existing and existing["total"]:
        return
    defaults = [
        ("L1", "Iluminador", 2000, 3000, 4000, 1),
        ("L2", "Iluminador", 3000, 4000, 5000, 1),
        ("L3", "Iluminador", 4000, 5000, 6000, 1),
        ("L1", "Operador", 1500, 2500, 3500, 1),
        ("L2", "Operador", 2500, 3500, 4500, 1),
        ("L3", "Operador", 3000, 4000, 5000, 1),
        ("L4", "Operador", 4000, 5000, 6000, 1),
    ]
    connection.executemany("""
        INSERT INTO operacion_tarifas (categoria, tipo, hasta_4hs, de_4_a_8hs, de_8_a_12hs, activo)
        VALUES (?, ?, ?, ?, ?, ?)
    """, defaults)


def seed_default_persona_operation_tarifas(connection):
    existing = connection.execute("SELECT COUNT(*) AS total FROM persona_operacion_tarifas").fetchone()
    if existing and existing["total"]:
        return
    default_tariff = connection.execute("""
        SELECT id
        FROM operacion_tarifas
        WHERE tipo = 'Operador' AND categoria = 'L1' AND activo = 1
        LIMIT 1
    """).fetchone()
    operators = connection.execute("""
        SELECT personas.id, personas.nombre
        FROM personas
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        WHERE roles_operativos.nombre = 'Operador'
          AND personas.activo = 1
    """).fetchall()
    for person in operators:
        if default_tariff:
            connection.execute("""
                INSERT OR IGNORE INTO persona_operacion_tarifas (persona_id, tarifa_id)
                VALUES (?, ?)
            """, (person["id"], default_tariff["id"]))


def read_body(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw or "{}")


def parse_iso_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def local_date_time(day_value, time_value):
    day_text = str(day_value or "")
    time_text = str(time_value or "").strip()
    iso_date_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", day_text)
    date_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", day_text)
    if iso_date_match:
        date_part = iso_date_match.group(0)
    elif date_match:
        day, month, year = date_match.groups()
        date_part = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    else:
        date_part = datetime.now().strftime("%Y-%m-%d")

    time_match = re.search(r"(\d{1,2}):(\d{2})", time_text)
    if time_match:
        hour, minute = map(int, time_match.groups())
        lower = time_text.lower()
        if ("p" in lower or "pm" in lower) and hour < 12:
            hour += 12
        if ("a" in lower or "am" in lower) and hour == 12:
            hour = 0
        time_part = f"{hour:02d}:{minute:02d}:00"
    else:
        time_part = "00:00:00"
    return f"{date_part} {time_part}"


def normalize_time(value):
    parts = str(value).replace(".", ":").split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 and parts[1] else 0
    return f"{hour:02d}:{minute:02d}"


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


def ensure_role_permissions_module(connection, module_id, role_names):
    row = connection.execute("SELECT valor FROM configuracion WHERE clave = 'role_permissions'").fetchone()
    try:
        permissions = json.loads(row["valor"] or "{}") if row else {}
    except (TypeError, json.JSONDecodeError):
        permissions = {}
    changed = False
    for role_name in role_names:
        role_permissions = permissions.setdefault(role_name, {})
        modules = role_permissions.setdefault("modules", [])
        if module_id not in modules:
            modules.append(module_id)
            changed = True
    if changed:
        connection.execute("""
            INSERT INTO configuracion (clave, valor)
            VALUES ('role_permissions', ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        """, (json.dumps(permissions, ensure_ascii=False),))


def remove_role_permissions_module(connection, module_id):
    row = connection.execute("SELECT valor FROM configuracion WHERE clave = 'role_permissions'").fetchone()
    try:
        permissions = json.loads(row["valor"] or "{}") if row else {}
    except (TypeError, json.JSONDecodeError):
        permissions = {}
    changed = False
    for role_permissions in permissions.values():
        modules = role_permissions.get("modules")
        if isinstance(modules, list) and module_id in modules:
            role_permissions["modules"] = [item for item in modules if item != module_id]
            changed = True
    if changed:
        connection.execute("""
            INSERT INTO configuracion (clave, valor)
            VALUES ('role_permissions', ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        """, (json.dumps(permissions, ensure_ascii=False),))


def ensure_required_role_permissions(connection):
    remove_role_permissions_module(connection, "incidencias")
    for module_id in [
        "plan",
        "dashboard",
        "aprobaciones",
        "operaciones",
        "reportes",
        "analisis",
        "liquidacion",
        "personal",
        "marcas",
        "reconocimientos-faciales",
        "mis-marcas",
        "reloj",
    ]:
        ensure_role_permissions_module(connection, module_id, ["admin", "rrhh"])
    ensure_role_permissions_module(connection, "config", ["admin"])
    ensure_role_permissions_module(connection, "marcas", ["usuario"])
    ensure_role_permissions_module(connection, "mis-marcas", ["usuario"])
    ensure_role_permissions_module(connection, "aprobaciones", ["admin", "rrhh"])
    ensure_role_permissions_module(connection, "operaciones", ["admin", "rrhh"])
    ensure_role_permissions_module(connection, "liquidacion", ["admin", "rrhh"])
    ensure_role_permissions_module(connection, "mis-marcas", ["admin", "rrhh", "usuario"])
    remove_role_permissions_module(connection, "facturacion")
    remove_role_permissions_module(connection, "importacion")


def persona_id_by_name(connection, name):
    clean = str(name or "").strip()
    if not clean:
        return None
    row = connection.execute("SELECT id FROM personas WHERE nombre = ?", (clean,)).fetchone()
    return row["id"] if row else None


def ensure_persona_id(connection, name, role_name="Operador"):
    existing = persona_id_by_name(connection, name)
    if existing:
        return existing
    role_row = connection.execute("SELECT id FROM roles_operativos WHERE nombre = ?", (role_name,)).fetchone()
    if role_row:
        role_id = role_row["id"]
    else:
        role_id = connection.execute(
            "INSERT INTO roles_operativos (nombre, aparece_plan_semanal) VALUES (?, ?)",
            (role_name, 1),
        ).lastrowid
    return connection.execute("""
        INSERT INTO personas (nombre, rol_operativo_id, activo, horario_tipo)
        VALUES (?, ?, 1, 'variable')
    """, (name, role_id)).lastrowid


ROLE_MODULES = {
    "admin": {"*"},
    "rrhh": {"personas", "roles-operativos", "ubicaciones", "configuracion", "usuarios", "turnos", "jornales", "aprobaciones", "marcas", "observaciones-jornal", "operaciones", "operacion-tarifas", "reportes", "reconocimientos-faciales", "access-links"},
    "usuario": {"personas", "turnos", "marcas", "operaciones", "ubicaciones", "configuracion"},
}


PUBLIC_GET_PATHS = {"/api/health", "/api/access-links/validate"}
PUBLIC_POST_PATHS = {"/api/login", "/api/first-access", "/api/access-links/complete"}
INTEGRATION_GET_PATHS = {"/api/integraciones/personal"}


def module_from_path(path):
    parts = path.strip("/").split("/")
    return parts[1] if len(parts) >= 2 and parts[0] == "api" else ""


def public_face_clock_request(method, path, query=None, payload=None):
    raw_token = ""
    if query:
        raw_token = (query.get("token") or [""])[0]
    if not raw_token and payload:
        raw_token = str(payload.get("reloj_token") or payload.get("token") or "")
    link = repo.validate_reloj_facial_token(raw_token, touch=method == "POST" and path in {"/api/marcas", "/api/reloj-facial/validar"})
    if not link:
        return None
    if method == "GET" and path in {"/api/personas", "/api/ubicaciones"}:
        return link
    if method == "GET" and path == "/api/turnos":
        return link
    if method == "POST" and path == "/api/marcas":
        if str((payload or {}).get("tipo_marca") or "").lower() == "por reloj facial":
            return link
    if method == "POST" and path == "/api/reloj-facial/validar":
        return link
    return None


def cookie_header_contains(cookie_header, cookie_name):
    if not cookie_header or not cookie_name:
        return False
    prefix = f"{cookie_name}="
    return any(part.strip().startswith(prefix) for part in str(cookie_header).split(";"))


def external_auth_log(message):
    if EXTERNAL_AUTH_DEBUG:
        print(f"[external-auth] {message}", file=sys.stderr)


class PlannerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-API-Key")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if BASE_PATH and parsed.path == BASE_PATH:
            return self.redirect_to_base_path(parsed.query)
        route_path = self.normalize_request_path(parsed.path)
        if route_path.startswith("/api/"):
            return self.send_error_json("Endpoint no encontrado", 404)
        if not SERVE_STATIC:
            return self.send_error_json("Frontend no servido por este proceso", 404)
        return self.serve_static_with_base_path(parsed, head=True)

    def do_GET(self):
        parsed = urlparse(self.path)
        if BASE_PATH and parsed.path == BASE_PATH:
            return self.redirect_to_base_path(parsed.query)
        route_path = self.normalize_request_path(parsed.path)
        if not route_path.startswith("/api/"):
            if not SERVE_STATIC:
                return self.send_error_json("Frontend no servido por este proceso", 404)
            return self.serve_static_with_base_path(parsed)
        try:
            query = parse_qs(parsed.query)
            if not self.authorize_request("GET", route_path, query=query):
                return
            payload = self.route_get(route_path, query)
            self.send_json(payload)
        except Exception as error:
            if "Endpoint GET no implementado" in str(error):
                return self.send_error_json(str(error), 404)
            print(f"[api-error] GET {route_path}: {error}", file=sys.stderr)
            traceback.print_exc()
            self.send_error_json(str(error), 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        route_path = self.normalize_request_path(parsed.path)
        if not route_path.startswith("/api/"):
            return self.send_error_json("Endpoint no encontrado", 404)
        payload = {}
        try:
            payload = read_body(self)
            if not self.authorize_request("POST", route_path, query=parse_qs(parsed.query), payload=payload):
                return
            response_payload = self.route_post(route_path, payload)
            self.send_json(response_payload)
        except Exception as error:
            if "Endpoint POST no implementado" in str(error):
                return self.send_error_json(str(error), 404)
            print(f"[api-error] POST {route_path}: {error}", file=sys.stderr)
            traceback.print_exc()
            self.send_error_json(str(error), 500)

    def normalize_request_path(self, path):
        if BASE_PATH and path == BASE_PATH:
            return "/"
        if BASE_PATH and path.startswith(f"{BASE_PATH}/"):
            return path[len(BASE_PATH):] or "/"
        return path

    def serve_static_with_base_path(self, parsed, head=False):
        if not BASE_PATH:
            return super().do_HEAD() if head else super().do_GET()
        stripped_path = self.normalize_request_path(parsed.path)
        if stripped_path == "/":
            stripped_path = "/index.html"
        original_path = self.path
        self.path = stripped_path + (f"?{parsed.query}" if parsed.query else "")
        try:
            return super().do_HEAD() if head else super().do_GET()
        finally:
            self.path = original_path

    def redirect_to_base_path(self, query):
        location = f"{BASE_PATH}/"
        if query:
            location = f"{location}?{query}"
        self.send_response(301)
        self.send_header("Location", location)
        self.end_headers()

    def authorize_request(self, method, path, query=None, payload=None):
        if (method == "GET" and path in PUBLIC_GET_PATHS) or (method == "POST" and path in PUBLIC_POST_PATHS):
            self.current_user = None
            return True
        if method == "GET" and path in INTEGRATION_GET_PATHS:
            if self.authenticate_integration_key():
                self.current_user = {
                    "id": None,
                    "usuario": "integracion-api",
                    "rol_app": "integracion",
                }
                return True
            self.send_error_json("API key inválida o no configurada", 401)
            return False
        face_clock_link = public_face_clock_request(method, path, query=query, payload=payload)
        if face_clock_link:
            self.current_user = {
                "id": None,
                "usuario": f"reloj-facial:{face_clock_link['id']}",
                "rol_app": "public",
                "reloj_facial_id": face_clock_link["id"],
                "reloj_facial_nombre": face_clock_link["nombre"],
            }
            return True
        user = self.authenticate_user()
        if not user:
            self.send_error_json("No autorizado", 401)
            return False
        if not self.user_can_access(user, method, path):
            self.send_error_json("Permiso insuficiente", 403)
            return False
        self.current_user = user
        return True

    def authenticate_integration_key(self):
        if not INTEGRATION_API_KEY:
            return False
        raw_key = self.headers.get("X-API-Key", "").strip()
        auth_header = self.headers.get("Authorization", "")
        if not raw_key and auth_header.lower().startswith("bearer "):
            raw_key = auth_header.split(" ", 1)[1].strip()
        return bool(raw_key) and hmac.compare_digest(raw_key, INTEGRATION_API_KEY)

    def authenticate_user(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
            if raw_token:
                user = repo.user_by_session_token(raw_token)
                if user:
                    return user
        return self.authenticate_external_cookie()

    def authenticate_external_cookie(self):
        if not EXTERNAL_AUTH_ME_URL:
            external_auth_log("sin PLANNER_EXTERNAL_AUTH_ME_URL; se omite SSO externo")
            return None
        cookie_header = self.headers.get("Cookie", "")
        if not cookie_header_contains(cookie_header, EXTERNAL_AUTH_COOKIE_NAME):
            external_auth_log(f"no se encontro cookie {EXTERNAL_AUTH_COOKIE_NAME}")
            return None
        external_auth_log(f"cookie {EXTERNAL_AUTH_COOKIE_NAME} detectada; consultando /me")
        try:
            request = Request(
                EXTERNAL_AUTH_ME_URL,
                headers={
                    "Accept": "application/json",
                    "Cookie": cookie_header,
                },
            )
            with urlopen(request, timeout=EXTERNAL_AUTH_TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    external_auth_log(f"/me respondio {response.status}")
                    return None
                external_user = json.loads(response.read().decode("utf-8"))
                external_auth_log("/me respondio 200")
        except HTTPError as error:
            external_auth_log(f"/me respondio {error.code}")
            return None
        except (URLError, TimeoutError) as error:
            external_auth_log(f"error de conexion contra /me: {error.__class__.__name__}")
            return None
        except (ValueError, json.JSONDecodeError):
            external_auth_log("/me devolvio una respuesta no JSON")
            return None

        email = str(external_user.get("email") or "").strip().lower()
        if not email:
            external_auth_log("/me no devolvio email")
            return None
        external_auth_log(f"/me devolvio email {email}")
        user = repo.user_by_email(email)
        if not user:
            external_auth_log(f"email {email} no existe activo en RRHH")
            return None
        external_auth_log(f"email {email} aceptado con rol local {user.get('rol_app')}")
        user["external_auth"] = True
        user["external_user_id"] = external_user.get("id")
        user["external_role"] = external_user.get("role")
        user["external_name"] = external_user.get("name")
        return user

    def user_can_access(self, user, method, path):
        if path == "/api/session":
            return True
        role = str(user.get("rol_app") or "").lower()
        if role == "usuario":
            if method == "GET" and path in {
                "/api/personas",
                "/api/turnos",
                "/api/configuracion",
                "/api/ubicaciones",
                "/api/marcas",
                "/api/operaciones",
                "/api/operacion-tarifas",
            }:
                return True
            if method == "POST" and path in {"/api/marcas", "/api/operaciones"}:
                return True
            return False
        if role == "rrhh" and method == "GET" and path == "/api/operacion-tarifas":
            return True
        allowed = ROLE_MODULES.get(role, set())
        if "*" in allowed:
            return True
        return module_from_path(path) in allowed

    def route_get(self, path, query):
        return api_routes.route_get(self, path, query)

    def route_post(self, path, payload):
        return api_routes.route_post(self, path, payload)

    def login(self, payload):
        identifier = str(payload.get("usuario") or payload.get("email") or "").strip()
        password = str(payload.get("password", ""))
        if not identifier or not password:
            raise ValueError("Correo y contraseña requeridos")
        user = repo.authenticate_login(identifier, password)
        if not user:
            return {"ok": False}
        token = secrets.token_urlsafe(32)
        expires_at = repo.create_session(user["id"], token)
        return {
            "ok": True,
            "token": token,
            "expiresAt": expires_at,
            "user": {
                "id": f"db-{user['id']}",
                "username": user["email"] or user["usuario"],
                "email": user["email"] or "",
                "roleId": user["rol_app"],
                "personName": user["persona"] or "",
                "active": True,
            },
        }

    def session(self):
        user = self.current_user
        if not user:
            return {"ok": False}
        return {
            "ok": True,
            "user": {
                "id": f"db-{user['id']}",
                "username": user["email"] or user["usuario"],
                "email": user["email"] or "",
                "roleId": user["rol_app"],
                "personName": user.get("persona") or user.get("external_name") or "",
                "active": True,
                "externalAuth": bool(user.get("external_auth")),
            },
        }

    def first_access(self, payload):
        return repo.complete_first_access(
            payload.get("email"),
            payload.get("password"),
            payload.get("security_code") or payload.get("codigo_seguridad"),
        )

    def access_link_base_url(self):
        if PUBLIC_BASE_URL:
            return PUBLIC_BASE_URL
        proto = self.headers.get("X-Forwarded-Proto") or ("https" if self.headers.get("X-Forwarded-Ssl") == "on" else "http")
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or f"{HOST}:{PORT}"
        return f"{proto}://{host}{BASE_PATH}"

    def create_access_link(self, payload):
        creator_id = self.current_user.get("id") if self.current_user else None
        result = repo.create_access_token(payload, creator_id)
        raw_token = result.pop("token")
        result["link"] = f"{self.access_link_base_url()}/set-password.html?token={raw_token}"
        return result

    def validate_access_link(self, query):
        token = (query.get("token") or [""])[0]
        return repo.access_token_status(token)

    def complete_access_link(self, payload):
        return repo.complete_access_token(payload.get("token"), payload.get("password"))

    def role_id_for(self, connection, role_name):
        return repo.role_id_for(connection, role_name)

    def app_role_id_for(self, connection, role_name):
        return repo.app_role_id_for(connection, role_name)

    def read_persona(self, connection, persona_id):
        return repo.read_persona(connection, persona_id)

    def save_persona(self, payload, persona_id=None):
        return repo.save_persona(payload, persona_id)

    def save_usuario_for_persona(self, connection, persona_id, access_payload):
        return repo.save_usuario_for_persona(connection, persona_id, access_payload)

    def toggle_persona(self, persona_id):
        return repo.toggle_persona(persona_id)

    def save_rol_operativo(self, payload, role_id=None):
        return repo.save_rol_operativo(payload, role_id)

    def delete_rol_operativo(self, role_id):
        return repo.delete_rol_operativo(role_id)

    def save_ubicacion(self, payload, location_id=None):
        return repo.save_ubicacion(payload, location_id)

    def delete_ubicacion(self, location_id):
        return repo.delete_ubicacion(location_id)

    def save_configuracion(self, payload):
        return repo.save_configuracion(payload)

    def save_usuario(self, payload, user_id=None):
        return repo.save_usuario(payload, user_id)

    def toggle_usuario(self, user_id):
        return repo.toggle_usuario(user_id)

    def create_reloj_facial(self, payload):
        raw_token = secrets.token_urlsafe(32)
        return repo.create_reloj_facial(payload, raw_token)

    def toggle_reloj_facial(self, link_id):
        return repo.toggle_reloj_facial(link_id)

    def delete_reloj_facial(self, link_id):
        return repo.delete_reloj_facial(link_id)

    def create_persona_rostro(self, persona_id, payload):
        user_id = self.current_user.get("id") if self.current_user else None
        return repo.create_persona_rostro(persona_id, payload, usuario_id=user_id)

    def toggle_persona_rostro(self, face_id):
        return repo.toggle_persona_rostro(face_id)

    def delete_persona_rostro(self, face_id):
        return repo.delete_persona_rostro(face_id)

    def validate_reloj_facial(self, payload):
        return repo.validate_face_descriptor(payload, face_clock_link=self.current_user)

    def approval_tolerance_minutes(self, connection):
        return AprobacionesService.approval_tolerance_minutes(connection)

    def preapprove_jornadas_for_range(self, connection, date_from, date_to, persona=None, persona_id=None):
        return AprobacionesService.preapprove_for_range(connection, date_from, date_to, persona=persona, persona_id=persona_id)

    def read_aprobaciones(self, date_from, date_to, persona=None):
        with connect() as connection:
            persona_id = int(persona) if str(persona or "").isdigit() else None
            persona_name = None if persona_id else persona
            rows_out = AprobacionesService.read(connection, date_from, date_to, persona=persona_name, persona_id=persona_id)
            if date_from and date_to:
                ObservacionesJornalService.sync_from_incidencias(connection, date_from, date_to)
            connection.commit()
            return rows_out

    def read_jornales(self, date_from, date_to, persona=None):
        with connect() as connection:
            persona_id = int(persona) if str(persona or "").isdigit() else None
            persona_name = None if persona_id else persona
            AprobacionesService.read(connection, date_from, date_to, persona=persona_name, persona_id=persona_id)
            if date_from and date_to:
                ObservacionesJornalService.sync_from_incidencias(connection, date_from, date_to)
            connection.commit()
            return repo.list_jornales(date_from, date_to, persona=persona)

    def update_aprobaciones(self, payload):
        with connect() as connection:
            result = AprobacionesService.update(connection, payload)
            date_from = payload.get("desde") or payload.get("fecha")
            date_to = payload.get("hasta") or payload.get("fecha") or date_from
            if date_from and date_to:
                AprobacionesService.read(connection, date_from, date_to)
            connection.commit()
            return result

    def generate_incidencias(self, payload):
        date_from = payload.get("desde") or payload.get("from")
        date_to = payload.get("hasta") or payload.get("to") or date_from
        if not date_from or not date_to:
            raise ValueError("Rango de fechas requerido")
        with connect() as connection:
            result = IncidenciasService.generate_for_range(connection, date_from, date_to)
            connection.commit()
            return result

    def resolve_incidencias(self, payload):
        with connect() as connection:
            result = IncidenciasService.resolve(connection, payload)
            for jornal in result.get("touched_jornales", []):
                self.sync_jornal_for_person_day(connection, jornal.get("persona_id"), jornal.get("fecha"))
            connection.commit()
            return result

    def pass_incidencias_to_plan(self, payload):
        with connect() as connection:
            result = IncidenciasService.pass_to_plan(connection, payload)
            for date_value in result.get("touched_dates", []):
                self.preapprove_jornadas_for_range(connection, date_value, date_value)
                IncidenciasService.generate_for_range(connection, date_value, date_value)
            for jornal in result.get("touched_jornales", []):
                self.sync_jornal_for_person_day(connection, jornal.get("persona_id"), jornal.get("fecha"))
            connection.commit()
            return {"ok": True, "turnos": result.get("turnos", 0)}

    def mark_incidencias_absent(self, payload):
        with connect() as connection:
            result = IncidenciasService.mark_absent(connection, payload)
            for date_value in result.get("touched_dates", []):
                self.preapprove_jornadas_for_range(connection, date_value, date_value)
                IncidenciasService.generate_for_range(connection, date_value, date_value)
            for jornal in result.get("touched_jornales", []):
                self.sync_jornal_for_person_day(connection, jornal.get("persona_id"), jornal.get("fecha"))
            connection.commit()
            return {"ok": True, "turnos": result.get("turnos", 0)}

    def generate_observaciones_jornal(self, payload):
        return self.generate_incidencias(payload)

    def resolve_observaciones_jornal(self, payload):
        return self.resolve_incidencias(payload)

    def pass_observaciones_to_plan(self, payload):
        return self.pass_incidencias_to_plan(payload)

    def mark_observaciones_absent(self, payload):
        return self.mark_incidencias_absent(payload)

    def generate_incidencias_for_range(self, connection, date_from, date_to):
        return IncidenciasService.generate_for_range(connection, date_from, date_to)

    def upsert_desfasaje_incidencia(self, connection, active_keys, base_key, turno, marks, kind, expected, green_minutes, yellow_minutes):
        return IncidenciasService.upsert_desfasaje_incidencia(
            connection, active_keys, base_key, turno, marks, kind, expected, green_minutes, yellow_minutes
        )

    def upsert_incidencia(self, connection, incident):
        return IncidenciasService.upsert_incidencia(connection, incident)

    def save_turno(self, payload):
        with connect() as connection:
            persona_id = repo.upsert_turno(connection, payload)
            if payload.get("fecha"):
                self.mark_approved_day_requires_review(connection, persona_id, payload["fecha"])
                self.preapprove_jornadas_for_range(connection, payload["fecha"], payload["fecha"])
                self.generate_incidencias_for_range(connection, payload["fecha"], payload["fecha"])
                self.sync_jornal_for_person_day(connection, persona_id, payload["fecha"])
            connection.commit()
        return {"ok": True}

    def save_turnos_lote(self, payload):
        turnos = payload.get("turnos") or []
        dates = sorted({turno.get("fecha") for turno in turnos if turno.get("fecha")})
        with connect() as connection:
            touched_jornales = []
            for turno in turnos:
                persona_id = repo.upsert_turno(connection, turno)
                if persona_id and turno.get("fecha"):
                    self.mark_approved_day_requires_review(connection, persona_id, turno["fecha"])
                    touched_jornales.append({"persona_id": persona_id, "fecha": turno["fecha"]})
            if dates:
                self.preapprove_jornadas_for_range(connection, dates[0], dates[-1])
                self.generate_incidencias_for_range(connection, dates[0], dates[-1])
                for jornal in touched_jornales:
                    self.sync_jornal_for_person_day(connection, jornal["persona_id"], jornal["fecha"])
            connection.commit()
        return {"ok": True, "turnos": len(turnos)}

    def upsert_turno(self, connection, payload):
        return repo.upsert_turno(connection, payload)

    def create_marca(self, payload):
        with connect() as connection:
            if self.current_user and self.current_user.get("reloj_facial_id"):
                payload["reloj_facial_id"] = self.current_user["reloj_facial_id"]
            created = repo.create_marca(connection, payload)
            mark_day = date_from_db_datetime(payload["fecha_hora"])
            if payload.get("registrada_por_admin"):
                affected_dates = [mark_day]
                previous_day = parse_iso_date(mark_day)
                if previous_day:
                    affected_dates.append((previous_day - timedelta(days=1)).strftime("%Y-%m-%d"))
                self.refresh_mark_workflow(connection, created["persona_id"], affected_dates)
            else:
                self.refresh_mark_workflow(connection, created["persona_id"], [mark_day])
            connection.commit()
            return {"id": created["id"]}

    def update_marca(self, marca_id, payload):
        mark_type = str(payload.get("tipo") or "").strip()
        date_value = str(payload.get("fecha") or "").strip()
        time_value = str(payload.get("hora") or "").strip()
        if mark_type.lower() not in {"entrada", "salida"}:
            raise ValueError("Tipo de marca inválido")
        if not date_value or not time_value:
            raise ValueError("Fecha y hora requeridas")

        with connect() as connection:
            fecha_hora = local_date_time(date_value, time_value)
            updated = repo.update_marca(connection, marca_id, payload, fecha_hora)
            old_day = date_from_db_datetime(updated["old_fecha_hora"])
            new_day = date_from_db_datetime(fecha_hora)
            if old_day and old_day != new_day:
                self.refresh_mark_workflow(connection, updated["persona_id"], [old_day])
            if new_day:
                IncidenciasService.resolve_person_day_system_incidents(
                    connection,
                    updated["persona_id"],
                    new_day,
                    repo.normalize_user_id(payload.get("usuario_id")),
                    updated["observacion_modificacion"],
                )
                self.sync_jornal_for_person_day(connection, updated["persona_id"], new_day)
            connection.commit()
            return {"ok": True, "id": marca_id, "observacion_modificacion": updated["observacion_modificacion"]}

    def delete_marca(self, marca_id):
        with connect() as connection:
            deleted = repo.delete_marca(connection, marca_id)
            mark_day = date_from_db_datetime(deleted["fecha_hora"])
            self.refresh_mark_workflow(connection, deleted["persona_id"], [mark_day])
            connection.commit()
            return {"ok": True, "id": marca_id}

    def refresh_mark_workflow(self, connection, persona_id, date_values):
        dates = sorted({
            affected_date
            for date_value in date_values
            for affected_date in self.mark_affected_dates(date_value)
        })
        for date_value in dates:
            self.preapprove_jornadas_for_range(connection, date_value, date_value, persona_id=persona_id)
            self.generate_incidencias_for_range(connection, date_value, date_value)
            self.sync_jornal_for_person_day(connection, persona_id, date_value)

    def mark_approved_day_requires_review(self, connection, persona_id, date_value):
        if not persona_id or not date_value:
            return 0
        connection.execute("""
            UPDATE marcas
            SET
              estado_aprobacion = 'REQUIERE_REVISION',
              fecha_aprobacion = NULL,
              aprobado_por_usuario_id = NULL,
              observacion_aprobacion = 'Plan semanal modificado después de validar'
            WHERE persona_id = ?
              AND date(fecha_hora) = date(?)
              AND COALESCE(anulada, 0) = 0
              AND estado_aprobacion IN ('APROBADA', 'VALIDADA_CON_INCIDENCIA')
        """, (persona_id, date_value))
        return connection.execute("SELECT changes() AS total").fetchone()["total"]

    def mark_affected_dates(self, date_value):
        dates = {date_value} if date_value else set()
        parsed = parse_iso_date(date_value)
        if parsed:
            dates.add((parsed - timedelta(days=1)).strftime("%Y-%m-%d"))
        return dates

    def sync_jornal_for_person_day(self, connection, persona_id, date_value):
        if persona_id and date_value:
            AprobacionesService.read(connection, date_value, date_value, persona_id=persona_id)
            ObservacionesJornalService.sync_from_incidencias(connection, date_value, date_value)

    def create_operacion(self, payload):
        return repo.create_operacion(payload)

    def update_operacion(self, operacion_id, payload):
        return repo.update_operacion(operacion_id, payload)

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, message, status):
        self.send_json({"ok": False, "error": message}, status=status)


if __name__ == "__main__":
    ensure_database()
    server = ThreadingHTTPServer((HOST, PORT), PlannerHandler)
    print(f"Backend local: http://{HOST}:{PORT}")
    if BASE_PATH:
        print(f"Base path: {BASE_PATH}")
    print("Base de datos: PostgreSQL" if IS_POSTGRES else f"Base de datos: {DB_PATH}")
    server.serve_forever()
