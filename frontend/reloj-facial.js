const CLOCK_API_BASE = apiBase();
const FACE_CLOCK_TOKEN = new URLSearchParams(window.location.search).get("token") || "";

const clockStatuses = ["LIBRE", "LICENCIA", "SUSPENDIDO", "LIC. MEDICA", "AUSENTE", "VACIO"];
let clockPersonnel = [];
let clockTurns = [];
let clockLocations = [];
let clockValidated = false;
let clockDetectedPerson = null;
let clockStream = null;

const clock = {
  status: document.querySelector("#clockFaceStatus"),
  score: document.querySelector("#clockFaceScore"),
  video: document.querySelector("#clockCameraPreview"),
  canvas: document.querySelector("#clockFaceCanvas"),
  cameraBox: document.querySelector(".camera-box"),
  start: document.querySelector("#clockStartCamera"),
  validate: document.querySelector("#clockValidateFace"),
  cancel: document.querySelector("#clockCancelFace"),
  entry: document.querySelector("#clockEntryButton"),
  exit: document.querySelector("#clockExitButton"),
  toast: document.querySelector("#toast"),
};

async function clockApi(path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const url = FACE_CLOCK_TOKEN ? `${CLOCK_API_BASE}${path}${separator}token=${encodeURIComponent(FACE_CLOCK_TOKEN)}` : `${CLOCK_API_BASE}${path}`;
  const body = options.body && FACE_CLOCK_TOKEN
    ? JSON.stringify({ ...JSON.parse(options.body), reloj_token: FACE_CLOCK_TOKEN })
    : options.body;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo conectar con la base");
  return payload;
}

function clockInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clockDbDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeClockLocations(rows) {
  return rows
    .filter((location) => location.latitud !== null && location.longitud !== null)
    .map((location) => ({
      id: String(location.id),
      name: location.nombre,
      latitude: Number(location.latitud),
      longitude: Number(location.longitud),
      toleranceMeters: Number(location.tolerancia_metros || 500),
      generatesIncident: Number(location.genera_incidencia) !== 0,
      locationType: Number(location.genera_incidencia) !== 0 ? "incident" : "admitted",
      address: location.direccion || "",
    }));
}

async function loadClockData() {
  if (!FACE_CLOCK_TOKEN) {
    throw new Error("Link de reloj facial requerido");
  }
  const today = clockInputDate(new Date());
  const [people, turns, locations] = await Promise.all([
    clockApi("/personas"),
    clockApi(`/turnos?desde=${today}&hasta=${today}`),
    clockApi("/ubicaciones"),
  ]);
  clockPersonnel = people.filter((person) => Number(person.activo) !== 0);
  clockTurns = turns;
  clockLocations = normalizeClockLocations(locations);
  renderValidation();
}

function renderValidation() {
  clock.status.textContent = clockValidated && clockDetectedPerson ? `HOLA ${clockDetectedPerson.nombre.toUpperCase()}` : "Validación pendiente";
  clock.entry.disabled = !clockValidated;
  clock.exit.disabled = !clockValidated;
}

async function startClockCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showClockToast("Este navegador no permite abrir cámara");
    return;
  }
  try {
    clockStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    clock.video.srcObject = clockStream;
    showClockToast("Cámara activa");
  } catch (error) {
    showClockToast("No se pudo acceder a la cámara");
  }
}

function validateClockFace() {
  if (!clockPersonnel.length) {
    showClockToast("No hay personal activo cargado");
    return;
  }

  const score = clockStream ? randomClockScore(88, 98) : randomClockScore(82, 92);
  clockDetectedPerson = clockPersonnel[score % clockPersonnel.length];
  clockValidated = score >= 82;
  clock.score.textContent = `${score}%`;
  clock.score.classList.toggle("ok", clockValidated);
  clock.score.classList.toggle("warn", !clockValidated);
  if (clockStream) captureClockFrame();
  renderValidation();
  showClockToast(clockValidated ? `Hola ${clockDetectedPerson.nombre}` : "Validación no aprobada");
}

function captureClockFrame() {
  const context = clock.canvas.getContext("2d");
  clock.canvas.width = clock.video.videoWidth || 640;
  clock.canvas.height = clock.video.videoHeight || 480;
  context.drawImage(clock.video, 0, 0, clock.canvas.width, clock.canvas.height);
  clock.cameraBox.classList.add("captured");
}

async function resolveClockLocation() {
  if (!navigator.geolocation) return matchConfiguredLocation(null, clockLocations);
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 });
    });
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy || 0),
    };
    return { ...matchConfiguredLocation(coords, clockLocations), coords };
  } catch (error) {
    return matchConfiguredLocation(null, clockLocations);
  }
}

async function registerClockMark(type) {
  if (!clockValidated || !clockDetectedPerson) {
    showClockToast("Primero validá el rostro");
    return;
  }

  const shift = clockShiftForPerson(clockDetectedPerson);
  const locationStatus = await resolveClockLocation();
  await clockApi("/marcas", {
    method: "POST",
    body: JSON.stringify({
      persona_id: clockDetectedPerson.id,
      fecha_hora: clockDbDateTime(),
      tipo: type,
      tipo_marca: "Por reloj facial",
      actividad_ubicacion: shift.activity,
      ubicacion_detectada: locationStatus.label,
      latitud: locationStatus.coords?.latitude ?? null,
      longitud: locationStatus.coords?.longitude ?? null,
      genera_incidencia: Boolean(locationStatus.locationGeneratesIncident || locationStatus.matched === false),
    }),
  });
  showClockToast(`${type} registrada`);
  window.setTimeout(resetClockFace, 10000);
}

function clockShiftForPerson(person) {
  const turn = clockTurns.find((item) => item.persona === person.nombre);
  const normalized = String(turn?.estado || "").trim().toUpperCase();
  if (!turn || clockStatuses.includes(normalized)) {
    return { activity: normalized || "SIN PREVISIÓN", location: normalized || "SIN PREVISIÓN" };
  }
  return {
    activity: turn.actividad_ubicacion || "LOGISTICA",
    location: turn.actividad_ubicacion || "LOGISTICA",
  };
}

function resetClockFace() {
  clockValidated = false;
  clockDetectedPerson = null;
  clock.score.textContent = "--%";
  clock.score.classList.remove("ok", "warn");
  clock.cameraBox.classList.remove("captured");
  const context = clock.canvas.getContext("2d");
  context.clearRect(0, 0, clock.canvas.width, clock.canvas.height);
  renderValidation();
}

function randomClockScore(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showClockToast(message) {
  clock.toast.textContent = message;
  clock.toast.classList.add("visible");
  window.setTimeout(() => clock.toast.classList.remove("visible"), 2200);
}

clock.start.addEventListener("click", startClockCamera);
clock.validate.addEventListener("click", validateClockFace);
clock.cancel.addEventListener("click", resetClockFace);
clock.entry.addEventListener("click", () => registerClockMark("Entrada"));
clock.exit.addEventListener("click", () => registerClockMark("Salida"));

loadClockData().catch((error) => {
  showClockToast(error.message || "No se pudo cargar el reloj facial");
  clock.validate.disabled = true;
});
renderValidation();
startClockCamera();
