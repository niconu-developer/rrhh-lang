if (!requireModuleAccess("aprobaciones")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const APPROVAL_API_BASE = apiBase();

const approvalElements = {
  from: document.querySelector("#approvalFrom"),
  to: document.querySelector("#approvalTo"),
  today: document.querySelector("#approvalToday"),
  person: document.querySelector("#approvalPerson"),
  status: document.querySelector("#approvalStatus"),
  observationType: document.querySelector("#approvalObservationType"),
  observationSeverity: document.querySelector("#approvalObservationSeverity"),
  sort: document.querySelector("#approvalSort"),
  count: document.querySelector("#approvalCount"),
  pagination: document.querySelector("#approvalPagination"),
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
  turnsModal: document.querySelector("#approvalTurnsModal"),
  turnsTitle: document.querySelector("#approvalTurnsTitle"),
  turnsBody: document.querySelector("#approvalTurnsBody"),
  turnsObservation: document.querySelector("#approvalTurnsObservation"),
  closeTurns: document.querySelector("#closeApprovalTurns"),
  addTurnMark: document.querySelector("#addApprovalTurnMark"),
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

const APPROVAL_PAGE_SIZE = 50;
let approvalRows = [];
let approvalIncidents = [];
let selectedApproval = null;
let selectedApprovalIds = new Set();
let approvalPage = 1;
let approvalsLoading = false;

function initApprovals() {
  setApprovalTodayRange();
  refreshApprovals();
}

function setApprovalTodayRange() {
  const today = inputDateValue(new Date());
  approvalElements.from.value = today;
  approvalElements.to.value = today;
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

async function refreshApprovals(options = {}) {
  const preservePage = Boolean(options.preservePage);
  try {
    setApprovalsLoading(true);
    const previousPage = approvalPage;
    const { from, to } = selectedApprovalRange();
    const fromValue = inputDateValue(from);
    const toValue = inputDateValue(to);
    const [rows, incidents] = await Promise.all([
      approvalApiGet(`/aprobaciones?desde=${fromValue}&hasta=${toValue}`),
      approvalApiGet(`/observaciones-jornal?desde=${fromValue}&hasta=${toValue}&estado=pendientes`),
    ]);
    approvalRows = rows;
    approvalIncidents = incidents;
    selectedApprovalIds.clear();
    approvalPage = preservePage ? previousPage : 1;
    renderObservationFilters();
    renderApprovals();
  } catch (error) {
    showApprovalToast(error.message || "No se pudo cargar la validación de jornales");
    approvalElements.body.innerHTML = `<tr><td colspan="8">No se pudo conectar con la base local.</td></tr>`;
    updateSelectionControls([]);
    renderApprovalPagination(0);
  } finally {
    setApprovalsLoading(false);
  }
}

async function refreshApprovalScope(row) {
  if (!row?.fecha || !row?.persona_id) {
    await refreshApprovals({ preservePage: true });
    return;
  }
  const query = new URLSearchParams({
    desde: row.fecha,
    hasta: row.fecha,
    persona: String(row.persona_id),
  });
  const observationQuery = new URLSearchParams({
    desde: row.fecha,
    hasta: row.fecha,
    estado: "pendientes",
    persona: String(row.persona_id),
  });
  const [rows, incidents] = await Promise.all([
    approvalApiGet(`/aprobaciones?${query.toString()}`),
    approvalApiGet(`/observaciones-jornal?${observationQuery.toString()}`),
  ]);
  const sameScope = (item) => Number(item.persona_id) === Number(row.persona_id)
    && String(item.fecha || "") === String(row.fecha || "");
  approvalRows = [
    ...approvalRows.filter((item) => !sameScope(item)),
    ...rows,
  ].sort(defaultApprovalSort);
  approvalIncidents = [
    ...approvalIncidents.filter((item) => !sameScope(item)),
    ...incidents,
  ];
  selectedApprovalIds.delete(String(row.turno_id));
  renderObservationFilters();
  renderApprovals();
}

function renderApprovals() {
  const rows = sortedApprovals(filteredApprovals());
  syncSelectionWithRows(rows);
  renderApprovalTotals(rows);
  const pageRows = paginatedApprovalRows(rows);
  if (!rows.length) {
    approvalElements.body.innerHTML = `<tr><td colspan="8">Sin jornadas para los filtros seleccionados.</td></tr>`;
    updateSelectionControls(rows);
    renderApprovalPagination(0);
    return;
  }
  let lastDate = "";
  approvalElements.body.innerHTML = pageRows
    .flatMap((row) => {
      const canApprove = canApproveApprovalRow(row);
      const dateHeader = row.fecha !== lastDate
        ? `<tr class="approval-date-row"><td colspan="8">${formatFullDisplayDate(parseInputDate(row.fecha))}</td></tr>`
        : "";
      lastDate = row.fecha;
      return [dateHeader, `<tr class="approval-row ${approvalClass(row)} ${approvalVisualClass(row)} ${selectedApprovalIds.has(String(row.turno_id)) ? "selected" : ""}">
      <td class="select-column" data-toggle-approval="${row.turno_id}">
        <input
          type="checkbox"
          data-select-approval="${row.turno_id}"
          aria-label="Seleccionar jornada de ${row.persona}"
          ${selectedApprovalIds.has(String(row.turno_id)) ? "checked" : ""}
          ${canApprove ? "" : "disabled"}
        />
      </td>
      <td>${row.persona}</td>
      <td>${plannedShiftCell(row)}</td>
      <td>${markSegmentsCell(row, "entrada")}</td>
      <td>${markSegmentsCell(row, "salida")}</td>
      <td>${hoursDiffCell(row)}</td>
      <td><span class="mark-pill ${approvalClass(row)}">${approvalLabel(row)}</span></td>
      <td class="approval-actions-cell">
        <div class="table-actions approval-row-actions">
          ${approvalRequiresPlanning(row) ? `<button class="ghost-button small" data-pass-approval-to-plan="${row.turno_id}" type="button">Pasar a plan</button>` : ""}
          ${approvalCanMarkAbsent(row) && !row.marcas_ids?.length ? `<button class="ghost-button small" data-mark-approval-absent="${row.turno_id}" type="button">Ausente</button>` : ""}
          <button class="ghost-button small" data-edit-approval-turns="${row.turno_id}" type="button">Editar turnos</button>
          <button class="primary-button small" data-approve-approval="${row.turno_id}" type="button" ${canApprove ? "" : "disabled"}>Aprobar</button>
          <button class="ghost-button small" data-view-approval="${row.turno_id}" type="button">Ver detalles</button>
        </div>
      </td>
    </tr>`];
    })
    .filter(Boolean)
    .join("");
  updateSelectionControls(rows);
  renderApprovalPagination(rows.length);
}

function paginatedApprovalRows(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / APPROVAL_PAGE_SIZE));
  approvalPage = Math.min(Math.max(1, approvalPage), totalPages);
  const start = (approvalPage - 1) * APPROVAL_PAGE_SIZE;
  return rows.slice(start, start + APPROVAL_PAGE_SIZE);
}

function renderApprovalPagination(totalRows) {
  if (!approvalElements.pagination) return;
  if (!totalRows) {
    approvalPage = 1;
    approvalElements.pagination.innerHTML = `
      <span>0-0 de 0</span>
      <div class="pagination-actions">
        <button class="ghost-button small" data-approval-page="prev" type="button" disabled>Anterior</button>
        <strong>Página 1 de 1</strong>
        <button class="ghost-button small" data-approval-page="next" type="button" disabled>Siguiente</button>
      </div>
    `;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalRows / APPROVAL_PAGE_SIZE));
  const start = (approvalPage - 1) * APPROVAL_PAGE_SIZE + 1;
  const end = Math.min(totalRows, approvalPage * APPROVAL_PAGE_SIZE);
  approvalElements.pagination.innerHTML = `
    <span>${start}-${end} de ${totalRows}</span>
    <div class="pagination-actions">
      <button class="ghost-button small" data-approval-page="prev" type="button" ${approvalPage <= 1 ? "disabled" : ""}>Anterior</button>
      <strong>Página ${approvalPage} de ${totalPages}</strong>
      <button class="ghost-button small" data-approval-page="next" type="button" ${approvalPage >= totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

function setApprovalsLoading(isLoading) {
  approvalsLoading = isLoading;
  if (isLoading) {
    approvalElements.body.innerHTML = `
      <tr>
        <td class="loading-row" colspan="8">
          <span class="loading-inline"><i></i>Cargando jornadas...</span>
        </td>
      </tr>
    `;
    renderApprovalPagination(0);
  }
  approvalElements.approveSelection.disabled = isLoading || approvalElements.approveSelection.disabled;
  if (approvalElements.today) approvalElements.today.disabled = isLoading;
}

function filteredApprovals() {
  const personQuery = approvalElements.person.value;
  const status = approvalElements.status.value || "todos";
  const observationType = approvalElements.observationType.value || "todos";
  const observationSeverity = approvalElements.observationSeverity.value || "todos";
  return approvalRows.filter((row) => approvalNeedsValidationVisibility(row)).filter((row) => {
    const searchable = `${row.persona || ""} ${row.rol_operativo || ""}`;
    const matchesPerson = matchesMultiSearchQuery(searchable, personQuery, normalizeSearchText);
    const observations = approvalIncidentsForRow(row);
    const hasPendingObservations = observations.length > 0;
    const matchesStatus = status === "todos"
      || row.estado_aprobacion === status
      || (status === "PENDIENTE" && hasPendingObservations);
    const matchesObservationType = observationType === "todos" || observations.some((incident) => incident.tipo === observationType);
    const matchesObservationSeverity = observationSeverity === "todos" || observations.some((incident) => incident.severidad === observationSeverity);
    return matchesPerson && matchesStatus && matchesObservationType && matchesObservationSeverity;
  });
}

function renderObservationFilters() {
  renderObservationFilterOptions(
    approvalElements.observationType,
    uniqueIncidentValues("tipo"),
    "Todos",
    incidentTypeLabel,
  );
  renderObservationFilterOptions(
    approvalElements.observationSeverity,
    uniqueIncidentValues("severidad"),
    "Todas",
    severityLabel,
  );
}

function renderObservationFilterOptions(select, values, allLabel, formatter = (value) => value) {
  const current = select.value || "todos";
  select.innerHTML = `<option value="todos">${allLabel}</option>${values
    .map((value) => `<option value="${escapeApprovalMarkup(value)}">${escapeApprovalMarkup(formatter(value))}</option>`)
    .join("")}`;
  select.value = [...select.options].some((option) => option.value === current) ? current : "todos";
}

function uniqueIncidentValues(key) {
  return [...new Set(approvalIncidents.map((incident) => incident[key]).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right), "es"));
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
    <strong class="${diffClass}">Saldo horario ${formatSignedHours(Math.round(totalDiff * 100) / 100)}</strong>
  `;
}

function openApprovalDetail(turnoId) {
  selectedApproval = approvalRows.find((row) => String(row.turno_id) === String(turnoId));
  if (!selectedApproval) return;
  const incidents = approvalIncidentsForRow(selectedApproval);
  approvalElements.modal.querySelector(".modal-head .muted").textContent =
    `Plan original: ${plannedShiftText(selectedApproval)} · ${selectedApproval.actividad_ubicacion || "Sin especificar"}`;
  approvalElements.detailTitle.textContent = `${selectedApproval.persona} · ${formatDisplayDate(parseInputDate(selectedApproval.fecha))}`;
  approvalElements.detailBody.innerHTML = `
    <div class="approval-detail-summary">
      <article>
        <span>Horas</span>
        <strong>${formatHoursValue(selectedApproval.horas_trabajadas)} / ${formatHoursValue(selectedApproval.horas_previstas)}</strong>
        <small>Diferencia ${formatHoursDifference(selectedApproval)}</small>
      </article>
      <article>
        <span>Estado</span>
        <strong>${escapeApprovalMarkup(approvalLabel(selectedApproval))}</strong>
        <small>${selectedApproval.aprobado_por ? `Validado por ${escapeApprovalMarkup(selectedApproval.aprobado_por)}` : "Sin responsable registrado"}</small>
      </article>
    </div>
    <div class="approval-detail-section">
      <span>Tramos registrados</span>
      ${renderDetailSegments(selectedApproval)}
    </div>
    <div class="approval-detail-section">
      <span>Observaciones</span>
      <div class="approval-observation-list">
        ${incidents.length ? incidents.map((incident) => `<article><strong>${escapeApprovalMarkup(incidentTypeLabel(incident.tipo))}</strong><small>${escapeApprovalMarkup(incident.detalle || "Sin detalle")}</small></article>`).join("") : "<article><strong>Sin observaciones pendientes</strong></article>"}
      </div>
    </div>
    ${selectedApproval.observacion_aprobacion ? `<div class="approval-detail-section"><span>Comentario de validación</span><div class="approval-observation-list"><article><strong>${escapeApprovalMarkup(selectedApproval.observacion_aprobacion)}</strong></article></div></div>` : ""}
  `;
  approvalElements.observation.value = "";
  approvalElements.approveDetail.disabled = !selectedApproval.marcas_ids.length;
  approvalElements.rejectDetail.disabled = !selectedApproval.marcas_ids.length;
  approvalElements.modal.classList.add("open");
  approvalElements.modal.setAttribute("aria-hidden", "false");
}

function renderDetailSegments(row) {
  const segments = Array.isArray(row.tramos) && row.tramos.length ? row.tramos : [];
  const lines = segments.length
    ? segments.flatMap((segment, index) => [
        detailMarkLine(row, segment, "Entrada", index + 1),
        detailMarkLine(row, segment, "Salida", index + 1),
      ])
    : [
        detailMarkLine(row, {
          entrada_fecha: row.entrada_fecha,
          entrada_hora: row.entrada_hora,
          entrada_actividad: row.entrada_actividad,
          entrada_ubicacion: row.entrada_ubicacion,
        }, "Entrada", 1),
        detailMarkLine(row, {
          salida_fecha: row.salida_fecha,
          salida_hora: row.salida_hora,
          salida_actividad: row.salida_actividad,
          salida_ubicacion: row.salida_ubicacion,
        }, "Salida", 1),
      ];
  return `<div class="approval-detail-table">
    <div class="approval-detail-head">
      <span>Tramo</span>
      <span>Tipo</span>
      <span>Fecha</span>
      <span>Hora</span>
      <span>Proyecto</span>
      <span>Ubicación / GPS</span>
    </div>
    ${lines.join("")}
  </div>`;
}

function detailMarkLine(row, source, type, segmentNumber) {
  const key = type === "Entrada" ? "entrada" : "salida";
  const date = source[`${key}_fecha`] || defaultApprovalMarkDate(row, type);
  const time = source[`${key}_hora`] || "Sin marca";
  const activity = source[`${key}_actividad`] || row.actividad_ubicacion || "Sin proyecto";
  const location = source[`${key}_ubicacion`] || "Sin ubicación detectada";
  return `<div class="approval-detail-line ${time === "Sin marca" ? "empty" : ""}">
    <span>${segmentNumber}</span>
    <strong>${type}</strong>
    <span>${escapeApprovalMarkup(formatShortDate(parseInputDate(date)) || "-")}</span>
    <span>${escapeApprovalMarkup(time)}</span>
    <span>${escapeApprovalMarkup(activity || "-")}</span>
    <span>${escapeApprovalMarkup(location)}</span>
  </div>`;
}

function closeApprovalDetail() {
  approvalElements.modal.classList.remove("open");
  approvalElements.modal.setAttribute("aria-hidden", "true");
}

function openApprovalTurnsModal(turnoId) {
  selectedApproval = approvalRows.find((row) => String(row.turno_id) === String(turnoId));
  if (!selectedApproval) return;
  approvalElements.turnsTitle.textContent = `${selectedApproval.persona} · ${formatDisplayDate(parseInputDate(selectedApproval.fecha))}`;
  approvalElements.turnsBody.innerHTML = renderApprovalTurnsEditor(selectedApproval);
  approvalElements.turnsObservation.value = "";
  updateTurnAddControls();
  approvalElements.turnsModal.classList.add("open");
  approvalElements.turnsModal.setAttribute("aria-hidden", "false");
}

function closeApprovalTurnsModal() {
  approvalElements.turnsModal.classList.remove("open");
  approvalElements.turnsModal.setAttribute("aria-hidden", "true");
}

function renderApprovalTurnsEditor(row) {
  const lines = turnEditorLineSources(row).map((line) => markEditorLine(row, line.source, line.type, line.segmentNumber));
  return `<div class="approval-turns-summary">
      <span>Plan</span>
      <strong>${escapeApprovalMarkup(plannedShiftText(row))}</strong>
      <small>${escapeApprovalMarkup(row.actividad_ubicacion || "Sin especificar")}</small>
    </div>
    <div class="approval-turns-table">
      <div class="approval-turns-head">
        <span>Tramo</span>
        <span>Tipo</span>
        <span>Fecha</span>
        <span>Hora</span>
        <span>Proyecto</span>
        <span></span>
      </div>
      ${lines.length ? lines.join("") : `<div class="approval-turns-empty">Sin marcas registradas. Usá + para cargar la entrada.</div>`}
    </div>`;
}

function turnEditorLineSources(row) {
  const rawMarks = Array.isArray(row.marcas_detalle) ? row.marcas_detalle : [];
  if (rawMarks.length) {
    let entryCount = 0;
    let lastEntryNumber = 0;
    return rawMarks
      .slice()
      .sort((left, right) => String(`${left.fecha || ""} ${left.hora || ""} ${left.id || ""}`).localeCompare(String(`${right.fecha || ""} ${right.hora || ""} ${right.id || ""}`)))
      .map((mark) => {
        const type = String(mark.tipo || "").toLowerCase() === "salida" ? "Salida" : "Entrada";
        if (type === "Entrada") {
          entryCount += 1;
          lastEntryNumber = entryCount;
        }
        const segmentNumber = type === "Salida" ? (lastEntryNumber || entryCount || 1) : entryCount;
        const key = type === "Entrada" ? "entrada" : "salida";
        return {
          type,
          segmentNumber,
          source: {
            [`${key}_id`]: mark.id,
            [`${key}_fecha`]: mark.fecha,
            [`${key}_hora`]: mark.hora,
            [`${key}_actividad`]: mark.actividad,
          },
        };
      });
  }
  const segments = Array.isArray(row.tramos) && row.tramos.length ? row.tramos : [];
  if (segments.length) {
    return segments.flatMap((segment, index) => {
      const lines = [];
      if (segment.entrada_id) lines.push({ source: segment, type: "Entrada", segmentNumber: index + 1 });
      if (segment.salida_id) lines.push({ source: segment, type: "Salida", segmentNumber: index + 1 });
      return lines;
    });
  }
  const lines = [];
  if (row.entrada_id) {
    lines.push({
      type: "Entrada",
      segmentNumber: 1,
      source: {
        entrada_id: row.entrada_id,
        entrada_fecha: row.entrada_fecha,
        entrada_hora: row.entrada_hora,
        entrada_actividad: row.entrada_actividad,
      },
    });
  }
  if (row.salida_id) {
    lines.push({
      type: "Salida",
      segmentNumber: row.entrada_id ? 1 : 0,
      source: {
        salida_id: row.salida_id,
        salida_fecha: row.salida_fecha,
        salida_hora: row.salida_hora,
        salida_actividad: row.salida_actividad,
      },
    });
  }
  return lines.sort((left, right) => {
    const leftKey = markEditorSortKey(left.source, left.type);
    const rightKey = markEditorSortKey(right.source, right.type);
    return leftKey.localeCompare(rightKey);
  });
}

function markEditorSortKey(source, type) {
  const key = type === "Entrada" ? "entrada" : "salida";
  return `${source[`${key}_fecha`] || ""} ${source[`${key}_hora`] || ""}`;
}

function markEditorLine(row, source, type, segmentNumber, pending = false) {
  const key = type === "Entrada" ? "entrada" : "salida";
  const id = source[`${key}_id`] || "";
  const date = source[`${key}_fecha`] || defaultApprovalMarkDate(row, type);
  const time = source[`${key}_hora`] || "";
  const activity = source[`${key}_actividad`] || row.actividad_ubicacion || "";
  return `<div class="approval-turns-line ${id ? "" : "empty"}" data-turn-line data-turno-id="${row.turno_id}" data-mark-id="${id}" data-mark-type="${type}" data-pending="${pending ? "1" : "0"}">
    <span>${segmentNumber}</span>
    <strong>${type}</strong>
    <input data-turn-field="date" type="date" value="${escapeApprovalMarkup(date || row.fecha || "")}" disabled />
    <input data-turn-field="time" type="text" inputmode="numeric" value="${escapeApprovalMarkup(time)}" placeholder="HH:MM" disabled />
    <input data-turn-field="activity" type="text" value="${escapeApprovalMarkup((activity || "").toUpperCase())}" placeholder="Proyecto" disabled />
    <span class="approval-turn-actions">
      <button class="ghost-button small" data-turn-edit type="button">${pending ? "Guardar" : "Editar"}</button>
      ${id ? `<button class="ghost-button small danger" data-turn-delete type="button">Anular</button>` : ""}
    </span>
  </div>`;
}

function setTurnLineEditing(line, editing) {
  if (!line) return;
  line.classList.toggle("editing", editing);
  line.querySelectorAll("[data-turn-field]").forEach((input) => {
    input.disabled = !editing;
  });
  const button = line.querySelector("[data-turn-edit]");
  if (button) button.textContent = editing ? "Guardar" : (line.dataset.markId ? "Editar" : "Agregar");
  if (editing) {
    const focusTarget = line.querySelector('[data-turn-field="time"]') || line.querySelector("[data-turn-field]");
    focusTarget?.focus();
    focusTarget?.select?.();
  }
}

async function saveTurnLine(line) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(line?.dataset.turnoId));
  if (!row) return;
  const date = line.querySelector('[data-turn-field="date"]')?.value || row.fecha;
  const rawTime = normalizeApprovalTime(line.querySelector('[data-turn-field="time"]')?.value || "");
  if (timeToMinutes(rawTime) === null) {
    window.alert("La hora debe tener formato HH:MM");
    return;
  }
  const observation = approvalElements.turnsObservation.value.trim();
  const activity = (line.querySelector('[data-turn-field="activity"]')?.value || "").trim().toUpperCase();
  const payload = {
    tipo: line.dataset.markType,
    fecha: date,
    hora: rawTime,
    actividad_ubicacion: activity,
    ubicacion_detectada: "",
    observacion_modificacion: observation,
    usuario_id: currentUser()?.id,
    usuario_nombre: currentUser()?.username || currentUser()?.email,
  };
  if (line.dataset.markId) {
    await approvalApiPost(`/marcas/${line.dataset.markId}`, payload);
  } else {
    await approvalApiPost("/marcas", {
      ...payload,
      persona_id: row.persona_id,
      fecha_hora: `${date} ${rawTime}:00`,
      tipo_marca: "Marca manual admin",
      registrada_por_admin: true,
    });
  }
  showApprovalToast("Marca manual guardada");
  await refreshApprovalScope(row);
  selectedApproval = approvalRows.find((item) => String(item.turno_id) === String(row.turno_id)) || row;
  approvalElements.turnsBody.innerHTML = renderApprovalTurnsEditor(selectedApproval);
  updateTurnAddControls();
}

async function deleteTurnLine(line) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(line?.dataset.turnoId));
  const markId = line?.dataset.markId;
  if (!row || !markId) return;
  const observation = approvalElements.turnsObservation.value.trim();
  await approvalApiPost(`/marcas/${markId}/delete`, {
    usuario_id: currentUser()?.id,
    usuario_nombre: currentUser()?.username || currentUser()?.email,
    observacion_modificacion: observation,
  });
  showApprovalToast("Marca anulada");
  await refreshApprovalScope(row);
  selectedApproval = approvalRows.find((item) => String(item.turno_id) === String(row.turno_id)) || row;
  approvalElements.turnsBody.innerHTML = renderApprovalTurnsEditor(selectedApproval);
  updateTurnAddControls();
}

function addTurnLine(type) {
  if (!selectedApproval) return;
  const table = approvalElements.turnsBody.querySelector(".approval-turns-table");
  if (!table) return;
  const allowedType = nextAllowedTurnMarkType();
  if (hasPendingNewTurnLine() || allowedType !== type) {
    showApprovalToast("Completá la marca pendiente antes de agregar otra");
    updateTurnAddControls();
    return;
  }
  const lines = [...table.querySelectorAll("[data-turn-line]")];
  const nextSegment = nextTurnSegmentNumber(type, lines);
  const emptyState = table.querySelector(".approval-turns-empty");
  if (emptyState) emptyState.remove();
  table.insertAdjacentHTML("beforeend", markEditorLine(selectedApproval, {}, type, nextSegment, true));
  setTurnLineEditing(table.querySelector("[data-turn-line]:last-child"), true);
  updateTurnAddControls();
}

function updateTurnAddControls() {
  const allowedType = nextAllowedTurnMarkType();
  const hasPending = hasPendingNewTurnLine();
  approvalElements.addTurnMark.disabled = hasPending;
  approvalElements.addTurnMark.title = hasPending ? "Guardá la marca pendiente antes de agregar otra" : `Agregar ${allowedType.toLowerCase()}`;
  approvalElements.addTurnMark.setAttribute("aria-label", approvalElements.addTurnMark.title);
}

function hasPendingNewTurnLine() {
  return Boolean(approvalElements.turnsBody.querySelector('[data-turn-line][data-mark-id=""]'));
}

function nextAllowedTurnMarkType() {
  const marks = orderedTurnMarksFromSelectedApproval();
  if (!marks.length) return "Entrada";
  return marks[marks.length - 1].type === "Entrada" ? "Salida" : "Entrada";
}

function orderedTurnMarksFromSelectedApproval() {
  if (!selectedApproval) return [];
  const rawMarks = Array.isArray(selectedApproval.marcas_detalle) ? selectedApproval.marcas_detalle : [];
  if (rawMarks.length) {
    return rawMarks.map((mark) => ({
      type: String(mark.tipo || "").toLowerCase() === "salida" ? "Salida" : "Entrada",
      date: mark.fecha,
      time: mark.hora,
    })).sort((left, right) => String(`${left.date || ""} ${left.time || ""}`).localeCompare(String(`${right.date || ""} ${right.time || ""}`)));
  }
  const segments = Array.isArray(selectedApproval.tramos) ? selectedApproval.tramos : [];
  const marks = [];
  if (segments.length) {
    segments.forEach((segment) => {
      if (segment.entrada_id) marks.push({ type: "Entrada", date: segment.entrada_fecha, time: segment.entrada_hora });
      if (segment.salida_id) marks.push({ type: "Salida", date: segment.salida_fecha, time: segment.salida_hora });
    });
  } else {
    if (selectedApproval.entrada_id) marks.push({ type: "Entrada", date: selectedApproval.entrada_fecha, time: selectedApproval.entrada_hora });
    if (selectedApproval.salida_id) marks.push({ type: "Salida", date: selectedApproval.salida_fecha, time: selectedApproval.salida_hora });
  }
  return marks
    .filter((mark) => mark.date || mark.time)
    .sort((left, right) => String(`${left.date || ""} ${left.time || ""}`).localeCompare(String(`${right.date || ""} ${right.time || ""}`)));
}

function nextTurnSegmentNumber(type, lines) {
  const numbers = lines
    .filter((line) => line.dataset.markType === "Entrada")
    .map((line) => Number(line.firstElementChild?.textContent || 0))
    .filter(Number.isFinite);
  const lastNumber = numbers.length ? Math.max(...numbers) : 0;
  if (type === "Entrada") return lastNumber + 1;
  const lastEntryNumber = [...lines].reverse().find((line) => line.dataset.markType === "Entrada")?.firstElementChild?.textContent;
  return Number(lastEntryNumber || lastNumber || 1);
}

async function approveRow(turnoId, estado = "APROBADA", observation = "") {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  if (!row?.marcas_ids?.length) return;
  if (estado === "APROBADA" && approvalHasPendingIncidents(row)) {
    estado = "VALIDADA_CON_INCIDENCIA";
  }
  await approvalApiPost("/aprobaciones", {
    marca_ids: row.marcas_ids,
    estado,
    observacion: observation,
    usuario_id: currentUser()?.id,
  });
  showApprovalToast(estado === "APROBADA" ? "Jornal validado" : "Jornal rechazado");
  closeApprovalDetail();
  await refreshApprovalScope(row);
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
    await approvalApiPost("/aprobaciones", {
      marca_ids: cleanMarkIds,
      estado: "APROBADA",
      usuario_id: currentUser()?.id,
    });
  }
  if (incidentMarkIds.length) {
    await approvalApiPost("/aprobaciones", {
      marca_ids: incidentMarkIds,
      estado: "VALIDADA_CON_INCIDENCIA",
      usuario_id: currentUser()?.id,
    });
  }
  showApprovalToast(`${selectedRows.length} jornales validados`);
  selectedApprovalIds.clear();
  await refreshApprovals({ preservePage: true });
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
  await approvalApiPost("/observaciones-jornal/pasar-a-plan", { ids });
  showApprovalToast("Turno cargado en plan semanal");
  await refreshApprovalScope(row);
}

async function markApprovalAbsent(turnoId) {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  const ids = approvalIncidentsForRow(row).filter(incidentCanMarkAbsent).map((incident) => Number(incident.id));
  if (!ids.length) return;
  await approvalApiPost("/observaciones-jornal/marcar-ausente", { ids });
  showApprovalToast("Turno marcado como AUSENTE");
  await refreshApprovalScope(row);
}

function openApprovalMarkModal(turnoId, type, explicitMarkId = "") {
  const row = approvalRows.find((item) => String(item.turno_id) === String(turnoId));
  if (!row) return;
  const isEntry = type === "Entrada";
  const mark = explicitMarkId ? findApprovalMarkInRow(row, type, explicitMarkId) : null;
  const markId = explicitMarkId || (isEntry ? row.entrada_id : row.salida_id);
  const markDate = mark?.fecha || (isEntry ? row.entrada_fecha : row.salida_fecha);
  const markTime = mark?.hora || (isEntry ? row.entrada_hora : row.salida_hora);
  const markActivity = mark?.actividad || (isEntry ? row.entrada_actividad : row.salida_actividad) || row.actividad_ubicacion;
  approvalElements.markForm.dataset.mode = markId ? "edit" : "create";
  approvalElements.markForm.dataset.turnoId = row.turno_id || "";
  approvalElements.markTitle.textContent = `${markId ? "Editar" : "Agregar"} ${type.toLowerCase()}`;
  approvalElements.markId.value = markId || "";
  approvalElements.markPersonId.value = row.persona_id || "";
  approvalElements.markType.value = type;
  approvalElements.markDate.value = markDate || defaultApprovalMarkDate(row, type);
  approvalElements.markTime.value = markTime || defaultApprovalMarkTime(row, type);
  approvalElements.markActivity.value = (markActivity || "").toUpperCase();
  approvalElements.markObservation.value = "";
  approvalElements.markModal.classList.add("open");
  approvalElements.markModal.setAttribute("aria-hidden", "false");
}

function findApprovalMarkInRow(row, type, markId) {
  const key = type === "Entrada" ? "entrada" : "salida";
  const segments = Array.isArray(row.tramos) ? row.tramos : [];
  const segment = segments.find((item) => String(item[`${key}_id`] || "") === String(markId));
  if (!segment) return null;
  return {
    fecha: segment[`${key}_fecha`],
    hora: segment[`${key}_hora`],
    actividad: segment[`${key}_actividad`],
  };
}

function closeApprovalMarkModal() {
  approvalElements.markModal.classList.remove("open");
  approvalElements.markModal.setAttribute("aria-hidden", "true");
  approvalElements.markForm.reset();
}

async function saveApprovalMark(event) {
  event.preventDefault();
  const row = approvalRows.find((item) => String(item.turno_id) === String(approvalElements.markForm.dataset.turnoId));
  const rawTime = normalizeApprovalTime(approvalElements.markTime.value);
  if (timeToMinutes(rawTime) === null) {
    window.alert("La hora debe tener formato HH:MM");
    return;
  }
  const observation = approvalElements.markObservation.value.trim();
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
    await approvalApiPost(`/marcas/${approvalElements.markId.value}`, payload);
  } else {
    await approvalApiPost("/marcas", {
      ...payload,
      persona_id: approvalElements.markPersonId.value,
      fecha_hora: `${approvalElements.markDate.value} ${rawTime}:00`,
      tipo_marca: "Marca manual admin",
      registrada_por_admin: true,
    });
  }
  closeApprovalMarkModal();
  closeApprovalTurnsModal();
  showApprovalToast("Marca manual guardada");
  await refreshApprovalScope(row);
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

function plannedShiftCell(row) {
  if (row.estado_turno !== "NORMAL") {
    return `<div class="planned-shift-cell state-only">${escapeApprovalMarkup(row.estado_turno || "VACIO")}</div>`;
  }
  return `<div class="planned-shift-cell">
    <strong>${row.hora_inicio || "--"} - ${row.hora_fin || "--"}</strong>
    <span>${escapeApprovalMarkup(row.actividad_ubicacion || "SIN ESPECIFICAR")}</span>
  </div>`;
}

function markSegmentsCell(row, type) {
  const segments = Array.isArray(row.tramos) && row.tramos.length ? row.tramos : [];
  if (segments.length) {
    return `<div class="mark-segments">${segments
      .map((segment) => markSegmentItem(segment, type, row.fecha))
      .join("")}</div>`;
  }
  const time = type === "entrada" ? row.entrada_hora : row.salida_hora;
  const date = type === "entrada" ? row.entrada_fecha : row.salida_fecha;
  const activity = type === "entrada" ? row.entrada_actividad : row.salida_actividad;
  return `<div class="mark-segments">${markSegmentItem({
    [`${type}_hora`]: time,
    [`${type}_fecha`]: date,
    [`${type}_actividad`]: activity,
  }, type, row.fecha)}</div>`;
}

function markSegmentItem(segment, type, rowDate) {
  const time = segment[`${type}_hora`];
  if (!time) return `<span class="mark-segment empty">Sin marca</span>`;
  const date = segment[`${type}_fecha`];
  const activity = segment[`${type}_actividad`] || "";
  const dateSuffix = date && rowDate && date !== rowDate ? ` · ${formatShortDate(parseInputDate(date))}` : "";
  return `<span class="mark-segment">
    <strong>${time}${dateSuffix}</strong>
    ${activity ? `<small>${escapeApprovalMarkup(activity)}</small>` : ""}
  </span>`;
}

function hoursDiffCell(row) {
  const diff = approvalHoursDifference(row);
  if (diff === null) return `<span class="hours-diff muted">-</span>`;
  const className = approvalDifferenceClass(diff);
  return `<span class="hours-diff ${className}">${formatSignedHours(diff)}</span>`;
}

function approvalVisualClass(row) {
  const diff = approvalHoursDifference(row);
  if (!row.marcas_ids?.length) return "without-marks";
  return diff === null ? "" : `with-${approvalDifferenceClass(diff)}-diff`;
}

function approvalDifferenceClass(diff) {
  if (diff < 0) return "negative";
  if (diff === 0) return "neutral";
  if (diff <= 1) return "positive-ok";
  if (diff < 2) return "positive-warning";
  return "positive-danger";
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
  if (row.estado_aprobacion === "VALIDADA_CON_INCIDENCIA") return "Validado con observación";
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
  }[type] || type || "Observación";
}

function detailItem(label, value) {
  return `<article><span>${label}</span><strong>${value}</strong></article>`;
}

function severityLabel(value) {
  return {
    INFO: "Informativa",
    AMARILLA: "Amarilla",
    ROJA: "Roja",
    WARNING: "Amarilla",
    CRITICAL: "Roja",
  }[value] || value || "Sin severidad";
}

function escapeApprovalMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function formatFullDisplayDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
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
approvalElements.today?.addEventListener("click", () => {
  setApprovalTodayRange();
  refreshApprovals();
});
[approvalElements.person, approvalElements.status, approvalElements.observationType, approvalElements.observationSeverity, approvalElements.sort].forEach((element) => {
  element.addEventListener(element.type === "search" ? "input" : "change", () => {
    approvalPage = 1;
    renderApprovals();
  });
});
approvalElements.pagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-approval-page]");
  if (!button || approvalsLoading) return;
  approvalPage += button.dataset.approvalPage === "next" ? 1 : -1;
  renderApprovals();
});
approvalElements.selectAll.addEventListener("change", () => toggleAllVisibleApprovals(approvalElements.selectAll.checked));
approvalElements.approveSelection.addEventListener("click", () => approveSelectedRows().catch((error) => showApprovalToast(error.message)));
approvalElements.body.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-approval]");
  const approve = event.target.closest("[data-approve-approval]");
  const passToPlan = event.target.closest("[data-pass-approval-to-plan]");
  const markAbsent = event.target.closest("[data-mark-approval-absent]");
  const editTurns = event.target.closest("[data-edit-approval-turns]");
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
  if (editTurns) openApprovalTurnsModal(editTurns.dataset.editApprovalTurns);
  if (editMark) {
    const [turnoId, type, markId] = editMark.dataset.editApprovalMark.split(":");
    openApprovalMarkModal(turnoId, type, markId);
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
approvalElements.closeTurns.addEventListener("click", closeApprovalTurnsModal);
approvalElements.turnsModal.addEventListener("click", (event) => {
  if (event.target === approvalElements.turnsModal) closeApprovalTurnsModal();
});
approvalElements.turnsBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-turn-delete]");
  if (deleteButton) {
    const line = deleteButton.closest("[data-turn-line]");
    deleteTurnLine(line).catch((error) => showApprovalToast(error.message || "No se pudo anular la marca"));
    return;
  }
  const button = event.target.closest("[data-turn-edit]");
  if (!button) return;
  const line = button.closest("[data-turn-line]");
  if (!line) return;
  if (!line.classList.contains("editing")) {
    if (!line.dataset.markId && line.dataset.markType !== nextAllowedTurnMarkType()) {
      showApprovalToast(`Primero corresponde agregar ${nextAllowedTurnMarkType().toLowerCase()}`);
      updateTurnAddControls();
      return;
    }
    setTurnLineEditing(line, true);
    return;
  }
  saveTurnLine(line).catch((error) => showApprovalToast(error.message || "No se pudo guardar la marca"));
});
approvalElements.turnsBody.addEventListener("input", (event) => {
  const activity = event.target.closest('[data-turn-field="activity"]');
  if (activity) activity.value = activity.value.toUpperCase();
});
approvalElements.addTurnMark.addEventListener("click", () => {
  addTurnLine(nextAllowedTurnMarkType());
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
