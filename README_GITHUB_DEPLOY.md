# LANG - Sistema de gestion de personal

Proyecto web vanilla + backend Python/PostgreSQL para plan semanal, reloj, marcas, incidencias, validacion de jornales, operaciones, reportes, facturacion y liquidacion.

## Que se sube a GitHub

Subir codigo y estructura:

- `backend/` sin `planner.db`
- `frontend/`
- `Dockerfile`
- `docker-compose.example.yml`
- `.env.example`
- `backend/schema.sql`
- `backend/seed.sql`
- `backend/schema.postgres.sql`
- `backend/seed.postgres.sql`

No subir datos locales ni respaldos:

- `backend/planner.db`
- `backups/`
- `OLD/`
- `.env`
- archivos `.zip`
- `.DS_Store`

Eso queda protegido por `.gitignore`.

## Correr local

```bash
python3 backend/app.py
```

Abrir:

```text
http://127.0.0.1:8765/index.html
```

## Correr en servidor con Docker

1. Copiar el ejemplo:

```bash
cp .env.example .env
```

2. Cambiar estos valores en `.env`:

```text
PLANNER_PUBLIC_PORT=8766
PLANNER_BASE_PATH=/rrhh
PLANNER_PUBLIC_BASE_URL=https://app.lang.uy/rrhh
PLANNER_ADMIN_PASSWORD=una-clave-segura
POSTGRES_PASSWORD=una-clave-segura-de-base
DATABASE_URL=postgresql://lang_rrhh:una-clave-segura-de-base@rrhh-db:5432/lang_rrhh
```

3. Levantar:

```bash
docker compose -f docker-compose.example.yml up -d --build
```

La app queda publicada en el puerto externo configurado:

```text
http://SERVIDOR:8766/rrhh
```

## Convivencia con la app principal

Este sistema debe correr como servicio separado, pero publicado debajo de la app principal:

```text
https://app.lang.uy/rrhh
```

La app principal conserva su API en:

```text
https://app.lang.uy/api
```

RRHH usa su propia API bajo el subpath:

```text
https://app.lang.uy/rrhh/api
```

Para eso, configurar:

```text
PLANNER_BASE_PATH=/rrhh
```

Servicio sugerido:

- contenedor app: `lang-rrhh`
- contenedor base: `lang-rrhh-db`
- puerto interno: `8765`
- puerto externo local del servicio: `8766`
- volumen Docker app: `rrhh_data`
- volumen Docker PostgreSQL: `rrhh_postgres_data`

Ejemplo conceptual de Nginx:

```nginx
location /rrhh/ {
    proxy_pass http://127.0.0.1:8766/rrhh/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Cookie $http_cookie;
}
```

Importante:

- No rutear RRHH a `/api`, porque ese path pertenece a la app principal.
- No compartir `SESSION_SECRET` con RRHH.
- Mantener HTTPS, porque reloj facial y geolocalizacion lo necesitan.
- Generar relojes faciales solo desde Configuracion; cada link tiene token unico y se puede desactivar.

## Base de datos

En Docker, la base activa es PostgreSQL si `DATABASE_URL` esta configurada:

```text
postgresql://lang_rrhh:...@rrhh-db:5432/lang_rrhh
```

Para crear o actualizar la estructura de base:

```bash
docker compose -f docker-compose.example.yml exec rrhh python3 scripts/update_database.py
```

SQLite queda como fallback local si no se define `DATABASE_URL`. En ese caso vive en:

```text
backend/planner.db
```

Para una instalacion nueva, el backend crea/migra la base automaticamente al iniciar usando `schema.postgres.sql` y seeds controlados.

## PostgreSQL en paralelo

Estos archivos permiten crear y poblar PostgreSQL:

- `backend/schema.postgres.sql`
- `backend/seed.postgres.sql`
- `docker-compose.postgres.example.yml`
- `.env.postgres.example`
- `scripts/update_postgres_database.py`
- `scripts/migrate_sqlite_to_postgres.py`

Levantar solo PostgreSQL para pruebas:

```bash
cp .env.postgres.example .env.postgres
docker compose --env-file .env.postgres -f docker-compose.postgres.example.yml up -d
```

Instalar el conector de PostgreSQL:

```bash
python3 -m pip install -r requirements.txt
```

Crear/verificar estructura PostgreSQL:

```bash
DATABASE_URL=postgresql://lang_rrhh:cambiar-esta-clave@127.0.0.1:5433/lang_rrhh \
python3 scripts/update_postgres_database.py
```

Copiar datos desde SQLite hacia PostgreSQL:

```bash
DATABASE_URL=postgresql://lang_rrhh:cambiar-esta-clave@127.0.0.1:5433/lang_rrhh \
python3 scripts/migrate_sqlite_to_postgres.py --truncate
```

## Seguridad minima

Antes de exponerlo:

- Cambiar `PLANNER_ADMIN_PASSWORD`.
- Usar HTTPS si se usan camara/geolocalizacion.
- Poner Nginx delante.
- Generar relojes faciales solo desde Configuracion; cada link tiene token unico y se puede desactivar.

## SSO por cookie de la app principal

RRHH puede validar usuarios contra la sesion de la plataforma principal sin compartir `SESSION_SECRET` ni conectarse a la base de Depósito.

Configurar en `.env`:

```text
PLANNER_EXTERNAL_AUTH_ME_URL=https://app.lang.uy/api/auth/me
PLANNER_EXTERNAL_AUTH_COOKIE_NAME=connect.sid
PLANNER_EXTERNAL_AUTH_TIMEOUT_SECONDS=3
PLANNER_EXTERNAL_AUTH_DEBUG=0
```

Flujo:

1. El navegador entra a RRHH con la cookie `connect.sid`.
2. RRHH reenvia el header `Cookie` a `PLANNER_EXTERNAL_AUTH_ME_URL`.
3. Depósito responde `200` con `{ id, email, name, avatar_url, role }` o `401`.
4. RRHH busca ese `email` en `usuarios.email`.
5. Si existe y esta activo, usa el rol local de RRHH (`admin`, `rrhh`, `usuario`).

El rol que devuelve Depósito no reemplaza el rol local de RRHH. El matching es por email.

Para probar localmente con logs:

```bash
PLANNER_EXTERNAL_AUTH_ME_URL=https://app.lang.uy/api/auth/me \
PLANNER_EXTERNAL_AUTH_COOKIE_NAME=connect.sid \
PLANNER_EXTERNAL_AUTH_DEBUG=1 \
python3 backend/app.py
```

Probar Depósito sin cookie:

```bash
curl -i https://app.lang.uy/api/auth/me
```

Probar Depósito con cookie real:

```bash
curl -i https://app.lang.uy/api/auth/me \
  -H 'Cookie: connect.sid=PEGAR_COOKIE_REAL'
```

Probar RRHH local sin cookie:

```bash
curl -i http://127.0.0.1:8765/api/personas
```

Probar RRHH local reenviando cookie real:

```bash
curl -i http://127.0.0.1:8765/api/personas \
  -H 'Cookie: connect.sid=PEGAR_COOKIE_REAL'
```

Probar RRHH local con cookie invalida:

```bash
curl -i http://127.0.0.1:8765/api/personas \
  -H 'Cookie: connect.sid=COOKIE_INVALIDA'
```

No guardar cookies reales en archivos ni commits.
