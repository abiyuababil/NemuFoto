/**
 * main.js — App entry point & initialization
 */

import { initModels } from './faceEngine.js';
import { bindDOM, bindEvents, setStatus } from './ui.js';

async function init() {
  // 1. Bind DOM elements
  bindDOM();

  // 2. Bind event listeners
  bindEvents();

  // 3. Load face-api models
  try {
    await initModels((msg) => setStatus(msg, 'loading'));
    setStatus('AI models ready — upload foto wajah untuk mulai', 'ready');
  } catch (err) {
    console.error('Model init failed:', err);
    setStatus('Gagal memuat AI model: ' + err.message, 'error');
  }
}

// Wait for face-api.js to load from CDN
function waitForFaceApi() {
  return new Promise((resolve) => {
    if (window.faceapi) {
      resolve();
      return;
    }

    // Poll for faceapi availability
    const interval = setInterval(() => {
      if (window.faceapi) {
        clearInterval(interval);
        resolve();
      }
    }, 100);

    // Timeout after 15 seconds
    setTimeout(() => {
      clearInterval(interval);
      resolve(); // Continue anyway, initModels will handle the error
    }, 15000);
  });
}

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  await waitForFaceApi();
  await init();
});
