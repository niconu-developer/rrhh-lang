if (!requireModuleAccess("aprobaciones")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const APPROVAL_API_BASE = apiOrigin();

const approvalElements = {
  from: document.querySelector("#approvalFrom"),
  to: document.querySelector("#approvalTo"),
  person: document.querySelector("#approvalPerson"),
  status: document.querySelector("#approvalStatus"),
  sort: document.querySelector("#approvalSort"),
  count: document.querySelector("#approvalCount"),
  selectAll: document.querySelector("#selectAllApprovals"),
  approveSelection: document.querySelector("#approveSelection"),
  body: document.querySelector("#approvalTableBody"),
  modal: document.querySelector("#approvalModal"),
  closeModal: document.querySelector("#closeApprovalModal"),
  detailTitle: document.querySelector("#approvalModalTitle"),
  detailBody: document.querySelector("#approvalDetailBody"),
  observation: document.querySelector("#approvalObservation"),
  approveDetail: document.querySelector("#approveApprovalDetail"),
  rejectDetail: document.querySelector("#rejectApprovalDetail"),
  markModal: document.querySelector("#approvalMarkModal"),
  markForm: document.querySelector("#approvalMarkForm"),
  markTitle: document.querySelector("#approvalMarkModalTitle"),
  markId: document.querySelector("#approvalMarkId"),
  markPersonId: document.querySelector("#approvalMarkPersonId"),
  markType: document.querySelector("#approvalMarkType"),
  markDate: document.querySelector("#approvalMarkDate"),
  markTime: document.querySelector("#approvalMarkTime"),
  markActivity: document.querySelector("#approvalMarkActivity"),
  markObservation: document.querySelector("#approvalMarkObservation"),
  cancelMark: document.querySelector("#cancelApprovalMark"),
  toast: document.querySelector("#toast"),
};

let approvalRows = [];
let approvalIncidents = [];
let selectedApproval = null;
let selectedApprovalIds = new Set();

function initApprovals() {
  const monday = mondayDate(new Date());
  approvalElements.from.value = inputDateValue(monday);
  approvalElements.to.value = inputDateValue(addDays(monday, 6));
  refreshApprovals();
}

async function approvalApiGet(path) {
  const response = await fetch(`${APPROVAL_API_BASE}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function approvalApiPost(path, payload) {
  const response = await fetch(`${APPROVAL_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `No se pudo guardar ${path}`);
  return data;
}

async function refreshApprovals() {
  try {
    const { from, to } = selectedApprovalRange();
    const fromValue = inputDateValue(from);
    const toValue = inputDateValue(to);
    const [rows, incidents] = await Promise.all([
      approvalApiGet(`/api/aprobaciones?desde=${fromValue}&hasta=${toValue}`),
      approvalApiGet(`/api/incidencias?desde=${fromValue}&hasta=${toValue}&estado=pendientes`),
    ]);
    approvalRows = rows;
    approvalIncidents = incidents;
    selectedApprovalIds.clear();
    renderApprovals();
  } catch (error) {
    showApprovalToast(error.message || "No se pudo cargar la validación de jornales");
    approvalElements.body.innerHTML = `<tr><td colspan="9">No se pudo conectar con la base local.</td></tr>`;
    updateSelectionControls([]);
  }
}

function renderApprovals() {
  const rows = sortedApprovals(filteredApprovals());
  syncSelectionWithRows(rows);
  renderApprovalTotals(rows);
  if (!rows.length) {
    approvalElements.body.innerHTML = `<tr><td colspan="9">Sin jornadas para los filtros seleccionados.</td></tr>`;
    updateSelectionControls(rows);
    return;
  }
  approvalElements.body.innerHTML = rows
    .map((row) => {
      const canApprove = canApproveApprovalRow(row);
      return `<tr class="approval-row ${approvalClass(row)} ${approvalVisualClass(row)} ${selectedApprovalIds.has(String(row.turno_id)) ? "selected" : ""}">
      <td class="select-column" data-toggle-approval="${row.turno_id}">
        <input
          type="checkbox"
          data-select-approval="${row.turno_id}"
          aria-label="Seleccionar jornada de ${row.persona}"
          ${selectedApprovalIds.has(String(row.turno_id)) ? "checked" : ""}
          ${canApprove ? "" : "disabled"}
        />
      </td>
      <td>${formatDisplayDate(parseInputDate(row.fecha))}</td>
      <td>${row.persona}</td>
      <td>${plannedShiftText(row)}</td>
      <td>${markCell(row.entrada_hora, row.entrada_estado)}</td>
      <td>${markCell(row.salida_hora, row.salida_estado)}</td>
      <td>${hoursDiffCell(row)}</td>
      <td><span class="mark-pill ${approvalClass(row)}">${approvalLabel(row)}</span></td>
      <td class="approval-actions-cell">
        <div class="table-actions approval-row-actions">
          <button class="ghost-button small" data-view-approval="${row.turno_id}" type="button">Ver detalles</button>
          ${approvalRequiresPlanning(row) ? `<button class="ghost-button small" data-pass-approval-to-plan="${row.turno_id}" type="button">Pasar a plan semanal</button>` : ""}
          ${approvalCanMarkAbsent(row) ? `<button class="ghost-button small" data-mark-approval-absent="${row.turno_id}" type="button">Marcar ausente</button>` : ""}
          <button class="ghost-button small" data-edit-approval-mark="${row.turno_id}:Entrada" type="button">${row.entrada_id ? "Editar entrada" : "Agregar entrada"}</button>
          <button class="ghost-button small" data-edit-approval-mark="${row.turno_id}:Salida" type="button">${row.salida_id ? "Editar salida" : "Agregar salida"}</button>
          ${canApprove ? `<button class="primary-button small" data-approve-approval="${row.turno_id}" type="button">Aprobar</button>` : ""}
        </div>
      </td>
    </tr>`;
    })
    .join("");
  updateSelectionControls(rows);
}

function filteredApprovals() {
  const personQuery = approvalElements.person.value;
  const status = approvalElements.status.value || "todos";
  return approvalRows.filter((row) => approvalNeedsValidationVisibility(row)).filter((row) => {
    const searchable = `${row.persona || ""} ${row.rol_operativo || ""}`;
    const matchesPerson = matchesMultiSearchQuery(searchable, personQuery, normalizeSearchText);
    const matchesStatus = status === "todos" || row.estado_aprobacion === status;
    return matchesPerson && matchesStatus;
  });
}

function approvalNeedsValidationVisibility(row) {
  const turnStatus = String(row.estado_turno || "").toUpperCase();
  const markIds = Array.isArray(row.marcas_ids) ? row.marcas_ids : [];
  return turnStatus === "NORMAL"
    || Number(row.horas_trabajadas || 0) > 0
    || Boolean(row.entrada_id || row.salida_id || markIds.length);
}

function sortedApprovals(rows) {
  const sortMode = approvalElements.sort.value || "fecha";
  return rows.slice().sort((a, b) => {
    if (sortMode === "diferencia_abs") return Math.abs(approvalHoursDifference(b) || 0) - Math.abs(approvalHoursDifference(a) || 0);
    if (sortMode === "faltante") return (approvalHoursDifference(a) || 0) - (approvalHoursDifference(b) || 0);
    if (sortMode === "sin_marcas") return Number(!b.marcas_ids?.length) - Number(!a.marcas_ids?.length) || defaultApprovalSort(a, b);
    return defaultApprovalSort(a, b);
  });
}

function defaultApprovalSort(a, b) {
  return String(a.fecha || "").localeCompare(String(b.fecha || "")) || String(a.persona || "").localeCompare(String(b.persona || ""));
}

function renderApprovalTotals(rows) {
  const totalDiff = rows.reduce((sum, row) => {
    const diff = approvalHoursDifference(row);
    return diff === null ? sum : sum + diff;
  }, 0);
  const diffClass = totalDiff > 0 ? "positive" : totalDiff < 0 ? "negative" : "neutral";
  approvalElements.count.innerHTML = `
    <span>${rows.length} jornadas</span>
    <strong class="${diffClass}">Diferencia ${formatSignedHours(Math.round(totalDiff * 100) / 100)}</strong>
  `;
}

function openApprovalDetail(turnoId) {
  selectedApproval = approvalRows.find((row) => String(row.turno_id) === String(turnoId));
  if (!selectedApproval) return;
  const incidents = approvalIncidentsForRow(selectedApproval);
  approvalElements.detailTitle.textContent = `${selectedApproval.persona} · ${formatDisplayDate(parseInputDate(selectedApproval.fecha))}`;
  approvalElements.detailBody.innerHTML = `
    ${detailItem("Persona", selectedApproval.persona)}
    ${detailItem("Fecha", formatDisplayDate(parseInputDate(selectedApproval.fecha)))}
    ${detailItem("Turno previsto", plannedShiftText(selectedApproval))}
    ${detailItem("Actividad / ubicación", selectedApproval.actividad_ubicacion || "-")}
    ${detailItem("Horas previstas", formatHoursValue(selectedApproval.horas_previstas))}
    ${detailItem("Horas trabajadas", formatHoursValue(selectedApproval.horas_trabajadas))}
    ${detailItem("Diferencia", formatHoursDifference(selectedApproval))}
    ${detailItem("Entrada real", selectedApproval.entrada_hora || "Sin marca")}
    ${detailItem("Estado entrada", selectedApproval.entrada_estado || "Sin marca")}
    ${detailItem("Salida real", selectedApproval.salida_hora || "Sin marca")}
    ${detailItem("Estado salida", selectedApproval.salida_estado || "Sin marca")}
    ${detailItem("Validación", approvalLabel(selectedApproval))}
    ${incidents.length ? detailItem("Incidencias pendientes", incidents.map((incident) => incidentTypeLabel(incident.tipo)).join(" · ")) : ""}
    ${incidents.length ? detailItem("Detalle incidencias", incidents.map((incident) => incident.detalle || incident.tipo).join(" / ")) : ""}
    ${selectedApproval.modo_aprobacion === "MANUAL" ? detailItem("Validado por", selectedApproval.aprobado_por || "Sin responsable registrado") : ""}
    ${selectedApproval.modo_aprobacion === "MANUAL" ? detailItem("Fecha de validación", formatApprovalTimestamp(selectedApproval.fecha_aprobacion)) : ""}
    ${selectedApproval.observacion_aprobacion ? detailItem("Observación validación", selectedApproval.observacion_aprobacion) : ""}
  `;
  approvalElements.observation.value = "";
  approvalElements.approveDetail.disabled = !selectedApproval.marcas_ids.length;
  approvalElements.rejectDetail.disabled = !selectedApproval.marcas_ids.length;
  approvalElements.modal.classList.add("open");
  approvalElements.modal.setAttribute("aria-hidden", "false");
}

function closeApprovalDetail() {
  approvalElements.modal.classList.remove("open");
  approvalElements.modal.setAttribute("aria-hidden", "true");
}

async function approveRow(turnoId, estado = "APROBADA", observation = "") {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  if (!row?.marcas_ids?.length) return;
  if (estado === "APROBADA" && approvalHasPendingIncidents(row)) {
    estado = "VALIDADA_CON_INCIDENCIA";
  }
  await approvalApiPost("/api/aprobaciones", {
    marca_ids: row.marcas_ids,
    estado,
    observacion: observation,
    usuario_id: currentUser()?.id,
  });
  showApprovalToast(estado === "APROBADA" ? "Jornal validado" : "Jornal rechazado");
  closeApprovalDetail();
  await refreshApprovals();
}

async function approveSelectedRows() {
  const selectedRows = approvalRows.filter((row) => selectedApprovalIds.has(String(row.turno_id)) && row.marcas_ids?.length);
  const cleanMarkIds = selectedRows
    .filter((row) => !approvalHasPendingIncidents(row))
    .flatMap((row) => row.marcas_ids);
  const incidentMarkIds = selectedRows
    .filter((row) => approvalHasPendingIncidents(row))
    .flatMap((row) => row.marcas_ids);
  if (!cleanMarkIds.length && !incidentMarkIds.length) {
    showApprovalToast("Seleccioná al menos una jornada con marcas");
    return;
  }
  if (cleanMarkIds.length) {
    await approvalApiPost("/api/aprobaciones", {
      marca_ids: cleanMarkIds,
      estado: "APROBADA",
      usuario_id: currentUser()?.id,
    });
  }
  if (incidentMarkIds.length) {
    await approvalApiPost("/api/aprobaciones", {
      marca_ids: incidentMarkIds,
      estado: "VALIDADA_CON_INCIDENCIA",
      usuario_id: currentUser()?.id,
    });
  }
  showApprovalToast(`${selectedRows.length} jornales validados`);
  selectedApprovalIds.clear();
  await refreshApprovals();
}

function approvalIncidentsForRow(row) {
  return approvalIncidents.filter((incident) => {
    return Number(incident.persona_id) === Number(row.persona_id)
      && String(incident.fecha || "") === String(row.fecha || "")
      && Number(incident.resuelta || 0) === 0;
  });
}

function approvalHasPendingIncidents(row) {
  return approvalIncidentsForRow(row).length > 0;
}

function approvalRequiresPlanning(row) {
  return approvalIncidentsForRow(row).some(incidentRequiresPlanning);
}

function approvalCanMarkAbsent(row) {
  return approvalIncidentsForRow(row).some(incidentCanMarkAbsent);
}

function canApproveApprovalRow(row) {
  return Boolean(row?.marcas_ids?.length) && !["APROBADA", "VALIDADA_CON_INCIDENCIA"].includes(row.estado_aprobacion);
}

function incidentRequiresPlanning(incident) {
  return incidentActionAllowed(incident, "pasar_a_plan");
}

function incidentCanMarkAbsent(incident) {
  return incidentActionAllowed(incident, "marcar_ausente");
}

function incidentActionAllowed(incident, action) {
  if (incident?.acciones && action in incident.acciones) return Boolean(incident.acciones[action]);
  if (Number(incident?.resuelta || 0)) return false;
  if (action === "pasar_a_plan") return incident?.tipo === "MARCA_EN_ESTADO_SIN_HORARIO";
  if (action === "marcar_ausente") {
    return ["TURNO_CON_MARCAS_FALTANTES", "TURNO_SIN_ENTRADA", "TURNO_SIN_SALIDA"].includes(incident?.tipo)
      && !String(incident.marcas_horarios || "").trim();
  }
  if (action === "aprobar") return !incidentActionAllowed(incident, "marcar_ausente");
  return false;
}

async function passApprovalToPlan(turnoId) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  const ids = approvalIncidentsForRow(row).filter(incidentRequiresPlanning).map((incident) => Number(incident.id));
  if (!ids.length) return;
  await approvalApiPost("/api/incidencias/pasar-a-plan", { ids });
  showApprovalToast("Turno cargado en plan semanal");
  await refreshApprovals();
}

async function markApprovalAbsent(turnoId) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  const ids = approvalIncidentsForRow(row).filter(incidentCanMarkAbsent).map((incident) => Number(incident.id));
  if (!ids.length) return;
  await approvalApiPost("/api/incidencias/marcar-ausente", { ids });
  showApprovalToast("Turno marcado como AUSENTE");
  await refreshApprovals();
}

function openApprovalMarkModal(turnoId, type) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  if (!row) return;
  const isEntry = type === "Entrada";
  const markId = isEntry ? row.entrada_id : row.salida_id;
  const markDate = isEntry ? row.entrada_fecha : row.salida_fecha;
  const markTime = isEntry ? row.entrada_hora : row.salida_hora;
  approvalElements.markForm.dataset.mode = markId ? "edit" : "create";
  approvalElements.markTitle.textContent = `${markId ? "Editar" : "Agregar"} ${type.toLowerCase()}`;
  approvalElements.markId.value = markId || "";
  approvalElements.markPersonId.value = row.persona_id || "";
  approvalElements.markType.value = type;
  approvalElements.markDate.value = markDate || defaultApprovalMarkDate(row, type);
  approvalElements.markTime.value = markTime || defaultApprovalMarkTime(row, type);
  approvalElements.markActivity.value = (row.actividad_ubicacion || "").toUpperCase();
  approvalElements.markObservation.value = "";
  approvalElements.markModal.classList.add("open");
  approvalElements.markModal.setAttribute("aria-hidden", "false");
}

function closeApprovalMarkModal() {
  approvalElements.markModal.classList.remove("open");
  approvalElements.markModal.setAttribute("aria-hidden", "true");
  approvalElements.markForm.reset();
}

async function saveApprovalMark(event) {
  event.preventDefault();
  const rawTime = normalizeApprovalTime(approvalElements.markTime.value);
  if (timeToMinutes(rawTime) === null) {
    window.alert("La hora debe tener formato HH:MM");
    return;
  }
  const observation = approvalElements.markObservation.value.trim();
  if (!observation) {
    window.alert("La observación es obligatoria para cargas o ediciones manuales");
    return;
  }
  const payload = {
    tipo: approvalElements.markType.value,
    fecha: approvalElements.markDate.value,
    hora: rawTime,
    actividad_ubicacion: approvalElements.markActivity.value.trim().toUpperCase(),
    ubicacion_detectada: "",
    observacion_modificacion: observation,
    usuario_id: currentUser()?.id,
    usuario_nombre: currentUser()?.username,
  };
  if (approvalElements.markId.value) {
    await approvalApiPost(`/api/marcas/${approvalElements.markId.value}`, payload);
  } else {
    await approvalApiPost("/api/marcas", {
      ...payload,
      persona_id: approvalElements.markPersonId.value,
      fecha_hora: `${approvalElements.markDate.value} ${rawTime}:00`,
      tipo_marca: "Marca manual admin",
      registrada_por_admin: true,
    });
  }
  closeApprovalMarkModal();
  showApprovalToast("Marca manual guardada");
  await refreshApprovals();
}

function defaultApprovalMarkDate(row, type) {
  if (type === "Salida" && row.estado_turno === "NORMAL" && timeToMinutes(row.hora_fin) !== null && timeToMinutes(row.hora_inicio) !== null && timeToMinutes(row.hora_fin) < timeToMinutes(row.hora_inicio)) {
    const date = parseInputDate(row.fecha);
    return date ? inputDateValue(addDays(date, 1)) : row.fecha;
  }
  return row.fecha;
}

function defaultApprovalMarkTime(row, type) {
  if (row.estado_turno !== "NORMAL") return "";
  return type === "Entrada" ? row.hora_inicio || "" : row.hora_fin || "";
}

function toggleApprovalSelection(turnoId, checked) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  if (!row || !canApproveApprovalRow(row)) return;
  if (checked) selectedApprovalIds.add(String(turnoId));
  else selectedApprovalIds.delete(String(turnoId));
  renderApprovals();
}

function toggleAllVisibleApprovals(checked) {
  filteredApprovals().forEach((row) => {
    if (!canApproveApprovalRow(row)) return;
    if (checked) selectedApprovalIds.add(String(row.turno_id));
    else selectedApprovalIds.delete(String(row.turno_id));
  });
  renderApprovals();
}

function syncSelectionWithRows(rows) {
  const visibleIds = new Set(rows.map((row) => String(row.turno_id)));
  selectedApprovalIds = new Set([...selectedApprovalIds].filter((turnoId) => visibleIds.has(turnoId)));
}

function updateSelectionControls(rows = filteredApprovals()) {
  const selectableRows = rows.filter(canApproveApprovalRow);
  const selectedVisible = selectableRows.filter((row) => selectedApprovalIds.has(String(row.turno_id)));
  approvalElements.approveSelection.disabled = selectedVisible.length === 0;
  approvalElements.approveSelection.textContent = selectedVisible.length ? `Aprobar (${selectedVisible.length})` : "Aprobar selección";
  approvalElements.selectAll.disabled = selectableRows.length === 0;
  approvalElements.selectAll.checked = selectableRows.length > 0 && selectedVisible.length === selectableRows.length;
  approvalElements.selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < selectableRows.length;
}

function selectedApprovalRange() {
  const from = parseInputDate(approvalElements.from.value) || new Date();
  const to = parseInputDate(approvalElements.to.value) || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function plannedShiftText(row) {
  if (row.estado_turno !== "NORMAL") return row.estado_turno || "VACIO";
  return `${row.hora_inicio || "--"} - ${row.hora_fin || "--"}`;
}

function markCell(time, state) {
  if (!time) return "Sin marca";
  return `${time} · ${state || "PENDIENTE"}`;
}

function hoursDiffCell(row) {
  const diff = approvalHoursDifference(row);
  if (diff === null) return `<span class="hours-diff muted">-</span>`;
  const className = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
  return `<span class="hours-diff ${className}">${formatSignedHours(diff)}</span>`;
}

function approvalVisualClass(row) {
  const diff = approvalHoursDifference(row);
  if (!row.marcas_ids?.length) return "without-marks";
  if (diff && diff < 0) return "with-negative-diff";
  if (diff && diff > 0) return "with-positive-diff";
  return "";
}

function formatHoursDifference(row) {
  const diff = approvalHoursDifference(row);
  return diff === null ? "-" : formatSignedHours(diff);
}

function approvalHoursDifference(row) {
  const planned = Number(row.horas_previstas || 0);
  const worked = Number(row.horas_trabajadas || 0);
  if (!Number.isFinite(planned) || !Number.isFinite(worked)) return null;
  if (!planned && !worked) return null;
  return Math.round((worked - planned) * 100) / 100;
}

function formatHoursValue(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "-";
  return `${formatDecimalHours(number)} h`;
}

function formatSignedHours(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatDecimalHours(value)} h`;
}

function formatDecimalHours(value) {
  if (Math.abs(value) % 1 === 0) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function approvalClass(row) {
  if (row.estado_aprobacion === "APROBADA" && row.modo_aprobacion === "AUTO") return "approved-auto";
  if (row.estado_aprobacion === "VALIDADA_CON_INCIDENCIA") return "approved-with-incident";
  if (row.estado_aprobacion === "REQUIERE_REVISION") return "requires-review";
  if (row.estado_aprobacion === "APROBADA") return "approved-manual";
  if (row.estado_aprobacion === "RECHAZADA") return "rejected";
  return "pending";
}

function approvalLabel(row) {
  if (isExpectedNoWorkApproval(row)) return "No requiere validación";
  if (row.estado_aprobacion === "APROBADA" && row.modo_aprobacion === "AUTO") return "Validado automático";
  if (row.estado_aprobacion === "VALIDADA_CON_INCIDENCIA") return "Validado con incidencia";
  if (row.estado_aprobacion === "REQUIERE_REVISION") return "Requiere revisión";
  if (row.estado_aprobacion === "APROBADA") return "Validado manual";
  if (row.estado_aprobacion === "RECHAZADA") return "Rechazado";
  return "Pendiente de validación";
}

function isExpectedNoWorkApproval(row) {
  return row?.estado_aprobacion === "APROBADA"
    && row?.modo_aprobacion === "AUTO"
    && String(row?.observacion_aprobacion || "").includes("estado sin horario");
}

function incidentTypeLabel(type) {
  return {
    MARCA_FUERA_UBICACION: "Marca fuera de ubicación",
    MARCA_EN_ESTADO_SIN_HORARIO: "Marca en estado sin horario",
    MARCA_INCOMPLETA: "Marca incompleta",
    TURNO_SIN_ENTRADA: "Turno sin entrada",
    TURNO_SIN_SALIDA: "Turno sin salida",
    TURNO_CON_MARCAS_FALTANTES: "Turno con marcas faltantes",
    TRAMO_OBSERVADO: "Tramo observado",
    DESFASAJE_ENTRADA: "Desfasaje de entrada",
    DESFASAJE_SALIDA: "Desfasaje de salida",
  }[type] || type || "Incidencia";
}

function detailItem(label, value) {
  return `<article><span>${label}</span><strong>${value}</strong></article>`;
}

function mondayDate(date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return copy;
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
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function inputDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatApprovalTimestamp(value) {
  if (!value) return "Sin fecha registrada";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeApprovalTime(value) {
  const raw = String(value || "").trim().replace(".", ":");
  if (!raw) return "";
  const compact = raw.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return `${compact[1].padStart(2, "0")}:${compact[2]}`;
  const parts = raw.split(":");
  if (parts.length !== 2) return raw;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function showApprovalToast(message) {
  approvalElements.toast.textContent = message;
  approvalElements.toast.classList.add("visible");
  window.setTimeout(() => approvalElements.toast.classList.remove("visible"), 2200);
}

[approvalElements.from, approvalElements.to].forEach((element) => element.addEventListener("change", refreshApprovals));
[approvalElements.person, approvalElements.status, approvalElements.sort].forEach((element) => {
  element.addEventListener(element.type === "search" ? "input" : "change", renderApprovals);
});
approvalElements.selectAll.addEventListener("change", () => toggleAllVisibleApprovals(approvalElements.selectAll.checked));
approvalElements.approveSelection.addEventListener("click", () => approveSelectedRows().catch((error) => showApprovalToast(error.message)));
approvalElements.body.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-approval]");
  const approve = event.target.closest("[data-approve-approval]");
  const passToPlan = event.target.closest("[data-pass-approval-to-plan]");
  const markAbsent = event.target.closest("[data-mark-approval-absent]");
  const editMark = event.target.closest("[data-edit-approval-mark]");
  const select = event.target.closest("[data-select-approval]");
  const selectCell = event.target.closest("[data-toggle-approval]");
  if (selectCell && !select) {
    const checkbox = selectCell.querySelector("[data-select-approval]");
    if (checkbox && !checkbox.disabled) toggleApprovalSelection(selectCell.dataset.toggleApproval, !checkbox.checked);
  }
  if (view) openApprovalDetail(view.dataset.viewApproval);
  if (approve) approveRow(approve.dataset.approveApproval).catch((error) => showApprovalToast(error.message));
  if (passToPlan) passApprovalToPlan(passToPlan.dataset.passApprovalToPlan).catch((error) => showApprovalToast(error.message || "No se pudo pasar al plan"));
  if (markAbsent) markApprovalAbsent(markAbsent.dataset.markApprovalAbsent).catch((error) => showApprovalToast(error.message || "No se pudo marcar ausente"));
  if (editMark) {
    const [turnoId, type] = editMark.dataset.editApprovalMark.split(":");
    openApprovalMarkModal(turnoId, type);
  }
});
approvalElements.body.addEventListener("change", (event) => {
  const select = event.target.closest("[data-select-approval]");
  if (select) toggleApprovalSelection(select.dataset.selectApproval, select.checked);
});
approvalElements.closeModal.addEventListener("click", closeApprovalDetail);
approvalElements.modal.addEventListener("click", (event) => {
  if (event.target === approvalElements.modal) closeApprovalDetail();
});
approvalElements.approveDetail.addEventListener("click", () => {
  if (selectedApproval) approveRow(selectedApproval.turno_id, "APROBADA", approvalElements.observation.value).catch((error) => showApprovalToast(error.message));
});
approvalElements.rejectDetail.addEventListener("click", () => {
  if (selectedApproval) approveRow(selectedApproval.turno_id, "RECHAZADA", approvalElements.observation.value).catch((error) => showApprovalToast(error.message));
});
approvalElements.cancelMark.addEventListener("click", closeApprovalMarkModal);
approvalElements.markModal.addEventListener("click", (event) => {
  if (event.target === approvalElements.markModal) closeApprovalMarkModal();
});
approvalElements.markForm.addEventListener("submit", (event) => {
  saveApprovalMark(event).catch((error) => showApprovalToast(error.message || "No se pudo guardar la marca"));
});

initApprovals();
