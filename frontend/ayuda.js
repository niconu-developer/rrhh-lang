if (!requireModuleAccess("ayuda")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const helpDocs = [
  {
    id: "flujo-operativo",
    type: "Proceso",
    title: "Ordenar el día de RRHH",
    keywords: ["flujo", "plan semanal", "reloj", "mis marcas", "incidencia", "validacion", "dashboard", "reporte", "rrhh"],
    summary: "Orden recomendado para trabajar el ciclo diario y mensual.",
    steps: [
      "Planificá turnos en Plan semanal.",
      "Publicá el día cuando esté listo para que pueda verse desde el Reloj.",
      "Los operadores registran entrada/salida desde Reloj, Reloj facial o luego desde carga manual admin.",
      "Cada persona puede revisar su histórico en Mis marcas.",
      "RRHH trabaja el día desde Dashboard: KPIs, operaciones, marcas, previsiones e incidencias.",
      "Las incidencias se corrigen editando marcas, pasando a plan semanal, marcando ausente o aprobando con comentario.",
      "Después se validan jornales para dejar cerrado lo trabajado.",
      "Las operaciones aprobadas y los jornales validados alimentan costos y reportes.",
      "Reportes exporta CSV para análisis o manipulación externa.",
    ],
  },
  {
    id: "revisar-dashboard",
    type: "Proceso",
    title: "Revisar el dashboard diario",
    keywords: ["dashboard", "kpi", "dia", "mes", "operaciones y marcas", "rrhh", "alertas", "documentos", "incidencias"],
    summary: "Mesa diaria de trabajo para RRHH: KPIs, operaciones, marcas, previsiones e incidencias.",
    steps: [
      "Entrá a Dashboard.",
      "Arriba vas a ver KPIs del Día y del Mes.",
      "Usá las flechas y el botón Hoy para cambiar el día operativo.",
      "El título Operaciones y marcas muestra la fecha que está activa.",
      "Los botones Ver aparecen solo cuando el valor del KPI es mayor que cero.",
      "Si tocás Ver en Día, el detalle abre el rango de ese día.",
      "Si tocás Ver en Mes, el detalle abre el rango del mes seleccionado.",
      "Abajo se muestran todas las operaciones del día, sin filtros por estado o persona.",
      "Más abajo se muestran marcas y previsiones de todas las personas para ese día.",
    ],
  },
  {
    id: "editar-marca",
    type: "Proceso",
    title: "Editar o cargar una marca",
    keywords: ["editar marca", "corregir marca", "carga manual", "marca manual admin", "entrada", "salida", "sin marca", "tramos"],
    summary: "Corrección o carga manual de marcas desde Dashboard o Incidencias.",
    steps: [
      "Entrá a Dashboard y elegí el día con las flechas.",
      "En Marcas y previsiones buscá la persona.",
      "Si ya hay marcas, abrí el tramo y usá Editar dentro de la marca correspondiente.",
      "Si no hay marcas, usá CARGA MANUAL o Agregar marca.",
      "Para carga manual completa, cargá fecha entrada, hora entrada, fecha salida y hora salida.",
      "Indicá actividad / ubicación y una observación que justifique la carga manual.",
      "La ubicación queda vacía cuando la carga la hace un admin manualmente.",
      "Al guardar, el origen queda como MARCA MANUAL ADMIN.",
      "Después de guardar, el sistema refresca marcas, incidencias, jornales y dashboard.",
      "Si una marca manual corrige una incidencia, esa incidencia deja de representar la marca original sin revisar.",
    ],
  },
  {
    id: "incidencias-dashboard",
    type: "Proceso",
    title: "Ver y aprobar incidencias",
    keywords: ["incidencias", "aprobar incidencia", "ver detalle", "editar incidencia", "marca fuera ubicacion", "marca incompleta", "vacio", "ausente"],
    summary: "Tratamiento de inconsistencias detectadas sobre marcas y planificación.",
    steps: [
      "Desde Dashboard, tocá Ver en el KPI Incidencias del día o del mes.",
      "También podés entrar al módulo Incidencias para trabajar con filtros más amplios.",
      "Usá Ver detalle para revisar horarios previstos, marcas involucradas y motivo.",
      "Usá Editar si corresponde corregir una marca o cargar una marca manual.",
      "Si la persona marcó con turno VACIO o con un estado sin horario, podés revisar la marca, editarla si corresponde o usar Pasar a plan semanal para regularizar la planificación histórica.",
      "Pasar a plan semanal usa las marcas reales del día, sean de reloj web, reloj facial o carga manual admin.",
      "Si había turno previsto pero no hay marcas y la persona no trabajó, usá Marcar ausente.",
      "Si la persona sí trabajó pero no marcó, cargá la marca manual con observación.",
      "Recién después de resolver el origen, tocá Aprobar.",
      "Al aprobar podés agregar un comentario opcional.",
      "La aprobación guarda usuario, fecha y comentario.",
    ],
  },
  {
    id: "operaciones-dashboard",
    type: "Proceso",
    title: "Aprobar, rechazar o editar operaciones",
    keywords: ["operaciones", "aprobar operaciones", "rechazar operaciones", "editar operacion", "tipo operacion", "franja", "rechazada"],
    summary: "Gestión de operaciones cargadas por operadores.",
    steps: [
      "En Dashboard se ven todas las operaciones del día seleccionado, sin filtros por persona ni estado.",
      "Para una vista de validación masiva, entrá al módulo Operaciones.",
      "Revisá operador, tipo, franja, referencia, observación, valor y estado.",
      "Si corresponde, tocá Aprobar.",
      "Si no corresponde, tocá Rechazar e ingresá un motivo visible para el operador.",
      "Una operación rechazada se puede editar y volver a aprobar.",
      "La edición permite cambiar tipo de operación y franja; el valor se recalcula según la matriz de costos.",
      "Las operaciones aprobadas alimentan costos estimados y futura liquidación.",
    ],
  },
  {
    id: "validar-jornales",
    type: "Proceso",
    title: "Validar jornales",
    keywords: ["validar jornales", "validación de jornales", "jornal", "cierre operativo", "aprobar jornada", "preaprobada", "diferencia horas"],
    summary: "Cierre operativo por persona y día a partir de planificación y marcas.",
    steps: [
      "Entrá a Validación de jornales.",
      "Definí rango, persona, rol o estado según necesites.",
      "Revisá entrada, salida, horas previstas, horas trabajadas y diferencia.",
      "Las jornadas dentro de tolerancia pueden quedar aprobadas automáticamente.",
      "Estados sin horario como LIBRE, LICENCIA, SUSPENDIDO, LIC. MEDICA o AUSENTE no requieren validación manual si no tienen marcas.",
      "Seleccioná líneas individuales desde la primera columna o usá seleccionar todos.",
      "Tocá Aprobar selección para validar en lote.",
      "La validación manual guarda quién aprobó y cuándo.",
      "Las marcas editadas manualmente por RRHH/admin refrescan el jornal relacionado.",
    ],
  },
  {
    id: "publicar-dia",
    type: "Proceso",
    title: "Publicar un día para el reloj",
    keywords: ["publicar dia", "reloj", "plan semanal", "resumen del dia", "mañana", "publicado"],
    summary: "Habilitar que un día planificado sea visible desde el Reloj.",
    steps: [
      "Entrá a Plan semanal.",
      "Seleccioná el día en el encabezado de la grilla.",
      "Revisá en la barra lateral el resumen del día.",
      "Tocá Publicar día.",
      "Confirmá el emergente de seguridad.",
      "Desde ese momento el día queda habilitado para verse desde Reloj.",
      "Publicar no bloquea futuras ediciones del plan; solo habilita la lectura desde el reloj.",
      "Los días publicados se distinguen visualmente en el plan con un verde tenue.",
    ],
  },
  {
    id: "cargar-turnos",
    type: "Proceso",
    title: "Cargar o editar turnos",
    keywords: ["plan", "turnos", "semana", "copiar", "pegar", "vacío", "libre", "logistica", "deposito", "actividad"],
    summary: "Carga y edición de turnos por persona y día.",
    steps: [
      "Elegí la semana visible.",
      "Buscá una persona o rol operativo desde el filtro.",
      "Editá directamente cada celda con horario y actividad / ubicación.",
      "Podés moverte con flechas del teclado como si cada turno fuera una celda.",
      "Enter guarda la edición, Escape cancela y Tab guarda y baja a la siguiente persona del mismo día.",
      "Cuando se carga un turno rápido sin detalle, el sistema trae DEPOSITO como etiqueta por defecto.",
      "Si la etiqueta de actividad / ubicación se deja vacía, se completa como LOGISTICA.",
      "Cuando un turno se regulariza desde una incidencia y no hay actividad informada, queda como LOGISTICA.",
      "Los turnos regularizados quedan señalados en el plan semanal con un indicador y tooltip de regularización.",
      "Usá click derecho para estados como LIBRE, LICENCIA, SUSPENDIDO, LIC. MEDICA, AUSENTE o JORNADA NORMAL.",
      "Usá copiar/pegar con menú o atajos de teclado para replicar turnos entre días consecutivos.",
      "La selección múltiple está pensada para días contiguos de una misma persona.",
      "El botón Publicar día habilita que ese día se vea desde el Reloj.",
      "Las semanas nuevas se crean con lunes a viernes vacíos y fin de semana libre, salvo horarios fijos.",
    ],
  },
  {
    id: "registrar-marca",
    type: "Proceso",
    title: "Registrar entrada o salida",
    keywords: ["reloj", "marca", "entrada", "salida", "facial", "ubicación"],
    summary: "Registro de marcas de entrada y salida.",
    steps: [
      "El operador logueado usa Reloj para marcar entrada o salida.",
      "El Reloj muestra el resumen del día publicado para que el operador vea horarios y actividades.",
      "Solo se puede ver mañana si ese día fue publicado desde Plan semanal.",
      "El reloj facial permite marcar sin correo y contraseña.",
      "El sistema registra fecha, hora, origen de marca y ubicación detectada.",
      "Las marcas pueden quedar como RELOJ WEB, RELOJ FACIAL o MARCA MANUAL ADMIN.",
      "Si no se detecta ubicación admitida, el sistema informa UBICACIÓN NO DETECTADA - GENERA NOTIFICACIÓN.",
    ],
  },
  {
    id: "revisar-mis-marcas",
    type: "Proceso",
    title: "Revisar mis marcas",
    keywords: ["mis marcas", "mis operaciones", "histórico", "mes", "horas trabajadas", "horas planificadas", "ver como"],
    summary: "Vista mensual personal de marcas, tramos y operaciones.",
    steps: [
      "Entrá a Mis marcas.",
      "Navegá por mes con las flechas.",
      "La vista de marcas agrupa por día y muestra tramos Entrada - Salida.",
      "Si una entrada cruza a la madrugada siguiente, el tramo queda anidado en el día en que empezó.",
      "Arriba se resumen horas planificadas y horas trabajadas.",
      "Si la persona es operador, también puede ver sus operaciones y el total estimado.",
      "Admin puede usar Ver como para revisar cómo lo ve una persona.",
    ],
  },
  {
    id: "filtrar-incidencias",
    type: "Proceso",
    title: "Filtrar y revisar incidencias",
    keywords: ["incidencias", "aprobar", "editar", "detalle", "ubicación", "vacío", "tarde", "antes de lo previsto", "falta entrada", "falta salida"],
    summary: "Registro de inconsistencias detectadas por el sistema.",
    steps: [
      "Filtrá por fecha, persona, tipo, severidad o estado.",
      "Usá Ver detalle para revisar el contexto.",
      "El detalle muestra horarios previstos y marcas involucradas cuando existen.",
      "Usá Editar para corregir la marca asociada cuando corresponda.",
      "Usá Aprobar para dejar constancia de revisión, con comentario opcional.",
      "Las alertas amarillas o rojas indican marcas fuera de tolerancia: tarde o antes de lo previsto.",
      "Si una persona marcó con turno VACIO, primero cargá el turno en Plan semanal.",
      "Si una persona tenía turno previsto pero no tiene marcas, no se aprueba directo: se carga la marca manual o se marca el turno como AUSENTE.",
      "Las incidencias de falta de entrada o falta de salida se trabajan por tramo observado.",
    ],
  },
  {
    id: "validar-jornales-lote",
    type: "Proceso",
    title: "Validar jornales por lote",
    keywords: ["validación", "jornales", "aprobación", "preaprobada", "manual"],
    summary: "Cierre operativo de jornadas trabajadas.",
    steps: [
      "Filtrá por rango, persona o estado.",
      "Revisá entrada, salida, horas previstas, horas trabajadas y diferencia.",
      "Seleccioná líneas individuales o todas las visibles.",
      "Usá Aprobar selección para registrar aprobación manual.",
      "Las jornadas dentro de tolerancia pueden quedar preaprobadas automáticamente.",
      "Si una marca fue modificada manualmente por RRHH/admin, el jornal relacionado se refresca con esa información.",
      "Estados sin horario y sin marcas, como LIBRE o AUSENTE, se aprueban automáticamente porque coinciden con lo esperado.",
    ],
  },
  {
    id: "validar-operaciones-lote",
    type: "Proceso",
    title: "Validar operaciones por lote",
    keywords: ["validacion operaciones", "operaciones", "aprobar", "rechazar", "editar", "matriz costos"],
    summary: "Vista operativa para aprobar, rechazar y corregir operaciones.",
    steps: [
      "Entrá a Operaciones para trabajar con filtros y selección por lote.",
      "Podés aprobar operaciones pendientes o rechazadas.",
      "Podés rechazar solo operaciones pendientes, ingresando motivo.",
      "Podés editar tipo y franja de una operación cuando haga falta corregirla.",
      "El valor se calcula desde la matriz de costos por tipo de operación, categoría y franja.",
      "Las operaciones aprobadas se consideran para costos y liquidación.",
    ],
  },
  {
    id: "alta-edicion-personal",
    type: "Proceso",
    title: "Agregar o editar personal",
    keywords: ["personal", "operadores", "roles", "costos", "valor hora", "documentos"],
    summary: "Administración de personas, costos y documentación.",
    steps: [
      "Usá Listado de personal para altas, edición y deshabilitación.",
      "Definí ID privado, rol operativo, estado, correo de acceso y documentación.",
      "Configurá horarios fijos por día cuando corresponda.",
      "En Costo horas por persona editá valores hora de forma masiva.",
      "El campo horas acordadas define la base mensual esperada para cálculos como sueldo base.",
      "Si la persona es Operador, marcá Es operador y elegí su tipo de operador en la ficha.",
      "En Costo operaciones configurá valores por categoría y franja.",
    ],
  },
  {
    id: "ajustar-parametros",
    type: "Proceso",
    title: "Ajustar parámetros del sistema",
    keywords: ["configuración", "parámetros", "roles", "permisos", "ubicaciones", "tolerancia"],
    summary: "Parámetros generales del sistema.",
    steps: [
      "Configurá roles operativos y si aparecen en Plan semanal.",
      "Definí ubicaciones admitidas y si generan incidencia.",
      "Ajustá tolerancias de alertas y validación automática.",
      "Administrá roles y permisos de aplicación.",
      "Los usuarios desactivados se ocultan salvo que actives la vista de desactivados.",
    ],
  },
  {
    id: "exportar-reporte",
    type: "Proceso",
    title: "Exportar un reporte CSV",
    keywords: ["reportes", "csv", "nómina", "control", "exportar"],
    summary: "Exportación de datos para análisis externo.",
    steps: [
      "Elegí tipo de reporte.",
      "En reportes mensuales, navegá por mes con las flechas.",
      "Filtrá por persona, rol operativo o estado si aplica.",
      "Los filtros de persona y rol aceptan texto libre y varios valores separados por coma.",
      "Usá Ver datos para previsualizar.",
      "Exportá CSV para manipulación posterior.",
    ],
  },
  {
    id: "importar-marcas",
    type: "Proceso",
    title: "Importar marcas históricas",
    keywords: ["importación", "importar marcas", "marcas históricas", "carga por lote", "csv"],
    summary: "Carga masiva de marcas históricas para completar la base.",
    steps: [
      "Entrá a Importación de datos.",
      "Pegá o cargá las marcas históricas con el formato definido.",
      "Previsualizá antes de confirmar.",
      "Al importar, el sistema inserta marcas en la base y recalcula incidencias del rango afectado.",
      "Usá esta herramienta para cargas históricas o antiguas, no para corregir casos diarios puntuales.",
    ],
  },
  {
    id: "preparar-liquidacion",
    type: "Proceso",
    title: "Preparar información para liquidación",
    keywords: ["liquidación", "sueldos", "nómina", "conceptos", "haberes", "descuentos"],
    summary: "Preparación futura de liquidaciones y conceptos salariales.",
    steps: [
      "Primero se consolidarán marcas, jornales validados y operaciones aprobadas.",
      "Luego se cargarán conceptos adicionales.",
      "Más adelante se parametrizarán reglas, importes, haberes y descuentos.",
      "La salida esperada será una liquidación revisable y exportable.",
    ],
  },
];

const helpElements = {
  search: document.querySelector("#helpSearch"),
  nav: document.querySelector("#helpNav"),
  title: document.querySelector("#helpTitle"),
  count: document.querySelector("#helpCount"),
  articles: document.querySelector("#helpArticles"),
};

let activeHelpId = helpDocs[0].id;

function renderHelp() {
  const query = normalizeHelpText(helpElements.search.value);
  const filtered = rankedHelpDocs(query);
  if (!filtered.some((doc) => doc.id === activeHelpId)) activeHelpId = filtered[0]?.id || "";
  const active = filtered.find((doc) => doc.id === activeHelpId) || filtered[0];
  helpElements.count.textContent = `${filtered.length} secciones`;
  helpElements.title.textContent = active?.title || "Sin resultados";
  helpElements.nav.innerHTML = filtered
    .map((doc) => `<button class="config-nav help-nav-item ${doc.id === active?.id ? "active" : ""}" data-help-id="${doc.id}" type="button"><span>${doc.title}</span><small>${doc.type || "Guía"}</small></button>`)
    .join("");
  helpElements.articles.innerHTML = active ? renderHelpArticle(active) : `<article class="help-article"><strong>Sin resultados</strong><p>Probá buscar otra función.</p></article>`;
}

function rankedHelpDocs(query) {
  if (!query) return helpDocs;
  return helpDocs
    .map((doc) => ({ doc, score: helpScore(doc, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.doc);
}

function helpScore(doc, query) {
  const title = normalizeHelpText(doc.title);
  const keywords = normalizeHelpText(doc.keywords.join(" "));
  const body = normalizeHelpText([doc.summary, doc.steps.join(" ")].join(" "));
  const terms = query.split(/\s+/).filter(Boolean);
  let score = 0;
  if (title.includes(query)) score += 120;
  if (keywords.includes(query)) score += 90;
  if (body.includes(query)) score += 50;
  terms.forEach((term) => {
    if (title.includes(term)) score += 18;
    if (keywords.includes(term)) score += 12;
    if (body.includes(term)) score += 5;
  });
  return score;
}

function renderHelpArticle(doc) {
  return `<article class="help-article">
    <span class="help-type">${doc.type || "Guía"}</span>
    <p class="muted">${doc.summary}</p>
    <ol>
      ${doc.steps.map((step) => `<li>${step}</li>`).join("")}
    </ol>
  </article>`;
}

function normalizeHelpText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

helpElements.search.addEventListener("input", renderHelp);
helpElements.nav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-help-id]");
  if (!button) return;
  activeHelpId = button.dataset.helpId;
  renderHelp();
});

renderHelp();
