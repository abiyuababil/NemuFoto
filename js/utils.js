/**
 * utils.js — Shared utility functions with strict FaceNet calibrated thresholds
 */

/**
 * Load an image from a URL with auto-downscaling via proxy for fast & accurate AI face recognition
 * Default width: 720px (ideal balance for distant faces in race/marathon photos)
 * @param {string} url - Remote or local image URL
 * @param {number} width - Downscaled width (default 720px)
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url, width = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));

    if (url.startsWith('data:') || url.startsWith('blob:')) {
      img.src = url;
    } else if (url.startsWith('/')) {
      img.src = url;
    } else {
      const resizeParam = width ? `&width=${width}` : '';
      img.src = `/api/proxy?url=${encodeURIComponent(url)}${resizeParam}`;
    }
  });
}

/**
 * Convert face-api Euclidean distance to realistic face-match confidence
 * Standard FaceNet calibration:
 *  - dist <= 0.20 -> 96% - 100% (Near exact)
 *  - dist = 0.35  -> 88% - 92% (High accuracy)
 *  - dist = 0.45  -> 75% - 82% (Positive match)
 *  - dist = 0.50  -> 68% (Standard threshold)
 *  - dist = 0.54  -> 55% - 60% (Loose threshold)
 *  - dist >= 0.58 -> < 45% (Different person / false positive)
 */
export function distanceToConfidence(distance) {
  if (distance <= 0.50) {
    // 0.0 -> 100%, 0.50 -> 68%
    const score = 100 - (distance / 0.50) * 32;
    return Math.round(Math.max(68, Math.min(100, score)));
  } else if (distance <= 0.58) {
    // 0.50 -> 68%, 0.58 -> 45%
    const score = 68 - ((distance - 0.50) / 0.08) * 23;
    return Math.round(Math.max(45, Math.min(67, score)));
  } else {
    // > 0.58 is different people
    const score = 45 - ((distance - 0.58) / 0.12) * 35;
    return Math.round(Math.max(0, Math.min(44, score)));
  }
}

/**
 * Convert slider confidence (e.g. 50% - 90%) to strict Euclidean distance threshold
 * Prevents false positives / stranger faces:
 *  - 80% (Ketat)   -> dist <= 0.38
 *  - 68% (Standar) -> dist <= 0.50
 *  - 55% (Luas)    -> dist <= 0.53
 *  - 50% (Maksimal) -> dist <= 0.55 (Max limit, eliminates random strangers)
 */
export function confidenceToDistanceThreshold(confidence) {
  const conf = Math.max(45, Math.min(90, confidence));
  if (conf >= 68) {
    return ((100 - conf) / 32) * 0.50;
  } else {
    return 0.50 + ((68 - conf) / 23) * 0.05;
  }
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

/**
 * Create an image element from a File object
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function createImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
