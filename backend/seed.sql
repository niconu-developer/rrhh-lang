PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO roles_app (nombre) VALUES
  ('admin'),
  ('rrhh'),
  ('usuario');

INSERT OR IGNORE INTO roles_operativos (nombre, aparece_plan_semanal) VALUES
  ('Logistico', 1),
  ('Referente', 1),
  ('Operador', 1),
  ('Depo y Mant.', 1),
  ('Admin', 0);

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
INSERT OR IGNORE INTO personas (
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
JOIN roles_operativos ON roles_operativos.nombre = personas_seed.rol;

WITH lang_personas_seed(nombre, email, rol, valor_hora, horas_acordadas) AS (
  VALUES
    ('Aco', 'agustincagnone@gmail.com', 'Depo y Mant.', 190.29, 190),
    ('Alallon', 'nico145a@gmail.com', 'Referente', 298.34, 190),
    ('Alejandro', 'figueroaalejandro.1994@gmail.com', 'Referente', 326.21, 190),
    ('Alex', 'miraballeseb@gmail.com', 'Operador', 0, 190),
    ('Andres', 'andresrrod24@gmail.com', 'Depo y Mant.', 315.79, 190),
    ('Angelina', 'angeog2002@gmail.com', 'Operador', 200.34, 190),
    ('Anzed', 'djanzed@gmail.com', 'Operador', 190.29, 190),
    ('Brai', 'administracion@lang.uy', 'Logistico', 190.29, 190),
    ('Cat', 'puresantiago15@gmail.com', 'Logistico', 221.91, 190),
    ('Chiappe', 'brunochiap4@gmail.com', 'Operador', 337.30, 190),
    ('Corso', 'pabloecorso@gmail.com', 'Operador', 200.27, 190),
    ('Cuba', 'animalvscode@gmail.com', 'Operador', 225.00, 190),
    ('Dario', 'dariomacarin@gmail.com', 'Depo y Mant.', 221.91, 190),
    ('Diego', 'finanzas@lang.uy', 'Depo y Mant.', 430.13, 129),
    ('Emilio', 'le.murialdo@gmail.com', 'Referente', 332.03, 190),
    ('Eze', 'eze.almada77@gmail.com', 'Depo y Mant.', 168.21, 190),
    ('Ford', 'facundoreyes231@gmail.com', 'Logistico', 190.29, 190),
    ('Furtado', 'avimaxeventoos@hotmail.com', 'Depo y Mant.', 221.36, 190),
    ('Gonda', 'agustingonda28@gmail.com', 'Logistico', 205.54, 190),
    ('Grillo', 'martine.grillo@gmail.com', 'Operador', 194.17, 190),
    ('Guille', 'guillermo@lang.uy', 'Referente', 612.83, 172),
    ('Iñaki', 'jaunsolo2000@gmail.com', 'Logistico', 221.36, 190),
    ('Jaunsolo', 'joaquinjaunsolo@gmail.com', 'Referente', 277.39, 190),
    ('Lucas', 'lucasgiordano30@gmail.com', 'Operador', 249.65, 190),
    ('Marce', 'mabisuy.dmx@gmail.com', 'Operador', 198.58, 190),
    ('Martin', NULL, 'Logistico', 233.89, 190),
    ('Mateo', 'mateo.techeira0031@gmail.com', 'Logistico', 244.66, 190),
    ('Moña', NULL, 'Logistico', 190.29, 190),
    ('Nacho', 'i.berasain17@gmail.com', 'Logistico', 290.70, 172),
    ('Oliva', 'nicoo2709@gmail.com', 'Logistico', 249.65, 190),
    ('Pablo', 'pablorubenheredia1@gmail.com', 'Depo y Mant.', 214.28, 190),
    ('Prieto', 'joacoprieto23@gmail.com', 'Operador', 191.20, 190),
    ('Richard', NULL, 'Depo y Mant.', 210.53, 190),
    ('Said', 'saidelomari999@gmail.com', 'Operador', 205.27, 190),
    ('Thiago', 'thiagokluivert@gmail.com', 'Logistico', 205.54, 190),
    ('Viera', 'brunoviera2709@gmail.com', 'Referente', 289.47, 190),
    ('Vitto', 'vitto@lang.uy', 'Operador', 177.90, 190)
)
INSERT INTO personas (
  nombre,
  email,
  rol_operativo_id,
  activo,
  horario_tipo,
  valor_hora,
  horas_acordadas,
  tipo_libreta,
  vencimiento_libreta,
  vencimiento_carne_salud
)
SELECT
  lang_personas_seed.nombre,
  lang_personas_seed.email,
  roles_operativos.id,
  1,
  'variable',
  lang_personas_seed.valor_hora,
  lang_personas_seed.horas_acordadas,
  'NO TIENE',
  NULL,
  NULL
FROM lang_personas_seed
JOIN roles_operativos ON roles_operativos.nombre = lang_personas_seed.rol
ON CONFLICT(nombre) DO UPDATE SET
  email = excluded.email,
  rol_operativo_id = excluded.rol_operativo_id,
  activo = 1,
  valor_hora = excluded.valor_hora,
  horas_acordadas = excluded.horas_acordadas;

INSERT INTO personas (
  nombre,
  email,
  rol_operativo_id,
  activo,
  horario_tipo,
  valor_hora,
  tipo_libreta,
  vencimiento_libreta,
  vencimiento_carne_salud
)
SELECT
  'niconu-admin',
  'niconu@lang.uy',
  roles_operativos.id,
  1,
  'variable',
  0,
  'NO TIENE',
  NULL,
  NULL
FROM roles_operativos
WHERE roles_operativos.nombre = 'Admin'
ON CONFLICT(nombre) DO UPDATE SET
  email = excluded.email,
  rol_operativo_id = excluded.rol_operativo_id,
  activo = 1;

INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
SELECT
  'admin',
  'LANG1234',
  'admin@empresa.local',
  NULL,
  roles_app.id,
  1
FROM roles_app
WHERE roles_app.nombre = 'admin'
ON CONFLICT(usuario) DO UPDATE SET
  password_hash = excluded.password_hash,
  email = excluded.email,
  persona_id = NULL,
  rol_app_id = excluded.rol_app_id,
  activo = 1;

INSERT INTO usuarios (usuario, password_hash, email, persona_id, rol_app_id, activo)
SELECT
  'niconu@lang.uy',
  'LANG1234',
  'niconu@lang.uy',
  personas.id,
  roles_app.id,
  1
FROM personas
CROSS JOIN roles_app
WHERE personas.nombre = 'niconu-admin'
  AND roles_app.nombre = 'admin'
ON CONFLICT(usuario) DO UPDATE SET
  email = excluded.email,
  persona_id = excluded.persona_id,
  rol_app_id = excluded.rol_app_id,
  activo = 1;

INSERT OR IGNORE INTO configuracion (clave, valor) VALUES
  ('tolerancia_alerta_verde_minutos', '15'),
  ('tolerancia_alerta_amarilla_minutos', '30');

INSERT OR IGNORE INTO ubicaciones (
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
  ('FUERA DE RANGO', NULL, NULL, NULL, 500, 1, '');

INSERT INTO proyectos (nombre, activo) VALUES
  ('LOGISTICA', 1),
  ('DEPOSITO', 1)
ON CONFLICT(nombre) DO UPDATE SET activo = 1;

INSERT OR IGNORE INTO configuracion (clave, valor) VALUES
  ('operation_bands', '["Hasta 4 horas", "4 a 8 horas", "8 a 12 horas"]'),
  ('role_permissions', '{"admin":{"modules":["incidencias","aprobaciones","operaciones","liquidacion","importacion","mis-marcas","plan","dashboard","reportes","personal","marcas","reloj","config"]},"rrhh":{"modules":["incidencias","aprobaciones","operaciones","liquidacion","importacion","mis-marcas","plan","dashboard","reportes","personal","marcas","reloj"]},"usuario":{"modules":["mis-marcas","marcas"]}}');

INSERT INTO operacion_tarifas (categoria, tipo, hasta_4hs, de_4_a_8hs, de_8_a_12hs, activo)
VALUES
  ('L0 / Aprendiz', 'Iluminador', 1000, 2000, 3000, 0),
  ('L1', 'Iluminador', 2000, 3000, 4000, 1),
  ('L2', 'Iluminador', 3000, 4000, 5000, 1),
  ('L3', 'Iluminador', 4000, 5000, 6000, 1),
  ('L1', 'Operador', 1500, 2500, 3500, 1),
  ('L2', 'Operador', 2500, 3500, 4500, 1),
  ('L3', 'Operador', 3000, 4000, 5000, 1),
  ('L4', 'Operador', 4000, 5000, 6000, 1)
ON CONFLICT(tipo, categoria) DO UPDATE SET
  hasta_4hs = excluded.hasta_4hs,
  de_4_a_8hs = excluded.de_4_a_8hs,
  de_8_a_12hs = excluded.de_8_a_12hs,
  activo = excluded.activo,
  fecha_actualizacion = CURRENT_TIMESTAMP;

INSERT INTO ubicaciones (
  nombre,
  google_maps_url,
  latitud,
  longitud,
  tolerancia_metros,
  genera_incidencia,
  direccion
) VALUES
  ('DAZZLER', 'https://www.google.com/maps/place/Dazzler+by+Wyndham+Montevideo/@-34.9178167,-56.1599222,766m/data=!3m2!1e3!4b1!4m9!3m8!1s0x959f8175bd8c79a9:0x4a88ddc6cccecc22!5m2!4m1!1i2!8m2!3d-34.9178211!4d-56.1573473!16s%2Fg%2F1hc27r_m_?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.9178167, -56.1599222, 300, 0, 'Luis Alcantara, Williman, Punta Carretas'),
  ('DEPO', 'https://www.google.com/maps/place/Av.+Gonzalo+Ram%C3%ADrez+1572,+11200+Montevideo,+Departamento+de+Montevideo/@-34.9125165,-56.1809499,250m/data=!3m1!1e3!4m6!3m5!1s0x959f81b8013637ab:0xb2fcb54e8c39c687!8m2!3d-34.9125465!4d-56.1809188!16s%2Fg%2F11l76hs6bb?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.9125165, -56.1809499, 300, 0, '1572,1574, Avenida Gonzalo Ramirez'),
  ('ELIAS', 'https://www.google.com/maps/place/Dr.+El%C3%ADas+Regules,+11500+Montevideo,+Departamento+de+Montevideo/@-34.87319,-56.0923552,766m/data=!3m2!1e3!4b1!4m6!3m5!1s0x959f871fd0491061:0x962db917277fe8bc!8m2!3d-34.8731944!4d-56.0897803!16s%2Fg%2F1wh4h0hg?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.87319, -56.0923552, 300, 0, '5816, Escultor Edmundo Prati'),
  ('ESPLENDOR', 'https://www.google.com/maps/place/Esplendor+by+Wyndham+Montevideo+Cervantes,+Soriano,+Montevideo+Departamento+de+Montevideo/@-34.9239729,-56.1612943,766m/data=!3m1!1e3!4m5!3m4!1s0x959f81cd071b31c1:0xc8269a34573134f7!8m2!3d-34.9083342!4d-56.1975172?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.9239729, -56.1612943, 200, 0, 'ML Corporate, Francisco Garcia Cortinas'),
  ('FUERA DE RANGO', NULL, NULL, NULL, 500, 1, ''),
  ('LACROSSE', 'https://www.google.com/maps/place/Chacra+Lacrosse/@-34.81935,-56.021121,767m/data=!3m2!1e3!4b1!4m6!3m5!1s0x959f8804f8fbc751:0xc1d87fa00691918d!8m2!3d-34.8193544!4d-56.0185461!16s%2Fg%2F11b67yhhhj?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.81935, -56.021121, 500, 0, '107, Irigaray'),
  ('LATU', 'https://www.google.com/maps/place/LATU+-+Laboratorio+Tecnol%C3%B3gico+del+Uruguay/@-34.87319,-56.0923552,766m/data=!3m1!1e3!4m6!3m5!1s0x959f80fcfb86d9ed:0x8fed80dbcd8c6f53!8m2!3d-34.8794305!4d-56.0767298!16s%2Fg%2F1tsbn92m?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.87319, -56.0923552, 300, 0, '5816, Escultor Edmundo Prati'),
  ('LOGISTICA', NULL, NULL, NULL, 500, 0, ''),
  ('PUNTA CARRETAS', 'https://www.google.com/maps/place/Punta+Carretas+Shopping,+Solano+Garc%C3%ADa,+Montevideo+Departamento+de+Montevideo/@-34.81935,-56.021121,767m/data=!3m1!1e3!4m5!3m4!1s0x959f819d6fa00fd3:0xb24389518c0c3751!8m2!3d-34.9239773!4d-56.1587194?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.81935, -56.021121, 200, 0, '107, Irigaray'),
  ('SOFITEL', 'https://www.google.com/maps/place/Sofitel+Montevideo+Casino+Carrasco+and+Spa/@-34.8905802,-56.0579492,766m/data=!3m2!1e3!4b1!4m9!3m8!1s0x959f866e4c6d1e93:0xad41600877c7d3b!5m2!4m1!1i2!8m2!3d-34.8905846!4d-56.0553743!16s%2Fm%2F0kvgtjq?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.8905802, -56.0579492, 200, 0, '1595,1599, Divina Comedia'),
  ('WTC', 'https://www.google.com/maps/place/WTC+Montevideo+Free+Zone/@-34.9028168,-56.1372922,766m/data=!3m3!1e3!4b1!5s0x959f813e79957a17:0x4b60ed3e7aa09d26!4m6!3m5!1s0x959f813e774eb719:0x8769ce852edae416!8m2!3d-34.9028212!4d-56.1347173!16s%2Fg%2F1pv0y5typ?entry=ttu&g_ep=EgoyMDI2MDYwMy4xIKXMDSoASAFQAw%3D%3D', -34.9028168, -56.1372922, 500, 0, '1290, Avenida Luis Alberto de Herrera')
ON CONFLICT(nombre) DO UPDATE SET
  google_maps_url = excluded.google_maps_url,
  latitud = excluded.latitud,
  longitud = excluded.longitud,
  tolerancia_metros = excluded.tolerancia_metros,
  genera_incidencia = excluded.genera_incidencia,
  direccion = excluded.direccion;

WITH asignaciones_operacion(persona, categoria, tipo) AS (
  VALUES
    ('Alex', 'L1', 'Operador'),
    ('Angelina', 'L1', 'Operador'),
    ('Anzed', 'L1', 'Operador'),
    ('Chiappe', 'L1', 'Operador'),
    ('Corso', 'L1', 'Operador'),
    ('Cuba', 'L1', 'Operador'),
    ('Grillo', 'L1', 'Operador'),
    ('Marce', 'L1', 'Operador'),
    ('Prieto', 'L1', 'Operador'),
    ('Said', 'L1', 'Operador'),
    ('Vitto', 'L1', 'Operador')
)
INSERT OR IGNORE INTO persona_operacion_tarifas (persona_id, tarifa_id)
SELECT personas.id, operacion_tarifas.id
FROM asignaciones_operacion
JOIN personas ON personas.nombre = asignaciones_operacion.persona
JOIN operacion_tarifas
  ON operacion_tarifas.categoria = asignaciones_operacion.categoria
 AND operacion_tarifas.tipo = asignaciones_operacion.tipo;
