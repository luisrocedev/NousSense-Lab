const DB_NAME = 'noussense_lab_db';
const DB_VERSION = 1;
const STORES = {
  history: 'history',
  notes: 'notes',
  captures: 'captures',
};

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
  modeSelect: document.getElementById('modeSelect'),
  visionStatus: document.getElementById('visionStatus'),
  inputVideo: document.getElementById('inputVideo'),
  outputCanvas: document.getElementById('outputCanvas'),
  notesList: document.getElementById('notesList'),
  historyList: document.getElementById('historyList'),
  capturesGrid: document.getElementById('capturesGrid'),
  reloadDataBtn: document.getElementById('reloadDataBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

const state = {
  recognition: null,
  listening: false,
  camera: null,
  mode: 'none',
  hands: null,
  faceMesh: null,
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.history)) {
        const store = db.createObjectStore(STORES.history, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.notes)) {
        const store = db.createObjectStore(STORES.notes, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.captures)) {
        const store = db.createObjectStore(STORES.captures, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
  });
}

async function dbAction(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => db.close();
  });
}

function addHistory(kind, text) {
  return dbAction(STORES.history, 'readwrite', (store) =>
    store.add({ kind, text, createdAt: new Date().toISOString() })
  );
}

function addNote(text) {
  return dbAction(STORES.notes, 'readwrite', (store) =>
    store.add({ text, createdAt: new Date().toISOString() })
  );
}

function addCapture(dataUrl, mode) {
  return dbAction(STORES.captures, 'readwrite', (store) =>
    store.add({ image: dataUrl, mode, createdAt: new Date().toISOString() })
  );
}

function getAll(storeName) {
  return dbAction(storeName, 'readonly', (store) => store.getAll());
}

function clearStore(storeName) {
  return dbAction(storeName, 'readwrite', (store) => store.clear());
}

function setAssistantState(text) {
  el.assistantState.textContent = text;
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return iso; }
}

function renderList(container, rows, mapper, emptyText) {
  if (!rows.length) {
    container.innerHTML = `<article class="item"><p>${emptyText}</p></article>`;
    return;
  }
  container.innerHTML = rows.map(mapper).join('');
}

async function refreshData() {
  const [history, notes, captures] = await Promise.all([
    getAll(STORES.history),
    getAll(STORES.notes),
    getAll(STORES.captures),
  ]);

  history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  captures.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderList(
    el.historyList,
    history,
    (row) => `<article class="item"><small>${formatDate(row.createdAt)} · ${row.kind}</small><p>${escapeHtml(row.text)}</p></article>`,
    'Sin historial todavía.'
  );

  renderList(
    el.notesList,
    notes,
    (row) => `<article class="item"><small>${formatDate(row.createdAt)}</small><p>${escapeHtml(row.text)}</p></article>`,
    'Sin notas guardadas.'
  );

  if (!captures.length) {
    el.capturesGrid.innerHTML = '<article class="item"><p>No hay capturas.</p></article>';
  } else {
    el.capturesGrid.innerHTML = captures.map((row) => `
      <article class="capture">
        <img src="${row.image}" alt="captura">
        <small>${formatDate(row.createdAt)} · modo ${row.mode}</small>
      </article>
    `).join('');
  }
}

function speak(text) {
  const value = String(text || '').trim();
  if (!value) return;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = 'es-ES';
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setMode(mode) {
  state.mode = mode;
  el.modeSelect.value = mode;
  el.visionStatus.value = mode === 'none' ? 'Vista normal' : `Detección: ${mode}`;
}

async function setupVisionEngines() {
  state.hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  state.hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  state.faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  state.faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function drawFrame(image, drawCb) {
  const ctx = el.outputCanvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, el.outputCanvas.width, el.outputCanvas.height);
  ctx.drawImage(image, 0, 0, el.outputCanvas.width, el.outputCanvas.height);
  if (drawCb) drawCb(ctx);
  ctx.restore();
}

async function processVision() {
  if (state.mode === 'hands') {
    state.hands.onResults((results) => {
      drawFrame(results.image, (ctx) => {
        if (results.multiHandLandmarks) {
          for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS);
            drawLandmarks(ctx, landmarks, { radius: 2 });
          }
        }
      });
    });
    await state.hands.send({ image: el.inputVideo });
    return;
  }

  if (state.mode === 'face') {
    state.faceMesh.onResults((results) => {
      drawFrame(results.image, (ctx) => {
        if (results.multiFaceLandmarks) {
          for (const landmarks of results.multiFaceLandmarks) {
            drawConnectors(ctx, landmarks, FACEMESH_TESSELATION);
            drawConnectors(ctx, landmarks, FACEMESH_CONTOURS, { lineWidth: 1.2 });
          }
        }
      });
    });
    await state.faceMesh.send({ image: el.inputVideo });
    return;
  }

  drawFrame(el.inputVideo);
}

async function startCamera() {
  if (state.camera) return;

  await setupVisionEngines();

  state.camera = new Camera(el.inputVideo, {
    onFrame: processVision,
    width: 640,
    height: 480,
  });

  state.camera.start();
  el.visionStatus.value = 'Cámara activa';
  await addHistory('camera', 'Cámara iniciada');
  await refreshData();
}

async function stopCamera() {
  if (!state.camera) return;

  state.camera.stop();
  state.camera = null;
  el.visionStatus.value = 'Cámara detenida';
  await addHistory('camera', 'Cámara detenida');
  await refreshData();
}

async function captureImage() {
  if (!state.camera) {
    speak('Primero inicia la cámara');
    return;
  }
  const dataUrl = el.outputCanvas.toDataURL('image/png');
  await addCapture(dataUrl, state.mode);
  await addHistory('capture', `Captura guardada en modo ${state.mode}`);
  await refreshData();
  speak('Captura guardada');
}

function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  recognition.continuous = true;

  recognition.onresult = async (event) => {
    const phrase = event.results[event.results.length - 1][0].transcript.trim();
    el.recognizedText.value = phrase;
    await addHistory('voice', phrase);
    await handleVoiceCommand(phrase);
    await refreshData();
  };

  recognition.onstart = () => {
    state.listening = true;
    setAssistantState('Asistente escuchando...');
  };

  recognition.onend = () => {
    state.listening = false;
    setAssistantState('Asistente inactivo');
  };

  recognition.onerror = async (e) => {
    await addHistory('error', `Speech error: ${e.error}`);
    await refreshData();
  };

  return recognition;
}

async function handleVoiceCommand(rawText) {
  const text = rawText.toLowerCase();

  if (text.includes('modo manos')) {
    setMode('hands');
    speak('Modo manos activado');
    return;
  }
  if (text.includes('modo cara')) {
    setMode('face');
    speak('Modo cara activado');
    return;
  }
  if (text.includes('modo normal')) {
    setMode('none');
    speak('Modo normal activado');
    return;
  }
  if (text.includes('iniciar cámara') || text.includes('iniciar camara')) {
    await startCamera();
    speak('Cámara iniciada');
    return;
  }
  if (text.includes('detener cámara') || text.includes('detener camara')) {
    await stopCamera();
    speak('Cámara detenida');
    return;
  }
  if (text.includes('capturar')) {
    await captureImage();
    return;
  }
  if (text.startsWith('guardar nota')) {
    const note = rawText.replace(/guardar nota/i, '').trim();
    if (note) {
      await addNote(note);
      await addHistory('note', `Nota guardada: ${note}`);
      await refreshData();
      speak('Nota guardada');
    }
    return;
  }
  if (text.includes('leer notas')) {
    const notes = await getAll(STORES.notes);
    if (!notes.length) {
      speak('No hay notas guardadas');
      return;
    }
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

el.listenBtn.addEventListener('click', () => {
  if (!state.recognition) {
    alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
    return;
  }
  state.recognition.start();
});

el.stopListenBtn.addEventListener('click', () => {
  if (state.recognition && state.listening) {
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

el.stopSpeakBtn.addEventListener('click', () => {
  speechSynthesis.cancel();
});

el.startCamBtn.addEventListener('click', async () => {
  await startCamera();
});

el.stopCamBtn.addEventListener('click', async () => {
  await stopCamera();
});

el.modeSelect.addEventListener('change', () => {
  setMode(el.modeSelect.value);
});

el.reloadDataBtn.addEventListener('click', refreshData);

el.clearHistoryBtn.addEventListener('click', async () => {
  const ok = confirm('¿Vaciar historial de eventos?');
  if (!ok) return;
  await clearStore(STORES.history);
  await refreshData();
});

async function init() {
  state.recognition = createRecognition();
  setMode('none');
  await refreshData();
}

init().catch(console.error);
