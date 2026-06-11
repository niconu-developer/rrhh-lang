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
PLANNER_RRHH_PASSWORD=otra-clave-segura
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

## Seguridad minima

Antes de exponerlo:

- Cambiar `PLANNER_ADMIN_PASSWORD`.
- Usar HTTPS si se usan camara/geolocalizacion.
- Poner Nginx delante.
- Mantener `PLANNER_PUBLIC_FACE_CLOCK=0` salvo kiosco protegido por red/VPN/Nginx.
