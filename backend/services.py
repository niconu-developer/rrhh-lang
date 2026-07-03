from . import repositories as repo
from datetime import datetime, timedelta

from .utils import date_from_db_datetime, minutes_from_time, parse_iso_date, shift_diff_minutes, time_from_db_datetime, app_config_json


class AprobacionesService:
    AUTO_APPROVAL_NOTE = "Pre-aprobada automáticamente por tolerancia"
    AUTO_EXPECTED_NO_WORK_NOTE = "Validación automática por estado sin horario"
    AUTO_EXPECTED_NO_WORK_STATES = {"VACIO", "LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE"}

    @staticmethod
    def hours_between(start_time, end_time):
        start_minutes = minutes_from_time(start_time)
        end_minutes = minutes_from_time(end_time)
        if start_minutes is None or end_minutes is None:
            return 0
        if end_minutes < start_minutes:
            end_minutes += 24 * 60
        return round((end_minutes - start_minutes) / 60, 2)

    @staticmethod
    def shift_exit_day(turno):
        start_minutes = minutes_from_time(turno["hora_inicio"])
        end_minutes = minutes_from_time(turno["hora_fin"])
        if start_minutes is None or end_minutes is None or end_minutes >= start_minutes:
            return turno["fecha"]
        parsed_day = parse_iso_date(turno["fecha"])
        return (parsed_day + timedelta(days=1)).strftime("%Y-%m-%d") if parsed_day else turno["fecha"]

    @staticmethod
    def shift_marks(turno, marks_by_person_day):
        day_marks = marks_by_person_day.get((turno["persona_id"], turno["fecha"]), [])
        exit_day = AprobacionesService.shift_exit_day(turno)
        if exit_day == turno["fecha"]:
            shift_marks = day_marks
            exit_day_marks = day_marks
        else:
            exit_day_marks = marks_by_person_day.get((turno["persona_id"], exit_day), [])
            shift_marks = [
                *day_marks,
                *[mark for mark in exit_day_marks if str(mark["tipo"]).lower() == "salida"],
            ]
        entries = [mark for mark in day_marks if str(mark["tipo"]).lower() == "entrada"]
        exits = [mark for mark in exit_day_marks if str(mark["tipo"]).lower() == "salida"]
        return sorted(shift_marks, key=lambda mark: mark["fecha_hora"]), entries, exits

    @staticmethod
    def selected_entry_exit(turno, entries, exits):
        entry = entries[0] if entries else None
        if not exits:
            return entry, None
        exit_mark = exits[0] if AprobacionesService.shift_exit_day(turno) != turno["fecha"] else exits[-1]
        return entry, exit_mark

    @staticmethod
    def paired_mark_hours(marks):
        pending_entry = None
        pairs = []
        for mark in sorted(marks, key=lambda item: item["fecha_hora"]):
            mark_type = str(mark["tipo"] or "").lower()
            if mark_type == "entrada":
                if pending_entry is None:
                    pending_entry = mark
                continue
            if mark_type == "salida" and pending_entry is not None:
                pairs.append((pending_entry, mark))
                pending_entry = None
        worked_hours = sum(
            AprobacionesService.hours_between(
                time_from_db_datetime(entry["fecha_hora"]),
                time_from_db_datetime(exit_mark["fecha_hora"]),
            )
            for entry, exit_mark in pairs
        )
        paired_marks = [mark for pair in pairs for mark in pair]
        return round(worked_hours, 2), paired_marks, pairs

    @staticmethod
    def mark_segments(marks):
        pending_entry = None
        segments = []
        for mark in sorted(marks, key=lambda item: item["fecha_hora"]):
            mark_type = str(mark["tipo"] or "").lower()
            if mark_type == "entrada":
                if pending_entry is not None:
                    segments.append((pending_entry, None))
                pending_entry = mark
                continue
            if mark_type == "salida":
                if pending_entry is not None:
                    segments.append((pending_entry, mark))
                    pending_entry = None
                else:
                    segments.append((None, mark))
        if pending_entry is not None:
            segments.append((pending_entry, None))
        return segments

    @staticmethod
    def approval_tolerance_minutes(connection):
        tolerance = app_config_json(connection, "approval_tolerance", {"minutes": 15})
        try:
            return max(0, int(tolerance.get("minutes") or 15))
        except (TypeError, ValueError):
            return 15

    @staticmethod
    def preapprove_for_range(connection, date_from, date_to, persona=None, persona_id=None):
        tolerance_minutes = AprobacionesService.approval_tolerance_minutes(connection)
        parsed_to = parse_iso_date(date_to)
        marks_to = (parsed_to + timedelta(days=1)).strftime("%Y-%m-%d") if parsed_to else date_to
        where_person = ""
        params = [date_from, date_to]
        if persona_id:
            where_person = "AND personas.id = ?"
            params.append(persona_id)
        elif persona:
            where_person = "AND personas.nombre = ?"
            params.append(persona)

        turnos = connection.execute(f"""
            SELECT
              turnos.*,
              personas.nombre AS persona
            FROM turnos
            JOIN personas ON personas.id = turnos.persona_id
            WHERE turnos.fecha BETWEEN ? AND ?
              AND turnos.estado = 'NORMAL'
              AND turnos.hora_inicio IS NOT NULL
              AND turnos.hora_fin IS NOT NULL
              {where_person}
            ORDER BY turnos.fecha, personas.nombre
        """, tuple(params)).fetchall()

        mark_params = [date_from, marks_to]
        mark_person = ""
        if persona_id:
            mark_person = "AND personas.id = ?"
            mark_params.append(persona_id)
        elif persona:
            mark_person = "AND personas.nombre = ?"
            mark_params.append(persona)
        marcas = connection.execute(f"""
            SELECT marcas.*
            FROM marcas
            JOIN personas ON personas.id = marcas.persona_id
            WHERE date(marcas.fecha_hora) BETWEEN date(?) AND date(?)
              AND COALESCE(marcas.anulada, 0) = 0
              {mark_person}
            ORDER BY marcas.fecha_hora
        """, tuple(mark_params)).fetchall()

        marks_by_person_day = {}
        for mark in marcas:
            key = (mark["persona_id"], date_from_db_datetime(mark["fecha_hora"]))
            marks_by_person_day.setdefault(key, []).append(mark)

        approved = 0
        for turno in turnos:
            if minutes_from_time(turno["hora_inicio"]) is None or minutes_from_time(turno["hora_fin"]) is None:
                continue
            _, entries, exits = AprobacionesService.shift_marks(turno, marks_by_person_day)
            entry, exit_mark = AprobacionesService.selected_entry_exit(turno, entries, exits)
            if not entry or not exit_mark:
                continue
            if any(str(mark["tipo_marca"] or "").lower() == "marca manual admin" for mark in [entry, exit_mark]):
                continue
            states = [entry["estado_aprobacion"] or "PENDIENTE", exit_mark["estado_aprobacion"] or "PENDIENTE"]
            if any(state != "PENDIENTE" for state in states):
                continue

            entry_diff = shift_diff_minutes(time_from_db_datetime(entry["fecha_hora"]), turno["hora_inicio"])
            exit_diff = shift_diff_minutes(time_from_db_datetime(exit_mark["fecha_hora"]), turno["hora_fin"])
            if entry_diff is None or exit_diff is None:
                continue
            if abs(entry_diff) <= tolerance_minutes and abs(exit_diff) <= tolerance_minutes:
                connection.execute("""
                    UPDATE marcas
                    SET
                      estado_aprobacion = 'APROBADA',
                      fecha_aprobacion = CURRENT_TIMESTAMP,
                      aprobado_por_usuario_id = NULL,
                      observacion_aprobacion = ?
                    WHERE id IN (?, ?)
                      AND estado_aprobacion = 'PENDIENTE'
                """, (AprobacionesService.AUTO_APPROVAL_NOTE, entry["id"], exit_mark["id"]))
                approved += connection.execute("SELECT changes() AS total").fetchone()["total"]
        return approved

    @staticmethod
    def read(connection, date_from, date_to, persona=None, persona_id=None):
        if not date_from:
            date_from = datetime.now().strftime("%Y-%m-%d")
        if not date_to:
            date_to = date_from
        AprobacionesService.preapprove_for_range(connection, date_from, date_to, persona=persona, persona_id=persona_id)
        where_person = ""
        params = [date_from, date_to]
        if persona_id:
            where_person = "AND personas.id = ?"
            params.append(persona_id)
        elif persona:
            where_person = "AND personas.nombre = ?"
            params.append(persona)
        turnos = connection.execute(f"""
            SELECT
              turnos.*,
              personas.nombre AS persona,
              roles_operativos.nombre AS rol_operativo
            FROM turnos
            JOIN personas ON personas.id = turnos.persona_id
            LEFT JOIN roles_operativos ON roles_operativos.id = personas.rol_operativo_id
            WHERE turnos.fecha BETWEEN ? AND ?
              {where_person}
            ORDER BY turnos.fecha, personas.nombre
        """, tuple(params)).fetchall()

        parsed_to = parse_iso_date(date_to)
        marks_to = (parsed_to + timedelta(days=1)).strftime("%Y-%m-%d") if parsed_to else date_to
        mark_params = [date_from, marks_to]
        mark_person = ""
        if persona_id:
            mark_person = "AND personas.id = ?"
            mark_params.append(persona_id)
        elif persona:
            mark_person = "AND personas.nombre = ?"
            mark_params.append(persona)
        marcas = connection.execute(f"""
            SELECT
              marcas.*,
              personas.nombre AS persona,
              aprobador.usuario AS aprobado_por_usuario
            FROM marcas
            JOIN personas ON personas.id = marcas.persona_id
            LEFT JOIN usuarios AS aprobador ON aprobador.id = marcas.aprobado_por_usuario_id
            WHERE date(marcas.fecha_hora) BETWEEN date(?) AND date(?)
              AND COALESCE(marcas.anulada, 0) = 0
              {mark_person}
            ORDER BY marcas.fecha_hora
        """, tuple(mark_params)).fetchall()

        marks_by_person_day = {}
        for mark in marcas:
            key = (mark["persona_id"], date_from_db_datetime(mark["fecha_hora"]))
            marks_by_person_day.setdefault(key, []).append(mark)

        rows_out = []
        for turno in turnos:
            turn_status = str(turno["estado"] or "VACIO").upper()
            shift_marks, entries, exits = AprobacionesService.shift_marks(turno, marks_by_person_day)
            entry, exit_mark = AprobacionesService.selected_entry_exit(turno, entries, exits)
            worked_hours, paired_marks, paired_pairs = AprobacionesService.paired_mark_hours(shift_marks)
            mark_segments = AprobacionesService.mark_segments(shift_marks)
            planned_hours = 0
            if turn_status == "NORMAL":
                planned_hours = AprobacionesService.hours_between(turno["hora_inicio"], turno["hora_fin"])
            approval_source_marks = shift_marks or [mark for mark in [entry, exit_mark] if mark]
            approval_marks = [mark for mark in approval_source_marks if (mark["estado_aprobacion"] or "PENDIENTE") in {"APROBADA", "VALIDADA_CON_INCIDENCIA"}]
            if turn_status in AprobacionesService.AUTO_EXPECTED_NO_WORK_STATES and not approval_source_marks:
                approval_state = "APROBADA"
                approval_mode = "AUTO"
                approval_users = []
                approval_user_ids = []
                approval_dates = []
                approval_notes = [AprobacionesService.AUTO_EXPECTED_NO_WORK_NOTE]
            else:
                approval_states = [mark["estado_aprobacion"] or "PENDIENTE" for mark in approval_source_marks]
                if approval_states and any(state == "REQUIERE_REVISION" for state in approval_states):
                    approval_state = "REQUIERE_REVISION"
                elif approval_states and any(state == "VALIDADA_CON_INCIDENCIA" for state in approval_states):
                    approval_state = "VALIDADA_CON_INCIDENCIA"
                elif approval_states and all(state == "APROBADA" for state in approval_states):
                    approval_state = "APROBADA"
                elif any(state == "RECHAZADA" for state in approval_states):
                    approval_state = "RECHAZADA"
                else:
                    approval_state = "PENDIENTE"
                if approval_state == "APROBADA" and approval_marks:
                    automatic_marks = [
                        mark for mark in approval_marks
                        if not mark["aprobado_por_usuario_id"]
                        and str(mark["observacion_aprobacion"] or "") == AprobacionesService.AUTO_APPROVAL_NOTE
                    ]
                    approval_mode = "AUTO" if len(automatic_marks) == len(approval_marks) else "MANUAL"
                else:
                    approval_mode = None
                approval_users = sorted({
                    mark["aprobado_por_usuario"]
                    for mark in approval_marks
                    if mark["aprobado_por_usuario"]
                })
                approval_user_ids = sorted({
                    mark["aprobado_por_usuario_id"]
                    for mark in approval_marks
                    if mark["aprobado_por_usuario_id"]
                })
                approval_dates = [
                    mark["fecha_aprobacion"]
                    for mark in approval_marks
                    if mark["fecha_aprobacion"]
                ]
                approval_notes = [
                    mark["observacion_aprobacion"]
                    for mark in approval_marks
                    if mark["observacion_aprobacion"]
                ]
            rows_out.append({
                "turno_id": turno["id"],
                "persona_id": turno["persona_id"],
                "persona": turno["persona"],
                "rol_operativo": turno["rol_operativo"],
                "fecha": turno["fecha"],
                "estado_turno": turno["estado"],
                "hora_inicio": turno["hora_inicio"],
                "hora_fin": turno["hora_fin"],
                "actividad_ubicacion": turno["actividad_ubicacion"],
                "entrada_id": entry["id"] if entry else None,
                "entrada_fecha": date_from_db_datetime(entry["fecha_hora"]) if entry else None,
                "entrada_hora": time_from_db_datetime(entry["fecha_hora"]) if entry else None,
                "entrada_estado": entry["estado_aprobacion"] if entry else None,
                "entrada_actividad": entry["actividad_ubicacion"] if entry else None,
                "entrada_ubicacion": entry["ubicacion_detectada"] if entry else None,
                "salida_id": exit_mark["id"] if exit_mark else None,
                "salida_fecha": date_from_db_datetime(exit_mark["fecha_hora"]) if exit_mark else None,
                "salida_hora": time_from_db_datetime(exit_mark["fecha_hora"]) if exit_mark else None,
                "salida_estado": exit_mark["estado_aprobacion"] if exit_mark else None,
                "salida_actividad": exit_mark["actividad_ubicacion"] if exit_mark else None,
                "salida_ubicacion": exit_mark["ubicacion_detectada"] if exit_mark else None,
                "estado_aprobacion": approval_state,
                "modo_aprobacion": approval_mode,
                "aprobado_por_usuario_id": approval_user_ids[0] if len(approval_user_ids) == 1 else None,
                "aprobado_por": ", ".join(approval_users) if approval_users else None,
                "fecha_aprobacion": max(approval_dates) if approval_dates else None,
                "observacion_aprobacion": " / ".join(dict.fromkeys(approval_notes)) if approval_notes else None,
                "marcas_ids": [mark["id"] for mark in approval_source_marks],
                "marcas_detalle": [
                    {
                        "id": mark["id"],
                        "tipo": mark["tipo"],
                        "fecha": date_from_db_datetime(mark["fecha_hora"]),
                        "hora": time_from_db_datetime(mark["fecha_hora"]),
                        "actividad": mark["actividad_ubicacion"],
                        "ubicacion": mark["ubicacion_detectada"],
                    }
                    for mark in shift_marks
                ],
                "tramos": [
                    {
                        "entrada_id": pair_entry["id"] if pair_entry else None,
                        "entrada_fecha": date_from_db_datetime(pair_entry["fecha_hora"]) if pair_entry else None,
                        "entrada_hora": time_from_db_datetime(pair_entry["fecha_hora"]) if pair_entry else None,
                        "entrada_actividad": pair_entry["actividad_ubicacion"] if pair_entry else None,
                        "entrada_ubicacion": pair_entry["ubicacion_detectada"] if pair_entry else None,
                        "salida_id": pair_exit["id"] if pair_exit else None,
                        "salida_fecha": date_from_db_datetime(pair_exit["fecha_hora"]) if pair_exit else None,
                        "salida_hora": time_from_db_datetime(pair_exit["fecha_hora"]) if pair_exit else None,
                        "salida_actividad": pair_exit["actividad_ubicacion"] if pair_exit else None,
                        "salida_ubicacion": pair_exit["ubicacion_detectada"] if pair_exit else None,
                    }
                    for pair_entry, pair_exit in mark_segments
                ],
                "horas_previstas": round(planned_hours, 2),
                "horas_trabajadas": worked_hours,
            })
        AprobacionesService.sync_jornales(connection, rows_out)
        return rows_out

    @staticmethod
    def sync_jornales(connection, rows_out):
        for row in rows_out:
            planned_hours = 0
            if str(row.get("estado_turno") or "").upper() == "NORMAL":
                planned_hours = AprobacionesService.hours_between(row.get("hora_inicio"), row.get("hora_fin"))
            worked_hours = row.get("horas_trabajadas")
            if worked_hours is None:
                worked_hours = AprobacionesService.hours_between(row.get("entrada_hora"), row.get("salida_hora"))
            connection.execute("""
                INSERT INTO jornales (
                  persona_id,
                  fecha,
                  turno_id,
                  entrada_marca_id,
                  salida_marca_id,
                  estado_turno,
                  hora_inicio_plan,
                  hora_fin_plan,
                  actividad_ubicacion,
                  entrada_hora,
                  salida_hora,
                  estado_aprobacion,
                  modo_aprobacion,
                  aprobado_por_usuario_id,
                  aprobado_por,
                  fecha_aprobacion,
                  observacion_aprobacion,
                  horas_previstas,
                  horas_trabajadas,
                  fecha_actualizacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(persona_id, fecha) DO UPDATE SET
                  turno_id = excluded.turno_id,
                  entrada_marca_id = excluded.entrada_marca_id,
                  salida_marca_id = excluded.salida_marca_id,
                  estado_turno = excluded.estado_turno,
                  hora_inicio_plan = excluded.hora_inicio_plan,
                  hora_fin_plan = excluded.hora_fin_plan,
                  actividad_ubicacion = excluded.actividad_ubicacion,
                  entrada_hora = excluded.entrada_hora,
                  salida_hora = excluded.salida_hora,
                  estado_aprobacion = excluded.estado_aprobacion,
                  modo_aprobacion = excluded.modo_aprobacion,
                  aprobado_por_usuario_id = excluded.aprobado_por_usuario_id,
                  aprobado_por = excluded.aprobado_por,
                  fecha_aprobacion = excluded.fecha_aprobacion,
                  observacion_aprobacion = excluded.observacion_aprobacion,
                  horas_previstas = excluded.horas_previstas,
                  horas_trabajadas = excluded.horas_trabajadas,
                  fecha_actualizacion = CURRENT_TIMESTAMP
            """, (
                row.get("persona_id"),
                row.get("fecha"),
                row.get("turno_id"),
                row.get("entrada_id"),
                row.get("salida_id"),
                row.get("estado_turno") or "VACIO",
                row.get("hora_inicio"),
                row.get("hora_fin"),
                row.get("actividad_ubicacion"),
                row.get("entrada_hora"),
                row.get("salida_hora"),
                row.get("estado_aprobacion") or "PENDIENTE",
                row.get("modo_aprobacion"),
                row.get("aprobado_por_usuario_id"),
                row.get("aprobado_por"),
                row.get("fecha_aprobacion"),
                row.get("observacion_aprobacion"),
                planned_hours,
                worked_hours,
            ))

    @staticmethod
    def update(connection, payload):
        estado = str(payload.get("estado") or "APROBADA").upper()
        if estado not in {"PENDIENTE", "APROBADA", "VALIDADA_CON_INCIDENCIA", "REQUIERE_REVISION", "RECHAZADA"}:
            raise ValueError("Estado de aprobación inválido")
        observacion = payload.get("observacion")
        user_id = repo.normalize_user_id(payload.get("usuario_id"))
        mark_ids = payload.get("marca_ids") or []
        date_from = payload.get("desde") or payload.get("fecha")
        date_to = payload.get("hasta") or payload.get("fecha") or date_from
        persona_id = payload.get("persona_id")

        params = []
        where = []
        if mark_ids:
            placeholders = ",".join(["?"] * len(mark_ids))
            where.append(f"id IN ({placeholders})")
            params.extend(mark_ids)
        else:
            if not date_from or not date_to:
                raise ValueError("Rango o marcas requeridas")
            where.append("date(fecha_hora) BETWEEN date(?) AND date(?)")
            params.extend([date_from, date_to])
            if persona_id:
                where.append("persona_id = ?")
                params.append(persona_id)
        where.append("COALESCE(anulada, 0) = 0")
        where_sql = " AND ".join(where)
        connection.execute(f"""
            UPDATE marcas
            SET
              estado_aprobacion = ?,
              fecha_aprobacion = CASE WHEN ? IN ('PENDIENTE', 'REQUIERE_REVISION') THEN NULL ELSE CURRENT_TIMESTAMP END,
              aprobado_por_usuario_id = CASE WHEN ? IN ('PENDIENTE', 'REQUIERE_REVISION') THEN NULL ELSE ? END,
              observacion_aprobacion = ?
            WHERE {where_sql}
        """, (estado, estado, estado, user_id, observacion, *params))
        changed = connection.execute("SELECT changes() AS total").fetchone()["total"]
        return {"ok": True, "marcas": changed, "estado": estado}


class ObservacionesJornalService:
    @staticmethod
    def sync_from_incidencias(connection, date_from, date_to):
        if not date_from or not date_to:
            return {"ok": True, "observaciones": 0}
        incident_rows = connection.execute("""
            SELECT
              incidencias.*,
              jornales.id AS jornal_id,
              aprobador.usuario AS aprobado_por_usuario
            FROM incidencias
            LEFT JOIN jornales
              ON jornales.persona_id = incidencias.persona_id
             AND jornales.fecha = incidencias.fecha
            LEFT JOIN usuarios AS aprobador
              ON aprobador.id = incidencias.aprobado_por_usuario_id
            WHERE incidencias.fecha BETWEEN ? AND ?
        """, (date_from, date_to)).fetchall()
        for incident in incident_rows:
            state = "RESUELTA" if int(incident["resuelta"] or 0) else "PENDIENTE"
            connection.execute("""
                INSERT INTO observaciones_jornal (
                  incidencia_id,
                  jornal_id,
                  persona_id,
                  fecha,
                  tipo,
                  severidad,
                  detalle,
                  estado,
                  origen,
                  referencia_tipo,
                  referencia_id,
                  minutos_desfasaje,
                  resuelta,
                  fecha_resolucion,
                  aprobado_por_usuario_id,
                  aprobado_por_usuario,
                  observacion_aprobacion,
                  fecha_creacion,
                  fecha_actualizacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
                ON CONFLICT(incidencia_id) DO UPDATE SET
                  jornal_id = excluded.jornal_id,
                  persona_id = excluded.persona_id,
                  fecha = excluded.fecha,
                  tipo = excluded.tipo,
                  severidad = excluded.severidad,
                  detalle = excluded.detalle,
                  estado = excluded.estado,
                  origen = excluded.origen,
                  referencia_tipo = excluded.referencia_tipo,
                  referencia_id = excluded.referencia_id,
                  minutos_desfasaje = excluded.minutos_desfasaje,
                  resuelta = excluded.resuelta,
                  fecha_resolucion = excluded.fecha_resolucion,
                  aprobado_por_usuario_id = excluded.aprobado_por_usuario_id,
                  aprobado_por_usuario = excluded.aprobado_por_usuario,
                  observacion_aprobacion = excluded.observacion_aprobacion,
                  fecha_actualizacion = CURRENT_TIMESTAMP
            """, (
                incident["id"],
                incident["jornal_id"],
                incident["persona_id"],
                incident["fecha"],
                incident["tipo"],
                incident["severidad"],
                incident["detalle"],
                state,
                incident["origen"],
                incident["referencia_tipo"],
                incident["referencia_id"],
                incident["minutos_desfasaje"],
                incident["resuelta"],
                incident["fecha_resolucion"],
                incident["aprobado_por_usuario_id"],
                incident["aprobado_por_usuario"],
                incident["observacion_aprobacion"],
                incident["fecha_creacion"],
            ))
        return {"ok": True, "observaciones": len(incident_rows)}



class IncidenciasService:
    @staticmethod
    def generate_for_range(connection, date_from, date_to):
        tolerance = app_config_json(connection, "alert_tolerance", {})
        green_minutes = int(tolerance.get("greenMinutes") or 15)
        yellow_minutes = int(tolerance.get("yellowMinutes") or 30)
        parsed_from = parse_iso_date(date_from)
        parsed_to = parse_iso_date(date_to)
        marks_from = (parsed_from - timedelta(days=1)).strftime("%Y-%m-%d") if parsed_from else date_from
        marks_to = (parsed_to + timedelta(days=1)).strftime("%Y-%m-%d") if parsed_to else date_to
        active_keys = set()

        turnos = connection.execute("""
            SELECT
              turnos.*,
              personas.nombre AS persona
            FROM turnos
            JOIN personas ON personas.id = turnos.persona_id
            WHERE turnos.fecha BETWEEN ? AND ?
        """, (date_from, date_to)).fetchall()
        marcas = connection.execute("""
            SELECT
              marcas.*,
              personas.nombre AS persona
            FROM marcas
            JOIN personas ON personas.id = marcas.persona_id
            WHERE date(marcas.fecha_hora) BETWEEN date(?) AND date(?)
              AND COALESCE(marcas.anulada, 0) = 0
        """, (marks_from, marks_to)).fetchall()

        marks_by_person_day = {}
        for mark in marcas:
            mark_day = date_from_db_datetime(mark["fecha_hora"])
            key = (mark["persona_id"], mark_day)
            marks_by_person_day.setdefault(key, []).append(mark)
            if date_from <= mark_day <= date_to and int(mark["genera_incidencia"] or 0):
                active_keys.add(IncidenciasService.upsert_incidencia(connection, {
                    "clave": f"marca_ubicacion|{mark['id']}",
                    "persona_id": mark["persona_id"],
                    "fecha": mark_day,
                    "tipo": "MARCA_FUERA_UBICACION",
                    "severidad": "ROJA",
                    "detalle": f"{mark['persona']} marcó {mark['tipo']} desde {mark['ubicacion_detectada'] or 'ubicación no admitida'}",
                    "origen": "SISTEMA",
                    "referencia_tipo": "marca",
                    "referencia_id": mark["id"],
                }))

        IncidenciasService.upsert_incomplete_mark_incidents(connection, marcas, date_from, date_to, active_keys)

        for turno in turnos:
            status = str(turno["estado"] or "VACIO").upper()
            day_marks = marks_by_person_day.get((turno["persona_id"], turno["fecha"]), [])
            _, entries, exits = AprobacionesService.shift_marks(turno, marks_by_person_day)
            base_key = f"turno|{turno['persona_id']}|{turno['fecha']}"

            if status != "NORMAL":
                if day_marks and status in {"VACIO", "LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE"}:
                    status_detail = {
                        "VACIO": "SIN HORARIO PLANIFICADO",
                        "LIBRE": "ESTANDO LIBRE",
                        "LICENCIA": "ESTANDO DE LICENCIA",
                        "SUSPENDIDO": "ESTANDO SUSPENDIDO",
                        "LIC. MEDICA": "ESTANDO CON LICENCIA MEDICA",
                        "AUSENTE": "ESTANDO AUSENTE",
                    }.get(status, f"CON ESTADO {status}")
                    active_keys.add(IncidenciasService.upsert_incidencia(connection, {
                        "clave": f"{base_key}|marca_sin_horario",
                        "persona_id": turno["persona_id"],
                        "fecha": turno["fecha"],
                        "tipo": "MARCA_EN_ESTADO_SIN_HORARIO",
                        "severidad": "AMARILLA" if status == "VACIO" else "ROJA",
                        "detalle": f"{turno['persona']} registró marcas {status_detail}",
                        "origen": "SISTEMA",
                        "referencia_tipo": "turno",
                        "referencia_id": turno["id"],
                    }))
                continue

            missing_marks = []
            if not entries:
                missing_marks.append(f"entrada {turno['hora_inicio'] or '--'}")
            if not exits:
                missing_marks.append(f"salida {turno['hora_fin'] or '--'}")
            if missing_marks:
                active_keys.add(IncidenciasService.upsert_incidencia(connection, {
                    "clave": f"{base_key}|marcas_faltantes",
                    "persona_id": turno["persona_id"],
                    "fecha": turno["fecha"],
                    "tipo": "TURNO_CON_MARCAS_FALTANTES",
                    "severidad": "ROJA",
                    "detalle": f"{turno['persona']} no tiene marca de {' ni '.join(missing_marks)}",
                    "origen": "SISTEMA",
                    "referencia_tipo": "turno",
                    "referencia_id": turno["id"],
                }))
            if entries and exits:
                IncidenciasService.upsert_tramo_observado_incidencia(
                    connection, active_keys, base_key, turno, entries, exits, green_minutes, yellow_minutes
                )

        IncidenciasService.resolve_inactive_system_incidents(connection, date_from, date_to, active_keys)
        total = connection.execute("""
            SELECT COUNT(*) AS total
            FROM incidencias
            WHERE fecha BETWEEN ? AND ?
        """, (date_from, date_to)).fetchone()["total"]
        pendientes = connection.execute("""
            SELECT COUNT(*) AS total
            FROM incidencias
            WHERE fecha BETWEEN ? AND ? AND resuelta = 0
        """, (date_from, date_to)).fetchone()["total"]
        ObservacionesJornalService.sync_from_incidencias(connection, date_from, date_to)
        return {"ok": True, "incidencias": total, "pendientes": pendientes}

    @staticmethod
    def upsert_incomplete_mark_incidents(connection, marcas, date_from, date_to, active_keys):
        marks_by_person = {}
        for mark in marcas:
            marks_by_person.setdefault(mark["persona_id"], []).append(mark)

        for person_marks in marks_by_person.values():
            pending_entry = None
            for mark in sorted(person_marks, key=lambda item: item["fecha_hora"]):
                mark_type = str(mark["tipo"] or "").lower()
                if mark_type == "entrada":
                    if pending_entry is not None:
                        IncidenciasService.upsert_incomplete_mark_incident(
                            connection, active_keys, pending_entry, "SALIDA", date_from, date_to
                        )
                    pending_entry = mark
                    continue
                if mark_type == "salida":
                    if pending_entry is not None:
                        pending_entry = None
                    else:
                        IncidenciasService.upsert_incomplete_mark_incident(
                            connection, active_keys, mark, "ENTRADA", date_from, date_to
                        )
            if pending_entry is not None:
                IncidenciasService.upsert_incomplete_mark_incident(
                    connection, active_keys, pending_entry, "SALIDA", date_from, date_to
                )

    @staticmethod
    def upsert_incomplete_mark_incident(connection, active_keys, mark, missing_kind, date_from, date_to):
        mark_day = date_from_db_datetime(mark["fecha_hora"])
        if not mark_day or mark_day < date_from or mark_day > date_to:
            return
        missing_label = "Falta entrada" if missing_kind == "ENTRADA" else "Falta salida"
        mark_time = time_from_db_datetime(mark["fecha_hora"]) or "--"
        active_keys.add(IncidenciasService.upsert_incidencia(connection, {
            "clave": f"marca_incompleta|{mark['id']}|{missing_kind.lower()}",
            "persona_id": mark["persona_id"],
            "fecha": mark_day,
            "tipo": "MARCA_INCOMPLETA",
            "severidad": "ROJA",
            "detalle": f"{mark['persona']} - {missing_label} para {str(mark['tipo'] or '').lower()} {mark_time}",
            "origen": "SISTEMA",
            "referencia_tipo": "marca",
            "referencia_id": mark["id"],
        }))

    @staticmethod
    def resolve_inactive_system_incidents(connection, date_from, date_to, active_keys):
        if active_keys:
            placeholders = ",".join(["?"] * len(active_keys))
            connection.execute(f"""
                UPDATE incidencias
                SET resuelta = 1, fecha_resolucion = CURRENT_TIMESTAMP, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE origen = 'SISTEMA'
                  AND resuelta = 0
                  AND fecha BETWEEN ? AND ?
                  AND clave NOT IN ({placeholders})
            """, (date_from, date_to, *active_keys))
            return
        connection.execute("""
            UPDATE incidencias
            SET resuelta = 1, fecha_resolucion = CURRENT_TIMESTAMP, fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE origen = 'SISTEMA'
              AND resuelta = 0
              AND fecha BETWEEN ? AND ?
        """, (date_from, date_to))

    @staticmethod
    def upsert_desfasaje_incidencia(connection, active_keys, base_key, turno, marks, kind, expected, green_minutes, yellow_minutes):
        if not expected:
            return
        real_times = [time_from_db_datetime(mark["fecha_hora"]) for mark in marks]
        if kind == "ENTRADA":
            real_time = min(real_times)
        elif AprobacionesService.shift_exit_day(turno) != turno["fecha"]:
            real_time = min(real_times)
        else:
            real_time = max(real_times)
        diff = shift_diff_minutes(real_time, expected)
        if diff is None or abs(diff) <= green_minutes:
            return
        severity = "AMARILLA" if abs(diff) <= yellow_minutes else "ROJA"
        direction = "después" if diff > 0 else "antes"
        active_keys.add(IncidenciasService.upsert_incidencia(connection, {
            "clave": f"{base_key}|desfasaje_{kind.lower()}",
            "persona_id": turno["persona_id"],
            "fecha": turno["fecha"],
            "tipo": f"DESFASAJE_{kind}",
            "severidad": severity,
            "detalle": f"{turno['persona']} marcó {kind.lower()} {abs(diff)} minutos {direction} de lo previsto ({expected} vs {real_time})",
            "origen": "SISTEMA",
            "referencia_tipo": "turno",
            "referencia_id": turno["id"],
            "minutos_desfasaje": abs(diff),
        }))

    @staticmethod
    def upsert_tramo_observado_incidencia(connection, active_keys, base_key, turno, entries, exits, green_minutes, yellow_minutes):
        entry, exit_mark = AprobacionesService.selected_entry_exit(turno, entries, exits)
        if not entry or not exit_mark:
            return
        if any(str(mark["tipo_marca"] or "").lower() == "marca manual admin" for mark in [entry, exit_mark]):
            return
        checks = [
            {
                "kind": "entrada",
                "expected": turno["hora_inicio"],
                "real": time_from_db_datetime(entry["fecha_hora"]),
            },
            {
                "kind": "salida",
                "expected": turno["hora_fin"],
                "real": time_from_db_datetime(exit_mark["fecha_hora"]),
            },
        ]
        observations = []
        max_diff = 0
        for check in checks:
            diff = shift_diff_minutes(check["real"], check["expected"])
            if diff is None or abs(diff) <= green_minutes:
                continue
            max_diff = max(max_diff, abs(diff))
            direction = "después" if diff > 0 else "antes"
            observations.append(
                f"{check['kind']} {abs(diff)} minutos {direction} de lo previsto ({check['expected']} vs {check['real']})"
            )
        location_observations = [
            f"{str(mark['tipo'] or '').lower()} fuera de ubicación ({mark['ubicacion_detectada'] or 'ubicación no admitida'})"
            for mark in [entry, exit_mark]
            if int(mark["genera_incidencia"] or 0)
        ]
        if location_observations:
            observations.extend(location_observations)
            active_keys.discard(f"marca_ubicacion|{entry['id']}")
            active_keys.discard(f"marca_ubicacion|{exit_mark['id']}")
        if not observations:
            return
        severity = "ROJA" if location_observations or max_diff > yellow_minutes else "AMARILLA"
        active_keys.add(IncidenciasService.upsert_incidencia(connection, {
            "clave": f"{base_key}|tramo_observado",
            "persona_id": turno["persona_id"],
            "fecha": turno["fecha"],
            "tipo": "TRAMO_OBSERVADO",
            "severidad": severity,
            "detalle": f"{turno['persona']} tiene un tramo observado: {'; '.join(observations)}",
            "origen": "SISTEMA",
            "referencia_tipo": "turno",
            "referencia_id": turno["id"],
            "minutos_desfasaje": max_diff,
        }))

    @staticmethod
    def upsert_incidencia(connection, incident):
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(clave) DO UPDATE SET
              persona_id = excluded.persona_id,
              fecha = excluded.fecha,
              tipo = excluded.tipo,
              severidad = excluded.severidad,
              detalle = excluded.detalle,
              origen = excluded.origen,
              referencia_tipo = excluded.referencia_tipo,
              referencia_id = excluded.referencia_id,
              minutos_desfasaje = excluded.minutos_desfasaje,
              fecha_actualizacion = CURRENT_TIMESTAMP
        """, (
            incident["clave"],
            incident.get("persona_id"),
            incident["fecha"],
            incident["tipo"],
            incident.get("severidad", "INFO"),
            incident.get("detalle"),
            incident.get("origen", "SISTEMA"),
            incident.get("referencia_tipo"),
            incident.get("referencia_id"),
            incident.get("minutos_desfasaje"),
        ))
        return incident["clave"]

    @staticmethod
    def resolve(connection, payload):
        ids = payload.get("ids") or []
        if not ids:
            return {"ok": True, "resueltas": 0}
        user_id = repo.normalize_user_id(payload.get("usuario_id"))
        observacion = str(payload.get("observacion_aprobacion") or payload.get("comentario") or "").strip() or None
        placeholders = ",".join(["?"] * len(ids))
        absent_required = connection.execute(f"""
            SELECT incidencias.id, personas.nombre AS persona, incidencias.fecha
            FROM incidencias
            LEFT JOIN personas ON personas.id = incidencias.persona_id
            WHERE incidencias.id IN ({placeholders})
              AND incidencias.tipo IN ('TURNO_SIN_ENTRADA', 'TURNO_SIN_SALIDA', 'TURNO_CON_MARCAS_FALTANTES')
              AND NOT EXISTS (
                SELECT 1
                FROM marcas
                WHERE marcas.persona_id = incidencias.persona_id
                  AND date(marcas.fecha_hora) = date(incidencias.fecha)
              )
        """, tuple(ids)).fetchall()
        if absent_required:
            names = ", ".join([f"{row['persona'] or 'Sin persona'} {row['fecha']}" for row in absent_required])
            raise ValueError(f"No se puede aprobar sin cargar una marca manual o marcar ausente en el plan semanal: {names}")
        connection.executemany("""
            UPDATE incidencias
            SET
              resuelta = 1,
              fecha_resolucion = CURRENT_TIMESTAMP,
              aprobado_por_usuario_id = ?,
              observacion_aprobacion = ?,
              fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [(user_id, observacion, item) for item in ids])
        touched_jornales = IncidenciasService.approve_marks_for_resolved_incidents(connection, ids, user_id, observacion)
        touched_dates = sorted({row["fecha"] for row in connection.execute(f"""
            SELECT fecha FROM incidencias WHERE id IN ({placeholders})
        """, tuple(ids)).fetchall() if row["fecha"]})
        for date_value in touched_dates:
            ObservacionesJornalService.sync_from_incidencias(connection, date_value, date_value)
        return {"ok": True, "resueltas": len(ids), "touched_jornales": touched_jornales}

    @staticmethod
    def approve_marks_for_resolved_incidents(connection, ids, user_id, observacion):
        if not ids:
            return []
        placeholders = ",".join(["?"] * len(ids))
        incidents = connection.execute(f"""
            SELECT
              incidencias.persona_id,
              incidencias.fecha,
              COALESCE(turno_ref.id, turno_fecha.id) AS turno_id,
              COALESCE(turno_ref.hora_inicio, turno_fecha.hora_inicio) AS hora_inicio,
              COALESCE(turno_ref.hora_fin, turno_fecha.hora_fin) AS hora_fin
            FROM incidencias
            LEFT JOIN turnos AS turno_ref ON incidencias.referencia_tipo = 'turno' AND turno_ref.id = incidencias.referencia_id
            LEFT JOIN turnos AS turno_fecha ON turno_fecha.persona_id = incidencias.persona_id AND turno_fecha.fecha = incidencias.fecha
            WHERE incidencias.id IN ({placeholders})
              AND incidencias.tipo IN ('TRAMO_OBSERVADO', 'DESFASAJE_ENTRADA', 'DESFASAJE_SALIDA', 'MARCA_FUERA_UBICACION', 'MARCA_EN_ESTADO_SIN_HORARIO')
              AND incidencias.persona_id IS NOT NULL
        """, tuple(ids)).fetchall()
        touched = []
        for incident in incidents:
            touched.append({"persona_id": incident["persona_id"], "fecha": incident["fecha"]})
            mark_days = [incident["fecha"]]
            if incident["hora_inicio"] and incident["hora_fin"]:
                exit_day = AprobacionesService.shift_exit_day({
                    "fecha": incident["fecha"],
                    "hora_inicio": incident["hora_inicio"],
                    "hora_fin": incident["hora_fin"],
                })
                if exit_day != incident["fecha"]:
                    mark_days.append(exit_day)
            placeholders_days = ",".join(["date(?)"] * len(mark_days))
            connection.execute(f"""
                UPDATE marcas
                SET
                  estado_aprobacion = 'APROBADA',
                  fecha_aprobacion = CURRENT_TIMESTAMP,
                  aprobado_por_usuario_id = ?,
                  observacion_aprobacion = ?
                WHERE persona_id = ?
                  AND date(fecha_hora) IN ({placeholders_days})
                  AND COALESCE(anulada, 0) = 0
            """, (user_id, observacion, incident["persona_id"], *mark_days))
        unique = {}
        for item in touched:
            unique[(item["persona_id"], item["fecha"])] = item
        return list(unique.values())

    @staticmethod
    def resolve_person_day_system_incidents(connection, persona_id, date_value, user_id=None, note=None):
        if not persona_id or not date_value:
            return 0
        connection.execute("""
            UPDATE incidencias
            SET
              resuelta = 1,
              fecha_resolucion = CURRENT_TIMESTAMP,
              aprobado_por_usuario_id = COALESCE(?, aprobado_por_usuario_id),
              observacion_aprobacion = COALESCE(?, observacion_aprobacion),
              fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE persona_id = ?
              AND fecha = ?
              AND origen = 'SISTEMA'
              AND resuelta = 0
        """, (user_id, note, persona_id, date_value))
        return connection.execute("SELECT changes() AS total").fetchone()["total"]

    @staticmethod
    def pass_to_plan(connection, payload):
        ids = payload.get("ids") or []
        if not ids:
            return {"ok": True, "turnos": 0, "touched_dates": []}
        placeholders = ",".join(["?"] * len(ids))
        incidents = connection.execute(f"""
            SELECT
              incidencias.id,
              incidencias.persona_id,
              incidencias.fecha,
              personas.nombre AS persona
            FROM incidencias
            LEFT JOIN personas ON personas.id = incidencias.persona_id
            WHERE incidencias.id IN ({placeholders})
              AND incidencias.tipo = 'MARCA_EN_ESTADO_SIN_HORARIO'
              AND incidencias.resuelta = 0
        """, tuple(ids)).fetchall()
        if not incidents:
            return {"ok": True, "turnos": 0, "touched_dates": []}

        updated = 0
        touched_dates = set()
        touched_jornales = []
        for incident in incidents:
            parsed_incident_day = parse_iso_date(incident["fecha"])
            next_incident_day = (parsed_incident_day + timedelta(days=1)).strftime("%Y-%m-%d") if parsed_incident_day else incident["fecha"]
            marks = connection.execute("""
                SELECT *
                FROM marcas
                WHERE persona_id = ?
                  AND date(fecha_hora) BETWEEN date(?) AND date(?)
                  AND COALESCE(anulada, 0) = 0
                ORDER BY fecha_hora
            """, (incident["persona_id"], incident["fecha"], next_incident_day)).fetchall()
            if not marks:
                raise ValueError(f"No hay marcas para pasar al plan semanal: {incident['persona'] or 'Sin persona'} {incident['fecha']}")
            entries = [mark for mark in marks if str(mark["tipo"] or "").lower() == "entrada" and date_from_db_datetime(mark["fecha_hora"]) == incident["fecha"]]
            exits = [mark for mark in marks if str(mark["tipo"] or "").lower() == "salida"]
            start_mark = entries[0] if entries else marks[0]
            exits_after_start = [mark for mark in exits if str(mark["fecha_hora"]) > str(start_mark["fecha_hora"])]
            end_mark = exits_after_start[0] if exits_after_start else (exits[-1] if exits else (marks[-1] if len(marks) > 1 else None))
            activity_mark = next((mark for mark in marks if str(mark["actividad_ubicacion"] or "").strip()), None)
            mark_types = {str(mark["tipo_marca"] or "").upper() for mark in marks}
            regularized_origin = "MARCA_MANUAL_ADMIN" if any("MANUAL" in item for item in mark_types) else "MARCA_RELOJ"
            repo.upsert_turno(connection, {
                "persona_id": incident["persona_id"],
                "fecha": incident["fecha"],
                "estado": "NORMAL",
                "hora_inicio": time_from_db_datetime(start_mark["fecha_hora"]),
                "hora_fin": time_from_db_datetime(end_mark["fecha_hora"]) if end_mark else None,
                "actividad_ubicacion": str((activity_mark or start_mark)["actividad_ubicacion"] or "").strip().upper() or "LOGISTICA",
                "modificado": True,
                "origen": regularized_origin,
                "origen_referencia_tipo": "incidencia",
                "origen_referencia_id": incident["id"],
                "fecha_regularizacion": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            updated += 1
            touched_dates.add(incident["fecha"])
            touched_jornales.append({"persona_id": incident["persona_id"], "fecha": incident["fecha"]})
        return {"ok": True, "turnos": updated, "touched_dates": sorted(touched_dates), "touched_jornales": touched_jornales}

    @staticmethod
    def mark_absent(connection, payload):
        ids = payload.get("ids") or []
        if not ids:
            return {"ok": True, "turnos": 0, "touched_dates": []}
        placeholders = ",".join(["?"] * len(ids))
        incidents = connection.execute(f"""
            SELECT
              incidencias.id,
              incidencias.persona_id,
              incidencias.fecha,
              incidencias.tipo,
              personas.nombre AS persona,
              COALESCE(turno_ref.id, turno_fecha.id) AS turno_id
            FROM incidencias
            LEFT JOIN personas ON personas.id = incidencias.persona_id
            LEFT JOIN turnos AS turno_ref ON incidencias.referencia_tipo = 'turno' AND turno_ref.id = incidencias.referencia_id
            LEFT JOIN turnos AS turno_fecha ON turno_fecha.persona_id = incidencias.persona_id AND turno_fecha.fecha = incidencias.fecha
            WHERE incidencias.id IN ({placeholders})
              AND incidencias.tipo IN ('TURNO_SIN_ENTRADA', 'TURNO_SIN_SALIDA', 'TURNO_CON_MARCAS_FALTANTES')
              AND incidencias.resuelta = 0
        """, tuple(ids)).fetchall()
        if not incidents:
            return {"ok": True, "turnos": 0, "touched_dates": []}

        updated = 0
        touched_dates = set()
        touched_jornales = []
        for incident in incidents:
            marks_count = connection.execute("""
                SELECT COUNT(*) AS total
                FROM marcas
                WHERE persona_id = ?
                  AND date(fecha_hora) = date(?)
                  AND COALESCE(anulada, 0) = 0
            """, (incident["persona_id"], incident["fecha"])).fetchone()["total"]
            if marks_count:
                raise ValueError(f"No se puede marcar ausente porque hay marcas registradas: {incident['persona'] or 'Sin persona'} {incident['fecha']}")
            repo.upsert_turno(connection, {
                "persona_id": incident["persona_id"],
                "fecha": incident["fecha"],
                "estado": "AUSENTE",
                "hora_inicio": None,
                "hora_fin": None,
                "actividad_ubicacion": None,
                "modificado": True,
            })
            updated += 1
            touched_dates.add(incident["fecha"])
            touched_jornales.append({"persona_id": incident["persona_id"], "fecha": incident["fecha"]})
        return {"ok": True, "turnos": updated, "touched_dates": sorted(touched_dates), "touched_jornales": touched_jornales}
