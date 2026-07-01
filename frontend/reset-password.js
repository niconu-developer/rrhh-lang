const resetForm = document.querySelector("#resetForm");
const resetEmailInput = document.querySelector("#resetEmailInput");
const newPasswordInput = document.querySelector("#newPasswordInput");
const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
const securityCodeInput = document.querySelector("#securityCodeInput");
const toast = document.querySelector("#toast");

const RESET_API_BASE = apiBase();

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = newPasswordInput.value.trim();
  const confirmation = confirmPasswordInput.value.trim();
  if (password.length < 8) {
    showToast("Usá al menos 8 caracteres");
    return;
  }
  if (password !== confirmation) {
    showToast("Las contraseñas no coinciden");
    return;
  }
  try {
    const response = await fetch(`${RESET_API_BASE}/first-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetEmailInput.value.trim(),
        password,
        security_code: securityCodeInput.value.trim(),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      showToast(payload.error || "No se pudo completar el primer ingreso");
      return;
    }
    showToast("Contraseña creada");
    window.setTimeout(() => {
      window.location.href = "./login.html";
    }, 1200);
  } catch (error) {
    showToast("No se pudo conectar con la base local");
  }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2200);
}
