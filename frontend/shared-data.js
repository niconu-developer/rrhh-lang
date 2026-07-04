const DEFAULT_OPERATION_BANDS = ["Hasta 4 horas", "4 a 8 horas", "8 a 12 horas"];
const SYSTEM_MODULES = [
  { id: "plan", title: "Plan semanal", href: "./plan-semanal.html", text: "Asignar turnos, estados, horarios y actividad por persona y día." },
  { id: "dashboard", title: "Dashboard", href: "./dashboard.html", text: "Ver desvíos, costos, alertas y detalle mensual por persona." },
  { id: "aprobaciones", title: "Validación de jornales", href: "./aprobaciones.html", text: "Revisar observaciones, corregir marcas y validar jornales." },
  { id: "operaciones", title: "Validación de operaciones", href: "./operaciones.html", text: "Aprobar, rechazar y corregir operaciones cargadas por operadores." },
  { id: "reportes", title: "Reportes", href: "./reportes.html", text: "Generar archivos CSV para nómina, control y análisis externo." },
  { id: "analisis", title: "Análisis", href: "./analisis.html", text: "Tablero mensual de horas, costos, sueldos estimados y franjas de control." },
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
      modules: ["plan", "dashboard", "aprobaciones", "operaciones", "reportes", "analisis", "liquidacion", "personal", "config", "marcas", "mis-marcas"],
      dashboard: ["dashboardAllPersonnel", "dashboardCosts", "dashboardOperations"],
    },
    {
      id: "rrhh",
      name: "RRHH",
      modules: ["plan", "dashboard", "aprobaciones", "operaciones", "reportes", "analisis", "liquidacion", "personal", "config", "marcas", "mis-marcas"],
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

function operationTariffValueForBand(tariff, band) {
  if (!tariff) return 0;
  const normalizedBand = band === "8 a 10 horas" ? "8 a 12 horas" : band;
  if (normalizedBand === "Hasta 4 horas") return Number(tariff.hasta_4hs || 0);
  if (normalizedBand === "4 a 8 horas") return Number(tariff.de_4_a_8hs || 0);
  if (normalizedBand === "8 a 12 horas") return Number(tariff.de_8_a_12hs || 0);
  return 0;
}

function roleVisibleInPlan(role, config = {}) {
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
    incidentReason: inRange && generatesIncident ? "Locación marcada con observación" : !inRange ? "Fuera de locaciones admitidas" : "",
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

function normalizeApplicationRole(roleId) {
  const raw = String(roleId || "").trim();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (["superadmin", "superadministrador", "admin", "administrador", "administrator"].includes(normalized)) return "admin";
  if (["adminrrhh", "rrhh", "rh", "hr", "recursoshumanos", "humanresources", "supervisor"].includes(normalized)) return "rrhh";
  if (["logistico", "logisticos", "operadores", "operador", "usuario", "user"].includes(normalized)) return "usuario";
  return "usuario";
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
