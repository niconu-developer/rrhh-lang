if (!requireModuleAccess("analisis")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const ANALYSIS_API_BASE = apiBase();
const analysis = {
  previousMonth: document.querySelector("#analysisPreviousMonth"),
  currentMonth: document.querySelector("#analysisCurrentMonth"),
  nextMonth: document.querySelector("#analysisNextMonth"),
  monthLabel: document.querySelector("#analysisMonthLabel"),
  status: document.querySelector("#analysisStatus"),
  people: document.querySelector("#analysisPeople"),
  hours: document.querySelector("#analysisHours"),
  hourCost: document.querySelector("#analysisHourCost"),
  operationCost: document.querySelector("#analysisOperationCost"),
  operationCount: document.querySelector("#analysisOperationCount"),
  totalCost: document.querySelector("#analysisTotalCost"),
  hourBands: document.querySelector("#analysisHourBands"),
  salaryBands: document.querySelector("#analysisSalaryBands"),
  rowsCount: document.querySelector("#analysisRowsCount"),
  peopleBody: document.querySelector("#analysisPeopleBody"),
  toast: document.querySelector("#toast"),
};

const HOUR_BANDS = [
  { id: "lt140", label: "Menos de 140 h", min: 0, max: 140 },
  { id: "140to172", label: "140 a 172 h", min: 140, max: 172 },
  { id: "172to190", label: "172 a 190 h", min: 172, max: 190 },
  { id: "190to210", label: "190 a 210 h", min: 190, max: 210 },
  { id: "gt210", label: "Más de 210 h", min: 210, max: Infinity },
];

const SALARY_BANDS = [
  { id: "0to30", label: "$0 a $30.000", min: 0, max: 30000 },
  { id: "30to45", label: "$30.000 a $45.000", min: 30000, max: 45000 },
  { id: "45to60", label: "$45.000 a $60.000", min: 45000, max: 60000 },
  { id: "60to80", label: "$60.000 a $80.000", min: 60000, max: 80000 },
  { id: "80to100", label: "$80.000 a $100.000", min: 80000, max: 100000 },
  { id: "gt100", label: "Más de $100.000", min: 100000, max: Infinity },
];

let selectedMonth = monthKey(new Date());
let peopleRows = [];
let jornalRows = [];
let operationRows = [];

async function analysisApi(path) {
  const response = await fetch(`${ANALYSIS_API_BASE}${path}`);
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
  return { from: inputDateValue(first), to: inputDateValue(last), first };
}

function inputDateValue(date) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonthLabel(value) {
  const { first } = monthRange(value);
  const label = first.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatHours(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toLocaleString("es-UY", { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "0%";
  return `${Number(value || 0).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

function parseIsoDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function weekStartKey(value) {
  const date = parseIsoDate(value);
  if (!date) return "";
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return inputDateValue(date);
}

function formatShortDate(value) {
  const date = parseIsoDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
}

function weekLabel(value) {
  const start = parseIsoDate(value);
  if (!start) return "-";
  return `${formatShortDate(value)} - ${formatShortDate(inputDateValue(addDays(start, 6)))}`;
}

function escapeAnalysisText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshAnalysis() {
  const { from, to } = monthRange(selectedMonth);
  analysis.monthLabel.textContent = formatMonthLabel(selectedMonth);
  analysis.nextMonth.disabled = selectedMonth >= monthKey(new Date());
  analysis.status.textContent = "Calculando";
  const [people, jornals, operations] = await Promise.all([
    analysisApi("/personas"),
    analysisApi(`/jornales?desde=${from}&hasta=${to}`),
    analysisApi(`/operaciones?desde=${from}&hasta=${to}&estado=approved`),
  ]);
  peopleRows = people.filter((person) => Number(person.activo) !== 0);
  jornalRows = jornals;
  operationRows = operations;
  renderAnalysis();
}

function renderAnalysis() {
  const rows = buildAnalysisRows();
  const totalHours = sumNumbers(rows.map((row) => row.hours));
  const totalHourCost = sumNumbers(rows.map((row) => row.hourCost));
  const totalOperationCost = sumNumbers(rows.map((row) => row.operationCost));
  const operationsCount = sumNumbers(rows.map((row) => row.operationsCount));
  const totalCost = totalHourCost + totalOperationCost;
  analysis.people.textContent = rows.length;
  analysis.hours.textContent = `${formatHours(totalHours)} h`;
  analysis.hourCost.textContent = formatMoney(totalHourCost);
  analysis.operationCost.textContent = formatMoney(totalOperationCost);
  analysis.operationCount.textContent = `${operationsCount} operaciones`;
  analysis.totalCost.textContent = formatMoney(totalCost);
  analysis.rowsCount.textContent = `${rows.length} filas`;
  analysis.status.textContent = "Actualizado";
  renderBands(analysis.hourBands, HOUR_BANDS, rows, "hours");
  renderBands(analysis.salaryBands, SALARY_BANDS, rows, "totalCost");
  renderPeopleRows(rows);
}

function buildAnalysisRows() {
  return peopleRows
    .map((person) => {
      const personJornals = jornalRows.filter((row) => Number(row.persona_id) === Number(person.id) && isLiquidableJornal(row));
      const personOperations = operationRows.filter((operation) => Number(operation.persona_id) === Number(person.id));
      const hours = sumNumbers(personJornals.map((row) => row.horas_trabajadas));
      const hourlyRate = Number(person.valor_hora || 0);
      const hourCost = hours * hourlyRate;
      const operationCost = sumNumbers(personOperations.map((operation) => operation.valor));
      const totalCost = hourCost + operationCost;
      return {
        id: person.id,
        name: person.nombre,
        role: person.rol_operativo || "-",
        hourlyRate,
        hours,
        hourCost,
        operationsCount: personOperations.length,
        operationCost,
        totalCost,
        hourBand: bandForValue(hours, HOUR_BANDS),
        salaryBand: bandForValue(totalCost, SALARY_BANDS),
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost || b.hours - a.hours || a.name.localeCompare(b.name, "es"));
}

function isLiquidableJornal(row) {
  return ["APROBADA", "VALIDADA_CON_INCIDENCIA"].includes(String(row.estado_aprobacion || "").toUpperCase());
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function bandForValue(value, bands) {
  return bands.find((band) => Number(value || 0) >= band.min && Number(value || 0) < band.max) || bands[bands.length - 1];
}

function renderBands(container, bands, rows, key) {
  const maxCount = Math.max(1, ...bands.map((band) => rows.filter((row) => bandForValue(row[key], bands).id === band.id).length));
  container.innerHTML = bands
    .map((band) => {
      const people = rows.filter((row) => bandForValue(row[key], bands).id === band.id);
      const percent = Math.round((people.length / maxCount) * 100);
      const total = key === "hours" ? sumNumbers(people.map((row) => row.hours)) : sumNumbers(people.map((row) => row.totalCost));
      return `<article class="analysis-band-item">
        <div>
          <strong>${band.label}</strong>
          <span>${people.length} personas · ${key === "hours" ? `${formatHours(total)} h` : formatMoney(total)}</span>
        </div>
        <div class="analysis-band-meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>
      </article>`;
    })
    .join("");
}

function renderPeopleRows(rows) {
  if (!rows.length) {
    analysis.peopleBody.innerHTML = `<tr><td colspan="10">Sin datos para el mes seleccionado.</td></tr>`;
    return;
  }
  analysis.peopleBody.innerHTML = rows
    .map((row) => `<tr>
      <td>${escapeAnalysisText(row.name)}</td>
      <td>${escapeAnalysisText(row.role)}</td>
      <td>${formatMoney(row.hourlyRate)}</td>
      <td>${formatHours(row.hours)} h</td>
      <td>${formatMoney(row.hourCost)}</td>
      <td>${row.operationsCount}</td>
      <td>${formatMoney(row.operationCost)}</td>
      <td><strong>${formatMoney(row.totalCost)}</strong></td>
      <td><span class="mark-pill severity-info">${row.hourBand.label}</span></td>
      <td><span class="mark-pill approved-auto">${row.salaryBand.label}</span></td>
    </tr>`)
    .join("");
}

function showAnalysisToast(message) {
  analysis.toast.textContent = message;
  analysis.toast.classList.add("visible");
  window.setTimeout(() => analysis.toast.classList.remove("visible"), 2200);
}

analysis.previousMonth.addEventListener("click", () => {
  selectedMonth = addMonths(selectedMonth, -1);
  refreshAnalysis().catch((error) => showAnalysisToast(error.message));
});
analysis.currentMonth.addEventListener("click", () => {
  selectedMonth = monthKey(new Date());
  refreshAnalysis().catch((error) => showAnalysisToast(error.message));
});
analysis.nextMonth.addEventListener("click", () => {
  selectedMonth = addMonths(selectedMonth, 1);
  refreshAnalysis().catch((error) => showAnalysisToast(error.message));
});

refreshAnalysis().catch((error) => showAnalysisToast(error.message || "No se pudo cargar análisis"));
