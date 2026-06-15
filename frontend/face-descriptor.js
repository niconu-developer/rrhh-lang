const FACE_DESCRIPTOR_SIZE = 24;

function buildFaceDescriptor(video, canvas) {
  if (!video || !canvas) throw new Error("Cámara no disponible");
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  if (!width || !height) throw new Error("La cámara todavía no está lista");

  const sourceSize = Math.min(width, height) * 0.72;
  const sourceX = (width - sourceSize) / 2;
  const sourceY = (height - sourceSize) / 2;
  canvas.width = FACE_DESCRIPTOR_SIZE;
  canvas.height = FACE_DESCRIPTOR_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, FACE_DESCRIPTOR_SIZE, FACE_DESCRIPTOR_SIZE);

  const pixels = context.getImageData(0, 0, FACE_DESCRIPTOR_SIZE, FACE_DESCRIPTOR_SIZE).data;
  const values = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    values.push(gray / 255);
  }

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
