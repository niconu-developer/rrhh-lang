const LEGACY_FACE_DESCRIPTOR_SIZE = 24;
const FACE_DESCRIPTOR_SIZE = 40;
const FACE_BLOCK_GRID = 8;
const LOCAL_FACE_DESCRIPTOR_VERSION = "lang-local-v2";
const FACE_API_DESCRIPTOR_VERSION = "face-api-v1";
const FACE_API_MODEL_URL = new URL("./models/face-api", window.location.href).href.replace(/\/$/, "");
window.LANG_FACE_DESCRIPTOR_VERSION = LOCAL_FACE_DESCRIPTOR_VERSION;

let faceApiModelsPromise = null;

function setCurrentFaceDescriptorVersion(version) {
  window.LANG_FACE_DESCRIPTOR_VERSION = version || LOCAL_FACE_DESCRIPTOR_VERSION;
}

async function buildFaceDescriptor(video, canvas) {
  if (!video || !canvas) throw new Error("Cámara no disponible");
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("La cámara todavía no está lista");

  const faceApiDescriptor = await buildFaceApiDescriptor(video);
  if (faceApiDescriptor) return faceApiDescriptor;

  return buildLocalFaceDescriptor(video, canvas, width, height);
}

async function ensureFaceApiModels() {
  if (!window.faceapi) return false;
  if (!faceApiModelsPromise) {
    faceApiModelsPromise = Promise.all([
      window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
      window.faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
      window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
    ])
      .then(() => true)
      .catch((error) => {
        console.warn("No se pudieron cargar los modelos de face-api", error);
        faceApiModelsPromise = null;
        return false;
      });
  }
  return faceApiModelsPromise;
}

async function buildFaceApiDescriptor(video) {
  const ready = await ensureFaceApiModels();
  if (!ready) return null;
  try {
    const options = new window.faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.5,
    });
    const result = await window.faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!result?.descriptor?.length) {
      throw new Error("No se detectó un rostro claro. Centrá la cara y probá de nuevo.");
    }
    setCurrentFaceDescriptorVersion(FACE_API_DESCRIPTOR_VERSION);
    return Array.from(result.descriptor).map((value) => Number(value.toFixed(6)));
  } catch (error) {
    if (String(error?.message || "").includes("No se detectó")) throw error;
    console.warn("face-api no pudo generar descriptor, se usa respaldo local", error);
    return null;
  }
}

async function buildLocalFaceDescriptor(video, canvas, width, height) {
  setCurrentFaceDescriptorVersion(LOCAL_FACE_DESCRIPTOR_VERSION);
  const crop = await detectFaceCrop(video, width, height);
  canvas.width = FACE_DESCRIPTOR_SIZE;
  canvas.height = FACE_DESCRIPTOR_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(video, crop.x, crop.y, crop.size, crop.size, 0, 0, FACE_DESCRIPTOR_SIZE, FACE_DESCRIPTOR_SIZE);

  const pixels = context.getImageData(0, 0, FACE_DESCRIPTOR_SIZE, FACE_DESCRIPTOR_SIZE).data;
  const gray = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    gray.push(Math.sqrt((red * 0.299) + (green * 0.587) + (blue * 0.114)));
  }

  const average = gray.reduce((total, value) => total + value, 0) / gray.length;
  const variance = gray.reduce((total, value) => total + ((value - average) ** 2), 0) / gray.length;
  const deviation = Math.sqrt(variance);
  if (deviation < 0.018) {
    throw new Error("La imagen tiene muy poco contraste. Mejorá la luz y probá de nuevo.");
  }

  const normalized = gray.map((value) => (value - average) / deviation);
  const dense = normalized.map((value, index) => {
    const x = index % FACE_DESCRIPTOR_SIZE;
    const y = Math.floor(index / FACE_DESCRIPTOR_SIZE);
    const centerX = (x + 0.5) / FACE_DESCRIPTOR_SIZE - 0.5;
    const centerY = (y + 0.5) / FACE_DESCRIPTOR_SIZE - 0.5;
    const radius = Math.sqrt((centerX * centerX) + (centerY * centerY));
    const weight = 0.35 + (0.65 * Math.exp(-8 * radius * radius));
    return value * weight;
  });

  const blocks = [];
  const blockSize = FACE_DESCRIPTOR_SIZE / FACE_BLOCK_GRID;
  for (let blockY = 0; blockY < FACE_BLOCK_GRID; blockY += 1) {
    for (let blockX = 0; blockX < FACE_BLOCK_GRID; blockX += 1) {
      let total = 0;
      let count = 0;
      const startX = Math.floor(blockX * blockSize);
      const endX = Math.floor((blockX + 1) * blockSize);
      const startY = Math.floor(blockY * blockSize);
      const endY = Math.floor((blockY + 1) * blockSize);
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          total += normalized[(y * FACE_DESCRIPTOR_SIZE) + x];
          count += 1;
        }
      }
      blocks.push(total / Math.max(1, count));
    }
  }

  const legacyDescriptor = buildLegacyFaceDescriptor(video);
  return [...legacyDescriptor, ...normalizeDescriptor([...dense, ...blocks])];
}

function buildLegacyFaceDescriptor(video) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const sourceSize = Math.min(width, height) * 0.72;
  const sourceX = (width - sourceSize) / 2;
  const sourceY = (height - sourceSize) / 2;
  const legacyCanvas = document.createElement("canvas");
  legacyCanvas.width = LEGACY_FACE_DESCRIPTOR_SIZE;
  legacyCanvas.height = LEGACY_FACE_DESCRIPTOR_SIZE;
  const context = legacyCanvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, LEGACY_FACE_DESCRIPTOR_SIZE, LEGACY_FACE_DESCRIPTOR_SIZE);
  const pixels = context.getImageData(0, 0, LEGACY_FACE_DESCRIPTOR_SIZE, LEGACY_FACE_DESCRIPTOR_SIZE).data;
  const values = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    values.push(gray / 255);
  }
  return normalizeDescriptor(values);
}

async function detectFaceCrop(video, width, height) {
  const fallback = centerFaceCrop(width, height);
  if (typeof FaceDetector === "undefined") return fallback;
  try {
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    const faces = await detector.detect(video);
    if (!faces?.length) return fallback;
    const best = faces
      .map((face) => face.boundingBox)
      .filter(Boolean)
      .sort((left, right) => (right.width * right.height) - (left.width * left.height))[0];
    if (!best?.width || !best?.height) return fallback;
    const size = Math.min(Math.max(best.width, best.height) * 1.85, Math.min(width, height));
    const centerX = best.x + (best.width / 2);
    const centerY = best.y + (best.height / 2);
    return clampCrop(centerX - (size / 2), centerY - (size / 2), size, width, height);
  } catch (error) {
    return fallback;
  }
}

function centerFaceCrop(width, height) {
  const size = Math.min(width, height) * 0.78;
  return clampCrop((width - size) / 2, (height - size) / 2, size, width, height);
}

function clampCrop(x, y, size, width, height) {
  const safeSize = Math.min(size, width, height);
  return {
    x: Math.max(0, Math.min(width - safeSize, x)),
    y: Math.max(0, Math.min(height - safeSize, y)),
    size: safeSize,
  };
}

function normalizeDescriptor(values) {
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const centered = values.map((value) => value - average);
  const energy = Math.sqrt(centered.reduce((total, value) => total + (value * value), 0)) || 1;
  return centered.map((value) => Number((value / energy).toFixed(6)));
}

function mirrorCanvas(sourceCanvas, targetCanvas) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const context = targetCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
}
