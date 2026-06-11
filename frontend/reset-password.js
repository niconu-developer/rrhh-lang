const resetForm = document.querySelector("#resetForm");
const resetEmailInput = document.querySelector("#resetEmailInput");
const newPasswordInput = document.querySelector("#newPasswordInput");
const toast = document.querySelector("#toast");

const RESET_API_BASE = apiBase();

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await fetch(`${RESET_API_BASE}/password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetEmailInput.value.trim(),
        password: newPasswordInput.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      showToast("No encontramos ese correo");
      return;
    }
    showToast("Contraseña actualizada");
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
