if (!requireModuleAccess("operaciones")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const OPERATION_API_BASE = apiBase();

const operationElements = {
  from: document.querySelector("#operationFrom"),
  to: document.querySelector("#operationTo"),
  person: document.querySelector("#operationPerson"),
  status: document.querySelector("#operationStatus"),
  count: document.querySelector("#operationCount"),
  selectAll: document.querySelector("#selectAllOperations"),
  approveSelection: document.querySelector("#approveOperations"),
  rejectSelection: document.querySelector("#rejectOperations"),
  body: document.querySelector("#operationTableBody"),
  detailModal: document.querySelector("#operationDetailModal"),
  closeDetail: document.querySelector("#closeOperationModal"),
  detailTitle: document.querySelector("#operationModalTitle"),
  detailBody: document.querySelector("#operationDetailBody"),
  editDetail: document.querySelector("#editOperationDetail"),
  approveDetail: document.querySelector("#approveOperationDetail"),
  rejectDetail: document.querySelector("#rejectOperationDetail"),
  editModal: document.querySelector("#operationEditModal"),
  editForm: document.querySelector("#operationEditForm"),
  editType: document.querySelector("#operationEditType"),
  editBand: document.querySelector("#operationEditBand"),
  editValue: document.querySelector("#operationEditValue"),
  cancelEdit: document.querySelector("#cancelOperationEdit"),
  rejectModal: document.querySelector("#operationRejectModal"),
  rejectReason: document.querySelector("#operationRejectReason"),
  cancelReject: document.querySelector("#cancelOperationReject"),
  confirmReject: document.querySelector("#confirmOperationReject"),
  toast: document.querySelector("#toast"),
};

let operationRows = [];
let selectedOperationIds = new Set();
let selectedOperation = null;
let pendingRejectIds = [];
let operationConfig = {
  operationBands: [...DEFAULT_OPERATION_BANDS],
  operationTariffs: [],
};

async function initOperations() {
  setCurrentMonthOperationRange();
  await loadOperationConfig();
  await refreshOperations();
}

function setCurrentMonthOperationRange() {
  const today = new Date();
  operationElements.from.value = inputDateValue(new Date(today.getFullYear(), today.getMonth(), 1));
  operationElements.to.value = inputDateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
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
    const rows = await operationApiGet("/operaciones");
    operationRows = rows.map(normalizeOperation);
    selectedOperationIds.clear();
    renderOperations();
  } catch (error) {
    showOperationToast(error.message || "No se pudieron cargar las operaciones");
    operationElements.body.innerHTML = `<tr><td colspan="9">No se pudo conectar con la base local.</td></tr>`;
    updateSelectionControls([]);
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
  };
}

function renderOperations() {
  const rows = filteredOperations();
  syncSelectionWithRows(rows);
  renderOperationTotals(rows);
  if (!rows.length) {
    operationElements.body.innerHTML = `<tr><td colspan="9">Sin operaciones para los filtros seleccionados.</td></tr>`;
    updateSelectionControls(rows);
    return;
  }
  operationElements.body.innerHTML = rows
    .map((row) => `<tr class="${selectedOperationIds.has(row.id) ? "selected" : ""}">
      <td class="select-column" data-toggle-operation="${row.id}">
        <input
          type="checkbox"
          data-select-operation="${row.id}"
          aria-label="Seleccionar operación de ${escapeHtml(row.person)}"
          ${selectedOperationIds.has(row.id) ? "checked" : ""}
        />
      </td>
      <td>${formatOperationDate(row.timestamp)}</td>
      <td>${escapeHtml(row.person)}</td>
      <td><strong>${escapeHtml(row.type)}</strong><br><span class="muted">${escapeHtml(row.band || "Sin franja")}</span></td>
      <td>${escapeHtml(row.reference || "Sin referencia")}<br><span class="muted">${escapeHtml(row.note || "")}</span></td>
      <td>${formatMoney(row.value)}</td>
      <td><span class="mark-pill ${row.status}">${operationStatusLabel(row.status)}</span></td>
      <td>${escapeHtml(row.rejectionReason || "-")}</td>
      <td class="approval-actions-cell">
        <div class="table-actions">
          <button class="ghost-button small" data-view-operation="${row.id}" type="button">Ver detalles</button>
          <button class="ghost-button small" data-edit-operation="${row.id}" type="button">Editar</button>
          <button class="ghost-button small" data-approve-operation="${row.id}" type="button" ${row.status === "approved" ? "disabled" : ""}>Aprobar</button>
          <button class="ghost-button small" data-reject-operation="${row.id}" type="button" ${row.status === "rejected" ? "disabled" : ""}>Rechazar</button>
        </div>
      </td>
    </tr>`)
    .join("");
  updateSelectionControls(rows);
}

function filteredOperations() {
  const { from, to } = selectedOperationRange();
  const personQuery = operationElements.person.value;
  const status = operationElements.status.value || "pending";
  return operationRows
    .filter((row) => {
      const date = parseTimestampDate(row.timestamp);
      const matchesRange = dateInRange(date, from, to);
      const matchesPerson = matchesMultiSearchQuery(row.person, personQuery, normalizeSearchText);
      const matchesStatus = status === "todos" || row.status === status;
      return matchesRange && matchesPerson && matchesStatus;
    })
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)) || a.person.localeCompare(b.person));
}

function renderOperationTotals(rows) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  operationElements.count.textContent = `${rows.length} operaciones · ${formatMoney(total)}`;
}

function openOperationDetail(id) {
  selectedOperation = operationRows.find((row) => row.id === String(id));
  if (!selectedOperation) return;
  operationElements.detailTitle.textContent = `${selectedOperation.person} · ${formatOperationDate(selectedOperation.timestamp)}`;
  operationElements.detailBody.innerHTML = `
    ${detailItem("Persona", selectedOperation.person)}
    ${detailItem("Fecha", formatOperationDate(selectedOperation.timestamp))}
    ${detailItem("Tipo", selectedOperation.type)}
    ${detailItem("Franja", selectedOperation.band || "-")}
    ${detailItem("Valor", formatMoney(selectedOperation.value))}
    ${detailItem("Referencia", selectedOperation.reference || "-")}
    ${detailItem("Observación", selectedOperation.note || "-")}
    ${detailItem("Estado", operationStatusLabel(selectedOperation.status))}
    ${selectedOperation.rejectionReason ? detailItem("Motivo rechazo", selectedOperation.rejectionReason) : ""}
  `;
  operationElements.editDetail.disabled = false;
  operationElements.approveDetail.disabled = selectedOperation.status === "approved";
  operationElements.rejectDetail.disabled = selectedOperation.status === "rejected";
  operationElements.detailModal.classList.add("open");
  operationElements.detailModal.setAttribute("aria-hidden", "false");
}

function openOperationEdit(id) {
  selectedOperation = operationRows.find((row) => row.id === String(id));
  if (!selectedOperation) return;
  const tariffOptions = operationEditTariffs(selectedOperation);
  operationElements.editType.innerHTML = tariffOptions.length
    ? tariffOptions.map((tariff) => `<option value="${tariff.id}">${escapeHtml(operationTariffLabel(tariff))}</option>`).join("")
    : `<option value="">Sin tarifas activas</option>`;
  operationElements.editBand.innerHTML = operationConfig.operationBands
    .map((band) => `<option value="${escapeHtml(band)}">${escapeHtml(band)}</option>`)
    .join("");
  operationElements.editType.value = tariffOptions.some((tariff) => String(tariff.id) === selectedOperation.tariffId)
    ? selectedOperation.tariffId
    : String(tariffOptions[0]?.id || "");
  operationElements.editBand.value = operationConfig.operationBands.includes(selectedOperation.band) ? selectedOperation.band : operationConfig.operationBands[0] || selectedOperation.band;
  renderOperationEditValue();
  operationElements.editModal.classList.add("open");
  operationElements.editModal.setAttribute("aria-hidden", "false");
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

function closeOperationEdit() {
  operationElements.editModal.classList.remove("open");
  operationElements.editModal.setAttribute("aria-hidden", "true");
}

function renderOperationEditValue() {
  if (!selectedOperation) return;
  const value = operationValueForSelection(operationElements.editBand.value);
  operationElements.editValue.textContent = `Valor estimado: ${formatMoney(value)}`;
}

function operationValueForSelection(band) {
  const tariff = operationEditTariffs(selectedOperation).find((item) => String(item.id) === String(operationElements.editType.value));
  return operationTariffValueForBand(tariff, band);
}

async function saveOperationEdit(event) {
  event.preventDefault();
  if (!selectedOperation) return;
  const tariffId = operationElements.editType.value;
  const band = operationElements.editBand.value;
  const value = operationValueForSelection(band);
  await updateOperation(selectedOperation.id, {
    operacion_tarifa_id: tariffId ? Number(tariffId) : null,
    franja: band,
    valor: value,
    estado: selectedOperation.status,
  });
  showOperationToast("Operación actualizada");
  closeOperationEdit();
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

[operationElements.from, operationElements.to].forEach((element) => element.addEventListener("change", renderOperations));
[operationElements.person, operationElements.status].forEach((element) => {
  element.addEventListener(element.type === "search" ? "input" : "change", renderOperations);
});

operationElements.selectAll.addEventListener("change", () => toggleAllVisibleOperations(operationElements.selectAll.checked));
operationElements.approveSelection.addEventListener("click", () => approveOperations(selectedVisibleOperations().map((row) => row.id)).catch((error) => showOperationToast(error.message)));
operationElements.rejectSelection.addEventListener("click", () => openRejectModal(selectedVisibleOperations().map((row) => row.id)));
operationElements.body.addEventListener("click", (event) => {
  const select = event.target.closest("[data-select-operation]");
  const selectCell = event.target.closest("[data-toggle-operation]");
  const view = event.target.closest("[data-view-operation]");
  const edit = event.target.closest("[data-edit-operation]");
  const approve = event.target.closest("[data-approve-operation]");
  const reject = event.target.closest("[data-reject-operation]");

  if (selectCell && !select) {
    const checkbox = selectCell.querySelector("[data-select-operation]");
    if (checkbox) toggleOperationSelection(selectCell.dataset.toggleOperation, !checkbox.checked);
  }
  if (view) openOperationDetail(view.dataset.viewOperation);
  if (edit) openOperationEdit(edit.dataset.editOperation);
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
operationElements.editDetail.addEventListener("click", () => {
  if (selectedOperation) openOperationEdit(selectedOperation.id);
});
operationElements.cancelEdit.addEventListener("click", closeOperationEdit);
operationElements.editModal.addEventListener("click", (event) => {
  if (event.target === operationElements.editModal) closeOperationEdit();
});
operationElements.editType.addEventListener("change", renderOperationEditValue);
operationElements.editBand.addEventListener("change", renderOperationEditValue);
operationElements.editForm.addEventListener("submit", (event) => saveOperationEdit(event).catch((error) => showOperationToast(error.message)));
operationElements.cancelReject.addEventListener("click", closeRejectModal);
operationElements.rejectModal.addEventListener("click", (event) => {
  if (event.target === operationElements.rejectModal) closeRejectModal();
});
operationElements.confirmReject.addEventListener("click", () => rejectPendingOperations().catch((error) => showOperationToast(error.message)));

initOperations().catch((error) => showOperationToast(error.message || "No se pudo iniciar operaciones"));
