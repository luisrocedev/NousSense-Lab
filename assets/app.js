/* ──────────────────────────────────────────────
   NousSense Lab — app.js (v2)
   Tabs · Waveform · FPS · KPIs · Toasts · Confirm
   Dark mode toggle · Export · Confidence bar
   ────────────────────────────────────────────── */

const DB_NAME = 'noussense_lab_db';
const DB_VERSION = 1;
const STORES = { history: 'history', notes: 'notes', captures: 'captures' };

/* ── DOM refs ── */
const el = {
  assistantState: document.getElementById('assistantState'),
  listenBtn: document.getElementById('listenBtn'),
  stopListenBtn: document.getElementById('stopListenBtn'),
  recognizedText: document.getElementById('recognizedText'),
  speakText: document.getElementById('speakText'),
  speakBtn: document.getElementById('speakBtn'),
  stopSpeakBtn: document.getElementById('stopSpeakBtn'),
  startCamBtn: document.getElementById('startCamBtn'),
  stopCamBtn: document.getElementById('stopCamBtn'),
  captureBtn: document.getElementById('captureBtn'),
  modeSelect: document.getElementById('modeSelect'),
  visionStatus: document.getElementById('visionStatus'),
  inputVideo: document.getElementById('inputVideo'),
  outputCanvas: document.getElementById('outputCanvas'),
  cameraPlaceholder: document.getElementById('cameraPlaceholder'),
  cameraOverlay: document.getElementById('cameraOverlay'),
  overlayMode: document.getElementById('overlayMode'),
  overlayFps: document.getElementById('overlayFps'),
  notesList: document.getElementById('notesList'),
  historyList: document.getElementById('historyList'),
  capturesGrid: document.getElementById('capturesGrid'),
  reloadDataBtn: document.getElementById('reloadDataBtn'),
  exportNotesBtn: document.getElementById('exportNotesBtn'),
  clearNotesBtn: document.getElementById('clearNotesBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  darkModeBtn: document.getElementById('darkModeBtn'),
  waveformCanvas: document.getElementById('waveformCanvas'),
  confidenceBar: document.getElementById('confidenceBar'),
  confidenceFill: document.getElementById('confidenceFill'),
  confidenceLabel: document.getElementById('confidenceLabel'),
  toastContainer: document.getElementById('toastContainer'),
  confirmOverlay: document.getElementById('confirmOverlay'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmOk: document.getElementById('confirmOk'),
  confirmCancel: document.getElementById('confirmCancel'),
  kpiVoice: document.getElementById('kpiVoice'),
  kpiNotes: document.getElementById('kpiNotes'),
  kpiCaptures: document.getElementById('kpiCaptures'),
  kpiEvents: document.getElementById('kpiEvents'),
};

/* ── State ── */
const state = {
  recognition: null,
  listening: false,
  stoppingRecognition: false,
  camera: null,
  mode: 'none',
  hands: null,
  faceMesh: null,
  dbConnection: null,
  visionReady: false,
  audioCtx: null,
  analyser: null,
  micStream: null,
  waveAnimId: null,
  fps: { frames: 0, last: performance.now(), value: 0 },
};

/* ══════════════════════════════════════════════
   TOAST SYSTEM (A.9)
   ══════════════════════════════════════════════ */
function showToast(message, tone = 'info') {
  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone} slideUp`;
  toast.innerHTML = `<span class="toast-icon">${icons[tone] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => { toast.classList.add('fadeOut'); setTimeout(() => toast.remove(), 400); }, 3500);
}

/* ══════════════════════════════════════════════
   CUSTOM CONFIRM DIALOG (A.10)
   ══════════════════════════════════════════════ */
function nousConfirm(title, message) {
  return new Promise((resolve) => {
    el.confirmTitle.textContent = title;
    el.confirmMessage.textContent = message;
    el.confirmOverlay.hidden = false;
    const cleanup = (val) => { el.confirmOverlay.hidden = true; resolve(val); };
    el.confirmOk.onclick = () => cleanup(true);
    el.confirmCancel.onclick = () => cleanup(false);
  });
}

/* ══════════════════════════════════════════════
   INDEXEDDB (singleton)
   ══════════════════════════════════════════════ */
function openDb() {
  if (state.dbConnection) return Promise.resolve(state.dbConnection);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
    };
    req.onsuccess = () => {
      state.dbConnection = req.result;
      state.dbConnection.onclose = () => { state.dbConnection = null; };
      resolve(state.dbConnection);
    };
  });
}

async function dbAction(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    tx.onerror = () => reject(tx.error);
    request.onsuccess = () => resolve(request.result);
  });
}

const addHistory = (kind, text) =>
  dbAction(STORES.history, 'readwrite', (s) => s.add({ kind, text, createdAt: new Date().toISOString() }));
const addNote = (text) =>
  dbAction(STORES.notes, 'readwrite', (s) => s.add({ text, createdAt: new Date().toISOString() }));
const addCapture = (dataUrl, mode) =>
  dbAction(STORES.captures, 'readwrite', (s) => s.add({ image: dataUrl, mode, createdAt: new Date().toISOString() }));
const getAll = (storeName) =>
  dbAction(storeName, 'readonly', (s) => s.getAll());
const clearStore = (storeName) =>
  dbAction(storeName, 'readwrite', (s) => s.clear());

/* ══════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════ */
function escapeHtml(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function formatDate(iso) {
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return iso; }
}

/* ── Badge states (A.7) ── */
function setAssistantState(text, badgeClass = 'badge-idle') {
  el.assistantState.className = `badge ${badgeClass}`;
  el.assistantState.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(text)}`;
}

/* ── Kind labels (A.13) ── */
const KIND_COLORS = { voice: 'blue', camera: 'green', note: 'amber', tts: 'purple', error: 'red', capture: 'green' };
function kindTag(kind) {
  const c = KIND_COLORS[kind] || 'gray';
  return `<span class="tag tag-${c}">${escapeHtml(kind)}</span>`;
}

/* ── Render ── */
function renderList(container, rows, mapper, emptyText) {
  if (!rows.length) { container.innerHTML = `<article class="item"><p>${emptyText}</p></article>`; return; }
  container.innerHTML = rows.map(mapper).join('');
}

/* ══════════════════════════════════════════════
   KPIs (A.6)
   ══════════════════════════════════════════════ */
async function updateKpis() {
  const [history, notes, captures] = await Promise.all([
    getAll(STORES.history), getAll(STORES.notes), getAll(STORES.captures),
  ]);
  el.kpiVoice.textContent = history.filter((h) => h.kind === 'voice').length;
  el.kpiNotes.textContent = notes.length;
  el.kpiCaptures.textContent = captures.length;
  el.kpiEvents.textContent = history.length;
}

/* ══════════════════════════════════════════════
   DATA REFRESH
   ══════════════════════════════════════════════ */
async function refreshData() {
  const [history, notes, captures] = await Promise.all([
    getAll(STORES.history), getAll(STORES.notes), getAll(STORES.captures),
  ]);
  history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  captures.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderList(el.historyList, history,
    (r) => `<article class="item"><small>${formatDate(r.createdAt)} ${kindTag(r.kind)}</small><p>${escapeHtml(r.text)}</p></article>`,
    'Sin historial todavía.');

  renderList(el.notesList, notes,
    (r) => `<article class="item"><small>${formatDate(r.createdAt)}</small><p>${escapeHtml(r.text)}</p></article>`,
    'Sin notas guardadas.');

  if (!captures.length) {
    el.capturesGrid.innerHTML = '<article class="item"><p>No hay capturas.</p></article>';
  } else {
    el.capturesGrid.innerHTML = captures.map((r) => `
      <article class="capture">
        <img src="${r.image}" alt="captura">
        <small>${formatDate(r.createdAt)} · modo ${escapeHtml(r.mode)}</small>
      </article>`).join('');
  }

  /* KPIs */
  el.kpiVoice.textContent = history.filter((h) => h.kind === 'voice').length;
  el.kpiNotes.textContent = notes.length;
  el.kpiCaptures.textContent = captures.length;
  el.kpiEvents.textContent = history.length;
}

/* ══════════════════════════════════════════════
   SPEECH
   ══════════════════════════════════════════════ */
function speak(text) {
  const v = String(text || '').trim();
  if (!v) return;
  const u = new SpeechSynthesisUtterance(v);
  u.lang = 'es-ES';
  u.onstart = () => setAssistantState('Hablando...', 'badge-speaking');
  u.onend = () => {
    if (state.listening) setAssistantState('Asistente escuchando...', 'badge-listening');
    else setAssistantState('Asistente inactivo', 'badge-idle');
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ══════════════════════════════════════════════
   CONFIDENCE BAR (A.3)
   ══════════════════════════════════════════════ */
function showConfidence(confidence) {
  const pct = Math.round(confidence * 100);
  el.confidenceBar.hidden = false;
  el.confidenceFill.style.width = `${pct}%`;
  el.confidenceLabel.textContent = `${pct}%`;
  el.confidenceFill.className = 'confidence-fill ' +
    (pct > 80 ? 'conf-green' : pct > 50 ? 'conf-amber' : 'conf-red');
}

/* ══════════════════════════════════════════════
   WAVEFORM (A.2)
   ══════════════════════════════════════════════ */
function startWaveform(stream) {
  try {
    state.audioCtx = new AudioContext();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    const src = state.audioCtx.createMediaStreamSource(stream);
    src.connect(state.analyser);
    state.micStream = stream;
    drawWaveform();
  } catch (err) {
    console.warn('Waveform no disponible:', err);
  }
}

function drawWaveform() {
  if (!state.analyser) return;
  const canvas = el.waveformCanvas;
  const ctx = canvas.getContext('2d');
  const bufLen = state.analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);

  const draw = () => {
    state.waveAnimId = requestAnimationFrame(draw);
    state.analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barW = (canvas.width / bufLen) * 2.5;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const h = (data[i] / 255) * canvas.height;
      const hue = state.listening ? 210 : 0;
      ctx.fillStyle = `hsl(${hue}, 70%, ${40 + (data[i] / 255) * 30}%)`;
      ctx.fillRect(x, canvas.height - h, barW - 1, h);
      x += barW;
    }
  };
  draw();
}

function stopWaveform() {
  if (state.waveAnimId) { cancelAnimationFrame(state.waveAnimId); state.waveAnimId = null; }
  if (state.audioCtx) { state.audioCtx.close().catch(() => {}); state.audioCtx = null; state.analyser = null; }
  if (state.micStream) { state.micStream.getTracks().forEach((t) => t.stop()); state.micStream = null; }
  const ctx = el.waveformCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.waveformCanvas.width, el.waveformCanvas.height);
}

/* ══════════════════════════════════════════════
   MODE
   ══════════════════════════════════════════════ */
function setMode(mode) {
  state.mode = mode;
  el.modeSelect.value = mode;
  const label = mode === 'none' ? 'Normal' : mode === 'hands' ? 'Manos' : 'Cara';
  el.visionStatus.value = mode === 'none' ? 'Vista normal' : `Detección: ${label}`;
  el.overlayMode.textContent = label;
}

/* ══════════════════════════════════════════════
   VISION / CAMERA
   ══════════════════════════════════════════════ */
async function setupVisionEngines() {
  if (state.visionReady) return;
  if (typeof Hands === 'undefined' || typeof FaceMesh === 'undefined') {
    console.warn('MediaPipe no disponible — detección deshabilitada.');
    return;
  }
  state.hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  state.hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  state.hands.onResults((results) => {
    drawFrame(results.image, (ctx) => {
      if (results.multiHandLandmarks) {
        for (const lm of results.multiHandLandmarks) { drawConnectors(ctx, lm, HAND_CONNECTIONS); drawLandmarks(ctx, lm, { radius: 2 }); }
      }
    });
  });
  state.faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  state.faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  state.faceMesh.onResults((results) => {
    drawFrame(results.image, (ctx) => {
      if (results.multiFaceLandmarks) {
        for (const lm of results.multiFaceLandmarks) { drawConnectors(ctx, lm, FACEMESH_TESSELATION); drawConnectors(ctx, lm, FACEMESH_CONTOURS, { lineWidth: 1.2 }); }
      }
    });
  });
  state.visionReady = true;
}

function drawFrame(image, drawCb) {
  const ctx = el.outputCanvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, el.outputCanvas.width, el.outputCanvas.height);
  ctx.drawImage(image, 0, 0, el.outputCanvas.width, el.outputCanvas.height);
  if (drawCb) drawCb(ctx);
  ctx.restore();
  /* FPS (A.4) */
  state.fps.frames++;
  const now = performance.now();
  if (now - state.fps.last >= 1000) {
    state.fps.value = state.fps.frames;
    state.fps.frames = 0;
    state.fps.last = now;
    el.overlayFps.textContent = `${state.fps.value} FPS`;
  }
}

async function processVision() {
  try {
    if (state.mode === 'hands' && state.hands) { await state.hands.send({ image: el.inputVideo }); return; }
    if (state.mode === 'face' && state.faceMesh) { await state.faceMesh.send({ image: el.inputVideo }); return; }
    drawFrame(el.inputVideo);
  } catch (err) { console.warn('processVision:', err); drawFrame(el.inputVideo); }
}

async function startCamera() {
  if (state.camera) return;
  if (typeof Camera === 'undefined') { showToast('MediaPipe Camera no disponible', 'error'); return; }
  try {
    await setupVisionEngines();
    state.camera = new Camera(el.inputVideo, { onFrame: processVision, width: 640, height: 480 });
    await state.camera.start();
    el.cameraPlaceholder.hidden = true;
    el.cameraOverlay.hidden = false;
    el.visionStatus.value = 'Cámara activa';
    await addHistory('camera', 'Cámara iniciada');
    await refreshData();
    showToast('Cámara iniciada', 'success');
  } catch (err) {
    console.error('Error al iniciar cámara:', err);
    state.camera = null;
    el.visionStatus.value = 'Error al iniciar cámara';
    showToast('No se pudo iniciar la cámara — revisa permisos', 'error');
  }
}

async function stopCamera() {
  if (!state.camera) return;
  state.camera.stop();
  state.camera = null;
  const tracks = el.inputVideo.srcObject?.getTracks();
  if (tracks) tracks.forEach((t) => t.stop());
  el.inputVideo.srcObject = null;
  const ctx = el.outputCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.outputCanvas.width, el.outputCanvas.height);
  el.cameraPlaceholder.hidden = false;
  el.cameraOverlay.hidden = true;
  state.fps = { frames: 0, last: performance.now(), value: 0 };
  el.visionStatus.value = 'Cámara detenida';
  await addHistory('camera', 'Cámara detenida');
  await refreshData();
  showToast('Cámara detenida', 'info');
}

async function captureImage() {
  if (!state.camera) { showToast('Primero inicia la cámara', 'warning'); return; }
  const dataUrl = el.outputCanvas.toDataURL('image/png');
  await addCapture(dataUrl, state.mode);
  await addHistory('capture', `Captura guardada en modo ${state.mode}`);
  await refreshData();
  showToast('Captura guardada 📸', 'success');
}

/* ══════════════════════════════════════════════
   SPEECH RECOGNITION
   ══════════════════════════════════════════════ */
function createRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'es-ES';
  r.interimResults = false;
  r.continuous = true;

  r.onresult = async (event) => {
    const result = event.results[event.results.length - 1][0];
    const phrase = result.transcript.trim();
    const confidence = result.confidence;
    el.recognizedText.value = phrase;
    showConfidence(confidence);
    await addHistory('voice', phrase);
    await handleVoiceCommand(phrase);
    await refreshData();
  };

  r.onstart = () => {
    state.listening = true;
    setAssistantState('Asistente escuchando...', 'badge-listening');
    el.listenBtn.disabled = true;
  };

  r.onend = () => {
    state.listening = false;
    if (!state.stoppingRecognition) {
      try { r.start(); } catch { /* already started */ }
      return;
    }
    state.stoppingRecognition = false;
    setAssistantState('Asistente inactivo', 'badge-idle');
    el.listenBtn.disabled = false;
    stopWaveform();
  };

  r.onerror = async (e) => {
    await addHistory('error', `Speech error: ${e.error}`);
    await refreshData();
    if (e.error !== 'no-speech') showToast(`Error de voz: ${e.error}`, 'error');
  };

  return r;
}

/* ══════════════════════════════════════════════
   VOICE COMMANDS
   ══════════════════════════════════════════════ */
async function handleVoiceCommand(rawText) {
  const text = rawText.toLowerCase();
  if (text.includes('modo manos'))   { setMode('hands'); speak('Modo manos activado'); return; }
  if (text.includes('modo cara'))    { setMode('face');  speak('Modo cara activado');  return; }
  if (text.includes('modo normal'))  { setMode('none');  speak('Modo normal activado'); return; }
  if (text.includes('iniciar cámara') || text.includes('iniciar camara')) { await startCamera(); speak('Cámara iniciada'); return; }
  if (text.includes('detener cámara') || text.includes('detener camara')) { await stopCamera(); speak('Cámara detenida'); return; }
  if (text.includes('capturar'))     { await captureImage(); return; }
  if (text.startsWith('guardar nota')) {
    const note = rawText.replace(/guardar nota/i, '').trim();
    if (note) { await addNote(note); await addHistory('note', `Nota guardada: ${note}`); await refreshData(); speak('Nota guardada'); }
    return;
  }
  if (text.includes('leer notas')) {
    const notes = await getAll(STORES.notes);
    if (!notes.length) { speak('No hay notas guardadas'); return; }
    const last = notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    speak(`Última nota: ${last.text}`);
    return;
  }
  if (text.includes('eliminar notas')) {
    await clearStore(STORES.notes);
    await addHistory('note', 'Notas eliminadas por comando de voz');
    await refreshData();
    speak('Notas eliminadas');
    return;
  }
  speak(`He escuchado: ${rawText}`);
}

/* ══════════════════════════════════════════════
   EXPORT NOTES (A.12)
   ══════════════════════════════════════════════ */
async function exportNotes() {
  const notes = await getAll(STORES.notes);
  if (!notes.length) { showToast('No hay notas para exportar', 'warning'); return; }
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `noussense_notes_${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Notas exportadas', 'success');
}

/* ══════════════════════════════════════════════
   TABS (A.1)
   ══════════════════════════════════════════════ */
function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════════
   DARK MODE (A.8)
   ══════════════════════════════════════════════ */
function initDarkMode() {
  const saved = localStorage.getItem('noussense-dark');
  if (saved === '1') document.body.classList.add('dark');
  el.darkModeBtn.addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark');
    localStorage.setItem('noussense-dark', dark ? '1' : '0');
    el.darkModeBtn.textContent = dark ? '☀️' : '🌙';
  });
  if (document.body.classList.contains('dark')) el.darkModeBtn.textContent = '☀️';
}

/* ══════════════════════════════════════════════
   EVENT LISTENERS
   ══════════════════════════════════════════════ */
el.listenBtn.addEventListener('click', async () => {
  if (!state.recognition) { showToast('Reconocimiento de voz no soportado — usa Chrome o Edge', 'error'); return; }
  if (state.listening) return;
  state.stoppingRecognition = false;
  try {
    /* Waveform: need mic stream */
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startWaveform(stream);
    state.recognition.start();
  } catch (err) {
    console.warn('Error al iniciar reconocimiento:', err);
    showToast('No se pudo acceder al micrófono', 'error');
  }
});

el.stopListenBtn.addEventListener('click', () => {
  if (state.recognition && state.listening) {
    state.stoppingRecognition = true;
    state.recognition.stop();
  }
});

el.speakBtn.addEventListener('click', async () => {
  const text = el.speakText.value.trim();
  if (!text) return;
  speak(text);
  await addHistory('tts', text);
  await refreshData();
});

el.stopSpeakBtn.addEventListener('click', () => { speechSynthesis.cancel(); });

el.startCamBtn.addEventListener('click', () => startCamera());
el.stopCamBtn.addEventListener('click', () => stopCamera());
el.captureBtn.addEventListener('click', () => captureImage());
el.modeSelect.addEventListener('change', () => setMode(el.modeSelect.value));
el.reloadDataBtn.addEventListener('click', refreshData);
el.exportNotesBtn.addEventListener('click', exportNotes);

el.clearNotesBtn.addEventListener('click', async () => {
  const ok = await nousConfirm('Vaciar notas', '¿Eliminar todas las notas guardadas?');
  if (!ok) return;
  await clearStore(STORES.notes);
  await refreshData();
  showToast('Notas eliminadas', 'info');
});

el.clearHistoryBtn.addEventListener('click', async () => {
  const ok = await nousConfirm('Vaciar historial', '¿Eliminar todo el historial de eventos?');
  if (!ok) return;
  await clearStore(STORES.history);
  await refreshData();
  showToast('Historial vaciado', 'info');
});

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */
async function init() {
  state.recognition = createRecognition();
  setMode('none');
  initTabs();
  initDarkMode();
  await refreshData();
}

init().catch(console.error);
