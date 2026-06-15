if (!requireModuleAccess("config")) throw new Error("Acceso no autorizado");
if (currentUser()?.roleId !== "admin") {
  window.location.href = "./index.html";
  throw new Error("Solo administrador");
}
renderSessionActions(document.querySelector(".top-actions"));

const configElements = {
  operatorTypeForm: document.querySelector("#operatorTypeForm"),
  operatorTypeInput: document.querySelector("#operatorTypeInput"),
  operatorTypeList: document.querySelector("#operatorTypeList"),
  approvalToleranceInput: document.querySelector("#approvalToleranceInput"),
  alertGreenToleranceInput: document.querySelector("#alertGreenToleranceInput"),
  alertYellowToleranceInput: document.querySelector("#alertYellowToleranceInput"),
  saveGeneralParams: document.querySelector("#saveGeneralParams"),
  newLocationButton: document.querySelector("#newLocationButton"),
  locationList: document.querySelector("#locationList"),
  projectForm: document.querySelector("#projectForm"),
  projectInput: document.querySelector("#projectInput"),
  projectList: document.querySelector("#projectList"),
  faceClockForm: document.querySelector("#faceClockForm"),
  faceClockNameInput: document.querySelector("#faceClockNameInput"),
  faceClockGeneratedLink: document.querySelector("#faceClockGeneratedLink"),
  faceClockList: document.querySelector("#faceClockList"),
  locationModal: document.querySelector("#locationModal"),
  locationModalTitle: document.querySelector("#locationModalTitle"),
  closeLocationModal: document.querySelector("#closeLocationModal"),
  locationEditForm: document.querySelector("#locationEditForm"),
  locationEditId: document.querySelector("#locationEditId"),
  locationEditName: document.querySelector("#locationEditName"),
  locationEditMap: document.querySelector("#locationEditMap"),
  locationEditTolerance: document.querySelector("#locationEditTolerance"),
  locationEditAddress: document.querySelector("#locationEditAddress"),
  locationEditIncident: document.querySelector("#locationEditIncident"),
  lookupLocationAddress: document.querySelector("#lookupLocationAddress"),
  rolePermissionList: document.querySelector("#rolePermissionList"),
  toast: document.querySelector("#toast"),
};

const CONFIG_API_BASE = apiBase();
let appConfig = defaultConfigSnapshot();
let authConfig = { ...DEFAULT_AUTH };

function defaultConfigSnapshot() {
  return {
    operatorTypes: [...DEFAULT_OPERATOR_TYPES],
    planRoleVisibility: { ...DEFAULT_PLAN_ROLE_VISIBILITY },
    operationBands: [...DEFAULT_OPERATION_BANDS],
    operationTariffs: [],
    alertTolerance: { ...DEFAULT_ALERT_TOLERANCE },
    approvalTolerance: { ...DEFAULT_APPROVAL_TOLERANCE },
    locations: [],
    projects: [],
    faceClocks: [],
  };
}

async function configApi(path, options = {}) {
  const response = await fetch(`${CONFIG_API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo guardar la configuración");
  return payload;
}

async function loadConfigFromBackend() {
  const [roles, locations, projects, configRows, appRoles, operationTariffs, faceClocks] = await Promise.all([
    configApi("/roles-operativos"),
    configApi("/ubicaciones"),
    configApi("/proyectos"),
    configApi("/configuracion"),
    configApi("/roles-app"),
    configApi("/operacion-tarifas"),
    configApi("/relojes-faciales"),
  ]);
  const values = Object.fromEntries(configRows.map((row) => [row.clave, parseConfigValue(row.valor)]));
  appConfig = {
    ...defaultConfigSnapshot(),
    operatorTypes: roles.map((role) => role.nombre),
    planRoleVisibility: Object.fromEntries(roles.map((role) => [role.nombre, Number(role.aparece_plan_semanal) !== 0])),
    alertTolerance: values.alert_tolerance || { ...DEFAULT_ALERT_TOLERANCE },
    approvalTolerance: values.approval_tolerance || { ...DEFAULT_APPROVAL_TOLERANCE },
    operationTariffs: operationTariffs.map(apiOperationTariffToConfig),
    locations: locations.map(apiLocationToConfig),
    projects: projects.map(apiProjectToConfig),
    faceClocks: faceClocks.map(apiFaceClockToConfig),
  };
  authConfig = {
    roles: appRoles.map((role) => {
      const defaults = DEFAULT_AUTH.roles.find((item) => item.id === normalizeApplicationRole(role.nombre));
      const savedPermissions = values.role_permissions?.[normalizeApplicationRole(role.nombre)] || {};
      return {
        id: normalizeApplicationRole(role.nombre),
        name: role.nombre === "rrhh" ? "RRHH" : role.nombre === "admin" ? "Admin" : "Usuario",
        modules: savedPermissions.modules || defaults?.modules || [],
        dashboard: savedPermissions.dashboard || defaults?.dashboard || [],
      };
    }),
  };
}

function parseConfigValue(value) {
  try {
    return JSON.parse(value || "null");
  } catch (error) {
    return null;
  }
}

function apiLocationToConfig(location) {
  return {
    id: String(location.id),
    name: location.nombre,
    latitude: Number(location.latitud || 0),
    longitude: Number(location.longitud || 0),
    toleranceMeters: Number(location.tolerancia_metros || 500),
    mapUrl: location.google_maps_url || "",
    address: location.direccion || "",
    locationType: Number(location.genera_incidencia || 0) ? "incident" : "admitted",
    generatesIncident: Number(location.genera_incidencia || 0) !== 0,
  };
}

function apiOperationTariffToConfig(tariff) {
  return {
    id: String(tariff.id),
    categoria: tariff.categoria || "",
    tipo: tariff.tipo || "",
    hasta_4hs: Number(tariff.hasta_4hs || 0),
    de_4_a_8hs: Number(tariff.de_4_a_8hs || 0),
    de_8_a_12hs: Number(tariff.de_8_a_12hs || 0),
    activo: Number(tariff.activo) !== 0,
  };
}

function apiProjectToConfig(project) {
  return {
    id: String(project.id),
    name: project.nombre || "",
    active: Number(project.activo) !== 0,
  };
}

function apiFaceClockToConfig(link) {
  return {
    id: String(link.id),
    name: link.nombre || "",
    active: Number(link.activo) !== 0,
    createdAt: link.fecha_creacion || "",
    expiresAt: link.fecha_expiracion || "",
    lastUsedAt: link.ultimo_uso || "",
    token: link.token_visible || "",
  };
}

function openConfigSection(section) {
  document.querySelectorAll("[data-config-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.configTab === section);
  });
  document.querySelectorAll("[data-config-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.configPanel === section);
  });
}

function renderConfig() {
  renderOperationalRoleList();
  renderGeneralParams();
  renderLocationList();
  renderProjectList();
  renderFaceClockList();
  renderAccessConfig();
}

function renderGeneralParams() {
  if (!configElements.approvalToleranceInput) return;
  configElements.approvalToleranceInput.value = Number(appConfig.approvalTolerance?.minutes ?? DEFAULT_APPROVAL_TOLERANCE.minutes);
  configElements.alertGreenToleranceInput.value = Number(appConfig.alertTolerance?.greenMinutes ?? DEFAULT_ALERT_TOLERANCE.greenMinutes);
  configElements.alertYellowToleranceInput.value = Number(appConfig.alertTolerance?.yellowMinutes ?? DEFAULT_ALERT_TOLERANCE.yellowMinutes);
}

function renderOperationalRoleList() {
  configElements.operatorTypeList.innerHTML = appConfig.operatorTypes
    .map((item) => `<article class="admin-list-item">
      <strong>${item}</strong>
      <div class="role-list-actions">
        <label class="role-plan-toggle">
          <span>Plan Semanal</span>
          <input type="checkbox" data-plan-role="${item}" ${roleVisibleInPlan(item, appConfig) ? "checked" : ""} />
        </label>
        <button class="ghost-button small" data-key="operatorTypes" data-value="${item}" type="button">Eliminar</button>
      </div>
    </article>`)
    .join("");
}

function escapeConfigText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortConfigAddress(address) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ") || "Dirección pendiente";
}

function googleMapsUrlForLocation(location) {
  if (location.mapUrl) return location.mapUrl;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function renderLocationList() {
  if (!appConfig.locations.length) {
    configElements.locationList.innerHTML = `<article class="admin-list-item"><strong>Sin ubicaciones parametrizadas</strong><span>Agregá una etiqueta, un link de Google Maps y el margen.</span></article>`;
    return;
  }

  configElements.locationList.innerHTML = `<div class="location-table-wrap">
    <table class="location-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Link</th>
          <th>Estado</th>
          <th>Dirección OpenStreetMap</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
        ${appConfig.locations
          .map((location) => {
            const mapUrl = googleMapsUrlForLocation(location);
            return `<tr>
              <td><strong>${escapeConfigText(location.name)}</strong></td>
              <td>${mapUrl ? `<a class="location-map-link" href="${escapeConfigText(mapUrl)}" target="_blank" rel="noopener">Ver ubicación</a>` : "-"}</td>
              <td><span class="location-type-pill ${location.generatesIncident ? "incident" : ""}">${location.generatesIncident ? "No habilitada" : "Habilitada"}</span></td>
              <td><span class="location-address-line">${escapeConfigText(shortConfigAddress(location.address))}</span></td>
              <td>
                <div class="table-actions">
                  <button class="ghost-button small" data-edit-location="${location.id}" type="button">Editar</button>
                  <button class="ghost-button small" data-location="${location.id}" type="button">Eliminar</button>
                </div>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderFaceClockList() {
  if (!configElements.faceClockList) return;
  if (!appConfig.faceClocks.length) {
    configElements.faceClockList.innerHTML = `<article class="admin-list-item"><strong>Sin links generados</strong><span>Generá un acceso para cada reloj facial físico o punto de ingreso.</span></article>`;
    return;
  }

  configElements.faceClockList.innerHTML = appConfig.faceClocks
    .map((link) => {
      const url = link.token ? faceClockUrl(link.token) : "";
      return `<article class="admin-list-item face-clock-item">
      <div>
        <strong>${escapeConfigText(link.name)}</strong>
        <span>${link.active ? "Activo" : "Inactivo"} · Último uso: ${escapeConfigText(formatConfigDateTime(link.lastUsedAt) || "sin uso")}${link.expiresAt ? ` · Vence: ${escapeConfigText(formatConfigDate(link.expiresAt))}` : ""}</span>
        <div class="face-clock-link-row">
          ${url ? `<button class="ghost-button small" data-copy-face-clock-link="${escapeConfigText(url)}" type="button">Copiar link</button>` : `<span class="muted">Link no disponible. Generá uno nuevo.</span>`}
        </div>
      </div>
      <div class="table-actions">
        <button class="ghost-button small" data-face-clock-toggle="${link.id}" type="button">${link.active ? "Desactivar" : "Activar"}</button>
        <button class="ghost-button small" data-face-clock-delete="${link.id}" type="button">Eliminar</button>
      </div>
    </article>`;
    })
    .join("");
}

function renderProjectList() {
  if (!configElements.projectList) return;
  if (!appConfig.projects.length) {
    configElements.projectList.innerHTML = `<article class="admin-list-item"><strong>Sin proyectos cargados</strong><span>Agregá los proyectos disponibles para reloj y operaciones.</span></article>`;
    return;
  }

  configElements.projectList.innerHTML = appConfig.projects
    .map((project) => `<article class="admin-list-item">
      <div>
        <strong>${escapeConfigText(project.name)}</strong>
        <span>${project.active ? "Activo" : "Inactivo"}</span>
      </div>
      <div class="table-actions">
        <button class="ghost-button small" data-project-delete="${project.id}" type="button">${project.active ? "Desactivar" : "Eliminar"}</button>
      </div>
    </article>`)
    .join("");
}

function formatConfigDate(value) {
  if (!value) return "";
  const [datePart] = String(value).split(" ");
  const [year, month, day] = datePart.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatConfigDateTime(value) {
  if (!value) return "";
  const [datePart, timePart = ""] = String(value).split(" ");
  return `${formatConfigDate(datePart)}${timePart ? ` ${timePart.slice(0, 5)}` : ""}`.trim();
}

function faceClockUrl(token) {
  const path = window.location.pathname.replace(/configuracion\.html$/, "reloj-facial.html");
  return `${window.location.origin}${path}?token=${encodeURIComponent(token)}`;
}

async function createFaceClockLink() {
  const name = configElements.faceClockNameInput.value.trim();
  if (!name) {
    showConfigToast("Ingresá un nombre para el reloj");
    return;
  }
  const response = await configApi("/relojes-faciales", {
    method: "POST",
    body: JSON.stringify({
      nombre: name,
      fecha_expiracion: null,
    }),
  });
  const url = faceClockUrl(response.token);
  configElements.faceClockGeneratedLink.hidden = false;
  configElements.faceClockGeneratedLink.innerHTML = `
    <span>Link generado</span>
    <input readonly value="${escapeConfigText(url)}" />
    <button class="ghost-button small" data-copy-face-clock-link="${escapeConfigText(url)}" type="button">Copiar</button>
  `;
  configElements.faceClockNameInput.value = "";
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Link generado");
}

async function toggleFaceClockLink(id) {
  await configApi(`/relojes-faciales/${id}/toggle`, { method: "POST", body: "{}" });
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Reloj facial actualizado");
}

async function deleteFaceClockLink(id) {
  if (!window.confirm("¿Eliminar este reloj facial? El historial de marcas se mantiene.")) return;
  await configApi(`/relojes-faciales/${id}/delete`, { method: "POST", body: "{}" });
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Reloj facial eliminado");
}

async function createProject() {
  const name = configElements.projectInput.value.trim();
  if (!name) {
    showConfigToast("Ingresá un proyecto");
    return;
  }
  await configApi("/proyectos", {
    method: "POST",
    body: JSON.stringify({ nombre: name, activo: true }),
  });
  configElements.projectInput.value = "";
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Proyecto guardado");
}

async function deleteProject(id) {
  await configApi(`/proyectos/${id}/delete`, { method: "POST", body: "{}" });
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Proyecto desactivado");
}

async function addConfigItem(key, value) {
  const clean = key === "operatorTypes" ? normalizeOperationalRole(value) : value.trim();
  if (!clean) return;
  if (key === "operatorTypes") {
    await configApi("/roles-operativos", {
      method: "POST",
      body: JSON.stringify({ nombre: clean, aparece_plan_semanal: clean !== "Admin" }),
    });
    await loadConfigFromBackend();
  }
  renderConfig();
  showConfigToast("Parámetro guardado");
}

async function removeConfigItem(key, value) {
  if (key === "operatorTypes") {
    const role = await findOperationalRole(value);
    if (!role) return;
    await configApi(`/roles-operativos/${role.id}/delete`, { method: "POST", body: "{}" });
    await loadConfigFromBackend();
  }
  renderConfig();
  showConfigToast("Parámetro eliminado");
}

async function updatePlanRoleVisibility(input) {
  const role = await findOperationalRole(input.dataset.planRole);
  if (!role) return;
  await configApi(`/roles-operativos/${role.id}`, {
    method: "POST",
    body: JSON.stringify({ nombre: role.nombre, aparece_plan_semanal: input.checked }),
  });
  await loadConfigFromBackend();
  showConfigToast("Visibilidad del plan actualizada");
}

async function findOperationalRole(name) {
  const roles = await configApi("/roles-operativos");
  return roles.find((role) => role.nombre === name);
}

async function saveConfigValue(clave, valor) {
  await configApi("/configuracion", {
    method: "POST",
    body: JSON.stringify({ clave, valor }),
  });
}

async function saveGeneralParams() {
  const minutes = Math.max(0, Number(configElements.approvalToleranceInput.value || DEFAULT_APPROVAL_TOLERANCE.minutes));
  const greenMinutes = Math.max(0, Number(configElements.alertGreenToleranceInput.value || DEFAULT_ALERT_TOLERANCE.greenMinutes));
  const yellowMinutes = Math.max(greenMinutes, Number(configElements.alertYellowToleranceInput.value || DEFAULT_ALERT_TOLERANCE.yellowMinutes));
  appConfig.approvalTolerance = { minutes };
  appConfig.alertTolerance = { greenMinutes, yellowMinutes };
  await saveConfigValue("approval_tolerance", appConfig.approvalTolerance);
  await saveConfigValue("alert_tolerance", appConfig.alertTolerance);
  renderGeneralParams();
  showConfigToast("Parámetros guardados");
}

function parseGoogleMapsCoordinates(value) {
  const clean = decodeURIComponent(value || "");
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) return { latitude: Number(match[1]), longitude: Number(match[2]) };
  }

  return null;
}

async function removeLocation(id) {
  await configApi(`/ubicaciones/${id}/delete`, { method: "POST", body: "{}" });
  await loadConfigFromBackend();
  renderConfig();
  showConfigToast("Ubicación eliminada");
}

function openLocationModal(id) {
  const location = appConfig.locations.find((item) => item.id === id);
  if (!location) return;
  configElements.locationModalTitle.textContent = "Editar locación";
  configElements.locationEditId.value = location.id;
  configElements.locationEditName.value = location.name || "";
  configElements.locationEditMap.value = location.mapUrl || "";
  configElements.locationEditTolerance.value = location.toleranceMeters || 500;
  configElements.locationEditAddress.value = location.address || "";
  configElements.locationEditIncident.checked = Boolean(location.generatesIncident);
  configElements.locationModal.classList.add("open");
  configElements.locationModal.setAttribute("aria-hidden", "false");
}

function openNewLocationModal() {
  configElements.locationModalTitle.textContent = "Nueva locación";
  configElements.locationEditId.value = "";
  configElements.locationEditName.value = "";
  configElements.locationEditMap.value = "";
  configElements.locationEditTolerance.value = "500";
  configElements.locationEditAddress.value = "";
  configElements.locationEditIncident.checked = false;
  configElements.locationModal.classList.add("open");
  configElements.locationModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => configElements.locationEditName.focus(), 0);
}

function closeLocationModal() {
  configElements.locationModal.classList.remove("open");
  configElements.locationModal.setAttribute("aria-hidden", "true");
}

async function saveEditedLocation() {
  const id = configElements.locationEditId.value;
  const coordinates = parseGoogleMapsCoordinates(configElements.locationEditMap.value);
  if (!coordinates) {
    showConfigToast("No pude leer coordenadas del link");
    return;
  }
  await configApi(id ? `/ubicaciones/${id}` : "/ubicaciones", {
    method: "POST",
    body: JSON.stringify({
      nombre: configElements.locationEditName.value.trim(),
      google_maps_url: configElements.locationEditMap.value.trim(),
      latitud: coordinates.latitude,
      longitud: coordinates.longitude,
      tolerancia_metros: Number(configElements.locationEditTolerance.value || 500),
      genera_incidencia: configElements.locationEditIncident.checked,
      direccion: configElements.locationEditAddress.value.trim(),
    }),
  });
  await loadConfigFromBackend();
  renderConfig();
  closeLocationModal();
  showConfigToast(id ? "Locación actualizada" : "Locación guardada");
}

async function lookupEditedLocationAddress() {
  const coordinates = parseGoogleMapsCoordinates(configElements.locationEditMap.value);
  if (!coordinates) {
    showConfigToast("No pude leer coordenadas del link");
    return;
  }
  configElements.locationEditAddress.value = await reverseGeocodeAddress(coordinates);
  showConfigToast("Dirección actualizada");
}

async function reverseGeocodeAddress(coordinates) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(coordinates.latitude)}&lon=${encodeURIComponent(coordinates.longitude)}&zoom=18&addressdetails=1`;
    const response = await fetch(url);
    if (!response.ok) return "";
    const data = await response.json();
    return data.display_name || "";
  } catch (error) {
    return "";
  }
}

function renderAccessConfig() {
  configElements.rolePermissionList.innerHTML = `
    ${permissionMatrix("Módulos disponibles", "module", SYSTEM_MODULES, "modules")}
    ${permissionMatrix("Dashboard", "dashboard", DASHBOARD_PERMISSIONS, "dashboard")}
  `;
}

function permissionMatrix(title, scope, items, roleKey) {
  return `<div class="permission-matrix-wrap">
    <div class="permission-matrix-title">${title}</div>
    <table class="permission-matrix">
      <thead>
        <tr>
          <th>Rol</th>
          ${items.map((item) => `<th>${item.title || item.label}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${authConfig.roles
          .map((role) => `<tr>
            <th scope="row">${role.name}</th>
            ${items
              .map((item) => `<td>
                <input
                  aria-label="${role.name} - ${item.title || item.label}"
                  type="checkbox"
                  data-permission-scope="${scope}"
                  data-role="${role.id}"
                  value="${item.id}"
                  ${role[roleKey].includes(item.id) ? "checked" : ""}
                />
              </td>`)
              .join("")}
          </tr>`)
          .join("")}
      </tbody>
    </table>
  </div>`;
}

async function updateRolePermission(input) {
  const role = authConfig.roles.find((item) => item.id === input.dataset.role);
  if (!role) return;
  const key = input.dataset.permissionScope === "dashboard" ? "dashboard" : "modules";
  role[key] = input.checked ? [...new Set([...role[key], input.value])] : role[key].filter((item) => item !== input.value);
  await saveConfigValue("role_permissions", Object.fromEntries(authConfig.roles.map((item) => [
    item.id,
    { modules: item.modules, dashboard: item.dashboard },
  ])));
  showConfigToast("Permisos actualizados");
}

function showConfigToast(message) {
  configElements.toast.textContent = message;
  configElements.toast.classList.add("visible");
  window.setTimeout(() => configElements.toast.classList.remove("visible"), 2200);
}

configElements.operatorTypeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addConfigItem("operatorTypes", configElements.operatorTypeInput.value).catch((error) => showConfigToast(error.message));
  configElements.operatorTypeInput.value = "";
});

configElements.locationEditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedLocation().catch((error) => showConfigToast(error.message));
});

configElements.closeLocationModal.addEventListener("click", closeLocationModal);
configElements.newLocationButton.addEventListener("click", openNewLocationModal);
configElements.lookupLocationAddress.addEventListener("click", lookupEditedLocationAddress);
configElements.locationModal.addEventListener("click", (event) => {
  if (event.target === configElements.locationModal) closeLocationModal();
});
configElements.saveGeneralParams.addEventListener("click", () => {
  saveGeneralParams().catch((error) => showConfigToast(error.message));
});
configElements.faceClockForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  createFaceClockLink().catch((error) => showConfigToast(error.message));
});
configElements.projectForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  createProject().catch((error) => showConfigToast(error.message));
});

document.addEventListener("click", (event) => {
  const configTab = event.target.closest("[data-config-tab]");
  const button = event.target.closest("[data-key]");
  const locationButton = event.target.closest("[data-location]");
  const editLocationButton = event.target.closest("[data-edit-location]");
  const faceClockToggle = event.target.closest("[data-face-clock-toggle]");
  const faceClockDelete = event.target.closest("[data-face-clock-delete]");
  const copyFaceClockLink = event.target.closest("[data-copy-face-clock-link]");
  const projectDelete = event.target.closest("[data-project-delete]");
  if (configTab) openConfigSection(configTab.dataset.configTab);
  if (button) removeConfigItem(button.dataset.key, button.dataset.value).catch((error) => showConfigToast(error.message));
  if (locationButton) removeLocation(locationButton.dataset.location).catch((error) => showConfigToast(error.message));
  if (editLocationButton) openLocationModal(editLocationButton.dataset.editLocation);
  if (faceClockToggle) toggleFaceClockLink(faceClockToggle.dataset.faceClockToggle).catch((error) => showConfigToast(error.message));
  if (faceClockDelete) deleteFaceClockLink(faceClockDelete.dataset.faceClockDelete).catch((error) => showConfigToast(error.message));
  if (projectDelete) deleteProject(projectDelete.dataset.projectDelete).catch((error) => showConfigToast(error.message));
  if (copyFaceClockLink) {
    navigator.clipboard?.writeText(copyFaceClockLink.dataset.copyFaceClockLink);
    showConfigToast("Link copiado");
  }
});

document.addEventListener("change", (event) => {
  const input = event.target.closest("[data-permission-scope]");
  const planRoleInput = event.target.closest("[data-plan-role]");
  if (input) updateRolePermission(input).catch((error) => showConfigToast(error.message));
  if (planRoleInput) updatePlanRoleVisibility(planRoleInput).catch((error) => showConfigToast(error.message));
});

loadConfigFromBackend()
  .then(() => {
    renderConfig();
  })
  .catch((error) => {
    renderConfig();
    showConfigToast(error.message || "No se pudo conectar con la base local");
  });
