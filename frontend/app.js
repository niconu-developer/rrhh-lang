if (!requireModuleAccess("plan")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

let days = [
  { key: "lun", label: "Lunes", date: 18 },
  { key: "mar", label: "Martes", date: 19 },
  { key: "mie", label: "Miércoles", date: 20 },
  { key: "jue", label: "Jueves", date: 21 },
  { key: "vie", label: "Viernes", date: 22 },
  { key: "sab", label: "Sábado", date: 23 },
  { key: "dom", label: "Domingo", date: 24 },
];

let people = [];


const STATUS_CONFIG = {
  VACIO: { label: "VACIO", className: "empty", color: "#f8fafb", text: "#8a949e" },
  LIBRE: { label: "LIBRE", className: "free", color: "#b8e4d0", text: "#05080a" },
  LICENCIA: { label: "LICENCIA", className: "license", color: "#bfe7f5", text: "#05080a" },
  SUSPENDIDO: { label: "SUSPENDIDO", className: "suspended", color: "#fff0b8", text: "#05080a" },
  "LIC. MEDICA": { label: "LIC. MEDICA", className: "medical", color: "#145c43", text: "#ffffff" },
  AUSENTE: { label: "AUSENTE", className: "absent", color: "#f0d7d7", text: "#7b1f2a" },
};

const PLAN_API_BASE = apiBase();
const PLANNER_PENDING_TURNS_KEY = "plannerPendingTurns";
const CURRENT_WEEK_OFFSET = 2;
let weeks = [];
let currentWeekIndex = CURRENT_WEEK_OFFSET;
let backendPlannerEnabled = false;
let plannerHydrating = false;
let plannerSyncTimer = null;
let plannerSavedTurnSnapshot = new Map();
let plannerDirtyTurns = new Map();
let plannerRoleOrderList = [];
let plannerVisibleRoles = new Set();
let publishedPlanDates = new Set();
let regularizedTurnKeys = new Set();
let regularizedTurnOrigins = new Map();
let selected = { personIndex: 0, dayIndex: 0 };
let selectedDayDetailIndex = 0;
let selectedCells = new Set();
let selectionAnchor = null;
let dragSelection = null;
let suppressNextShiftClick = false;
let editingCell = null;
let contextTarget = null;
let copiedShift = null;
let copiedCells = new Set();
let copiedCellsWeekIndex = null;
let pastedCells = new Set();
let pastedCellsTimer = null;
let undoStack = [];
let redoStack = [];
let monthlyPersonCache = new Map();
let monthlyPersonLoadingKey = "";
let aiSuggestions = [];
let aiSuggestionsDayIndex = null;
let aiSuggestionsLoading = false;
let aiSuggestionsError = "";

const elements = {
  head: document.querySelector("#scheduleHead"),
  body: document.querySelector("#scheduleBody"),
  table: document.querySelector("#scheduleTable"),
  planShell: document.querySelector("#planShell"),
  panelResizer: document.querySelector("#panelResizer"),
  week: document.querySelector("#weekSelect"),
  summaryFrom: document.querySelector("#summaryFromSelect"),
  summaryTo: document.querySelector("#summaryToSelect"),
  search: document.querySelector("#searchInput"),
  operatorAvatar: document.querySelector("#operatorAvatar"),
  operatorName: document.querySelector("#operatorName"),
  operatorRole: document.querySelector("#operatorRole"),
  operatorShiftCount: document.querySelector("#operatorShiftCount"),
  operatorHours: document.querySelector("#operatorHours"),
  operatorPendingHours: document.querySelector("#operatorPendingHours"),
  operatorBaseSalary: document.querySelector("#operatorBaseSalary"),
  operatorOperationsCountCard: document.querySelector("#operatorOperationsCountCard"),
  operatorOperationsTotalCard: document.querySelector("#operatorOperationsTotalCard"),
  operatorOperationsCount: document.querySelector("#operatorOperationsCount"),
  operatorOperationsTotal: document.querySelector("#operatorOperationsTotal"),
  operatorMonthTotal: document.querySelector("#operatorMonthTotal"),
  operatorWeek: document.querySelector("#operatorWeek"),
  bulkWeekTitle: document.querySelector("#bulkWeekTitle"),
  bulkEditForm: document.querySelector("#bulkEditForm"),
  bulkRoleInput: document.querySelector("#bulkRoleInput"),
  bulkDayInputs: document.querySelector("#bulkDayInputs"),
  bulkFreeInput: document.querySelector("#bulkFreeInput"),
  bulkStartInput: document.querySelector("#bulkStartInput"),
  bulkEndInput: document.querySelector("#bulkEndInput"),
  bulkActivityInput: document.querySelector("#bulkActivityInput"),
  bulkPreviewBox: document.querySelector("#bulkPreviewBox"),
  aiSuggestionTitle: document.querySelector("#aiSuggestionTitle"),
  aiSuggestionMeta: document.querySelector("#aiSuggestionMeta"),
  aiSuggestionsList: document.querySelector("#aiSuggestionsList"),
  dayAvatar: document.querySelector("#dayAvatar"),
  daySummaryTitle: document.querySelector("#daySummaryTitle"),
  daySummaryCount: document.querySelector("#daySummaryCount"),
  daySummaryList: document.querySelector("#daySummaryList"),
  exportDayButton: document.querySelector("#exportDayButton"),
  publishDayButton: document.querySelector("#publishDayButton"),
  publishDayStatus: document.querySelector("#publishDayStatus"),
  mobileDayPlanner: document.querySelector("#mobileDayPlanner"),
  mobilePrevDayButton: document.querySelector("#mobilePrevDayButton"),
  mobileTodayButton: document.querySelector("#mobileTodayButton"),
  mobileNextDayButton: document.querySelector("#mobileNextDayButton"),
  mobileDayTitle: document.querySelector("#mobileDayTitle"),
  mobileDayMeta: document.querySelector("#mobileDayMeta"),
  mobileDayList: document.querySelector("#mobileDayList"),
  mobilePublishDayButton: document.querySelector("#mobilePublishDayButton"),
  mobilePublishDayStatus: document.querySelector("#mobilePublishDayStatus"),
  mobileExportDayButton: document.querySelector("#mobileExportDayButton"),
  mobileSheetBackdrop: document.querySelector("#mobileSheetBackdrop"),
  mobileShiftSheet: document.querySelector("#mobileShiftSheet"),
  mobileSheetClose: document.querySelector("#mobileSheetClose"),
  mobileSheetEyebrow: document.querySelector("#mobileSheetEyebrow"),
  mobileSheetTitle: document.querySelector("#mobileSheetTitle"),
  mobileShiftForm: document.querySelector("#mobileShiftForm"),
  mobileShiftStatus: document.querySelector("#mobileShiftStatus"),
  mobileShiftStart: document.querySelector("#mobileShiftStart"),
  mobileShiftEnd: document.querySelector("#mobileShiftEnd"),
  mobileShiftActivity: document.querySelector("#mobileShiftActivity"),
  mobileSheetActions: document.querySelector("#mobileSheetActions"),
  contextMenu: document.querySelector("#shiftContextMenu"),
  copyShiftButton: document.querySelector("#copyShiftButton"),
  pasteShiftButton: document.querySelector("#pasteShiftButton"),
  toast: document.querySelector("#toast"),
};

const PANEL_WIDTH_KEY = "plannerSidePanelWidth";
function buildWeeks() {
  const basePeople = clonePeople(people);
  const currentMonday = getMonday(new Date());
  const offsets = [-2, -1, 0, 1, 2, 3];

  return offsets.map((offset) => {
    const weekStart = addDays(currentMonday, offset * 7);
    return {
      offset,
      isCurrent: offset === 0,
      month: weekStart.toLocaleDateString("es-UY", { month: "long" }).toUpperCase(),
      label: formatWeekLabel(weekStart, offset === 0),
      days: buildWeekDays(weekStart),
      people: buildPeopleForWeek(basePeople, offset),
    };
  });
}

function saveWeeks() {
  monthlyPersonCache = new Map();
  collectDirtyPlannerTurns();
  schedulePlannerBackendSync();
}

async function plannerApi(path, options = {}) {
  const response = await fetch(`${PLAN_API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error || "No se pudo conectar con la base");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function turnPayloadKey(payload) {
  return `${payload.persona}|${payload.fecha}`;
}

function turnPayloadFingerprint(payload) {
  return JSON.stringify({
    persona: payload.persona || "",
    fecha: payload.fecha || "",
    estado: payload.estado || "VACIO",
    hora_inicio: payload.hora_inicio || "",
    hora_fin: payload.hora_fin || "",
    actividad_ubicacion: payload.actividad_ubicacion || "",
    origen: payload.origen || "",
    origen_referencia_tipo: payload.origen_referencia_tipo || "",
    origen_referencia_id: payload.origen_referencia_id || "",
    fecha_regularizacion: payload.fecha_regularizacion || "",
  });
}

function persistPendingPlannerTurns() {
  const turnos = [...plannerDirtyTurns.values()];
  if (!turnos.length) {
    localStorage.removeItem(PLANNER_PENDING_TURNS_KEY);
    return;
  }
  localStorage.setItem(
    PLANNER_PENDING_TURNS_KEY,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      turnos,
    })
  );
}

function readPendingPlannerTurns() {
  try {
    const payload = JSON.parse(localStorage.getItem(PLANNER_PENDING_TURNS_KEY) || "null");
    return Array.isArray(payload?.turnos) ? payload.turnos : [];
  } catch (error) {
    return [];
  }
}

function capturePlannerSnapshotFromCurrentState() {
  plannerSavedTurnSnapshot = new Map(
    allPlannerTurnPayloads().map((payload) => [turnPayloadKey(payload), turnPayloadFingerprint(payload)])
  );
  plannerDirtyTurns = new Map();
  persistPendingPlannerTurns();
}

function markPlannerPayloadsSaved(payloads) {
  payloads.forEach((payload) => {
    const key = turnPayloadKey(payload);
    plannerSavedTurnSnapshot.set(key, turnPayloadFingerprint(payload));
    plannerDirtyTurns.delete(key);
  });
  persistPendingPlannerTurns();
}

function collectDirtyPlannerTurns() {
  if (plannerHydrating || !weeks.length) return [];
  allPlannerTurnPayloads().forEach((payload) => {
    const key = turnPayloadKey(payload);
    const fingerprint = turnPayloadFingerprint(payload);
    if (plannerSavedTurnSnapshot.get(key) !== fingerprint) {
      plannerDirtyTurns.set(key, payload);
    } else {
      plannerDirtyTurns.delete(key);
    }
  });
  persistPendingPlannerTurns();
  return [...plannerDirtyTurns.values()];
}

function applyTurnPayloadToWeeks(payload) {
  if (!payload?.persona || !payload?.fecha) return false;
  let applied = false;
  weeks.forEach((week) => {
    const dayIndex = week.days.findIndex((day) => inputDateValue(day.fullDate) === payload.fecha);
    if (dayIndex === -1) return;
    const personIndex = week.people.findIndex((person) => person.name === payload.persona);
    if (personIndex === -1) return;
    week.people[personIndex].shifts[dayIndex] = dbTurnToShift(payload);
    applied = true;
  });
  return applied;
}

function restorePendingPlannerTurns() {
  const pendingTurns = readPendingPlannerTurns();
  if (!pendingTurns.length) return false;
  pendingTurns.forEach((payload) => {
    if (applyTurnPayloadToWeeks(payload)) {
      plannerDirtyTurns.set(turnPayloadKey(payload), payload);
    }
  });
  collectDirtyPlannerTurns();
  if (plannerDirtyTurns.size) schedulePlannerBackendSync();
  return plannerDirtyTurns.size > 0;
}

async function loadPlannerPeopleFromBackend() {
  const [dbPeople, dbRoles] = await Promise.all([
    plannerApi("/personas"),
    plannerApi("/roles-operativos"),
  ]);
  plannerRoleOrderList = dbRoles.map((role) => role.nombre);
  plannerVisibleRoles = new Set(dbRoles.filter((role) => Number(role.aparece_plan_semanal) !== 0).map((role) => role.nombre));
  people = dbPeople
    .filter((person) => Number(person.activo) !== 0)
    .map((person) => {
      const role = person.rol_operativo || "Operador";
      return {
        name: person.nombre,
        team: teamFromPlannerRole(role),
        role,
        operatorType: role,
        hourlyRate: Number(person.valor_hora || 0),
        agreedHours: Number(person.horas_acordadas || 190),
        scheduleMode: person.horario_tipo || "variable",
        fixedSchedule: parseFixedScheduleJson(person.horario_fijo_json),
        shifts: emptyVariableWeekShifts(),
      };
    })
    .filter((person) => plannerVisibleRoles.has(person.role))
    .sort((a, b) => operationalRoleOrder(a.role) - operationalRoleOrder(b.role) || a.name.localeCompare(b.name));
}

function teamFromPlannerRole(role) {
  if (role === "Logistico" || role === "Referente") return "eventos";
  if (role === "Depo y Mant.") return "deposito";
  return "operacion";
}

function parseFixedScheduleJson(value) {
  try {
    const schedule = JSON.parse(value || "[]");
    return Array.isArray(schedule) && schedule.length ? schedule : defaultFixedSchedule();
  } catch (error) {
    return defaultFixedSchedule();
  }
}

function inputDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function parseInputDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function parseDbDateTime(value) {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLabeledDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (!match) return parseInputDate(value);
  const year = Number(match[3] || weeks[currentWeekIndex]?.days?.[0]?.fullDate?.getFullYear?.() || new Date().getFullYear());
  return new Date(year, Number(match[2]) - 1, Number(match[1]));
}

function dateInRange(date, from, to) {
  if (!date || !from || !to) return false;
  const value = inputDateValue(date);
  return value >= inputDateValue(from) && value <= inputDateValue(to);
}

function plannerDateRange() {
  return {
    from: inputDateValue(weeks[0].days[0].fullDate),
    to: inputDateValue(weeks[weeks.length - 1].days[6].fullDate),
  };
}

function dbTurnToShift(turn) {
  const status = normalizeStatus(turn.estado);
  if (STATUS_CONFIG[status]) return status;
  if (status !== "NORMAL") return status || "VACIO";
  if (!turn.hora_inicio && !turn.hora_fin) return normalizeActivity(turn.actividad_ubicacion || "");
  return serializeShift({
    free: false,
    start: turn.hora_inicio || "",
    end: turn.hora_fin || "",
    activity: normalizeActivity(turn.actividad_ubicacion || "LOGISTICA"),
  });
}

function regularizedTooltip(origin) {
  if (origin === "MARCA_MANUAL_ADMIN") return "Regularizado desde marca manual admin";
  if (origin === "MARCA_RELOJ") return "Regularizado desde reloj";
  return "Regularizado desde marca";
}

function shiftToTurnPayload(person, rawShift, date) {
  const shift = parseShift(rawShift);
  return {
    persona: person.name,
    rol_operativo: person.role || person.operatorType || "Operador",
    fecha: inputDateValue(date),
    estado: shift.noSchedule ? normalizeStatus(shift.status) : "NORMAL",
    hora_inicio: shift.noSchedule ? null : shift.start || null,
    hora_fin: shift.noSchedule ? null : shift.end || null,
    actividad_ubicacion: shift.noSchedule ? null : normalizeActivity(shift.activity || ""),
    modificado: true,
  };
}

function allPlannerTurnPayloads() {
  return weeks.flatMap((week) =>
    week.people.flatMap((person) =>
      week.days.map((day, dayIndex) => shiftToTurnPayload(person, person.shifts[dayIndex], day.fullDate))
    )
  );
}

async function hydratePlannerFromBackend() {
  const { from, to } = plannerDateRange();
  const turns = await plannerApi(`/turnos?desde=${encodeURIComponent(from)}&hasta=${encodeURIComponent(to)}`);
  const byPersonAndDate = new Map(turns.map((turn) => [`${turn.persona}|${turn.fecha}`, turn]));
  regularizedTurnKeys = new Set(
    turns
      .filter((turn) => String(turn.origen || "").startsWith("MARCA_"))
      .map((turn) => `${turn.persona}|${turn.fecha}`)
  );
  regularizedTurnOrigins = new Map(
    turns
      .filter((turn) => String(turn.origen || "").startsWith("MARCA_"))
      .map((turn) => [`${turn.persona}|${turn.fecha}`, turn.origen])
  );
  plannerHydrating = true;
  weeks.forEach((week) => {
    week.people.forEach((person) => {
      person.shifts = week.days.map((day, dayIndex) => {
        const turn = byPersonAndDate.get(`${person.name}|${inputDateValue(day.fullDate)}`);
        return turn ? dbTurnToShift(turn) : person.shifts[dayIndex];
      });
    });
  });
  backendPlannerEnabled = true;
  plannerHydrating = false;
  capturePlannerSnapshotFromCurrentState();
  if (!turns.length) window.setTimeout(() => syncPlannerTurnsToBackend({ all: true }), 300);
  return true;
}

function schedulePlannerBackendSync() {
  if (plannerHydrating) return;
  if (!plannerDirtyTurns.size) return;
  if (!backendPlannerEnabled) {
    showToast("Base no conectada. No se guardó el cambio.");
    return;
  }
  window.clearTimeout(plannerSyncTimer);
  plannerSyncTimer = window.setTimeout(syncPlannerTurnsToBackend, 120);
}

async function syncPlannerTurnsToBackend({ all = false, keepalive = false, silent = false } = {}) {
  if (!backendPlannerEnabled) return false;
  const turnos = all ? allPlannerTurnPayloads() : [...plannerDirtyTurns.values()];
  if (!turnos.length) return true;
  try {
    await plannerApi("/turnos/lote", {
      method: "POST",
      keepalive,
      body: JSON.stringify({ turnos }),
    });
    markPlannerPayloadsSaved(turnos);
    return true;
  } catch (error) {
    backendPlannerEnabled = false;
    persistPendingPlannerTurns();
    if (!silent) showToast("No pude guardar en la base. Revisá el backend.");
    return false;
  }
}

function flushPlannerBackendSync(options = {}) {
  if (plannerHydrating || !backendPlannerEnabled) return Promise.resolve(false);
  collectDirtyPlannerTurns();
  window.clearTimeout(plannerSyncTimer);
  plannerSyncTimer = null;
  return syncPlannerTurnsToBackend(options);
}

async function ensurePlannerBackendConnection() {
  if (backendPlannerEnabled) return true;
  try {
    await plannerApi("/health");
    backendPlannerEnabled = true;
    return true;
  } catch (error) {
    return false;
  }
}

async function publishSelectedDay() {
  const backendAvailable = await ensurePlannerBackendConnection();
  if (!backendAvailable) {
    showToast("Base no conectada. No se pudo publicar el día.");
    return;
  }
  try {
    const dayToPublish = weeks[currentWeekIndex].days[selected.dayIndex] || weeks[currentWeekIndex].days[selectedDayDetailIndex];
    if (!dayToPublish) {
      showToast("Seleccioná un día para publicar");
      return;
    }
    const dateValue = inputDateValue(dayToPublish.fullDate);
    const confirmed = window.confirm(`¿Publicar ${dayToPublish.label} ${dayToPublish.date} en el reloj?`);
    if (!confirmed) return;
    if (editingCell) saveInlineEdit();
    collectDirtyPlannerTurns();
    if (plannerDirtyTurns.size) {
      const synced = await flushPlannerBackendSync();
      if (!synced) {
        showToast("No se publicó: primero hay que guardar los cambios pendientes.");
        return;
      }
    }
    const configRows = await plannerApi("/configuracion");
    const currentValue = configRows.find((row) => row.clave === "published_plan_dates")?.valor;
    let published = [];
    try {
      published = JSON.parse(currentValue || "[]");
    } catch (error) {
      published = [];
    }
    const publishedSet = new Set(Array.isArray(published) ? published : []);
    publishedSet.add(dateValue);
    publishedPlanDates = publishedSet;
    await plannerApi("/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "published_plan_dates",
        valor: [...publishedSet].sort(),
      }),
    });
    updatePublishedDayStatus();
    showToast(`${dayToPublish.label} ${dayToPublish.date} publicado para el reloj`);
  } catch (error) {
    showToast(error.message || "No se pudo publicar el día");
  }
}

async function loadPublishedPlanDates() {
  try {
    const configRows = await plannerApi("/configuracion");
    const currentValue = configRows.find((row) => row.clave === "published_plan_dates")?.valor;
    const parsed = JSON.parse(currentValue || "[]");
    publishedPlanDates = new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    publishedPlanDates = new Set();
  }
}

function selectedDayDateValue() {
  const day = weeks[currentWeekIndex]?.days?.[selectedDayDetailIndex] || weeks[currentWeekIndex]?.days?.[selected.dayIndex];
  return day ? inputDateValue(day.fullDate) : "";
}

function updatePublishedDayStatus() {
  const isPublished = publishedPlanDates.has(selectedDayDateValue());
  [elements.publishDayStatus, elements.mobilePublishDayStatus].forEach((statusEl) => {
    if (!statusEl) return;
    statusEl.textContent = isPublished ? "Publicado" : "No publicado";
    statusEl.classList.toggle("published", isPublished);
    statusEl.classList.toggle("not-published", !isPublished);
    statusEl.classList.toggle("hidden", !isPublished);
  });
  elements.publishDayButton?.classList.toggle("hidden", isPublished);
  elements.mobilePublishDayButton?.classList.toggle("hidden", isPublished);
}

function clonePeople(source) {
  return source.map((person) => ({ ...person, shifts: [...person.shifts] }));
}

function buildPeopleForWeek(basePeople, offset) {
  if (offset === 0) return clonePeople(basePeople);
  if (offset > 0) return buildFuturePeopleWeek(basePeople);
  return clonePeople(basePeople).map((person) => ({
    ...person,
    shifts: person.scheduleMode === "fixed" && Array.isArray(person.fixedSchedule)
      ? fixedScheduleToShifts(person.fixedSchedule)
      : emptyVariableWeekShifts(),
  }));
}

function buildFuturePeopleWeek(source) {
  return source.map((person) => ({
    ...person,
    shifts: person.scheduleMode === "fixed" && Array.isArray(person.fixedSchedule)
      ? fixedScheduleToShifts(person.fixedSchedule)
      : emptyVariableWeekShifts(),
  }));
}

function emptyVariableWeekShifts() {
  return ["VACIO", "VACIO", "VACIO", "VACIO", "VACIO", "LIBRE", "LIBRE"];
}

function operationalRoleOrder(role) {
  const roles = plannerRoleOrderList.length ? plannerRoleOrderList : ["Logistico", "Referente", "Operador", "Depo y Mant."];
  const index = roles.indexOf(role);
  return index === -1 ? 999 : index;
}

function getMonday(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function buildWeekDays(weekStart) {
  const labels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const keys = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  return labels.map((label, index) => {
    const date = addDays(weekStart, index);
    return {
      key: keys[index],
      label,
      date: date.getDate(),
      month: date.getMonth(),
      fullDate: date,
    };
  });
}

function formatWeekLabel(weekStart, isCurrent) {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = weekStart.toLocaleDateString("es-UY", { month: "short" });
  const endMonth = weekEnd.toLocaleDateString("es-UY", { month: "short" });
  const range = startMonth === endMonth
    ? `${capitalize(startMonth)} ${weekStart.getDate()} - ${weekEnd.getDate()}`
    : `${capitalize(startMonth)} ${weekStart.getDate()} - ${capitalize(endMonth)} ${weekEnd.getDate()}`;
  return isCurrent ? `★ SEMANA ACTUAL · ${range}` : range;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function setActiveWeek(index) {
  currentWeekIndex = index;
  days = weeks[index].days;
  people = weeks[index].people;
  elements.week.classList.toggle("current-week-selected", weeks[index].isCurrent);
  selected = {
    personIndex: Math.min(selected.personIndex, people.length - 1),
    dayIndex: Math.min(selected.dayIndex, days.length - 1),
  };
  selectedDayDetailIndex = Math.min(selectedDayDetailIndex, days.length - 1);
}

function renderWeekOptions() {
  elements.week.innerHTML = weeks
    .map((week, index) => `<option class="${week.isCurrent ? "current-week-option" : ""}" value="${index}">${week.label}</option>`)
    .join("");
  elements.week.value = String(currentWeekIndex);
}

function parseShift(raw) {
  const normalized = normalizeStatus(raw);
  if (!raw || STATUS_CONFIG[normalized]) {
    const status = STATUS_CONFIG[normalized] || STATUS_CONFIG.LIBRE;
    return {
      free: normalized === "LIBRE" || !raw,
      noSchedule: true,
      status: status.label,
      statusClass: status.className,
      activity: status.label,
      location: "Sin ubicación",
    };
  }

  const match = raw.match(/^(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s+(.+)$/);
  if (!match) {
    return { free: false, start: "", end: "", activity: raw, location: raw };
  }

  return {
    free: false,
    start: normalizeTime(match[1]),
    end: normalizeTime(match[2]),
    activity: match[3],
    location: match[3],
  };
}

function serializeShift(shift) {
  if (shift.free) return "LIBRE";
  if (!shift.start && !shift.end && STATUS_CONFIG[normalizeStatus(shift.activity)]) return normalizeStatus(shift.activity);
  if (!shift.start && !shift.end) return shift.activity || "LOGISTICA";
  return `${compactTime(shift.start)}-${compactTime(shift.end)} ${shift.activity || "LOGISTICA"}`;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeActivity(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTime(value) {
  if (!value) return "";
  const cleanValue = String(value).trim().replace(".", ":");
  const [hour, minute = "00"] = cleanValue.split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function compactTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":");
  return minute === "00" ? String(Number(hour)) : `${Number(hour)}:${minute}`;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function minutesFromTime(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function shiftHours(shift) {
  if (shift.noSchedule || !shift.start || !shift.end) return 0;
  let start = minutesFromTime(shift.start);
  let end = minutesFromTime(shift.end);
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

function getShift(personIndex, dayIndex) {
  return parseShift(people[personIndex].shifts[dayIndex]);
}

function cellKey(personIndex, dayIndex) {
  return `${personIndex}:${dayIndex}`;
}

function parseCellKey(key) {
  const [personIndex, dayIndex] = key.split(":").map(Number);
  return { personIndex, dayIndex };
}

function selectedCellList() {
  return [...selectedCells].map(parseCellKey).sort((a, b) => a.personIndex - b.personIndex || a.dayIndex - b.dayIndex);
}

function isEditingCell(personIndex, dayIndex) {
  return editingCell?.personIndex === personIndex && editingCell?.dayIndex === dayIndex;
}

function isEmptyShift(shift) {
  return shift.noSchedule && normalizeStatus(shift.status) === "VACIO";
}

function aiNormalizeName(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

function findPlannerPersonIndexByName(name) {
  const target = aiNormalizeName(name);
  if (!target) return -1;
  return people.findIndex((person) => {
    const personName = aiNormalizeName(person.name);
    return personName === target || personName.includes(target) || target.includes(personName);
  });
}

function formatAiDate(day) {
  return `${day.label} ${day.date}`;
}

function eventAssignments(event) {
  return Array.isArray(event?.staff_assignments) ? event.staff_assignments : [];
}

async function parentAppApi(path) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error || "No se pudo leer datos del sistema madre");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadParentEventsForDay(day) {
  const date = inputDateValue(day.fullDate);
  return parentAppApi(`/api/events?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
}

function buildAiSuggestion({ event, assignment, dayIndex }) {
  const personIndex = findPlannerPersonIndexByName(assignment.person_name);
  const start = normalizeTime(event.start_time || "");
  const end = normalizeTime(event.end_time || "");
  const place = normalizeActivity(event.place || event.name || "OPERACION");
  const existing = personIndex >= 0 ? getShift(personIndex, dayIndex) : null;
  const hasExisting = existing ? !isEmptyShift(existing) : false;
  const existingLabel = existing?.noSchedule
    ? existing.status
    : existing
      ? `${compactTime(existing.start)}-${compactTime(existing.end)} ${existing.activity}`
      : "";

  return {
    id: `${event.id}-${assignment.id || assignment.person_name}-${dayIndex}`,
    dayIndex,
    eventId: event.id,
    eventName: event.name || "Evento",
    eventPlace: event.place || "",
    personIndex,
    personName: assignment.person_name || "Sin persona",
    role: assignment.role || "",
    draftStart: start,
    draftEnd: end,
    draftActivity: place,
    existingLabel,
    hasExisting,
    status: personIndex >= 0 ? "pending" : "unmatched",
  };
}

function suggestionStatusLabel(suggestion) {
  if (suggestion.status === "applied") return "Aplicada";
  if (suggestion.status === "discarded") return "Descartada";
  if (suggestion.status === "unmatched") return "Sin persona en plan";
  if (suggestion.hasExisting) return "Revisa conflicto";
  return "Lista para aplicar";
}

function renderAiPanel() {
  if (!elements.aiSuggestionTitle || !elements.aiSuggestionsList) return;
  const day = aiSuggestionsDayIndex == null ? null : days[aiSuggestionsDayIndex];
  elements.aiSuggestionTitle.textContent = day ? `IA · ${formatAiDate(day)}` : "Elegí un día";

  if (aiSuggestionsLoading) {
    elements.aiSuggestionMeta.textContent = "Buscando asignaciones de Operación...";
    elements.aiSuggestionsList.innerHTML = `<div class="ai-empty-state">Cargando sugerencias del sistema madre.</div>`;
    return;
  }

  if (aiSuggestionsError) {
    elements.aiSuggestionMeta.textContent = "No se pudieron traer sugerencias.";
    elements.aiSuggestionsList.innerHTML = `<div class="ai-empty-state error">${escapeHtml(aiSuggestionsError)}</div>`;
    return;
  }

  if (!day) {
    elements.aiSuggestionMeta.textContent = "Usá la varita del encabezado para buscar asignaciones.";
    elements.aiSuggestionsList.innerHTML = `<div class="ai-empty-state">Las sugerencias se muestran por día, antes de aplicarse.</div>`;
    return;
  }

  const pendingCount = aiSuggestions.filter((suggestion) => suggestion.status === "pending").length;
  elements.aiSuggestionMeta.textContent = `${aiSuggestions.length} sugerencias encontradas · ${pendingCount} pendientes`;

  if (!aiSuggestions.length) {
    elements.aiSuggestionsList.innerHTML = `<div class="ai-empty-state">No encontramos personas asignadas en Operación para este día.</div>`;
    return;
  }

  elements.aiSuggestionsList.innerHTML = aiSuggestions
    .map((suggestion) => {
      const disabled = suggestion.status !== "pending";
      const statusClass = suggestion.hasExisting ? "warning" : suggestion.status;
      const existing = suggestion.hasExisting
        ? `<p class="ai-existing">Actual: ${escapeHtml(suggestion.existingLabel)}</p>`
        : "";
      return `<article class="ai-suggestion-card ${statusClass}" data-ai-suggestion="${escapeAttr(suggestion.id)}">
        <div class="ai-suggestion-top">
          <div>
            <strong>${escapeHtml(suggestion.personName)}</strong>
            <span>${escapeHtml(suggestion.role || "Operación")}</span>
          </div>
          <em>${suggestionStatusLabel(suggestion)}</em>
        </div>
        <div class="ai-suggestion-fields">
          <label>
            Entrada
            <input class="ai-suggestion-start" type="text" inputmode="numeric" maxlength="5" value="${escapeAttr(compactTime(suggestion.draftStart))}" ${disabled ? "disabled" : ""} />
          </label>
          <label>
            Salida
            <input class="ai-suggestion-end" type="text" inputmode="numeric" maxlength="5" value="${escapeAttr(compactTime(suggestion.draftEnd))}" ${disabled ? "disabled" : ""} />
          </label>
          <label class="ai-suggestion-activity-field">
            Texto
            <input class="ai-suggestion-activity" type="text" value="${escapeAttr(suggestion.draftActivity)}" ${disabled ? "disabled" : ""} />
          </label>
        </div>
        <div class="ai-suggestion-source">
          <span>Base: Operación</span>
          <span>${escapeHtml(suggestion.eventName)}</span>
          <span>${escapeHtml(suggestion.eventPlace || suggestion.draftActivity)}</span>
        </div>
        ${existing}
        <div class="ai-suggestion-actions">
          <button class="ghost-button small" type="button" data-ai-action="discard" ${disabled ? "disabled" : ""}>No</button>
          <button class="primary-button small" type="button" data-ai-action="apply" ${disabled || suggestion.personIndex < 0 ? "disabled" : ""}>Sí</button>
        </div>
      </article>`;
    })
    .join("");
}

async function suggestDayWithAi(dayIndex) {
  aiSuggestionsDayIndex = dayIndex;
  aiSuggestions = [];
  aiSuggestionsError = "";
  aiSuggestionsLoading = true;
  setSideMode("ai", "ia");
  renderAiPanel();
  try {
    const day = days[dayIndex];
    const events = await loadParentEventsForDay(day);
    const suggestions = [];
    events.forEach((event) => {
      eventAssignments(event)
        .filter((assignment) => String(assignment?.phase || "").toLowerCase() === "evento" && assignment.person_name && assignment.person_name !== "X")
        .forEach((assignment) => {
          suggestions.push(buildAiSuggestion({ event, assignment, dayIndex }));
        });
    });
    aiSuggestions = suggestions;
    aiSuggestionsError = "";
    showToast(suggestions.length ? `${suggestions.length} sugerencias listas para revisar` : "Sin sugerencias para ese día");
  } catch (error) {
    aiSuggestions = [];
    aiSuggestionsError = error?.status === 401 || error?.status === 403
      ? "Tu sesión del sistema madre no tiene acceso a los eventos."
      : (error?.message || "No se pudieron leer los eventos del sistema madre.");
    showToast("No se pudieron generar sugerencias");
  } finally {
    aiSuggestionsLoading = false;
    renderAiPanel();
  }
}

function updateAiSuggestionDraft(card) {
  const suggestion = aiSuggestions.find((item) => item.id === card?.dataset.aiSuggestion);
  if (!suggestion || suggestion.status !== "pending") return;
  suggestion.draftStart = normalizeTime(card.querySelector(".ai-suggestion-start")?.value || "");
  suggestion.draftEnd = normalizeTime(card.querySelector(".ai-suggestion-end")?.value || "");
  suggestion.draftActivity = normalizeActivity(card.querySelector(".ai-suggestion-activity")?.value || "");
}

function applyAiSuggestion(suggestion) {
  if (!suggestion || suggestion.personIndex < 0 || suggestion.status !== "pending") return;
  const before = people[suggestion.personIndex].shifts[suggestion.dayIndex];
  const after = serializeShift({
    free: false,
    start: suggestion.draftStart,
    end: suggestion.draftEnd,
    activity: normalizeActivity(suggestion.draftActivity || suggestion.eventPlace || suggestion.eventName || "OPERACION"),
  });
  pushUndo([{ personIndex: suggestion.personIndex, dayIndex: suggestion.dayIndex, before, after }], "sugerencia IA");
  people[suggestion.personIndex].shifts[suggestion.dayIndex] = after;
  selected = { personIndex: suggestion.personIndex, dayIndex: suggestion.dayIndex };
  setSingleSelectedCell(suggestion.personIndex, suggestion.dayIndex);
  suggestion.status = "applied";
  saveWeeks();
  render();
  setSideMode("ai", "ia");
  showToast("Sugerencia aplicada");
}

function handleAiSuggestionClick(event) {
  const actionButton = event.target.closest("[data-ai-action]");
  if (!actionButton) return;
  const card = actionButton.closest("[data-ai-suggestion]");
  updateAiSuggestionDraft(card);
  const suggestion = aiSuggestions.find((item) => item.id === card?.dataset.aiSuggestion);
  if (!suggestion) return;
  if (actionButton.dataset.aiAction === "discard") {
    suggestion.status = "discarded";
    renderAiPanel();
    showToast("Sugerencia descartada");
    return;
  }
  if (actionButton.dataset.aiAction === "apply") {
    applyAiSuggestion(suggestion);
  }
}

function setSingleSelectedCell(personIndex, dayIndex) {
  selectedCells = new Set([cellKey(personIndex, dayIndex)]);
  selectionAnchor = { personIndex, dayIndex };
}

function selectContiguousDays(personIndex, anchorDayIndex, targetDayIndex) {
  selectDayRange(personIndex, anchorDayIndex, targetDayIndex);
  selectionAnchor = { personIndex, dayIndex: anchorDayIndex };
}

function extendHorizontalSelection(dayDelta) {
  const nextDayIndex = Math.min(Math.max(selected.dayIndex + dayDelta, 0), days.length - 1);
  const anchor = selectionAnchor?.personIndex === selected.personIndex ? selectionAnchor : selected;
  selected = { personIndex: selected.personIndex, dayIndex: nextDayIndex };
  selectContiguousDays(selected.personIndex, anchor.dayIndex, nextDayIndex);
  render();
  setSideMode("person", "operador");
  focusSelectedButton();
}

function shiftSelectCell(personIndex, dayIndex) {
  const anchor = selectionAnchor?.personIndex === personIndex ? selectionAnchor : selected;
  if (anchor.personIndex !== personIndex) {
    setSingleSelectedCell(personIndex, dayIndex);
    return;
  }
  selectContiguousDays(personIndex, anchor.dayIndex, dayIndex);
}

function selectDayRange(personIndex, startDayIndex, endDayIndex) {
  const from = Math.min(startDayIndex, endDayIndex);
  const to = Math.max(startDayIndex, endDayIndex);
  selectedCells = new Set();
  for (let dayIndex = from; dayIndex <= to; dayIndex += 1) {
    selectedCells.add(cellKey(personIndex, dayIndex));
  }
}

function contextCells() {
  if (!contextTarget) return [];
  return selectedCells.has(cellKey(contextTarget.personIndex, contextTarget.dayIndex)) ? selectedCellList() : [contextTarget];
}

function pushUndo(changes, label = "Cambio") {
  const effectiveChanges = changes.filter((change) => change.before !== change.after);
  if (!effectiveChanges.length) return;
  undoStack.push({ label, changes: effectiveChanges });
  if (undoStack.length > 50) undoStack = undoStack.slice(-50);
  redoStack = [];
}

function applyHistoryEntry(entry, direction) {
  entry.changes.forEach((change) => {
    if (people[change.personIndex]) {
      people[change.personIndex].shifts[change.dayIndex] = direction === "redo" ? change.after : change.before;
    }
  });
  const first = entry.changes[0];
  selected = { personIndex: first.personIndex, dayIndex: first.dayIndex };
  setSingleSelectedCell(selected.personIndex, selected.dayIndex);
  saveWeeks();
  render();
  setSideMode("person", "operador");
  focusSelectedButton();
}

function undoLastShiftChange() {
  const entry = undoStack.pop();
  if (!entry) {
    showToast("No hay cambios para deshacer");
    return;
  }
  redoStack.push(entry);
  applyHistoryEntry(entry, "undo");
  showToast(`Deshecho: ${entry.label}`);
}

function redoLastShiftChange() {
  const entry = redoStack.pop();
  if (!entry) {
    showToast("No hay cambios para rehacer");
    return;
  }
  undoStack.push(entry);
  applyHistoryEntry(entry, "redo");
  showToast(`Rehecho: ${entry.label}`);
}

function clearSelectedShifts() {
  if (!selectedCells.size) return;
  const cells = selectedCellList();
  const changes = cells.map(({ personIndex, dayIndex }) => ({
    personIndex,
    dayIndex,
    before: people[personIndex].shifts[dayIndex],
    after: "VACIO",
  }));
  pushUndo(changes, "borrado");
  const effectiveChanges = changes.filter((change) => change.before !== change.after);
  if (!effectiveChanges.length) {
    showToast("Los turnos seleccionados ya estaban vacíos");
    return;
  }
  effectiveChanges.forEach(({ personIndex, dayIndex }) => {
    people[personIndex].shifts[dayIndex] = "VACIO";
  });
  saveWeeks();
  render();
  setSideMode("person", "operador");
  focusSelectedButton();
  showToast(effectiveChanges.length > 1 ? `${effectiveChanges.length} turnos vaciados` : "Turno vaciado");
}

function flashPastedCells(cells) {
  window.clearTimeout(pastedCellsTimer);
  pastedCells = new Set(cells.map((cell) => cellKey(cell.personIndex, cell.dayIndex)));
  render();
  pastedCellsTimer = window.setTimeout(() => {
    pastedCells = new Set();
    render();
  }, 2200);
}

function render() {
  updateExportSelectors();
  renderHead();
  renderBody();
  updateOperatorDetail();
  updateDaySummary();
  renderMobileDayPlanner();
  updateBulkEditor();
  renderAiPanel();
}

function updateExportSelectors() {
  const currentFrom = Number(elements.summaryFrom.value || 0);
  const currentTo = Number(elements.summaryTo.value || days.length - 1);
  const options = days.map((day, index) => `<option value="${index}">${day.label} ${day.date}</option>`).join("");

  elements.summaryFrom.innerHTML = options;
  elements.summaryTo.innerHTML = options;
  elements.summaryFrom.value = String(Math.min(currentFrom, days.length - 1));
  elements.summaryTo.value = String(Math.min(Math.max(currentTo, currentFrom), days.length - 1));
}

function renderHead() {
  elements.head.innerHTML = `
    <tr>
      <th class="month-head">
        <button class="month-head-button" type="button" data-bulk-edit="week">${weeks[currentWeekIndex].month}</button>
      </th>
      ${days.map((day, index) => {
        const publishedClass = publishedPlanDates.has(inputDateValue(day.fullDate)) ? " published-day" : "";
        return `<th class="day-head${publishedClass}">
        <div class="day-head-inner">
          <button class="day-head-button" type="button" data-day-detail="${index}">
            ${day.label}<span>${day.date}</span>
          </button>
          <button class="ai-day-button" type="button" data-ai-day="${index}" title="Sugerir con IA" aria-label="Sugerir con IA para ${day.label} ${day.date}">✦</button>
        </div>
      </th>`;
      }).join("")}
    </tr>
  `;
}

function renderBody() {
  const visiblePeople = getVisiblePeople();
  elements.body.innerHTML = visiblePeople
    .map(({ person, personIndex }, visibleIndex) => {
      const previousPerson = visiblePeople[visibleIndex - 1]?.person;
      const rowClass = previousPerson && previousPerson.role !== person.role ? "group-break" : "";
      const cells = days
        .map((day, dayIndex) => {
          const shift = getShift(personIndex, dayIndex);
          const selectedClass = selectedCells.has(cellKey(personIndex, dayIndex)) ? "selected" : "";
          const multiSelectedClass = selectedCells.has(cellKey(personIndex, dayIndex)) && selectedCells.size > 1 ? "multi-selected" : "";
          const pastedClass = pastedCells.has(cellKey(personIndex, dayIndex)) ? "pasted" : "";
          const copiedClass = copiedCellsWeekIndex === currentWeekIndex && copiedCells.has(cellKey(personIndex, dayIndex)) ? "copied" : "";
          const regularizedKey = `${person.name}|${inputDateValue(day.fullDate)}`;
          const regularizedClass = regularizedTurnKeys.has(regularizedKey) ? "regularized" : "";
          const regularizedTitle = regularizedClass ? regularizedTooltip(regularizedTurnOrigins.get(regularizedKey)) : "";
          const classes = ["shift-cell", shift.noSchedule ? shift.statusClass : "", selectedClass, multiSelectedClass, copiedClass, pastedClass, regularizedClass].filter(Boolean).join(" ");

          if ((!shift.noSchedule || isEmptyShift(shift)) && isEditingCell(personIndex, dayIndex)) {
            return `<td class="${classes} editing">
              <div class="inline-shift-editor" data-person="${personIndex}" data-day="${dayIndex}">
                <div class="inline-time-row">
                  <input class="inline-start" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${isEmptyShift(shift) ? "" : shift.start || ""}" aria-label="Entrada" />
                  <input class="inline-end" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="${isEmptyShift(shift) ? "" : shift.end || ""}" aria-label="Salida" />
                </div>
                <input class="inline-activity" type="text" value="${isEmptyShift(shift) ? "" : escapeAttr(shift.activity)}" aria-label="Actividad / ubicación" />
              </div>
            </td>`;
          }

          if (shift.noSchedule) {
            return `<td class="${classes}">
              <button class="shift-button status-only" type="button" data-person="${personIndex}" data-day="${dayIndex}" title="${regularizedTitle}">${shift.status}</button>
            </td>`;
          }

          return `<td class="${classes}">
            <button class="shift-button" type="button" data-person="${personIndex}" data-day="${dayIndex}" title="${regularizedTitle}">
              <span class="time-row"><span>${compactTime(shift.start)}</span><span>${compactTime(shift.end)}</span></span>
              <span class="activity-row" title="${regularizedTitle || shift.activity}">${shift.activity}</span>
            </button>
          </td>`;
        })
        .join("");

      return `<tr class="${rowClass}">
        <th class="person-cell">
          <button class="person-button" type="button" data-person-detail="${personIndex}">${person.name}</button>
        </th>
        ${cells}
      </tr>`;
    })
    .join("");
}

function getVisiblePeople() {
  const term = elements.search.value;

  return people
    .map((person, personIndex) => ({ person, personIndex }))
    .filter(({ person }) => {
      const searchable = `${person.name} ${person.role || ""} ${person.operatorType || ""}`;
      return matchesMultiSearchQuery(searchable, term, normalizeSearchText) && plannerVisibleRoles.has(person.role);
    });
}

function updateOperatorDetail() {
  const person = people[selected.personIndex];
  if (!person) {
    elements.operatorAvatar.textContent = "--";
    elements.operatorName.textContent = "";
    elements.operatorRole.textContent = "";
    elements.operatorShiftCount.textContent = "-";
    elements.operatorHours.textContent = "-";
    elements.operatorPendingHours.textContent = "-";
    elements.operatorWeek.innerHTML = "";
    return;
  }

  const weekItems = person.shifts
    .map((_, dayIndex) => {
      const shift = getShift(selected.personIndex, dayIndex);
      const currentClass = selected.dayIndex === dayIndex ? "current" : "";
      const time = shift.noSchedule ? shift.status : `${shift.start} - ${shift.end}`;
      return `<article class="operator-week-item ${currentClass}">
        <strong>${days[dayIndex].label} ${days[dayIndex].date} · ${time}</strong>
        <span>${shift.activity}</span>
      </article>`;
    })
    .join("");

  elements.operatorAvatar.textContent = person.name.slice(0, 2).toUpperCase();
  elements.operatorName.textContent = person.name;
  elements.operatorRole.textContent = person.role;
  elements.operatorShiftCount.textContent = "-";
  elements.operatorHours.textContent = "-";
  elements.operatorPendingHours.textContent = "-";
  renderOperatorOperationStats(person, [], 0, false);
  elements.operatorWeek.innerHTML = weekItems;
  updateOperatorMonthDetail(person);
}

function monthRangeForCurrentWeek() {
  const baseDate = weeks[currentWeekIndex]?.days?.[0]?.fullDate || new Date();
  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  return {
    key: `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}`,
    from: inputDateValue(firstDay),
    to: inputDateValue(lastDay),
    label: firstDay.toLocaleDateString("es-UY", { month: "long", year: "numeric" }),
  };
}

function updateOperatorMonthDetail(person) {
  if (!person) return;
  if (!backendPlannerEnabled) {
    renderOperatorMonthFallback(person);
    return;
  }
  const range = monthRangeForCurrentWeek();
  const cache = monthlyPersonCache.get(range.key);
  if (!cache) {
    elements.operatorShiftCount.textContent = "-";
    elements.operatorHours.textContent = "-";
    elements.operatorPendingHours.textContent = "-";
    renderOperatorOperationStats(person, [], 0, false);
    loadMonthlyPersonData(range).catch(() => renderOperatorMonthFallback(person));
    return;
  }
  renderOperatorMonthSummary(person, range, cache);
}

async function loadMonthlyPersonData(range = monthRangeForCurrentWeek()) {
  if (!backendPlannerEnabled) return;
  if (monthlyPersonCache.has(range.key) || monthlyPersonLoadingKey === range.key) return;
  monthlyPersonLoadingKey = range.key;
  try {
    const [jornales, operaciones] = await Promise.all([
      plannerApi(`/jornales?desde=${encodeURIComponent(range.from)}&hasta=${encodeURIComponent(range.to)}`),
      plannerApi("/operaciones"),
    ]);
    monthlyPersonCache.set(range.key, {
      jornales,
      operaciones,
    });
  } finally {
    monthlyPersonLoadingKey = "";
  }
  updateOperatorMonthDetail(people[selected.personIndex]);
}

function renderOperatorMonthSummary(person, range, cache) {
  const personName = normalizeSearchText(person.name);
  const personJornals = cache.jornales.filter((jornal) => normalizeSearchText(jornal.persona) === personName);
  const personOperations = operationsForPersonMonth(person, range, cache.operaciones || []);
  const workedDays = personJornals.filter((jornal) => Number(jornal.horas_trabajadas || 0) > 0).length;
  const workedHours = sumNumbers(personJornals.map((jornal) => jornal.horas_trabajadas));
  renderOperatorMonthStats(workedDays, workedHours);
  renderOperatorOperationStats(person, personOperations, workedHours, true);
}

function renderOperatorMonthFallback(person) {
  const workedDays = person.shifts.filter((_, dayIndex) => !getShift(selected.personIndex, dayIndex).noSchedule).length;
  const workedHours = sumNumbers(person.shifts.map((_, dayIndex) => shiftHours(getShift(selected.personIndex, dayIndex))));
  renderOperatorMonthStats(workedDays, workedHours);
  renderOperatorOperationStats(person, [], workedHours, false);
}

function renderOperatorMonthStats(workedDays, workedHours) {
  const person = people[selected.personIndex];
  const pendingHours = Number(person?.agreedHours || 190) - Number(workedHours || 0);
  elements.operatorShiftCount.textContent = workedDays;
  elements.operatorHours.textContent = `${formatHours(workedHours)} h`;
  elements.operatorPendingHours.textContent = `${formatHours(pendingHours)} h`;
}

function isPlannerOperator(person) {
  return normalizeSearchText(person?.role || person?.operatorType || "") === "operador";
}

function operationsForPersonMonth(person, range, operations) {
  const personName = normalizeSearchText(person.name);
  const from = parseInputDate(range.from);
  const to = parseInputDate(range.to);
  return operations.filter((operation) => {
    const operationDate = parseOperationDate(operation);
    return normalizeSearchText(operation.persona || operation.operator || "") === personName && dateInRange(operationDate, from, to);
  });
}

function parseOperationDate(operation) {
  if (operation.fecha_hora) return parseDbDateTime(operation.fecha_hora);
  if (operation.dateObj) return operation.dateObj;
  return parseLabeledDate(operation.date || operation.fecha || "");
}

function renderOperatorOperationStats(person, operations, workedHours, loaded) {
  const visible = isPlannerOperator(person);
  elements.operatorOperationsCountCard?.classList.toggle("hidden", !visible);
  elements.operatorOperationsTotalCard?.classList.toggle("hidden", !visible);
  if (!loaded) {
    if (visible) {
      elements.operatorOperationsCount.textContent = "-";
      elements.operatorOperationsTotal.textContent = "-";
    }
    elements.operatorBaseSalary.textContent = "-";
    elements.operatorMonthTotal.textContent = "-";
    return;
  }
  const operationTotal = visible ? sumNumbers(operations.map((operation) => operation.valor ?? operation.value ?? operation.amount)) : 0;
  const hourTotal = Number(workedHours || 0) * Number(person.hourlyRate || 0);
  const baseSalary = Number(person.hourlyRate || 0) * Number(person.agreedHours || 190);
  if (visible) {
    elements.operatorOperationsCount.textContent = operations.length;
    elements.operatorOperationsTotal.textContent = formatMoney(operationTotal);
  }
  elements.operatorBaseSalary.textContent = formatMoney(baseSalary);
  elements.operatorMonthTotal.textContent = formatMoney(hourTotal + operationTotal);
}

function sumNumbers(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function formatHours(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString("es-UY", { maximumFractionDigits: 1 });
}

function formatMoney(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-UY")}`;
}

function updateDaySummary() {
  const day = days[selectedDayDetailIndex];
  const { items, total } = daySummaryData(selectedDayDetailIndex);

  elements.dayAvatar.textContent = day.label.slice(0, 1).toUpperCase();
  elements.daySummaryTitle.textContent = `${day.label} ${day.date}`;
  elements.daySummaryCount.textContent = `${total} personas planificadas`;
  updatePublishedDayStatus();
  elements.daySummaryList.innerHTML = items.length
    ? items
      .map((item) => `<article class="day-summary-item">
        <strong class="day-summary-people">${item.people.join(", ")}</strong>
        <span class="day-summary-shift">${item.time} · ${item.activity}</span>
      </article>`)
      .join("")
    : `<article class="day-summary-item"><strong>Sin turnos planificados</strong><span>No hay horarios cargados para este día.</span></article>`;
}

function renderMobileDayPlanner() {
  if (!elements.mobileDayPlanner || !days.length || !people.length) return;
  const day = days[selectedDayDetailIndex] || days[selected.dayIndex] || days[0];
  const { total } = daySummaryData(selectedDayDetailIndex);
  const dateLabel = day.fullDate.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  elements.mobileDayTitle.textContent = capitalize(dateLabel);
  elements.mobileDayMeta.textContent = `${total} personas planificadas`;
  updatePublishedDayStatus();

  const visiblePeople = getVisiblePeople();
  if (!visiblePeople.length) {
    elements.mobileDayList.innerHTML = `<article class="mobile-empty-state">No hay personas para ese filtro.</article>`;
    return;
  }

  const roleGroups = [];
  visiblePeople.forEach((item) => {
    const role = item.person.role || "Sin rol";
    let group = roleGroups.find((candidate) => candidate.role === role);
    if (!group) {
      group = { role, people: [] };
      roleGroups.push(group);
    }
    group.people.push(item);
  });

  elements.mobileDayList.innerHTML = roleGroups
    .map((group) => `<section class="mobile-role-group">
      <h3>${group.role}</h3>
      <div class="mobile-role-list">
        ${group.people.map(({ person, personIndex }) => mobileShiftCardHtml(person, personIndex, selectedDayDetailIndex)).join("")}
      </div>
    </section>`)
    .join("");
}

function mobileShiftCardHtml(person, personIndex, dayIndex) {
  const shift = getShift(personIndex, dayIndex);
  const key = cellKey(personIndex, dayIndex);
  const selectedClass = selectedCells.has(key) ? "selected" : "";
  const copiedClass = copiedCellsWeekIndex === currentWeekIndex && copiedCells.has(key) ? "copied" : "";
  const pastedClass = pastedCells.has(key) ? "pasted" : "";
  const regularizedKey = `${person.name}|${inputDateValue(days[dayIndex].fullDate)}`;
  const regularizedClass = regularizedTurnKeys.has(regularizedKey) ? "regularized" : "";
  const statusClass = shift.noSchedule ? shift.statusClass : "normal";
  const time = shift.noSchedule ? shift.status : `${shift.start} - ${shift.end}`;
  const activity = shift.noSchedule ? mobileNoScheduleSubtitle(shift.status) : shift.activity || "LOGISTICA";
  const regularizedTitle = regularizedClass ? regularizedTooltip(regularizedTurnOrigins.get(regularizedKey)) : "";
  return `<button class="mobile-shift-card ${statusClass} ${selectedClass} ${copiedClass} ${pastedClass} ${regularizedClass}" type="button" data-mobile-person="${personIndex}" data-mobile-day="${dayIndex}" title="${regularizedTitle}">
    <span class="mobile-shift-person">${person.name}</span>
    <span class="mobile-shift-time">${time}</span>
    <span class="mobile-shift-activity">${activity}</span>
    <span class="mobile-shift-more" aria-hidden="true">...</span>
  </button>`;
}

function mobileNoScheduleSubtitle(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "VACIO") return "Sin horario cargado";
  if (normalized === "LIBRE") return "Sin horario";
  return "Estado del día";
}

function setMobileDay(weekIndex, dayIndex) {
  if (!weeks[weekIndex] || !weeks[weekIndex].days[dayIndex]) return false;
  setActiveWeek(weekIndex);
  elements.week.value = String(weekIndex);
  selectedDayDetailIndex = dayIndex;
  selected.dayIndex = dayIndex;
  selected.personIndex = Math.min(selected.personIndex, people.length - 1);
  setSingleSelectedCell(selected.personIndex, selected.dayIndex);
  loadMonthlyPersonData().catch(() => {});
  render();
  return true;
}

function moveMobileDay(delta) {
  const nextGlobalIndex = currentWeekIndex * 7 + selectedDayDetailIndex + delta;
  if (nextGlobalIndex < 0 || nextGlobalIndex >= weeks.length * 7) {
    showToast(delta < 0 ? "No hay días anteriores en la vista" : "No hay días posteriores en la vista");
    return;
  }
  const weekIndex = Math.floor(nextGlobalIndex / 7);
  const dayIndex = nextGlobalIndex % 7;
  setMobileDay(weekIndex, dayIndex);
}

function setMobileToday() {
  const todayIndex = (new Date().getDay() + 6) % 7;
  setMobileDay(CURRENT_WEEK_OFFSET, todayIndex);
  showToast("Día actual seleccionado");
}

function selectedMobileTarget() {
  const sheet = elements.mobileShiftSheet;
  if (!sheet) return null;
  const personIndex = Number(sheet.dataset.personIndex);
  const dayIndex = Number(sheet.dataset.dayIndex);
  if (!people[personIndex] || !days[dayIndex]) return null;
  return { personIndex, dayIndex };
}

function openMobileSheet(personIndex, dayIndex, mode = "edit") {
  const person = people[personIndex];
  const day = days[dayIndex];
  if (!person || !day || !elements.mobileShiftSheet) return;
  contextTarget = { personIndex, dayIndex };
  selected = { personIndex, dayIndex };
  selectedDayDetailIndex = dayIndex;
  setSingleSelectedCell(personIndex, dayIndex);
  elements.mobileShiftSheet.dataset.personIndex = String(personIndex);
  elements.mobileShiftSheet.dataset.dayIndex = String(dayIndex);
  elements.mobileShiftSheet.dataset.mode = mode;
  elements.mobileSheetTitle.textContent = `${person.name} · ${day.label} ${day.date}`;
  elements.mobileSheetEyebrow.textContent = mode === "actions" ? "Acciones rápidas" : "Editar turno";
  elements.mobileSheetActions.querySelector('[data-mobile-action="paste"]').disabled = !copiedShift;
  fillMobileShiftForm(personIndex, dayIndex);
  elements.mobileSheetBackdrop.hidden = false;
  elements.mobileShiftSheet.hidden = false;
  document.body.classList.add("mobile-sheet-open");
  renderMobileDayPlanner();
}

function openMobileShiftEditor(personIndex, dayIndex) {
  openMobileSheet(personIndex, dayIndex, "edit");
  window.setTimeout(() => elements.mobileShiftStatus?.focus(), 0);
}

function openMobileQuickActions(personIndex, dayIndex) {
  openMobileSheet(personIndex, dayIndex, "actions");
}

function closeMobileSheet() {
  elements.mobileSheetBackdrop.hidden = true;
  elements.mobileShiftSheet.hidden = true;
  document.body.classList.remove("mobile-sheet-open");
}

function fillMobileShiftForm(personIndex, dayIndex) {
  const shift = getShift(personIndex, dayIndex);
  if (shift.noSchedule) {
    elements.mobileShiftStatus.value = normalizeStatus(shift.status);
    elements.mobileShiftStart.value = "";
    elements.mobileShiftEnd.value = "";
    elements.mobileShiftActivity.value = "";
  } else {
    elements.mobileShiftStatus.value = "NORMAL";
    elements.mobileShiftStart.value = compactTime(shift.start);
    elements.mobileShiftEnd.value = compactTime(shift.end);
    elements.mobileShiftActivity.value = shift.activity || "LOGISTICA";
  }
  syncMobileSheetStatusFields();
}

function syncMobileSheetStatusFields() {
  const isNormal = elements.mobileShiftStatus.value === "NORMAL";
  [elements.mobileShiftStart, elements.mobileShiftEnd, elements.mobileShiftActivity].forEach((input) => {
    input.disabled = !isNormal;
  });
}

function saveMobileShiftEdit(event) {
  event.preventDefault();
  const target = selectedMobileTarget();
  if (!target) return;
  const status = elements.mobileShiftStatus.value;
  const { personIndex, dayIndex } = target;
  const before = people[personIndex].shifts[dayIndex];
  let after = status;

  if (status === "NORMAL") {
    const start = normalizeTime(elements.mobileShiftStart.value);
    const end = normalizeTime(elements.mobileShiftEnd.value);
    const activity = normalizeActivity(elements.mobileShiftActivity.value || "LOGISTICA");
    if (!start || !end) {
      showToast("Completá entrada y salida");
      return;
    }
    after = serializeShift({ free: false, start, end, activity });
  }

  pushUndo([{ personIndex, dayIndex, before, after }], "edición mobile");
  people[personIndex].shifts[dayIndex] = after;
  selected = { personIndex, dayIndex };
  selectedDayDetailIndex = dayIndex;
  setSingleSelectedCell(personIndex, dayIndex);
  saveWeeks();
  closeMobileSheet();
  render();
  showToast("Turno actualizado");
}

function handleMobileAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const target = selectedMobileTarget();
  if (!target) return;
  const { personIndex, dayIndex } = target;
  contextTarget = { personIndex, dayIndex };
  selected = { personIndex, dayIndex };
  selectedDayDetailIndex = dayIndex;
  setSingleSelectedCell(personIndex, dayIndex);

  if (button.dataset.mobileStatus) {
    closeMobileSheet();
    applyContextShiftType(button.dataset.mobileStatus);
    return;
  }

  if (button.dataset.mobileAction === "normal") {
    closeMobileSheet();
    applyContextShiftType("normal");
    return;
  }

  if (button.dataset.mobileAction === "copy") {
    copyContextShift();
    closeMobileSheet();
    return;
  }

  if (button.dataset.mobileAction === "paste") {
    pasteContextShift({ personIndex, dayIndex });
    closeMobileSheet();
    return;
  }

  if (button.dataset.mobileAction === "edit") {
    openMobileShiftEditor(personIndex, dayIndex);
  }
}

function mobileCardTarget(event) {
  const card = event.target.closest(".mobile-shift-card");
  if (!card) return null;
  return {
    personIndex: Number(card.dataset.mobilePerson),
    dayIndex: Number(card.dataset.mobileDay),
  };
}

function updateBulkEditor() {
  if (!elements.bulkEditForm) return;
  elements.bulkWeekTitle.textContent = `${weeks[currentWeekIndex].month} · ${weeks[currentWeekIndex].label.replace("★ SEMANA ACTUAL · ", "")}`;

  const selectedRoles = new Set([...elements.bulkRoleInput.querySelectorAll("input:checked")].map((input) => input.value));
  const roles = [...new Set(people.map((person) => person.role).filter(Boolean))];
  const fallbackRoles = selectedRoles.size ? selectedRoles : new Set(roles.slice(0, 1));
  elements.bulkRoleInput.innerHTML = roles
    .map((role) => `<label class="bulk-role-option">
      <input type="checkbox" value="${role}" ${fallbackRoles.has(role) ? "checked" : ""} />
      <span>${role}</span>
    </label>`)
    .join("");

  const selectedDays = new Set([...elements.bulkDayInputs.querySelectorAll("input:checked")].map((input) => input.value));
  const fallbackDays = selectedDays.size ? selectedDays : new Set(["0", "1", "2", "3", "4"]);
  elements.bulkDayInputs.innerHTML = days
    .map((day, index) => `<label class="bulk-day-option">
      <input type="checkbox" value="${index}" ${fallbackDays.has(String(index)) ? "checked" : ""} />
      <span>${day.label.slice(0, 3)} ${day.date}</span>
    </label>`)
    .join("");
  updateBulkPreview();
}

function selectedBulkDayIndexes() {
  return [...elements.bulkDayInputs.querySelectorAll("input:checked")].map((input) => Number(input.value));
}

function bulkTargetCells() {
  const roles = selectedBulkRoles();
  const dayIndexes = selectedBulkDayIndexes();
  return people.flatMap((person, personIndex) => {
    if (!roles.includes(person.role)) return [];
    return dayIndexes.map((dayIndex) => ({ personIndex, dayIndex }));
  });
}

function selectedBulkRoles() {
  return [...elements.bulkRoleInput.querySelectorAll("input:checked")].map((input) => input.value);
}

function updateBulkPreview() {
  if (!elements.bulkPreviewBox) return;
  const targets = bulkTargetCells();
  const roles = selectedBulkRoles();
  const roleText = roles.length ? roles.join(", ") : "sin roles";
  const dayCount = selectedBulkDayIndexes().length;
  const mode = elements.bulkFreeInput.checked ? "como LIBRE" : "con horario";
  elements.bulkPreviewBox.innerHTML = `<p>Se modificarán <strong>${targets.length}</strong> turnos de <strong>${roleText}</strong> en <strong>${dayCount}</strong> día${dayCount === 1 ? "" : "s"} ${mode}.</p>`;
  [elements.bulkStartInput, elements.bulkEndInput, elements.bulkActivityInput].forEach((input) => {
    input.disabled = elements.bulkFreeInput.checked;
  });
}

function applyBulkEdit(event) {
  event.preventDefault();
  const targets = bulkTargetCells();
  const start = normalizeTime(elements.bulkStartInput.value);
  const end = normalizeTime(elements.bulkEndInput.value);
  const activity = normalizeActivity(elements.bulkActivityInput.value);
  const markAsFree = elements.bulkFreeInput.checked;

  if (!targets.length) {
    showToast("No hay turnos para modificar con esa selección");
    return;
  }
  if (!markAsFree && (!start || !end || !activity)) {
    showToast("Completá entrada, salida y actividad / ubicación");
    return;
  }

  const after = markAsFree ? "LIBRE" : serializeShift({ free: false, start, end, activity });
  const changes = targets.map(({ personIndex, dayIndex }) => ({
    personIndex,
    dayIndex,
    before: people[personIndex].shifts[dayIndex],
    after,
  }));
  pushUndo(changes, "edición por lotes");
  changes.forEach(({ personIndex, dayIndex }) => {
    people[personIndex].shifts[dayIndex] = after;
  });
  selected = { personIndex: targets[0].personIndex, dayIndex: targets[0].dayIndex };
  setSingleSelectedCell(selected.personIndex, selected.dayIndex);
  selectionAnchor = { ...selected };
  saveWeeks();
  render();
  setSideMode("bulk", "lotes");
  flashPastedCells(targets);
  showToast(`${changes.length} turnos actualizados`);
}

function daySummaryData(dayIndex) {
  const groups = new Map();

  people.forEach((person, personIndex) => {
    const shift = getShift(personIndex, dayIndex);
    if (shift.noSchedule) return;
    const key = `${shift.start || "--"}-${shift.end || "--"}|${shift.activity}`;
    if (!groups.has(key)) {
      groups.set(key, {
        time: `${shift.start || "--"} - ${shift.end || "--"}`,
        activity: shift.activity,
        people: [],
      });
    }
    groups.get(key).people.push(person.name);
  });

  const items = [...groups.values()].sort((a, b) => a.time.localeCompare(b.time));
  const total = items.reduce((sum, item) => sum + item.people.length, 0);
  return { items, total };
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

function applyStoredPanelWidth() {
  const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  if (!stored || !elements.planShell) return;
  setPanelWidth(stored);
}

function setPanelWidth(width) {
  const maxWidth = Math.max(320, Math.min(620, window.innerWidth - 620));
  const nextWidth = Math.min(Math.max(width, 300), maxWidth);
  elements.planShell.style.setProperty("--side-panel-width", `${nextWidth}px`);
  localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(nextWidth)));
}

function initPanelResizer() {
  if (!elements.panelResizer || !elements.planShell) return;
  applyStoredPanelWidth();

  let dragging = false;

  const resizeFromPointer = (clientX) => {
    const shellRect = elements.planShell.getBoundingClientRect();
    const width = shellRect.right - clientX - 18;
    setPanelWidth(width);
  };

  elements.panelResizer.addEventListener("pointerdown", (event) => {
    dragging = true;
    elements.planShell.classList.add("resizing");
    elements.panelResizer.setPointerCapture(event.pointerId);
    resizeFromPointer(event.clientX);
  });

  elements.panelResizer.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    resizeFromPointer(event.clientX);
  });

  const stopDragging = () => {
    dragging = false;
    elements.planShell.classList.remove("resizing");
  };

  elements.panelResizer.addEventListener("pointerup", stopDragging);
  elements.panelResizer.addEventListener("pointercancel", stopDragging);

  elements.panelResizer.addEventListener("keydown", (event) => {
    const current = Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 360;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPanelWidth(current + 24);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setPanelWidth(current - 24);
    }
  });
}

function selectedSummaryRange() {
  let from = Number(elements.summaryFrom.value);
  let to = Number(elements.summaryTo.value);
  if (Number.isNaN(from)) from = 0;
  if (Number.isNaN(to)) to = days.length - 1;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function exportSummaryJpg() {
  const { from, to } = selectedSummaryRange();
  const visiblePeople = getVisiblePeople();
  const selectedDays = days.slice(from, to + 1);
  const operatorWidth = 108;
  const dayWidth = 98;
  const headerHeight = 45;
  const spacerHeight = 12;
  const rowHeight = 32;
  const groupGap = 10;
  const width = operatorWidth + selectedDays.length * dayWidth;
  const groupGaps = visiblePeople.filter(({ person }) => person.breakBefore).length * groupGap;
  const height = headerHeight + spacerHeight + visiblePeople.length * rowHeight + groupGaps;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawCell(ctx, 0, 0, operatorWidth, headerHeight, "#f7f7f7");
  ctx.fillStyle = "#05080a";
  ctx.font = "700 16px Arial";
  drawCenteredText(ctx, weeks[currentWeekIndex].month.toUpperCase(), 0, 0, operatorWidth, headerHeight, 17);

  selectedDays.forEach((day, index) => {
    const x = operatorWidth + index * dayWidth;
    drawCell(ctx, x, 0, dayWidth, headerHeight, "#f7f7f7");
    ctx.fillStyle = "#05080a";
    ctx.font = "700 12px Arial";
    drawCenteredText(ctx, day.label.toUpperCase(), x, 8, dayWidth, 12, 12);
    ctx.font = "700 14px Arial";
    drawCenteredText(ctx, String(day.date), x, 27, dayWidth, 14, 14);
  });

  drawThickLine(ctx, 0, headerHeight, width);
  let y = headerHeight + spacerHeight;

  visiblePeople.forEach(({ person, personIndex }) => {
    if (person.breakBefore) y += groupGap;

    drawCell(ctx, 0, y, operatorWidth, rowHeight, "#c9c9c9");
    ctx.fillStyle = "#05080a";
    ctx.font = "11px Arial";
    drawCenteredText(ctx, person.name.toUpperCase(), 0, y, operatorWidth, rowHeight, 11);

    selectedDays.forEach((_, localDayIndex) => {
      const dayIndex = from + localDayIndex;
      const shift = getShift(personIndex, dayIndex);
      const x = operatorWidth + localDayIndex * dayWidth;
      drawShiftCell(ctx, shift, x, y, dayWidth, rowHeight);
    });

    y += rowHeight;
  });

  const link = document.createElement("a");
  link.download = `resumen-planificacion-${weeks[currentWeekIndex].month.toLowerCase()}-${days[from].date}-${days[to].date}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.92);
  link.click();
  showToast("Resumen JPG generado");
}

function exportDayJpg() {
  const day = days[selectedDayDetailIndex];
  const { items, total } = daySummaryData(selectedDayDetailIndex);
  const width = 744;
  const padding = 32;
  const headerHeight = 124;
  const cardGap = 16;
  const minCardHeight = 108;
  const cardWidth = width - padding * 2;
  const cardHeights = (items.length ? items : [{ time: "Sin turnos planificados", activity: "", people: ["No hay horarios cargados para este día."] }]).map((item) => {
    const peopleLines = wrapCanvasText(item.people.join(", "), cardWidth - 44, "900 28px Arial");
    return Math.max(minCardHeight, 64 + peopleLines.length * 32);
  });
  const height = padding + headerHeight + cardHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, cardHeights.length - 1) * cardGap + padding;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#eef2f6";
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 8, 8, width - 16, height - 16, 12, "#ffffff", "#ccd4dd", 1.5);

  roundRect(ctx, padding, padding + 18, 96, 96, 14, "#1f2937", null, 0);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 34px Arial";
  drawCenteredText(ctx, day.label.slice(0, 1).toUpperCase(), padding, padding + 18, 96, 96, 34);

  ctx.fillStyle = "#687481";
  ctx.font = "900 24px Arial";
  ctx.fillText("RESUMEN DEL DÍA", padding + 120, padding + 34);
  ctx.fillStyle = "#151c24";
  ctx.font = "900 36px Arial";
  ctx.fillText(`${day.label} ${day.date}`, padding + 120, padding + 74);
  ctx.font = "400 34px Arial";
  ctx.fillText(`${total} personas planificadas`, padding + 120, padding + 118);

  let y = padding + headerHeight + 18;
  const exportItems = items.length ? items : [{ time: "Sin turnos", activity: "planificados", people: ["No hay horarios cargados para este día."] }];
  exportItems.forEach((item, index) => {
    const cardHeight = cardHeights[index];
    roundRect(ctx, padding, y, cardWidth, cardHeight, 12, "#fbfcfd", "#cfd8e3", 1.5);
    ctx.fillStyle = "#151c24";
    ctx.font = "900 28px Arial";
    const peopleLines = wrapCanvasText(item.people.join(", "), cardWidth - 44, "900 28px Arial");
    peopleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, padding + 22, y + 38 + lineIndex * 32);
    });
    ctx.fillStyle = "#65717f";
    ctx.font = "800 22px Arial";
    ctx.fillText(`${item.time} · ${item.activity}`, padding + 22, y + 52 + peopleLines.length * 32);
    y += cardHeight + cardGap;
  });

  const generatedAt = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const link = document.createElement("a");
  link.download = `resumen-dia-${day.label.toLowerCase()}-${day.date}-${generatedAt}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.92);
  link.click();
  showToast("Día JPG generado");
}

function wrapCanvasText(text, maxWidth, font) {
  const measureCanvas = wrapCanvasText.canvas || (wrapCanvasText.canvas = document.createElement("canvas"));
  const ctx = measureCanvas.getContext("2d");
  ctx.font = font;
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function drawShiftCell(ctx, shift, x, y, width, height) {
  if (shift.noSchedule) {
    const status = STATUS_CONFIG[shift.status] || STATUS_CONFIG.LIBRE;
    drawCell(ctx, x, y, width, height, status.color);
    ctx.fillStyle = status.text;
    ctx.font = "11px Arial";
    drawCenteredText(ctx, status.label, x, y, width, height, 11);
    return;
  }

  drawCell(ctx, x, y, width, height, "#ffffff");
  ctx.strokeStyle = "#1e2429";
  ctx.beginPath();
  ctx.moveTo(x, y + 15);
  ctx.lineTo(x + width, y + 15);
  ctx.stroke();

  if (shift.start || shift.end) {
    ctx.strokeStyle = "#1e2429";
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width / 2, y + 15);
    ctx.stroke();
    ctx.fillStyle = "#05080a";
    ctx.font = "11px Arial";
    drawCenteredText(ctx, compactTime(shift.start), x, y + 2, width / 2, 11, 11);
    drawCenteredText(ctx, compactTime(shift.end), x + width / 2, y + 2, width / 2, 11, 11);
  }

  ctx.fillStyle = "#05080a";
  ctx.font = "11px Arial";
  drawCenteredClippedText(ctx, shift.activity, x + 3, y + 19, width - 6, 11);
}

function drawCell(ctx, x, y, width, height, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#1e2429";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawThickLine(ctx, x, y, width) {
  ctx.strokeStyle = "#1e2429";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawCenteredText(ctx, text, x, y, width, height, fontSize) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + fontSize * 0.05);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawCenteredClippedText(ctx, text, x, y, maxWidth, fontSize) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(clipText(ctx, text, maxWidth), x + maxWidth / 2, y + fontSize / 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function clipText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let clipped = value;
  while (clipped.length > 0 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function openTab(tabName) {
  const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = document.querySelector(`#${tabName}Panel`);
  if (!tabButton || !panel || tabButton.hidden) return;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  tabButton.classList.add("active");
  panel.classList.add("active");
}

function setSideMode(mode, activeTab) {
  const visibleTabs = mode === "empty" ? [] : mode === "day" ? ["dia"] : mode === "bulk" ? ["lotes"] : mode === "ai" ? ["ia"] : ["operador"];
  document.querySelector(".side-panel")?.setAttribute("data-side-mode", mode);
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.hidden = !visibleTabs.includes(tab.dataset.tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  if (!visibleTabs.length) return;
  openTab(activeTab || visibleTabs[0]);
}

function focusInlineEditor() {
  window.setTimeout(() => {
    document.querySelector(".inline-shift-editor .inline-start")?.focus();
  }, 0);
}

function focusSelectedButton() {
  window.setTimeout(() => {
    document.querySelector(`.shift-button[data-person="${selected.personIndex}"][data-day="${selected.dayIndex}"]`)?.focus();
  }, 0);
}

function startInlineEdit(personIndex = selected.personIndex, dayIndex = selected.dayIndex) {
  const shift = getShift(personIndex, dayIndex);
  if (isEmptyShift(shift)) {
    const before = people[personIndex].shifts[dayIndex];
    const after = "9-18 DEPOSITO";
    pushUndo([{ personIndex, dayIndex, before, after }], "turno por defecto");
    people[personIndex].shifts[dayIndex] = after;
    saveWeeks();
  } else
  if (shift.noSchedule && normalizeStatus(shift.status) !== "VACIO") {
    showToast("Los estados se cambian con click derecho");
    return;
  }
  editingCell = { personIndex, dayIndex };
  selected = { personIndex, dayIndex };
  setSingleSelectedCell(personIndex, dayIndex);
  render();
  setSideMode("person", "operador");
  focusInlineEditor();
}

function currentInlineEditor() {
  if (!editingCell) return null;
  return document.querySelector(`.inline-shift-editor[data-person="${editingCell.personIndex}"][data-day="${editingCell.dayIndex}"]`);
}

function inlineEditorFields() {
  const editor = currentInlineEditor();
  return editor ? [...editor.querySelectorAll("input")] : [];
}

function moveInlineFocus(direction) {
  const fields = inlineEditorFields();
  const currentIndex = fields.indexOf(document.activeElement);
  if (currentIndex === -1) return false;
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0) {
    fields[0]?.focus();
    return true;
  }
  if (nextIndex >= fields.length) {
    return false;
  }
  fields[nextIndex].focus();
  fields[nextIndex].select?.();
  return true;
}

function saveInlineEdit({ moveDown = false } = {}) {
  const editor = currentInlineEditor();
  if (!editingCell || !editor) return false;
  const { personIndex, dayIndex } = editingCell;
  const shift = {
    free: false,
    start: normalizeTime(editor.querySelector(".inline-start").value),
    end: normalizeTime(editor.querySelector(".inline-end").value),
    activity: normalizeActivity(editor.querySelector(".inline-activity").value),
  };
  const before = people[personIndex].shifts[dayIndex];
  const after = !shift.start && !shift.end && !shift.activity ? "VACIO" : serializeShift(shift);
  pushUndo([{ personIndex, dayIndex, before, after }], "edición directa");
  people[personIndex].shifts[dayIndex] = after;
  editingCell = null;
  saveWeeks();
  selected = { personIndex, dayIndex };
  setSingleSelectedCell(personIndex, dayIndex);
  if (moveDown) moveSelection(1, 0, { renderAfter: false });
  render();
  setSideMode("person", "operador");
  focusSelectedButton();
  return true;
}

function cancelInlineEdit() {
  if (!editingCell) return false;
  const { personIndex, dayIndex } = editingCell;
  editingCell = null;
  selected = { personIndex, dayIndex };
  setSingleSelectedCell(personIndex, dayIndex);
  render();
  setSideMode("person", "operador");
  focusSelectedButton();
  return true;
}

function moveSelection(personDelta, dayDelta, { renderAfter = true } = {}) {
  const visible = getVisiblePeople();
  if (!visible.length) return;
  const currentVisibleIndex = visible.findIndex((item) => item.personIndex === selected.personIndex);
  const safeCurrentIndex = currentVisibleIndex === -1 ? 0 : currentVisibleIndex;
  const nextVisibleIndex = Math.min(Math.max(safeCurrentIndex + personDelta, 0), visible.length - 1);
  const nextDayIndex = Math.min(Math.max(selected.dayIndex + dayDelta, 0), days.length - 1);
  selected = {
    personIndex: visible[nextVisibleIndex].personIndex,
    dayIndex: nextDayIndex,
  };
  setSingleSelectedCell(selected.personIndex, selected.dayIndex);
  if (renderAfter) {
    render();
    setSideMode("person", "operador");
    focusSelectedButton();
  }
}

function openShiftContextMenu(event, personIndex, dayIndex) {
  event.preventDefault();
  if (editingCell) saveInlineEdit();
  contextTarget = { personIndex, dayIndex };
  selected = { personIndex, dayIndex };
  if (!selectedCells.has(cellKey(personIndex, dayIndex))) setSingleSelectedCell(personIndex, dayIndex);
  render();

  const menu = elements.contextMenu;
  elements.pasteShiftButton.disabled = !copiedShift;
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");

  const menuWidth = 190;
  const menuHeight = 260;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function closeShiftContextMenu() {
  elements.contextMenu.classList.remove("open");
  elements.contextMenu.setAttribute("aria-hidden", "true");
  contextTarget = null;
}

function applyContextShiftType(type) {
  if (!contextTarget || !type) return;

  if (type === "normal") {
    const changes = [];
    contextCells().forEach(({ personIndex, dayIndex }) => {
      const shift = getShift(personIndex, dayIndex);
      if (shift.noSchedule) {
        const before = people[personIndex].shifts[dayIndex];
        const after = "9-18 LOGISTICA";
        changes.push({ personIndex, dayIndex, before, after });
        people[personIndex].shifts[dayIndex] = after;
      }
    });
    pushUndo(changes, "jornada normal");
    saveWeeks();
    render();
    setSideMode("person", "operador");
    showToast("Cargá horario y lugar en el panel del turno");
    closeShiftContextMenu();
    return;
  }

  const changes = [];
  contextCells().forEach(({ personIndex, dayIndex }) => {
    const before = people[personIndex].shifts[dayIndex];
    changes.push({ personIndex, dayIndex, before, after: type });
    people[personIndex].shifts[dayIndex] = type;
  });
  pushUndo(changes, `estado ${type.toLowerCase()}`);
  selected = { ...contextTarget };
  saveWeeks();
  render();
  setSideMode("person", "operador");
  closeShiftContextMenu();
  showToast(`Estado aplicado: ${type}`);
}

function copyContextShift() {
  const cells = selectedCells.size ? selectedCellList() : contextCells();
  if (!cells.length) return;
  const minPersonIndex = Math.min(...cells.map((cell) => cell.personIndex));
  const minDayIndex = Math.min(...cells.map((cell) => cell.dayIndex));
  copiedShift = {
    sourceWeekIndex: currentWeekIndex,
    cells: cells.map((cell) => ({
      personOffset: cell.personIndex - minPersonIndex,
      dayOffset: cell.dayIndex - minDayIndex,
      shift: people[cell.personIndex].shifts[cell.dayIndex],
    })),
  };
  copiedCells = new Set(cells.map((cell) => cellKey(cell.personIndex, cell.dayIndex)));
  copiedCellsWeekIndex = currentWeekIndex;
  closeShiftContextMenu();
  render();
  setSideMode("person", "operador");
  showToast(cells.length > 1 ? `${cells.length} turnos copiados` : "Turno copiado");
}

function pasteContextShift(target = contextTarget || selected) {
  if (!target || !copiedShift) return;
  const changes = [];
  const pastedTargets = [];

  const singleCopiedShift = copiedShift.cells.length === 1 ? copiedShift.cells[0].shift : null;
  const targetCells = singleCopiedShift && selectedCells.size > 1 && selectedCells.has(cellKey(target.personIndex, target.dayIndex))
    ? selectedCellList().map((cell) => ({ ...cell, shift: singleCopiedShift }))
    : copiedShift.cells.map((cell) => ({
      personIndex: target.personIndex + cell.personOffset,
      dayIndex: target.dayIndex + cell.dayOffset,
      shift: cell.shift,
    }));

  targetCells.forEach(({ personIndex, dayIndex, shift }) => {
    if (people[personIndex] && dayIndex >= 0 && dayIndex < days.length) {
      const before = people[personIndex].shifts[dayIndex];
      changes.push({ personIndex, dayIndex, before, after: shift });
      pastedTargets.push({ personIndex, dayIndex });
      people[personIndex].shifts[dayIndex] = shift;
    }
  });
  if (!pastedTargets.length) {
    closeShiftContextMenu();
    showToast("No hay espacio para pegar esos turnos acá");
    return;
  }
  pushUndo(changes, "pegado");
  selected = { ...target };
  if (!(singleCopiedShift && selectedCells.size > 1)) setSingleSelectedCell(target.personIndex, target.dayIndex);
  saveWeeks();
  render();
  setSideMode("person", "operador");
  closeShiftContextMenu();
  flashPastedCells(pastedTargets);
  showToast(pastedTargets.length > 1 ? `${pastedTargets.length} turnos pegados` : "Turno pegado");
}

elements.table.addEventListener("click", (event) => {
  if (event.target.closest(".inline-shift-editor")) return;
  if (editingCell) saveInlineEdit();
  if (suppressNextShiftClick) {
    suppressNextShiftClick = false;
    return;
  }
  const aiDayButton = event.target.closest(".ai-day-button");
  if (aiDayButton) {
    selectedDayDetailIndex = Number(aiDayButton.dataset.aiDay);
    selected.dayIndex = selectedDayDetailIndex;
    selectedCells = new Set();
    selectionAnchor = null;
    render();
    suggestDayWithAi(selectedDayDetailIndex);
    return;
  }

  const dayButton = event.target.closest(".day-head-button");
  if (dayButton) {
    selectedDayDetailIndex = Number(dayButton.dataset.dayDetail);
    selected.dayIndex = selectedDayDetailIndex;
    selectedCells = new Set();
    selectionAnchor = null;
    render();
    setSideMode("day", "dia");
    return;
  }

  const bulkButton = event.target.closest("[data-bulk-edit]");
  if (bulkButton) {
    selectedCells = new Set();
    selectionAnchor = null;
    render();
    setSideMode("bulk", "lotes");
    return;
  }

  const personButton = event.target.closest(".person-button");
  if (personButton) {
    selected = {
      personIndex: Number(personButton.dataset.personDetail),
      dayIndex: selected.dayIndex,
    };
    selectedCells = new Set();
    selectionAnchor = null;
    render();
    setSideMode("person", "operador");
    return;
  }

  const button = event.target.closest(".shift-button");
  if (!button) return;
  const personIndex = Number(button.dataset.person);
  const dayIndex = Number(button.dataset.day);
  selected = { personIndex, dayIndex };
  if (event.shiftKey) shiftSelectCell(personIndex, dayIndex);
  else setSingleSelectedCell(personIndex, dayIndex);
  render();
  setSideMode("person", "operador");
});

elements.table.addEventListener("dblclick", (event) => {
  const button = event.target.closest(".shift-button");
  if (!button) return;
  event.preventDefault();
  startInlineEdit(Number(button.dataset.person), Number(button.dataset.day));
});

elements.table.addEventListener("contextmenu", (event) => {
  const button = event.target.closest(".shift-button");
  if (!button) return;
  openShiftContextMenu(event, Number(button.dataset.person), Number(button.dataset.day));
});

elements.table.addEventListener("mousedown", (event) => {
  if (event.target.closest(".inline-shift-editor")) return;
  if (editingCell) saveInlineEdit();
  if (event.button !== 0) return;
  const button = event.target.closest(".shift-button");
  if (!button || event.detail > 1) return;
  const personIndex = Number(button.dataset.person);
  const dayIndex = Number(button.dataset.day);
  const startDayIndex = event.shiftKey && selectionAnchor?.personIndex === personIndex ? selectionAnchor.dayIndex : dayIndex;
  dragSelection = {
    personIndex,
    startDayIndex,
    endDayIndex: dayIndex,
    moved: false,
  };
  selected = { personIndex, dayIndex };
  if (event.shiftKey) selectContiguousDays(personIndex, startDayIndex, dayIndex);
  else setSingleSelectedCell(personIndex, dayIndex);
  render();
  event.preventDefault();
});

elements.table.addEventListener("mouseover", (event) => {
  if (!dragSelection) return;
  const button = event.target.closest(".shift-button");
  if (!button) return;
  const personIndex = Number(button.dataset.person);
  const dayIndex = Number(button.dataset.day);
  if (personIndex !== dragSelection.personIndex) return;
  if (dayIndex === dragSelection.endDayIndex) return;
  dragSelection.endDayIndex = dayIndex;
  dragSelection.moved = true;
  selected = { personIndex, dayIndex };
  selectDayRange(personIndex, dragSelection.startDayIndex, dayIndex);
  render();
});

document.addEventListener("mouseup", () => {
  if (!dragSelection) return;
  suppressNextShiftClick = dragSelection.moved;
  dragSelection = null;
  setSideMode("person", "operador");
});

document.addEventListener("click", (event) => {
  if (!elements.contextMenu.classList.contains("open")) return;
  if (event.target.closest("#shiftContextMenu")) return;
  closeShiftContextMenu();
});

document.addEventListener("keydown", (event) => {
  if (editingCell) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveInlineEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const movedInsideEditor = moveInlineFocus(event.shiftKey ? -1 : 1);
      if (!movedInsideEditor && !event.shiftKey) saveInlineEdit({ moveDown: true });
      return;
    }
  }

  if (event.key === "Escape") closeShiftContextMenu();
  const key = event.key.toLowerCase();
  const isCopyPaste = key === "c" || key === "v";
  const isUndo = key === "z";
  const editable = event.target.closest("input, textarea, select");
  const hasCellSelection = selectedCells.size > 0;
  if (!editable && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    if (!hasCellSelection) return;
    event.preventDefault();
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      extendHorizontalSelection(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "ArrowUp") moveSelection(-1, 0);
    if (event.key === "ArrowDown") moveSelection(1, 0);
    if (event.key === "ArrowLeft") moveSelection(0, -1);
    if (event.key === "ArrowRight") moveSelection(0, 1);
    return;
  }
  if (!editable && event.key === "Enter") {
    if (!hasCellSelection) return;
    event.preventDefault();
    startInlineEdit();
    return;
  }
  if (!editable && (event.key === "Delete" || event.key === "Backspace")) {
    if (!hasCellSelection) return;
    event.preventDefault();
    clearSelectedShifts();
    return;
  }
  if ((!isCopyPaste && !isUndo) || (!event.ctrlKey && !event.metaKey)) return;
  if (editable) return;
  if (isCopyPaste && !hasCellSelection) return;
  event.preventDefault();
  if (key === "c") copyContextShift();
  if (key === "v") pasteContextShift(selected);
  if (key === "z" && event.shiftKey) redoLastShiftChange();
  else if (key === "z") undoLastShiftChange();
});

window.addEventListener("pagehide", () => {
  if (editingCell) saveInlineEdit();
  flushPlannerBackendSync({ keepalive: true, silent: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (editingCell) saveInlineEdit();
    flushPlannerBackendSync({ keepalive: true, silent: true });
  }
});

elements.contextMenu.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-context-action]");
  if (!actionButton) return;
  if (actionButton.dataset.contextAction === "normal") applyContextShiftType("normal");
  if (actionButton.dataset.contextAction === "status") applyContextShiftType(actionButton.dataset.status);
});

let mobilePressTimer = null;
let mobilePressStart = null;
let mobileLongPressTriggered = false;

function clearMobilePressTimer() {
  window.clearTimeout(mobilePressTimer);
  mobilePressTimer = null;
  mobilePressStart = null;
}

elements.mobilePrevDayButton?.addEventListener("click", () => moveMobileDay(-1));
elements.mobileNextDayButton?.addEventListener("click", () => moveMobileDay(1));
elements.mobileTodayButton?.addEventListener("click", setMobileToday);
elements.mobilePublishDayButton?.addEventListener("click", publishSelectedDay);
elements.mobileExportDayButton?.addEventListener("click", exportDayJpg);
elements.mobileSheetClose?.addEventListener("click", closeMobileSheet);
elements.mobileSheetBackdrop?.addEventListener("click", closeMobileSheet);
elements.mobileShiftStatus?.addEventListener("change", syncMobileSheetStatusFields);
elements.mobileShiftActivity?.addEventListener("input", () => {
  elements.mobileShiftActivity.value = normalizeActivity(elements.mobileShiftActivity.value);
});
elements.mobileShiftForm?.addEventListener("submit", saveMobileShiftEdit);
elements.mobileSheetActions?.addEventListener("click", handleMobileAction);
elements.mobileDayList?.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".mobile-shift-card")) event.preventDefault();
});
elements.mobileDayList?.addEventListener("pointerdown", (event) => {
  const target = mobileCardTarget(event);
  if (!target || event.button !== 0) return;
  mobileLongPressTriggered = false;
  mobilePressStart = { x: event.clientX, y: event.clientY, ...target };
  mobilePressTimer = window.setTimeout(() => {
    mobileLongPressTriggered = true;
    openMobileQuickActions(target.personIndex, target.dayIndex);
  }, 1000);
});
elements.mobileDayList?.addEventListener("pointermove", (event) => {
  if (!mobilePressStart) return;
  const moved = Math.abs(event.clientX - mobilePressStart.x) + Math.abs(event.clientY - mobilePressStart.y);
  if (moved > 12) clearMobilePressTimer();
});
elements.mobileDayList?.addEventListener("pointerup", clearMobilePressTimer);
elements.mobileDayList?.addEventListener("pointercancel", clearMobilePressTimer);
elements.mobileDayList?.addEventListener("click", (event) => {
  const target = mobileCardTarget(event);
  if (!target) return;
  if (mobileLongPressTriggered) {
    mobileLongPressTriggered = false;
    return;
  }
  openMobileShiftEditor(target.personIndex, target.dayIndex);
});

elements.copyShiftButton.addEventListener("click", copyContextShift);
elements.pasteShiftButton.addEventListener("click", () => pasteContextShift());
elements.aiSuggestionsList?.addEventListener("click", handleAiSuggestionClick);
elements.aiSuggestionsList?.addEventListener("input", (event) => {
  const card = event.target.closest("[data-ai-suggestion]");
  updateAiSuggestionDraft(card);
});
elements.search.addEventListener("input", render);
elements.bulkEditForm.addEventListener("submit", applyBulkEdit);
elements.bulkRoleInput.addEventListener("change", updateBulkPreview);
elements.bulkDayInputs.addEventListener("change", updateBulkPreview);
elements.bulkFreeInput.addEventListener("change", updateBulkPreview);
elements.summaryFrom.addEventListener("change", () => {
  if (Number(elements.summaryFrom.value) > Number(elements.summaryTo.value)) {
    elements.summaryTo.value = elements.summaryFrom.value;
  }
});
elements.summaryTo.addEventListener("change", () => {
  if (Number(elements.summaryTo.value) < Number(elements.summaryFrom.value)) {
    elements.summaryFrom.value = elements.summaryTo.value;
  }
});
elements.week.addEventListener("change", () => {
  setActiveWeek(Number(elements.week.value));
  selectedCells = new Set();
  selectionAnchor = null;
  aiSuggestions = [];
  aiSuggestionsDayIndex = null;
  aiSuggestionsLoading = false;
  aiSuggestionsError = "";
  loadMonthlyPersonData().catch(() => {});
  render();
  setSideMode("empty");
  showToast(copiedShift ? "Semana actualizada. Podés pegar lo copiado" : "Semana actualizada");
});
document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    openTab(button.dataset.tab);
  });
});

document.querySelector("#todayButton")?.addEventListener("click", () => {
  setActiveWeek(CURRENT_WEEK_OFFSET);
  elements.week.value = String(CURRENT_WEEK_OFFSET);
  selected = { personIndex: 0, dayIndex: 0 };
  selectedDayDetailIndex = 0;
  selectedCells = new Set();
  selectionAnchor = null;
  render();
  setSideMode("empty");
  showToast("Semana actual seleccionada");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  exportSummaryJpg();
});
elements.exportDayButton.addEventListener("click", exportDayJpg);
elements.publishDayButton?.addEventListener("click", publishSelectedDay);

async function initPlanner() {
  try {
    await loadPlannerPeopleFromBackend();
    await loadPublishedPlanDates();
    weeks = buildWeeks();
    renderWeekOptions();
    setActiveWeek(CURRENT_WEEK_OFFSET);
    initPanelResizer();
    await hydratePlannerFromBackend();
    restorePendingPlannerTurns();
    setActiveWeek(currentWeekIndex);
    selectedCells = new Set();
    selectionAnchor = null;
    render();
    setSideMode("empty");
    showToast("Plan semanal conectado a la base");
  } catch (error) {
    backendPlannerEnabled = false;
    elements.head.innerHTML = "";
    const isAuthError = error?.status === 401 || error?.status === 403;
    const message = isAuthError
      ? "No se pudo validar tu sesión de la app principal para cargar RRHH. Volvé a entrar desde el login general o pedí que revisen tus permisos de RRHH."
      : "No se pudo conectar con los datos de RRHH. Verificá que el servicio esté operativo e intentá nuevamente.";
    elements.body.innerHTML = `<tr><td class="planner-error-cell" colspan="8">${message}</td></tr>`;
    showToast(isAuthError ? "Sesión o permisos de RRHH pendientes" : "Datos de RRHH no disponibles");
  }
}

initPlanner();
