# Integracion del modulo RRHH LANG

Este documento describe como integrar el modulo RRHH como parte de una plataforma mayor, sin romper su flujo operativo principal.

## Objetivo funcional

RRHH no debe comportarse como un sistema aislado cuando se integre. Debe funcionar como un modulo operativo dentro de la plataforma principal, reutilizando autenticacion, usuarios, permisos base y datos nativos que aporte el sistema anfitrion.

Flujo central:

1. Plan semanal programa turnos, estados, horarios y actividad/ubicacion.
2. Relojes registran marcas y operadores envian operaciones.
3. RRHH valida horas y operaciones.
4. RRHH revisa reportes y prepara sueldos.
5. Dashboard y Analisis muestran metricas de control.

## Fuente de identidad y permisos

La plataforma principal debe ser la fuente de identidad.

- RRHH no debe duplicar login si esta embebido en otra app.
- La validacion recomendada es por cookie externa contra el endpoint del sistema principal.
- El matching de usuario se hace por email.
- El rol operativo de RRHH sigue siendo dato propio del modulo.
- El rol de sistema puede mapearse desde la plataforma principal a: admin, rrhh, usuario.

La integracion actual soporta validar la cookie `connect.sid` contra un endpoint externo tipo:

```text
GET /api/auth/me
```

Ese endpoint debe devolver al menos:

```json
{
  "email": "usuario@empresa.com",
  "name": "Nombre Usuario",
  "role": "admin"
}
```

RRHH no debe conocer ni compartir el secreto de firma de cookies del sistema principal.

## Modulos que quedan dentro de RRHH

Modulos operativos:

- Plan semanal
- Reloj
- Reloj facial
- Mis marcas
- Validacion de jornales
- Validacion de operaciones
- Dashboard
- Reportes
- Analisis
- Liquidacion de sueldos
- Personal
- Configuracion
- Ayuda

Modulos retirados porque el sistema anfitrion los aportara nativamente:

- Facturacion
- Importacion de datos
- Incidencias como pantalla independiente

## Plan semanal

Es el modulo mas importante del flujo.

Responsabilidades:

- Crear y editar turnos por persona y dia.
- Manejar estados sin horario: VACIO, LIBRE, LICENCIA, SUSPENDIDO, LIC. MEDICA, AUSENTE.
- Manejar jornadas normales con hora inicio, hora fin y actividad/ubicacion.
- Permitir turnos nocturnos: si la hora fin es menor que la hora inicio, se interpreta que termina al dia siguiente.
- Publicar dias para que sean visibles desde el reloj.
- Exportar resumen semanal o diario.

Comportamientos clave que debe conservar cualquier reimplementacion:

- Edicion directa en celda.
- Enter guarda.
- Escape cancela.
- Tab guarda y baja a la siguiente persona del mismo dia.
- Flechas navegan entre celdas.
- Delete/Supr vacia el turno.
- Click derecho abre estados y acciones.
- Mantener presionado en mobile debe reemplazar el click derecho.
- Copiar/pegar con menu contextual.
- Copiar/pegar con Ctrl/Cmd + C/V.
- Seleccion multiple horizontal con Shift.
- Arrastre para seleccionar turnos contiguos de la misma persona.
- Undo/redo con Ctrl/Cmd + Z y Ctrl/Cmd + Shift + Z.

El plan semanal es la fuente de verdad para lo previsto. Las marcas nunca deben modificarlo automaticamente salvo por accion explicita de RRHH, por ejemplo "pasar a plan semanal".

## Marcas y relojes

Tipos de marca:

- RELOJ WEB
- RELOJ FACIAL
- MARCA MANUAL ADMIN

Reglas:

- El operador no elige fecha ni hora al marcar.
- La fecha/hora sale del servidor o del momento sincronizado.
- La ubicacion se toma por geolocalizacion del dispositivo.
- Si no hay ubicacion o esta fuera de rango, genera observacion.
- Si se carga una marca manual, debe requerir observacion del admin/RRHH.
- Una marca manual no debe aprobar automaticamente el plan: si corresponde, RRHH debe pasarla al plan semanal.

El reloj puede mostrar informacion publica del plan publicado del dia. Las marcas personales siguen siendo privadas.

## Operaciones

Las operaciones son contraprestaciones adicionales.

Flujo:

1. Operador carga operacion desde Reloj o Mis marcas.
2. Debe seleccionar fecha, franja, proyecto/referencia y observaciones si corresponde.
3. La categoria/tarifa disponible depende de las habilitaciones del operador en Personal.
4. RRHH/Admin valida operaciones.

Estados:

- pending
- approved
- rejected

Una operacion aprobada puede rechazarse posteriormente, dejando motivo de rechazo.

Las operaciones aprobadas impactan en Dashboard, Analisis y Liquidacion.

## Observaciones de jornal

El modulo ya no expone `/api/incidencias` como API operativa.

La interfaz debe trabajar con:

```text
/api/observaciones-jornal
```

Conceptualmente, una observacion representa algo que RRHH debe revisar sobre un jornal o una marca:

- Marca fuera de horario.
- Marca fuera de ubicacion.
- Marca faltante.
- Marca en dia sin horario previsto.
- Marca estando libre/licencia/suspendido.

Regla clave:

- Si una marca genera mas de un problema para la misma persona y tramo, la UI debe mostrarlo como una sola observacion agrupada cuando sea posible.
- Validar con observacion es un estado correcto: la marca real queda aceptada, pero queda documentado el desvio.
- Editar manualmente una marca por RRHH puede resolver la observacion porque RRHH esta sobreescribiendo el jornal.

## Validacion de jornales

Debe permitir trabajar por lote y por persona.

Acciones esperadas:

- Ver detalles.
- Carga manual.
- Editar marca.
- Pasar a plan semanal si habia marca pero no habia turno previsto.
- Marcar AUSENTE cuando habia turno pero no marcas.
- Aprobar seleccion.

Estados visuales:

- Validado automatico: dentro de tolerancia o estado esperado sin horario.
- Validado manual: aprobado por RRHH/Admin.
- Pendiente: requiere revision.
- Validado con observacion: aprobado, pero con desvio documentado.

Debe quedar registrado:

- Quien valido manualmente.
- Cuando valido.
- Comentario opcional.

## Dashboard

Debe ser vista diaria de trabajo para RRHH.

Objetivo:

- Ver operaciones del dia.
- Ver marcas y previsiones del dia.
- Ver observaciones y alertas relevantes.
- Validar o corregir casos sin entrar a varios modulos.

Dashboard no reemplaza Validacion de jornales. Es un acceso rapido diario.

## Reportes, sueldos y analisis

Reportes:

- Exportan CSV.
- Deben usar datos ya validados o filtrables por estado.

Liquidacion:

- Calcula por persona.
- Usa jornales validados y operaciones aprobadas.
- Permite deducciones.

Analisis:

- Tablero mensual.
- Muestra horas, costos, franjas de horas, familias de sueldo y operaciones.
- La facturacion no pertenece mas al modulo RRHH; debe venir del sistema anfitrion si se desea cruzar datos.

## Datos propios del modulo

RRHH conserva:

- Personas y roles operativos.
- Turnos.
- Marcas.
- Jornales.
- Observaciones de jornal.
- Operaciones.
- Tarifas de operaciones.
- Ubicaciones de marcacion.
- Rostros/personas biometricas si se usa reloj facial.

El sistema anfitrion deberia aportar:

- Autenticacion.
- Sesion/token.
- Facturacion.
- Importaciones historicas si aplica.
- Navegacion general.

## APIs principales esperadas

Plan:

```text
GET  /api/turnos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
POST /api/turnos
POST /api/turnos/lote
```

Marcas:

```text
GET  /api/marcas?persona=ID&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
POST /api/marcas
POST /api/marcas/:id
POST /api/marcas/:id/delete
```

Observaciones:

```text
GET  /api/observaciones-jornal?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&estado=pendientes
POST /api/observaciones-jornal/generar
POST /api/observaciones-jornal/resolver
POST /api/observaciones-jornal/pasar-a-plan
POST /api/observaciones-jornal/marcar-ausente
```

Jornales:

```text
GET  /api/jornales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
GET  /api/aprobaciones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
POST /api/aprobaciones
```

Operaciones:

```text
GET  /api/operaciones
POST /api/operaciones
POST /api/operaciones/:id
```

Personal:

```text
GET  /api/personas
POST /api/personas
POST /api/personas/:id
```

## Recomendacion para el agente integrador

No reescribir primero todo el frontend.

Orden recomendado:

1. Integrar autenticacion externa y ocultar login local si corresponde.
2. Montar Plan semanal completo y preservar sus comportamientos de teclado/copia/seleccion.
3. Integrar Reloj y Mis marcas.
4. Integrar Validacion de jornales con observaciones.
5. Integrar Validacion de operaciones.
6. Integrar Dashboard diario.
7. Integrar Reportes, Liquidacion y Analisis.
8. Reemplazar navegacion propia de RRHH por navegacion del sistema anfitrion.

El mayor riesgo funcional esta en perder los comportamientos del Plan semanal. Ese modulo debe tratarse como pieza critica.
