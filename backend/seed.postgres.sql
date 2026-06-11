SET search_path TO rrhh;

INSERT INTO roles_app (nombre) VALUES
  ('admin'),
  ('rrhh'),
  ('usuario')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO roles_operativos (nombre, aparece_plan_semanal) VALUES
  ('Logistico', 1),
  ('Referente', 1),
  ('Operador', 1),
  ('Depo y Mant.', 1),
  ('Admin', 0)
ON CONFLICT (nombre) DO NOTHING;

WITH personas_seed(nombre, rol) AS (
  VALUES
    ('Lucas', 'Logistico'),
    ('Martin', 'Logistico'),
    ('Nacho', 'Logistico'),
    ('Moña', 'Logistico'),
    ('Cat', 'Logistico'),
    ('Iñaki', 'Logistico'),
    ('Mateo', 'Logistico'),
    ('Oliva', 'Logistico'),
    ('Gonda', 'Logistico'),
    ('Thiago', 'Logistico'),
    ('Ford', 'Logistico'),
    ('Brai', 'Logistico'),
    ('Alallon', 'Referente'),
    ('Emilio', 'Referente'),
    ('Alejandro', 'Referente'),
    ('Guille', 'Referente'),
    ('Jaunsolo', 'Referente'),
    ('Viera', 'Referente'),
    ('Grillo', 'Operador'),
    ('Cuba', 'Operador'),
    ('Angelina', 'Operador'),
    ('Corso', 'Operador'),
    ('Alex', 'Operador'),
    ('Chiappe', 'Operador'),
    ('Marce', 'Operador'),
    ('Said', 'Operador'),
    ('Anzed', 'Operador'),
    ('Vitto', 'Operador'),
    ('Dario', 'Depo y Mant.'),
    ('Andres', 'Depo y Mant.'),
    ('Richard', 'Depo y Mant.'),
    ('Furtado', 'Depo y Mant.'),
    ('Eze', 'Depo y Mant.')
)
INSERT INTO personas (
  nombre,
  rol_operativo_id,
  activo,
  horario_tipo,
  valor_hora,
  tipo_libreta,
  vencimiento_libreta,
  vencimiento_carne_salud
)
SELECT
  personas_seed.nombre,
  roles_operativos.id,
  1,
  'variable',
  0,
  'NO TIENE',
  NULL,
  NULL
FROM personas_seed
JOIN roles_operativos ON roles_operativos.nombre = personas_seed.rol
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO configuracion (clave, valor) VALUES
  ('tolerancia_alerta_verde_minutos', '15'),
  ('tolerancia_alerta_amarilla_minutos', '30')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO ubicaciones (
  nombre,
  google_maps_url,
  latitud,
  longitud,
  tolerancia_metros,
  genera_incidencia,
  direccion
) VALUES
  ('LATU', NULL, NULL, NULL, 500, 0, ''),
  ('DEPO', NULL, NULL, NULL, 500, 0, ''),
  ('ELIAS', NULL, NULL, NULL, 500, 0, ''),
  ('LOGISTICA', NULL, NULL, NULL, 500, 0, ''),
  ('FUERA DE RANGO', NULL, NULL, NULL, 500, 1, '')
ON CONFLICT (nombre) DO NOTHING;

