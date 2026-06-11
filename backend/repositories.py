import json
from datetime import datetime, timedelta

from .database import connect, rows, one
from .security import hash_password, token_hash, verify_password
from .settings import SESSION_TTL_HOURS


def list_personas():
    return rows("""
        SELECT
          personas.id,
          personas.nombre,
          personas.codigo_privado,
          personas.email,
          personas.activo,
          personas.horario_tipo,
          personas.horario_fijo_json,
          personas.valor_hora,
          personas.horas_acordadas,
          personas.tipo_libreta,
          personas.vencimiento_libreta,
          personas.vencimiento_carne_salud,
          roles_operativos.nombre AS rol_operativo,
          usuarios.id AS usuario_id,
          usuarios.usuario,
          usuarios.email AS usuario_email,
          usuarios.activo AS usuario_activo,
          roles_app.nombre AS rol_app,
          (
            SELECT group_concat(tarifa_id)
            FROM persona_operacion_tarifas
            WHERE persona_operacion_tarifas.persona_id = personas.id
          ) AS operacion_tarifa_ids
        FROM personas
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        LEFT JOIN usuarios ON usuarios.persona_id = personas.id
        LEFT JOIN roles_app ON roles_app.id = usuarios.rol_app_id
        ORDER BY roles_operativos.id, personas.nombre
    """)


def list_usuarios():
    return rows("""
        SELECT
          usuarios.id,
          usuarios.usuario,
          usuarios.email,
          usuarios.activo,
          personas.nombre AS persona,
          roles_app.nombre AS rol_app
        FROM usuarios
        LEFT JOIN personas ON personas.id = usuarios.persona_id
        JOIN roles_app ON roles_app.id = usuarios.rol_app_id
        ORDER BY usuarios.usuario
    """)


def list_roles_app():
    return rows("SELECT * FROM roles_app ORDER BY id")


def list_roles_operativos():
    return rows("SELECT * FROM roles_operativos ORDER BY id")


def list_ubicaciones():
    return rows("SELECT * FROM ubicaciones ORDER BY nombre")


def list_operaciones():
    return rows("""
        SELECT
          operaciones.*,
          personas.nombre AS persona,
          operacion_tarifas.categoria AS tarifa_categoria,
          operacion_tarifas.tipo AS tarifa_tipo
        FROM operaciones
        JOIN personas ON personas.id = operaciones.persona_id
        LEFT JOIN operacion_tarifas ON operacion_tarifas.id = operaciones.operacion_tarifa_id
        ORDER BY operaciones.fecha_hora DESC
    """)


def list_operacion_tarifas(active_only=False):
    where = "WHERE activo = 1" if active_only else ""
    return rows(f"""
        SELECT *
        FROM operacion_tarifas
        {where}
        ORDER BY activo DESC, tipo, categoria
    """)


def list_facturacion(date_from=None, date_to=None):
    where = []
    params = []
    if date_from:
        where.append("fecha >= ?")
        params.append(date_from)
    if date_to:
        where.append("fecha <= ?")
        params.append(date_to)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    return rows(f"""
        SELECT *
        FROM facturacion
        {where_sql}
        ORDER BY fecha DESC, orden
    """, tuple(params))


def list_configuracion():
    return rows("SELECT * FROM configuracion ORDER BY clave")


def list_turnos(date_from=None, date_to=None):
    if date_from and date_to:
        return rows("""
            SELECT
              turnos.*,
              personas.nombre AS persona,
              roles_operativos.nombre AS rol_operativo
            FROM turnos
            JOIN personas ON personas.id = turnos.persona_id
            LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
            WHERE turnos.fecha BETWEEN ? AND ?
            ORDER BY turnos.fecha, personas.nombre
        """, (date_from, date_to))
    return rows("""
        SELECT
          turnos.*,
          personas.nombre AS persona,
          roles_operativos.nombre AS rol_operativo
        FROM turnos
        JOIN personas ON personas.id = turnos.persona_id
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        ORDER BY turnos.fecha, personas.nombre
    """)


def list_jornales(date_from=None, date_to=None, persona=None):
    where = []
    params = []
    if date_from:
        where.append("jornales.fecha >= ?")
        params.append(date_from)
    if date_to:
        where.append("jornales.fecha <= ?")
        params.append(date_to)
    if persona:
        where.append("personas.nombre = ?")
        params.append(persona)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    return rows(f"""
        SELECT
          jornales.*,
          personas.nombre AS persona,
          roles_operativos.nombre AS rol_operativo
        FROM jornales
        JOIN personas ON personas.id = jornales.persona_id
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        {where_sql}
        ORDER BY jornales.fecha, personas.nombre
    """, tuple(params))


def list_marcas(persona=None, date_from=None, date_to=None):
    where = []
    params = []
    if persona:
        where.append("personas.nombre = ?")
        params.append(persona)
    if date_from:
        where.append("date(marcas.fecha_hora) >= date(?)")
        params.append(date_from)
    if date_to:
        where.append("date(marcas.fecha_hora) <= date(?)")
        params.append(date_to)
    where.append("COALESCE(marcas.anulada, 0) = 0")
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    return rows(f"""
        SELECT
          marcas.*,
          personas.nombre AS persona,
          aprobador.usuario AS aprobado_por_usuario,
          editor.usuario AS modificado_por_usuario
        FROM marcas
        JOIN personas ON personas.id = marcas.persona_id
        LEFT JOIN usuarios AS aprobador ON aprobador.id = marcas.aprobado_por_usuario_id
        LEFT JOIN usuarios AS editor ON editor.id = marcas.modificado_por_usuario_id
        {where_sql}
        ORDER BY marcas.fecha_hora DESC
    """, tuple(params))


def list_incidencias(date_from=None, date_to=None, status=None):
    where = []
    params = []
    if date_from:
        where.append("incidencias.fecha >= ?")
        params.append(date_from)
    if date_to:
        where.append("incidencias.fecha <= ?")
        params.append(date_to)
    if status == "pendientes":
        where.append("incidencias.resuelta = 0")
    if status == "resueltas":
        where.append("incidencias.resuelta = 1")
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    result = rows("""
        SELECT
          incidencias.*,
          personas.nombre AS persona,
          aprobador.usuario AS aprobado_por_usuario,
          marca.fecha_hora AS marca_fecha_hora,
          marca.tipo AS marca_tipo,
          marca.actividad_ubicacion AS marca_actividad_ubicacion,
          marca.ubicacion_detectada AS marca_ubicacion_detectada,
          marca.latitud AS marca_latitud,
          marca.longitud AS marca_longitud,
          COALESCE(turno.estado, turno_fecha.estado) AS turno_estado,
          COALESCE(turno.hora_inicio, turno_fecha.hora_inicio) AS turno_hora_inicio,
          COALESCE(turno.hora_fin, turno_fecha.hora_fin) AS turno_hora_fin,
          COALESCE(turno.actividad_ubicacion, turno_fecha.actividad_ubicacion) AS turno_actividad_ubicacion,
          (
            SELECT GROUP_CONCAT(marca_ordenada.descripcion, ' · ')
            FROM (
              SELECT marcas_dia.tipo || ' ' || substr(marcas_dia.fecha_hora, 12, 5) AS descripcion
              FROM marcas AS marcas_dia
              WHERE marcas_dia.persona_id = incidencias.persona_id
                AND date(marcas_dia.fecha_hora) = date(incidencias.fecha)
                AND COALESCE(marcas_dia.anulada, 0) = 0
              ORDER BY marcas_dia.fecha_hora
            ) AS marca_ordenada
          ) AS marcas_horarios
        FROM incidencias
        LEFT JOIN personas ON personas.id = incidencias.persona_id
        LEFT JOIN usuarios AS aprobador ON aprobador.id = incidencias.aprobado_por_usuario_id
        LEFT JOIN marcas AS marca ON incidencias.referencia_tipo = 'marca' AND marca.id = incidencias.referencia_id AND COALESCE(marca.anulada, 0) = 0
        LEFT JOIN turnos AS turno ON incidencias.referencia_tipo = 'turno' AND turno.id = incidencias.referencia_id
        LEFT JOIN turnos AS turno_fecha ON turno_fecha.persona_id = incidencias.persona_id AND turno_fecha.fecha = incidencias.fecha
        {where_sql}
        ORDER BY incidencias.fecha DESC
    """.format(where_sql=where_sql), tuple(params))
    for incident in result:
        apply_incident_actions(incident)
    return result


def apply_incident_actions(incident):
    resolved = bool(int(incident.get("resuelta") or 0))
    requires_plan = incident.get("tipo") == "MARCA_EN_ESTADO_SIN_HORARIO"
    can_mark_absent = incident.get("tipo") in {"TURNO_CON_MARCAS_FALTANTES", "TURNO_SIN_ENTRADA", "TURNO_SIN_SALIDA"} and not str(incident.get("marcas_horarios") or "").strip()
    incident["acciones"] = {
        "ver_detalle": True,
        "editar_marca": incident.get("referencia_tipo") == "marca" and not resolved,
        "pasar_a_plan": requires_plan and not resolved,
        "marcar_ausente": can_mark_absent and not resolved,
        "aprobar": not resolved and not can_mark_absent,
    }
    incident["bloqueo_aprobar"] = "Cargar marca manual o marcar ausente" if can_mark_absent else ""


def user_for_login(identifier):
    return one("""
        SELECT
          usuarios.id,
          usuarios.usuario,
          usuarios.email,
          usuarios.activo,
          usuarios.password_hash,
          personas.nombre AS persona,
          roles_app.nombre AS rol_app
        FROM usuarios
        LEFT JOIN personas ON personas.id = usuarios.persona_id
        JOIN roles_app ON roles_app.id = usuarios.rol_app_id
        WHERE lower(coalesce(usuarios.email, '')) = lower(?)
           OR lower(usuarios.usuario) = lower(?)
    """, (identifier, identifier))


def authenticate_login(identifier, password):
    user = user_for_login(identifier)
    if not user or not user["activo"] or not verify_password(password, user["password_hash"]):
        return None
    return user


def create_session(usuario_id, token):
    expires_at = (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    with connect() as connection:
        connection.execute("""
            INSERT INTO sesiones (token_hash, usuario_id, fecha_expiracion, activa)
            VALUES (?, ?, ?, 1)
        """, (token_hash(token), usuario_id, expires_at))
        connection.commit()
    return expires_at


def user_by_session_token(raw_token):
    with connect() as connection:
        row = connection.execute("""
            SELECT
              sesiones.id AS sesion_id,
              sesiones.fecha_expiracion,
              usuarios.id,
              usuarios.usuario,
              usuarios.email,
              usuarios.activo,
              personas.nombre AS persona,
              roles_app.nombre AS rol_app
            FROM sesiones
            JOIN usuarios ON usuarios.id = sesiones.usuario_id
            LEFT JOIN personas ON personas.id = usuarios.persona_id
            JOIN roles_app ON roles_app.id = usuarios.rol_app_id
            WHERE sesiones.token_hash = ?
              AND sesiones.activa = 1
              AND datetime(sesiones.fecha_expiracion) > datetime('now')
              AND usuarios.activo = 1
        """, (token_hash(raw_token),)).fetchone()
        return dict(row) if row else None


def username_by_id(connection, user_id):
    if not user_id:
        return None
    row = connection.execute("SELECT usuario FROM usuarios WHERE id = ?", (user_id,)).fetchone()
    return row["usuario"] if row else None


def reset_user_password(email, password):
    clean_email = str(email or "").strip().lower()
    with connect() as connection:
        user = connection.execute("""
            SELECT id FROM usuarios
            WHERE lower(coalesce(email, '')) = ?
               OR lower(usuario) = ?
        """, (clean_email, clean_email)).fetchone()
        if not user:
            return False
        connection.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?", (hash_password(password), user["id"]))
        connection.commit()
        return True


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
    role_id = role_id_for(connection, role_name)
    return connection.execute("""
        INSERT INTO personas (nombre, rol_operativo_id, activo, horario_tipo)
        VALUES (?, ?, 1, 'variable')
    """, (name, role_id)).lastrowid


def role_id_for(connection, role_name):
    row = connection.execute("SELECT id FROM roles_operativos WHERE nombre = ?", (role_name,)).fetchone()
    if row:
        return row["id"]
    cursor = connection.execute(
        "INSERT INTO roles_operativos (nombre, aparece_plan_semanal) VALUES (?, ?)",
        (role_name, 1),
    )
    return cursor.lastrowid


def app_role_id_for(connection, role_name):
    row = connection.execute("SELECT id FROM roles_app WHERE nombre = ?", (role_name,)).fetchone()
    if row:
        return row["id"]
    cursor = connection.execute("INSERT INTO roles_app (nombre) VALUES (?)", (role_name,))
    return cursor.lastrowid


def read_persona(connection, persona_id):
    row = connection.execute("""
        SELECT
          personas.id,
          personas.nombre,
          personas.codigo_privado,
          personas.email,
          personas.activo,
          personas.horario_tipo,
          personas.horario_fijo_json,
          personas.valor_hora,
          personas.horas_acordadas,
          personas.tipo_libreta,
          personas.vencimiento_libreta,
          personas.vencimiento_carne_salud,
          roles_operativos.nombre AS rol_operativo,
          usuarios.id AS usuario_id,
          usuarios.usuario,
          usuarios.email AS usuario_email,
          usuarios.activo AS usuario_activo,
          roles_app.nombre AS rol_app
        FROM personas
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        LEFT JOIN usuarios ON usuarios.persona_id = personas.id
        LEFT JOIN roles_app ON roles_app.id = usuarios.rol_app_id
        WHERE personas.id = ?
    """, (persona_id,)).fetchone()
    if not row:
        raise ValueError("Persona no encontrada")
    return dict(row)


def normalize_private_code(value):
    clean = str(value or "").strip()
    if not clean:
        return None
    if not clean.isdigit() or len(clean) > 3:
        raise ValueError("El ID privado debe ser numérico de hasta 3 cifras")
    return clean.zfill(3)


def next_private_code(connection):
    used = {
        row["codigo_privado"]
        for row in connection.execute("SELECT codigo_privado FROM personas WHERE codigo_privado IS NOT NULL").fetchall()
        if row["codigo_privado"]
    }
    for number in range(100, 1000):
        code = f"{number:03d}"
        if code not in used:
            return code
    raise ValueError("No hay IDs privados disponibles")


def save_usuario_for_persona(connection, persona_id, access_payload):
    if not isinstance(access_payload, dict):
        return

    existing = connection.execute("SELECT * FROM usuarios WHERE persona_id = ?", (persona_id,)).fetchone()
    enabled = bool(access_payload.get("habilitado"))
    if not enabled:
        if existing:
            connection.execute("UPDATE usuarios SET activo = 0 WHERE id = ?", (existing["id"],))
        return

    person = connection.execute("SELECT email FROM personas WHERE id = ?", (persona_id,)).fetchone()
    email = str(person["email"] if person else "").strip().lower()
    if not email:
        raise ValueError("El correo es obligatorio para crear acceso")
    username = email
    if username.lower() in {"admin", "rrhh"}:
        raise ValueError("admin y rrhh se reservan como usuarios técnicos del sistema")

    duplicate = connection.execute(
        "SELECT id FROM usuarios WHERE (usuario = ? OR lower(coalesce(email, '')) = lower(?)) AND (? IS NULL OR id <> ?)",
        (username, email, existing["id"] if existing else None, existing["id"] if existing else None),
    ).fetchone()
    if duplicate:
        raise ValueError("Ese correo ya tiene acceso")

    password = str(access_payload.get("password", "")).strip()
    if not existing and not password:
        raise ValueError("La contraseña temporal es obligatoria para crear acceso")

    rol_app_id = app_role_id_for(connection, access_payload.get("rol_app") or "usuario")
    active = int(bool(access_payload.get("activo", True)))

    if existing:
        if password:
            connection.execute("""
                UPDATE usuarios
                SET usuario = ?, password_hash = ?, email = ?, rol_app_id = ?, activo = ?
                WHERE id = ?
            """, (username, hash_password(password), email, rol_app_id, active, existing["id"]))
        else:
            connection.execute("""
                UPDATE usuarios
                SET usuario = ?, email = ?, rol_app_id = ?, activo = ?
                WHERE id = ?
            """, (username, email, rol_app_id, active, existing["id"]))
        return

    connection.execute("""
        INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (username, hash_password(password), email, persona_id, rol_app_id, active))


def save_persona(payload, persona_id=None):
    nombre = str(payload.get("nombre", "")).strip()
    email = str(payload.get("email") or "").strip().lower() or None
    rol_operativo = str(payload.get("rol_operativo", "Operador")).strip() or "Operador"
    if not nombre:
        raise ValueError("El nombre es obligatorio")

    with connect() as connection:
        rol_operativo_id = role_id_for(connection, rol_operativo)
        current_person = connection.execute("SELECT codigo_privado FROM personas WHERE id = ?", (persona_id,)).fetchone() if persona_id else None
        private_code = normalize_private_code(payload.get("codigo_privado")) or (current_person["codigo_privado"] if current_person else next_private_code(connection))
        duplicate_code = connection.execute(
            "SELECT id FROM personas WHERE codigo_privado = ? AND (? IS NULL OR id <> ?)",
            (private_code, persona_id, persona_id),
        ).fetchone()
        if duplicate_code:
            raise ValueError("Ese ID privado ya está asignado")
        values = (
            nombre,
            private_code,
            email,
            rol_operativo_id,
            int(bool(payload.get("activo", True))),
            payload.get("horario_tipo") or "variable",
            json.dumps(payload.get("horario_fijo") or [], ensure_ascii=False),
            float(payload.get("valor_hora") or 0),
            float(payload.get("horas_acordadas") or 190),
            payload.get("tipo_libreta") or "NO TIENE",
            payload.get("vencimiento_libreta") or None,
            payload.get("vencimiento_carne_salud") or None,
        )
        if persona_id:
            connection.execute("""
                UPDATE personas
                SET
                  nombre = ?,
                  codigo_privado = ?,
                  email = ?,
                  rol_operativo_id = ?,
                  activo = ?,
                  horario_tipo = ?,
                  horario_fijo_json = ?,
                  valor_hora = ?,
                  horas_acordadas = ?,
                  tipo_libreta = ?,
                  vencimiento_libreta = ?,
                  vencimiento_carne_salud = ?
                WHERE id = ?
            """, (*values, persona_id))
        else:
            cursor = connection.execute("""
                INSERT INTO personas (
                  nombre,
                  codigo_privado,
                  email,
                  rol_operativo_id,
                  activo,
                  horario_tipo,
                  horario_fijo_json,
                  valor_hora,
                  horas_acordadas,
                  tipo_libreta,
                  vencimiento_libreta,
                  vencimiento_carne_salud
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, values)
            persona_id = cursor.lastrowid
        save_usuario_for_persona(connection, persona_id, payload.get("acceso"))
        sync_persona_operacion_tarifas(connection, persona_id, payload.get("operacion_tarifa_ids") or [])
        connection.commit()
        return read_persona(connection, persona_id)


def sync_persona_operacion_tarifas(connection, persona_id, tarifa_ids):
    clean_ids = []
    for value in tarifa_ids:
        try:
            tariff_id = int(value)
        except (TypeError, ValueError):
            continue
        if tariff_id > 0 and tariff_id not in clean_ids:
            clean_ids.append(tariff_id)
    connection.execute("DELETE FROM persona_operacion_tarifas WHERE persona_id = ?", (persona_id,))
    for tariff_id in clean_ids:
        exists = connection.execute("SELECT id FROM operacion_tarifas WHERE id = ? AND activo = 1", (tariff_id,)).fetchone()
        if exists:
            connection.execute("""
                INSERT OR IGNORE INTO persona_operacion_tarifas (persona_id, tarifa_id)
                VALUES (?, ?)
            """, (persona_id, tariff_id))


def toggle_persona(persona_id):
    with connect() as connection:
        connection.execute("""
            UPDATE personas
            SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END
            WHERE id = ?
        """, (persona_id,))
        connection.commit()
        return read_persona(connection, persona_id)


def save_rol_operativo(payload, role_id=None):
    nombre = str(payload.get("nombre", "")).strip()
    if not nombre:
        raise ValueError("El nombre del rol es obligatorio")
    visible = int(bool(payload.get("aparece_plan_semanal", True)))
    with connect() as connection:
        if role_id:
            connection.execute("""
                UPDATE roles_operativos
                SET nombre = ?, aparece_plan_semanal = ?
                WHERE id = ?
            """, (nombre, visible, role_id))
        else:
            connection.execute("""
                INSERT INTO roles_operativos (nombre, aparece_plan_semanal)
                VALUES (?, ?)
                ON CONFLICT(nombre) DO UPDATE SET aparece_plan_semanal = excluded.aparece_plan_semanal
            """, (nombre, visible))
        connection.commit()
        return {"ok": True, "roles": list_roles_operativos()}


def delete_rol_operativo(role_id):
    with connect() as connection:
        used = connection.execute("SELECT COUNT(*) AS total FROM personas WHERE rol_operativo_id = ?", (role_id,)).fetchone()["total"]
        if used:
            raise ValueError("No se puede eliminar un rol con personas asociadas")
        connection.execute("DELETE FROM roles_operativos WHERE id = ?", (role_id,))
        connection.commit()
        return {"ok": True}


def save_ubicacion(payload, location_id=None):
    nombre = str(payload.get("nombre", "")).strip()
    if not nombre:
        raise ValueError("El nombre de la ubicación es obligatorio")
    values = (
        nombre,
        payload.get("google_maps_url"),
        payload.get("latitud"),
        payload.get("longitud"),
        int(payload.get("tolerancia_metros") or 500),
        int(bool(payload.get("genera_incidencia", False))),
        payload.get("direccion") or "",
    )
    with connect() as connection:
        if location_id:
            connection.execute("""
                UPDATE ubicaciones
                SET nombre = ?, google_maps_url = ?, latitud = ?, longitud = ?,
                    tolerancia_metros = ?, genera_incidencia = ?, direccion = ?
                WHERE id = ?
            """, (*values, location_id))
        else:
            connection.execute("""
                INSERT INTO ubicaciones (
                  nombre, google_maps_url, latitud, longitud, tolerancia_metros, genera_incidencia, direccion
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(nombre) DO UPDATE SET
                  google_maps_url = excluded.google_maps_url,
                  latitud = excluded.latitud,
                  longitud = excluded.longitud,
                  tolerancia_metros = excluded.tolerancia_metros,
                  genera_incidencia = excluded.genera_incidencia,
                  direccion = excluded.direccion
            """, values)
        connection.commit()
        return {"ok": True, "ubicaciones": list_ubicaciones()}


def delete_ubicacion(location_id):
    with connect() as connection:
        connection.execute("DELETE FROM ubicaciones WHERE id = ?", (location_id,))
        connection.commit()
        return {"ok": True}


def save_operacion_tarifa(payload, tarifa_id=None):
    categoria = str(payload.get("categoria") or "").strip()
    tipo = str(payload.get("tipo") or "").strip()
    if not categoria:
        raise ValueError("La categoría es obligatoria")
    if not tipo:
        raise ValueError("El tipo es obligatorio")
    values = (
        categoria,
        tipo,
        float(payload.get("hasta_4hs") or 0),
        float(payload.get("de_4_a_8hs") or 0),
        float(payload.get("de_8_a_12hs") or 0),
        int(bool(payload.get("activo", True))),
    )
    with connect() as connection:
        if tarifa_id:
            existing = connection.execute("SELECT id FROM operacion_tarifas WHERE id = ?", (tarifa_id,)).fetchone()
            if not existing:
                raise ValueError("Tarifa no encontrada")
            connection.execute("""
                UPDATE operacion_tarifas
                SET categoria = ?,
                    tipo = ?,
                    hasta_4hs = ?,
                    de_4_a_8hs = ?,
                    de_8_a_12hs = ?,
                    activo = ?,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (*values, tarifa_id))
        else:
            connection.execute("""
                INSERT INTO operacion_tarifas (categoria, tipo, hasta_4hs, de_4_a_8hs, de_8_a_12hs, activo)
                VALUES (?, ?, ?, ?, ?, ?)
            """, values)
        connection.commit()
    return {"ok": True, "tarifas": list_operacion_tarifas()}


def delete_operacion_tarifa(tarifa_id):
    with connect() as connection:
        connection.execute("""
            UPDATE operacion_tarifas
            SET activo = 0, fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (tarifa_id,))
        connection.commit()
    return {"ok": True, "tarifas": list_operacion_tarifas()}


def tarifa_value_for_band(tarifa, band):
    normalized = str(band or "").strip()
    if normalized == "Hasta 4 horas":
        return float(tarifa["hasta_4hs"] or 0)
    if normalized == "4 a 8 horas":
        return float(tarifa["de_4_a_8hs"] or 0)
    if normalized in {"8 a 12 horas", "8 a 10 horas"}:
        return float(tarifa["de_8_a_12hs"] or 0)
    return 0


def read_person_tariff(connection, persona_id, tarifa_id, require_permission=True):
    active_condition = "AND operacion_tarifas.activo = 1" if require_permission else ""
    row = connection.execute("""
        SELECT operacion_tarifas.*
        FROM operacion_tarifas
        LEFT JOIN persona_operacion_tarifas
          ON persona_operacion_tarifas.tarifa_id = operacion_tarifas.id
          AND persona_operacion_tarifas.persona_id = ?
        WHERE operacion_tarifas.id = ?
          AND (? = 0 OR persona_operacion_tarifas.persona_id IS NOT NULL)
          {active_condition}
    """.format(active_condition=active_condition), (persona_id, tarifa_id, 1 if require_permission else 0)).fetchone()
    return row


def save_configuracion(payload):
    clave = str(payload.get("clave", "")).strip()
    if not clave:
        raise ValueError("La clave de configuración es obligatoria")
    with connect() as connection:
        connection.execute("""
            INSERT INTO configuracion (clave, valor)
            VALUES (?, ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        """, (clave, json.dumps(payload.get("valor"), ensure_ascii=False)))
        connection.commit()
        return {"ok": True}


def save_facturacion(payload, invoice_id=None):
    orden = str(payload.get("orden") or "").strip()
    fecha = str(payload.get("fecha") or "").strip()
    monto = float(payload.get("monto") or 0)
    referencia = str(payload.get("referencia") or "").strip() or None
    lugar = str(payload.get("lugar") or "").strip() or None
    observacion = str(payload.get("observacion") or "").strip() or None
    if not orden:
        raise ValueError("La orden es obligatoria")
    if not fecha:
        raise ValueError("La fecha es obligatoria")
    if monto < 0:
        raise ValueError("El monto no puede ser negativo")
    with connect() as connection:
        if invoice_id:
            existing = connection.execute("SELECT id FROM facturacion WHERE id = ?", (invoice_id,)).fetchone()
            if not existing:
                raise ValueError("Registro de facturación no encontrado")
            connection.execute("""
                UPDATE facturacion
                SET orden = ?,
                    fecha = ?,
                    monto = ?,
                    referencia = ?,
                    lugar = ?,
                    observacion = ?,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (orden, fecha, monto, referencia, lugar, observacion, invoice_id))
        else:
            connection.execute("""
                INSERT INTO facturacion (orden, fecha, monto, referencia, lugar, observacion)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (orden, fecha, monto, referencia, lugar, observacion))
        connection.commit()
        return {"ok": True, "facturacion": list_facturacion()}


def import_facturacion(rows_to_import):
    imported = 0
    updated = 0
    errors = []
    with connect() as connection:
        for index, payload in enumerate(rows_to_import, start=1):
            try:
                orden = str(payload.get("orden") or "").strip()
                fecha = str(payload.get("fecha") or "").strip()
                monto = float(payload.get("monto") or 0)
                referencia = str(payload.get("referencia") or "").strip() or None
                lugar = str(payload.get("lugar") or "").strip() or None
                observacion = str(payload.get("observacion") or "").strip() or None
                if not orden:
                    raise ValueError("orden vacía")
                if not fecha:
                    raise ValueError("fecha vacía")
                if monto < 0:
                    raise ValueError("monto negativo")
                existing = connection.execute(
                    "SELECT id FROM facturacion WHERE orden = ? AND fecha = ?",
                    (orden, fecha),
                ).fetchone()
                if existing:
                    connection.execute("""
                        UPDATE facturacion
                        SET monto = ?,
                            referencia = ?,
                            lugar = ?,
                            observacion = ?,
                            fecha_actualizacion = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (monto, referencia, lugar, observacion, existing["id"]))
                    updated += 1
                else:
                    connection.execute("""
                        INSERT INTO facturacion (orden, fecha, monto, referencia, lugar, observacion)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (orden, fecha, monto, referencia, lugar, observacion))
                    imported += 1
            except Exception as error:
                errors.append({"fila": index, "error": str(error)})
        connection.commit()
    return {"ok": True, "importadas": imported, "actualizadas": updated, "errores": errors}


def delete_facturacion(invoice_id):
    with connect() as connection:
        connection.execute("DELETE FROM facturacion WHERE id = ?", (invoice_id,))
        connection.commit()
        return {"ok": True}


def save_usuario(payload, user_id=None):
    email = str(payload.get("email") or payload.get("usuario") or "").strip().lower()
    username = email
    password = str(payload.get("password", "")).strip()
    if not email or (not user_id and not password):
        raise ValueError("Correo y contraseña son obligatorios")
    with connect() as connection:
        existing = connection.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,)).fetchone() if user_id else None
        if user_id and not existing:
            raise ValueError("Usuario no encontrado")
        persona_id = payload.get("persona_id")
        if not persona_id and payload.get("persona"):
            persona_id = persona_id_by_name(connection, payload.get("persona"))
        if not persona_id:
            persona_id = None
        technical_users = {"admin", "rrhh", "admin@empresa.local", "rrhh@empresa.local"}
        is_technical_user = username.lower() in technical_users
        if not persona_id and not is_technical_user:
            raise ValueError("Todo usuario debe estar vinculado a una persona, salvo admin y rrhh")
        if persona_id and is_technical_user:
            raise ValueError("admin y rrhh se reservan como usuarios técnicos sin persona vinculada")
        duplicate = connection.execute("""
            SELECT id FROM usuarios
            WHERE (usuario = ? OR lower(coalesce(email, '')) = lower(?))
              AND (? IS NULL OR id <> ?)
        """, (username, email, user_id, user_id)).fetchone()
        if duplicate:
            raise ValueError("Ese correo ya tiene acceso")
        role_id = app_role_id_for(connection, payload.get("rol_app") or "usuario")
        active = int(bool(payload.get("activo", existing["activo"] if existing else True)))
        if existing:
            if password:
                connection.execute("""
                    UPDATE usuarios
                    SET usuario = ?, password_hash = ?, email = ?, persona_id = ?, rol_app_id = ?, activo = ?
                    WHERE id = ?
                """, (username, hash_password(password), email, persona_id, role_id, active, user_id))
            else:
                connection.execute("""
                    UPDATE usuarios
                    SET usuario = ?, email = ?, persona_id = ?, rol_app_id = ?, activo = ?
                    WHERE id = ?
                """, (username, email, persona_id, role_id, active, user_id))
        else:
            connection.execute("""
                INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                username,
                hash_password(password),
                email,
                persona_id,
                role_id,
                active,
            ))
        connection.commit()
        return {"ok": True}


def toggle_usuario(user_id):
    with connect() as connection:
        connection.execute("""
            UPDATE usuarios
            SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END
            WHERE id = ?
        """, (user_id,))
        connection.commit()
        return {"ok": True}


def upsert_turno(connection, payload):
    persona_id = payload.get("persona_id")
    if not persona_id:
        persona_id = ensure_persona_id(
            connection,
            payload.get("persona") or payload.get("persona_nombre"),
            payload.get("rol_operativo") or "Operador",
        )
    fecha = payload.get("fecha")
    if not fecha:
        raise ValueError("La fecha del turno es obligatoria")
    estado = payload.get("estado") or "VACIO"
    has_origin = "origen" in payload
    has_origin_reference_type = "origen_referencia_tipo" in payload
    has_origin_reference_id = "origen_referencia_id" in payload
    has_regularization_date = "fecha_regularizacion" in payload
    connection.execute("""
        INSERT INTO turnos (
          persona_id,
          fecha,
          estado,
          hora_inicio,
          hora_fin,
          actividad_ubicacion,
          modificado,
          origen,
          origen_referencia_tipo,
          origen_referencia_id,
          fecha_regularizacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'PLAN'), ?, ?, ?)
        ON CONFLICT(persona_id, fecha) DO UPDATE SET
          estado = excluded.estado,
          hora_inicio = excluded.hora_inicio,
          hora_fin = excluded.hora_fin,
          actividad_ubicacion = excluded.actividad_ubicacion,
          modificado = excluded.modificado,
          origen = CASE WHEN ? THEN excluded.origen ELSE turnos.origen END,
          origen_referencia_tipo = CASE WHEN ? THEN excluded.origen_referencia_tipo ELSE turnos.origen_referencia_tipo END,
          origen_referencia_id = CASE WHEN ? THEN excluded.origen_referencia_id ELSE turnos.origen_referencia_id END,
          fecha_regularizacion = CASE WHEN ? THEN excluded.fecha_regularizacion ELSE turnos.fecha_regularizacion END
    """, (
        persona_id,
        fecha,
        estado,
        payload.get("hora_inicio"),
        payload.get("hora_fin"),
        payload.get("actividad_ubicacion"),
        int(bool(payload.get("modificado", True))),
        payload.get("origen"),
        payload.get("origen_referencia_tipo"),
        payload.get("origen_referencia_id"),
        payload.get("fecha_regularizacion"),
        int(has_origin),
        int(has_origin_reference_type),
        int(has_origin_reference_id),
        int(has_regularization_date),
    ))
    return persona_id


def upsert_turnos(connection, turnos):
    for turno in turnos:
        upsert_turno(connection, turno)
    return len(turnos)


def normalize_user_id(value):
    if isinstance(value, str) and value.startswith("db-"):
        value = value.replace("db-", "")
    return int(value) if str(value or "").isdigit() else None


def create_marca(connection, payload):
    persona_id = payload.get("persona_id")
    if not persona_id:
        persona_id = ensure_persona_id(
            connection,
            payload.get("persona") or payload.get("persona_nombre"),
            payload.get("rol_operativo") or "Operador",
        )
    user_id = normalize_user_id(payload.get("usuario_id"))
    username = username_by_id(connection, user_id) or str(payload.get("usuario_nombre") or "").strip()
    if payload.get("registrada_por_admin") and not username:
        username = "admin"
    manual_reason = str(payload.get("observacion_modificacion") or "").strip()
    manual_admin_note = None
    if username and payload.get("registrada_por_admin"):
        manual_admin_note = f"Modificado por {username}"
        if manual_reason:
            manual_admin_note = f"{manual_admin_note}: {manual_reason}"
    mark_source = payload.get("tipo_marca", "Por usuario")
    if payload.get("registrada_por_admin"):
        mark_source = "Marca manual admin"
    cursor = connection.execute("""
        INSERT INTO marcas (
          persona_id,
          fecha_hora,
          tipo,
          tipo_marca,
          actividad_ubicacion,
          ubicacion_detectada,
          latitud,
          longitud,
          genera_incidencia,
          estado_aprobacion,
          fecha_aprobacion,
          aprobado_por_usuario_id,
          observacion_aprobacion,
          fecha_modificacion,
          modificado_por_usuario_id,
          observacion_modificacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'APROBADA' THEN CURRENT_TIMESTAMP ELSE NULL END, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, ?, ?)
    """, (
        persona_id,
        payload["fecha_hora"],
        payload["tipo"],
        mark_source,
        payload.get("actividad_ubicacion"),
        payload.get("ubicacion_detectada"),
        payload.get("latitud"),
        payload.get("longitud"),
        int(bool(payload.get("genera_incidencia", False))),
        "APROBADA" if manual_admin_note else "PENDIENTE",
        "APROBADA" if manual_admin_note else "PENDIENTE",
        user_id if manual_admin_note else None,
        manual_admin_note,
        manual_admin_note,
        user_id if manual_admin_note else None,
        manual_admin_note,
    ))
    return {"id": cursor.lastrowid, "persona_id": persona_id, "fecha_hora": payload["fecha_hora"]}


def update_marca(connection, marca_id, payload, fecha_hora):
    mark_type = str(payload.get("tipo") or "").strip()
    if mark_type.lower() not in {"entrada", "salida"}:
        raise ValueError("Tipo de marca inválido")
    current = connection.execute("SELECT * FROM marcas WHERE id = ? AND COALESCE(anulada, 0) = 0", (marca_id,)).fetchone()
    if not current:
        raise ValueError("Marca no encontrada")

    user_id = normalize_user_id(payload.get("usuario_id"))
    username = username_by_id(connection, user_id) or str(payload.get("usuario_nombre") or "admin").strip() or "admin"
    reason = str(payload.get("observacion_modificacion") or "").strip()
    note = f"Modificado por {username}"
    if reason:
        note = f"{note}: {reason}"
    connection.execute("""
        UPDATE marcas
        SET
          fecha_hora = ?,
          tipo = ?,
          tipo_marca = 'Marca manual admin',
          actividad_ubicacion = ?,
          ubicacion_detectada = ?,
          estado_aprobacion = 'APROBADA',
          fecha_aprobacion = CURRENT_TIMESTAMP,
          aprobado_por_usuario_id = ?,
          observacion_aprobacion = ?,
          fecha_modificacion = CURRENT_TIMESTAMP,
          modificado_por_usuario_id = ?,
          observacion_modificacion = ?
        WHERE id = ?
    """, (
        fecha_hora,
        mark_type.capitalize(),
        payload.get("actividad_ubicacion"),
        payload.get("ubicacion_detectada"),
        user_id,
        note,
        user_id,
        note,
        marca_id,
    ))
    return {
        "id": marca_id,
        "persona_id": current["persona_id"],
        "old_fecha_hora": current["fecha_hora"],
        "new_fecha_hora": fecha_hora,
        "observacion_modificacion": note,
    }


def delete_marca(connection, marca_id):
    current = connection.execute("SELECT * FROM marcas WHERE id = ? AND COALESCE(anulada, 0) = 0", (marca_id,)).fetchone()
    if not current:
        raise ValueError("Marca no encontrada")
    connection.execute("""
        UPDATE jornales
        SET
          entrada_marca_id = CASE WHEN entrada_marca_id = ? THEN NULL ELSE entrada_marca_id END,
          salida_marca_id = CASE WHEN salida_marca_id = ? THEN NULL ELSE salida_marca_id END,
          estado_aprobacion = 'PENDIENTE',
          modo_aprobacion = NULL,
          aprobado_por_usuario_id = NULL,
          aprobado_por = NULL,
          fecha_aprobacion = NULL,
          observacion_aprobacion = NULL,
          fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE entrada_marca_id = ? OR salida_marca_id = ?
    """, (marca_id, marca_id, marca_id, marca_id))
    connection.execute("""
        UPDATE incidencias
        SET referencia_id = NULL
        WHERE referencia_tipo = 'marca' AND referencia_id = ?
    """, (marca_id,))
    connection.execute("""
        UPDATE marcas
        SET
          anulada = 1,
          fecha_anulacion = CURRENT_TIMESTAMP,
          estado_aprobacion = 'ANULADA',
          fecha_aprobacion = NULL,
          aprobado_por_usuario_id = NULL,
          observacion_aprobacion = NULL
        WHERE id = ?
    """, (marca_id,))
    return {"id": marca_id, "persona_id": current["persona_id"], "fecha_hora": current["fecha_hora"]}


def read_operacion(connection, operacion_id):
    row = connection.execute("""
        SELECT operaciones.*, personas.nombre AS persona
        FROM operaciones
        JOIN personas ON personas.id = operaciones.persona_id
        WHERE operaciones.id = ?
    """, (operacion_id,)).fetchone()
    return dict(row) if row else None


def create_operacion(payload):
    with connect() as connection:
        tarifa_id = payload.get("operacion_tarifa_id")
        tipo_operacion = str(payload.get("tipo_operacion") or "").strip()
        valor = float(payload.get("valor", 0) or 0)
        if tarifa_id:
            tarifa = read_person_tariff(connection, payload["persona_id"], int(tarifa_id), require_permission=True)
            if not tarifa:
                raise ValueError("La persona no tiene habilitada esa categoría de operación")
            tipo_operacion = f"{tarifa['categoria']} · {tarifa['tipo']}"
            valor = tarifa_value_for_band(tarifa, payload.get("franja"))
        cursor = connection.execute("""
            INSERT INTO operaciones (
              persona_id,
              operacion_tarifa_id,
              fecha_hora,
              tipo_operacion,
              franja,
              valor,
              referencia,
              observacion,
              estado,
              motivo_rechazo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload["persona_id"],
            int(tarifa_id) if tarifa_id else None,
            payload["fecha_hora"],
            tipo_operacion,
            payload["franja"],
            valor,
            payload.get("referencia"),
            payload.get("observacion"),
            payload.get("estado", "pending"),
            payload.get("motivo_rechazo"),
        ))
        connection.commit()
        return {"id": cursor.lastrowid}


def update_operacion(operacion_id, payload):
    allowed_statuses = {"pending", "approved", "rejected"}
    with connect() as connection:
        current = connection.execute("SELECT * FROM operaciones WHERE id = ?", (operacion_id,)).fetchone()
        if not current:
            raise ValueError("Operación no encontrada")

        estado = payload.get("estado", current["estado"])
        if estado not in allowed_statuses:
            raise ValueError("Estado de operación inválido")
        motivo = payload.get("motivo_rechazo", current["motivo_rechazo"])
        if estado != "rejected":
            motivo = None
        tarifa_id = payload.get("operacion_tarifa_id", current["operacion_tarifa_id"])
        tipo_operacion = str(payload.get("tipo_operacion", current["tipo_operacion"]) or "").strip()
        franja = str(payload.get("franja", current["franja"]) or "").strip()
        if not tipo_operacion:
            raise ValueError("El tipo de operación es obligatorio")
        if not franja:
            raise ValueError("La franja es obligatoria")
        valor = float(payload.get("valor", current["valor"]) or 0)
        if tarifa_id:
            tarifa = read_person_tariff(connection, current["persona_id"], int(tarifa_id), require_permission=False)
            if not tarifa:
                raise ValueError("Tarifa no encontrada")
            tipo_operacion = f"{tarifa['categoria']} · {tarifa['tipo']}"
            valor = tarifa_value_for_band(tarifa, franja)

        connection.execute("""
            UPDATE operaciones
            SET operacion_tarifa_id = ?, tipo_operacion = ?, franja = ?, valor = ?, estado = ?, motivo_rechazo = ?
            WHERE id = ?
        """, (int(tarifa_id) if tarifa_id else None, tipo_operacion, franja, valor, estado, motivo, operacion_id))
        connection.commit()
        return {"ok": True, "operacion": read_operacion(connection, operacion_id)}
