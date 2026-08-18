/**
 * faceEngine.js — High-performance Face Detection & Recognition with WebGL
 */

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';

let modelsLoaded = false;

// Pre-configured detector options for fast scanning
let fastDetectorOptions = null;

/**
 * Initialize face-api models with WebGL GPU acceleration
 */
export async function initModels(onProgress) {
  if (modelsLoaded) return;

  const faceapi = window.faceapi;
  if (!faceapi) {
    throw new Error('face-api.js belum termuat. Periksa koneksi internet Anda.');
  }

  // Ensure WebGL backend is enabled for maximum performance
  try {
    if (faceapi.tf && faceapi.tf.setBackend) {
      await faceapi.tf.setBackend('webgl');
      await faceapi.tf.ready();
    }
  } catch (e) {
    console.warn('WebGL fallback to CPU:', e);
  }

  onProgress?.('Memuat model deteksi wajah...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);

  onProgress?.('Memuat model landmark wajah...');
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

  onProgress?.('Memuat model pengenalan wajah...');
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  // Fast detector configuration (minConfidence: 0.5)
  fastDetectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

  modelsLoaded = true;
  onProgress?.('Model AI Siap (Akselerasi WebGL Aktif)!');
}

/**
 * Extract face descriptor from an image element
 * @param {HTMLImageElement|HTMLCanvasElement} imageElement
 * @returns {Promise<{descriptor: Float32Array, detection: object}|null>}
 */
export async function extractDescriptor(imageElement) {
  const faceapi = window.faceapi;

  const result = await faceapi
    .detectSingleFace(imageElement, fastDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;

  return {
    descriptor: result.descriptor,
    detection: result.detection,
  };
}

/**
 * Scan an image for all faces and compare against reference descriptor
 * @param {HTMLImageElement} imageElement
 * @param {Float32Array} refDescriptor - Reference face descriptor
 * @param {number} threshold - Match threshold (lower = stricter)
 * @returns {Promise<Array<{distance: number, detection: object}>>}
 */
export async function scanImage(imageElement, refDescriptor, threshold = 0.6) {
  const faceapi = window.faceapi;

  const results = await faceapi
    .detectAllFaces(imageElement, fastDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!results || results.length === 0) return [];

  const matches = [];

  for (const result of results) {
    const distance = faceapi.euclideanDistance(refDescriptor, result.descriptor);
    if (distance <= threshold) {
      matches.push({
        distance,
        detection: result.detection,
      });
    }
  }

  return matches;
}

/**
 * Draw face detection box on canvas
 */
export function drawFaceBox(canvas, image, detection) {
  const ctx = canvas.getContext('2d');

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  ctx.drawImage(image, 0, 0);

  const box = detection.box;
  const padding = 8;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = Math.max(3, image.naturalWidth * 0.005);
  ctx.strokeRect(box.x - padding, box.y - padding, box.width + padding * 2, box.height + padding * 2);
}
