import json
import math
import secrets
from datetime import datetime, timedelta

from .database import IS_POSTGRES, connect, rows, one
from .security import hash_password, token_hash, verify_password
from .settings import SESSION_TTL_HOURS
from .utils import app_config_json


FACE_RECOGNITION_DEFAULTS = {
    "threshold": 78,
    "ambiguity_margin": 4,
}


def parse_decimal_value(value, default=0):
    if value is None or value == "":
        return float(default)
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            raise ValueError("Valor numérico inválido")
        return round(float(value), 2)
    text = str(value).strip().replace(" ", "").replace("$", "")
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    number = float(text)
    if not math.isfinite(number):
        raise ValueError("Valor numérico inválido")
    return round(number, 2)


def list_personas():
    tariff_ids_sql = "string_agg(CAST(tarifa_id AS TEXT), ',')" if IS_POSTGRES else "group_concat(tarifa_id)"
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
            SELECT {tariff_ids_sql}
            FROM persona_operacion_tarifas
            WHERE persona_operacion_tarifas.persona_id = personas.id
          ) AS operacion_tarifa_ids
        FROM personas
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        LEFT JOIN usuarios ON usuarios.persona_id = personas.id
        LEFT JOIN roles_app ON roles_app.id = usuarios.rol_app_id
        ORDER BY roles_operativos.id, personas.nombre
    """.format(tariff_ids_sql=tariff_ids_sql))


def list_personal_integracion(filters=None):
    filters = filters or {}
    where = []
    params = []
    active = str(filters.get("activo") or "").strip().lower()
    if active in {"1", "true", "si", "sí", "activo", "activos"}:
        where.append("personas.activo = 1")
    elif active in {"0", "false", "no", "inactivo", "inactivos"}:
        where.append("personas.activo = 0")
    role = str(filters.get("rol_operativo") or "").strip()
    if role:
        where.append("lower(roles_operativos.nombre) = ?")
        params.append(role.lower())
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    return rows(f"""
        SELECT
          personas.id,
          personas.codigo_privado,
          personas.nombre,
          personas.email,
          personas.activo,
          roles_operativos.nombre AS rol_operativo,
          personas.horario_tipo,
          personas.horas_acordadas,
          personas.valor_hora,
          personas.tipo_libreta,
          personas.vencimiento_libreta,
          personas.vencimiento_carne_salud
        FROM personas
        LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
        {where_sql}
        ORDER BY personas.nombre
    """, tuple(params))


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


def list_proyectos(active_only=False):
    where = "WHERE activo = 1" if active_only else ""
    return rows(f"SELECT * FROM proyectos {where} ORDER BY activo DESC, nombre")


def save_proyecto(payload, project_id=None):
    name = str(payload.get("nombre") or payload.get("name") or "").strip().upper()
    if not name:
        raise ValueError("El nombre del proyecto es obligatorio")
    active = int(bool(payload.get("activo", True)))
    with connect() as connection:
        if project_id:
            existing = connection.execute("SELECT id FROM proyectos WHERE id = ?", (project_id,)).fetchone()
            if not existing:
                raise ValueError("Proyecto no encontrado")
            connection.execute("""
                UPDATE proyectos
                SET nombre = ?, activo = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (name, active, project_id))
        else:
            connection.execute("""
                INSERT INTO proyectos (nombre, activo)
                VALUES (?, ?)
                ON CONFLICT(nombre) DO UPDATE SET activo = excluded.activo, fecha_actualizacion = CURRENT_TIMESTAMP
            """, (name, active))
        connection.commit()
    return {"ok": True, "proyectos": list_proyectos()}


def delete_proyecto(project_id):
    with connect() as connection:
        connection.execute("""
            UPDATE proyectos
            SET activo = 0, fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (project_id,))
        connection.commit()
    return {"ok": True, "proyectos": list_proyectos()}


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


def list_relojes_faciales():
    return rows("""
        SELECT
          id,
          nombre,
          token_visible,
          activo,
          eliminado,
          fecha_creacion,
          fecha_expiracion,
          fecha_eliminacion,
          ultimo_uso
        FROM relojes_faciales
        WHERE COALESCE(eliminado, 0) = 0
        ORDER BY activo DESC, fecha_creacion DESC, nombre
    """)


def create_reloj_facial(payload, raw_token):
    name = str(payload.get("nombre") or "").strip()
    if not name:
        raise ValueError("Nombre del reloj requerido")
    expires_at = str(payload.get("fecha_expiracion") or "").strip() or None
    if expires_at and len(expires_at) == 10:
        expires_at = f"{expires_at} 23:59:59"
    with connect() as connection:
        cursor = connection.execute("""
            INSERT INTO relojes_faciales (nombre, token_hash, token_visible, activo, fecha_expiracion)
            VALUES (?, ?, ?, 1, ?)
        """, (name, token_hash(raw_token), raw_token, expires_at))
        link_id = cursor.lastrowid
        if not link_id:
            row = connection.execute("SELECT id FROM relojes_faciales WHERE token_hash = ?", (token_hash(raw_token),)).fetchone()
            link_id = row["id"] if row else None
        connection.commit()
    return {"ok": True, "id": link_id, "token": raw_token}


def toggle_reloj_facial(link_id):
    with connect() as connection:
        current = connection.execute("SELECT activo FROM relojes_faciales WHERE id = ? AND COALESCE(eliminado, 0) = 0", (link_id,)).fetchone()
        if not current:
            raise ValueError("Reloj facial no encontrado")
        active = 0 if int(current["activo"] or 0) else 1
        connection.execute("UPDATE relojes_faciales SET activo = ? WHERE id = ?", (active, link_id))
        connection.commit()
        return {"ok": True, "activo": active}


def delete_reloj_facial(link_id):
    with connect() as connection:
        current = connection.execute("SELECT id FROM relojes_faciales WHERE id = ? AND COALESCE(eliminado, 0) = 0", (link_id,)).fetchone()
        if not current:
            raise ValueError("Reloj facial no encontrado")
        connection.execute("""
            UPDATE relojes_faciales
            SET activo = 0,
                eliminado = 1,
                fecha_eliminacion = ?
            WHERE id = ?
        """, (datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), link_id))
        connection.commit()
        return {"ok": True}


def validate_reloj_facial_token(raw_token, touch=False):
    clean = str(raw_token or "").strip()
    if not clean:
        return None
    now_value = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with connect() as connection:
        row = connection.execute("""
            SELECT id, nombre, activo, fecha_expiracion
            FROM relojes_faciales
            WHERE token_hash = ?
              AND activo = 1
              AND COALESCE(eliminado, 0) = 0
              AND (fecha_expiracion IS NULL OR fecha_expiracion = '' OR fecha_expiracion >= ?)
        """, (token_hash(clean), now_value)).fetchone()
        if not row:
            return None
        if touch:
            connection.execute("UPDATE relojes_faciales SET ultimo_uso = ? WHERE id = ?", (now_value, row["id"]))
            connection.commit()
        return dict(row)


def normalize_face_descriptor(value):
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list) or len(value) < 32:
        raise ValueError("Huella facial inválida")
    descriptor = []
    for item in value:
        try:
            descriptor.append(float(item))
        except (TypeError, ValueError) as exc:
            raise ValueError("Huella facial inválida") from exc
    return descriptor


def face_descriptor_version(payload, descriptor):
    version = str(payload.get("descriptor_version") or payload.get("version") or "").strip()
    return version or f"len:{len(descriptor)}"


def face_descriptor_family(version):
    clean = str(version or "").strip().lower()
    if clean.startswith("face-api"):
        return "face-api"
    return "lang-local"


def face_descriptor_versions_compatible(left_version, right_version):
    return face_descriptor_family(left_version) == face_descriptor_family(right_version)


def face_recognition_settings(connection):
    settings = app_config_json(connection, "face_recognition", FACE_RECOGNITION_DEFAULTS)
    if not isinstance(settings, dict):
        settings = FACE_RECOGNITION_DEFAULTS
    try:
        threshold = float(settings.get("threshold", FACE_RECOGNITION_DEFAULTS["threshold"]))
    except (TypeError, ValueError):
        threshold = FACE_RECOGNITION_DEFAULTS["threshold"]
    try:
        ambiguity_margin = float(settings.get("ambiguity_margin", FACE_RECOGNITION_DEFAULTS["ambiguity_margin"]))
    except (TypeError, ValueError):
        ambiguity_margin = FACE_RECOGNITION_DEFAULTS["ambiguity_margin"]
    return {
        "threshold": max(50, min(99, threshold)),
        "ambiguity_margin": max(0, min(25, ambiguity_margin)),
    }


def face_similarity_score(left, right, descriptor_version=None):
    size = min(len(left), len(right))
    if size < 32:
        return 0
    a = left[:size]
    b = right[:size]
    if face_descriptor_family(descriptor_version) == "face-api":
        distance = math.sqrt(sum((x - y) * (x - y) for x, y in zip(a, b)))
        # En face-api una distancia cercana a 0.6 suele ser el límite práctico de coincidencia.
        score = 100 - (distance * (22 / 0.6))
        return round(max(0, min(100, score)), 2)
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if not norm_a or not norm_b:
        return 0
    cosine = max(-1, min(1, dot / (norm_a * norm_b)))
    return round(((cosine + 1) / 2) * 100, 2)


def list_persona_rostros(persona_id):
    return rows("""
        SELECT
          rostros_personas.id,
          rostros_personas.persona_id,
          personas.nombre AS persona,
          rostros_personas.descriptor_version,
          rostros_personas.descriptor_size,
          rostros_personas.activo,
          rostros_personas.observacion,
          rostros_personas.fecha_alta,
          rostros_personas.fecha_actualizacion,
          usuarios.email AS creado_por
        FROM rostros_personas
        JOIN personas ON personas.id = rostros_personas.persona_id
        LEFT JOIN usuarios ON usuarios.id = rostros_personas.creado_por_usuario_id
        WHERE rostros_personas.persona_id = ?
        ORDER BY rostros_personas.activo DESC, rostros_personas.fecha_alta DESC
    """, (persona_id,))


def create_persona_rostro(persona_id, payload, usuario_id=None):
    descriptor = normalize_face_descriptor(payload.get("descriptor"))
    descriptor_version = face_descriptor_version(payload, descriptor)
    observation = str(payload.get("observacion") or "").strip() or None
    now_value = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with connect() as connection:
        person = connection.execute("SELECT id FROM personas WHERE id = ?", (persona_id,)).fetchone()
        if not person:
            raise ValueError("Persona no encontrada")
        active_count = connection.execute("""
            SELECT COUNT(*) AS total
            FROM rostros_personas
            WHERE persona_id = ?
              AND activo = 1
        """, (persona_id,)).fetchone()
        if int(active_count["total"] or 0) >= 5:
            raise ValueError("Cada persona puede tener como máximo 5 rostros activos")
        cursor = connection.execute("""
            INSERT INTO rostros_personas (
              persona_id,
              descriptor_json,
              descriptor_version,
              descriptor_size,
              activo,
              observacion,
              creado_por_usuario_id,
              fecha_alta,
              fecha_actualizacion
            )
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
        """, (persona_id, json.dumps(descriptor), descriptor_version, len(descriptor), observation, usuario_id, now_value, now_value))
        face_id = cursor.lastrowid
        connection.commit()
    return {"ok": True, "id": face_id}


def toggle_persona_rostro(face_id):
    with connect() as connection:
        current = connection.execute("SELECT activo FROM rostros_personas WHERE id = ?", (face_id,)).fetchone()
        if not current:
            raise ValueError("Rostro no encontrado")
        active = 0 if int(current["activo"] or 0) else 1
        connection.execute("""
            UPDATE rostros_personas
            SET activo = ?, fecha_actualizacion = ?
            WHERE id = ?
        """, (active, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), face_id))
        connection.commit()
    return {"ok": True, "activo": active}


def delete_persona_rostro(face_id):
    with connect() as connection:
        current = connection.execute("SELECT id FROM rostros_personas WHERE id = ?", (face_id,)).fetchone()
        if not current:
            raise ValueError("Rostro no encontrado")
        connection.execute("DELETE FROM rostros_personas WHERE id = ?", (face_id,))
        connection.commit()
    return {"ok": True}


def validate_face_descriptor(payload, face_clock_link=None):
    descriptor = normalize_face_descriptor(payload.get("descriptor"))
    descriptor_version = face_descriptor_version(payload, descriptor)
    face_clock_id = None
    if face_clock_link:
        face_clock_id = face_clock_link.get("reloj_facial_id") or face_clock_link.get("id")
    with connect() as connection:
        settings = face_recognition_settings(connection)
        threshold = settings["threshold"]
        ambiguity_margin = settings["ambiguity_margin"]
        candidates = [dict(row) for row in connection.execute("""
            SELECT
              rostros_personas.id,
              rostros_personas.descriptor_json,
              rostros_personas.descriptor_version,
              rostros_personas.descriptor_size,
              personas.id AS persona_id,
              personas.nombre AS persona,
              personas.activo
            FROM rostros_personas
            JOIN personas ON personas.id = rostros_personas.persona_id
            WHERE rostros_personas.activo = 1
              AND personas.activo = 1
              AND (
                SELECT COUNT(*)
                FROM rostros_personas AS activos
                WHERE activos.persona_id = personas.id
                  AND activos.activo = 1
              ) >= 3
        """).fetchall()]
        best_by_person = {}
        compatible_counts = {}
        template_matches = 0
        skipped_by_version = 0
        for candidate in candidates:
            if not face_descriptor_versions_compatible(descriptor_version, candidate.get("descriptor_version")):
                skipped_by_version += 1
                continue
            try:
                candidate_descriptor = normalize_face_descriptor(candidate["descriptor_json"])
            except ValueError:
                continue
            template_matches += 1
            compatible_counts[candidate["persona_id"]] = compatible_counts.get(candidate["persona_id"], 0) + 1
            score = face_similarity_score(descriptor, candidate_descriptor, descriptor_version)
            current = best_by_person.get(candidate["persona_id"])
            if current is None or score > current["score"]:
                best_by_person[candidate["persona_id"]] = {
                    "score": score,
                    "persona_id": candidate["persona_id"],
                    "persona": candidate["persona"],
                    "rostro_id": candidate["id"],
                    "descriptor_version": candidate.get("descriptor_version"),
                    "descriptor_size": candidate.get("descriptor_size"),
                }
        eligible_by_person = {
            persona_id: match
            for persona_id, match in best_by_person.items()
            if compatible_counts.get(persona_id, 0) >= 3
        }
        ranked = sorted(eligible_by_person.values(), key=lambda item: item["score"], reverse=True)
        best = ranked[0] if ranked else None
        second = ranked[1] if len(ranked) > 1 else None
        second_score = second.get("score") if second else None
        margin = round(best["score"] - second_score, 2) if best and second_score is not None else None
        if not best:
            result = "SIN_ROSTROS"
            if skipped_by_version:
                detail = "No hay rostros compatibles con el modelo facial actual"
            else:
                detail = "No hay rostros activos suficientes para comparar"
        elif best["score"] < threshold:
            result = "SIN_COINCIDENCIA"
            detail = "No alcanzo el umbral de validacion"
        elif second and margin is not None and margin < ambiguity_margin:
            result = "AMBIGUO"
            detail = "Coincidencia facial ambigua, requiere reintento"
        else:
            result = "VALIDADO"
            detail = "Coincidencia facial"
        ok = result == "VALIDADO"
        if face_clock_id:
            clock_exists = connection.execute("SELECT id FROM relojes_faciales WHERE id = ?", (face_clock_id,)).fetchone()
            if not clock_exists:
                face_clock_id = None
        connection.execute("""
            INSERT INTO reconocimientos_faciales_log (
              reloj_facial_id,
              persona_id,
              resultado,
              score,
              threshold,
              segundo_score,
              margen_score,
              candidatos,
              descriptor_version,
              descriptor_size,
              detalle
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            face_clock_id,
            best.get("persona_id") if best else None,
            result,
            best.get("score") if best else None,
            threshold,
            second_score,
            margin,
            template_matches,
            descriptor_version,
            len(descriptor),
            detail,
        ))
        if face_clock_id:
            connection.execute(
                "UPDATE relojes_faciales SET ultimo_uso = ? WHERE id = ?",
                (datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), face_clock_id),
            )
        connection.commit()
    return {
        "ok": ok,
        "status": result,
        "message": detail,
        "score": best.get("score") if best else 0,
        "threshold": threshold,
        "second_score": second_score,
        "margin": margin,
        "ambiguity_margin": ambiguity_margin,
        "persona": {"id": best["persona_id"], "nombre": best["persona"]} if ok else None,
        "candidates": template_matches,
        "skipped_by_version": skipped_by_version,
        "candidate_people": len(eligible_by_person),
        "descriptor": {
            "version": descriptor_version,
            "size": len(descriptor),
        },
    }


def list_reconocimientos_faciales(filters=None):
    filters = filters or {}
    where = []
    params = []
    date_from = str(filters.get("desde") or "").strip()
    date_to = str(filters.get("hasta") or "").strip()
    persona = str(filters.get("persona") or "").strip()
    if date_from:
        where.append("substr(reconocimientos_faciales_log.fecha_hora, 1, 10) >= ?")
        params.append(date_from)
    if date_to:
        where.append("substr(reconocimientos_faciales_log.fecha_hora, 1, 10) <= ?")
        params.append(date_to)
    if persona:
        where.append("lower(personas.nombre) LIKE ?")
        params.append(f"%{persona.lower()}%")
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    try:
        limit = max(1, min(500, int(filters.get("limit") or 200)))
    except (TypeError, ValueError):
        limit = 200
    return rows(f"""
        SELECT
          reconocimientos_faciales_log.*,
          personas.nombre AS persona,
          relojes_faciales.nombre AS reloj_facial
        FROM reconocimientos_faciales_log
        LEFT JOIN personas ON personas.id = reconocimientos_faciales_log.persona_id
        LEFT JOIN relojes_faciales ON relojes_faciales.id = reconocimientos_faciales_log.reloj_facial_id
        {where_sql}
        ORDER BY reconocimientos_faciales_log.fecha_hora DESC
        LIMIT {limit}
    """, tuple(params))


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


def user_by_email(email):
    clean_email = str(email or "").strip().lower()
    if not clean_email:
        return None
    return one("""
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
        WHERE lower(coalesce(usuarios.email, '')) = ?
          AND usuarios.activo = 1
    """, (clean_email,))


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


def next_private_code(connection):
    used = {
        row["codigo_privado"]
        for row in connection.execute("SELECT codigo_privado FROM personas WHERE codigo_privado IS NOT NULL").fetchall()
        if row["codigo_privado"]
    }
    available = [f"{number:03d}" for number in range(100, 1000) if f"{number:03d}" not in used]
    if available:
        return secrets.choice(available)
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
    if username.lower() == "admin":
        raise ValueError("admin se reserva como usuario tecnico del sistema")

    duplicate_sql = "SELECT id FROM usuarios WHERE (usuario = ? OR lower(coalesce(email, '')) = lower(?))"
    duplicate_params = [username, email]
    if existing:
        duplicate_sql += " AND id <> ?"
        duplicate_params.append(existing["id"])
    duplicate = connection.execute(duplicate_sql, duplicate_params).fetchone()
    if duplicate:
        raise ValueError("Ese correo ya tiene acceso")

    password = str(access_payload.get("password", "")).strip()
    if not existing and not password:
        password = secrets.token_urlsafe(24)

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
        private_code = current_person["codigo_privado"] if current_person else next_private_code(connection)
        values = (
            nombre,
            private_code,
            email,
            rol_operativo_id,
            int(bool(payload.get("activo", True))),
            payload.get("horario_tipo") or "variable",
            json.dumps(payload.get("horario_fijo") or [], ensure_ascii=False),
            parse_decimal_value(payload.get("valor_hora"), 0),
            parse_decimal_value(payload.get("horas_acordadas"), 190),
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
        technical_users = {"admin", "admin@empresa.local"}
        is_technical_user = username.lower() in technical_users
        if not persona_id and not is_technical_user:
            raise ValueError("Todo usuario debe estar vinculado a una persona, salvo admin")
        if persona_id and is_technical_user:
            raise ValueError("admin se reserva como usuario tecnico sin persona vinculada")
        duplicate_sql = """
            SELECT id FROM usuarios
            WHERE (usuario = ? OR lower(coalesce(email, '')) = lower(?))
        """
        duplicate_params = [username, email]
        if user_id:
            duplicate_sql += " AND id <> ?"
            duplicate_params.append(user_id)
        duplicate = connection.execute(duplicate_sql, duplicate_params).fetchone()
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
        bool(has_origin),
        bool(has_origin_reference_type),
        bool(has_origin_reference_id),
        bool(has_regularization_date),
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
    activity_location = str(payload.get("actividad_ubicacion") or "").strip().upper()
    if mark_source in {"Por usuario", "Por reloj facial"} and not activity_location:
        raise ValueError("Elegí un proyecto antes de marcar")
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
          reloj_facial_id,
          genera_incidencia,
          estado_aprobacion,
          fecha_aprobacion,
          aprobado_por_usuario_id,
          observacion_aprobacion,
          fecha_modificacion,
          modificado_por_usuario_id,
          observacion_modificacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'APROBADA' THEN CURRENT_TIMESTAMP ELSE NULL END, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, ?, ?)
    """, (
        persona_id,
        payload["fecha_hora"],
        payload["tipo"],
        mark_source,
        activity_location or payload.get("actividad_ubicacion"),
        payload.get("ubicacion_detectada"),
        payload.get("latitud"),
        payload.get("longitud"),
        normalize_user_id(payload.get("reloj_facial_id")),
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
        referencia = str(payload.get("referencia") or "").strip().upper()
        if not referencia:
            raise ValueError("Elegí un proyecto")
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
            referencia,
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
            raise ValueError("La categoría/tipo de operación es obligatoria")
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
