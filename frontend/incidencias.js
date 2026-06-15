if (!requireModuleAccess("incidencias")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const INCIDENT_API_BASE = apiBase();

const incidentElements = {
  from: document.querySelector("#incidentFrom"),
  to: document.querySelector("#incidentTo"),
  person: document.querySelector("#incidentPerson"),
  type: document.querySelector("#incidentType"),
  severity: document.querySelector("#incidentSeverity"),
  status: document.querySelector("#incidentStatus"),
  count: document.querySelector("#incidentCount"),
  body: document.querySelector("#incidentTableBody"),
  modal: document.querySelector("#incidentDetailModal"),
  closeModal: document.querySelector("#closeIncidentDetail"),
  detailTitle: document.querySelector("#incidentDetailTitle"),
  detailBody: document.querySelector("#incidentDetailBody"),
  passToPlanDetail: document.querySelector("#passIncidentToPlanDetail"),
  markAbsentDetail: document.querySelector("#markIncidentAbsentDetail"),
  resolveDetail: document.querySelector("#resolveIncidentDetail"),
  markEditModal: document.querySelector("#incidentMarkEditModal"),
  markEditForm: document.querySelector("#incidentMarkEditForm"),
  markId: document.querySelector("#incidentMarkId"),
  markType: document.querySelector("#incidentMarkType"),
  markDate: document.querySelector("#incidentMarkDate"),
  markTime: document.querySelector("#incidentMarkTime"),
  markActivity: document.querySelector("#incidentMarkActivity"),
  markLocation: document.querySelector("#incidentMarkLocation"),
  markObservation: document.querySelector("#incidentMarkObservation"),
  cancelMarkEdit: document.querySelector("#cancelIncidentMarkEdit"),
  toast: document.querySelector("#toast"),
};

let incidents = [];
let selectedIncident = null;

function initIncidents() {
  const monday = mondayDate(new Date());
  incidentElements.from.value = inputDateValue(monday);
  incidentElements.to.value = inputDateValue(addDays(monday, 6));
  refreshIncidents();
}

async function incidentApiGet(path) {
  const response = await fetch(`${INCIDENT_API_BASE}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function incidentApiPost(path, payload) {
  const response = await fetch(`${INCIDENT_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `No se pudo guardar ${path}`);
  return data;
}

async function refreshIncidents() {
  try {
    const { from, to } = selectedIncidentRange();
    const status = incidentElements.status.value || "pendientes";
    const statusQuery = status === "todos" ? "" : `&estado=${encodeURIComponent(status)}`;
    incidents = await incidentApiGet(`/incidencias?desde=${inputDateValue(from)}&hasta=${inputDateValue(to)}${statusQuery}`);
    renderIncidentTypeOptions();
    renderIncidents();
  } catch (error) {
    showIncidentToast(error.message || "No se pudo cargar incidencias");
    incidentElements.body.innerHTML = `<tr><td colspan="7">No se pudo conectar con la base local.</td></tr>`;
  }
}

function renderIncidentTypeOptions() {
  const current = incidentElements.type.value || "todos";
  const types = [...new Set(incidents.map((incident) => incident.tipo).filter(Boolean))].sort();
  incidentElements.type.innerHTML = `<option value="todos">Todos</option>${types
    .map((type) => `<option value="${type}">${incidentTypeLabel(type)}</option>`)
    .join("")}`;
  incidentElements.type.value = types.includes(current) ? current : "todos";
}

function renderIncidents() {
  const filtered = filteredIncidents();
  incidentElements.count.textContent = `${filtered.length} incidencias`;
  if (!filtered.length) {
    incidentElements.body.innerHTML = `<tr><td colspan="7">Sin incidencias para los filtros seleccionados.</td></tr>`;
    return;
  }

  incidentElements.body.innerHTML = filtered
    .map((incident) => `<tr>
      <td>${formatDisplayDate(parseInputDate(incident.fecha))}</td>
      <td>${incident.persona || "Sin persona"}</td>
      <td>${incidentTypeLabel(incident.tipo)}</td>
      <td><span class="mark-pill ${severityClass(incident.severidad)}">${incident.severidad || "INFO"}</span></td>
      <td>${incident.detalle || ""}</td>
      <td>${Number(incident.resuelta || 0) ? "Aprobada" : "Pendiente"}</td>
      <td>
        <div class="table-actions">
          <button class="ghost-button small" data-view-incident="${incident.id}" type="button">Ver detalle</button>
          ${incidentActionAllowed(incident, "editar_marca") ? `<button class="ghost-button small" data-edit-incident="${incident.id}" type="button">Editar</button>` : ""}
          ${incidentActionAllowed(incident, "pasar_a_plan") ? `<button class="ghost-button small" data-pass-to-plan="${incident.id}" type="button">Pasar a plan semanal</button>` : ""}
          ${incidentActionAllowed(incident, "marcar_ausente") ? `<button class="ghost-button small" data-mark-absent="${incident.id}" type="button">Marcar ausente</button>` : ""}
          <button class="primary-button small" data-resolve-incident="${incident.id}" type="button" ${incidentActionAllowed(incident, "aprobar") ? "" : "disabled"} ${incident.bloqueo_aprobar ? `title="${escapeHtml(incident.bloqueo_aprobar)}"` : ""}>Aprobar</button>
        </div>
      </td>
    </tr>`)
    .join("");
}

function filteredIncidents() {
  const personQuery = incidentElements.person.value;
  const type = incidentElements.type.value || "todos";
  const severity = incidentElements.severity.value || "todos";
  return incidents.filter((incident) => {
    const matchesPerson = matchesMultiSearchQuery(incident.persona, personQuery, normalizeSearchText);
    const matchesType = type === "todos" || incident.tipo === type;
    const matchesSeverity = severity === "todos" || incident.severidad === severity;
    return matchesPerson && matchesType && matchesSeverity;
  });
}

function openIncidentDetail(id) {
  selectedIncident = incidents.find((incident) => String(incident.id) === String(id));
  if (!selectedIncident) return;
  incidentElements.detailTitle.textContent = incidentTypeLabel(selectedIncident.tipo);
  incidentElements.detailBody.innerHTML = `
    ${detailItem("Persona", selectedIncident.persona || "Sin persona")}
    ${detailItem("Fecha", formatDisplayDate(parseInputDate(selectedIncident.fecha)))}
    ${detailItem("Severidad", selectedIncident.severidad || "INFO")}
    ${detailItem("Estado", Number(selectedIncident.resuelta || 0) ? "Aprobada" : "Pendiente")}
    ${incidentRequiresPlanning(selectedIncident) ? detailItem("Acción opcional", "Pasar a plan semanal para regularizar la planificación histórica") : ""}
    ${incidentCanMarkAbsent(selectedIncident) ? detailItem("Acción posible", "Marcar el turno como AUSENTE en el plan semanal") : ""}
    ${detailItem("Detalle", selectedIncident.detalle || "-")}
    ${detailItem("Turno previsto", plannedShiftText(selectedIncident))}
    ${detailItem("Marcas del día", selectedIncident.marcas_horarios || "-")}
    ${selectedIncident.marca_fecha_hora ? detailItem("Marca involucrada", `${selectedIncident.marca_tipo || "Marca"} ${formatTime(parseDbDateTime(selectedIncident.marca_fecha_hora))}`) : ""}
    ${locationDetailItem(selectedIncident)}
    ${detailItem("Actividad / ubicación", selectedIncident.turno_actividad_ubicacion || selectedIncident.marca_actividad_ubicacion || "-")}
    ${detailItem("Minutos de desfasaje", selectedIncident.minutos_desfasaje ?? "-")}
    ${detailItem("Origen", selectedIncident.origen || "-")}
    ${detailItem("Referencia", [selectedIncident.referencia_tipo, selectedIncident.referencia_id].filter(Boolean).join(" #") || "-")}
    ${detailItem("Creada", selectedIncident.fecha_creacion || "-")}
    ${detailItem("Actualizada", selectedIncident.fecha_actualizacion || "-")}
    ${Number(selectedIncident.resuelta || 0) ? detailItem("Aprobada por", selectedIncident.aprobado_por_usuario || "-") : ""}
    ${Number(selectedIncident.resuelta || 0) ? detailItem("Fecha de aprobación", selectedIncident.fecha_resolucion || "-") : ""}
    ${Number(selectedIncident.resuelta || 0) ? detailItem("Comentario aprobación", selectedIncident.observacion_aprobacion || "-") : ""}
  `;
  incidentElements.resolveDetail.disabled = !incidentActionAllowed(selectedIncident, "aprobar");
  incidentElements.passToPlanDetail.hidden = !incidentRequiresPlanning(selectedIncident);
  incidentElements.passToPlanDetail.disabled = Number(selectedIncident.resuelta || 0) !== 0;
  incidentElements.markAbsentDetail.hidden = !incidentCanMarkAbsent(selectedIncident);
  incidentElements.markAbsentDetail.disabled = Number(selectedIncident.resuelta || 0) !== 0;
  incidentElements.modal.classList.add("open");
  incidentElements.modal.setAttribute("aria-hidden", "false");
}

function closeIncidentDetail() {
  incidentElements.modal.classList.remove("open");
  incidentElements.modal.setAttribute("aria-hidden", "true");
}

async function resolveIncident(id) {
  const incident = incidents.find((item) => String(item.id) === String(id));
  if (incident && incidentCanMarkAbsent(incident)) {
    showIncidentToast("Cargá marca manual o marcá AUSENTE");
    return;
  }
  const comment = approvalCommentPrompt();
  if (comment === null) return;
  await incidentApiPost("/incidencias/resolver", {
    ids: [Number(id)],
    usuario_id: currentUser()?.id,
    observacion_aprobacion: comment,
  });
  showIncidentToast("Incidencia aprobada");
  closeIncidentDetail();
  await refreshIncidents();
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
  if (action === "marcar_ausente") return ["TURNO_CON_MARCAS_FALTANTES", "TURNO_SIN_ENTRADA", "TURNO_SIN_SALIDA"].includes(incident?.tipo) && !String(incident.marcas_horarios || "").trim();
  if (action === "aprobar") return !incidentActionAllowed(incident, "marcar_ausente");
  return false;
}

function plannedShiftText(incident) {
  const status = String(incident.turno_estado || "VACIO").toUpperCase();
  if (status !== "NORMAL") return status;
  const start = incident.turno_hora_inicio || "--:--";
  const end = incident.turno_hora_fin || "--:--";
  return `${start} - ${end}`;
}

async function passIncidentToPlan(id) {
  await incidentApiPost("/incidencias/pasar-a-plan", {
    ids: [Number(id)],
  });
  showIncidentToast("Turno cargado en plan semanal");
  closeIncidentDetail();
  await refreshIncidents();
}

async function markIncidentAbsent(id) {
  await incidentApiPost("/incidencias/marcar-ausente", {
    ids: [Number(id)],
  });
  showIncidentToast("Turno marcado como AUSENTE");
  closeIncidentDetail();
  await refreshIncidents();
}

function approvalCommentPrompt() {
  const comment = window.prompt("Comentario opcional para la aprobación de la incidencia");
  return comment === null ? null : comment.trim();
}

function openIncidentMarkEdit(id) {
  const incident = incidents.find((item) => String(item.id) === String(id));
  if (!incident || incident.referencia_tipo !== "marca") {
    showIncidentToast("Esta incidencia no tiene una marca directa para editar");
    return;
  }
  const date = parseDbDateTime(incident.marca_fecha_hora);
  incidentElements.markId.value = incident.referencia_id;
  incidentElements.markType.value = capitalize(String(incident.marca_tipo || "Entrada").toLowerCase());
  incidentElements.markDate.value = inputDateValue(date);
  incidentElements.markTime.value = formatTime(date);
  incidentElements.markActivity.value = incident.marca_actividad_ubicacion || "";
  incidentElements.markLocation.value = incident.marca_ubicacion_detectada || "";
  incidentElements.markObservation.value = "";
  incidentElements.markEditModal.classList.add("open");
  incidentElements.markEditModal.setAttribute("aria-hidden", "false");
}

function closeIncidentMarkEdit() {
  incidentElements.markEditModal.classList.remove("open");
  incidentElements.markEditModal.setAttribute("aria-hidden", "true");
  incidentElements.markEditForm.reset();
}

async function saveIncidentMarkEdit(event) {
  event.preventDefault();
  const rawTime = normalizeIncidentTime(incidentElements.markTime.value);
  if (timeToMinutes(rawTime) === null) {
    showIncidentToast("La hora debe tener formato HH:MM");
    return;
  }
  const observation = incidentElements.markObservation.value.trim();
  if (!observation) {
    showIncidentToast("La observación es obligatoria");
    incidentElements.markObservation.focus();
    return;
  }
  await incidentApiPost(`/marcas/${incidentElements.markId.value}`, {
    tipo: incidentElements.markType.value,
    fecha: incidentElements.markDate.value,
    hora: rawTime,
    actividad_ubicacion: incidentElements.markActivity.value.trim().toUpperCase(),
    ubicacion_detectada: incidentElements.markLocation.value.trim(),
    observacion_modificacion: observation,
    usuario_id: currentUser()?.id,
    usuario_nombre: currentUser()?.username,
  });
  showIncidentToast("Marca actualizada");
  closeIncidentMarkEdit();
  await refreshIncidents();
}

function detailItem(label, value) {
  return `<article><span>${label}</span><strong>${value}</strong></article>`;
}

function locationDetailItem(incident) {
  if (incident.tipo !== "MARCA_FUERA_UBICACION") return "";
  const url = googleMapsUrl(incident.marca_latitud, incident.marca_longitud);
  if (url) return detailItem("Ubicación de marca", `<a class="inline-map-link" href="${url}" target="_blank" rel="noopener">Ver ubicación</a>`);
  return detailItem("Ubicación de marca", "Sin coordenadas registradas");
}

function googleMapsUrl(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function selectedIncidentRange() {
  const from = parseInputDate(incidentElements.from.value) || new Date();
  const to = parseInputDate(incidentElements.to.value) || from;
  return from <= to ? { from, to } : { from: to, to: from };
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

function severityClass(severity) {
  if (severity === "ROJA") return "severity-red";
  if (severity === "AMARILLA") return "severity-yellow";
  return "severity-info";
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

function parseDbDateTime(value) {
  const [datePart, timePart = "00:00:00"] = String(value || "").replace("T", " ").split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart.split(":").map(Number);
  return year && month && day ? new Date(year, month - 1, day, hour || 0, minute || 0) : new Date();
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeIncidentTime(value) {
  const [hour, minute = "00"] = String(value || "").split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] || 0);
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function formatDisplayDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function showIncidentToast(message) {
  incidentElements.toast.textContent = message;
  incidentElements.toast.classList.add("visible");
  window.setTimeout(() => incidentElements.toast.classList.remove("visible"), 2200);
}

[incidentElements.from, incidentElements.to, incidentElements.status].forEach((element) => {
  element.addEventListener("change", refreshIncidents);
});
[incidentElements.person, incidentElements.type, incidentElements.severity].forEach((element) => {
  element.addEventListener(element.type === "search" ? "input" : "change", renderIncidents);
});

incidentElements.body.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view-incident]");
  const edit = event.target.closest("[data-edit-incident]");
  const resolve = event.target.closest("[data-resolve-incident]");
  const passToPlan = event.target.closest("[data-pass-to-plan]");
  const markAbsent = event.target.closest("[data-mark-absent]");
  if (view) openIncidentDetail(view.dataset.viewIncident);
  if (edit) openIncidentMarkEdit(edit.dataset.editIncident);
  if (resolve) resolveIncident(resolve.dataset.resolveIncident).catch((error) => showIncidentToast(error.message || "No se pudo aprobar"));
  if (passToPlan) passIncidentToPlan(passToPlan.dataset.passToPlan).catch((error) => showIncidentToast(error.message || "No se pudo pasar al plan"));
  if (markAbsent) markIncidentAbsent(markAbsent.dataset.markAbsent).catch((error) => showIncidentToast(error.message || "No se pudo marcar ausente"));
});
incidentElements.closeModal.addEventListener("click", closeIncidentDetail);
incidentElements.modal.addEventListener("click", (event) => {
  if (event.target === incidentElements.modal) closeIncidentDetail();
});
incidentElements.resolveDetail.addEventListener("click", () => {
  if (selectedIncident) resolveIncident(selectedIncident.id).catch((error) => showIncidentToast(error.message || "No se pudo aprobar"));
});
incidentElements.passToPlanDetail.addEventListener("click", () => {
  if (selectedIncident) passIncidentToPlan(selectedIncident.id).catch((error) => showIncidentToast(error.message || "No se pudo pasar al plan"));
});
incidentElements.markAbsentDetail.addEventListener("click", () => {
  if (selectedIncident) markIncidentAbsent(selectedIncident.id).catch((error) => showIncidentToast(error.message || "No se pudo marcar ausente"));
});
incidentElements.markEditForm.addEventListener("submit", saveIncidentMarkEdit);
incidentElements.cancelMarkEdit.addEventListener("click", closeIncidentMarkEdit);
incidentElements.markEditModal.addEventListener("click", (event) => {
  if (event.target === incidentElements.markEditModal) closeIncidentMarkEdit();
});

initIncidents();
