if (!requireModuleAccess("dashboard")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const dashboardStatuses = ["LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE", "VACIO"];
const dashboardUser = currentUser();
const DASHBOARD_API_BASE = apiBase();
const DASHBOARD_SELECTED_DAY_KEY = "dashboardSelectedDay";
let dashboardConfig = { alertTolerance: { greenMinutes: 15, yellowMinutes: 30 } };
let dashboardPersonnel = [];
let dashboardMarks = [];
let dashboardOperations = [];
let dashboardTurns = [];
let dashboardIncidents = [];
let dashboardApprovals = [];
let dashboardTurnMap = new Map();
let selectedDashboardOperation = null;
let incidentPersonQuery = "";
let selectedDashboardDay = loadSavedDashboardDay();
let rangeStart = selectedDashboardDay;
let rangeEnd = selectedDashboardDay;
let modalRangeStart = selectedDashboardDay;
let modalRangeEnd = selectedDashboardDay;

const dash = {
  previousDay: document.querySelector("#previousDashboardDay"),
  todayDay: document.querySelector("#todayDashboardDay"),
  nextDay: document.querySelector("#nextDashboardDay"),
  dayLabel: document.querySelector("#dashboardDayLabel"),
  dayKpiTitle: document.querySelector("#dashboardDayKpiTitle"),
  monthKpiTitle: document.querySelector("#dashboardMonthKpiTitle"),
  dayKpis: document.querySelector("#dashboardDayKpis"),
  monthKpis: document.querySelector("#dashboardMonthKpis"),
  operationsTotal: document.querySelector("#operationsTotal"),
  operationsAdminList: document.querySelector("#operationsAdminList"),
  operationEditModal: document.querySelector("#dashboardOperationEditModal"),
  operationEditForm: document.querySelector("#dashboardOperationEditForm"),
  operationEditType: document.querySelector("#dashboardOperationEditType"),
  operationEditBand: document.querySelector("#dashboardOperationEditBand"),
  operationEditValue: document.querySelector("#dashboardOperationEditValue"),
  cancelOperationEdit: document.querySelector("#cancelDashboardOperationEdit"),
  detail: document.querySelector("#dashboardDetail"),
  dailyPeopleTotal: document.querySelector("#dailyPeopleTotal"),
  dailyPeopleSearch: document.querySelector("#dailyPeopleSearch"),
  dailyValidationStatus: document.querySelector("#dailyValidationStatus"),
  markEditModal: document.querySelector("#markEditModal"),
  markEditTitle: document.querySelector("#markEditModalTitle"),
  cancelMarkEdit: document.querySelector("#cancelMarkEdit"),
  markEditForm: document.querySelector("#markEditForm"),
  markEditId: document.querySelector("#markEditId"),
  markEditPersonId: document.querySelector("#markEditPersonId"),
  markEditType: document.querySelector("#markEditType"),
  markEditDate: document.querySelector("#markEditDate"),
  markEditTime: document.querySelector("#markEditTime"),
  markEditActivity: document.querySelector("#markEditActivity"),
  markEditLocation: document.querySelector("#markEditLocation"),
  markSingleFields: document.querySelector(".mark-single-fields"),
  markPairFields: document.querySelector(".mark-pair-fields"),
  markObservationField: document.querySelector(".mark-observation-field"),
  markEntryDate: document.querySelector("#markEntryDate"),
  markEntryTime: document.querySelector("#markEntryTime"),
  markExitDate: document.querySelector("#markExitDate"),
  markExitTime: document.querySelector("#markExitTime"),
  markPairActivity: document.querySelector("#markPairActivity"),
  markAdminObservation: document.querySelector("#markAdminObservation"),
  markEditNote: document.querySelector("#markEditNote"),
  incidentModal: document.querySelector("#incidentModal"),
  closeIncidentModal: document.querySelector("#closeIncidentModal"),
  incidentPersonFilter: document.querySelector("#incidentPersonFilter"),
  incidentSelectAll: document.querySelector("#incidentSelectAll"),
  resolveSelectedIncidents: document.querySelector("#resolveSelectedIncidents"),
  incidentResolutionList: document.querySelector("#incidentResolutionList"),
  timeAlertModal: document.querySelector("#timeAlertModal"),
  closeTimeAlertModal: document.querySelector("#closeTimeAlertModal"),
  timeAlertList: document.querySelector("#timeAlertList"),
  timeAlertTitle: document.querySelector("#timeAlertModalTitle"),
  documentAlertModal: document.querySelector("#documentAlertModal"),
  closeDocumentAlertModal: document.querySelector("#closeDocumentAlertModal"),
  documentAlertList: document.querySelector("#documentAlertList"),
};

function parseDashboardShift(raw) {
  const normalized = String(raw || "").trim().toUpperCase();
  if (!raw || normalized === "SIN PREVISIÓN") {
    return { noSchedule: true, label: "Sin previsión", activity: "Sin previsión", hours: 0, planned: false };
  }
  if (dashboardStatuses.includes(normalized)) {
    return { noSchedule: true, label: normalized, activity: normalized, hours: 0, planned: false };
  }

  const match = String(raw || "").match(/^(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s+(.+)$/);
  if (!match) return { noSchedule: false, start: "", end: "", activity: raw || "LOGISTICA", hours: 0, planned: true };
  return {
    noSchedule: false,
    start: normalizeDashboardTime(match[1]),
    end: normalizeDashboardTime(match[2]),
    activity: match[3],
    hours: shiftHours(match[1], match[2]),
    planned: true,
    crossesMidnight: shiftCrossesMidnight(match[1], match[2]),
  };
}

function shiftCrossesMidnight(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return startMinutes !== null && endMinutes !== null && endMinutes < startMinutes;
}

function normalizeDashboardTime(value) {
  const [hour, minute = "00"] = String(value || "").split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function shiftHours(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

function minutesFromTime(value) {
  return timeToMinutes(value);
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] || 0);
}

function loadDashboardMarks() {
  return dashboardMarks;
}

function loadDashboardOperations() {
  return dashboardOperations;
}

function canEditDashboardMarks() {
  return dashboardUser?.roleId === "admin";
}

async function dashboardApiGet(path) {
  const response = await fetch(`${DASHBOARD_API_BASE}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function dashboardApiPost(path, payload) {
  const response = await fetch(`${DASHBOARD_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `No se pudo guardar ${path}`);
  return data;
}

function dashboardRanges() {
  const dayStart = startOfDay(selectedDashboardDay);
  const dayEnd = dayStart;
  const weekStart = mondayDate(dayStart);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0);
  return { dayStart, dayEnd, weekStart, weekEnd, monthStart, monthEnd };
}

async function refreshDashboardData() {
  const { monthStart, monthEnd } = dashboardRanges();
  const from = monthStart;
  const to = addDays(monthEnd, 1);
  const query = `desde=${inputDateValue(from)}&hasta=${inputDateValue(to)}`;
  await dashboardApiPost("/observaciones-jornal/generar", {
    desde: inputDateValue(from),
    hasta: inputDateValue(to),
  }).catch((error) => console.warn("No se pudieron recalcular observaciones", error));
  const personas = await dashboardApiGet("/personas");
  const [configRows, operationTariffs, turnos, marcas, operaciones, incidencias, aprobaciones] = await Promise.all([
    dashboardApiGet("/configuracion").catch((error) => {
      console.warn("No se pudo cargar configuración del dashboard", error);
      return [];
    }),
    dashboardApiGet("/operacion-tarifas?activas=1").catch((error) => {
      console.warn("No se pudieron cargar tarifas de operaciones del dashboard", error);
      return [];
    }),
    dashboardApiGet(`/turnos?${query}`).catch((error) => {
      console.warn("No se pudieron cargar turnos del dashboard", error);
      return [];
    }),
    dashboardApiGet(`/marcas?${query}`).catch((error) => {
      console.warn("No se pudieron cargar marcas del dashboard", error);
      return [];
    }),
    dashboardApiGet(`/operaciones?${query}`).catch((error) => {
      console.warn("No se pudieron cargar operaciones del dashboard", error);
      return [];
    }),
    dashboardApiGet(`/observaciones-jornal?${query}&estado=pendientes`).catch((error) => {
      console.warn("No se pudieron cargar observaciones del dashboard", error);
      return [];
    }),
    dashboardApiGet(`/aprobaciones?${query}`).catch((error) => {
      console.warn("No se pudieron cargar aprobaciones del dashboard", error);
      return [];
    }),
  ]);

  dashboardConfig = normalizeDashboardConfig(configRows, operationTariffs);
  dashboardPersonnel = normalizeDashboardPersonnel(personas);
  dashboardMarks = marcas.map(normalizeDashboardMark);
  dashboardOperations = operaciones.map(normalizeDashboardOperation);
  dashboardIncidents = incidencias.map(normalizeDashboardIncident);
  dashboardApprovals = aprobaciones;
  dashboardTurns = turnos;
  dashboardTurnMap = new Map(dashboardTurns.map((turno) => [`${turno.persona_id}|${turno.fecha}`, turno]));
}

async function refreshDashboard() {
  try {
    await refreshDashboardData();
    renderDashboard();
  } catch (error) {
    console.error(error);
    dash.detail.innerHTML = `<tr><td colspan="6">No se pudo conectar con la base local. Verificá que el backend esté corriendo.</td></tr>`;
  }
}

function normalizeDashboardConfig(rows, operationTariffs = []) {
  const config = {
    alertTolerance: { greenMinutes: 15, yellowMinutes: 30 },
    operationBands: [...DEFAULT_OPERATION_BANDS],
    operationTariffs: Array.isArray(operationTariffs) ? operationTariffs : [],
  };
  rows.forEach((row) => {
    try {
      const value = JSON.parse(row.valor || "{}");
      if (row.clave === "alert_tolerance") {
        config.alertTolerance = {
          greenMinutes: Number(value.greenMinutes || 15),
          yellowMinutes: Number(value.yellowMinutes || 30),
        };
      }
      if (row.clave === "operation_bands" && Array.isArray(value) && value.length) config.operationBands = value.map(normalizeDashboardOperationBand);
    } catch (error) {
      console.warn("Configuración de dashboard inválida", error);
    }
  });
  return config;
}

function normalizeDashboardOperationBand(value) {
  return value === "8 a 10 horas" ? "8 a 12 horas" : value;
}

function normalizeDashboardPersonnel(rows) {
  const people = rows
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
  if (hasDashboardPermission("dashboardAllPersonnel")) return people;
  return people.filter((person) => person.name === dashboardUser?.personName);
}

function normalizeDashboardMark(row) {
  const date = parseDbDateTime(row.fecha_hora);
  return {
    id: String(row.id),
    operator: row.persona,
    type: row.tipo,
    day: formatLabeledDate(date),
    time: formatTime(date),
    dateObj: date,
    dateValue: inputDateValue(date),
    activity: row.actividad_ubicacion || "",
    detectedLocation: row.ubicacion_detectada || "",
    locationMatched: Number(row.genera_incidencia || 0) === 0,
    locationGeneratesIncident: Number(row.genera_incidencia || 0) !== 0,
    locationIncidentReason: Number(row.genera_incidencia || 0) !== 0 ? "Marca fuera de ubicación" : "",
    latitude: row.latitud !== null && row.latitud !== undefined && row.latitud !== "" ? Number(row.latitud) : null,
    longitude: row.longitud !== null && row.longitud !== undefined && row.longitud !== "" ? Number(row.longitud) : null,
    tipoMarca: row.tipo_marca || "Por usuario",
    method: row.tipo_marca === "Por reloj facial" ? "facial" : "web",
    modifiedAt: row.fecha_modificacion || "",
    modifiedBy: row.modificado_por_usuario || "",
    modificationNote: row.observacion_modificacion || "",
  };
}

function normalizeDashboardOperation(row) {
  const date = parseDbDateTime(row.fecha_hora);
  return {
    id: String(row.id),
    operator: row.persona,
    type: row.tipo_operacion,
    tariffId: row.operacion_tarifa_id ? String(row.operacion_tarifa_id) : "",
    tariffCategory: row.tarifa_categoria || "",
    tariffType: row.tarifa_tipo || "",
    band: row.franja,
    value: Number(row.valor || 0),
    amount: Number(row.valor || 0),
    reference: row.referencia || "",
    note: row.observacion || "",
    date: formatLabeledDate(date),
    time: formatTime(date),
    dateObj: date,
    status: row.estado || "pending",
    rejectionReason: row.motivo_rechazo || "",
  };
}

function normalizeDashboardIncident(row) {
  return {
    id: String(row.id),
    dbId: row.id,
    type: incidentTypeLabel(row.tipo),
    rawType: row.tipo,
    title: row.persona || "Sin persona",
    detail: row.detalle || "",
    date: parseInputDate(row.fecha),
    severity: row.severidad === "ROJA" ? "danger" : row.severidad === "AMARILLA" ? "warn" : "info",
    minutes: row.minutos_desfasaje,
    referenceType: row.referencia_tipo || "",
    referenceId: row.referencia_id ? String(row.referencia_id) : "",
    personId: row.persona_id ? String(row.persona_id) : "",
    rawDate: row.fecha || "",
    approvedBy: row.aprobado_por_usuario || "",
    approvedAt: row.fecha_resolucion || "",
    approvalComment: row.observacion_aprobacion || "",
    turnStatus: row.turno_estado || "",
    turnStart: row.turno_hora_inicio || "",
    turnEnd: row.turno_hora_fin || "",
    turnActivity: row.turno_actividad_ubicacion || "",
    markHours: row.marcas_horarios || "",
    markDateTime: row.marca_fecha_hora || "",
    markType: row.marca_tipo || "",
    markActivity: row.marca_actividad_ubicacion || "",
    markLocation: row.marca_ubicacion_detectada || "",
    markLatitude: row.marca_latitud !== null && row.marca_latitud !== undefined && row.marca_latitud !== "" ? Number(row.marca_latitud) : null,
    markLongitude: row.marca_longitud !== null && row.marca_longitud !== undefined && row.marca_longitud !== "" ? Number(row.marca_longitud) : null,
    actions: row.acciones || {},
    approvalBlock: row.bloqueo_aprobar || "",
  };
}

function incidentTypeLabel(type) {
  return {
    MARCA_FUERA_UBICACION: "Ubicación",
    MARCA_EN_ESTADO_SIN_HORARIO: "Marca en estado sin horario",
    MARCA_INCOMPLETA: "Marca incompleta",
    TURNO_SIN_ENTRADA: "Marca faltante",
    TURNO_SIN_SALIDA: "Marca faltante",
    TURNO_CON_MARCAS_FALTANTES: "Marca faltante",
    TRAMO_OBSERVADO: "Tramo observado",
    DESFASAJE_ENTRADA: "Desfasaje de entrada",
    DESFASAJE_SALIDA: "Desfasaje de salida",
  }[type] || type || "Observación";
}

function renderDashboard() {
  syncRangeInputs();
  const marks = loadDashboardMarks();
  const operations = loadDashboardOperations();
  const { dayStart, monthStart, monthEnd } = dashboardRanges();
  const dayDays = [dayStart];
  const monthDays = daysInRange(monthStart, monthEnd);
  const dayMetrics = periodMetrics(marks, operations, dayDays);
  const monthMetrics = periodMetrics(marks, operations, monthDays);

  dash.dayLabel.textContent = formatLabeledDate(dayStart);
  dash.dayKpiTitle.textContent = sameDay(dayStart, startOfDay(new Date())) ? "Hoy" : formatShortDate(dayStart);
  dash.monthKpiTitle.textContent = dayStart.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  renderPeriodKpis(dash.dayKpis, dayMetrics, "day");
  renderPeriodKpis(dash.monthKpis, monthMetrics, "month");

  document.querySelector(".operations-admin-panel")?.classList.toggle("hidden", !hasDashboardPermission("dashboardOperations"));
  if (hasDashboardPermission("dashboardOperations")) renderOperationsAdmin(operations);
  renderDailyPeopleTable(marks);
}

function periodMetrics(marks, operations, rangeDays) {
  const visibleNames = new Set(dashboardPersonnel.map((person) => person.name));
  const periodStart = rangeDays[0] || selectedDashboardDay;
  const periodEnd = rangeDays[rangeDays.length - 1] || selectedDashboardDay;
  const rows = dashboardPersonnel.flatMap((person) => rangeDays.map((date) => personDayData(person, date, marks)));
  const rangeOperations = operations.filter((operation) => visibleNames.has(operation.operator) && dateInRange(parseLabeledDate(operation.date), periodStart, periodEnd));
  const incidentItems = dashboardIncidents.filter((item) => visibleNames.has(item.title) && dateInRange(item.date, periodStart, periodEnd));
  const timeAlerts = dashboardTimeAlerts(rows);
  const plannedHours = rows.reduce((total, row) => total + row.shift.hours, 0);
  const workedHours = totalWorkedHoursForRange(marks, rangeDays);
  const hoursDiff = Math.round((workedHours - plannedHours) * 100) / 100;
  const approvedOperationCost = rangeOperations
    .filter((operation) => operation.status === "approved")
    .reduce((total, operation) => total + Number(operation.value ?? operation.amount ?? 0), 0);
  return {
    incidents: incidentItems.length,
    yellowAlerts: timeAlerts.filter((alert) => alert.level === "yellow").length,
    redAlerts: timeAlerts.filter((alert) => alert.level === "red").length,
    locationIssues: incidentItems.filter((item) => item.type === "Ubicación").length,
    documentAlerts: documentAlertsForPeriod(periodStart, periodEnd).length,
    plannedHours,
    workedHours,
    hoursDiff,
    approvedOperationCost,
    directCost: executedHoursCostForRange(marks, rangeDays),
  };
}

function renderPeriodKpis(container, metrics, scope) {
  const canSeeCosts = hasDashboardPermission("dashboardCosts");
  const alertCount = metrics.yellowAlerts + metrics.redAlerts;
  const items = [
    { label: "Observaciones", value: metrics.incidents, action: metrics.incidents > 0 ? `<button class="ghost-button tiny" data-dashboard-modal="incidents" data-scope="${scope}" type="button">Ver</button>` : "" },
    { label: "Alertas", value: alertCount, action: alertCount > 0 ? `<button class="ghost-button tiny" data-dashboard-modal="alerts" data-scope="${scope}" type="button">Ver</button>` : "" },
    { label: "Horas planificadas", value: formatHours(metrics.plannedHours) },
    { label: "Horas trabajadas", value: formatHours(metrics.workedHours) },
    { label: "Diferencia horas", value: formatSignedHours(metrics.hoursDiff), valueClass: metrics.hoursDiff > 0 ? "metric-positive" : metrics.hoursDiff < 0 ? "metric-negative" : "metric-neutral" },
    { label: "Marcas fuera de ubicación", value: metrics.locationIssues },
    { label: "Docs por vencer", value: metrics.documentAlerts, action: metrics.documentAlerts > 0 ? `<button class="ghost-button tiny" data-dashboard-modal="documents" data-scope="${scope}" type="button">Ver</button>` : "" },
    { label: "Costo estimado horas", value: canSeeCosts ? formatMoney(metrics.directCost) : "Sin permiso" },
    { label: "Costo estimado operaciones", value: canSeeCosts ? formatMoney(metrics.approvedOperationCost) : "Sin permiso" },
  ];
  container.innerHTML = items.map((item) => `<div class="period-kpi-item ${item.action ? "has-action" : ""}">
    <div>
      <span>${item.label}</span>
      <strong class="${item.valueClass || ""}">${item.value}</strong>
    </div>
    ${item.action || ""}
  </div>`).join("");
}

function renderOperationsAdmin(operations) {
  const filtered = filterOperations(operations);
  dash.operationsTotal.textContent = `${filtered.length} solicitudes`;
  if (!filtered.length) {
    dash.operationsAdminList.innerHTML = `<tr><td colspan="7">Sin operaciones registradas para este día.</td></tr>`;
    return;
  }

  dash.operationsAdminList.innerHTML = filtered
    .slice()
    .sort((a, b) => (parseLabeledDate(b.date)?.getTime() || 0) - (parseLabeledDate(a.date)?.getTime() || 0))
    .map((operation) => `<tr>
      <td>${operation.operator}</td>
      <td>${operation.type} · ${operation.band || "Sin franja"} · ${formatOperationMoney(operation)}</td>
      <td>${operation.reference || "Sin proyecto"}<br>${operation.note || ""}</td>
      <td>${operation.date}</td>
      <td><span class="mark-pill ${operation.status}">${operationStatusLabel(operation.status)}</span></td>
      <td>${operation.rejectionReason || "-"}</td>
      <td>
        <div class="table-actions">
          <button class="ghost-button small" data-operation="${operation.id}" data-action="approved" type="button" ${operation.status === "approved" ? "disabled" : ""}>Aprobar</button>
          <button class="ghost-button small" data-operation="${operation.id}" data-action="rejected" type="button" ${operation.status === "rejected" ? "disabled" : ""}>Rechazar</button>
          <button class="ghost-button small" data-operation="${operation.id}" data-action="edit" type="button">Editar</button>
        </div>
      </td>
    </tr>`)
    .join("");
}

function setDashboardModalRange(scope) {
  const { dayStart, monthStart, monthEnd } = dashboardRanges();
  if (scope === "month") {
    modalRangeStart = monthStart;
    modalRangeEnd = monthEnd;
    return;
  }
  modalRangeStart = dayStart;
  modalRangeEnd = dayStart;
}

function totalWorkedHoursForRange(marks, rangeDays) {
  return Math.round(dashboardPersonnel.reduce((total, person) => total + workedHoursForPersonRange(person, marks, rangeDays), 0) * 100) / 100;
}

function executedHoursCostForRange(marks, rangeDays) {
  return dashboardPersonnel.reduce((total, person) => {
    const worked = workedHoursForPersonRange(person, marks, rangeDays);
    return total + worked * Number(person.hourlyRate || 0);
  }, 0);
}

function minutesBetween(start, end) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === null || endMinutes === null) return 0;
  const workedMinutes = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  return workedMinutes / 60;
}

function buildMarkPairs(marks) {
  const sorted = marks
    .slice()
    .sort((a, b) => (a.dateObj?.getTime?.() || 0) - (b.dateObj?.getTime?.() || 0));
  const result = [];
  let currentEntry = null;

  sorted.forEach((mark) => {
    const type = String(mark.type || "").toLowerCase();
    if (type === "entrada") {
      if (currentEntry) result.push({ kind: "unpaired", mark: currentEntry });
      currentEntry = mark;
      return;
    }
    if (type === "salida") {
      if (!currentEntry) {
        result.push({ kind: "unpaired", mark });
        return;
      }
      result.push({
        kind: "pair",
        entry: currentEntry,
        exit: mark,
        hours: minutesBetween(currentEntry.time, mark.time),
      });
      currentEntry = null;
    }
  });

  if (currentEntry) result.push({ kind: "unpaired", mark: currentEntry });
  return result;
}

function dashboardTimeAlerts(rows) {
  const tolerance = dashboardConfig.alertTolerance || { greenMinutes: 15, yellowMinutes: 30 };
  return rows
    .filter((row) => row.shift.planned)
    .flatMap((row) => [
      timeAlertForMark(row, "Entrada", row.shift.start, tolerance),
      timeAlertForMark(row, "Salida", row.shift.end, tolerance),
    ])
    .filter(Boolean);
}

function timeAlertForMark(row, type, expected, tolerance) {
  const mark = row.dayMarks.find((item) => String(item.type || "").toLowerCase() === type.toLowerCase());
  if (!mark || !expected) return null;
  const diffSigned = markMinutesDifference(row, mark, type, expected);
  const diff = Math.abs(diffSigned);
  if (!Number.isFinite(diffSigned) || diff <= tolerance.greenMinutes) return null;
  return {
    level: diff <= tolerance.yellowMinutes ? "yellow" : "red",
    person: row.person.name,
    date: row.date,
    type,
    expected,
    real: mark.time,
    minutes: diff,
    diffSigned,
  };
}

function markMinutesDifference(row, mark, type, expected) {
  if (!mark.dateObj || !row.date) return minutesFromTime(mark.time) - minutesFromTime(expected);
  const expectedDate = startOfDay(row.date);
  if (String(type || "").toLowerCase() === "salida" && row.shift.crossesMidnight) {
    expectedDate.setDate(expectedDate.getDate() + 1);
  }
  const expectedMinutes = minutesFromTime(expected);
  if (expectedMinutes === null) return NaN;
  expectedDate.setHours(Math.floor(expectedMinutes / 60), expectedMinutes % 60, 0, 0);
  return Math.round((mark.dateObj.getTime() - expectedDate.getTime()) / 60000);
}

function timeAlertText(alert) {
  if (alert.diffSigned > 0) return `Marcó ${alert.minutes} minutos TARDE`;
  return `Marcó ${alert.minutes} minutos ANTES de lo previsto`;
}

function openTimeAlertModal(level) {
  const marks = loadDashboardMarks();
  const rangeDays = daysInRange(modalRangeStart, modalRangeEnd);
  const rows = dashboardPersonnel.flatMap((person) => rangeDays.map((date) => personDayData(person, date, marks)));
  const alerts = dashboardTimeAlerts(rows).filter((alert) => level === "all" || alert.level === level);
  dash.timeAlertTitle.textContent = "Alertas";
  dash.timeAlertList.innerHTML = alerts.length
    ? alerts.map((alert) => `<article class="incident-resolution-item ${alert.level === "red" ? "danger" : "warn"}">
      <div>
        <span>${alert.level === "red" ? "Roja" : "Amarilla"} · ${alert.type} · ${formatShortDate(alert.date)}</span>
        <strong>${alert.person}</strong>
        <p>${timeAlertText(alert)} · previsto ${alert.expected} · real ${alert.real}</p>
      </div>
    </article>`).join("")
    : `<article class="incident-resolution-item"><div><strong>Sin alertas</strong><p>No hay marcas fuera de tolerancia para este período.</p></div></article>`;
  dash.timeAlertModal.classList.add("open");
  dash.timeAlertModal.setAttribute("aria-hidden", "false");
}

function closeTimeAlertModal() {
  dash.timeAlertModal.classList.remove("open");
  dash.timeAlertModal.setAttribute("aria-hidden", "true");
}

function currentDocumentAlerts() {
  return documentAlertsForPeriod(modalRangeStart, modalRangeEnd);
}

function documentAlertsForPeriod(start, end) {
  return expiringDocumentAlerts(dashboardPersonnel, end).filter((alert) => dateInRange(alert.date, start, end));
}

function openDocumentAlertModal() {
  const alerts = currentDocumentAlerts();
  dash.documentAlertList.innerHTML = alerts.length
    ? alerts
      .slice()
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((alert) => `<article class="incident-resolution-item danger">
        <div>
          <span>${alert.label}</span>
          <strong>${alert.person}</strong>
          <p>Vence ${formatShortDate(alert.date)}</p>
        </div>
      </article>`)
      .join("")
    : `<article class="incident-resolution-item"><div><strong>Sin documentos por vencer</strong><p>No hay vencimientos dentro del rango observado.</p></div></article>`;
  dash.documentAlertModal.classList.add("open");
  dash.documentAlertModal.setAttribute("aria-hidden", "false");
}

function closeDocumentAlertModal() {
  dash.documentAlertModal.classList.remove("open");
  dash.documentAlertModal.setAttribute("aria-hidden", "true");
}

function openMarkEditModal(markId, options = {}) {
  if (!canEditDashboardMarks()) return;
  const mark = dashboardMarks.find((item) => item.id === String(markId));
  if (!mark) return;
  setMarkModalMode("single");
  dash.markEditTitle.textContent = "Editar marca";
  dash.markEditId.value = mark.id;
  dash.markEditPersonId.value = "";
  dash.markEditType.value = capitalize(String(mark.type || "Entrada").toLowerCase());
  dash.markEditDate.value = mark.dateValue;
  dash.markEditTime.value = mark.time;
  dash.markEditActivity.value = mark.activity || "";
  dash.markEditLocation.value = mark.detectedLocation || "";
  dash.markEditModal.classList.toggle("modal-front", Boolean(options.front));
  dash.markEditModal.classList.add("open");
  dash.markEditModal.setAttribute("aria-hidden", "false");
}

function setMarkModalMode(mode) {
  dash.markEditForm.dataset.mode = mode;
  dash.markSingleFields.classList.toggle("hidden", mode !== "single");
  dash.markPairFields.classList.toggle("hidden", mode !== "pair");
  dash.markObservationField.classList.toggle("hidden", mode === "single");
  dash.markEditNote.textContent = mode === "pair"
    ? "Ubicación detectada: sin dato, carga manual realizada por administrador."
    : "Al guardar, la marca queda registrada como modificada por el usuario administrador actual.";
}

function openMarkCreateModal(personId, dateValue, defaultType = "Entrada", defaultTime = "09:00", defaultActivity = "", mode = "single", exitTime = "18:00", options = {}) {
  if (!canEditDashboardMarks()) return;
  setMarkModalMode(mode);
  dash.markEditTitle.textContent = mode === "pair" ? "Cargar marcas manuales" : "Agregar marca";
  dash.markEditId.value = "";
  dash.markEditPersonId.value = personId;
  dash.markEditType.value = defaultType;
  dash.markEditDate.value = dateValue;
  dash.markEditTime.value = defaultTime;
  dash.markEditActivity.value = defaultActivity || "";
  dash.markEditLocation.value = "";
  dash.markEntryDate.value = dateValue;
  dash.markEntryTime.value = defaultTime;
  dash.markExitDate.value = dateValue;
  dash.markExitTime.value = exitTime;
  dash.markPairActivity.value = defaultActivity || "";
  dash.markAdminObservation.value = "";
  dash.markEditModal.classList.toggle("modal-front", Boolean(options.front));
  dash.markEditModal.classList.add("open");
  dash.markEditModal.setAttribute("aria-hidden", "false");
}

function closeMarkEditModal() {
  dash.markEditModal.classList.remove("open");
  dash.markEditModal.classList.remove("modal-front");
  dash.markEditModal.setAttribute("aria-hidden", "true");
  dash.markEditForm.reset();
}

async function saveMarkEdit(event) {
  event.preventDefault();
  if (dash.markEditForm.dataset.mode === "pair") {
    await saveManualMarkPair();
    return;
  }
  const rawTime = normalizeDashboardTime(dash.markEditTime.value);
  if (timeToMinutes(rawTime) === null) {
    window.alert("La hora debe tener formato HH:MM");
    return;
  }
  const payload = {
    tipo: dash.markEditType.value,
    fecha: dash.markEditDate.value,
    hora: rawTime,
    actividad_ubicacion: dash.markEditActivity.value.trim().toUpperCase(),
    ubicacion_detectada: dash.markEditLocation.value.trim(),
    usuario_id: dashboardUser?.id,
    usuario_nombre: dashboardUser?.username,
  };
  if (dash.markEditId.value) {
    await dashboardApiPost(`/marcas/${dash.markEditId.value}`, payload);
  } else {
    await dashboardApiPost("/marcas", {
      ...payload,
      persona_id: dash.markEditPersonId.value,
      fecha_hora: `${dash.markEditDate.value} ${rawTime}:00`,
      tipo_marca: "Marca manual admin",
      registrada_por_admin: true,
    });
  }
  closeMarkEditModal();
  await refreshDashboard();
}

async function saveManualMarkPair() {
  const entryTime = normalizeDashboardTime(dash.markEntryTime.value);
  const exitTime = normalizeDashboardTime(dash.markExitTime.value);
  const observation = dash.markAdminObservation.value.trim();
  if (timeToMinutes(entryTime) === null || timeToMinutes(exitTime) === null) {
    window.alert("Las horas deben tener formato HH:MM");
    return;
  }
  if (!dash.markEntryDate.value || !dash.markExitDate.value) {
    window.alert("Las fechas de entrada y salida son requeridas");
    return;
  }
  const basePayload = {
    persona_id: dash.markEditPersonId.value,
    actividad_ubicacion: dash.markPairActivity.value.trim().toUpperCase(),
    ubicacion_detectada: "",
    tipo_marca: "Marca manual admin",
    registrada_por_admin: true,
    observacion_modificacion: observation,
    usuario_id: dashboardUser?.id,
    usuario_nombre: dashboardUser?.username,
  };
  await dashboardApiPost("/marcas", {
    ...basePayload,
    tipo: "Entrada",
    fecha_hora: `${dash.markEntryDate.value} ${entryTime}:00`,
  });
  await dashboardApiPost("/marcas", {
    ...basePayload,
    tipo: "Salida",
    fecha_hora: `${dash.markExitDate.value} ${exitTime}:00`,
  });
  closeMarkEditModal();
  await refreshDashboard();
}

function currentIncidentItems() {
  return currentRangeIncidentItems();
}

function currentRangeIncidentItems() {
  const visibleNames = new Set(dashboardPersonnel.map((person) => person.name));
  return dashboardIncidents.filter((item) => visibleNames.has(item.title) && dateInRange(item.date, modalRangeStart, modalRangeEnd));
}

function openIncidentModal() {
  const items = currentIncidentItems();
  dash.incidentPersonFilter.value = incidentPersonQuery;
  const visibleItems = items.filter((item) => matchesMultiSearchQuery(item.title, incidentPersonQuery, normalizeSearchText));
  dash.incidentSelectAll.checked = false;
  dash.incidentSelectAll.disabled = !visibleItems.length;
  dash.resolveSelectedIncidents.disabled = true;
  dash.incidentResolutionList.innerHTML = visibleItems.length
    ? `<p class="incident-modal-note">Aprobar una observación confirma que fue revisada y la quita de pendientes del tablero.</p>${visibleItems.map((item) => `<article class="incident-resolution-item selectable ${item.severity}">
      <input class="incident-batch-check" type="checkbox" value="${item.id}" aria-label="Seleccionar observación de ${item.title}" />
      <div>
        <span>${item.type}</span>
        <strong>${item.title}</strong>
        <p>${item.detail}</p>
      </div>
      <div class="table-actions">
        <button class="ghost-button small" data-view-incident="${item.id}" type="button">Ver detalle</button>
        <button class="ghost-button small" data-edit-incident="${item.id}" type="button">Editar</button>
        ${incidentActionAllowed(item, "pasar_a_plan") ? `<button class="ghost-button small" data-pass-to-plan="${item.id}" type="button">Pasar a plan semanal</button>` : ""}
        ${incidentActionAllowed(item, "marcar_ausente") ? `<button class="ghost-button small" data-mark-absent="${item.id}" type="button">Marcar ausente</button>` : ""}
        <button class="primary-button small" data-resolve-incident="${item.id}" type="button" ${incidentActionAllowed(item, "aprobar") ? "" : `disabled title="${escapeHtml(item.approvalBlock || "No disponible")}"`}>Aprobar</button>
      </div>
    </article>`).join("")}`
    : `<article class="incident-resolution-item empty"><div><strong>Sin observaciones pendientes</strong><p>No hay elementos para mostrar con este filtro.</p></div></article>`;
  dash.incidentModal.classList.add("open");
  dash.incidentModal.setAttribute("aria-hidden", "false");
}

function closeIncidentModal() {
  dash.incidentModal.classList.remove("open");
  dash.incidentModal.setAttribute("aria-hidden", "true");
}

function incidentActionAllowed(item, action) {
  if (item?.actions && action in item.actions) return Boolean(item.actions[action]);
  if (action === "pasar_a_plan") return item?.rawType === "MARCA_EN_ESTADO_SIN_HORARIO";
  if (action === "marcar_ausente") return ["TURNO_CON_MARCAS_FALTANTES", "TURNO_SIN_ENTRADA", "TURNO_SIN_SALIDA"].includes(item?.rawType) && !String(item.markHours || "").trim();
  if (action === "aprobar") return !incidentActionAllowed(item, "marcar_ausente");
  return false;
}

function incidentRequiresPlanning(item) {
  return incidentActionAllowed(item, "pasar_a_plan");
}

function incidentCanMarkAbsent(item) {
  return incidentActionAllowed(item, "marcar_ausente");
}

async function passIncidentToPlan(id) {
  await dashboardApiPost("/observaciones-jornal/pasar-a-plan", {
    ids: [Number(id)],
  });
  await refreshDashboard();
  openIncidentModal();
}

async function markIncidentAbsent(id) {
  await dashboardApiPost("/observaciones-jornal/marcar-ausente", {
    ids: [Number(id)],
  });
  await refreshDashboard();
  openIncidentModal();
}

async function resolveIncident(id) {
  const item = dashboardIncidents.find((incident) => incident.id === String(id));
  if (item && incidentCanMarkAbsent(item)) {
    window.alert("Primero cargá una marca manual o marcá el turno como AUSENTE.");
    return;
  }
  const comment = approvalCommentPrompt();
  if (comment === null) return;
  await dashboardApiPost("/observaciones-jornal/resolver", {
    ids: [Number(id)],
    usuario_id: dashboardUser?.id,
    observacion_aprobacion: comment,
  });
  await refreshDashboard();
  openIncidentModal();
}

function approvalCommentPrompt() {
  const comment = window.prompt("Comentario opcional para la aprobación de la observación");
  return comment === null ? null : comment.trim();
}

function viewIncidentDetail(id) {
  const item = dashboardIncidents.find((incident) => incident.id === String(id));
  if (!item) return;
  const comment = item.approvalComment ? `\n\nComentario aprobación: ${item.approvalComment}` : "";
  const planned = item.turnStatus && item.turnStatus !== "NORMAL" ? item.turnStatus : `${item.turnStart || "--:--"} - ${item.turnEnd || "--:--"}`;
  const involvedMark = item.markDateTime ? `\nMarca involucrada: ${item.markType || "Marca"} ${formatTime(parseDbDateTime(item.markDateTime))}` : "";
  const activity = item.turnActivity || item.markActivity || "-";
  const mapUrl = googleMapsUrl(item.markLatitude, item.markLongitude);
  const mapText = mapUrl ? `\nMapa marca: ${mapUrl}` : "";
  window.alert(`${item.type}\n${item.title}\n${formatShortDate(item.date)}\n\n${item.detail}\n\nTurno previsto: ${planned}\nMarcas del día: ${item.markHours || "-"}${involvedMark}\nActividad / ubicación: ${activity}${mapText}${comment}`);
}

function editIncident(id) {
  const item = dashboardIncidents.find((incident) => incident.id === String(id));
  if (!item) return;
  if (item.referenceType === "marca" && item.referenceId) {
    openMarkEditModal(item.referenceId, { front: true });
    return;
  }
  const person = dashboardPersonnel.find((candidate) => String(candidate.id) === String(item.personId) || candidate.name === item.title);
  if (!person || !item.rawDate) return;
  const shift = parseDashboardShift(plannedShiftForDate(person, parseInputDate(item.rawDate)));
  openMarkCreateModal(person.id, item.rawDate, "Entrada", shift.start || "09:00", shift.noSchedule ? "" : shift.activity, "pair", shift.end || "18:00", { front: true });
}

function selectedIncidentIds() {
  return [...dash.incidentResolutionList.querySelectorAll(".incident-batch-check:checked")].map((input) => input.value);
}

function updateIncidentBatchActions() {
  const checks = [...dash.incidentResolutionList.querySelectorAll(".incident-batch-check")];
  const selected = checks.filter((input) => input.checked);
  dash.incidentSelectAll.checked = Boolean(checks.length) && selected.length === checks.length;
  dash.resolveSelectedIncidents.disabled = !selected.length;
}

async function resolveSelectedIncidents() {
  const ids = selectedIncidentIds();
  if (!ids.length) return;
  const blocked = ids
    .map((id) => dashboardIncidents.find((incident) => incident.id === String(id)))
    .filter((incident) => incident && incidentCanMarkAbsent(incident));
  if (blocked.length) {
    window.alert("Hay observaciones seleccionadas que primero necesitan cargar una marca manual o marcar ausente.");
    return;
  }
  const comment = approvalCommentPrompt();
  if (comment === null) return;
  await dashboardApiPost("/observaciones-jornal/resolver", {
    ids: ids.map(Number),
    usuario_id: dashboardUser?.id,
    observacion_aprobacion: comment,
  });
  await refreshDashboard();
  openIncidentModal();
}

function filterOperations(operations) {
  return operations.filter((operation) => {
    const date = parseLabeledDate(operation.date);
    return dateInRange(date, selectedDashboardDay, selectedDashboardDay);
  });
}

function renderDailyPeopleTable(marks) {
  const allRows = dashboardPersonnel
    .map((person) => personDayData(person, selectedDashboardDay, marks))
    .sort((a, b) => a.person.name.localeCompare(b.person.name, "es"));
  const rows = allRows.filter((row) => matchesDailyPeopleSearch(row) && matchesDailyValidationStatus(row));
  dash.dailyPeopleTotal.textContent = `${rows.length} personas`;
  if (!rows.length) {
    dash.detail.innerHTML = `<tr><td colspan="6">No hay personal para mostrar.</td></tr>`;
    return;
  }

  dash.detail.innerHTML = rows.map(({ person, date, shift, dayMarks, incident }) => {
    const prediction = shift.noSchedule ? shift.label : `${shift.start} - ${shift.end} · ${shift.activity}`;
    const markText = dayMarks.length ? markPairsSummary(dayMarks) : `<span class="muted">Sin marca</span>`;
    const actionText = markActions(person, date, shift, dayMarks);
    const approval = approvalForPersonDay(person, date);
    return `<tr>
      <td><strong>${escapeHtml(person.name)}</strong></td>
      <td>${escapeHtml(prediction)}</td>
      <td>${markText}</td>
      <td>${actionText}</td>
      <td><span class="${incident.className}">${incident.text}</span></td>
      <td>${jornalValidationCell(approval, incident)}</td>
    </tr>`;
  }).join("");
}

function matchesDailyPeopleSearch(row) {
  const query = dash.dailyPeopleSearch?.value || "";
  return matchesMultiSearchQuery(dailyPeopleSearchText(row), query, normalizeSearchText);
}

function matchesDailyValidationStatus(row) {
  const status = dash.dailyValidationStatus?.value || "todos";
  if (status === "todos") return true;
  const approval = approvalForPersonDay(row.person, row.date);
  if (!approval) return status === "sin_jornal";
  if (status === "pendiente") return approval.estado_aprobacion === "PENDIENTE";
  if (status === "auto") return approval.estado_aprobacion === "APROBADA" && approval.modo_aprobacion === "AUTO";
  if (status === "manual") return approval.estado_aprobacion === "APROBADA" && approval.modo_aprobacion !== "AUTO";
  if (status === "con_incidencia") return approval.estado_aprobacion === "VALIDADA_CON_INCIDENCIA";
  if (status === "requiere_revision") return approval.estado_aprobacion === "REQUIERE_REVISION";
  if (status === "rechazado") return approval.estado_aprobacion === "RECHAZADA";
  return true;
}

function dailyPeopleSearchText({ person, date, shift, dayMarks, incident }) {
  const dayOperations = loadDashboardOperations().filter((operation) => {
    const operationDate = parseLabeledDate(operation.date);
    return operation.operator === person.name && sameDay(operationDate, date);
  });
  return [
    person.name,
    person.role,
    person.operatorType,
    shift.label,
    shift.activity,
    shift.start,
    shift.end,
    incident.text,
    ...dayMarks.flatMap((mark) => [
      mark.type,
      mark.time,
      mark.activity,
      mark.detectedLocation,
      mark.locationIncidentReason,
      mark.tipoMarca,
      mark.modificationNote,
    ]),
    ...dayOperations.flatMap((operation) => [
      operation.type,
      operation.band,
      operation.reference,
      operation.note,
      operation.status,
      operation.rejectionReason,
    ]),
  ].filter(Boolean).join(" ");
}

function approvalForPersonDay(person, date) {
  const dayKey = inputDateValue(date);
  return dashboardApprovals.find((row) => String(row.persona_id) === String(person.id) && row.fecha === dayKey) || null;
}

function jornalValidationCell(approval, incident) {
  if (!approval) return `<span class="muted">Sin jornal</span>`;
  const label = jornalApprovalLabel(approval);
  const className = jornalApprovalClass(approval);
  const markIds = Array.isArray(approval.marcas_ids) ? approval.marcas_ids.filter(Boolean) : [];
  const hasIncident = incident?.text && !["Sin incidencia", "Sin observación"].includes(incident.text);
  const canValidate = !["APROBADA", "VALIDADA_CON_INCIDENCIA"].includes(approval.estado_aprobacion) && markIds.length > 0 && hasDashboardPermission("dashboardAllPersonnel");
  return `<div class="table-actions">
    <span class="mark-pill ${className}">${label}</span>
    ${canValidate ? `<button
      class="ghost-button tiny"
      type="button"
      data-validate-jornal="${escapeHtml(markIds.join(","))}"
      data-jornal-date="${escapeHtml(approval.fecha || "")}"
      data-jornal-incident="${hasIncident ? "true" : "false"}"
    >Validar</button>` : ""}
  </div>`;
}

function jornalApprovalClass(approval) {
  if (approval.estado_aprobacion === "APROBADA" && approval.modo_aprobacion === "AUTO") return "approved-auto";
  if (approval.estado_aprobacion === "VALIDADA_CON_INCIDENCIA") return "approved-with-incident";
  if (approval.estado_aprobacion === "REQUIERE_REVISION") return "requires-review";
  if (approval.estado_aprobacion === "APROBADA") return "approved-manual";
  if (approval.estado_aprobacion === "RECHAZADA") return "rejected";
  return "pending";
}

function jornalApprovalLabel(approval) {
  if (isExpectedNoWorkApproval(approval)) return "No requiere";
  if (approval.estado_aprobacion === "APROBADA" && approval.modo_aprobacion === "AUTO") return "Auto";
  if (approval.estado_aprobacion === "VALIDADA_CON_INCIDENCIA") return "Con observación";
  if (approval.estado_aprobacion === "REQUIERE_REVISION") return "Revisar";
  if (approval.estado_aprobacion === "APROBADA") return "Manual";
  if (approval.estado_aprobacion === "RECHAZADA") return "Rechazado";
  return "Pendiente";
}

function isExpectedNoWorkApproval(approval) {
  return approval?.estado_aprobacion === "APROBADA"
    && approval?.modo_aprobacion === "AUTO"
    && String(approval?.observacion_aprobacion || "").includes("estado sin horario");
}

async function validateDashboardJornal(button) {
  const markIds = String(button.dataset.validateJornal || "")
    .split(",")
    .map((id) => Number(id))
    .filter(Boolean);
  if (!markIds.length) return;
  const date = button.dataset.jornalDate || inputDateValue(selectedDashboardDay);
  await dashboardApiPost("/aprobaciones", {
    marca_ids: markIds,
    estado: button.dataset.jornalIncident === "true" ? "VALIDADA_CON_INCIDENCIA" : "APROBADA",
    usuario_id: dashboardUser?.id,
    observacion: "",
    fecha: date,
  });
  await refreshDashboard();
}

function openDashboardOperationEdit(operationId) {
  selectedDashboardOperation = loadDashboardOperations().find((operation) => operation.id === String(operationId));
  if (!selectedDashboardOperation) return;
  const tariffOptions = dashboardOperationEditTariffs(selectedDashboardOperation);
  dash.operationEditType.innerHTML = tariffOptions.length
    ? tariffOptions.map((tariff) => `<option value="${tariff.id}">${escapeHtml(dashboardOperationTariffLabel(tariff))}</option>`).join("")
    : `<option value="">Sin tarifas activas</option>`;
  dash.operationEditBand.innerHTML = dashboardConfig.operationBands
    .map((band) => `<option value="${escapeHtml(band)}">${escapeHtml(band)}</option>`)
    .join("");
  dash.operationEditType.value = tariffOptions.some((tariff) => String(tariff.id) === selectedDashboardOperation.tariffId)
    ? selectedDashboardOperation.tariffId
    : String(tariffOptions[0]?.id || "");
  dash.operationEditBand.value = dashboardConfig.operationBands.includes(selectedDashboardOperation.band)
    ? selectedDashboardOperation.band
    : dashboardConfig.operationBands[0] || selectedDashboardOperation.band;
  renderDashboardOperationEditValue();
  dash.operationEditModal.classList.add("open");
  dash.operationEditModal.setAttribute("aria-hidden", "false");
}

function closeDashboardOperationEdit() {
  dash.operationEditModal.classList.remove("open");
  dash.operationEditModal.setAttribute("aria-hidden", "true");
  selectedDashboardOperation = null;
}

function dashboardOperationEditTariffs(operation) {
  const activeTariffs = (dashboardConfig.operationTariffs || []).filter((tariff) => Number(tariff.activo) !== 0);
  if (!operation?.tariffId || activeTariffs.some((tariff) => String(tariff.id) === operation.tariffId)) return activeTariffs;
  return [
    {
      id: operation.tariffId,
      categoria: operation.tariffCategory || operation.type,
      tipo: operation.tariffType || "Histórica",
      hasta_4hs: operation.value,
      de_4_a_8hs: operation.value,
      de_8_a_12hs: operation.value,
      activo: 0,
    },
    ...activeTariffs,
  ];
}

function dashboardOperationTariffLabel(tariff) {
  return `${tariff.categoria || "Sin categoría"} · ${tariff.tipo || "Sin tipo"}`;
}

function dashboardOperationEditValue() {
  if (!selectedDashboardOperation) return 0;
  const tariff = dashboardOperationEditTariffs(selectedDashboardOperation)
    .find((item) => String(item.id) === String(dash.operationEditType.value));
  return operationTariffValueForBand(tariff, dash.operationEditBand.value);
}

function renderDashboardOperationEditValue() {
  dash.operationEditValue.textContent = `Valor estimado: ${formatMoney(dashboardOperationEditValue())}`;
}

function operationStatusLabel(status) {
  return {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
  }[status] || "Pendiente";
}

function markPairsSummary(dayMarks) {
  const pairs = buildMarkPairs(dayMarks);
  if (!pairs.length) return "";
  return `<div class="mark-pair-list">${pairs.map((item, index) => {
    if (item.kind === "pair") {
      return `<article class="mark-pair-item">
        <header>
          <strong>Tramo ${index + 1}</strong>
          <span>${escapeHtml(item.entry.time)} - ${escapeHtml(item.exit.time)} · ${formatHours(item.hours)}</span>
        </header>
        <div class="mark-pair-marks">
          ${markSummary(item.entry)}
          ${markSummary(item.exit)}
        </div>
      </article>`;
    }
    const missingLabel = String(item.mark?.type || "").toLowerCase() === "entrada" ? "Falta salida" : "Falta entrada";
    return `<article class="mark-pair-item incomplete">
      <header>
        <strong>${missingLabel}</strong>
        <span>Revisar</span>
      </header>
      ${markSummary(item.mark)}
    </article>`;
  }).join("")}</div>`;
}

function markCreateButton(person, date, shift, dayMarks) {
  if (!canEditDashboardMarks()) return "";
  const hasEntry = hasMarkType(dayMarks, "entrada");
  const hasExit = hasMarkType(dayMarks, "salida");
  const type = hasEntry && !hasExit ? "Salida" : "Entrada";
  const time = type === "Salida" ? (shift.end || "18:00") : (shift.start || "09:00");
  const exitTime = shift.end || "18:00";
  const activity = shift.noSchedule ? "" : shift.activity;
  const mode = dayMarks.length ? "single" : "pair";
  return `<button
    class="ghost-button tiny mark-add-button"
    type="button"
    data-create-mark="true"
    data-person-id="${person.id}"
    data-date="${inputDateValue(date)}"
    data-type="${type}"
    data-time="${time}"
    data-exit-time="${exitTime}"
    data-mode="${mode}"
    data-activity="${escapeHtml(activity)}"
  >${mode === "pair" ? "CARGA MANUAL" : "Agregar marca"}</button>`;
}

function markActions(person, date, shift, dayMarks) {
  if (!canEditDashboardMarks()) return "-";
  return `<div class="mark-action-list">${markCreateButton(person, date, shift, dayMarks)}</div>`;
}

function markSummary(mark) {
  const distance = mark.locationDistanceMeters !== null && mark.locationDistanceMeters !== undefined ? ` · ${mark.locationDistanceMeters} m` : "";
  const detectedLocation = mark.detectedLocation ? ` · ${mark.detectedLocation}${distance}` : "";
  const modification = mark.modificationNote || (mark.modifiedBy ? `Modificado por ${mark.modifiedBy}` : "");
  const mapUrl = googleMapsUrl(mark.latitude, mark.longitude);
  return `<div class="mark-detail-item">
    <div>
      <strong>${escapeHtml(mark.type)} ${escapeHtml(mark.time)}</strong>
      <span>${escapeHtml(markTypeLabel(mark))}${escapeHtml(detectedLocation)}</span>
      ${mapUrl ? `<a class="inline-map-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Ver ubicación</a>` : ""}
      ${!mapUrl && mark.locationGeneratesIncident ? `<small>Sin coordenadas registradas</small>` : ""}
      ${modification ? `<small>${escapeHtml(modification)}${mark.modifiedAt ? ` · ${escapeHtml(mark.modifiedAt)}` : ""}</small>` : ""}
    </div>
    ${canEditDashboardMarks() ? `<div class="mark-admin-actions">
      <button class="ghost-button tiny mark-edit-button" type="button" data-edit-mark="${mark.id}">Editar</button>
      <button class="ghost-button tiny mark-delete-button" type="button" data-delete-mark="${mark.id}">Anular</button>
    </div>` : ""}
  </div>`;
}

function googleMapsUrl(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function hasMarkType(dayMarks, type) {
  return dayMarks.some((mark) => String(mark.type || "").toLowerCase() === type.toLowerCase());
}

function expiringDocumentAlerts(personnel, limitDate) {
  const today = startOfDay(new Date());
  const limit = addDays(today, 30);
  const rangeLimit = limitDate > limit ? limitDate : limit;
  return personnel.flatMap((person) => {
    const alerts = [];
    const licenseDate = parseInputDate(person.driverLicenseExpiry);
    const healthDate = parseInputDate(person.healthCardExpiry);
    if (person.driverLicenseType && person.driverLicenseType !== "NO TIENE" && licenseDate && licenseDate <= rangeLimit) {
      alerts.push({ person: person.name, label: `Libreta ${person.driverLicenseType}`, date: licenseDate });
    }
    if (healthDate && healthDate <= rangeLimit) {
      alerts.push({ person: person.name, label: "Carné de salud", date: healthDate });
    }
    return alerts;
  });
}

function personDayData(person, date, marks) {
  const shift = parseDashboardShift(plannedShiftForDate(person, date));
  const dayMarks = marksForPersonDay(person, date, marks);
  return { person, date, shift, dayMarks, incident: incidentForDay(shift, dayMarks) };
}

function marksForPersonDay(person, date, marks) {
  const target = inputDateValue(date);
  return markPairsWithStartDay(marks.filter((mark) => mark.operator === person.name))
    .filter((item) => item.dayKey === target)
    .flatMap((item) => [item.entry, item.exit].filter(Boolean));
}

function markPairsWithStartDay(personMarks) {
  const sorted = personMarks
    .slice()
    .sort((a, b) => (a.dateObj?.getTime?.() || 0) - (b.dateObj?.getTime?.() || 0));
  const pairs = [];
  let currentEntry = null;
  sorted.forEach((mark) => {
    const type = String(mark.type || "").toLowerCase();
    if (type === "entrada") {
      if (currentEntry) pairs.push({ dayKey: inputDateValue(currentEntry.dateObj), entry: currentEntry, exit: null });
      currentEntry = mark;
      return;
    }
    if (type === "salida") {
      if (currentEntry) {
        pairs.push({ dayKey: inputDateValue(currentEntry.dateObj), entry: currentEntry, exit: mark });
        currentEntry = null;
        return;
      }
      pairs.push({ dayKey: inputDateValue(mark.dateObj), entry: null, exit: mark });
    }
  });
  if (currentEntry) pairs.push({ dayKey: inputDateValue(currentEntry.dateObj), entry: currentEntry, exit: null });
  return pairs;
}

function workedHoursForPersonRange(person, marks, rangeDays) {
  const rangeKeys = new Set(rangeDays.map(inputDateValue));
  return markPairsWithStartDay(marks.filter((mark) => mark.operator === person.name))
    .filter((item) => rangeKeys.has(item.dayKey))
    .reduce((total, item) => {
      if (!item.entry || !item.exit) return total;
      return total + minutesBetween(item.entry.time, item.exit.time);
    }, 0);
}

function plannedShiftForDate(person, date) {
  const turno = dashboardTurnMap.get(`${person.id}|${inputDateValue(date)}`);
  if (!turno) return "Sin previsión";
  const estado = String(turno.estado || "VACIO").toUpperCase();
  if (dashboardStatuses.includes(estado)) return estado;
  const start = turno.hora_inicio || "";
  const end = turno.hora_fin || "";
  const activity = turno.actividad_ubicacion || "LOGISTICA";
  return start && end ? `${start} - ${end} ${activity}` : activity;
}

function incidentForDay(shift, dayMarks) {
  const label = shift.label?.toUpperCase?.() || "";
  if ((label === "SIN PREVISIÓN" || label === "VACIO") && !dayMarks.length) return { text: "Sin observación", className: "status-ok" };
  if (shift.noSchedule && dayMarks.length) return { text: "Marca en estado sin horario", className: "status-danger" };
  if (!shift.noSchedule && !dayMarks.length) return { text: "Turno sin marca", className: "status-warn" };
  if (!shift.noSchedule && (!hasMarkType(dayMarks, "Entrada") || !hasMarkType(dayMarks, "Salida"))) return { text: "Marca incompleta", className: "status-warn" };
  if (buildMarkPairs(dayMarks).some((item) => item.kind === "unpaired")) return { text: "Marca incompleta", className: "status-warn" };
  return { text: "Sin observación", className: "status-ok" };
}

function markTypeLabel(mark) {
  if (mark.tipoMarca === "Marca manual admin") return "MARCA MANUAL ADMIN";
  if (mark.modificationNote || mark.modifiedBy) return "MARCA MANUAL ADMIN";
  if (mark.tipoMarca === "Por usuario") return "RELOJ WEB";
  if (mark.tipoMarca === "Por reloj facial") return "RELOJ FACIAL";
  return mark.tipoMarca || (mark.method === "facial" ? "RELOJ FACIAL" : "RELOJ WEB");
}

function daysInRange(start, end) {
  const days = [];
  const cursor = startOfDay(start);
  const limit = startOfDay(end);
  while (cursor <= limit) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function daysForMonth(key) {
  const [year, month] = key.split("-").map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, index) => new Date(year, month - 1, index + 1));
}

function addDays(date, amount) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseInputDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function parseLabeledDate(value) {
  const match = String(value || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parseDbDateTime(value) {
  const [datePart, timePart = "00:00:00"] = String(value || "").replace("T", " ").split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, hour, minute, second);
}

function dateInRange(date, start, end) {
  if (!date) return false;
  const day = startOfDay(date).getTime();
  return day >= startOfDay(start).getTime() && day <= startOfDay(end).getTime();
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
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

function formatShortDate(date) {
  return date.toLocaleDateString("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatLabeledDate(date) {
  return date.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minDate(a, b) {
  return startOfDay(a) <= startOfDay(b) ? a : b;
}

function maxDate(a, b) {
  return startOfDay(a) >= startOfDay(b) ? a : b;
}

function inputDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function syncRangeInputs() {
  rangeStart = selectedDashboardDay;
  rangeEnd = selectedDashboardDay;
}

function loadSavedDashboardDay() {
  const saved = parseInputDate(localStorage.getItem(DASHBOARD_SELECTED_DAY_KEY));
  return saved || startOfDay(new Date());
}

function saveDashboardDay(date) {
  localStorage.setItem(DASHBOARD_SELECTED_DAY_KEY, inputDateValue(startOfDay(date)));
}

async function setDashboardDay(date) {
  selectedDashboardDay = startOfDay(date);
  saveDashboardDay(selectedDashboardDay);
  await refreshDashboard();
}

function formatHours(value) {
  return `${Number(value || 0).toLocaleString("es-UY", { maximumFractionDigits: 2 })} h`;
}

function formatSignedHours(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatHours(numeric)}`;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function formatOperationMoney(operation) {
  return hasDashboardPermission("dashboardCosts") ? formatMoney(operation.value ?? operation.amount ?? 0) : "Sin permiso";
}

dash.closeIncidentModal.addEventListener("click", closeIncidentModal);
dash.incidentPersonFilter.addEventListener("input", () => {
  incidentPersonQuery = dash.incidentPersonFilter.value;
  openIncidentModal();
});
dash.incidentSelectAll.addEventListener("change", () => {
  dash.incidentResolutionList.querySelectorAll(".incident-batch-check").forEach((input) => {
    input.checked = dash.incidentSelectAll.checked;
  });
  updateIncidentBatchActions();
});
dash.resolveSelectedIncidents.addEventListener("click", resolveSelectedIncidents);
dash.incidentResolutionList.addEventListener("change", (event) => {
  if (event.target.closest(".incident-batch-check")) updateIncidentBatchActions();
});
dash.incidentModal.addEventListener("click", (event) => {
  if (event.target === dash.incidentModal) closeIncidentModal();
  const resolveButton = event.target.closest("[data-resolve-incident]");
  if (resolveButton) resolveIncident(resolveButton.dataset.resolveIncident);
  const viewButton = event.target.closest("[data-view-incident]");
  if (viewButton) viewIncidentDetail(viewButton.dataset.viewIncident);
  const editButton = event.target.closest("[data-edit-incident]");
  if (editButton) editIncident(editButton.dataset.editIncident);
  const passButton = event.target.closest("[data-pass-to-plan]");
  if (passButton) passIncidentToPlan(passButton.dataset.passToPlan).catch((error) => window.alert(error.message || "No se pudo pasar al plan"));
  const absentButton = event.target.closest("[data-mark-absent]");
  if (absentButton) markIncidentAbsent(absentButton.dataset.markAbsent).catch((error) => window.alert(error.message || "No se pudo marcar ausente"));
});

document.addEventListener("click", (event) => {
  const modalButton = event.target.closest("[data-dashboard-modal]");
  if (!modalButton) return;
  setDashboardModalRange(modalButton.dataset.scope);
  if (modalButton.dataset.dashboardModal === "incidents") openIncidentModal();
  if (modalButton.dataset.dashboardModal === "alerts") openTimeAlertModal("all");
  if (modalButton.dataset.dashboardModal === "documents") openDocumentAlertModal();
});
dash.closeTimeAlertModal.addEventListener("click", closeTimeAlertModal);
dash.timeAlertModal.addEventListener("click", (event) => {
  if (event.target === dash.timeAlertModal) closeTimeAlertModal();
});
dash.closeDocumentAlertModal.addEventListener("click", closeDocumentAlertModal);
dash.documentAlertModal.addEventListener("click", (event) => {
  if (event.target === dash.documentAlertModal) closeDocumentAlertModal();
});

dash.previousDay?.addEventListener("click", async () => {
  await setDashboardDay(addDays(selectedDashboardDay, -1));
});

dash.todayDay?.addEventListener("click", async () => {
  await setDashboardDay(new Date());
});

dash.nextDay?.addEventListener("click", async () => {
  await setDashboardDay(addDays(selectedDashboardDay, 1));
});

dash.operationEditType?.addEventListener("change", renderDashboardOperationEditValue);
dash.operationEditBand?.addEventListener("change", renderDashboardOperationEditValue);
dash.cancelOperationEdit?.addEventListener("click", closeDashboardOperationEdit);
dash.operationEditModal?.addEventListener("click", (event) => {
  if (event.target === dash.operationEditModal) closeDashboardOperationEdit();
});
dash.operationEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedDashboardOperation) return;
  const tariffId = dash.operationEditType.value;
  const band = dash.operationEditBand.value;
  const value = dashboardOperationEditValue();
  await dashboardApiPost(`/operaciones/${selectedDashboardOperation.id}`, {
    operacion_tarifa_id: tariffId ? Number(tariffId) : null,
    franja: band,
    valor: value,
    estado: selectedDashboardOperation.status,
  });
  closeDashboardOperationEdit();
  await refreshDashboard();
});

dash.operationsAdminList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-operation]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "edit") {
    openDashboardOperationEdit(button.dataset.operation);
    return;
  }

  let rejectionReason = "";
  if (button.dataset.action === "rejected") {
    rejectionReason = window.prompt("Ingresá el motivo del rechazo para que lo vea el operador") || "";
    if (!rejectionReason.trim()) return;
  }

  const current = loadDashboardOperations().find((operation) => operation.id === button.dataset.operation);
  if (!current) return;
  const payload = {
    estado: button.dataset.action,
    motivo_rechazo: button.dataset.action === "rejected" ? rejectionReason.trim() : "",
  };
  await dashboardApiPost(`/operaciones/${button.dataset.operation}`, payload);
  await refreshDashboard();
});

[dash.dailyPeopleSearch, dash.dailyValidationStatus].forEach((element) => {
  element?.addEventListener(element.type === "search" ? "input" : "change", () => renderDailyPeopleTable(loadDashboardMarks()));
});

dash.detail.addEventListener("click", (event) => {
  const validateButton = event.target.closest("[data-validate-jornal]");
  if (validateButton) {
    validateDashboardJornal(validateButton).catch((error) => window.alert(error.message || "No se pudo validar el jornal"));
    return;
  }
  const editButton = event.target.closest("[data-edit-mark]");
  if (editButton) {
    openMarkEditModal(editButton.dataset.editMark);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-mark]");
  if (deleteButton) {
    deleteMark(deleteButton.dataset.deleteMark).catch((error) => window.alert(error.message || "No se pudo eliminar la marca"));
    return;
  }
  const createButton = event.target.closest("[data-create-mark]");
  if (!createButton) return;
  openMarkCreateModal(
    createButton.dataset.personId,
    createButton.dataset.date,
    createButton.dataset.type,
    createButton.dataset.time,
    createButton.dataset.activity,
    createButton.dataset.mode,
    createButton.dataset.exitTime,
  );
});

async function deleteMark(markId) {
  const mark = loadDashboardMarks().find((item) => String(item.id) === String(markId));
  const label = mark ? `${mark.type} ${mark.time} de ${mark.operator}` : "esta marca";
  if (!window.confirm(`¿Anular ${label}? La marca queda guardada como anulada y no se puede desanular.`)) return;
  await dashboardApiPost(`/marcas/${markId}/delete`, {
    usuario_id: currentUser()?.id,
    usuario_nombre: currentUser()?.username,
  });
  await refreshDashboard();
}

dash.markEditForm.addEventListener("submit", saveMarkEdit);
dash.cancelMarkEdit.addEventListener("click", closeMarkEditModal);
dash.markEditModal.addEventListener("click", (event) => {
  if (event.target === dash.markEditModal) closeMarkEditModal();
});

refreshDashboard();
