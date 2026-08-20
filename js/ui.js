/**
 * ui.js — Fast Parallel Scanner with Minimalist Black Theme & Collapsible UI
 */

import { createImageFromFile, showToast, distanceToConfidence, confidenceToDistanceThreshold, loadImage } from './utils.js';
import { extractDescriptor, scanImage, drawFaceBox } from './faceEngine.js';
import { startKeepAlive, stopKeepAlive } from './keepAlive.js';
import * as driveSource from './sources/driveSource.js';
import * as gotagSource from './sources/gotagSource.js';

// ─── State ─────────────────────────────────────────
let refDescriptor = null;
let refImageElement = null;
let refDetection = null;
let uploadedFiles = [];
let isScanning = false;
let stopRequested = false;
let scanResults = [];
let activeTab = 'gotag';
let isConfigOpen = true;

// Concurrency level for parallel scanning
const CONCURRENCY = 4;

// ─── DOM ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {};

export function bindDOM() {
  el.statusDot = document.querySelector('.status-dot');
  el.statusText = $('statusText');

  // Setup Card & Collapsed Bar
  el.setupCard = $('setupCard');
  el.compactBarWrap = $('compactBarWrap');
  el.miniFaceCanvas = $('miniFaceCanvas');
  el.compactSourceLabel = $('compactSourceLabel');
  el.compactMatchLabel = $('compactMatchLabel');
  el.btnToggleConfig = $('btnToggleConfig');
  el.toggleConfigText = $('toggleConfigText');
  el.btnRescan = $('btnRescan');

  // Face elements
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

  // Source inputs
  el.gotagUrl = $('gotagUrl');
  el.driveUrl = $('driveUrl');
  el.dropArea = $('dropArea');
  el.filesInput = $('filesInput');
  el.fileInfo = $('fileInfo');
  el.fileCount = $('fileCount');
  el.clearFiles = $('clearFiles');

  // Action & Progress
  el.scanBtn = $('scanBtn');
  el.progress = $('progress');
  el.progressFill = $('progressFill');
  el.progressText = $('progressText');
  el.progressStatusLabel = $('progressStatusLabel');
  el.stopBtn = $('stopBtn');

  // Gallery Results
  el.results = $('results');
  el.resultCount = $('resultCount');
  el.grid = $('grid');

  // Modal
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
    if (el.compactMatchLabel) {
      el.compactMatchLabel.textContent = `Min ${el.slider.value}% Match`;
    }
  });

  // Toggle Config Card (Accordion / Fold)
  el.btnToggleConfig.addEventListener('click', () => {
    toggleSetupCard();
  });

  // Rescan from compact bar
  el.btnRescan.addEventListener('click', () => {
    startScan();
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(t => {
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
  el.modal.addEventListener('click', e => {
    if (e.target === el.modal || e.target.classList.contains('modal-backdrop')) {
      closeModal();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function setupDrop(elem, onDrop) {
  elem.addEventListener('dragover', e => { e.preventDefault(); elem.classList.add('over'); });
  elem.addEventListener('dragleave', () => elem.classList.remove('over'));
  elem.addEventListener('drop', e => { e.preventDefault(); elem.classList.remove('over'); onDrop(e.dataTransfer.files); });
}

// ─── Face Processing ───────────────────────────────
async function handleFace(file) {
  try {
    setStatus('Mendeteksi wajah...', 'scanning');
    const image = await createImageFromFile(file);
    const result = await extractDescriptor(image);

    if (!result) {
      showFaceMsg('Wajah tidak terdeteksi. Coba foto selfie yang lebih jelas.', false);
      setStatus('Siap', 'ready');
      return;
    }

    refDescriptor = result.descriptor;
    refImageElement = image;
    refDetection = result.detection;

    // Draw main face preview
    drawFaceBox(el.faceCanvas, image, result.detection);

    // Draw mini avatar for collapsed bar
    drawMiniFace(el.miniFaceCanvas, image, result.detection);

    el.facePrompt.style.display = 'none';
    el.facePreview.style.display = 'block';
    el.faceArea.classList.add('done');
    el.sliderRow.style.display = 'flex';
    showFaceMsg('Wajah berhasil terdeteksi ✓', true);
    setStatus('Wajah siap — pilih sumber lalu mulai cari foto', 'ready');
    updateBtn();
  } catch (err) {
    showToast('Gagal memproses foto: ' + err.message, 'error');
    setStatus('Error', 'error');
  }
}

function drawMiniFace(canvas, image, detection) {
  if (!canvas || !detection) return;
  const ctx = canvas.getContext('2d');
  const box = detection.box;
  const size = Math.max(box.width, box.height) * 1.3;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const sx = Math.max(0, centerX - size / 2);
  const sy = Math.max(0, centerY - size / 2);
  const sWidth = Math.min(image.naturalWidth - sx, size);
  const sHeight = Math.min(image.naturalHeight - sy, size);

  canvas.width = 80;
  canvas.height = 80;
  ctx.clearRect(0, 0, 80, 80);
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 80, 80);
}

function clearFace() {
  refDescriptor = null;
  refImageElement = null;
  refDetection = null;
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

// ─── Setup Card Collapse / Expand ───────────────────
function collapseSetupCard() {
  isConfigOpen = false;
  el.setupCard.classList.add('hidden');
  el.compactBarWrap.style.display = 'block';
  el.toggleConfigText.textContent = 'Ubah Sumber';
  updateCompactLabels();
}

function expandSetupCard() {
  isConfigOpen = true;
  el.setupCard.classList.remove('hidden');
  el.toggleConfigText.textContent = 'Tutup Pengaturan';
}

function toggleSetupCard() {
  if (el.setupCard.classList.contains('hidden')) {
    expandSetupCard();
  } else {
    collapseSetupCard();
  }
}

function updateCompactLabels() {
  if (activeTab === 'gotag') {
    const parsed = gotagSource.parseGotagLink(el.gotagUrl.value.trim());
    el.compactSourceLabel.textContent = parsed ? `GoTag: ${parsed.eventSlug}` : 'GoTag.me Album';
  } else if (activeTab === 'drive') {
    el.compactSourceLabel.textContent = 'Google Drive Album';
  } else {
    el.compactSourceLabel.textContent = `${uploadedFiles.length} Foto Upload`;
  }
  el.compactMatchLabel.textContent = `Min ${el.slider.value}% Match`;
}

// ─── Tabs ──────────────────────────────────────────
function switchTab(src) {
  activeTab = src;
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.src === src));
  document.querySelectorAll('.tab-panel').forEach(p => {
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
  scanResults = [];
  const minConfidence = parseInt(el.slider.value) || 68;
  const threshold = confidenceToDistanceThreshold(minConfidence);

  // Automatically fold setup card so main page focuses on results gallery
  collapseSetupCard();

  el.scanBtn.disabled = true;
  el.progress.style.display = 'flex';
  el.results.style.display = 'flex';
  el.grid.innerHTML = '';
  el.resultCount.textContent = '0 foto';
  if (el.progressStatusLabel) {
    el.progressStatusLabel.textContent = `Memindai foto (Min ${minConfidence}% Match)...`;
  }
  setStatus(`Scanning (Min ${minConfidence}% Match, Parallel 4x)...`, 'scanning');

  // Activate keep-alive so background tab throttling & sleep are prevented
  await startKeepAlive();

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
  } finally {
    isScanning = false;
    el.scanBtn.disabled = false;
    showDone();
    await stopKeepAlive();
  }
}

// ─── GoTag Scan (Parallel + Fast Sharp Downscale) ────
async function scanGoTag(threshold) {
  const url = el.gotagUrl.value.trim();
  const parsed = gotagSource.parseGotagLink(url);
  if (!parsed) {
    showToast('Link GoTag.me tidak valid', 'error');
    return;
  }

  if (el.progressStatusLabel) el.progressStatusLabel.textContent = 'Mengambil info album GoTag.me...';
  const info = await gotagSource.fetchEventPhotos(parsed.eventSlug, 1);
  const totalPages = info.totalPages;
  const totalPhotos = info.totalPhotos;
  setStatus(`Album: ${info.eventTitle} (${totalPhotos.toLocaleString()} foto)`, 'scanning');

  let scanned = 0;
  const batchPageSize = 8;

  for (let page = 1; page <= totalPages; page += batchPageSize) {
    if (stopRequested) break;

    const endPage = Math.min(page + batchPageSize - 1, totalPages);
    if (el.progressStatusLabel) {
      el.progressStatusLabel.textContent = `Memindai halaman ${page}-${endPage} dari ${totalPages}...`;
    }

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

    // Process batch concurrently
    await runParallelPool(photos, CONCURRENCY, async (photo) => {
      if (stopRequested) return;

      try {
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

  if (el.progressStatusLabel) el.progressStatusLabel.textContent = 'Membaca file Google Drive...';
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
  if (el.progressStatusLabel) el.progressStatusLabel.textContent = `Memindai ${uploadedFiles.length} foto lokal...`;

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
    el.resultCount.textContent = `${scanResults.length} foto`;
  }
}

// ─── Render Results (Sorted by Highest Confidence) ──
function renderResults() {
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
    el.grid.innerHTML = '<div class="no-match-box">🔍 Tidak ada wajah yang cocok ditemukan. Coba turunkan slider kecocokan atau gunakan foto selfie lain.</div>';
    el.resultCount.textContent = '0 foto';
  } else {
    renderResults();
  }
  const msg = stopRequested
    ? `Dihentikan — ${scanResults.length} foto ditemukan`
    : `Selesai — ${scanResults.length} foto cocok ditemukan`;
  setStatus(msg, 'ready');
  showToast(msg, scanResults.length > 0 ? 'success' : 'info');
}

// ─── Result Card ────────────────────────────────────
function addCard(result) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.innerHTML = `
    <img src="${result.imgSrc}" alt="Foto Wajah Cocok" loading="lazy" />
    <div class="card-overlay">
      <span class="match-badge">${result.confidence}% Match</span>
      <a class="btn-card-dl" href="${result.originalUrl}" download target="_blank" onclick="event.stopPropagation()" title="Download Asli">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
