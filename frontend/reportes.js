if (!requireModuleAccess("reportes")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const REPORT_STATUSES = ["LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE", "VACIO"];
const REPORT_FILTERS_KEY = "plannerReportFilters";
const reportUser = currentUser();
const REPORT_API_BASE = apiBase();
const reportCanSeeAllPersonnel = ["admin", "rrhh"].includes(reportUser?.roleId) || hasDashboardPermission("dashboardAllPersonnel");
let allReportPersonnel = [];
let reportPersonnel = [];
let reportMarks = [];
let reportOperations = [];
let reportTurns = [];
let reportIncidents = [];
let reportJornales = [];
let reportTurnMap = new Map();
let reportJornalMap = new Map();
let selectedReportMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const reportTypes = [
  { id: "nomina", label: "Nómina por persona" },
  { id: "marcas", label: "Marcas de reloj" },
  { id: "operaciones", label: "Operaciones" },
  { id: "incidencias", label: "Observaciones" },
  { id: "control", label: "Planificado vs real" },
  { id: "documentacion", label: "Documentación" },
];
const REPORT_COLUMNS = {
  nomina: ["Persona", "Rol", "Fecha", "Prevision", "Entrada", "Salida", "Horas previstas", "Horas trabajadas", "Estado validación", "Observación", "Operaciones aprobadas", "Costo operaciones", "Costo horas trabajadas"],
  marcas: ["Persona", "Fecha", "Tipo marca", "Hora", "Registro", "Estado validación", "Validado por", "Fecha validación", "Actividad / ubicación", "Ubicación detectada", "Genera observación", "Motivo observación"],
  operaciones: ["Operador", "Fecha", "Tipo operación", "Franja", "Valor", "Proyecto", "Observacion", "Estado", "Motivo rechazo"],
  incidencias: ["Persona", "Fecha", "Tipo", "Severidad", "Detalle", "Minutos desfasaje", "Estado", "Origen"],
  control: ["Persona", "Fecha", "Horario previsto", "Actividad / ubicación", "Entrada real", "Salida real", "Horas trabajadas", "Estado validación", "Tipo entrada", "Tipo salida", "Observación"],
  documentacion: ["Persona", "Rol", "Libreta conducir", "Vencimiento libreta", "Estado libreta", "Vencimiento carné salud", "Estado carné salud"],
};

const report = {
  type: document.querySelector("#reportType"),
  from: document.querySelector("#reportFrom"),
  to: document.querySelector("#reportTo"),
  person: document.querySelector("#reportPerson"),
  role: document.querySelector("#reportRole"),
  status: document.querySelector("#reportStatus"),
  rowCount: document.querySelector("#reportRowCount"),
  title: document.querySelector("#reportPreviewTitle"),
  head: document.querySelector("#reportPreviewHead"),
  body: document.querySelector("#reportPreviewBody"),
  previousMonth: document.querySelector("#previousReportMonth"),
  currentMonth: document.querySelector("#currentReportMonth"),
  nextMonth: document.querySelector("#nextReportMonth"),
  monthLabel: document.querySelector("#reportMonthLabel"),
  preview: document.querySelector("#previewReport"),
  export: document.querySelector("#exportReport"),
  toast: document.querySelector("#toast"),
};

async function initReports() {
  const savedFilters = loadReportFilters();
  report.type.innerHTML = reportTypes.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
  report.status.innerHTML = `<option value="todos">Todos</option><option value="incidencias">Solo observaciones</option><option value="pending">Operaciones pendientes</option><option value="approved">Operaciones aprobadas</option><option value="rejected">Operaciones rechazadas</option>`;
  selectedReportMonth = monthStartFromSavedFilters(savedFilters);
  syncReportMonthRange();
  report.person.value = savedFilters.person || "";
  report.role.value = savedFilters.role || "";
  report.type.value = reportTypes.some((item) => item.id === savedFilters.type) ? savedFilters.type : "nomina";
  report.status.value = [...report.status.options].some((option) => option.value === savedFilters.status) ? savedFilters.status : "todos";
  await refreshReportData();
  renderReportPreview();
}

function monthStartFromSavedFilters(savedFilters) {
  const savedDate = parseInputDate(savedFilters.from);
  const source = savedDate || new Date();
  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function syncReportMonthRange() {
  const monthStart = new Date(selectedReportMonth.getFullYear(), selectedReportMonth.getMonth(), 1);
  const monthEnd = new Date(selectedReportMonth.getFullYear(), selectedReportMonth.getMonth() + 1, 0);
  selectedReportMonth = monthStart;
  report.from.value = inputDateValue(monthStart);
  report.to.value = inputDateValue(monthEnd);
  report.monthLabel.textContent = capitalize(monthStart.toLocaleDateString("es-UY", { month: "long", year: "numeric" }));
}

async function moveReportMonth(offset) {
  selectedReportMonth = new Date(selectedReportMonth.getFullYear(), selectedReportMonth.getMonth() + offset, 1);
  syncReportMonthRange();
  saveReportFilters();
  await refreshReportRangeAndPreview();
}

async function reportApiGet(path) {
  const response = await fetch(`${REPORT_API_BASE}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function reportApiPost(path, payload) {
  const response = await fetch(`${REPORT_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`No se pudo guardar ${path}`);
  return response.json();
}

async function refreshReportData() {
  const { from, to } = selectedRange();
  const query = `desde=${inputDateValue(from)}&hasta=${inputDateValue(to)}`;
  await reportApiPost("/observaciones-jornal/generar", { desde: inputDateValue(from), hasta: inputDateValue(to) });
  const [personas, turnos, jornales, marcas, operaciones, incidencias] = await Promise.all([
    reportApiGet("/personas"),
    reportApiGet(`/turnos?${query}`),
    reportApiGet(`/jornales?${query}`),
    reportApiGet(`/marcas?${query}`),
    reportApiGet(`/operaciones?${query}`),
    reportApiGet(`/observaciones-jornal?${query}`),
  ]);
  allReportPersonnel = normalizeReportPersonnel(personas);
  const ownReportPersonnel = allReportPersonnel.filter((person) => person.name === reportUser?.personName);
  reportPersonnel = reportCanSeeAllPersonnel || !ownReportPersonnel.length ? allReportPersonnel : ownReportPersonnel;
  reportMarks = marcas.map(normalizeReportMark);
  reportOperations = operaciones.map(normalizeReportOperation);
  reportIncidents = incidencias;
  reportTurns = turnos;
  reportJornales = jornales.map(normalizeReportJornal);
  reportTurnMap = new Map(reportTurns.map((turno) => [`${turno.persona_id}|${turno.fecha}`, turno]));
  reportJornalMap = new Map(reportJornales.map((jornal) => [`${jornal.personId}|${jornal.dateValue}`, jornal]));
}

function normalizeReportPersonnel(rows) {
  return rows
    .filter((row) => Number(row.activo) !== 0)
    .map((row) => ({
      id: row.id,
      name: row.nombre,
      role: row.rol_operativo || "Operador",
      operatorType: row.rol_operativo || "Operador",
      hourlyRate: Number(row.valor_hora || 0),
      driverLicenseType: row.tipo_libreta || "NO TIENE",
      driverLicenseExpiry: row.vencimiento_libreta || "",
      healthCardExpiry: row.vencimiento_carne_salud || "",
      active: Number(row.activo) !== 0,
      scheduleMode: row.horario_tipo || "variable",
    }));
}

function normalizeReportMark(row) {
  const date = parseDbDateTime(row.fecha_hora);
  return {
    id: String(row.id),
    operator: row.persona,
    type: row.tipo,
    day: formatDate(date),
    time: formatTime(date),
    activity: row.actividad_ubicacion || "",
    detectedLocation: row.ubicacion_detectada || "",
    locationMatched: Number(row.genera_incidencia || 0) === 0,
    locationGeneratesIncident: Number(row.genera_incidencia || 0) !== 0,
    locationIncidentReason: Number(row.genera_incidencia || 0) !== 0 ? "Marca fuera de ubicación" : "",
    tipoMarca: row.tipo_marca || "Por usuario",
    method: row.tipo_marca === "Por reloj facial" ? "facial" : "web",
    approvalStatus: row.estado_aprobacion || "PENDIENTE",
    approvedBy: row.aprobado_por_usuario || "",
    approvedAt: row.fecha_aprobacion || "",
  };
}

function normalizeReportOperation(row) {
  const date = parseDbDateTime(row.fecha_hora);
  return {
    id: String(row.id),
    operator: row.persona,
    type: row.tipo_operacion,
    band: row.franja,
    value: Number(row.valor || 0),
    amount: Number(row.valor || 0),
    reference: row.referencia || "",
    note: row.observacion || "",
    date: formatDate(date),
    time: formatTime(date),
    status: row.estado || "pending",
    rejectionReason: row.motivo_rechazo || "",
  };
}

function normalizeReportJornal(row) {
  return {
    id: String(row.id),
    personId: row.persona_id,
    operator: row.persona,
    role: row.rol_operativo || "",
    dateValue: row.fecha,
    state: String(row.estado_turno || "VACIO").toUpperCase(),
    plannedStart: row.hora_inicio_plan || "",
    plannedEnd: row.hora_fin_plan || "",
    activity: row.actividad_ubicacion || "",
    entryTime: row.entrada_hora || "",
    exitTime: row.salida_hora || "",
    approvalStatus: row.estado_aprobacion || "PENDIENTE",
    approvalMode: row.modo_aprobacion || "",
    approvedBy: row.aprobado_por || "",
    approvedAt: row.fecha_aprobacion || "",
    plannedHours: Number(row.horas_previstas || 0),
    workedHours: Number(row.horas_trabajadas || 0),
  };
}

function selectedRange() {
  const from = parseInputDate(report.from.value) || new Date();
  const to = parseInputDate(report.to.value) || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function filteredPersonnel() {
  const personQuery = report.person?.value;
  const roleQuery = report.role?.value;
  return reportPersonnel.filter((person) => {
    const matchesPerson = matchesReportTextFilter(person.name, personQuery);
    const matchesRole = matchesReportTextFilter(person.operatorType || person.role, roleQuery);
    return matchesPerson && matchesRole;
  });
}

function matchesReportTextFilter(haystack, query) {
  const normalized = normalizeFilterQuery(query);
  return !normalized || matchesMultiSearchQuery(haystack, normalized, normalizeSearchText);
}

function reportFilterSummary() {
  return {
    fuentePersonal: reportPersonnel.length,
    persona: normalizeFilterQuery(report.person?.value) || "todos",
    rol: normalizeFilterQuery(report.role?.value) || "todos",
    estado: reportStatusValue(),
  };
}

function buildReport() {
  const builders = {
    nomina: buildPayrollReport,
    marcas: buildMarksReport,
    operaciones: buildOperationsReport,
    incidencias: buildIncidentsReport,
    control: buildControlReport,
    documentacion: buildDocumentsReport,
  };
  return builders[reportTypeValue()]();
}

function buildPayrollReport() {
  const { from, to } = selectedRange();
  const marks = loadMarks();
  const operations = loadOperations();
  const people = filteredPersonnel();
  const rows = people.flatMap((person) => daysInRange(from, to).map((date) => {
    const jornal = jornalForDate(person, date);
    const data = personDayData(person, date, marks);
    const shift = jornal ? shiftFromJornal(jornal) : data.shift;
    const approvedOps = operations.filter((operation) => operation.operator === person.name && operation.status === "approved" && dateInRange(parseLabeledDate(operation.date), date, date));
    const operationCost = approvedOps.reduce((sum, operation) => sum + Number(operation.value ?? operation.amount ?? 0), 0);
    const plannedHours = jornal ? jornal.plannedHours : shift.hours;
    const workedHours = jornal ? jornal.workedHours : workedHoursForReportMarks(data.dayMarks);
    return {
      Persona: person.name,
      Rol: person.operatorType || person.role,
      Fecha: formatDate(date),
      Prevision: shiftText(shift),
      Entrada: jornal?.entryTime || markTime(data.dayMarks, "Entrada"),
      Salida: jornal?.exitTime || markTime(data.dayMarks, "Salida"),
      "Horas previstas": plannedHours,
      "Horas trabajadas": workedHours,
      "Estado validación": jornal?.approvalStatus || "PENDIENTE",
      Observación: data.incident.text,
      "Operaciones aprobadas": approvedOps.length,
      "Costo operaciones": operationCost,
      "Costo horas trabajadas": Number(person.hourlyRate || 0) * workedHours,
    };
  }));
  return filterIncidenceRows({ title: "Nómina por persona", rows });
}

function buildMarksReport() {
  const { from, to } = selectedRange();
  const names = new Set(filteredPersonnel().map((person) => person.name));
  const rows = loadMarks()
    .filter((mark) => names.has(mark.operator) && dateInRange(parseLabeledDate(mark.day), from, to))
    .map((mark) => ({
      Persona: mark.operator,
      Fecha: mark.day,
      "Tipo marca": mark.type,
      Hora: mark.time,
      Registro: mark.tipoMarca || (mark.method === "facial" ? "Por reloj facial" : "Por usuario"),
      "Estado validación": mark.approvalStatus || "PENDIENTE",
      "Validado por": mark.approvedBy || "",
      "Fecha validación": mark.approvedAt || "",
      "Actividad / ubicación": mark.activity,
      "Ubicación detectada": mark.detectedLocation || "",
      "Genera observación": mark.locationMatched === false || mark.locationGeneratesIncident === true ? "SI" : "NO",
      "Motivo observación": mark.locationIncidentReason || "",
    }));
  return { title: "Marcas de reloj", rows };
}

function buildOperationsReport() {
  const { from, to } = selectedRange();
  const names = new Set(filteredPersonnel().map((person) => person.name));
  const rows = loadOperations()
    .filter((operation) => names.has(operation.operator) && dateInRange(parseLabeledDate(operation.date), from, to))
    .filter((operation) => reportStatusValue() === "todos" || reportStatusValue() === "incidencias" || operation.status === reportStatusValue())
    .map((operation) => ({
      Operador: operation.operator,
      Fecha: operation.date,
      "Tipo operación": operation.type,
      Franja: operation.band || "",
      Valor: Number(operation.value ?? operation.amount ?? 0),
      Proyecto: operation.reference || "",
      Observacion: operation.note || "",
      Estado: operationStatusLabel(operation.status),
      "Motivo rechazo": operation.rejectionReason || "",
    }));
  return { title: "Operaciones", rows };
}

function buildIncidentsReport() {
  const { from, to } = selectedRange();
  const names = new Set(filteredPersonnel().map((person) => person.name));
  const rows = reportIncidents
    .filter((incident) => names.has(incident.persona) && dateInRange(parseInputDate(incident.fecha), from, to))
    .filter((incident) => {
      const status = reportStatusValue();
      if (status === "todos" || status === "incidencias") return true;
      if (status === "approved" || status === "pending" || status === "rejected") return true;
      return true;
    })
    .map((incident) => ({
      Persona: incident.persona || "",
      Fecha: incident.fecha || "",
      Tipo: incidentTypeLabel(incident.tipo),
      Severidad: incident.severidad || "",
      Detalle: incident.detalle || "",
      "Minutos desfasaje": incident.minutos_desfasaje ?? "",
      Estado: Number(incident.resuelta || 0) ? "Resuelta" : "Pendiente",
      Origen: incident.origen || "",
    }));
  return { title: "Observaciones", rows };
}

function buildControlReport() {
  const { from, to } = selectedRange();
  const marks = loadMarks();
  const rows = filteredPersonnel().flatMap((person) => daysInRange(from, to).map((date) => {
    const jornal = jornalForDate(person, date);
    const data = personDayData(person, date, marks);
    const shift = jornal ? shiftFromJornal(jornal) : data.shift;
    return {
      Persona: person.name,
      Fecha: formatDate(date),
      "Horario previsto": shift.noSchedule ? shift.label : `${shift.start} - ${shift.end}`,
      "Actividad / ubicación": shift.activity,
      "Entrada real": jornal?.entryTime || markTime(data.dayMarks, "Entrada"),
      "Salida real": jornal?.exitTime || markTime(data.dayMarks, "Salida"),
      "Horas trabajadas": jornal ? jornal.workedHours : workedHoursForReportMarks(data.dayMarks),
      "Estado validación": jornal?.approvalStatus || "PENDIENTE",
      "Tipo entrada": markType(data.dayMarks, "Entrada"),
      "Tipo salida": markType(data.dayMarks, "Salida"),
      Observación: data.incident.text,
    };
  }));
  return filterIncidenceRows({ title: "Planificado vs real", rows });
}

function buildDocumentsReport() {
  const rows = filteredPersonnel().map((person) => ({
    Persona: person.name,
    Rol: person.operatorType || person.role,
    "Libreta conducir": person.driverLicenseType || "NO TIENE",
    "Vencimiento libreta": person.driverLicenseExpiry || "",
    "Estado libreta": documentStatus(person.driverLicenseExpiry, person.driverLicenseType === "NO TIENE"),
    "Vencimiento carné salud": person.healthCardExpiry || "",
    "Estado carné salud": documentStatus(person.healthCardExpiry, false),
  }));
  return filterIncidenceRows({
    title: "Documentación",
    rows,
    predicate: (row) => row["Estado libreta"] !== "OK" || row["Estado carné salud"] !== "OK",
  });
}

function filterIncidenceRows(reportData) {
  if (reportStatusValue() !== "incidencias") return reportData;
  return {
    ...reportData,
    rows: reportData.rows.filter(reportData.predicate || ((row) => row.Observación && row.Observación !== "Sin observación")),
  };
}

function renderReportPreview() {
  const data = buildReport();
  const columns = Object.keys(data.rows[0] || {}).length ? Object.keys(data.rows[0]) : REPORT_COLUMNS[reportTypeValue()] || [];
  const filters = reportFilterSummary();
  report.title.textContent = data.title;
  report.rowCount.textContent = `${data.rows.length} filas`;
  report.head.innerHTML = columns.length ? `<tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr>` : "";
  report.body.innerHTML = data.rows.length
    ? data.rows.slice(0, 100).map((row) => `<tr>${columns.map((column) => `<td>${row[column] ?? ""}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${Math.max(columns.length, 1)}">Sin datos para los filtros seleccionados. Fuente: ${filters.fuentePersonal} personas · Persona: ${filters.persona} · Rol: ${filters.rol} · Estado: ${filters.estado}</td></tr>`;
}

function exportCsv() {
  const data = buildReport();
  if (!data.rows.length) {
    showReportToast("No hay filas para exportar");
    return;
  }
  const csv = rowsToCsv(data.rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(data.title)}-${report.from.value}-${report.to.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showReportToast("CSV generado");
}

function loadReportFilters() {
  try {
    return JSON.parse(localStorage.getItem(REPORT_FILTERS_KEY) || "{}") || {};
  } catch (error) {
    return {};
  }
}

function saveReportFilters() {
  localStorage.setItem(REPORT_FILTERS_KEY, JSON.stringify({
    type: report.type.value,
    from: report.from.value,
    to: report.to.value,
    person: report.person.value,
    role: report.role.value,
    status: report.status.value,
  }));
}

function renderReportPreviewKeepingDates() {
  const from = report.from.value;
  const to = report.to.value;
  renderReportPreview();
  report.from.value = from;
  report.to.value = to;
  saveReportFilters();
}

function reportTypeValue() {
  return report.type.value || "nomina";
}

function reportStatusValue() {
  return report.status.value || "todos";
}

function rowsToCsv(rows) {
  const columns = Object.keys(rows[0] || {});
  const lines = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function personDayData(person, date, marks) {
  const shift = parseShift(plannedShiftForDate(person, date));
  const dayMarks = marks.filter((mark) => mark.operator === person.name && sameDay(parseLabeledDate(mark.day), date));
  return { shift, dayMarks, incident: incidentForDay(shift, dayMarks) };
}

function parseShift(raw) {
  const normalized = String(raw || "").trim().toUpperCase();
  if (!raw || normalized === "SIN PREVISIÓN") return { noSchedule: true, label: "Sin previsión", activity: "Sin previsión", hours: 0 };
  if (REPORT_STATUSES.includes(normalized)) return { noSchedule: true, label: normalized, activity: normalized, hours: 0 };
  const match = String(raw).match(/^(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s+(.+)$/);
  if (!match) return { noSchedule: false, start: "", end: "", activity: raw || "", hours: 0 };
  return { noSchedule: false, start: normalizeTime(match[1]), end: normalizeTime(match[2]), activity: match[3], hours: shiftHours(match[1], match[2]) };
}

function plannedShiftForDate(person, date) {
  const turno = reportTurnMap.get(`${person.id}|${inputDateValue(date)}`);
  if (!turno) return "Sin previsión";
  const estado = String(turno.estado || "VACIO").toUpperCase();
  if (REPORT_STATUSES.includes(estado)) return estado;
  const start = turno.hora_inicio || "";
  const end = turno.hora_fin || "";
  const activity = turno.actividad_ubicacion || "LOGISTICA";
  return start && end ? `${start} - ${end} ${activity}` : activity;
}

function incidentForDay(shift, dayMarks) {
  const label = shift.label?.toUpperCase?.() || "";
  if ((label === "SIN PREVISIÓN" || label === "VACIO") && !dayMarks.length) return { text: "Sin observación" };
  if (shift.noSchedule && dayMarks.length) return { text: "Marca en estado sin horario" };
  if (!shift.noSchedule && (!hasMark(dayMarks, "Entrada") || !hasMark(dayMarks, "Salida"))) return { text: "Turno sin marca completa" };
  if (dayMarks.some((mark) => mark.locationMatched === false || mark.locationGeneratesIncident === true)) return { text: "Observación de ubicación" };
  return { text: "Sin observación" };
}

function documentStatus(dateValue, notRequired) {
  if (notRequired) return "NO APLICA";
  const date = parseInputDate(dateValue);
  if (!date) return "SIN FECHA";
  const today = startOfDay(new Date());
  if (date < today) return "VENCIDO";
  if (date <= addDays(today, 30)) return "POR VENCER";
  return "OK";
}

function loadMarks() {
  return reportMarks;
}

function loadOperations() {
  return reportOperations;
}

function jornalForDate(person, date) {
  return reportJornalMap.get(`${person.id}|${inputDateValue(date)}`);
}

function shiftFromJornal(jornal) {
  if (!jornal) return { noSchedule: true, label: "Sin previsión", activity: "Sin previsión", hours: 0 };
  if (REPORT_STATUSES.includes(jornal.state)) {
    return { noSchedule: true, label: jornal.state, activity: jornal.state, hours: 0 };
  }
  const activity = jornal.activity || "LOGISTICA";
  if (!jornal.plannedStart || !jornal.plannedEnd) {
    return { noSchedule: false, start: "", end: "", activity, hours: jornal.plannedHours || 0 };
  }
  return {
    noSchedule: false,
    start: jornal.plannedStart,
    end: jornal.plannedEnd,
    activity,
    hours: jornal.plannedHours,
  };
}

function workedHoursForReportMarks(marks) {
  const entry = markTime(marks, "Entrada");
  const exit = markTime(marks, "Salida");
  return entry && exit ? shiftHours(entry, exit) : 0;
}

function markTime(marks, type) {
  return marks.find((mark) => String(mark.type).toLowerCase() === type.toLowerCase())?.time || "";
}

function markType(marks, type) {
  const mark = marks.find((item) => String(item.type).toLowerCase() === type.toLowerCase());
  return mark ? mark.tipoMarca || (mark.method === "facial" ? "Por reloj facial" : "Por usuario") : "";
}

function hasMark(marks, type) {
  return Boolean(markTime(marks, type));
}

function shiftText(shift) {
  return shift.noSchedule ? shift.label : `${shift.start} - ${shift.end} · ${shift.activity}`;
}

function operationStatusLabel(status) {
  return { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" }[status] || "Pendiente";
}

function incidentTypeLabel(type) {
  return {
    MARCA_FUERA_UBICACION: "Marca fuera de ubicación",
    MARCA_EN_ESTADO_SIN_HORARIO: "Marca en estado sin horario",
    MARCA_INCOMPLETA: "Marca incompleta",
    TURNO_SIN_ENTRADA: "Turno sin entrada",
    TURNO_SIN_SALIDA: "Turno sin salida",
    TURNO_CON_MARCAS_FALTANTES: "Turno con marcas faltantes",
    DESFASAJE_ENTRADA: "Desfasaje de entrada",
    DESFASAJE_SALIDA: "Desfasaje de salida",
  }[type] || type || "";
}

function normalizeTime(value) {
  const [hour, minute = "00"] = String(value).split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function shiftHours(start, end) {
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

function minutes(value) {
  const match = String(value || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  return match ? Number(match[1]) * 60 + Number(match[2] || 0) : null;
}

function daysInRange(from, to) {
  const days = [];
  const cursor = startOfDay(from);
  while (cursor <= startOfDay(to)) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function parseInputDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function parseLabeledDate(value) {
  const match = String(value || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
}

function parseDbDateTime(value) {
  const [datePart, timePart = "00:00:00"] = String(value || "").replace("T", " ").split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, hour, minute, second);
}

function dateInRange(date, from, to) {
  return Boolean(date) && startOfDay(date) >= startOfDay(from) && startOfDay(date) <= startOfDay(to);
}

function sameDay(a, b) {
  return Boolean(a && b) && startOfDay(a).getTime() === startOfDay(b).getTime();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function weekdayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function mondayDate(date) {
  const monday = startOfDay(date);
  monday.setDate(monday.getDate() - weekdayIndex(monday));
  return monday;
}

function inputDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return date.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slug(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeFilterQuery(value) {
  const normalized = normalizeSearchText(value);
  return ["todos", "todas", "todo", "all"].includes(normalized) ? "" : normalized;
}

function showReportToast(message) {
  report.toast.textContent = message;
  report.toast.classList.add("visible");
  window.setTimeout(() => report.toast.classList.remove("visible"), 2200);
}

[report.person, report.role].forEach((element) => {
  element.addEventListener("input", () => {
    saveReportFilters();
    renderReportPreview();
  });
});
[report.type, report.status].forEach((element) => {
  element.addEventListener("change", renderReportPreviewKeepingDates);
});
async function refreshReportRangeAndPreview() {
  try {
    saveReportFilters();
    await refreshReportData();
    renderReportPreview();
  } catch (error) {
    console.error(error);
    report.rowCount.textContent = "0 filas";
    report.body.innerHTML = `<tr><td>No se pudo conectar con la base local.</td></tr>`;
  }
}

report.previousMonth.addEventListener("click", () => moveReportMonth(-1));
report.currentMonth.addEventListener("click", () => {
  selectedReportMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  syncReportMonthRange();
  refreshReportRangeAndPreview();
});
report.nextMonth.addEventListener("click", () => moveReportMonth(1));
report.preview.addEventListener("click", refreshReportRangeAndPreview);
report.export.addEventListener("click", exportCsv);

initReports().catch((error) => {
  console.error(error);
  report.body.innerHTML = `<tr><td>No se pudo conectar con la base local.</td></tr>`;
});
