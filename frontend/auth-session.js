function currentSession() {
  return JSON.parse(localStorage.getItem(APP_SESSION_KEY) || "null");
}

let backendSessionChecked = false;
const RRHH_IS_EMBEDDED = window.self !== window.top || new URLSearchParams(window.location.search).get("embedded") === "1";
const RRHH_PARENT_THEME = embeddedParentTheme();

redirectTopLevelRrhhPageToMotherApp();
applyEmbeddedChrome();

function applyEmbeddedChrome() {
  document.body.classList.add("rrhh-module-body");
  document.body.classList.toggle("rrhh-embedded-body", RRHH_IS_EMBEDDED);
  document.documentElement.classList.toggle("rrhh-embedded-root", RRHH_IS_EMBEDDED);
  document.body.classList.toggle("rrhh-parent-theme-light", RRHH_IS_EMBEDDED && RRHH_PARENT_THEME === "light");
  document.body.classList.toggle("rrhh-parent-theme-dark", RRHH_IS_EMBEDDED && RRHH_PARENT_THEME !== "light");
  document.documentElement.classList.toggle("rrhh-parent-theme-light", RRHH_IS_EMBEDDED && RRHH_PARENT_THEME === "light");
  document.documentElement.classList.toggle("rrhh-parent-theme-dark", RRHH_IS_EMBEDDED && RRHH_PARENT_THEME !== "light");
}

function embeddedParentTheme() {
  const value = new URLSearchParams(window.location.search).get("theme");
  return value === "light" ? "light" : "dark";
}

function redirectTopLevelRrhhPageToMotherApp() {
  if (window.self !== window.top) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("embedded") === "1") return;
  const file = window.location.pathname.split("/").pop() || "index.html";
  const sectionByFile = {
    "index.html": "plan-semanal",
    "plan-semanal.html": "plan-semanal",
    "aprobaciones.html": "jornales",
    "operaciones.html": "operaciones",
    "dashboard.html": "dashboard",
    "reportes.html": "reportes",
    "analisis.html": "analisis",
    "liquidacion.html": "liquidacion",
    "personal.html": "../configuracion/personal",
    "configuracion.html": "configuracion",
  };
  const section = sectionByFile[file];
  if (!section) return;
  if (section.startsWith("../")) {
    window.location.replace(`/${section.slice(3)}`);
    return;
  }
  window.location.replace(`/rrhh/${section}`);
}

function loadBackendSessionSync() {
  if (backendSessionChecked) return null;
  backendSessionChecked = true;
  if (currentSession()?.user) return currentSession();
  try {
    const request = new XMLHttpRequest();
    request.open("GET", `${apiBase()}/session`, false);
    request.setRequestHeader("Accept", "application/json");
    request.send();
    if (request.status !== 200) return null;
    const payload = JSON.parse(request.responseText || "null");
    if (!payload?.ok || !payload.user) return null;
    const user = {
      ...payload.user,
      roleId: normalizeApplicationRole(payload.user.roleId),
    };
    const session = {
      user,
      token: payload.token || "",
      externalAuth: Boolean(payload.user.externalAuth),
      startedAt: new Date().toISOString(),
    };
    localStorage.setItem(APP_SESSION_KEY, JSON.stringify(session));
    return session;
  } catch (error) {
    return null;
  }
}

function currentUser() {
  const session = currentSession() || loadBackendSessionSync();
  if (session?.user) {
    if (!session.token && !session.externalAuth) return null;
    const user = {
      ...session.user,
      roleId: normalizeApplicationRole(session.user.roleId),
      active: session.user.active !== false,
    };
    const role = DEFAULT_AUTH.roles.find((item) => item.id === user.roleId);
    return role ? { ...user, role } : null;
  }
  return null;
}

function parentAppSessionAvailableSync() {
  if (!window.top || window.top === window.self) return false;
  try {
    const request = new XMLHttpRequest();
    request.open("GET", "/api/auth/me", false);
    request.setRequestHeader("Accept", "application/json");
    request.send();
    return request.status === 200;
  } catch (error) {
    return false;
  }
}

function loginUser(email, password) {
  return null;
}

function logoutUser() {
  localStorage.removeItem(APP_SESSION_KEY);
  fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
    window.location.href = "/login";
  });
}

function canAccessModule(moduleId) {
  if (moduleId === "ayuda") return ["admin", "rrhh"].includes(currentUser()?.roleId);
  const user = currentUser();
  return Boolean(user?.role?.modules?.includes(moduleId));
}

function hasDashboardPermission(permissionId) {
  const user = currentUser();
  return Boolean(user?.role?.dashboard?.includes(permissionId));
}

function requireModuleAccess(moduleId) {
  if (!currentUser()) {
    if (parentAppSessionAvailableSync()) return true;
    redirectToParentLogin();
    return false;
  }
  if (!canAccessModule(moduleId)) {
    window.location.href = "./index.html";
    return false;
  }
  return true;
}

function renderSessionActions(target) {
  const user = currentUser();
  if (!target || !user) return;
  renderRrhhModuleChrome(user);
  const roleName = user.role?.name || "Sin rol";
  target.insertAdjacentHTML(
    "beforeend",
    `${canAccessModule("ayuda") ? `<a class="ghost-link as-button session-help-link" href="./ayuda.html">Ayuda</a>` : ""}<span class="session-chip">${user.username} · ${roleName}</span><button class="ghost-link as-button" id="logoutButton" type="button">Salir</button>`
  );
  document.querySelector("#logoutButton")?.addEventListener("click", logoutUser);
}

function renderRrhhModuleChrome(user) {
  applyEmbeddedChrome();
}
