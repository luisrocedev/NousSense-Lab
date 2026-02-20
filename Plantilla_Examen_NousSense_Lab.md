# NousSense-Lab — Plantilla de Examen

**Alumno:** Luis Rodríguez Cedeño · **DNI:** 53945291X  
**Módulo:** Desarrollo de Interfaces · **Curso:** DAM2 2025/26

---

## 1. Introducción

- **Qué es:** Laboratorio de voz + cámara con Web Speech API, MediaPipe (manos/cara) y Canvas
- **Contexto:** Módulo de Desarrollo de Interfaces — APIs del navegador, reconocimiento de voz, visión con IA, visualización Canvas
- **Objetivos principales:**
  - Reconocimiento de voz con SpeechRecognition API (comandos, dictado)
  - Síntesis de voz (text-to-speech) con SpeechSynthesis API
  - Cámara con MediaPipe Hands y FaceMesh (detección en tiempo real)
  - Waveform de audio en Canvas 2D
  - IndexedDB para historial, notas y capturas
- **Tecnologías clave:**
  - JavaScript vanilla, Web Speech API (reconocimiento + síntesis)
  - MediaPipe Hands + FaceMesh (CDN), Canvas 2D (waveform + overlays)
  - MediaDevices API (`getUserMedia`), IndexedDB, AudioContext + AnalyserNode
- **Arquitectura:** `index.html` (SPA con tabs: Voice, Camera, Data) → `assets/app.js` (613 líneas, toda la lógica) → `assets/styles.css` (dark mode, glassmorphism)

---

## 2. Desarrollo de las partes

### 2.1 Reconocimiento de voz — SpeechRecognition API

- `webkitSpeechRecognition` → reconocimiento continuo en español
- Eventos: `onresult` (transcripción), `onend` (auto-restart si escuchando)
- Barra de confianza: muestra el confidence score del resultado

```javascript
function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    const confidence = result[0].confidence;

    el.recognizedText.textContent = transcript;
    updateConfidenceBar(confidence);

    if (result.isFinal) {
      addHistory("voice", transcript);
      processVoiceCommand(transcript);
    }
  };

  recognition.onend = () => {
    if (state.listening && !state.stoppingRecognition) {
      recognition.start(); // Auto-restart
    }
  };

  return recognition;
}
```

> **Explicación:** `SpeechRecognition` con `continuous=true` escucha sin parar. `interimResults` muestra texto parcial. Cuando `isFinal=true`, se procesa el comando y se guarda en historial. Si se detiene inesperadamente, se reinicia automáticamente.

### 2.2 Síntesis de voz — SpeechSynthesis API

- `speechSynthesis.speak()` → lee texto en voz alta
- `SpeechSynthesisUtterance` → configura voz, velocidad, tono
- Control: play, stop, selección de voz

```javascript
function speakText(text) {
  if (!text.trim()) return;

  speechSynthesis.cancel(); // Detener anterior
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onstart = () => setAssistantState("Hablando...", "badge-speaking");
  utterance.onend = () => setAssistantState("Listo", "badge-idle");

  speechSynthesis.speak(utterance);
  addHistory("tts", text);
}
```

> **Explicación:** Se crea un `SpeechSynthesisUtterance` con el texto, idioma y parámetros. `speechSynthesis.speak()` lo reproduce. Se cancela cualquier lectura anterior antes de iniciar. Se registra en el historial como tipo 'tts'.

### 2.3 Cámara con MediaPipe — Detección de manos y cara

- `navigator.mediaDevices.getUserMedia()` → accede a la cámara
- MediaPipe Hands: detecta 21 landmarks por mano
- MediaPipe FaceMesh: detecta 468 puntos faciales
- Canvas overlay: dibuja puntos y conexiones sobre el video

```javascript
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
  });
  el.inputVideo.srcObject = stream;
  state.camera = stream;

  const mode = el.modeSelect.value; // 'hands' | 'face' | 'none'
  if (mode === "hands") {
    state.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    state.hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.7 });
    state.hands.onResults(drawHandResults);
  } else if (mode === "face") {
    state.faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    state.faceMesh.setOptions({ maxNumFaces: 1, minDetectionConfidence: 0.7 });
    state.faceMesh.onResults(drawFaceResults);
  }
}
```

> **Explicación:** `getUserMedia` solicita acceso a la cámara. Según el modo (hands/face), se inicializa el modelo MediaPipe correspondiente desde CDN. `onResults` dibuja los landmarks detectados en el Canvas overlay.

### 2.4 Waveform — Visualización de audio en Canvas

- `AudioContext` + `AnalyserNode` → obtiene datos de frecuencia del micrófono
- `requestAnimationFrame` → dibuja la forma de onda continuamente
- Canvas 2D: líneas que representan la amplitud

```javascript
function startWaveform() {
  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 2048;

  const source = state.audioCtx.createMediaStreamSource(state.micStream);
  source.connect(state.analyser);

  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    state.waveAnimId = requestAnimationFrame(draw);
    state.analyser.getByteTimeDomainData(dataArray);

    const ctx = el.waveformCanvas.getContext("2d");
    const w = el.waveformCanvas.width,
      h = el.waveformCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  }
  draw();
}
```

> **Explicación:** `AnalyserNode` captura datos de audio del micrófono en tiempo real. `getByteTimeDomainData` llena un array con amplitudes (0-255). Se dibujan como una línea continua en el Canvas, actualizándose 60 veces/segundo con `requestAnimationFrame`.

### 2.5 IndexedDB — 3 stores para historial, notas y capturas

- 3 objectStores: `history`, `notes`, `captures`
- Funciones helper: `addHistory()`, `addNote()`, `addCapture()`, `getAll()`, `clearStore()`
- Las capturas almacenan dataURL (imagen Base64 de la cámara)

```javascript
const STORES = { history: "history", notes: "notes", captures: "captures" };

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, {
            keyPath: "id",
            autoIncrement: true,
          });
          s.createIndex("createdAt", "createdAt", { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

const addCapture = (dataUrl, mode) =>
  dbAction(STORES.captures, "readwrite", (s) =>
    s.add({ image: dataUrl, mode, createdAt: new Date().toISOString() }),
  );
```

> **Explicación:** La BD tiene 3 stores independientes. `captures` guarda la imagen como dataURL (captura del Canvas). Cada registro incluye timestamp ISO para ordenar cronológicamente.

---

## 3. Presentación del proyecto

- **Flujo:** Abrir index.html → Tab Voz: dictar comando → Tab Cámara: activar hands/face → Tab Datos: ver historial/notas/capturas
- **Puntos fuertes:** 3 APIs web avanzadas (Speech, MediaPipe, Canvas), waveform en tiempo real, FPS overlay
- **Demo:** Live Server → hablar "nueva nota esto es una prueba" → activar cámara con manos → capturar
- **KPIs en vivo:** Eventos voice, notas guardadas, capturas, total eventos

---

## 4. Conclusión

- **Competencias:** Web Speech API, MediaPipe (IA en navegador), Canvas 2D, IndexedDB, AudioContext
- **Accesibilidad:** Interacción por voz, síntesis de voz para feedback auditivo
- **Multimodal:** Combina entrada de voz + visión por cámara + texto manual
- **Sin backend:** Todo se ejecuta en el navegador (IndexedDB, APIs client-side, MediaPipe CDN)
- **Valoración:** Demuestra interfaces avanzadas con APIs modernas del navegador e IA client-side
