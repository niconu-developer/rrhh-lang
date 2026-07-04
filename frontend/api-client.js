const APP_SESSION_KEY = "plannerSession";
const LOCAL_API_ORIGIN = "http://127.0.0.1:8765";

function apiHostOrigin() {
  return window.location.protocol.startsWith("http") ? window.location.origin : LOCAL_API_ORIGIN;
}

function appBasePath() {
  if (window.RRHH_BASE_PATH) return String(window.RRHH_BASE_PATH).replace(/\/$/, "");
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  if (firstSegment === "rrhh" || firstSegment === "rrhh-module") return `/${firstSegment}`;
  return "";
}

function apiOrigin() {
  return `${apiHostOrigin()}${appBasePath()}`;
}

function apiBase() {
  return `${apiOrigin()}/api`;
}

function parentAppLoginUrl() {
  const locationForNext = window.top && window.top !== window.self ? window.top.location : window.location;
  const next = `${locationForNext.pathname}${locationForNext.search}${locationForNext.hash}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

function isEmbeddedInParentApp() {
  return window.top && window.top !== window.self;
}

function parentAppSessionAvailableSync() {
  if (!isEmbeddedInParentApp()) return false;
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

function redirectToParentLogin() {
  if (parentAppSessionAvailableSync()) return;
  localStorage.removeItem(APP_SESSION_KEY);
  window.top.location.href = parentAppLoginUrl();
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
  const isOwnApiRequest = target.origin === apiHostOrigin() && target.pathname.startsWith(apiPrefix);
  const requestOptions = isOwnApiRequest ? { ...options, credentials: options.credentials || "include" } : options;
  const shouldAttachToken = token && isOwnApiRequest;
  if (!shouldAttachToken) {
    return nativeFetch(resource, requestOptions).then((response) => handleUnauthorizedApiResponse(response, target));
  }
  const headers = new Headers(requestOptions.headers || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return nativeFetch(resource, { ...requestOptions, headers }).then((response) => handleUnauthorizedApiResponse(response, target));
};

function handleUnauthorizedApiResponse(response, target) {
  if (response.status === 401 && window.location.pathname.endsWith("/reloj-facial.html")) {
    return response;
  }
  const apiPrefix = `${appBasePath()}/api/`;
  if (response.status === 401 && target.origin === apiHostOrigin() && target.pathname.startsWith(apiPrefix) && !target.pathname.endsWith("/login")) {
    if (isEmbeddedInParentApp() && parentAppSessionAvailableSync()) return response;
    redirectToParentLogin();
  }
  return response;
}
