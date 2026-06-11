const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const toast = document.querySelector("#toast");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const user = await loginWithBackend(email, password);
  if (!user) {
    showToast("Correo o contraseña incorrectos");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  window.location.href = params.get("next") || "./index.html";
});

async function loginWithBackend(email, password) {
  try {
    const response = await fetch(`${apiBase()}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!payload.ok || !payload.user) return null;
    const user = {
      ...payload.user,
      roleId: normalizeApplicationRole(payload.user.roleId),
    };
    localStorage.setItem(APP_SESSION_KEY, JSON.stringify({
      user,
      token: payload.token,
      expiresAt: payload.expiresAt,
      startedAt: new Date().toISOString(),
    }));
    sessionStorage.removeItem(EXTERNAL_AUTH_SKIP_KEY);
    return currentUser();
  } catch (error) {
    return null;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2200);
}
