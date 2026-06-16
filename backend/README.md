# Backend local

Este backend usa Python y puede trabajar con PostgreSQL o SQLite local.

## Base de datos

Archivo SQLite local, si no se define `DATABASE_URL`:

```text
backend/planner.db
```

Scripts:

```text
backend/schema.sql
backend/seed.sql
```

`schema.sql` define estructura y migraciones base. `seed.sql`/`seed.postgres.sql` contienen datos semilla de referencia o demo y no se ejecutan por defecto. Para cargarlos deliberadamente hay que iniciar el backend con:

```bash
PLANNER_RUN_DATA_SEED=1 python3 backend/app.py
```

En produccion con datos reales, mantener `PLANNER_RUN_DATA_SEED=0` o sin definir.

## Estructura interna

```text
backend/app.py           API, ruteo HTTP y orquestacion de casos de uso
backend/settings.py      variables de entorno y rutas
backend/database.py      conexion SQLite y helpers de lectura
backend/security.py      hashing de passwords y tokens
backend/repositories.py  lecturas principales, sesiones, CRUD administrativo, turnos, marcas y operaciones
backend/services.py      reglas de negocio de incidencias y aprobaciones
backend/utils.py         helpers compartidos de fechas, horas y configuracion
```

La capa de datos ya esta separada para lecturas principales, login, sesiones, administracion de personal/configuracion, persistencia de turnos, marcas y operaciones. Las reglas de incidencias y aprobaciones ya viven en servicios.

La tabla `jornales` funciona como cierre formal por persona y dia. Se alimenta desde turnos + marcas al leer o actualizar validaciones, y guarda la foto operativa del dia: horario previsto, marcas usadas, estado de aprobacion, aprobador, observacion, horas previstas y horas trabajadas. Esto evita depender solamente de calculos al vuelo para reportes y liquidacion.

Para reconstruir o actualizar la base:

```bash
python3 - <<'PY'
from backend.app import ensure_database
ensure_database()
print("Base lista")
PY
```

## Ejecutar servidor

Desde la carpeta del proyecto:

```bash
python3 backend/app.py
```

URL:

```text
http://127.0.0.1:8765
```

Pruebas rapidas:

```text
http://127.0.0.1:8765/api/health
```

Los endpoints de datos requieren login y token de sesion.

La app web queda en `frontend/`. En desarrollo, el backend la sirve desde:

```text
http://127.0.0.1:8765/index.html
```

En produccion se puede servir `frontend/` con Nginx y dejar Python solo para `/api` usando:

```bash
PLANNER_SERVE_STATIC=0 python3 backend/app.py
```
