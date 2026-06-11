if (!requireModuleAccess("importacion")) throw new Error("Acceso no autorizado");
renderSessionActions(document.querySelector(".top-actions"));

const API_BASE = apiBase();
const elements = {
  file: document.querySelector("#importFile"),
  separator: document.querySelector("#importSeparator"),
  text: document.querySelector("#importCsvText"),
  preview: document.querySelector("#previewImport"),
  run: document.querySelector("#runImport"),
  count: document.querySelector("#importRowCount"),
  head: document.querySelector("#importPreviewHead"),
  body: document.querySelector("#importPreviewBody"),
  toast: document.querySelector("#toast"),
};

let previewRows = [];

function separatorValue() {
  return elements.separator.value === "tab" ? "\t" : elements.separator.value;
}

function parseCsv(text, separator = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === separator && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeRow(row) {
  const fechaHora = row.fecha_hora || "";
  return {
    persona: row.persona || row.nombre || "",
    fecha: row.fecha || fechaHora.slice(0, 10),
    hora: row.hora || fechaHora.slice(11, 16),
    fecha_hora: row.fecha_hora || "",
    tipo: row.tipo || row.marca || "",
    tipo_marca: row.tipo_marca || row.origen || "RELOJ WEB",
    actividad_ubicacion: row.actividad_ubicacion || row.actividad || row.ubicacion || "LOGISTICA",
    ubicacion_detectada: row.ubicacion_detectada || row.ubicacion_marca || "",
    genera_incidencia: row.genera_incidencia || "",
  };
}

function validateRow(row) {
  const errors = [];
  if (!row.persona) errors.push("Persona requerida");
  if (!row.fecha_hora && (!row.fecha || !row.hora)) errors.push("Fecha y hora requeridas");
  if (!["entrada", "salida"].includes(String(row.tipo).toLowerCase())) errors.push("Tipo inválido");
  return errors;
}

async function readImportText() {
  if (elements.text.value.trim()) return elements.text.value;
  const file = elements.file.files?.[0];
  if (!file) return "";
  return file.text();
}

async function previewImport() {
  const text = await readImportText();
  const parsed = rowsToObjects(parseCsv(text, separatorValue()));
  previewRows = parsed.map(normalizeRow);
  renderPreview();
}

function renderPreview() {
  elements.count.textContent = `${previewRows.length} filas`;
  elements.run.disabled = !previewRows.length || previewRows.some((row) => validateRow(row).length);
  const headers = ["Persona", "Fecha", "Hora", "Tipo", "Origen", "Actividad / ubicación", "Ubicación detectada", "Estado"];
  elements.head.innerHTML = `<tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>`;
  if (!previewRows.length) {
    elements.body.innerHTML = `<tr><td colspan="${headers.length}">Sin datos para importar.</td></tr>`;
    return;
  }
  elements.body.innerHTML = previewRows
    .slice(0, 80)
    .map((row) => {
      const errors = validateRow(row);
      return `<tr>
        <td>${row.persona}</td>
        <td>${row.fecha || row.fecha_hora.slice(0, 10)}</td>
        <td>${row.hora || row.fecha_hora.slice(11, 16)}</td>
        <td>${row.tipo}</td>
        <td>${row.tipo_marca}</td>
        <td>${row.actividad_ubicacion}</td>
        <td>${row.ubicacion_detectada || "-"}</td>
        <td>${errors.length ? errors.join(" · ") : "OK"}</td>
      </tr>`;
    })
    .join("");
}

async function runImport() {
  if (!previewRows.length) return;
  if (!window.confirm(`¿Importar ${previewRows.length} marcas históricas?`)) return;
  const response = await fetch(`${API_BASE}/importacion/marcas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: previewRows }),
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo importar");
    return;
  }
  showToast(`Importadas: ${payload.importadas}. Errores: ${payload.errores?.length || 0}`);
  if (payload.errores?.length) {
    elements.body.innerHTML = payload.errores.map((error) => `<tr><td colspan="8">Fila ${error.fila}: ${error.error}</td></tr>`).join("");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

elements.preview.addEventListener("click", previewImport);
elements.run.addEventListener("click", runImport);
