PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles_app (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS roles_operativos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  aparece_plan_semanal INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  codigo_privado TEXT UNIQUE,
  email TEXT,
  rol_operativo_id INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  horario_tipo TEXT NOT NULL DEFAULT 'variable',
  horario_fijo_json TEXT,
  valor_hora REAL NOT NULL DEFAULT 0,
  horas_acordadas REAL NOT NULL DEFAULT 190,
  tipo_libreta TEXT NOT NULL DEFAULT 'NO TIENE',
  vencimiento_libreta TEXT,
  vencimiento_carne_salud TEXT,
  FOREIGN KEY (rol_operativo_id) REFERENCES roles_operativos(id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  persona_id INTEGER,
  rol_app_id INTEGER NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  FOREIGN KEY (rol_app_id) REFERENCES roles_app(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_persona_unique
ON usuarios(persona_id)
WHERE persona_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VACIO',
  hora_inicio TEXT,
  hora_fin TEXT,
  actividad_ubicacion TEXT,
  modificado INTEGER NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'PLAN',
  origen_referencia_tipo TEXT,
  origen_referencia_id INTEGER,
  fecha_regularizacion TEXT,
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  UNIQUE (persona_id, fecha)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_persona_fecha_unique
ON turnos(persona_id, fecha);

CREATE TABLE IF NOT EXISTS marcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  fecha_hora TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tipo_marca TEXT NOT NULL,
  actividad_ubicacion TEXT,
  ubicacion_detectada TEXT,
  latitud REAL,
  longitud REAL,
  genera_incidencia INTEGER NOT NULL DEFAULT 0,
  estado_aprobacion TEXT NOT NULL DEFAULT 'PENDIENTE',
  fecha_aprobacion TEXT,
  aprobado_por_usuario_id INTEGER,
  observacion_aprobacion TEXT,
  fecha_modificacion TEXT,
  modificado_por_usuario_id INTEGER,
  observacion_modificacion TEXT,
  anulada INTEGER NOT NULL DEFAULT 0,
  fecha_anulacion TEXT,
  anulada_por_usuario_id INTEGER,
  observacion_anulacion TEXT,
  FOREIGN KEY (anulada_por_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (modificado_por_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (aprobado_por_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (persona_id) REFERENCES personas(id)
);

CREATE TABLE IF NOT EXISTS operaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  operacion_tarifa_id INTEGER,
  fecha_hora TEXT NOT NULL,
  tipo_operacion TEXT NOT NULL,
  franja TEXT NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  referencia TEXT,
  observacion TEXT,
  estado TEXT NOT NULL DEFAULT 'pending',
  motivo_rechazo TEXT,
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  FOREIGN KEY (operacion_tarifa_id) REFERENCES operacion_tarifas(id)
);

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
);

CREATE TABLE IF NOT EXISTS persona_operacion_tarifas (
  persona_id INTEGER NOT NULL,
  tarifa_id INTEGER NOT NULL,
  PRIMARY KEY (persona_id, tarifa_id),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
  FOREIGN KEY (tarifa_id) REFERENCES operacion_tarifas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facturacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden TEXT NOT NULL,
  fecha TEXT NOT NULL,
  monto REAL NOT NULL DEFAULT 0,
  referencia TEXT,
  lugar TEXT,
  observacion TEXT,
  fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ubicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  google_maps_url TEXT,
  latitud REAL,
  longitud REAL,
  tolerancia_metros INTEGER NOT NULL DEFAULT 500,
  genera_incidencia INTEGER NOT NULL DEFAULT 0,
  direccion TEXT
);

CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT UNIQUE,
  persona_id INTEGER,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  severidad TEXT NOT NULL DEFAULT 'INFO',
  detalle TEXT,
  origen TEXT NOT NULL DEFAULT 'SISTEMA',
  referencia_tipo TEXT,
  referencia_id INTEGER,
  minutos_desfasaje INTEGER,
  resuelta INTEGER NOT NULL DEFAULT 0,
  fecha_resolucion TEXT,
  aprobado_por_usuario_id INTEGER,
  observacion_aprobacion TEXT,
  fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aprobado_por_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (persona_id) REFERENCES personas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidencias_clave_unique
ON incidencias(clave);

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
  FOREIGN KEY (aprobado_por_usuario_id) REFERENCES usuarios(id),
  UNIQUE (persona_id, fecha)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jornales_persona_fecha_unique
ON jornales(persona_id, fecha);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relojes_faciales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TEXT,
  ultimo_uso TEXT
);

CREATE INDEX IF NOT EXISTS idx_relojes_faciales_token_hash
ON relojes_faciales(token_hash);
