if (!requireModuleAccess("personal")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const personElements = {
  form: document.querySelector("#personForm"),
  title: document.querySelector("#personFormTitle"),
  id: document.querySelector("#personId"),
  name: document.querySelector("#personNameInput"),
  privateId: document.querySelector("#personPrivateIdInput"),
  email: document.querySelector("#personEmailInput"),
  type: document.querySelector("#personTypeInput"),
  isOperator: document.querySelector("#personIsOperatorInput"),
  operatorCategory: document.querySelector("#operatorCategoryInput"),
  operatorCategoryField: document.querySelector("#operatorCategoryField"),
  mode: document.querySelector("#scheduleModeInput"),
  hourlyRate: document.querySelector("#hourlyRateInput"),
  driverLicenseType: document.querySelector("#driverLicenseTypeInput"),
  driverLicenseExpiry: document.querySelector("#driverLicenseExpiryInput"),
  healthCardExpiry: document.querySelector("#healthCardExpiryInput"),
  active: document.querySelector("#personActiveInput"),
  accessFields: document.querySelector("#accessFields"),
  accessPassword: document.querySelector("#accessPasswordInput"),
  accessRole: document.querySelector("#accessRoleInput"),
  faceStatus: document.querySelector("#faceEnrollmentStatus"),
  faceVideo: document.querySelector("#personFaceVideo"),
  faceCanvas: document.querySelector("#personFaceCanvas"),
  faceList: document.querySelector("#personFaceList"),
  faceStart: document.querySelector("#startPersonFaceCamera"),
  faceSave: document.querySelector("#savePersonFace"),
  fixedEditor: document.querySelector("#fixedScheduleEditor"),
  fixedRows: document.querySelector("#fixedScheduleRows"),
  list: document.querySelector("#personList"),
  filter: document.querySelector("#personFilterInput"),
  count: document.querySelector("#personListCount"),
  hourlyRateList: document.querySelector("#hourlyRateList"),
  hourlyRateFilter: document.querySelector("#hourlyRateFilterInput"),
  hourlyRateCount: document.querySelector("#hourlyRateCount"),
  toggleHourlyEdit: document.querySelector("#toggleHourlyEdit"),
  saveHourlyRates: document.querySelector("#saveHourlyRates"),
  operationValueList: document.querySelector("#operationValueList"),
  newOperationTariff: document.querySelector("#newOperationTariff"),
  saveOperationPrices: document.querySelector("#saveOperationPrices"),
  modal: document.querySelector("#personModal"),
  newButton: document.querySelector("#newPersonButton"),
  closeButton: document.querySelector("#closePersonModal"),
  cancelButton: document.querySelector("#cancelPersonButton"),
  toast: document.querySelector("#toast"),
};

let personnel = [];
let backendEnabled = false;
let availableOperatorTypes = [];
let availableAppRoles = [];
let availableOperationTariffs = [];
let appConfig = defaultPersonConfigSnapshot();
let hourlyEditMode = false;
let personFaceStream = null;
let selectedPersonFaces = [];
let personListSort = { key: "name", direction: "asc" };

const API_BASE = apiBase();

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la acción");
  return payload;
}

function defaultPersonConfigSnapshot() {
  return {
    operationBands: [...DEFAULT_OPERATION_BANDS],
    operationTariffs: [],
  };
}

function apiPersonToLocal(person) {
  const role = person.rol_operativo || "Operador";
  const hasAccess = Boolean(person.usuario_id);
  return {
    id: String(person.id),
    privateId: person.codigo_privado || "",
    email: person.email || "",
    name: person.nombre,
    team: teamFromOperationalRole(role),
    role,
    operatorType: role,
    hourlyRate: Number(person.valor_hora || 0),
    agreedHours: Number(person.horas_acordadas || 190),
    driverLicenseType: person.tipo_libreta || "NO TIENE",
    driverLicenseExpiry: person.vencimiento_libreta || "",
    healthCardExpiry: person.vencimiento_carne_salud || "",
    active: Number(person.activo) !== 0,
    scheduleMode: person.horario_tipo || "variable",
    fixedSchedule: parseFixedScheduleJson(person.horario_fijo_json),
    access: {
      enabled: hasAccess,
      email: person.email || person.usuario_email || "",
      roleId: normalizeApplicationRole(person.rol_app || "usuario"),
      active: hasAccess ? Number(person.usuario_activo) !== 0 : false,
    },
    operationTariffIds: parseOperationTariffIds(person.operacion_tarifa_ids),
  };
}

function localPersonToApi(person) {
  return {
    nombre: person.name,
    email: person.email,
    rol_operativo: person.operatorType,
    activo: person.active,
    horario_tipo: person.scheduleMode,
    horario_fijo: person.fixedSchedule,
    valor_hora: person.hourlyRate,
    horas_acordadas: person.agreedHours,
    tipo_libreta: person.driverLicenseType,
    vencimiento_libreta: person.driverLicenseExpiry || null,
    vencimiento_carne_salud: person.healthCardExpiry || null,
    operacion_tarifa_ids: person.operationTariffIds || [],
    acceso: {
      habilitado: person.access?.enabled,
      password: person.access?.password,
      email: person.email,
      rol_app: person.access?.roleId,
      activo: person.access?.active,
    },
  };
}

async function loadPersonnelFromBackend() {
  const [people, roles, appRoles, configRows, operationTariffs] = await Promise.all([
    apiRequest("/personas"),
    apiRequest("/roles-operativos"),
    apiRequest("/roles-app"),
    apiRequest("/configuracion"),
    apiRequest("/operacion-tarifas"),
  ]);
  const values = Object.fromEntries(configRows.map((row) => [row.clave, parseConfigValue(row.valor)]));
  backendEnabled = true;
  availableOperatorTypes = roles.map((role) => role.nombre).filter(Boolean);
  availableAppRoles = appRoles.map((role) => ({
    id: role.nombre,
    name: role.nombre === "rrhh" ? "RRHH" : role.nombre === "admin" ? "Admin" : "Usuario",
  }));
  availableOperationTariffs = operationTariffs.map(apiOperationTariffToLocal);
  appConfig = {
    ...defaultPersonConfigSnapshot(),
    operationTariffs: availableOperationTariffs,
  };
  personnel = people.map(apiPersonToLocal);
  renderPersonPage();
}

function parseConfigValue(value) {
  try {
    return JSON.parse(value || "null");
  } catch (error) {
    return null;
  }
}

function apiOperationTariffToLocal(tariff) {
  return {
    id: String(tariff.id),
    categoria: tariff.categoria || "",
    tipo: tariff.tipo || "",
    hasta_4hs: Number(tariff.hasta_4hs || 0),
    de_4_a_8hs: Number(tariff.de_4_a_8hs || 0),
    de_8_a_12hs: Number(tariff.de_8_a_12hs || 0),
    activo: Number(tariff.activo) !== 0,
    label: `${tariff.categoria || "Sin categoría"} · ${tariff.tipo || "Sin tipo"}`,
  };
}

function escapePersonText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseOperationTariffIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadPersonPage() {
  try {
    await loadPersonnelFromBackend();
  } catch (error) {
    backendEnabled = false;
    personnel = [];
    renderPersonPage();
    showPersonToast("No se pudo conectar con la base local");
  }
}

function parseFixedScheduleJson(value) {
  try {
    const schedule = JSON.parse(value || "[]");
    return Array.isArray(schedule) && schedule.length ? schedule : defaultFixedSchedule();
  } catch (error) {
    return defaultFixedSchedule();
  }
}

function formatOptionalDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function normalizeActivity(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function teamFromOperationalRole(role) {
  if (role === "Logistico") return "eventos";
  if (role === "Depo y Mant.") return "deposito";
  return "operacion";
}

function updateDriverLicenseExpiryState() {
  const hasLicense = personElements.driverLicenseType.value !== "NO TIENE";
  personElements.driverLicenseExpiry.disabled = !hasLicense;
  personElements.driverLicenseExpiry.required = hasLicense;
  if (!hasLicense) personElements.driverLicenseExpiry.value = "";
}

function renderPersonPage() {
  renderPersonTypeOptions();
  renderOperatorCategoryOptions();
  renderAccessRoleOptions();
  renderPersonList();
  renderHourlyRateList();
  renderOperationValueConfig();
  personElements.fixedEditor.classList.toggle("hidden", personElements.mode.value !== "fixed");
  updateDriverLicenseExpiryState();
  updateOperatorCategoryState();
  updateAccessFieldsState();
}

function openPersonSection(section) {
  document.querySelectorAll("[data-person-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.personTab === section);
  });
  document.querySelectorAll("[data-person-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.personPanel === section);
  });
}

function renderPersonTypeOptions() {
  const types = availableOperatorTypes.length ? availableOperatorTypes : DEFAULT_OPERATOR_TYPES;
  const currentValue = personElements.type.value;
  personElements.type.innerHTML = types.map((type) => `<option value="${type}">${type}</option>`).join("");
  if (types.includes(currentValue)) personElements.type.value = currentValue;
}

function renderOperatorCategoryOptions() {
  if (!personElements.operatorCategory) return;
  const currentValue = readOperatorCategoryInputs();
  const activeTariffs = availableOperationTariffs.filter((tariff) => tariff.activo);
  personElements.operatorCategory.innerHTML = activeTariffs.length
    ? activeTariffs
      .map((tariff) => `<label class="check-line operation-tariff-option">
        <span>${escapePersonText(tariff.label)}</span>
        <input data-operation-tariff-option="${tariff.id}" type="checkbox" />
      </label>`)
      .join("")
    : `<span>No hay tarifas activas parametrizadas.</span>`;
  setOperatorCategoryInputs(currentValue);
}

function renderOperationValueConfig() {
  if (!personElements.operationValueList) return;
  personElements.operationValueList.innerHTML = `<section class="operation-price-card operation-price-matrix">
      <table class="operation-price-table operation-tariff-table">
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Hasta 4 hs</th>
            <th>4 a 8 hs</th>
            <th>8 a 12 hs</th>
            <th>Activa</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${availableOperationTariffs.map((tariff) => operationTariffRow(tariff)).join("")}
        </tbody>
      </table>
    </section>`;
}

function operationTariffRow(tariff) {
  const id = escapePersonText(tariff.id);
  const isActive = Boolean(tariff.activo);
  return `<tr class="${isActive ? "" : "inactive"}">
    <td><input data-operation-tariff="${id}" data-field="categoria" type="text" value="${escapePersonText(tariff.categoria)}" placeholder="Ej: L1" /></td>
    <td><input data-operation-tariff="${id}" data-field="tipo" type="text" value="${escapePersonText(tariff.tipo)}" placeholder="Ej: Iluminación" /></td>
    <td><input data-operation-tariff="${id}" data-field="hasta_4hs" type="number" min="0" step="1" value="${Number(tariff.hasta_4hs || 0)}" /></td>
    <td><input data-operation-tariff="${id}" data-field="de_4_a_8hs" type="number" min="0" step="1" value="${Number(tariff.de_4_a_8hs || 0)}" /></td>
    <td><input data-operation-tariff="${id}" data-field="de_8_a_12hs" type="number" min="0" step="1" value="${Number(tariff.de_8_a_12hs || 0)}" /></td>
    <td class="center-cell"><input class="operation-active-check" data-operation-tariff="${id}" data-field="activo" type="checkbox" ${isActive ? "checked" : ""} /></td>
    <td><button class="ghost-button small" data-remove-operation-tariff="${id}" type="button" ${isActive ? "" : "disabled"}>${isActive ? "Desactivar" : "Inactiva"}</button></td>
  </tr>`;
}

function readOperationTariffsFromInputs() {
  const rows = new Map(availableOperationTariffs.map((tariff) => [String(tariff.id), { ...tariff }]));
  [...personElements.operationValueList.querySelectorAll("[data-operation-tariff]")].forEach((input) => {
    const id = input.dataset.operationTariff;
    const field = input.dataset.field;
    const row = rows.get(id);
    if (!row) return;
    if (field === "activo") row.activo = input.checked;
    else if (["hasta_4hs", "de_4_a_8hs", "de_8_a_12hs"].includes(field)) row[field] = Number(input.value || 0);
    else row[field] = input.value.trim();
  });
  return [...rows.values()];
}

function addOperationTariff() {
  availableOperationTariffs = readOperationTariffsFromInputs();
  availableOperationTariffs.push({
    id: `new-${Date.now()}`,
    categoria: "",
    tipo: "",
    hasta_4hs: 0,
    de_4_a_8hs: 0,
    de_8_a_12hs: 0,
    activo: true,
    isNew: true,
    label: "",
  });
  renderOperationValueConfig();
}

async function saveOperationPrices() {
  availableOperationTariffs = readOperationTariffsFromInputs();
  for (const tariff of availableOperationTariffs) {
    if (!tariff.categoria || !tariff.tipo) continue;
    await apiRequest(tariff.isNew ? "/operacion-tarifas" : `/operacion-tarifas/${encodeURIComponent(tariff.id)}`, {
      method: "POST",
      body: JSON.stringify(tariff),
    });
  }
  await loadPersonnelFromBackend();
  showPersonToast("Precios de operaciones guardados");
}

async function removeOperationTariff(id) {
  if (String(id).startsWith("new-")) {
    availableOperationTariffs = availableOperationTariffs.filter((item) => String(item.id) !== String(id));
    renderOperationValueConfig();
    return;
  }
  await apiRequest(`/operacion-tarifas/${encodeURIComponent(id)}/delete`, {
    method: "POST",
    body: "{}",
  });
  await loadPersonnelFromBackend();
  showPersonToast("Tarifa desactivada");
}

function readOperatorCategoryInputs() {
  const inputs = [...personElements.operatorCategory.querySelectorAll("[data-operation-tariff-option]")];
  if (!inputs.length) return parseOperationTariffIds(personElements.operatorCategory.dataset.value);
  return inputs.filter((input) => input.checked).map((input) => input.dataset.operationTariffOption);
}

function setOperatorCategoryInputs(value) {
  const normalized = Array.isArray(value) ? value.map(String) : parseOperationTariffIds(value);
  [...personElements.operatorCategory.querySelectorAll("[data-operation-tariff-option]")].forEach((input) => {
    input.checked = normalized.includes(String(input.dataset.operationTariffOption));
  });
  personElements.operatorCategory.dataset.value = normalized.join(",");
}

function renderAccessRoleOptions() {
  const roles = availableAppRoles.length ? availableAppRoles : DEFAULT_AUTH.roles;
  const currentValue = personElements.accessRole.value;
  personElements.accessRole.innerHTML = roles
    .map((role) => `<option value="${role.id}">${role.name}</option>`)
    .join("");
  if (roles.some((role) => role.id === currentValue)) personElements.accessRole.value = currentValue;
}

function updateOperatorCategoryState() {
  const enabled = personElements.isOperator.checked;
  personElements.operatorCategoryField.classList.toggle("hidden", !enabled);
  [...personElements.operatorCategory.querySelectorAll("input")].forEach((input) => {
    input.disabled = !enabled;
  });
}

function toggleOperatorFlag() {
  updateOperatorCategoryState();
}

function updateAccessFieldsState() {
  const enabled = personElements.active.checked;
  personElements.accessFields.classList.toggle("disabled-section", !enabled);
  [
    personElements.accessPassword,
    personElements.accessRole,
  ].forEach((field) => {
    field.disabled = !enabled;
  });
}

function renderFixedRows(schedule) {
  personElements.fixedRows.innerHTML = schedule
    .map((day, index) => `<div class="fixed-row" data-index="${index}">
      <strong>${day.day}</strong>
      <select class="fixed-status">
        <option value="normal" ${day.status === "normal" ? "selected" : ""}>Normal</option>
        <option value="LIBRE" ${day.status === "LIBRE" ? "selected" : ""}>Libre</option>
        <option value="LICENCIA" ${day.status === "LICENCIA" ? "selected" : ""}>Licencia</option>
        <option value="SUSPENDIDO" ${day.status === "SUSPENDIDO" ? "selected" : ""}>Suspendido</option>
        <option value="LIC. MEDICA" ${day.status === "LIC. MEDICA" ? "selected" : ""}>Lic. médica</option>
      </select>
      <input class="fixed-start" type="time" value="${day.start || ""}" />
      <input class="fixed-end" type="time" value="${day.end || ""}" />
      <input class="fixed-activity" type="text" value="${day.activity || ""}" placeholder="Actividad / ubicación" />
    </div>`)
    .join("");
}

function readFixedSchedule() {
  return [...document.querySelectorAll(".fixed-row")].map((row) => ({
    day: WEEKDAY_LABELS[Number(row.dataset.index)],
    status: row.querySelector(".fixed-status").value,
    start: row.querySelector(".fixed-start").value,
    end: row.querySelector(".fixed-end").value,
    activity: normalizeActivity(row.querySelector(".fixed-activity").value),
  }));
}

function renderPersonList() {
  const query = personElements.filter.value;
  const rows = sortPersonRows(personnel.filter((person) => matchesPersonFilter(person, query)));
  personElements.count.textContent = `${rows.length} personas`;
  renderPersonSortHeaders();
  if (!rows.length) {
    personElements.list.innerHTML = `<tr><td colspan="8">Sin personas para el filtro ingresado.</td></tr>`;
    return;
  }
  personElements.list.innerHTML = rows
    .map((person) => {
      const documentText = documentationText(person);
      const operatorText = personCanSubmitOperations(person) ? formatOperatorCategory(person.operationTariffIds) : "No";
      return `<tr class="${person.active ? "" : "inactive"}">
      <td>${person.privateId || "-"}</td>
      <td><strong>${person.name}</strong></td>
      <td>${person.email || "-"}</td>
      <td>${person.operatorType}</td>
      <td>${operatorText}</td>
      <td>${documentText}</td>
      <td><span class="access-status ${person.active ? "ok" : "off"}">${person.active ? "Activo" : "Inactivo"}</span></td>
      <td>
        <div class="table-actions">
        <button class="ghost-button small" data-edit="${person.id}" type="button">Editar</button>
        <button class="ghost-button small" data-toggle="${person.id}" type="button">${person.active ? "Deshabilitar usuario" : "Reactivar usuario"}</button>
        </div>
      </td>
    </tr>`;
    })
    .join("");
}

function sortPersonRows(rows) {
  return [...rows].sort((left, right) => {
    const result = comparePersonSortValues(personSortValue(left, personListSort.key), personSortValue(right, personListSort.key));
    return personListSort.direction === "asc" ? result : -result;
  });
}

function personSortValue(person, key) {
  if (key === "id") return person.privateId || "";
  if (key === "name") return person.name || "";
  if (key === "email") return person.email || "";
  if (key === "role") return person.operatorType || "";
  if (key === "operator") return personCanSubmitOperations(person) ? formatOperatorCategory(person.operationTariffIds) : "No";
  if (key === "documentation") return documentationText(person);
  if (key === "status") return person.active ? "Activo" : "Inactivo";
  return "";
}

function personCanSubmitOperations(person) {
  return Array.isArray(person.operationTariffIds) && person.operationTariffIds.length > 0;
}

function comparePersonSortValues(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (String(left).trim() && String(right).trim() && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return normalizePersonFilter(left).localeCompare(normalizePersonFilter(right), "es", { numeric: true });
}

function renderPersonSortHeaders() {
  document.querySelectorAll("[data-person-sort]").forEach((button) => {
    const active = button.dataset.personSort === personListSort.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-sort", active ? (personListSort.direction === "asc" ? "ascending" : "descending") : "none");
    const indicator = button.querySelector("span");
    if (indicator) indicator.textContent = active ? (personListSort.direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function updatePersonListSort(key) {
  if (personListSort.key === key) {
    personListSort = { key, direction: personListSort.direction === "asc" ? "desc" : "asc" };
  } else {
    personListSort = { key, direction: "asc" };
  }
  renderPersonList();
}

function formatOperatorCategory(value) {
  const ids = Array.isArray(value) ? value.map(String) : parseOperationTariffIds(value);
  if (!ids.length) return "Sin categorías";
  const labels = ids
    .map((id) => availableOperationTariffs.find((tariff) => tariff.id === String(id))?.label)
    .filter(Boolean);
  if (!labels.length) return `${ids.length} categorías`;
  return labels.length <= 2 ? labels.join(" · ") : `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`;
}

function documentationText(person) {
  const license = person.driverLicenseType && person.driverLicenseType !== "NO TIENE"
    ? `Libreta ${person.driverLicenseType}${person.driverLicenseExpiry ? ` ${formatOptionalDate(person.driverLicenseExpiry)}` : ""}`
    : "Sin libreta";
  const health = person.healthCardExpiry ? `Carné ${formatOptionalDate(person.healthCardExpiry)}` : "Sin carné";
  return `${license} · ${health}`;
}

function normalizePersonFilter(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesPersonFilter(person, query) {
  const haystack = [
    person.privateId,
    person.name,
    person.email,
    person.operatorType,
    person.scheduleMode === "fixed" ? "horario fijo" : "horario variable",
    person.access?.email,
    person.access?.enabled ? "con acceso" : "sin acceso",
    person.active ? "activo" : "inactivo",
    person.driverLicenseType,
    person.driverLicenseExpiry,
    person.healthCardExpiry,
  ].join(" ");
  return matchesMultiSearchQuery(haystack, query, normalizePersonFilter);
}

function renderHourlyRateList() {
  const query = personElements.hourlyRateFilter.value;
  const rows = personnel.filter((person) => matchesHourlyRateFilter(person, query));
  personElements.toggleHourlyEdit.textContent = hourlyEditMode ? "Cancelar edición" : "Modo editar";
  personElements.saveHourlyRates.disabled = !hourlyEditMode;
  personElements.hourlyRateCount.textContent = `${rows.length} personas`;
  if (!rows.length) {
    personElements.hourlyRateList.innerHTML = `<tr><td colspan="4">Sin personas para el filtro ingresado.</td></tr>`;
    return;
  }
  personElements.hourlyRateList.innerHTML = rows
    .map((person) => `<tr>
      <td><strong>${person.name}</strong></td>
      <td>${person.operatorType}</td>
      <td><input data-hourly-person="${person.id}" inputmode="decimal" type="text" value="${formatRateInput(person.hourlyRate)}" ${hourlyEditMode ? "" : "disabled"} /></td>
      <td><input data-agreed-hours-person="${person.id}" type="number" min="0" step="1" value="${formatHoursInput(person.agreedHours || 190)}" ${hourlyEditMode ? "" : "disabled"} /></td>
    </tr>`)
    .join("");
}

function formatRateInput(value) {
  const number = Number(value || 0);
  return number.toFixed(2).replace(".", ",");
}

function formatHoursInput(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function parseDecimalInput(value, fallback = 0) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return fallback;
  const compactValue = rawValue
    .replace(/\s/g, "")
    .replace(/\$/g, "");
  const normalized = compactValue.includes(",")
    ? compactValue.replace(/\./g, "").replace(",", ".")
    : compactValue;
  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    throw new Error("El valor hora debe ser un número con hasta 2 decimales");
  }
  return Number(number.toFixed(2));
}

function matchesHourlyRateFilter(person, query) {
  const haystack = [
    person.name,
    person.operatorType,
    person.active ? "activo" : "inactivo",
  ].join(" ");
  return matchesMultiSearchQuery(haystack, query, normalizePersonFilter);
}

function toggleHourlyEditMode() {
  hourlyEditMode = !hourlyEditMode;
  renderHourlyRateList();
}

async function saveHourlyRates() {
  const inputs = [...personElements.hourlyRateList.querySelectorAll("[data-hourly-person]")];
  try {
    for (const input of inputs) {
      const person = personnel.find((item) => item.id === input.dataset.hourlyPerson);
      if (!person) continue;
      const agreedInput = personElements.hourlyRateList.querySelector(`[data-agreed-hours-person="${CSS.escape(person.id)}"]`);
      const nextPerson = {
        ...person,
        hourlyRate: parseDecimalInput(input.value),
        agreedHours: Number(agreedInput?.value || 190),
      };
      await apiRequest(`/personas/${encodeURIComponent(person.id)}`, {
        method: "POST",
        body: JSON.stringify(localPersonToApi(nextPerson)),
      });
    }
    hourlyEditMode = false;
    await loadPersonnelFromBackend();
    showPersonToast("Valores hora guardados");
  } catch (error) {
    showPersonToast(error.message || "No se pudieron guardar los valores hora");
  }
}

function resetPersonForm() {
  personElements.title.textContent = "Nueva persona";
  personElements.id.value = "";
  personElements.name.value = "";
  personElements.privateId.value = "Se asigna al guardar";
  personElements.email.value = "";
  personElements.type.value = availableOperatorTypes[0] || "Operador";
  personElements.isOperator.checked = false;
  setOperatorCategoryInputs([]);
  personElements.mode.value = "variable";
  personElements.hourlyRate.value = "";
  personElements.driverLicenseType.value = "NO TIENE";
  personElements.driverLicenseExpiry.value = "";
  personElements.healthCardExpiry.value = "";
  personElements.active.checked = true;
  personElements.accessPassword.value = "";
  personElements.accessRole.value = "usuario";
  selectedPersonFaces = [];
  renderPersonFaces();
  renderFixedRows(defaultFixedSchedule());
  renderPersonPage();
  openPersonModal();
}

async function editPerson(id) {
  const person = personnel.find((item) => item.id === id);
  if (!person) return;
  personElements.title.textContent = "Editar persona";
  personElements.id.value = person.id;
  personElements.name.value = person.name;
  personElements.privateId.value = person.privateId || "";
  personElements.email.value = person.email || "";
  personElements.type.value = person.operatorType;
  personElements.isOperator.checked = personCanSubmitOperations(person) || person.operatorType === "Operador";
  setOperatorCategoryInputs(person.operationTariffIds);
  personElements.mode.value = person.scheduleMode;
  personElements.hourlyRate.value = formatRateInput(person.hourlyRate);
  personElements.driverLicenseType.value = person.driverLicenseType || "NO TIENE";
  personElements.driverLicenseExpiry.value = person.driverLicenseExpiry || "";
  personElements.healthCardExpiry.value = person.healthCardExpiry || "";
  personElements.active.checked = person.active;
  personElements.accessPassword.value = "";
  personElements.accessRole.value = person.access?.roleId || "usuario";
  renderFixedRows(person.fixedSchedule || defaultFixedSchedule());
  selectedPersonFaces = [];
  renderPersonPage();
  openPersonModal();
  await loadPersonFaces(id);
}

async function savePerson(event) {
  event.preventDefault();
  const id = personElements.id.value || `person-${Date.now()}`;
  const nextPerson = {
    id,
    privateId: personElements.privateId.value.trim(),
    email: personElements.email.value.trim(),
    name: personElements.name.value.trim(),
    team: teamFromOperationalRole(personElements.type.value),
    role: personElements.type.value,
    operatorType: personElements.type.value,
    hourlyRate: parseDecimalInput(personElements.hourlyRate.value),
    driverLicenseType: personElements.driverLicenseType.value,
    driverLicenseExpiry: personElements.driverLicenseType.value === "NO TIENE" ? "" : personElements.driverLicenseExpiry.value,
    healthCardExpiry: personElements.healthCardExpiry.value,
    active: personElements.active.checked,
    scheduleMode: personElements.mode.value,
    fixedSchedule: readFixedSchedule(),
    operationTariffIds: personElements.isOperator.checked ? readOperatorCategoryInputs() : [],
    access: {
      enabled: personElements.active.checked,
      password: personElements.accessPassword.value,
      email: personElements.email.value.trim(),
      roleId: personElements.accessRole.value,
      active: personElements.active.checked,
    },
  };

  if (nextPerson.active && !nextPerson.email) {
    showPersonToast("Completá el mail para habilitar acceso");
    return;
  }

  if (backendEnabled) {
    try {
      const path = personElements.id.value ? `/personas/${encodeURIComponent(personElements.id.value)}` : "/personas";
      await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(localPersonToApi(nextPerson)),
      });
      await loadPersonnelFromBackend();
      closePersonModal();
      showPersonToast("Personal guardado en la base local");
      return;
    } catch (error) {
      showPersonToast(error.message || "No se pudo guardar");
      return;
    }
  }

  showPersonToast("No hay conexión con la base local");
}

async function togglePerson(id) {
  if (backendEnabled) {
    try {
      await apiRequest(`/personas/${encodeURIComponent(id)}/toggle`, { method: "POST" });
      await loadPersonnelFromBackend();
      showPersonToast("Estado actualizado");
      return;
    } catch (error) {
      showPersonToast(error.message || "No se pudo actualizar");
      return;
    }
  }

  showPersonToast("No hay conexión con la base local");
}

async function loadPersonFaces(personId) {
  if (!personId || !backendEnabled) {
    selectedPersonFaces = [];
    renderPersonFaces();
    return;
  }
  try {
    selectedPersonFaces = await apiRequest(`/personas/${encodeURIComponent(personId)}/rostros`);
  } catch (error) {
    selectedPersonFaces = [];
    showPersonToast(error.message || "No se pudieron cargar los rostros");
  }
  renderPersonFaces();
}

function renderPersonFaces() {
  const activeFaces = selectedPersonFaces.filter((face) => Number(face.activo) !== 0);
  const ready = activeFaces.length >= 3;
  const limitReached = activeFaces.length >= 5;
  personElements.faceStatus.textContent = ready ? `${activeFaces.length}/5 listo` : `${activeFaces.length}/3 mínimo`;
  personElements.faceStatus.classList.toggle("ok", ready);
  personElements.faceStatus.classList.toggle("off", !ready);
  personElements.faceSave.disabled = !personElements.id.value || !personFaceStream || limitReached;
  if (!personElements.id.value) {
    personElements.faceList.innerHTML = `<p class="muted">Guardá la persona antes de cargar rostro facial.</p>`;
    return;
  }
  if (!selectedPersonFaces.length) {
    personElements.faceList.innerHTML = `<p class="muted">Sin rostros registrados. Cargá al menos 3 capturas.</p>`;
    return;
  }
  personElements.faceList.innerHTML = selectedPersonFaces
    .map((face) => `<article class="face-template-item ${Number(face.activo) ? "" : "inactive"}">
      <div>
        <strong>${Number(face.activo) ? "Rostro activo" : "Rostro inactivo"}</strong>
        <span>${face.fecha_alta || ""}</span>
      </div>
      <button class="ghost-button small" data-toggle-face-template="${face.id}" type="button">${Number(face.activo) ? "Desactivar" : "Activar"}</button>
    </article>`)
    .join("");
}

async function startPersonFaceCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showPersonToast("Este navegador no permite abrir cámara");
    return;
  }
  try {
    if (personFaceStream) {
      personFaceStream.getTracks().forEach((track) => track.stop());
    }
    personFaceStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      },
      audio: false,
    });
    personElements.faceVideo.srcObject = personFaceStream;
    await new Promise((resolve) => {
      if (personElements.faceVideo.readyState >= 2 && personElements.faceVideo.videoWidth) {
        resolve();
        return;
      }
      personElements.faceVideo.onloadedmetadata = () => resolve();
    });
    await personElements.faceVideo.play().catch(() => {});
    renderPersonFaces();
    showPersonToast("Cámara activa");
  } catch (error) {
    showPersonToast("No se pudo acceder a la cámara");
  }
}

async function savePersonFace() {
  const personId = personElements.id.value;
  if (!personId) {
    showPersonToast("Primero guardá la persona");
    return;
  }
  if (!personFaceStream) {
    showPersonToast("Abrí la cámara para capturar el rostro");
    return;
  }
  const activeFaces = selectedPersonFaces.filter((face) => Number(face.activo) !== 0);
  if (activeFaces.length >= 5) {
    showPersonToast("Máximo 5 rostros activos por persona");
    return;
  }
  try {
    if (!personElements.faceVideo.videoWidth || !personElements.faceVideo.videoHeight) {
      showPersonToast("Esperá un segundo a que la cámara enfoque");
      return;
    }
    const descriptor = buildFaceDescriptor(personElements.faceVideo, personElements.faceCanvas);
    await apiRequest(`/personas/${encodeURIComponent(personId)}/rostros`, {
      method: "POST",
      body: JSON.stringify({ descriptor, observacion: "Carga desde ficha de personal" }),
    });
    await loadPersonFaces(personId);
    showPersonToast("Rostro guardado");
  } catch (error) {
    showPersonToast(error.message || "No se pudo guardar el rostro");
  }
}

async function togglePersonFace(faceId) {
  await apiRequest(`/personas/rostros/${encodeURIComponent(faceId)}/toggle`, {
    method: "POST",
    body: "{}",
  });
  await loadPersonFaces(personElements.id.value);
  showPersonToast("Rostro actualizado");
}

function showPersonToast(message) {
  personElements.toast.textContent = message;
  personElements.toast.classList.add("visible");
  window.setTimeout(() => personElements.toast.classList.remove("visible"), 2200);
}

function openPersonModal() {
  personElements.modal.setAttribute("aria-hidden", "false");
  openPersonSection("editor");
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => personElements.name.focus(), 0);
}

function closePersonModal() {
  personElements.modal.setAttribute("aria-hidden", "true");
  openPersonSection("listado");
}

personElements.form.addEventListener("submit", savePerson);
personElements.newButton.addEventListener("click", resetPersonForm);
personElements.closeButton.addEventListener("click", closePersonModal);
personElements.cancelButton.addEventListener("click", closePersonModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && personElements.modal.classList.contains("active")) closePersonModal();
});
personElements.mode.addEventListener("change", renderPersonPage);
personElements.type.addEventListener("change", updateOperatorCategoryState);
personElements.isOperator.addEventListener("change", toggleOperatorFlag);
personElements.driverLicenseType.addEventListener("change", updateDriverLicenseExpiryState);
personElements.active.addEventListener("change", updateAccessFieldsState);
personElements.filter.addEventListener("input", renderPersonList);
document.querySelector(".person-table thead")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-person-sort]");
  if (!button) return;
  updatePersonListSort(button.dataset.personSort);
});
personElements.hourlyRateFilter.addEventListener("input", renderHourlyRateList);
personElements.toggleHourlyEdit.addEventListener("click", toggleHourlyEditMode);
personElements.saveHourlyRates.addEventListener("click", saveHourlyRates);
personElements.newOperationTariff.addEventListener("click", addOperationTariff);
personElements.saveOperationPrices.addEventListener("click", () => {
  saveOperationPrices().catch((error) => showPersonToast(error.message || "No se pudieron guardar los precios"));
});
personElements.list.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit]");
  const toggle = event.target.closest("[data-toggle]");
  if (edit) editPerson(edit.dataset.edit).catch((error) => showPersonToast(error.message || "No se pudo abrir la persona"));
  if (toggle) togglePerson(toggle.dataset.toggle);
});
document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-person-tab]");
  if (tab) openPersonSection(tab.dataset.personTab);
});
personElements.operationValueList.addEventListener("click", (event) => {
  const removeOperationTariffButton = event.target.closest("[data-remove-operation-tariff]");
  if (!removeOperationTariffButton || removeOperationTariffButton.disabled) return;
  event.preventDefault();
  removeOperationTariff(removeOperationTariffButton.dataset.removeOperationTariff)
    .catch((error) => showPersonToast(error.message || "No se pudo desactivar la tarifa"));
});
personElements.faceStart.addEventListener("click", startPersonFaceCamera);
personElements.faceSave.addEventListener("click", savePersonFace);
personElements.faceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-face-template]");
  if (!button) return;
  togglePersonFace(button.dataset.toggleFaceTemplate)
    .catch((error) => showPersonToast(error.message || "No se pudo actualizar el rostro"));
});
loadPersonPage();
