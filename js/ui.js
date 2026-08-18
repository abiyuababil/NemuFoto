/**
 * ui.js — Fast Parallel Scanner with Sharp proxy & WebGL acceleration
 */

import { createImageFromFile, showToast, distanceToConfidence, confidenceToDistanceThreshold, loadImage } from './utils.js';
import { extractDescriptor, scanImage, drawFaceBox } from './faceEngine.js';
import * as driveSource from './sources/driveSource.js';
import * as gotagSource from './sources/gotagSource.js';

// ─── State ─────────────────────────────────────────
let refDescriptor = null;
let uploadedFiles = [];
let isScanning = false;
let stopRequested = false;
let scanResults = [];
let activeTab = 'gotag';

// Concurrency level for parallel scanning
const CONCURRENCY = 4;

// ─── DOM ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {};

export function bindDOM() {
  el.statusDot = document.querySelector('.status-dot');
  el.statusText = $('statusText');

  el.faceArea = $('faceArea');
  el.facePrompt = $('facePrompt');
  el.facePreview = $('facePreview');
  el.faceCanvas = $('faceCanvas');
  el.faceInput = $('faceInput');
  el.removeFace = $('removeFace');
  el.faceMsg = $('faceMsg');
  el.sliderRow = $('sliderRow');
  el.slider = $('slider');
  el.sliderVal = $('sliderVal');

  el.gotagUrl = $('gotagUrl');
  el.driveUrl = $('driveUrl');
  el.dropArea = $('dropArea');
  el.filesInput = $('filesInput');
  el.fileInfo = $('fileInfo');
  el.fileCount = $('fileCount');
  el.clearFiles = $('clearFiles');

  el.scanBtn = $('scanBtn');
  el.progress = $('progress');
  el.progressFill = $('progressFill');
  el.progressText = $('progressText');
  el.stopBtn = $('stopBtn');

  el.results = $('results');
  el.resultCount = $('resultCount');
  el.grid = $('grid');

  el.modal = $('modal');
  el.modalImg = $('modalImg');
  el.modalClose = $('modalClose');
  el.modalConf = $('modalConf');
  el.modalDl = $('modalDl');
}

// ─── Events ────────────────────────────────────────
export function bindEvents() {
  // Face upload
  el.faceArea.addEventListener('click', e => {
    if (e.target.closest('#removeFace')) return;
    el.faceInput.click();
  });
  el.faceInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFace(e.target.files[0]);
  });
  setupDrop(el.faceArea, files => { if (files[0]) handleFace(files[0]); });
  el.removeFace.addEventListener('click', e => { e.stopPropagation(); clearFace(); });

  el.slider.addEventListener('input', () => {
    el.sliderVal.textContent = `${el.slider.value}%`;
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.src));
  });

  // File upload
  el.dropArea.addEventListener('click', () => el.filesInput.click());
  el.filesInput.addEventListener('change', e => handleFiles(e.target.files));
  setupDrop(el.dropArea, handleFiles);
  el.clearFiles.addEventListener('click', clearFileList);

  // Scan
  el.scanBtn.addEventListener('click', startScan);
  el.stopBtn.addEventListener('click', () => { stopRequested = true; });

  // Modal
  el.modalClose.addEventListener('click', closeModal);
  el.modal.addEventListener('click', e => { if (e.target === el.modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function setupDrop(elem, onDrop) {
  elem.addEventListener('dragover', e => { e.preventDefault(); elem.classList.add('over'); });
  elem.addEventListener('dragleave', () => elem.classList.remove('over'));
  elem.addEventListener('drop', e => { e.preventDefault(); elem.classList.remove('over'); onDrop(e.dataTransfer.files); });
}

// ─── Face ──────────────────────────────────────────
async function handleFace(file) {
  try {
    setStatus('Mendeteksi wajah...', 'scanning');
    const image = await createImageFromFile(file);
    const result = await extractDescriptor(image);

    if (!result) {
      showFaceMsg('Wajah tidak terdeteksi. Coba foto selfie lain.', false);
      setStatus('Siap', 'ready');
      return;
    }

    refDescriptor = result.descriptor;
    drawFaceBox(el.faceCanvas, image, result.detection);
    el.facePrompt.style.display = 'none';
    el.facePreview.style.display = 'block';
    el.faceArea.classList.add('done');
    el.sliderRow.style.display = 'flex';
    showFaceMsg('Wajah terdeteksi ✓', true);
    setStatus('Wajah siap — masukkan link lalu klik Cari Wajah', 'ready');
    updateBtn();
  } catch (err) {
    showToast('Gagal memproses foto: ' + err.message, 'error');
    setStatus('Error', 'error');
  }
}

function clearFace() {
  refDescriptor = null;
  el.facePrompt.style.display = '';
  el.facePreview.style.display = 'none';
  el.faceArea.classList.remove('done');
  el.faceMsg.style.display = 'none';
  el.sliderRow.style.display = 'none';
  el.faceInput.value = '';
  updateBtn();
}

function showFaceMsg(text, ok) {
  el.faceMsg.style.display = 'block';
  el.faceMsg.className = `face-msg ${ok ? 'ok' : 'err'}`;
  el.faceMsg.textContent = text;
}

// ─── Tabs ──────────────────────────────────────────
function switchTab(src) {
  activeTab = src;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.src === src));
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel${src.charAt(0).toUpperCase() + src.slice(1)}`);
  });
  updateBtn();
}

// ─── File Upload ───────────────────────────────────
async function handleFiles(fileList) {
  const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  uploadedFiles = [...uploadedFiles, ...imgs];
  el.fileInfo.style.display = 'flex';
  el.fileCount.textContent = `${uploadedFiles.length} foto dipilih`;
  updateBtn();
}

function clearFileList() {
  uploadedFiles = [];
  el.fileInfo.style.display = 'none';
  el.filesInput.value = '';
  updateBtn();
}

// ─── Button State ──────────────────────────────────
function updateBtn() {
  const hasFace = refDescriptor !== null;
  let hasSource = false;
  if (activeTab === 'gotag') hasSource = el.gotagUrl.value.trim().length > 5;
  else if (activeTab === 'drive') hasSource = el.driveUrl.value.trim().length > 5;
  else hasSource = uploadedFiles.length > 0;
  el.scanBtn.disabled = !(hasFace && hasSource);
}

setTimeout(() => {
  el.gotagUrl?.addEventListener('input', updateBtn);
  el.driveUrl?.addEventListener('input', updateBtn);
}, 100);

// ─── Parallel Worker Pool Helper ────────────────────
async function runParallelPool(items, concurrency, workerFn) {
  let currentIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length && !stopRequested) {
      const idx = currentIndex++;
      await workerFn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ─── Scan ──────────────────────────────────────────
async function startScan() {
  if (!refDescriptor || isScanning) return;

  isScanning = true;
  stopRequested = false;
  const minConfidence = parseInt(el.slider.value) || 68;
  const threshold = confidenceToDistanceThreshold(minConfidence);

  el.scanBtn.disabled = true;
  el.progress.style.display = 'flex';
  el.results.style.display = 'none';
  el.grid.innerHTML = '';
  setStatus(`Memulai scanning (Min ${minConfidence}% Match, Parallel 4x)...`, 'scanning');

  try {
    if (activeTab === 'gotag') {
      await scanGoTag(threshold);
    } else if (activeTab === 'drive') {
      await scanDrive(threshold);
    } else {
      await scanUploads(threshold);
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }

  isScanning = false;
  el.scanBtn.disabled = false;
  showDone();
}

// ─── GoTag Scan (Parallel + Fast Sharp Downscale) ────
async function scanGoTag(threshold) {
  const url = el.gotagUrl.value.trim();
  const parsed = gotagSource.parseGotagLink(url);
  if (!parsed) {
    showToast('Link GoTag.me tidak valid', 'error');
    return;
  }

  setStatus('Mengambil info album...', 'scanning');
  const info = await gotagSource.fetchEventPhotos(parsed.eventSlug, 1);
  const totalPages = info.totalPages;
  const totalPhotos = info.totalPhotos;
  setStatus(`Album: ${info.eventTitle} (${totalPhotos.toLocaleString()} foto)`, 'scanning');

  let scanned = 0;
  const batchPageSize = 8; // 8 pages (~96 photos) per batch

  for (let page = 1; page <= totalPages; page += batchPageSize) {
    if (stopRequested) break;

    const endPage = Math.min(page + batchPageSize - 1, totalPages);
    setStatus(`Scanning halaman ${page}-${endPage} dari ${totalPages}...`, 'scanning');

    let photos = [];
    try {
      photos = await gotagSource.fetchBatchPages(parsed.eventSlug, page, endPage);
    } catch {
      for (let p = page; p <= endPage && !stopRequested; p++) {
        try {
          const d = await gotagSource.fetchEventPhotos(parsed.eventSlug, p);
          photos.push(...d.photos);
        } catch {}
      }
    }

    if (photos.length === 0 && page > 1) break;

    // Process this batch of photos concurrently with 4 workers
    await runParallelPool(photos, CONCURRENCY, async (photo) => {
      if (stopRequested) return;

      try {
        // High resolution (720px) for clear face landmarks on full-body / distant runners
        const img = await loadImage(photo.medium, 720);
        await matchAndAdd(img, photo.original, threshold);
      } catch {}

      scanned++;
      updateProgress(scanned, totalPhotos);
    });
  }
}

// ─── Drive Scan (Parallel) ───────────────────────────
async function scanDrive(threshold) {
  const url = el.driveUrl.value.trim();
  const folderId = driveSource.parseDriveLink(url);
  if (!folderId) {
    showToast('Link Google Drive tidak valid', 'error');
    return;
  }

  setStatus('Mengambil daftar file Google Drive...', 'scanning');
  const files = await driveSource.listImages(folderId);
  if (!files.length) {
    showToast('Folder kosong atau tidak ada foto', 'error');
    return;
  }

  setStatus(`Ditemukan ${files.length} foto, scanning paralel...`, 'scanning');

  let scanned = 0;
  await runParallelPool(files, CONCURRENCY, async (file) => {
    if (stopRequested) return;

    try {
      const imgUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
      const dlUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
      const img = await loadImage(imgUrl, 720);
      await matchAndAdd(img, dlUrl, threshold);
    } catch {}

    scanned++;
    updateProgress(scanned, files.length);
  });
}

// ─── Upload Scan (Parallel) ──────────────────────────
async function scanUploads(threshold) {
  setStatus(`Scanning ${uploadedFiles.length} foto secara paralel...`, 'scanning');

  let scanned = 0;
  await runParallelPool(uploadedFiles, CONCURRENCY, async (file) => {
    if (stopRequested) return;

    try {
      const img = await createImageFromFile(file);
      await matchAndAdd(img, img.src, threshold);
    } catch {}

    scanned++;
    updateProgress(scanned, uploadedFiles.length);
  });
}

// ─── Match Helper ───────────────────────────────────
async function matchAndAdd(img, originalUrl, threshold) {
  const matches = await scanImage(img, refDescriptor, threshold);
  if (matches.length > 0) {
    const best = matches.reduce((a, b) => a.distance < b.distance ? a : b);
    const conf = distanceToConfidence(best.distance);
    const result = { imgSrc: img.src, originalUrl, confidence: conf, distance: best.distance };
    scanResults.push(result);
    renderResults();
    if (el.results.style.display === 'none') el.results.style.display = 'flex';
    el.resultCount.textContent = `${scanResults.length} foto ditemukan`;
  }
}

// ─── Render Results (Sorted by Highest Confidence) ──
function renderResults() {
  // Sort descending by confidence
  scanResults.sort((a, b) => b.confidence - a.confidence);
  el.grid.innerHTML = '';
  for (const res of scanResults) {
    addCard(res);
  }
}

// ─── Progress ───────────────────────────────────────
function updateProgress(current, total) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressText.textContent = `${current.toLocaleString()} / ${total.toLocaleString()}`;
}

function showDone() {
  el.progress.style.display = 'none';
  if (scanResults.length === 0) {
    el.results.style.display = 'flex';
    el.grid.innerHTML = '<div class="no-results">🔍 Wajah tidak ditemukan. Coba gunakan foto selfie yang lebih jelas.</div>';
    el.resultCount.textContent = '0 foto';
  } else {
    renderResults();
  }
  const msg = stopRequested
    ? `Dihentikan — ${scanResults.length} foto cocok ditemukan`
    : `Selesai — ${scanResults.length} foto cocok ditemukan`;
  setStatus(msg, 'ready');
  showToast(msg, scanResults.length > 0 ? 'success' : 'info');
}

// ─── Result Card ────────────────────────────────────
function addCard(result) {
  const card = document.createElement('div');
  card.className = 'r-card';
  card.innerHTML = `
    <img src="${result.imgSrc}" alt="" loading="lazy" />
    <div class="r-overlay">
      <span class="r-conf">${result.confidence}% Match</span>
      <a class="r-dl" href="${result.originalUrl}" download target="_blank" onclick="event.stopPropagation()" title="Download Asli">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>
    </div>
  `;
  card.addEventListener('click', () => openModal(result));
  el.grid.appendChild(card);
}

// ─── Modal ──────────────────────────────────────────
function openModal(result) {
  el.modalImg.src = result.imgSrc;
  el.modalConf.textContent = `${result.confidence}% Match`;
  el.modalDl.href = result.originalUrl;
  el.modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  el.modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ─── Status ─────────────────────────────────────────
export function setStatus(text, state = 'ready') {
  if (el.statusText) el.statusText.textContent = text;
  if (el.statusDot) {
    el.statusDot.className = 'status-dot';
    if (state !== 'loading') el.statusDot.classList.add(state);
  }
}
