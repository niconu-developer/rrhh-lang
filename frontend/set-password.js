const setPasswordForm = document.querySelector("#setPasswordForm");
const setPasswordInfo = document.querySelector("#setPasswordInfo");
const setPasswordInput = document.querySelector("#setPasswordInput");
const setPasswordConfirmInput = document.querySelector("#setPasswordConfirmInput");
const toast = document.querySelector("#toast");
const params = new URLSearchParams(window.location.search);
const accessToken = params.get("token") || "";
const SET_PASSWORD_API_BASE = apiBase();

validateAccessLink();

async function validateAccessLink() {
  if (!accessToken) {
    showInvalidLink("Link inválido o incompleto.");
    return;
  }
  try {
    const response = await fetch(`${SET_PASSWORD_API_BASE}/access-links/validate?token=${encodeURIComponent(accessToken)}`);
    const payload = await response.json();
    if (!payload.ok) {
      showInvalidLink(payload.error || "Este link no está disponible.");
      return;
    }
    setPasswordInfo.textContent = `Acceso para ${payload.persona || payload.email}.`;
    setPasswordForm.classList.remove("hidden");
  } catch (error) {
    showInvalidLink("No se pudo validar el link.");
  }
}

setPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = setPasswordInput.value.trim();
  const confirmation = setPasswordConfirmInput.value.trim();
  if (password.length < 8) {
    showToast("Usá al menos 8 caracteres");
    return;
  }
  if (password !== confirmation) {
    showToast("Las contraseñas no coinciden");
    return;
  }
  try {
    const response = await fetch(`${SET_PASSWORD_API_BASE}/access-links/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: accessToken,
        password,
      }),
    });
    const payload = await response.json();
    if (!payload.ok) {
      showToast(payload.error || "No se pudo guardar la contraseña");
      return;
    }
    showToast("Contraseña guardada");
    window.setTimeout(() => {
      window.location.href = "./login.html";
    }, 1200);
  } catch (error) {
    showToast("No se pudo conectar con la base");
  }
});

function showInvalidLink(message) {
  setPasswordInfo.textContent = message;
  setPasswordForm.classList.add("hidden");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2200);
}
