if (!requireModuleAccess("mis-marcas")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const API_BASE = apiBase();
const elements = {
  previousMonth: document.querySelector("#previousMonth"),
  currentMonth: document.querySelector("#currentMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  monthLabel: document.querySelector("#monthLabel"),
  adminViewAs: document.querySelector("#adminViewAs"),
  viewAsPerson: document.querySelector("#viewAsPerson"),
  hoursSummary: document.querySelector("#ownHoursSummary"),
  list: document.querySelector("#ownMarkList"),
  operationList: document.querySelector("#ownOperationList"),
  operationTab: document.querySelector("#ownOperationsTab"),
  toast: document.querySelector("#toast"),
};

let operator = null;
let peopleCache = [];
let visibleMonth = monthKey(new Date());
let marks = [];
let operations = [];
let turns = [];
let activeTab = "marcas";

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo conectar con la base");
  return payload;
}

function monthKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function addMonths(value, amount) {
  const [year, month] = String(value || monthKey()).split("-").map(Number);
  return monthKey(new Date(year, (month || 1) - 1 + amount, 1));
}

function monthRange(value) {
  const [year, month] = String(value || monthKey()).split("-").map(Number);
  const first = new Date(year, (month || 1) - 1, 1);
  const last = new Date(year, month || 1, 0);
  const pad = (part) => String(part).padStart(2, "0");
  const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { from: format(first), to: format(last), first };
}

function formatMonthLabel(value) {
  const { first } = monthRange(value);
  const label = first.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDbDate(value) {
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

function addIsoDays(value, amount) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + amount);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDbTime(value) {
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

async function loadInitialData() {
  const user = currentUser();
  peopleCache = await api("/personas");
  setupAdminViewAs(user);
  operator = user.roleId === "admin"
    ? peopleCache.find((person) => Number(person.activo) !== 0)
    : peopleCache.find((person) => person.nombre === user.personName);
  if (!operator) throw new Error("No encontré tu persona en la base");
  await refreshMonth();
}

function setupAdminViewAs(user) {
  const isAdmin = user?.roleId === "admin";
  elements.adminViewAs.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) return;
  elements.viewAsPerson.innerHTML = peopleCache
    .filter((person) => Number(person.activo) !== 0)
    .map((person) => `<option value="${person.id}">${person.nombre}</option>`)
    .join("");
}

async function refreshMonth() {
  const { from, to } = monthRange(visibleMonth);
  const [monthMarks, allOperations, monthTurns] = await Promise.all([
    api(`/marcas?persona=${encodeURIComponent(operator.nombre)}&desde=${from}&hasta=${addIsoDays(to, 1)}`),
    api(`/operaciones?persona=${encodeURIComponent(operator.id)}&desde=${from}&hasta=${to}`),
    api(`/turnos?desde=${from}&hasta=${to}`),
  ]);
  marks = monthMarks;
  turns = monthTurns.filter((turn) => turn.persona === operator.nombre);
  operations = allOperations;
  render();
}

function render() {
  elements.monthLabel.textContent = formatMonthLabel(visibleMonth);
  elements.nextMonth.disabled = visibleMonth >= monthKey(new Date());
  renderHoursSummary();
  renderTabs();
  renderMarks();
  renderOperations();
}

function renderHoursSummary() {
  const planned = totalPlannedHours();
  const worked = totalWorkedHours();
  const diff = Math.round((worked - planned) * 100) / 100;
  const operationTotal = operations.reduce((total, operation) => total + Number(operation.valor || operation.value || 0), 0);
  const diffClass = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
  elements.hoursSummary.innerHTML = `
    <span><small>Planificadas</small><strong>${formatHours(planned)} h</strong></span>
    <span><small>Trabajadas</small><strong>${formatHours(worked)} h</strong></span>
    <span><small>Diferencia</small><strong class="${diffClass}">${formatSignedHours(diff)}</strong></span>
    <span><small>Operaciones</small><strong>${operations.length} · ${formatMoney(operationTotal)}</strong></span>
  `;
}

function canSeeOperations() {
  return currentUser()?.roleId === "admin" || operator?.rol_operativo === "Operador";
}

function renderTabs() {
  const showOperations = canSeeOperations();
  elements.operationTab.hidden = !showOperations;
  if (!showOperations && activeTab === "operaciones") activeTab = "marcas";
  document.querySelectorAll("[data-own-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.ownTab === activeTab);
  });
  elements.list.classList.toggle("hidden", activeTab !== "marcas");
  elements.operationList.classList.toggle("hidden", activeTab !== "operaciones");
}

function renderMarks() {
  if (!marks.length) {
    elements.list.innerHTML = `<article class="own-mark-item"><div><strong>Sin marcas registradas</strong><span>No hay marcas en este mes.</span></div></article>`;
    return;
  }

  const grouped = pairMarksByStartDay(marks).reduce((groups, pair) => {
      if (!groups.has(pair.dayKey)) groups.set(pair.dayKey, []);
      groups.get(pair.dayKey).push(pair);
      return groups;
    }, new Map());

  elements.list.innerHTML = [...grouped.entries()]
    .sort(([dayA], [dayB]) => dayB.localeCompare(dayA))
    .map(([dayKey, dayPairs]) => `<section class="mark-day-group">
      <header>
        <h3>${formatDbDate(`${dayKey} 00:00:00`)}</h3>
        <span>${dayPairs.reduce((total, pair) => total + (pair.entry ? 1 : 0) + (pair.exit ? 1 : 0), 0)} marcas</span>
      </header>
      <div class="mark-day-list">
        ${dayPairs.map((pair) => `<article class="mark-pair-card">
          ${renderMarkBlock(pair.entry, "Entrada", dayKey)}
          ${renderMarkBlock(pair.exit, "Salida", dayKey)}
          ${renderPairHours(pair)}
        </article>`).join("")}
      </div>
    </section>`)
    .join("");
}

function renderOperations() {
  if (!canSeeOperations()) {
    elements.operationList.innerHTML = "";
    return;
  }
  if (!operations.length) {
    elements.operationList.innerHTML = `<article class="own-mark-item"><div><strong>Sin operaciones enviadas</strong><span>No hay operaciones en este mes.</span></div></article>`;
    return;
  }

  elements.operationList.innerHTML = operations
    .slice()
    .sort((a, b) => String(b.fecha_hora).localeCompare(String(a.fecha_hora)))
    .map((operation) => `<article class="own-mark-item">
      <div>
        <strong>${operation.tipo_operacion} · ${operation.franja || "Sin franja"}</strong>
        <span>${operation.referencia || "Sin proyecto"} · ${formatDbDate(operation.fecha_hora)} ${formatDbTime(operation.fecha_hora)}</span>
        <span>${operation.observacion || "Sin observación"}</span>
        ${operation.estado === "rejected" && operation.motivo_rechazo ? `<span>Motivo rechazo: ${operation.motivo_rechazo}</span>` : ""}
      </div>
      <span class="mark-pill ${operation.estado}">${operationStatusLabel(operation.estado)}</span>
    </article>`)
    .join("");
}

function operationStatusLabel(status) {
  return {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
  }[status] || "Pendiente";
}

function pairMarksByStartDay(sourceMarks) {
  const sorted = sourceMarks
    .slice()
    .sort((a, b) => String(a.fecha_hora).localeCompare(String(b.fecha_hora)));
  const pairs = [];
  let openEntry = null;
  sorted.forEach((mark) => {
    const type = String(mark.tipo || "").toLowerCase();
    if (type === "entrada") {
      if (openEntry) pairs.push({ dayKey: dateKey(openEntry.fecha_hora), entry: openEntry, exit: null });
      openEntry = mark;
      return;
    }
    if (type === "salida") {
      if (openEntry) {
        pairs.push({ dayKey: dateKey(openEntry.fecha_hora), entry: openEntry, exit: mark });
        openEntry = null;
        return;
      }
      pairs.push({ dayKey: dateKey(mark.fecha_hora), entry: null, exit: mark });
    }
  });
  if (openEntry) pairs.push({ dayKey: dateKey(openEntry.fecha_hora), entry: openEntry, exit: null });
  return pairs.filter((pair) => pair.dayKey.startsWith(visibleMonth));
}

function totalPlannedHours() {
  return Math.round(turns.reduce((total, turn) => {
    if (String(turn.estado || "").toUpperCase() !== "NORMAL") return total;
    return total + shiftHours(turn.hora_inicio, turn.hora_fin);
  }, 0) * 100) / 100;
}

function totalWorkedHours() {
  return Math.round(pairMarksByStartDay(marks).reduce((total, pair) => {
    const hours = pairTotalHours(pair);
    return hours === null ? total : total + hours;
  }, 0) * 100) / 100;
}

function shiftHours(start, end) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === null || endMinutes === null) return 0;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

function minutesFromTime(value) {
  const match = String(value || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function renderMarkBlock(mark, fallbackType, groupDayKey) {
  if (!mark) {
    return `<div class="mark-point missing"><strong>${fallbackType}</strong><span>Sin marca</span></div>`;
  }
  const markDay = dateKey(mark.fecha_hora);
  const daySuffix = markDay !== groupDayKey ? ` ${markDay.slice(8, 10)}/${markDay.slice(5, 7)}` : "";
  return `<div class="mark-point">
    <strong>${String(mark.tipo || fallbackType).toUpperCase()}${daySuffix}</strong>
    <span>${formatDbTime(mark.fecha_hora)}</span>
    <small>${mark.actividad_ubicacion || "LOGISTICA"}</small>
    <small>${mark.ubicacion_detectada || "Ubicación no registrada"}</small>
  </div>`;
}

function renderPairHours(pair) {
  const hours = pairTotalHours(pair);
  const text = hours === null ? "Sin par" : `${formatHours(hours)} horas totales`;
  return `<div class="mark-point mark-hours-total ${hours === null ? "missing" : ""}">
    <strong>Total</strong>
    <span>${text}</span>
  </div>`;
}

function pairTotalHours(pair) {
  if (!pair.entry?.fecha_hora || !pair.exit?.fecha_hora) return null;
  const entryDate = parseDbDateTime(pair.entry.fecha_hora);
  const exitDate = parseDbDateTime(pair.exit.fecha_hora);
  if (!entryDate || !exitDate) return null;
  const diff = (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60);
  return diff >= 0 ? Math.round(diff * 100) / 100 : null;
}

function parseDbDateTime(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHours(value) {
  if (Math.abs(value) % 1 === 0) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatSignedHours(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatHours(value)} h`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

async function moveMonth(amount) {
  const nextMonth = addMonths(visibleMonth, amount);
  if (nextMonth > monthKey(new Date())) {
    showToast("No hay marcas futuras");
    return;
  }
  visibleMonth = nextMonth;
  await refreshMonth();
}

async function goCurrentMonth() {
  visibleMonth = monthKey(new Date());
  await refreshMonth();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

elements.previousMonth.addEventListener("click", () => moveMonth(-1));
elements.currentMonth.addEventListener("click", goCurrentMonth);
elements.nextMonth.addEventListener("click", () => moveMonth(1));
document.querySelectorAll("[data-own-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.ownTab;
    render();
  });
});
elements.viewAsPerson.addEventListener("change", async () => {
  operator = peopleCache.find((person) => String(person.id) === elements.viewAsPerson.value);
  await refreshMonth();
});

loadInitialData().catch((error) => {
  showToast(error.message || "No se pudieron cargar tus marcas");
});
