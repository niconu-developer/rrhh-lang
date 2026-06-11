# LANG - Sistema de gestion de personal

Proyecto web vanilla + backend Python/SQLite para plan semanal, reloj, marcas, incidencias, validacion de jornales, operaciones, reportes, facturacion y liquidacion.

## Que se sube a GitHub

Subir codigo y estructura:

- `backend/` sin `planner.db`
- `frontend/`
- `Dockerfile`
- `docker-compose.example.yml`
- `.env.example`
- `backend/schema.sql`
- `backend/seed.sql`

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
PLANNER_ADMIN_PASSWORD=una-clave-segura
```

3. Levantar:

```bash
docker compose -f docker-compose.example.yml up -d --build
```

La app queda publicada en el puerto externo configurado:

```text
http://SERVIDOR:8766
```

## Convivencia con otra aplicacion

Este sistema debe correr como servicio separado:

- contenedor: `lang-rrhh`
- puerto interno: `8765`
- puerto externo sugerido: `8766`
- volumen Docker: `rrhh_data`

Si en el mismo servidor ya existe otra app, no usar su mismo puerto publico ni su mismo path `/api` en Nginx.

Opciones recomendadas:

- Subdominio: `rrhh.tudominio.com` apuntando a `127.0.0.1:8766`
- Puerto dedicado de testing: `https://tudominio.com:8766`

Evitar al principio:

- Montarlo como subpath tipo `/rrhh`, porque el frontend llama a `/api` desde el mismo origen y puede chocar con la otra aplicacion.

## Base de datos

En Docker, SQLite vive dentro del volumen `rrhh_data` como:

```text
/data/planner.db
```

Para crear o actualizar la estructura de base:

```bash
docker compose -f docker-compose.example.yml exec rrhh python3 scripts/update_database.py
```

Para backup:

```bash
docker compose -f docker-compose.example.yml exec rrhh cp /data/planner.db /data/planner-backup.db
```

Para una instalacion nueva, el backend crea/migra la base automaticamente al iniciar usando `schema.sql` y seeds controlados.

## PostgreSQL en paralelo

La app actual todavia corre contra SQLite. Estos archivos permiten empezar la migracion a PostgreSQL sin romper el entorno local:

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

Importante: esta fase crea y carga PostgreSQL. El cambio para que la aplicacion use PostgreSQL en runtime requiere migrar la capa de consultas del backend.

## Seguridad minima

Antes de exponerlo:

- Cambiar `PLANNER_ADMIN_PASSWORD`.
- Usar HTTPS si se usan camara/geolocalizacion.
- Poner Nginx delante.
- Mantener `PLANNER_PUBLIC_FACE_CLOCK=0` salvo kiosco protegido por red/VPN/Nginx.

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
