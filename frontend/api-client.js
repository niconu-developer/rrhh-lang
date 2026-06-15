const APP_SESSION_KEY = "plannerSession";
const LOCAL_API_ORIGIN = "http://127.0.0.1:8765";

function apiHostOrigin() {
  return window.location.protocol.startsWith("http") ? window.location.origin : LOCAL_API_ORIGIN;
}

function appBasePath() {
  if (window.RRHH_BASE_PATH) return String(window.RRHH_BASE_PATH).replace(/\/$/, "");
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  return firstSegment === "rrhh" ? "/rrhh" : "";
}

function apiOrigin() {
  return `${apiHostOrigin()}${appBasePath()}`;
}

function apiBase() {
  return `${apiOrigin()}/api`;
}

function currentSessionToken() {
  return JSON.parse(localStorage.getItem(APP_SESSION_KEY) || "null")?.token || "";
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (resource, options = {}) => {
  const url = typeof resource === "string" ? resource : resource?.url || "";
  const token = currentSessionToken();
  const target = new URL(url, window.location.href);
  const apiPrefix = `${appBasePath()}/api/`;
  const shouldAttachToken = token && target.origin === apiHostOrigin() && target.pathname.startsWith(apiPrefix);
  if (!shouldAttachToken) {
    return nativeFetch(resource, options).then((response) => handleUnauthorizedApiResponse(response, target));
  }
  const headers = new Headers(options.headers || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return nativeFetch(resource, { ...options, headers }).then((response) => handleUnauthorizedApiResponse(response, target));
};

function handleUnauthorizedApiResponse(response, target) {
  if (response.status === 401 && window.location.pathname.endsWith("/reloj-facial.html")) {
    return response;
  }
  const apiPrefix = `${appBasePath()}/api/`;
  if (response.status === 401 && target.origin === apiHostOrigin() && target.pathname.startsWith(apiPrefix) && !target.pathname.endsWith("/login")) {
    localStorage.removeItem(APP_SESSION_KEY);
    const next = window.location.pathname.split("/").pop() || "index.html";
    window.location.href = `./login.html?next=${encodeURIComponent(next)}`;
  }
  return response;
}
