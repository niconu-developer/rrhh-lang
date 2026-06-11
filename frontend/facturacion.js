if (!requireModuleAccess("facturacion")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const BILLING_API_BASE = apiBase();
const billing = {
  importForm: document.querySelector("#billingImportForm"),
  importFile: document.querySelector("#billingImportFile"),
  importFileName: document.querySelector("#billingImportFileName"),
  form: document.querySelector("#billingForm"),
  id: document.querySelector("#billingId"),
  order: document.querySelector("#billingOrder"),
  date: document.querySelector("#billingDate"),
  amount: document.querySelector("#billingAmount"),
  reference: document.querySelector("#billingReference"),
  place: document.querySelector("#billingPlace"),
  note: document.querySelector("#billingNote"),
  clear: document.querySelector("#clearBillingForm"),
  previousMonth: document.querySelector("#billingPreviousMonth"),
  currentMonth: document.querySelector("#billingCurrentMonth"),
  nextMonth: document.querySelector("#billingNextMonth"),
  monthLabel: document.querySelector("#billingMonthLabel"),
  search: document.querySelector("#billingSearch"),
  total: document.querySelector("#billingTotal"),
  count: document.querySelector("#billingCount"),
  body: document.querySelector("#billingTableBody"),
  toast: document.querySelector("#toast"),
};

let billingRows = [];
let selectedBillingMonth = monthKey(new Date());

async function billingApiGet(path) {
  const response = await fetch(`${BILLING_API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo conectar con la base");
  return payload;
}

async function billingApiPost(path, payload) {
  const response = await fetch(`${BILLING_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo guardar");
  return data;
}

async function billingApiUpload(path, formData) {
  const response = await fetch(`${BILLING_API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo importar");
  return data;
}

function inputDateValue(date) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date = new Date()) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function addMonths(value, amount) {
  const [year, month] = String(value || monthKey()).split("-").map(Number);
  return monthKey(new Date(year, (month || 1) - 1 + amount, 1));
}

function monthRange(value = monthKey()) {
  const [year, month] = String(value || monthKey()).split("-").map(Number);
  return {
    first: new Date(year, (month || 1) - 1, 1),
    from: inputDateValue(new Date(year, (month || 1) - 1, 1)),
    to: inputDateValue(new Date(year, month || 1, 0)),
  };
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function formatMonthLabel(value) {
  const { first } = monthRange(value);
  return capitalize(first.toLocaleDateString("es-UY", { month: "long", year: "numeric" }));
}

function formatDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeBillingText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseAmount(value) {
  const raw = String(value || "").trim();
  const cleaned = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validAmount(value) {
  return /^\d{1,12}(?:[,.]\d{1,2})?$/.test(String(value || "").trim()) || /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(String(value || "").trim());
}

async function refreshBilling() {
  const range = monthRange(selectedBillingMonth);
  billing.monthLabel.textContent = formatMonthLabel(selectedBillingMonth);
  billing.nextMonth.disabled = selectedBillingMonth >= monthKey(new Date());
  const query = `desde=${range.from}&hasta=${range.to}`;
  billingRows = await billingApiGet(`/facturacion?${query}`);
  renderBilling();
}

function visibleBillingRows() {
  const query = normalizeSearchText(billing.search.value);
  return billingRows.filter((row) => {
    const text = normalizeSearchText(`${row.orden || ""} ${row.referencia || ""} ${row.lugar || ""} ${row.observacion || ""}`);
    return !query || text.includes(query);
  });
}

function renderBilling() {
  const rows = visibleBillingRows();
  const total = rows.reduce((sum, row) => sum + Number(row.monto || 0), 0);
  billing.total.textContent = formatMoney(total);
  billing.count.textContent = `${rows.length} líneas`;
  if (!rows.length) {
    billing.body.innerHTML = `<tr><td colspan="7">Sin datos de facturación para los filtros seleccionados.</td></tr>`;
    return;
  }
  billing.body.innerHTML = rows
    .map((row) => `<tr>
      <td>${escapeBillingText(row.orden)}</td>
      <td>${formatDate(row.fecha)}</td>
      <td>${formatMoney(row.monto)}</td>
      <td>${escapeBillingText(row.referencia || "-")}</td>
      <td>${escapeBillingText(row.lugar || "-")}</td>
      <td>${escapeBillingText(row.observacion || "-")}</td>
      <td>
        <div class="table-actions">
          <button class="ghost-button small" data-edit-billing="${row.id}" type="button">Editar</button>
          <button class="ghost-button small" data-delete-billing="${row.id}" type="button">Eliminar</button>
        </div>
      </td>
    </tr>`)
    .join("");
}

function clearBillingForm() {
  billing.id.value = "";
  billing.order.value = "";
  billing.amount.value = "";
  billing.reference.value = "";
  billing.place.value = "";
  billing.note.value = "";
  billing.date.value = inputDateValue(new Date());
  billing.amount.classList.remove("input-error");
}

function editBilling(id) {
  const row = billingRows.find((item) => String(item.id) === String(id));
  if (!row) return;
  billing.id.value = row.id;
  billing.order.value = row.orden || "";
  billing.date.value = row.fecha || "";
  billing.amount.value = String(row.monto || 0).replace(".", ",");
  billing.reference.value = row.referencia || "";
  billing.place.value = row.lugar || "";
  billing.note.value = row.observacion || "";
  billing.order.focus();
}

async function saveBilling(event) {
  event.preventDefault();
  if (!validAmount(billing.amount.value)) {
    billing.amount.classList.add("input-error");
    showBillingToast("El monto debe tener hasta 2 decimales");
    return;
  }
  const payload = {
    orden: billing.order.value.trim(),
    fecha: billing.date.value,
    monto: parseAmount(billing.amount.value),
    referencia: billing.reference.value.trim(),
    lugar: billing.place.value.trim(),
    observacion: billing.note.value.trim(),
  };
  const path = billing.id.value ? `/facturacion/${billing.id.value}` : "/facturacion";
  await billingApiPost(path, payload);
  clearBillingForm();
  showBillingToast("Facturación guardada");
  await refreshBilling();
}

async function importBilling(event) {
  event.preventDefault();
  const file = billing.importFile.files?.[0];
  if (!file) {
    showBillingToast("Elegí un CSV o Excel para importar");
    return;
  }
  const formData = new FormData();
  formData.append("archivo", file);
  const result = await billingApiUpload("/facturacion/importar", formData);
  billing.importFile.value = "";
  billing.importFileName.textContent = "CSV o XLSX";
  const errorText = result.errores?.length ? ` · ${result.errores.length} filas con error` : "";
  showBillingToast(`${result.importadas || 0} nuevas · ${result.actualizadas || 0} actualizadas${errorText}`);
  await refreshBilling();
}

async function deleteBilling(id) {
  await billingApiPost(`/facturacion/${id}/delete`, {});
  showBillingToast("Línea eliminada");
  await refreshBilling();
}

function showBillingToast(message) {
  billing.toast.textContent = message;
  billing.toast.classList.add("visible");
  window.setTimeout(() => billing.toast.classList.remove("visible"), 2200);
}

function initBilling() {
  clearBillingForm();
  refreshBilling().catch((error) => showBillingToast(error.message));
}

billing.importForm.addEventListener("submit", (event) => importBilling(event).catch((error) => showBillingToast(error.message)));
billing.importFile.addEventListener("change", () => {
  billing.importFileName.textContent = billing.importFile.files?.[0]?.name || "CSV o XLSX";
});
billing.form.addEventListener("submit", (event) => saveBilling(event).catch((error) => showBillingToast(error.message)));
billing.clear.addEventListener("click", clearBillingForm);
billing.amount.addEventListener("input", () => billing.amount.classList.toggle("input-error", Boolean(billing.amount.value) && !validAmount(billing.amount.value)));
billing.previousMonth.addEventListener("click", () => {
  selectedBillingMonth = addMonths(selectedBillingMonth, -1);
  refreshBilling().catch((error) => showBillingToast(error.message));
});
billing.currentMonth.addEventListener("click", () => {
  selectedBillingMonth = monthKey(new Date());
  refreshBilling().catch((error) => showBillingToast(error.message));
});
billing.nextMonth.addEventListener("click", () => {
  const nextMonth = addMonths(selectedBillingMonth, 1);
  if (nextMonth > monthKey(new Date())) return;
  selectedBillingMonth = nextMonth;
  refreshBilling().catch((error) => showBillingToast(error.message));
});
billing.search.addEventListener("input", renderBilling);
billing.body.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-billing]");
  const remove = event.target.closest("[data-delete-billing]");
  if (edit) editBilling(edit.dataset.editBilling);
  if (remove) deleteBilling(remove.dataset.deleteBilling).catch((error) => showBillingToast(error.message));
});

initBilling();
