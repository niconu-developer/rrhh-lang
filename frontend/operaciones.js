if (!requireModuleAccess("operaciones")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const OPERATION_API_BASE = apiBase();

const operationElements = {
  from: document.querySelector("#operationFrom"),
  to: document.querySelector("#operationTo"),
  today: document.querySelector("#operationToday"),
  person: document.querySelector("#operationPerson"),
  status: document.querySelector("#operationStatus"),
  count: document.querySelector("#operationCount"),
  pagination: document.querySelector("#operationPagination"),
  selectAll: document.querySelector("#selectAllOperations"),
  approveSelection: document.querySelector("#approveOperations"),
  rejectSelection: document.querySelector("#rejectOperations"),
  body: document.querySelector("#operationTableBody"),
  detailModal: document.querySelector("#operationDetailModal"),
  closeDetail: document.querySelector("#closeOperationModal"),
  detailTitle: document.querySelector("#operationModalTitle"),
  detailBody: document.querySelector("#operationDetailBody"),
  approveDetail: document.querySelector("#approveOperationDetail"),
  rejectDetail: document.querySelector("#rejectOperationDetail"),
  editForm: document.querySelector("#operationEditForm"),
  rejectModal: document.querySelector("#operationRejectModal"),
  rejectReason: document.querySelector("#operationRejectReason"),
  cancelReject: document.querySelector("#cancelOperationReject"),
  confirmReject: document.querySelector("#confirmOperationReject"),
  toast: document.querySelector("#toast"),
};

const OPERATION_PAGE_SIZE = 50;
let operationRows = [];
let selectedOperationIds = new Set();
let selectedOperation = null;
let pendingRejectIds = [];
let operationPage = 1;
let operationsLoading = false;
let operationConfig = {
  operationBands: [...DEFAULT_OPERATION_BANDS],
  operationTariffs: [],
};

async function initOperations() {
  setTodayOperationRange();
  await loadOperationConfig();
  await refreshOperations();
}

function setTodayOperationRange() {
  const today = inputDateValue(new Date());
  operationElements.from.value = today;
  operationElements.to.value = today;
}

async function operationApiGet(path) {
  const response = await fetch(`${OPERATION_API_BASE}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function operationApiPost(path, payload) {
  const response = await fetch(`${OPERATION_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `No se pudo guardar ${path}`);
  return data;
}

async function refreshOperations() {
  try {
    setOperationsLoading(true);
    const { from, to } = selectedOperationRange();
    const query = new URLSearchParams({
      desde: inputDateValue(from),
      hasta: inputDateValue(to),
    });
    const status = operationElements.status.value || "pending";
    if (status && status !== "todos") query.set("estado", status);
    const rows = await operationApiGet(`/operaciones?${query.toString()}`);
    operationRows = rows.map(normalizeOperation);
    selectedOperationIds.clear();
    operationPage = 1;
    renderOperations();
  } catch (error) {
    showOperationToast(error.message || "No se pudieron cargar las operaciones");
    operationElements.body.innerHTML = `<tr><td colspan="9">No se pudo conectar con la base local.</td></tr>`;
    updateSelectionControls([]);
    renderOperationPagination(0);
  } finally {
    setOperationsLoading(false);
  }
}

async function loadOperationConfig() {
  try {
    const [rows, tariffs] = await Promise.all([
      operationApiGet("/configuracion"),
      operationApiGet("/operacion-tarifas?activas=1"),
    ]);
    const values = Object.fromEntries(rows.map((row) => [row.clave, parseConfigValue(row.valor)]));
    operationConfig = {
      operationBands: Array.isArray(values.operation_bands) && values.operation_bands.length ? values.operation_bands.map(normalizeOperationBand) : [...DEFAULT_OPERATION_BANDS],
      operationTariffs: Array.isArray(tariffs) ? tariffs : [],
    };
  } catch (error) {
    operationConfig = {
      operationBands: [...DEFAULT_OPERATION_BANDS],
      operationTariffs: [],
    };
  }
}

function parseConfigValue(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function normalizeOperationBand(value) {
  return value === "8 a 10 horas" ? "8 a 12 horas" : value;
}

function normalizeOperation(row) {
  return {
    id: String(row.id),
    personId: row.persona_id,
    person: row.persona || "",
    timestamp: row.fecha_hora || "",
    type: row.tipo_operacion || "Operación",
    tariffId: row.operacion_tarifa_id ? String(row.operacion_tarifa_id) : "",
    tariffCategory: row.tarifa_categoria || "",
    tariffType: row.tarifa_tipo || "",
    band: row.franja || "",
    value: Number(row.valor || 0),
    reference: row.referencia || "",
    note: row.observacion || "",
    status: row.estado || "pending",
    rejectionReason: row.motivo_rechazo || "",
    planStatus: row.plan_estado || "VACIO",
    planStart: row.plan_hora_inicio || "",
    planEnd: row.plan_hora_fin || "",
    planActivity: row.plan_actividad_ubicacion || "",
  };
}

function renderOperations() {
  const rows = filteredOperations();
  syncSelectionWithRows(rows);
  renderOperationTotals(rows);
  const pageRows = paginatedOperationRows(rows);
  if (!rows.length) {
    operationElements.body.innerHTML = `<tr><td colspan="9">Sin operaciones para los filtros seleccionados.</td></tr>`;
    updateSelectionControls(rows);
    renderOperationPagination(0);
    return;
  }
  let lastDate = "";
  operationElements.body.innerHTML = pageRows
    .flatMap((row) => {
      const rowDate = operationDateKey(row);
      const dateHeader = rowDate !== lastDate
        ? `<tr class="operation-date-row"><td colspan="9">${formatFullOperationDate(row.timestamp)}</td></tr>`
        : "";
      lastDate = rowDate;
      return [dateHeader, `<tr class="${selectedOperationIds.has(row.id) ? "selected" : ""}">
      <td class="select-column" data-toggle-operation="${row.id}">
        <input
          type="checkbox"
          data-select-operation="${row.id}"
          aria-label="Seleccionar operación de ${escapeHtml(row.person)}"
          ${selectedOperationIds.has(row.id) ? "checked" : ""}
        />
      </td>
      <td>${escapeHtml(row.person)}</td>
      <td>${operationPlanCell(row)}</td>
      <td><strong>${escapeHtml(row.type)}</strong><br><span class="muted">${escapeHtml(row.band || "Sin franja")}</span></td>
      <td>${escapeHtml(row.reference || "Sin proyecto")}<br><span class="muted">${escapeHtml(row.note || "")}</span></td>
      <td>${formatMoney(row.value)}</td>
      <td><span class="mark-pill ${row.status}">${operationStatusLabel(row.status)}</span></td>
      <td>${escapeHtml(row.rejectionReason || "-")}</td>
      <td class="approval-actions-cell">
        <div class="table-actions">
          <button class="ghost-button small" data-view-operation="${row.id}" type="button">Detalles / editar</button>
          <button class="ghost-button small" data-approve-operation="${row.id}" type="button" ${row.status === "approved" ? "disabled" : ""}>Aprobar</button>
          <button class="ghost-button small" data-reject-operation="${row.id}" type="button" ${row.status === "rejected" ? "disabled" : ""}>Rechazar</button>
        </div>
      </td>
    </tr>`];
    })
    .filter(Boolean)
    .join("");
  updateSelectionControls(rows);
  renderOperationPagination(rows.length);
}

function paginatedOperationRows(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / OPERATION_PAGE_SIZE));
  operationPage = Math.min(Math.max(1, operationPage), totalPages);
  const start = (operationPage - 1) * OPERATION_PAGE_SIZE;
  return rows.slice(start, start + OPERATION_PAGE_SIZE);
}

function renderOperationPagination(totalRows) {
  if (!operationElements.pagination) return;
  if (!totalRows) {
    operationPage = 1;
    operationElements.pagination.innerHTML = `
      <span>0-0 de 0</span>
      <div class="pagination-actions">
        <button class="ghost-button small" data-operation-page="prev" type="button" disabled>Anterior</button>
        <strong>Página 1 de 1</strong>
        <button class="ghost-button small" data-operation-page="next" type="button" disabled>Siguiente</button>
      </div>
    `;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalRows / OPERATION_PAGE_SIZE));
  const start = (operationPage - 1) * OPERATION_PAGE_SIZE + 1;
  const end = Math.min(totalRows, operationPage * OPERATION_PAGE_SIZE);
  operationElements.pagination.innerHTML = `
    <span>${start}-${end} de ${totalRows}</span>
    <div class="pagination-actions">
      <button class="ghost-button small" data-operation-page="prev" type="button" ${operationPage <= 1 ? "disabled" : ""}>Anterior</button>
      <strong>Página ${operationPage} de ${totalPages}</strong>
      <button class="ghost-button small" data-operation-page="next" type="button" ${operationPage >= totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

function setOperationsLoading(isLoading) {
  operationsLoading = isLoading;
  if (isLoading) {
    operationElements.body.innerHTML = `
      <tr>
        <td class="loading-row" colspan="9">
          <span class="loading-inline"><i></i>Cargando operaciones...</span>
        </td>
      </tr>
    `;
    renderOperationPagination(0);
  }
  if (operationElements.today) operationElements.today.disabled = isLoading;
}

function filteredOperations() {
  const { from, to } = selectedOperationRange();
  const personQuery = operationElements.person.value;
  return operationRows
    .filter((row) => {
      const date = parseTimestampDate(row.timestamp);
      const matchesRange = dateInRange(date, from, to);
      const matchesPerson = matchesMultiSearchQuery(row.person, personQuery, normalizeSearchText);
      return matchesRange && matchesPerson;
    })
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)) || a.person.localeCompare(b.person));
}

function renderOperationTotals(rows) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  operationElements.count.textContent = `${rows.length} operaciones · ${formatMoney(total)}`;
}

async function openOperationDetail(id) {
  selectedOperation = operationRows.find((row) => row.id === String(id));
  if (!selectedOperation) return;
  operationElements.detailTitle.textContent = `${selectedOperation.person} · ${formatOperationDate(selectedOperation.timestamp)}`;
  operationElements.detailBody.innerHTML = `<div class="loading-row"><span class="loading-inline"><i></i>Cargando detalle...</span></div>`;
  operationElements.approveDetail.disabled = selectedOperation.status === "approved";
  operationElements.rejectDetail.disabled = selectedOperation.status === "rejected";
  operationElements.detailModal.classList.add("open");
  operationElements.detailModal.setAttribute("aria-hidden", "false");
  const context = await loadOperationDayContext(selectedOperation).catch(() => []);
  renderOperationDetailEditor(context);
}

async function loadOperationDayContext(operation) {
  const date = operationDateKey(operation);
  if (!date || !operation.personId) return [];
  return operationApiGet(`/aprobaciones?desde=${date}&hasta=${date}&persona=${operation.personId}`);
}

function renderOperationDetailEditor(contextRows = []) {
  if (!selectedOperation) return;
  const tariffOptions = operationEditTariffs(selectedOperation);
  const selectedTariff = tariffOptions.some((tariff) => String(tariff.id) === selectedOperation.tariffId)
    ? selectedOperation.tariffId
    : String(tariffOptions[0]?.id || "");
  const selectedBand = operationConfig.operationBands.includes(selectedOperation.band) ? selectedOperation.band : operationConfig.operationBands[0] || selectedOperation.band;
  operationElements.detailBody.innerHTML = `
    <section class="operation-detail-section">
      <span>Operación enviada</span>
      <div class="operation-detail-edit-grid">
        <label>Categoría
          <select id="operationEditType">
            ${tariffOptions.length
              ? tariffOptions.map((tariff) => `<option value="${tariff.id}" ${String(tariff.id) === String(selectedTariff) ? "selected" : ""}>${escapeHtml(operationTariffLabel(tariff))}</option>`).join("")
              : `<option value="">Sin tarifas activas</option>`}
          </select>
        </label>
        <label>Franja
          <select id="operationEditBand">
            ${operationConfig.operationBands.map((band) => `<option value="${escapeHtml(band)}" ${band === selectedBand ? "selected" : ""}>${escapeHtml(band)}</option>`).join("")}
          </select>
        </label>
        <label>Valor estimado
          <div class="operation-value-box" id="operationEditValue">${formatMoney(operationValueForSelection(selectedBand, selectedTariff))}</div>
        </label>
        <article>
          <span>Proyecto</span>
          <strong>${escapeHtml(selectedOperation.reference || "Sin proyecto")}</strong>
          ${selectedOperation.note ? `<small>${escapeHtml(selectedOperation.note)}</small>` : ""}
        </article>
        <article>
          <span>Estado</span>
          <strong>${escapeHtml(operationStatusLabel(selectedOperation.status))}</strong>
          ${selectedOperation.rejectionReason ? `<small>${escapeHtml(selectedOperation.rejectionReason)}</small>` : ""}
        </article>
      </div>
    </section>
    <section class="operation-detail-section operation-day-layout">
      <article class="operation-day-plan">
        <span>Plan semanal</span>
        <strong>${escapeHtml(operationPlanText(selectedOperation))}</strong>
        <small>${escapeHtml(selectedOperation.planActivity || "Sin especificar")}</small>
      </article>
      <article class="operation-day-segments">
        ${renderOperationDayContext(contextRows)}
      </article>
    </section>
  `;
  operationElements.editForm.dataset.operationId = selectedOperation.id;
  renderOperationEditValue();
}

function operationEditTariffs(operation) {
  const activeTariffs = operationConfig.operationTariffs.filter((tariff) => Number(tariff.activo) !== 0);
  if (!operation.tariffId || activeTariffs.some((tariff) => String(tariff.id) === operation.tariffId)) return activeTariffs;
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

function operationTariffLabel(tariff) {
  return `${tariff.categoria || "Sin categoría"} · ${tariff.tipo || "Sin tipo"}`;
}

function renderOperationEditValue() {
  if (!selectedOperation) return;
  const value = operationValueForSelection();
  const target = document.querySelector("#operationEditValue");
  if (target) target.textContent = formatMoney(value);
}

function operationValueForSelection(band = null, tariffId = null) {
  const selectedBand = band || document.querySelector("#operationEditBand")?.value || selectedOperation?.band;
  const selectedTariffId = tariffId || document.querySelector("#operationEditType")?.value || selectedOperation?.tariffId;
  const tariff = operationEditTariffs(selectedOperation).find((item) => String(item.id) === String(selectedTariffId));
  return operationTariffValueForBand(tariff, selectedBand);
}

async function saveOperationEdit(event) {
  event.preventDefault();
  if (!selectedOperation) return;
  const tariffId = document.querySelector("#operationEditType")?.value || "";
  const band = document.querySelector("#operationEditBand")?.value || "";
  const value = operationValueForSelection(band, tariffId);
  await updateOperation(selectedOperation.id, {
    operacion_tarifa_id: tariffId ? Number(tariffId) : null,
    franja: band,
    valor: value,
    estado: selectedOperation.status,
  });
  showOperationToast("Operación actualizada");
  closeOperationDetail();
  await refreshOperations();
}

function closeOperationDetail() {
  operationElements.detailModal.classList.remove("open");
  operationElements.detailModal.setAttribute("aria-hidden", "true");
}

function openRejectModal(ids) {
  pendingRejectIds = ids.map(String);
  if (!pendingRejectIds.length) return;
  operationElements.rejectReason.value = "";
  operationElements.rejectModal.classList.add("open");
  operationElements.rejectModal.setAttribute("aria-hidden", "false");
  operationElements.rejectReason.focus();
}

function closeRejectModal() {
  operationElements.rejectModal.classList.remove("open");
  operationElements.rejectModal.setAttribute("aria-hidden", "true");
  pendingRejectIds = [];
}

async function updateOperation(id, payload) {
  await operationApiPost(`/operaciones/${id}`, payload);
}

async function approveOperations(ids) {
  const approvableIds = ids.filter((id) => operationRows.find((row) => row.id === String(id) && row.status !== "approved"));
  if (!approvableIds.length) {
    showOperationToast("No hay operaciones pendientes o rechazadas en la selección");
    return;
  }
  await Promise.all(approvableIds.map((id) => updateOperation(id, { estado: "approved", motivo_rechazo: "" })));
  showOperationToast(`${approvableIds.length} operaciones aprobadas`);
  selectedOperationIds.clear();
  closeOperationDetail();
  await refreshOperations();
}

async function rejectPendingOperations() {
  const reason = operationElements.rejectReason.value.trim();
  if (!reason) {
    showOperationToast("Ingresá un motivo de rechazo");
    operationElements.rejectReason.focus();
    return;
  }
  const ids = pendingRejectIds.filter((id) => operationRows.find((row) => row.id === String(id) && row.status !== "rejected"));
  if (!ids.length) {
    closeRejectModal();
    showOperationToast("No hay operaciones para rechazar");
    return;
  }
  await Promise.all(ids.map((id) => updateOperation(id, { estado: "rejected", motivo_rechazo: reason })));
  showOperationToast(`${ids.length} operaciones rechazadas`);
  selectedOperationIds.clear();
  closeRejectModal();
  closeOperationDetail();
  await refreshOperations();
}

function selectedVisibleOperations() {
  return filteredOperations().filter((row) => selectedOperationIds.has(row.id));
}

function toggleOperationSelection(id, checked) {
  if (checked) selectedOperationIds.add(String(id));
  else selectedOperationIds.delete(String(id));
  renderOperations();
}

function toggleAllVisibleOperations(checked) {
  filteredOperations().forEach((row) => {
    if (checked) selectedOperationIds.add(row.id);
    else selectedOperationIds.delete(row.id);
  });
  renderOperations();
}

function syncSelectionWithRows(rows) {
  const visibleIds = new Set(rows.map((row) => row.id));
  selectedOperationIds = new Set([...selectedOperationIds].filter((id) => visibleIds.has(id)));
}

function updateSelectionControls(rows = filteredOperations()) {
  const selected = selectedVisibleOperations();
  const rejectableSelected = selected.filter((row) => row.status !== "rejected");
  const approvableSelected = selected.filter((row) => row.status !== "approved");
  operationElements.approveSelection.disabled = approvableSelected.length === 0;
  operationElements.rejectSelection.disabled = rejectableSelected.length === 0;
  operationElements.approveSelection.textContent = approvableSelected.length ? `Aprobar (${approvableSelected.length})` : "Aprobar selección";
  operationElements.rejectSelection.textContent = rejectableSelected.length ? `Rechazar (${rejectableSelected.length})` : "Rechazar selección";
  operationElements.selectAll.disabled = rows.length === 0;
  operationElements.selectAll.checked = rows.length > 0 && selected.length === rows.length;
  operationElements.selectAll.indeterminate = selected.length > 0 && selected.length < rows.length;
}

function selectedOperationRange() {
  const from = parseInputDate(operationElements.from.value) || new Date();
  const to = parseInputDate(operationElements.to.value) || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function parseTimestampDate(value) {
  const [datePart] = String(value || "").split(/[ T]/);
  return parseInputDate(datePart);
}

function dateInRange(date, from, to) {
  if (!date) return false;
  const day = startOfDay(date).getTime();
  return day >= startOfDay(from).getTime() && day <= startOfDay(to).getTime();
}

function operationStatusLabel(status) {
  return {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
  }[status] || "Pendiente";
}

function detailItem(label, value) {
  return `<article><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function formatOperationDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFullOperationDate(value) {
  const date = parseTimestampDate(value);
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function operationDateKey(row) {
  return String(row.timestamp || "").slice(0, 10);
}

function operationPlanCell(row) {
  const text = operationPlanText(row);
  const detail = row.planActivity || (row.planStatus !== "NORMAL" ? "" : "Sin especificar");
  return `<div class="operation-plan-cell">
    <strong>${escapeHtml(text)}</strong>
    ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
  </div>`;
}

function operationPlanText(row) {
  if (row.planStatus !== "NORMAL") return row.planStatus || "VACIO";
  return `${row.planStart || "--"} - ${row.planEnd || "--"}`;
}

function renderOperationDayContext(contextRows = []) {
  const row = contextRows[0];
  if (!row) return `<div class="operation-context-empty">Sin jornada registrada para este día.</div>`;
  const segments = Array.isArray(row.tramos) && row.tramos.length ? row.tramos : [];
  const segmentRows = segments.length
    ? segments.map((segment, index) => operationContextSegment(segment, index + 1)).join("")
    : `<div class="operation-context-line empty">
        <span>1</span>
        <strong>Sin tramo completo</strong>
        <span>${escapeHtml(row.entrada_hora || "Sin entrada")}</span>
        <span>${escapeHtml(row.salida_hora || "Sin salida")}</span>
        <span>${escapeHtml(row.entrada_actividad || row.salida_actividad || row.actividad_ubicacion || "-")}</span>
      </div>`;
  return `<div class="operation-context-table">
    <div class="operation-context-head">
      <span>Tramo</span>
      <span>Tipo</span>
      <span>Entrada</span>
      <span>Salida</span>
      <span>Proyecto</span>
    </div>
    ${segmentRows}
  </div>`;
}

function operationContextSegment(segment, index) {
  const project = segment.entrada_actividad || segment.salida_actividad || "Sin proyecto";
  return `<div class="operation-context-line">
    <span>${index}</span>
    <strong>Reloj</strong>
    <span>${escapeHtml(segment.entrada_hora || "--")}</span>
    <span>${escapeHtml(segment.salida_hora || "--")}</span>
    <span>${escapeHtml(project)}</span>
  </div>`;
}

function formatMoney(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-UY")}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseInputDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function inputDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function showOperationToast(message) {
  operationElements.toast.textContent = message;
  operationElements.toast.classList.add("visible");
  window.setTimeout(() => operationElements.toast.classList.remove("visible"), 2200);
}

[operationElements.from, operationElements.to].forEach((element) => element.addEventListener("change", refreshOperations));
operationElements.today?.addEventListener("click", () => {
  setTodayOperationRange();
  refreshOperations();
});
operationElements.person.addEventListener("input", () => {
  operationPage = 1;
  renderOperations();
});
operationElements.status.addEventListener("change", refreshOperations);
operationElements.pagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-operation-page]");
  if (!button || operationsLoading) return;
  operationPage += button.dataset.operationPage === "next" ? 1 : -1;
  renderOperations();
});

operationElements.selectAll.addEventListener("change", () => toggleAllVisibleOperations(operationElements.selectAll.checked));
operationElements.approveSelection.addEventListener("click", () => approveOperations(selectedVisibleOperations().map((row) => row.id)).catch((error) => showOperationToast(error.message)));
operationElements.rejectSelection.addEventListener("click", () => openRejectModal(selectedVisibleOperations().map((row) => row.id)));
operationElements.body.addEventListener("click", (event) => {
  const select = event.target.closest("[data-select-operation]");
  const selectCell = event.target.closest("[data-toggle-operation]");
  const view = event.target.closest("[data-view-operation]");
  const approve = event.target.closest("[data-approve-operation]");
  const reject = event.target.closest("[data-reject-operation]");

  if (selectCell && !select) {
    const checkbox = selectCell.querySelector("[data-select-operation]");
    if (checkbox) toggleOperationSelection(selectCell.dataset.toggleOperation, !checkbox.checked);
  }
  if (view) openOperationDetail(view.dataset.viewOperation).catch((error) => showOperationToast(error.message || "No se pudo cargar el detalle"));
  if (approve) approveOperations([approve.dataset.approveOperation]).catch((error) => showOperationToast(error.message));
  if (reject) openRejectModal([reject.dataset.rejectOperation]);
});

operationElements.body.addEventListener("change", (event) => {
  const select = event.target.closest("[data-select-operation]");
  if (select) toggleOperationSelection(select.dataset.selectOperation, select.checked);
});

operationElements.closeDetail.addEventListener("click", closeOperationDetail);
operationElements.detailModal.addEventListener("click", (event) => {
  if (event.target === operationElements.detailModal) closeOperationDetail();
});
operationElements.approveDetail.addEventListener("click", () => {
  if (selectedOperation) approveOperations([selectedOperation.id]).catch((error) => showOperationToast(error.message));
});
operationElements.rejectDetail.addEventListener("click", () => {
  if (selectedOperation) openRejectModal([selectedOperation.id]);
});
operationElements.detailBody.addEventListener("change", (event) => {
  if (event.target.closest("#operationEditType") || event.target.closest("#operationEditBand")) {
    renderOperationEditValue();
  }
});
operationElements.editForm.addEventListener("submit", (event) => saveOperationEdit(event).catch((error) => showOperationToast(error.message)));
operationElements.cancelReject.addEventListener("click", closeRejectModal);
operationElements.rejectModal.addEventListener("click", (event) => {
  if (event.target === operationElements.rejectModal) closeRejectModal();
});
operationElements.confirmReject.addEventListener("click", () => rejectPendingOperations().catch((error) => showOperationToast(error.message)));

initOperations().catch((error) => showOperationToast(error.message || "No se pudo iniciar operaciones"));
