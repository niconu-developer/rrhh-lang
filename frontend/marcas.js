if (!requireModuleAccess("marcas")) throw new Error("Acceso no autorizado");
renderKioskSessionActions(document.querySelector(".kiosk-nav"));

const MARKS_API_BASE = apiBase();

const MARK_STATUSES = ["LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE", "VACIO"];
const DEFAULT_OPERATION_BANDS_LOCAL = ["Hasta 4 horas", "4 a 8 horas", "8 a 12 horas"];

const elements = {
  entryButton: document.querySelector("#entryButton"),
  exitButton: document.querySelector("#exitButton"),
  clock: document.querySelector("#kioskClock"),
  date: document.querySelector("#kioskDate"),
  workTimer: document.querySelector("#kioskWorkTimer"),
  time: document.querySelector("#kioskTime"),
  activityLocation: document.querySelector("#kioskActivityLocation"),
  detectedLocation: document.querySelector("#kioskDetectedLocation"),
  markProject: document.querySelector("#markProjectSelect"),
  operationsPanel: document.querySelector("#operationsPanel"),
  operationForm: document.querySelector("#operationForm"),
  operationDate: document.querySelector("#operationDate"),
  operationTariff: document.querySelector("#operationTariff"),
  operationBand: document.querySelector("#operationBand"),
  operationProject: document.querySelector("#operationProject"),
  operationNote: document.querySelector("#operationNote"),
  visiblePlanDate: document.querySelector("#visiblePlanDate"),
  previousPlanDay: document.querySelector("#previousPlanDay"),
  todayPlanDay: document.querySelector("#todayPlanDay"),
  nextPlanDay: document.querySelector("#nextPlanDay"),
  daySummaryList: document.querySelector("#daySummaryList"),
  markConfirmation: document.querySelector("#markConfirmation"),
  markConfirmationType: document.querySelector("#markConfirmationType"),
  markConfirmationTime: document.querySelector("#markConfirmationTime"),
  markConfirmationDetail: document.querySelector("#markConfirmationDetail"),
  toast: document.querySelector("#toast"),
};

function renderKioskSessionActions(target) {
  const user = currentUser();
  if (!target || !user) return;
  const roleName = user.role?.name || "Sin rol";
  target.insertAdjacentHTML(
    "beforeend",
    `<span class="session-chip">${user.personName || user.username}</span><span class="session-chip">${user.username} · ${roleName}</span><button class="ghost-link as-button" id="logoutButton" type="button">Salir</button>`
  );
  document.querySelector("#logoutButton")?.addEventListener("click", logoutUser);
}

let operator = null;
let todayShift = { noSchedule: true, status: "SIN PREVISIÓN", activity: "SIN PREVISIÓN", location: "SIN PREVISIÓN" };
let todayTurnsCache = [];
let recentMarks = [];
let activeEntryAt = null;
let confirmationTimeout = null;
let visiblePlanDate = currentIsoDate();
let appDbConfig = {};
let operationTariffs = [];
let projects = [];
let dbLocations = [];
let currentLocationStatus = {
  label: "Ubicación pendiente",
  matched: false,
  distanceMeters: null,
  toleranceMeters: null,
  coords: null,
};

async function api(path, options = {}) {
  const response = await fetch(`${MARKS_API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo conectar con la base");
  return payload;
}

function currentIsoDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addIsoDays(value, amount) {
  const date = parseIsoDate(value) || new Date();
  date.setDate(date.getDate() + amount);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatIsoDisplayDate(value) {
  const date = parseIsoDate(value);
  if (!date) return "Fecha no disponible";
  return formatDisplayDate(date);
}

function formatDbDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDisplayDate(date = new Date()) {
  return date.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDisplayTime(date = new Date()) {
  return date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

function normalizeDbConfig(rows) {
  return Object.fromEntries(rows.map((row) => {
    try {
      return [row.clave, JSON.parse(row.valor)];
    } catch (error) {
      return [row.clave, row.valor];
    }
  }));
}

function normalizeDbLocations(rows) {
  return rows
    .filter((location) => location.latitud !== null && location.longitud !== null)
    .map((location) => ({
      id: String(location.id),
      name: location.nombre,
      latitude: Number(location.latitud),
      longitude: Number(location.longitud),
      toleranceMeters: Number(location.tolerancia_metros || 500),
      generatesIncident: Number(location.genera_incidencia) !== 0,
      locationType: Number(location.genera_incidencia) !== 0 ? "incident" : "admitted",
      address: location.direccion || "",
    }));
}

function parseShiftFromTurn(turn) {
  if (!turn) return { noSchedule: true, status: "SIN PREVISIÓN", activity: "SIN PREVISIÓN", location: "SIN PREVISIÓN" };
  const status = normalizeStatus(turn.estado);
  if (MARK_STATUSES.includes(status)) {
    return { noSchedule: true, status, activity: status, location: "Sin ubicación" };
  }
  return {
    noSchedule: false,
    start: turn.hora_inicio || "",
    end: turn.hora_fin || "",
    activity: turn.actividad_ubicacion || "LOGISTICA",
    location: turn.actividad_ubicacion || "LOGISTICA",
  };
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function escapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadInitialData() {
  const user = currentUser();
  if (!user?.personName) throw new Error("Tu usuario no tiene una persona asociada");
  const [people, configRows, locationRows, projectRows, tariffRows] = await Promise.all([
    api("/personas"),
    api("/configuracion"),
    api("/ubicaciones"),
    api("/proyectos?activos=1"),
    api("/operacion-tarifas?activas=1"),
  ]);
  operator = people.find((person) => person.nombre === user.personName);
  if (!operator) throw new Error("No encontré tu persona en la base");
  appDbConfig = normalizeDbConfig(configRows);
  dbLocations = normalizeDbLocations(locationRows);
  projects = projectRows;
  operationTariffs = tariffRows;
  visiblePlanDate = currentIsoDate();
  elements.operationDate.value = currentIsoDate();
  await refreshDbData();
}

async function refreshDbData() {
  const today = currentIsoDate();
  const yesterday = addIsoDays(today, -1);
  const selectedDate = visiblePlanDate || today;
  const [todayTurns, visibleTurns, marks] = selectedDate === today
    ? await Promise.all([
        api(`/turnos?desde=${today}&hasta=${today}`),
        api(`/turnos?desde=${today}&hasta=${today}`),
        api(`/marcas?persona=${encodeURIComponent(operator.nombre)}&desde=${yesterday}&hasta=${today}`),
      ])
    : await Promise.all([
        api(`/turnos?desde=${today}&hasta=${today}`),
        api(`/turnos?desde=${selectedDate}&hasta=${selectedDate}`),
        api(`/marcas?persona=${encodeURIComponent(operator.nombre)}&desde=${yesterday}&hasta=${today}`),
      ]);
  todayShift = parseShiftFromTurn(todayTurns.find((turn) => turn.persona === operator.nombre));
  todayTurnsCache = visibleTurns;
  recentMarks = marks;
  activeEntryAt = activeEntryFromMarks(recentMarks);
  renderShift();
  renderDaySummary();

  render();
}

function render() {
  renderProjectSelectors();
  renderMarkAccess();
  renderOperationBands();
  refreshCurrentLocation();
  renderShift();
  renderDaySummary();
  renderOperationAccess();
}

function renderMarkAccess() {
  const hasProject = Boolean(elements.markProject?.value);
  elements.entryButton.disabled = !hasProject;
  elements.exitButton.disabled = !hasProject;
}

function renderProjectSelectors() {
  const renderSelect = (select) => {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Seleccionar proyecto</option>${projects
      .map((project) => `<option value="${escapeMarkup(project.nombre)}">${escapeMarkup(project.nombre)}</option>`)
      .join("")}`;
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  };
  renderSelect(elements.markProject);
  renderSelect(elements.operationProject);
  renderMarkAccess();
}

function renderShift() {
  const now = new Date();
  elements.clock.textContent = formatDisplayTime(now);
  elements.date.textContent = formatDisplayDate(now);
  elements.workTimer.textContent = activeEntryAt ? formatElapsedTime(now - activeEntryAt) : "Sin entrada activa";
  elements.time.textContent = todayShift.noSchedule ? "Sin horario" : `${todayShift.start} - ${todayShift.end}`;
  elements.activityLocation.textContent = todayShift.activity;
  elements.detectedLocation.textContent = currentLocationLabel();
}

function parseDbDateTime(value) {
  const normalized = String(value || "").replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activeEntryFromMarks(marks) {
  let openEntry = null;
  [...marks]
    .sort((a, b) => String(a.fecha_hora).localeCompare(String(b.fecha_hora)))
    .forEach((mark) => {
      const type = normalizeStatus(mark.tipo);
      if (type === "ENTRADA") openEntry = parseDbDateTime(mark.fecha_hora);
      if (type === "SALIDA") openEntry = null;
    });
  return openEntry;
}

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderDaySummary() {
  const { items } = daySummaryData(todayTurnsCache);
  elements.visiblePlanDate.textContent = formatIsoDisplayDate(visiblePlanDate);
  elements.previousPlanDay.disabled = false;
  elements.nextPlanDay.disabled = !canViewPlanDate(addIsoDays(visiblePlanDate, 1));
  elements.daySummaryList.innerHTML = items.length
    ? items.map((item) => `<article class="day-summary-item">
        <strong class="day-summary-people">${item.people.join(", ")}</strong>
        <span class="day-summary-shift">${item.time} · ${item.activity}</span>
      </article>`).join("")
    : `<article class="day-summary-item"><strong>Sin turnos planificados</strong><span>No hay horarios cargados para hoy.</span></article>`;
}

function publishedPlanDates() {
  const dates = appDbConfig.published_plan_dates;
  return new Set(Array.isArray(dates) ? dates : []);
}

function canViewPlanDate(value) {
  const today = currentIsoDate();
  if (String(value) <= today) return true;
  return publishedPlanDates().has(value);
}

async function moveVisiblePlanDate(amount) {
  const nextDate = addIsoDays(visiblePlanDate, amount);
  if (!canViewPlanDate(nextDate)) {
    showToast("Ese día todavía no está publicado");
    return;
  }
  visiblePlanDate = nextDate;
  await refreshDbData();
}

async function goTodayPlanDate() {
  visiblePlanDate = currentIsoDate();
  await refreshDbData();
}

function daySummaryData(turns) {
  const groups = new Map();
  turns.forEach((turn) => {
    const shift = parseShiftFromTurn(turn);
    if (shift.noSchedule || !shift.start || !shift.end) return;
    const activity = shift.activity || "LOGISTICA";
    const key = `${shift.start}-${shift.end}|${activity}`;
    if (!groups.has(key)) {
      groups.set(key, {
        time: `${shift.start} - ${shift.end}`,
        activity,
        people: [],
      });
    }
    groups.get(key).people.push(turn.persona);
  });
  const items = [...groups.values()]
    .map((item) => ({ ...item, people: item.people.sort((a, b) => a.localeCompare(b, "es")) }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.activity.localeCompare(b.activity, "es"));
  const total = items.reduce((sum, item) => sum + item.people.length, 0);
  return { items, total };
}

function renderOperationBands() {
  const bands = appDbConfig.operation_bands?.length ? appDbConfig.operation_bands : DEFAULT_OPERATION_BANDS_LOCAL;
  elements.operationBand.innerHTML = bands.map((band) => `<option value="${band}">${band}</option>`).join("");
}

function parseOperatorTariffIds() {
  return String(operator?.operacion_tarifa_ids || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderOperationTariffs() {
  const allowed = new Set(parseOperatorTariffIds());
  const tariffs = operationTariffs.filter((tariff) => allowed.has(String(tariff.id)) && Number(tariff.activo) !== 0);
  elements.operationTariff.innerHTML = tariffs
    .map((tariff) => `<option value="${tariff.id}">${tariff.categoria} · ${tariff.tipo}</option>`)
    .join("");
  return tariffs.length;
}

function renderOperationAccess() {
  const canSubmitOperations = operator?.rol_operativo === "Operador" && renderOperationTariffs() > 0;
  elements.operationsPanel.classList.toggle("hidden", !canSubmitOperations);
}

function currentLocationLabel() {
  if (currentLocationStatus.locationGeneratesIncident || currentLocationStatus.matched === false) {
    return "UBICACIÓN NO DETECTADA - GENERA NOTIFICACIÓN";
  }
  const distance = currentLocationStatus.distanceMeters;
  const suffix = distance !== null && distance !== undefined ? ` · ${distance} m` : "";
  return `${currentLocationStatus.label}${suffix}`;
}

function refreshCurrentLocation() {
  resolveCurrentLocation().then(() => renderShift());
}

async function resolveCurrentLocation() {
  if (!navigator.geolocation) {
    currentLocationStatus = matchConfiguredLocation(null, dbLocations);
    return currentLocationStatus;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 8000,
      });
    });
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy || 0),
    };
    currentLocationStatus = {
      ...matchConfiguredLocation(coords, dbLocations),
      coords,
    };
  } catch (error) {
    currentLocationStatus = matchConfiguredLocation(null, dbLocations);
  }
  return currentLocationStatus;
}

async function registerMark(type) {
  const project = elements.markProject.value.trim();
  if (!project) {
    showToast("Elegí un proyecto antes de marcar");
    return;
  }
  const locationStatus = await resolveCurrentLocation();
  await api("/marcas", {
    method: "POST",
    body: JSON.stringify({
      persona: operator.nombre,
      rol_operativo: operator.rol_operativo,
      fecha_hora: formatDbDateTime(),
      tipo: type,
      tipo_marca: "Por usuario",
      actividad_ubicacion: project,
      ubicacion_detectada: locationStatus.label,
      latitud: locationStatus.coords?.latitude ?? null,
      longitud: locationStatus.coords?.longitude ?? null,
      genera_incidencia: Boolean(locationStatus.locationGeneratesIncident || locationStatus.matched === false),
    }),
  });
  await refreshDbData();
  showMarkConfirmation(type, locationStatus.label);
  showToast(`${type} registrada`);
}

function showMarkConfirmation(type, locationLabel) {
  window.clearTimeout(confirmationTimeout);
  elements.markConfirmation.hidden = false;
  elements.markConfirmation.dataset.type = normalizeStatus(type).toLowerCase();
  elements.markConfirmationType.textContent = `${type} registrada`;
  elements.markConfirmationTime.textContent = formatDisplayTime(new Date());
  elements.markConfirmationDetail.textContent = `Desde ${locationLabel}`;
  confirmationTimeout = window.setTimeout(() => {
    elements.markConfirmation.hidden = true;
  }, 5000);
}

function operationValueForBand(band) {
  const tariff = operationTariffs.find((item) => String(item.id) === String(elements.operationTariff.value));
  return operationTariffValueForBand(tariff, band);
}

async function submitOperation(event) {
  event.preventDefault();
  if (operator.rol_operativo !== "Operador") {
    showToast("Este empleado no está habilitado como operador");
    return;
  }
  const project = elements.operationProject.value.trim();
  if (!project) {
    showToast("Elegí un proyecto");
    return;
  }

  await api("/operaciones", {
    method: "POST",
    body: JSON.stringify({
      persona_id: operator.id,
      operacion_tarifa_id: Number(elements.operationTariff.value),
      fecha_hora: `${elements.operationDate.value || currentIsoDate()} 00:00:00`,
      franja: elements.operationBand.value,
      valor: operationValueForBand(elements.operationBand.value),
      referencia: project,
      observacion: elements.operationNote.value.trim(),
      estado: "pending",
    }),
  });
  elements.operationDate.value = currentIsoDate();
  elements.operationProject.value = "";
  elements.operationNote.value = "";
  await refreshDbData();
  showToast("Operación enviada");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

elements.entryButton.addEventListener("click", () => registerMark("Entrada"));
elements.exitButton.addEventListener("click", () => registerMark("Salida"));
elements.markProject?.addEventListener("change", renderMarkAccess);
elements.operationForm.addEventListener("submit", submitOperation);
elements.previousPlanDay.addEventListener("click", () => moveVisiblePlanDate(-1));
elements.todayPlanDay.addEventListener("click", goTodayPlanDate);
elements.nextPlanDay.addEventListener("click", () => moveVisiblePlanDate(1));

loadInitialData().catch((error) => {
  showToast(error.message || "No se pudo cargar el reloj");
  elements.entryButton.disabled = true;
  elements.exitButton.disabled = true;
});
window.setInterval(renderShift, 1000);
