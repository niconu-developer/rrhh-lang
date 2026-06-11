if (!requireModuleAccess("liquidacion")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const PAYROLL_API_BASE = apiBase();
const PAYROLL_FILTERS_KEY = "payrollFilters";
const payroll = {
  person: document.querySelector("#payrollPerson"),
  previousMonth: document.querySelector("#payrollPreviousMonth"),
  currentMonth: document.querySelector("#payrollCurrentMonth"),
  nextMonth: document.querySelector("#payrollNextMonth"),
  monthLabel: document.querySelector("#payrollMonthLabel"),
  status: document.querySelector("#payrollStatus"),
  totalHours: document.querySelector("#payrollTotalHours"),
  hourlyRate: document.querySelector("#payrollHourlyRate"),
  operationsTotal: document.querySelector("#payrollOperationsTotal"),
  operationsCount: document.querySelector("#payrollOperationsCount"),
  subtotal: document.querySelector("#payrollSubtotal"),
  deductionsTotal: document.querySelector("#payrollDeductionsTotal"),
  netTotal: document.querySelector("#payrollNetTotal"),
  grossBreakdown: document.querySelector("#payrollGrossBreakdown"),
  pendingCount: document.querySelector("#payrollPendingCount"),
  pendingBody: document.querySelector("#payrollPendingBody"),
  pendingOperationsCount: document.querySelector("#payrollPendingOperationsCount"),
  pendingOperationsBody: document.querySelector("#payrollPendingOperationsBody"),
  approvedHoursBadge: document.querySelector("#payrollApprovedHoursBadge"),
  approvedBody: document.querySelector("#payrollApprovedBody"),
  approvedOperationsBadge: document.querySelector("#payrollApprovedOperationsBadge"),
  operationsBody: document.querySelector("#payrollOperationsBody"),
  addDeduction: document.querySelector("#addDeduction"),
  deductionsBody: document.querySelector("#payrollDeductionsBody"),
  toast: document.querySelector("#toast"),
};

let people = [];
let jornals = [];
let operations = [];
let selectedMonth = storedPayrollFilters().month || monthKey(new Date());
let deductions = [];

function storedPayrollFilters() {
  try {
    return JSON.parse(localStorage.getItem(PAYROLL_FILTERS_KEY) || "{}") || {};
  } catch (error) {
    return {};
  }
}

function savePayrollFilters() {
  localStorage.setItem(PAYROLL_FILTERS_KEY, JSON.stringify({
    personId: payroll.person.value || "",
    month: selectedMonth,
  }));
}

async function payrollApi(path) {
  const response = await fetch(`${PAYROLL_API_BASE}${path}`);
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
  return {
    from: inputDateValue(first),
    to: inputDateValue(last),
    first,
  };
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

function formatDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatOperationDate(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
}

function formatHours(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function escapePayrollText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectedPerson() {
  return people.find((person) => String(person.id) === String(payroll.person.value)) || people[0];
}

async function initPayroll() {
  const savedFilters = storedPayrollFilters();
  people = (await payrollApi("/personas")).filter((person) => Number(person.activo) !== 0);
  payroll.person.innerHTML = people
    .map((person) => `<option value="${person.id}">${escapePayrollText(person.nombre)}</option>`)
    .join("");
  if (savedFilters.personId && people.some((person) => String(person.id) === String(savedFilters.personId))) {
    payroll.person.value = savedFilters.personId;
  }
  await refreshPayroll();
}

async function refreshPayroll() {
  const { from, to } = monthRange(selectedMonth);
  payroll.monthLabel.textContent = formatMonthLabel(selectedMonth);
  payroll.nextMonth.disabled = selectedMonth >= monthKey(new Date());
  payroll.status.textContent = "Calculando";
  const [approvalRows, operationRows] = await Promise.all([
    payrollApi(`/aprobaciones?desde=${from}&hasta=${to}`),
    payrollApi("/operaciones"),
  ]);
  jornals = approvalRows;
  operations = operationRows;
  renderPayroll();
}

function renderPayroll() {
  savePayrollFilters();
  const person = selectedPerson();
  if (!person) {
    payroll.status.textContent = "Sin personal";
    return;
  }
  const { from, to } = monthRange(selectedMonth);
  const personJornals = jornals.filter((row) => Number(row.persona_id) === Number(person.id));
  const approvedJornals = personJornals.filter((row) => isLiquidableJornal(row) && Number(row.horas_trabajadas || 0) > 0);
  const pendingJornals = personJornals.filter((row) => !isLiquidableJornal(row) && jornalNeedsPayrollValidation(row));
  const approvedOperations = operations.filter((operation) => {
    const date = String(operation.fecha_hora || "").slice(0, 10);
    return Number(operation.persona_id) === Number(person.id) && date >= from && date <= to && operation.estado === "approved";
  });
  const pendingOperations = operations.filter((operation) => {
    const date = String(operation.fecha_hora || "").slice(0, 10);
    return Number(operation.persona_id) === Number(person.id) && date >= from && date <= to && operation.estado === "pending";
  });
  const workedHours = sumNumbers(approvedJornals.map((row) => row.horas_trabajadas));
  const hourlyRate = Number(person.valor_hora || 0);
  const hoursTotal = workedHours * hourlyRate;
  const operationTotal = sumNumbers(approvedOperations.map((operation) => operation.valor));
  const grossTotal = hoursTotal + operationTotal;
  const deductionTotal = calculatedDeductions(grossTotal).reduce((total, item) => total + item.amount, 0);
  const netTotal = grossTotal - deductionTotal;

  payroll.totalHours.textContent = `${formatHours(workedHours)} h`;
  payroll.hourlyRate.textContent = formatMoney(hourlyRate);
  payroll.operationsTotal.textContent = formatMoney(operationTotal);
  payroll.operationsCount.textContent = approvedOperations.length;
  payroll.subtotal.textContent = formatMoney(grossTotal);
  payroll.deductionsTotal.textContent = formatMoney(deductionTotal);
  payroll.netTotal.textContent = formatMoney(netTotal);
  payroll.grossBreakdown.textContent = `${formatMoney(hoursTotal)} horas + ${formatMoney(operationTotal)} operaciones - ${formatMoney(deductionTotal)} deducciones`;
  payroll.pendingCount.textContent = `${pendingJornals.length} pendientes`;
  payroll.pendingOperationsCount.textContent = `${pendingOperations.length} pendientes`;
  payroll.status.textContent = pendingJornals.length || pendingOperations.length ? "Con pendientes" : "Lista para revisar";
  payroll.approvedHoursBadge.textContent = `${formatHours(workedHours)} h`;
  payroll.approvedOperationsBadge.textContent = `${approvedOperations.length} operaciones`;

  renderPendingJornals(pendingJornals);
  renderPendingOperations(pendingOperations);
  renderApprovedJornals(approvedJornals);
  renderApprovedOperations(approvedOperations);
  renderDeductions(grossTotal);
}

function isLiquidableJornal(row) {
  return ["APROBADA", "VALIDADA_CON_INCIDENCIA"].includes(String(row.estado_aprobacion || "").toUpperCase());
}

function jornalNeedsPayrollValidation(row) {
  const status = String(row.estado_turno || "").toUpperCase();
  const markIds = Array.isArray(row.marcas_ids) ? row.marcas_ids : [];
  return status === "NORMAL" || Number(row.horas_trabajadas || 0) > 0 || Boolean(row.entrada_id || row.salida_id || markIds.length);
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function shiftLabel(row) {
  const state = String(row.estado_turno || "").toUpperCase();
  if (state !== "NORMAL") return state || "VACIO";
  const activity = row.actividad_ubicacion || "LOGISTICA";
  return `${row.hora_inicio || "--:--"} - ${row.hora_fin || "--:--"} · ${activity}`;
}

function approvalLabel(row) {
  const status = String(row.estado_aprobacion || "PENDIENTE").toUpperCase();
  if (isExpectedNoWorkApproval(row)) return "No requiere";
  if (status === "APROBADA" && row.modo_aprobacion === "AUTO") return "Validado auto";
  if (status === "APROBADA") return "Validado manual";
  if (status === "VALIDADA_CON_INCIDENCIA") return "Validado con incidencia";
  if (status === "REQUIERE_REVISION") return "Requiere revisión";
  if (status === "RECHAZADA") return "Rechazado";
  return "Pendiente";
}

function isExpectedNoWorkApproval(row) {
  return String(row?.estado_aprobacion || "").toUpperCase() === "APROBADA"
    && row?.modo_aprobacion === "AUTO"
    && String(row?.observacion_aprobacion || "").includes("estado sin horario");
}

function approvalClass(row) {
  const status = String(row.estado_aprobacion || "PENDIENTE").toUpperCase();
  if (status === "APROBADA" && row.modo_aprobacion === "AUTO") return "approved-auto";
  if (status === "APROBADA") return "approved";
  if (status === "VALIDADA_CON_INCIDENCIA") return "approved-with-incident";
  if (status === "REQUIERE_REVISION") return "requires-review";
  if (status === "RECHAZADA") return "rejected";
  return "pending";
}

function renderPendingJornals(rows) {
  if (!rows.length) {
    payroll.pendingBody.innerHTML = `<tr><td colspan="6">Sin jornales pendientes para esta persona.</td></tr>`;
    return;
  }
  payroll.pendingBody.innerHTML = rows
    .map((row) => `<tr class="payroll-pending-row">
      <td>${formatDate(row.fecha)}</td>
      <td>${escapePayrollText(shiftLabel(row))}</td>
      <td>${row.entrada_hora || "-"}</td>
      <td>${row.salida_hora || "-"}</td>
      <td>${formatHours(row.horas_trabajadas)} h</td>
      <td><span class="mark-pill ${approvalClass(row)}">${approvalLabel(row)}</span></td>
    </tr>`)
    .join("");
}

function renderPendingOperations(rows) {
  if (!rows.length) {
    payroll.pendingOperationsBody.innerHTML = `<tr><td colspan="6">Sin operaciones pendientes para esta persona.</td></tr>`;
    return;
  }
  payroll.pendingOperationsBody.innerHTML = rows
    .slice()
    .sort((a, b) => String(a.fecha_hora).localeCompare(String(b.fecha_hora)))
    .map((operation) => `<tr class="payroll-pending-row">
      <td>${formatOperationDate(operation.fecha_hora)}</td>
      <td>${escapePayrollText(operation.tipo_operacion || "-")}</td>
      <td>${escapePayrollText(operation.franja || "-")}</td>
      <td>${escapePayrollText(operation.referencia || "-")}</td>
      <td>${formatMoney(operation.valor)}</td>
      <td><span class="mark-pill pending">Pendiente</span></td>
    </tr>`)
    .join("");
}

function renderApprovedJornals(rows) {
  if (!rows.length) {
    payroll.approvedBody.innerHTML = `<tr><td colspan="4">Sin jornales validados para liquidar.</td></tr>`;
    return;
  }
  payroll.approvedBody.innerHTML = rows
    .map((row) => `<tr>
      <td>${formatDate(row.fecha)}</td>
      <td>${escapePayrollText(shiftLabel(row))}</td>
      <td>${formatHours(row.horas_trabajadas)} h</td>
      <td><span class="mark-pill ${approvalClass(row)}">${approvalLabel(row)}</span></td>
    </tr>`)
    .join("");
}

function renderApprovedOperations(rows) {
  if (!rows.length) {
    payroll.operationsBody.innerHTML = `<tr><td colspan="4">Sin operaciones aprobadas para liquidar.</td></tr>`;
    return;
  }
  payroll.operationsBody.innerHTML = rows
    .slice()
    .sort((a, b) => String(a.fecha_hora).localeCompare(String(b.fecha_hora)))
    .map((operation) => `<tr>
      <td>${formatOperationDate(operation.fecha_hora)}</td>
      <td>${escapePayrollText(operation.tipo_operacion || "-")}</td>
      <td>${escapePayrollText(operation.franja || "-")}</td>
      <td>${formatMoney(operation.valor)}</td>
    </tr>`)
    .join("");
}

function calculatedDeductions(grossTotal) {
  return deductions.map((deduction) => {
    const rawValue = parseDecimalInput(deduction.value);
    const amount = deduction.type === "percent" ? grossTotal * (rawValue / 100) : rawValue;
    return { ...deduction, amount: Math.max(0, amount) };
  });
}

function isValidDecimalInput(value) {
  return /^\d*(?:[,.]\d{0,2})?$/.test(String(value || "").trim());
}

function parseDecimalInput(value) {
  const normalized = String(value || "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderDeductions(grossTotal) {
  if (!deductions.length) {
    payroll.deductionsBody.innerHTML = `<tr><td colspan="5">Sin deducciones cargadas.</td></tr>`;
    return;
  }
  const calculated = calculatedDeductions(grossTotal);
  payroll.deductionsBody.innerHTML = calculated
    .map((deduction) => `<tr>
      <td><input data-deduction-name="${deduction.id}" type="text" value="${escapePayrollText(deduction.name)}" placeholder="Concepto" /></td>
      <td>
        <select data-deduction-type="${deduction.id}">
          <option value="fixed" ${deduction.type === "fixed" ? "selected" : ""}>Monto fijo</option>
          <option value="percent" ${deduction.type === "percent" ? "selected" : ""}>% sobre total</option>
        </select>
      </td>
      <td><input class="${isValidDecimalInput(deduction.value) ? "" : "input-error"}" data-deduction-value="${deduction.id}" type="text" inputmode="decimal" value="${escapePayrollText(deduction.value)}" placeholder="0,00" /></td>
      <td>${formatMoney(deduction.amount)}</td>
      <td><button class="ghost-button small" data-remove-deduction="${deduction.id}" type="button">Eliminar</button></td>
    </tr>`)
    .join("");
}

function addDeduction() {
  deductions.push({
    id: `deduction-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    type: "fixed",
    value: "",
  });
  renderPayroll();
}

function updateDeduction(id, patch, rerender = true) {
  deductions = deductions.map((deduction) => deduction.id === id ? { ...deduction, ...patch } : deduction);
  if (rerender) renderPayroll();
}

function removeDeduction(id) {
  deductions = deductions.filter((deduction) => deduction.id !== id);
  renderPayroll();
}

function showPayrollToast(message) {
  payroll.toast.textContent = message;
  payroll.toast.classList.add("visible");
  window.setTimeout(() => payroll.toast.classList.remove("visible"), 2200);
}

payroll.person.addEventListener("change", () => {
  savePayrollFilters();
  renderPayroll();
});
payroll.previousMonth.addEventListener("click", () => {
  selectedMonth = addMonths(selectedMonth, -1);
  savePayrollFilters();
  refreshPayroll().catch((error) => showPayrollToast(error.message));
});
payroll.currentMonth.addEventListener("click", () => {
  selectedMonth = monthKey(new Date());
  savePayrollFilters();
  refreshPayroll().catch((error) => showPayrollToast(error.message));
});
payroll.nextMonth.addEventListener("click", () => {
  selectedMonth = addMonths(selectedMonth, 1);
  savePayrollFilters();
  refreshPayroll().catch((error) => showPayrollToast(error.message));
});
payroll.addDeduction.addEventListener("click", addDeduction);
payroll.deductionsBody.addEventListener("input", (event) => {
  const nameInput = event.target.closest("[data-deduction-name]");
  const valueInput = event.target.closest("[data-deduction-value]");
  if (nameInput) updateDeduction(nameInput.dataset.deductionName, { name: nameInput.value }, false);
  if (valueInput) {
    const valid = isValidDecimalInput(valueInput.value);
    valueInput.classList.toggle("input-error", !valid);
    updateDeduction(valueInput.dataset.deductionValue, { value: valueInput.value }, valid);
  }
});
payroll.deductionsBody.addEventListener("change", (event) => {
  const typeInput = event.target.closest("[data-deduction-type]");
  if (typeInput) updateDeduction(typeInput.dataset.deductionType, { type: typeInput.value });
});
payroll.deductionsBody.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-deduction]");
  if (remove) removeDeduction(remove.dataset.removeDeduction);
});

initPayroll().catch((error) => showPayrollToast(error.message || "No se pudo cargar liquidación"));
