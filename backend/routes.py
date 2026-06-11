from backend import repositories as repo
from backend.database import connect
from backend.services import IncidenciasService


def query_value(query, *names):
    for name in names:
        values = query.get(name)
        if values:
            return values[0]
    return None


def route_get(handler, path, query):
    if path == "/api/health":
        return {
            "ok": True,
            "status": "ready",
        }
    if path == "/api/session":
        return handler.session()
    if path == "/api/personas":
        return repo.list_personas()
    if path == "/api/usuarios":
        return repo.list_usuarios()
    if path == "/api/roles-app":
        return repo.list_roles_app()
    if path == "/api/roles-operativos":
        return repo.list_roles_operativos()
    if path == "/api/ubicaciones":
        return repo.list_ubicaciones()
    if path == "/api/operaciones":
        return repo.list_operaciones()
    if path == "/api/operacion-tarifas":
        return repo.list_operacion_tarifas(query_value(query, "activas") in {"1", "true", "si"})
    if path == "/api/facturacion":
        return repo.list_facturacion(query_value(query, "desde", "from"), query_value(query, "hasta", "to"))
    if path == "/api/configuracion":
        return repo.list_configuracion()
    if path == "/api/turnos":
        return repo.list_turnos(query_value(query, "desde", "from"), query_value(query, "hasta", "to"))
    if path == "/api/jornales":
        return handler.read_jornales(
            query_value(query, "desde", "from"),
            query_value(query, "hasta", "to"),
            query_value(query, "persona"),
        )
    if path == "/api/aprobaciones":
        return handler.read_aprobaciones(
            query_value(query, "desde", "from"),
            query_value(query, "hasta", "to"),
            query_value(query, "persona"),
        )
    if path == "/api/marcas":
        return repo.list_marcas(
            query_value(query, "persona"),
            query_value(query, "desde", "from"),
            query_value(query, "hasta", "to"),
        )
    if path == "/api/incidencias":
        date_from = query_value(query, "desde", "from")
        date_to = query_value(query, "hasta", "to")
        status = query_value(query, "estado")
        if date_from and date_to:
            with connect() as connection:
                IncidenciasService.generate_for_range(connection, date_from, date_to)
                connection.commit()
        return repo.list_incidencias(date_from, date_to, status)
    raise ValueError(f"Endpoint GET no implementado: {path}")


def route_post(handler, path, payload):
    if path == "/api/login":
        return handler.login(payload)
    if path == "/api/password-reset":
        return handler.reset_password(payload)
    if path == "/api/importacion/marcas":
        return handler.import_marcas(payload)

    parts = path.strip("/").split("/")
    if path == "/api/personas":
        return handler.save_persona(payload)
    if path == "/api/roles-operativos":
        return handler.save_rol_operativo(payload)
    if path == "/api/ubicaciones":
        return handler.save_ubicacion(payload)
    if path == "/api/configuracion":
        return handler.save_configuracion(payload)
    if path == "/api/usuarios":
        return handler.save_usuario(payload)
    if len(parts) == 3 and parts[:2] == ["api", "personas"]:
        return handler.save_persona(payload, int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "personas"] and parts[3] == "toggle":
        return handler.toggle_persona(int(parts[2]))
    if len(parts) == 3 and parts[:2] == ["api", "roles-operativos"]:
        return handler.save_rol_operativo(payload, int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "roles-operativos"] and parts[3] == "delete":
        return handler.delete_rol_operativo(int(parts[2]))
    if len(parts) == 3 and parts[:2] == ["api", "ubicaciones"]:
        return handler.save_ubicacion(payload, int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "ubicaciones"] and parts[3] == "delete":
        return handler.delete_ubicacion(int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "usuarios"] and parts[3] == "toggle":
        return handler.toggle_usuario(int(parts[2]))
    if len(parts) == 3 and parts[:2] == ["api", "usuarios"]:
        return handler.save_usuario(payload, int(parts[2]))
    if path == "/api/turnos":
        return handler.save_turno(payload)
    if path == "/api/turnos/lote":
        return handler.save_turnos_lote(payload)
    if path == "/api/marcas":
        return handler.create_marca(payload)
    if len(parts) == 4 and parts[:2] == ["api", "marcas"] and parts[3] == "delete":
        return handler.delete_marca(int(parts[2]))
    if len(parts) == 3 and parts[:2] == ["api", "marcas"]:
        return handler.update_marca(int(parts[2]), payload)
    if path == "/api/aprobaciones":
        return handler.update_aprobaciones(payload)
    if path == "/api/incidencias/generar":
        return handler.generate_incidencias(payload)
    if path == "/api/incidencias/resolver":
        return handler.resolve_incidencias(payload)
    if path == "/api/incidencias/pasar-a-plan":
        return handler.pass_incidencias_to_plan(payload)
    if path == "/api/incidencias/marcar-ausente":
        return handler.mark_incidencias_absent(payload)
    if path == "/api/operaciones":
        return handler.create_operacion(payload)
    if len(parts) == 3 and parts[:2] == ["api", "operaciones"]:
        return handler.update_operacion(int(parts[2]), payload)
    if path == "/api/operacion-tarifas":
        return repo.save_operacion_tarifa(payload)
    if len(parts) == 3 and parts[:2] == ["api", "operacion-tarifas"]:
        return repo.save_operacion_tarifa(payload, int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "operacion-tarifas"] and parts[3] == "delete":
        return repo.delete_operacion_tarifa(int(parts[2]))
    if path == "/api/facturacion":
        return repo.save_facturacion(payload)
    if len(parts) == 3 and parts[:2] == ["api", "facturacion"]:
        return repo.save_facturacion(payload, int(parts[2]))
    if len(parts) == 4 and parts[:2] == ["api", "facturacion"] and parts[3] == "delete":
        return repo.delete_facturacion(int(parts[2]))
    raise ValueError(f"Endpoint POST no implementado: {path}")
