function currentSession() {
  return JSON.parse(localStorage.getItem(APP_SESSION_KEY) || "null");
}

let backendSessionChecked = false;
const EXTERNAL_AUTH_SKIP_KEY = "plannerSkipExternalAuth";

function loadBackendSessionSync() {
  if (backendSessionChecked) return null;
  if (sessionStorage.getItem(EXTERNAL_AUTH_SKIP_KEY) === "1") return null;
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

function loginUser(email, password) {
  return null;
}

function logoutUser() {
  localStorage.removeItem(APP_SESSION_KEY);
  sessionStorage.setItem(EXTERNAL_AUTH_SKIP_KEY, "1");
  window.location.href = "./login.html";
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
    window.location.href = `./login.html?next=${encodeURIComponent(window.location.pathname.split("/").pop() || "index.html")}`;
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
  const roleName = user.role?.name || "Sin rol";
  target.insertAdjacentHTML(
    "beforeend",
    `${canAccessModule("ayuda") ? `<a class="ghost-link as-button session-help-link" href="./ayuda.html">Ayuda</a>` : ""}<span class="session-chip">${user.username} · ${roleName}</span><button class="ghost-link as-button" id="logoutButton" type="button">Salir</button>`
  );
  document.querySelector("#logoutButton")?.addEventListener("click", logoutUser);
}
