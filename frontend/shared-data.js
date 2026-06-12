const APP_CONFIG_KEY = "plannerConfig";
const APP_PERSONNEL_KEY = "plannerPersonnel";
const APP_AUTH_KEY = "plannerAuth";

const DEFAULT_OPERATOR_TYPES = ["Logistico", "Referente", "Operador", "Depo y Mant.", "Admin"];
const DEFAULT_PLAN_ROLE_VISIBILITY = {
  Logistico: true,
  Referente: true,
  Operador: true,
  "Depo y Mant.": true,
  Admin: false,
};
const DEFAULT_OPERATION_BANDS = ["Hasta 4 horas", "4 a 8 horas", "8 a 12 horas"];
const DEFAULT_LOCATIONS = [];
const DEFAULT_ALERT_TOLERANCE = { greenMinutes: 15, yellowMinutes: 30 };
const DEFAULT_APPROVAL_TOLERANCE = { minutes: 15 };
const SYSTEM_MODULES = [
  { id: "plan", title: "Plan semanal", href: "./plan-semanal.html", text: "Asignar turnos, estados, horarios y actividad por persona y día." },
  { id: "dashboard", title: "Dashboard", href: "./dashboard.html", text: "Ver desvíos, costos, alertas y detalle mensual por persona." },
  { id: "incidencias", title: "Incidencias", href: "./incidencias.html", text: "Revisar marcas fuera de regla, ausencias y diferencias contra el plan." },
  { id: "aprobaciones", title: "Validación de jornales", href: "./aprobaciones.html", text: "Comparar horas previstas y trabajadas, y validar jornales." },
  { id: "operaciones", title: "Validación de operaciones", href: "./operaciones.html", text: "Aprobar, rechazar y corregir operaciones cargadas por operadores." },
  { id: "reportes", title: "Reportes", href: "./reportes.html", text: "Generar archivos CSV para nómina, control y análisis externo." },
  { id: "analisis", title: "Análisis", href: "./analisis.html", text: "Tablero mensual de horas, costos, sueldos estimados y franjas de control." },
  { id: "facturacion", title: "Facturación", href: "./facturacion.html", text: "Cargar órdenes, referencias, lugares y montos para cruzar facturación contra costos." },
  { id: "importacion", title: "Importación de datos", href: "./importacion.html", text: "Cargar marcas históricas en lote desde archivos o planillas." },
  { id: "liquidacion", title: "Liquidación de sueldos", href: "./liquidacion.html", text: "Preparar conceptos, horas y costos para futura liquidación." },
  { id: "personal", title: "Personal", href: "./personal.html", text: "Administrar personas, accesos, roles, horarios fijos y valores hora." },
  { id: "config", title: "Configuración", href: "./configuracion.html", text: "Definir permisos, ubicaciones, tolerancias y parámetros generales." },
  { id: "marcas", title: "Reloj", href: "./marcas.html", text: "Registrar entrada o salida y ver el plan publicado del día." },
  { id: "mis-marcas", title: "Mis marcas", href: "./mis-marcas.html", text: "Consultar marcas, horas trabajadas y operaciones del mes." },
];
const DASHBOARD_PERMISSIONS = [
  { id: "dashboardAllPersonnel", label: "Ver todo el personal" },
  { id: "dashboardCosts", label: "Ver costos" },
  { id: "dashboardOperations", label: "Gestionar operaciones" },
];
const DEFAULT_AUTH = {
  roles: [
    {
      id: "admin",
      name: "Admin",
      modules: ["plan", "dashboard", "incidencias", "aprobaciones", "operaciones", "reportes", "analisis", "facturacion", "importacion", "liquidacion", "personal", "config", "marcas", "mis-marcas"],
      dashboard: ["dashboardAllPersonnel", "dashboardCosts", "dashboardOperations"],
    },
    {
      id: "rrhh",
      name: "RRHH",
      modules: ["plan", "dashboard", "incidencias", "aprobaciones", "operaciones", "reportes", "analisis", "facturacion", "importacion", "liquidacion", "personal", "marcas", "mis-marcas"],
      dashboard: ["dashboardAllPersonnel", "dashboardCosts", "dashboardOperations"],
    },
    {
      id: "usuario",
      name: "Usuario",
      modules: ["marcas", "mis-marcas"],
      dashboard: [],
    },
  ],
  users: [],
};
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DEFAULT_PERSONNEL_SEED = [
  ["Lucas", "eventos", "Logistico"],
  ["Martin", "eventos", "Logistico"],
  ["Nacho", "eventos", "Logistico"],
  ["Moña", "eventos", "Logistico"],
  ["Cat", "eventos", "Logistico"],
  ["Iñaki", "eventos", "Logistico"],
  ["Mateo", "eventos", "Logistico"],
  ["Oliva", "eventos", "Logistico"],
  ["Gonda", "eventos", "Logistico"],
  ["Thiago", "eventos", "Logistico"],
  ["Ford", "eventos", "Logistico"],
  ["Brai", "eventos", "Logistico"],
  ["Alallon", "operacion", "Referente"],
  ["Emilio", "operacion", "Referente"],
  ["Alejandro", "operacion", "Referente"],
  ["Guille", "operacion", "Referente"],
  ["Jaunsolo", "operacion", "Referente"],
  ["Viera", "operacion", "Referente"],
  ["Cuba", "operacion", "Operador"],
  ["Grillo", "operacion", "Operador"],
  ["Angelina", "operacion", "Operador"],
  ["Corso", "operacion", "Operador"],
  ["Alex", "operacion", "Operador"],
  ["Chiappe", "operacion", "Operador"],
  ["Marce", "operacion", "Operador"],
  ["Said", "operacion", "Operador"],
  ["Mati", "operacion", "Operador"],
  ["Prieto", "deposito", "Depósito"],
  ["Anzed", "operacion", "Operador"],
  ["Vitto", "operacion", "Operador"],
  ["Diego", "deposito", "Depósito"],
  ["Dario", "deposito", "Depósito"],
  ["Andrés", "deposito", "Depósito"],
  ["Richard", "deposito", "Depósito"],
  ["Furtado", "deposito", "Depósito"],
  ["Eze", "deposito", "Depósito"],
];
const DEMO_PERSONNEL_ROLE_OVERRIDES = {
  lucas: "Logistico",
  martin: "Logistico",
  nacho: "Logistico",
  "moña": "Logistico",
  cat: "Logistico",
  "iñaki": "Logistico",
  mateo: "Logistico",
  oliva: "Logistico",
  gonda: "Logistico",
  thiago: "Logistico",
  ford: "Logistico",
  brai: "Logistico",
  alallon: "Referente",
  emilio: "Referente",
  alejandro: "Referente",
  guille: "Referente",
  jaunsolo: "Referente",
  viera: "Referente",
  grillo: "Operador",
  cuba: "Operador",
  angelina: "Operador",
  corso: "Operador",
  alex: "Operador",
  chiappe: "Operador",
  marce: "Operador",
  said: "Operador",
  anzed: "Operador",
  mati: "Operador",
  vitto: "Operador",
  dario: "Depo y Mant.",
  "andrés": "Depo y Mant.",
  andres: "Depo y Mant.",
  richard: "Depo y Mant.",
  furtado: "Depo y Mant.",
  eze: "Depo y Mant.",
};

function loadAppConfig() {
  const stored = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || "null");
  const storedOperatorTypes = Array.isArray(stored?.operatorTypes) ? stored.operatorTypes.map((type) => normalizeOperationalRole(type)) : [];
  const operatorTypes = [...new Set([...DEFAULT_OPERATOR_TYPES, ...storedOperatorTypes])]
    .filter((type) => DEFAULT_OPERATOR_TYPES.includes(type));
  const planRoleVisibility = Object.fromEntries(
    operatorTypes.map((type) => [type, stored?.planRoleVisibility?.[type] ?? DEFAULT_PLAN_ROLE_VISIBILITY[type] ?? true])
  );
  return {
    operatorTypes: operatorTypes.length ? operatorTypes : DEFAULT_OPERATOR_TYPES,
    planRoleVisibility,
    operationBands: DEFAULT_OPERATION_BANDS,
    locations: normalizeLocations(stored?.locations),
    alertTolerance: normalizeAlertTolerance(stored?.alertTolerance),
    approvalTolerance: normalizeApprovalTolerance(stored?.approvalTolerance),
  };
}

function operationTariffValueForBand(tariff, band) {
  if (!tariff) return 0;
  const normalizedBand = band === "8 a 10 horas" ? "8 a 12 horas" : band;
  if (normalizedBand === "Hasta 4 horas") return Number(tariff.hasta_4hs || 0);
  if (normalizedBand === "4 a 8 horas") return Number(tariff.de_4_a_8hs || 0);
  if (normalizedBand === "8 a 12 horas") return Number(tariff.de_8_a_12hs || 0);
  return 0;
}

function normalizeLocations(storedLocations) {
  if (!Array.isArray(storedLocations)) return DEFAULT_LOCATIONS;
  return storedLocations.map((location) => ({
    ...location,
    locationType: location.locationType || (location.generatesIncident ? "incident" : "admitted"),
    generatesIncident: Boolean(location.generatesIncident || location.locationType === "incident"),
    address: location.address || "",
  }));
}

function normalizeAlertTolerance(storedTolerance) {
  const greenMinutes = Number(storedTolerance?.greenMinutes || DEFAULT_ALERT_TOLERANCE.greenMinutes);
  const yellowMinutes = Number(storedTolerance?.yellowMinutes || DEFAULT_ALERT_TOLERANCE.yellowMinutes);
  return {
    greenMinutes,
    yellowMinutes: Math.max(yellowMinutes, greenMinutes),
  };
}

function normalizeApprovalTolerance(storedTolerance) {
  const minutes = Number(storedTolerance?.minutes || DEFAULT_APPROVAL_TOLERANCE.minutes);
  return { minutes: Math.max(0, minutes) };
}

function roleVisibleInPlan(role, config = loadAppConfig()) {
  const normalizedRole = normalizeOperationalRole(role);
  return config.planRoleVisibility?.[normalizedRole] !== false;
}

function normalizeOperationalRole(value, team = "") {
  const raw = String(value || "").trim().toLowerCase();
  const teamRaw = String(team || "").trim().toLowerCase();
  if (["administracion", "administración", "admin"].includes(raw)) return "Admin";
  if (["deposito", "depósito", "depo y mant.", "depo y mant."].includes(raw) || teamRaw === "deposito") return "Depo y Mant.";
  if (["referente", "referentes", "refrente", "refrentes", "supervisor"].includes(raw)) return "Referente";
  if (["logistico", "logisticos", "logístico", "logísticos", "eventos"].includes(raw) || teamRaw === "eventos") return "Logistico";
  if (["operacion", "operación", "operador", "operadores"].includes(raw) || teamRaw === "operacion") return "Operador";
  return value || "Operador";
}

function defaultNormalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function multiSearchTerms(value, normalizer = defaultNormalizeSearchText) {
  return String(value || "")
    .split(",")
    .map((term) => normalizer(term))
    .filter(Boolean)
    .filter((term) => !["todos", "todas", "todo", "all"].includes(term));
}

function matchesMultiSearchQuery(haystack, query, normalizer = defaultNormalizeSearchText) {
  const terms = multiSearchTerms(query, normalizer);
  if (!terms.length) return true;
  const normalizedHaystack = normalizer(haystack);
  return terms.some((term) => normalizedHaystack.includes(term));
}

function locationDistanceMeters(origin, target) {
  const radius = 6371000;
  const originLat = toRadians(origin.latitude);
  const targetLat = toRadians(target.latitude);
  const deltaLat = toRadians(target.latitude - origin.latitude);
  const deltaLng = toRadians(target.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) * Math.cos(targetLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function matchConfiguredLocation(position, locations) {
  if (!position || !locations?.length) {
    return {
      label: locations?.length ? "Ubicación no detectada" : "Sin ubicaciones parametrizadas",
      matched: false,
      locationGeneratesIncident: true,
      incidentReason: locations?.length ? "Ubicación no detectada" : "Sin ubicaciones parametrizadas",
      distanceMeters: null,
      toleranceMeters: null,
    };
  }

  const ranked = locations
    .map((location) => {
      const distance = locationDistanceMeters(position, location);
      return {
        ...location,
        distanceMeters: Math.round(distance),
        matched: distance <= Number(location.toleranceMeters || 500),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearest = ranked[0];
  const inRange = nearest.matched;
  const generatesIncident = !inRange || Boolean(nearest.generatesIncident || nearest.locationType === "incident");
  const shortAddress = shortLocationAddress(nearest.address);
  const locationLabel = [nearest.name, shortAddress].filter(Boolean).join(" · ");
  return {
    label: inRange ? locationLabel : `Fuera de rango (${locationLabel || nearest.name})`,
    matched: inRange && !generatesIncident,
    inConfiguredLocation: inRange,
    locationGeneratesIncident: generatesIncident,
    incidentReason: inRange && generatesIncident ? "Locación marcada con incidencia" : !inRange ? "Fuera de locaciones admitidas" : "",
    distanceMeters: nearest.distanceMeters,
    toleranceMeters: Number(nearest.toleranceMeters || 500),
    baseLocation: nearest.name,
    address: shortAddress,
  };
}

function shortLocationAddress(address) {
  return String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

function saveAppConfig(config) {
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
}

function loadAuthConfig() {
  const stored = JSON.parse(localStorage.getItem(APP_AUTH_KEY) || "null");
  const roles = DEFAULT_AUTH.roles;
  const users = Array.isArray(stored?.users) && stored.users.length ? stored.users : DEFAULT_AUTH.users;
  const auth = {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      modules: Array.isArray(role.modules) ? role.modules : [],
      dashboard: Array.isArray(role.dashboard) ? role.dashboard : [],
    })),
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      password: user.password,
      email: user.email || "",
      roleId: normalizeApplicationRole(user.roleId),
      personName: user.personName || "",
      active: user.active !== false,
    })),
  };
  localStorage.setItem(APP_AUTH_KEY, JSON.stringify(auth));
  return auth;
}

function normalizeApplicationRole(roleId) {
  if (roleId === "supervisor") return "rrhh";
  if (roleId === "operador") return "usuario";
  if (["admin", "rrhh", "usuario"].includes(roleId)) return roleId;
  return "usuario";
}

function saveAuthConfig(auth) {
  localStorage.setItem(APP_AUTH_KEY, JSON.stringify(auth));
}

function defaultFixedSchedule() {
  return WEEKDAY_LABELS.map((label, index) => ({
    day: label,
    status: index >= 5 ? "LIBRE" : "normal",
    start: index >= 5 ? "" : "09:00",
    end: index >= 5 ? "" : "18:00",
    activity: index >= 5 ? "LIBRE" : "LOGISTICA",
  }));
}

function fixedScheduleToShifts(schedule) {
  return schedule.map((day) => {
    if (day.status && day.status !== "normal") return day.status;
    if (!day.start && !day.end) return day.activity || "LIBRE";
    return `${compactSharedTime(day.start)}-${compactSharedTime(day.end)} ${day.activity || "LOGISTICA"}`;
  });
}

function compactSharedTime(value) {
  if (!value) return "";
  const [hour, minute = "00"] = value.split(":");
  return minute === "00" ? String(Number(hour)) : `${Number(hour)}:${minute}`;
}

function seedPersonnelFromPeople(sourcePeople) {
  return sourcePeople.map((person, index) => ({
    id: `person-${index + 1}`,
    name: person.name,
    team: teamFromSeedRole(demoRoleForPerson(person.name, person.role, person.team)),
    role: demoRoleForPerson(person.name, person.role, person.team),
    operatorType: demoRoleForPerson(person.name, person.role, person.team),
    hourlyRate: Number(person.hourlyRate || 0),
    driverLicenseType: "NO TIENE",
    driverLicenseExpiry: "",
    healthCardExpiry: "",
    active: true,
    scheduleMode: "variable",
    fixedSchedule: defaultFixedSchedule(),
  }));
}

function loadPersonnel(fallbackPeople) {
  const source = fallbackPeople?.length
    ? fallbackPeople
    : DEFAULT_PERSONNEL_SEED.map(([name, team, role]) => ({ name, team, role }));
  const stored = JSON.parse(localStorage.getItem(APP_PERSONNEL_KEY) || "null");
  if (Array.isArray(stored) && stored.length) {
    const normalized = stored.map((person, index) => ({
      id: person.id || `person-${index + 1}`,
      name: person.name,
      team: teamFromSeedRole(demoRoleForPerson(person.name, person.operatorType || person.role, person.team)),
      role: demoRoleForPerson(person.name, person.operatorType || person.role, person.team),
      operatorType: demoRoleForPerson(person.name, person.operatorType || person.role, person.team),
      hourlyRate: Number(person.hourlyRate || 0),
      driverLicenseType: person.driverLicenseType || "NO TIENE",
      driverLicenseExpiry: person.driverLicenseType && person.driverLicenseType !== "NO TIENE" ? person.driverLicenseExpiry || "" : "",
      healthCardExpiry: person.healthCardExpiry || "",
      active: person.active !== false,
      scheduleMode: person.scheduleMode || "variable",
      fixedSchedule: person.fixedSchedule?.length ? person.fixedSchedule : defaultFixedSchedule(),
    }));
    const missing = source
      .filter((person) => !normalized.some((storedPerson) => storedPerson.name === person.name))
      .map((person, index) => ({
        ...seedPersonnelFromPeople([person])[0],
        id: `person-${Date.now()}-${index}`,
      }));
    const merged = [...normalized, ...missing];
    localStorage.setItem(APP_PERSONNEL_KEY, JSON.stringify(merged));
    return merged;
  }
  const seeded = seedPersonnelFromPeople(source);
  localStorage.setItem(APP_PERSONNEL_KEY, JSON.stringify(seeded));
  return seeded;
}

function demoRoleForPerson(name, fallbackRole, fallbackTeam = "") {
  return DEMO_PERSONNEL_ROLE_OVERRIDES[String(name || "").trim().toLowerCase()] || normalizeOperationalRole(fallbackRole, fallbackTeam);
}

function teamFromSeedRole(role) {
  if (role === "Logistico") return "eventos";
  if (role === "Depo y Mant.") return "deposito";
  return "operacion";
}

function savePersonnel(personnel) {
  localStorage.setItem(APP_PERSONNEL_KEY, JSON.stringify(personnel));
}
