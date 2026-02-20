# Sistema de Reconocimiento de Voz y Cámara — NousSense Lab

**DNI:** 53945291X  
**Curso:** DAM2 — Desarrollo de interfaces  
**Lección:** `dam2526/Segundo/Desarrollo de interfaces/301-Actividades final de unidad - Segundo trimestre/002-Proyecto de reconocimiento de voz y camara`

---

## Índice

1. [Introducción (25 %)](#1-introducción-25-)
2. [Desarrollo detallado (25 %)](#2-desarrollo-detallado-25-)
3. [Aplicación práctica (25 %)](#3-aplicación-práctica-25-)
4. [Conclusión (25 %)](#4-conclusión-25-)
5. [Anexo — Mejoras UI/UX aplicadas (v2)](#anexo--mejoras-uiux-aplicadas-v2)

---

## 1. Introducción (25 %)

### 1.1 Contexto del proyecto

NousSense Lab es una aplicación de interfaz natural que integra tres pilares tecnológicos en una SPA (Single-Page Application) ejecutada íntegramente en el navegador:

| Pilar         | Tecnología     | API / Librería                    |
| ------------- | -------------- | --------------------------------- |
| Voz — entrada | Web Speech API | `SpeechRecognition`               |
| Voz — salida  | Web Speech API | `SpeechSynthesis`                 |
| Visión        | MediaPipe      | Hands · Face Mesh · Camera Utils  |
| Persistencia  | IndexedDB      | API nativa del navegador          |
| Audio visual  | Web Audio API  | `AnalyserNode` para forma de onda |

La app funciona **sin backend** ni proceso de compilación: basta un servidor estático (o incluso `file://` en algunos navegadores) para ejecutarla.

### 1.2 Objetivos

1. Construir un sistema de reconocimiento de voz en español (`es-ES`) capaz de interpretar comandos de lenguaje natural para controlar la cámara, tomar notas y cambiar modos de detección.
2. Integrar la cámara del dispositivo con análisis en tiempo real mediante MediaPipe (manos y cara), renderizando landmarks sobre un canvas.
3. Persistir todo el estado (historial de voz, notas, capturas de imagen) en IndexedDB con conexión singleton.
4. Ofrecer una interfaz moderna, responsiva y accesible, con sistema de pestañas, dark mode, notificaciones toast, diálogos personalizados y métricas KPI.
5. Garantizar robustez: feature detection, protección XSS, cleanup de recursos y reconexión automática de voz.

### 1.3 Arquitectura general

```
index.html
├── assets/
│   ├── app.js        ← lógica completa (voz, cámara, DB, UI)
│   └── styles.css    ← diseño v2 con dark mode, tabs, toasts…
└── lib/              ← (CDN: MediaPipe Hands, Face Mesh, Camera Utils)
```

La aplicación sigue un patrón **module-closure** con un objeto `state` centralizado que mantiene todo el estado mutable y un objeto `el` que cachea las referencias DOM. No se utilizan frameworks externos; toda la UI se manipula con vanilla JavaScript.

### 1.4 Tecnologías y dependencias

| Recurso                 | Tipo   | Versión      |
| ----------------------- | ------ | ------------ |
| MediaPipe Hands         | CDN    | 0.4.x        |
| MediaPipe Face Mesh     | CDN    | 0.4.x        |
| MediaPipe Camera Utils  | CDN    | 0.3.x        |
| MediaPipe Drawing Utils | CDN    | 0.3.x        |
| Inter (tipografía)      | CDN    | Google Fonts |
| Web Speech API          | Nativa | —            |
| IndexedDB               | Nativa | —            |
| Web Audio API           | Nativa | —            |

---

## 2. Desarrollo detallado (25 %)

### 2.1 Gestión centralizada del estado

Todo el estado se mantiene en un único objeto `state` que actúa como _store_ ligero:

```javascript
const state = {
  listening: false,
  speaking: false,
  stoppingRecognition: false,
  camera: null,
  mode: "normal",
  hands: null,
  faceMesh: null,
  visionReady: false,
  dbConnection: null,
  muted: false,
  lastFrameTime: 0,
  fps: 0,
  audioCtx: null,
  analyser: null,
  waveSource: null,
  waveRaf: null,
};
```

Este patrón evita variables globales dispersas, facilita la depuración y permite que cualquier función consulte o mute el estado a través de un punto único.

### 2.2 Controlador de voz

El reconocimiento de voz se configura con la API nativa `SpeechRecognition`:

```javascript
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRec) {
  console.warn("SpeechRecognition no soportado");
}
const recognition = SpeechRec ? new SpeechRec() : null;
if (recognition) {
  recognition.lang = "es-ES";
  recognition.interimResults = false;
  recognition.continuous = true;
}
```

**Reconexión automática:** si el reconocimiento termina sin que el usuario lo haya detenido intencionalmente (flag `stoppingRecognition`), se reinicia automáticamente:

```javascript
recognition.onend = () => {
  state.listening = false;
  if (!state.stoppingRecognition) {
    try {
      recognition.start();
    } catch {
      /* ya iniciado */
    }
    return;
  }
  state.stoppingRecognition = false;
  setAssistantState("idle");
  el.listenBtn.disabled = false;
  stopWaveform();
  showToast("Escucha detenida", "info");
};
```

**Resultados y confianza:** cada resultado se procesa extrayendo el transcript y la confianza, que se muestra en una barra visual coloreada:

```javascript
recognition.onresult = async (e) => {
  const result = e.results[e.results.length - 1];
  if (!result.isFinal) return;
  const transcript = result[0].transcript.trim();
  const confidence = result[0].confidence;
  showConfidence(confidence);
  updateKpi("kpiVoice");
  await addHistory("voice", transcript);
  await handleVoiceCommand(transcript);
};
```

### 2.3 Síntesis de voz

```javascript
function speak(text) {
  if (state.muted || !text) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "es-ES";
  utt.onstart = () => {
    state.speaking = true;
    setAssistantState("speaking");
  };
  utt.onend = () => {
    state.speaking = false;
    setAssistantState(state.listening ? "listening" : "idle");
    updateKpi("kpiSynth");
  };
  speechSynthesis.speak(utt);
}
```

### 2.4 Motor de visión por cámara

#### 2.4.1 Inicialización singleton

Los motores MediaPipe se crean una sola vez mediante un flag `visionReady`:

```javascript
async function setupVisionEngines() {
  if (state.visionReady) return;
  if (typeof Hands === "undefined" || typeof FaceMesh === "undefined") {
    console.warn("MediaPipe no disponible");
    return;
  }
  state.hands = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  state.hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  state.hands.onResults((r) => drawFrame(r.image, r.multiHandLandmarks));

  state.faceMesh = new FaceMesh({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
  });
  state.faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  state.faceMesh.onResults((r) =>
    drawFrame(r.image, null, r.multiFaceLandmarks),
  );

  state.visionReady = true;
}
```

#### 2.4.2 Procesamiento por frame

El frame se envía al motor correspondiente según el modo activo. La función **no** re-registra callbacks; solo envía la imagen:

```javascript
async function processVision() {
  try {
    if (state.mode === "hands" && state.hands) {
      await state.hands.send({ image: el.inputVideo });
      return;
    }
    if (state.mode === "face" && state.faceMesh) {
      await state.faceMesh.send({ image: el.inputVideo });
      return;
    }
    drawFrame(el.inputVideo);
  } catch (err) {
    drawFrame(el.inputVideo);
  }
}
```

#### 2.4.3 Renderizado con FPS

```javascript
function drawFrame(image, handLandmarks, faceLandmarks) {
  const now = performance.now();
  if (state.lastFrameTime) {
    state.fps = Math.round(1000 / (now - state.lastFrameTime));
    if (el.fpsDisplay) el.fpsDisplay.textContent = state.fps + " FPS";
  }
  state.lastFrameTime = now;

  const ctx = el.outputCanvas.getContext("2d");
  el.outputCanvas.width = el.inputVideo.videoWidth || 640;
  el.outputCanvas.height = el.inputVideo.videoHeight || 480;
  ctx.drawImage(image, 0, 0, el.outputCanvas.width, el.outputCanvas.height);

  if (handLandmarks) {
    for (const lm of handLandmarks) {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 2,
      });
      drawLandmarks(ctx, lm, { color: "#FF0000", lineWidth: 1 });
    }
  }
  if (faceLandmarks) {
    for (const lm of faceLandmarks) {
      drawConnectors(ctx, lm, FACEMESH_TESSELATION, {
        color: "#C0C0C070",
        lineWidth: 1,
      });
    }
  }
}
```

### 2.5 Persistencia con IndexedDB

#### 2.5.1 Conexión singleton

```javascript
const DB_NAME = "NousSenseDB";
const DB_VERSION = 1;

function openDb() {
  if (state.dbConnection) return Promise.resolve(state.dbConnection);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("history"))
        db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("notes"))
        db.createObjectStore("notes", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("captures"))
        db.createObjectStore("captures", {
          keyPath: "id",
          autoIncrement: true,
        });
    };
    req.onsuccess = () => {
      state.dbConnection = req.result;
      state.dbConnection.onclose = () => {
        state.dbConnection = null;
      };
      resolve(state.dbConnection);
    };
  });
}
```

#### 2.5.2 Operación genérica sobre stores

```javascript
async function dbAction(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);
    tx.oncomplete = () => resolve(result.result ?? undefined);
    tx.onerror = () => reject(tx.error);
  });
}
```

### 2.6 Interpretación de comandos por voz

```javascript
async function handleVoiceCommand(rawText) {
  const text = rawText.toLowerCase();
  if (text.includes("modo manos")) {
    setMode("hands");
    speak("Modo manos activado");
    return;
  }
  if (text.includes("modo cara")) {
    setMode("face");
    speak("Modo cara activado");
    return;
  }
  if (text.includes("modo normal")) {
    setMode("normal");
    speak("Modo normal");
    return;
  }
  if (text.includes("iniciar cámara")) {
    await startCamera();
    speak("Cámara iniciada");
    return;
  }
  if (text.includes("detener cámara") || text.includes("parar cámara")) {
    await stopCamera();
    speak("Cámara detenida");
    return;
  }
  if (text.includes("capturar")) {
    await captureImage();
    return;
  }
  if (text.startsWith("guardar nota")) {
    const note = rawText.replace(/guardar nota/i, "").trim();
    if (note) {
      await addNote(note);
      speak("Nota guardada");
    }
    return;
  }
  if (text.includes("leer notas")) {
    await readNotes();
    return;
  }
  if (text.includes("eliminar notas")) {
    nousConfirm("¿Eliminar todas las notas?").then(async (ok) => {
      if (ok) {
        await clearStore("notes");
        renderNotes();
        speak("Notas eliminadas");
      }
    });
    return;
  }
}
```

### 2.7 Seguridad y robustez

| Medida                | Detalle                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| **XSS**               | `escapeHtml()` aplicada a todo texto renderizado (transcripts, notas, caption de capturas, modo) |
| **Feature detection** | Comprueba `SpeechRecognition`, `Camera`, `Hands`, `FaceMesh` antes de usarlos                    |
| **Cleanup de cámara** | `stopCamera()` para tracks, limpia srcObject y hace clearRect del canvas                         |
| **Reconexión de voz** | Auto-restart si la sesión termina inesperadamente (flag `stoppingRecognition`)                   |
| **Error handling**    | try/catch en `startCamera()`, `processVision()`, `recognition.start()`                           |
| **Permisos**          | Cámara y micrófono solo solicitados bajo acción explícita del usuario                            |

```javascript
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

async function stopCamera() {
  if (!state.camera) return;
  state.camera.stop();
  state.camera = null;
  const tracks = el.inputVideo.srcObject?.getTracks();
  if (tracks) tracks.forEach((t) => t.stop());
  el.inputVideo.srcObject = null;
  const ctx = el.outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, el.outputCanvas.width, el.outputCanvas.height);
  if (el.cameraPlaceholder) el.cameraPlaceholder.hidden = false;
  if (el.cameraOverlay) el.cameraOverlay.hidden = true;
  showToast("Cámara detenida", "info");
}
```

---

## 3. Aplicación práctica (25 %)

### 3.1 Flujo de uso principal

1. El usuario abre `index.html` en un navegador compatible (Chrome/Edge recomendados).
2. Pulsa **Escuchar** → el micrófono se activa, la barra de forma de onda cobra vida.
3. Dice un comando como _"iniciar cámara"_ → la cámara se enciende y muestra el feed en el canvas.
4. Dice _"modo manos"_ → MediaPipe Hands detecta y dibuja los landmarks de la mano.
5. Dice _"capturar"_ → se extrae un fotograma del canvas y se guarda en IndexedDB.
6. Dice _"guardar nota reunión a las 15h"_ → la nota se persiste y aparece en la lista.
7. Todo queda registrado en el historial con etiquetas de tipo coloreadas.

### 3.2 Comandos disponibles

| Comando                               | Acción                                                |
| ------------------------------------- | ----------------------------------------------------- |
| `"iniciar cámara"`                    | Activa la cámara y abre el feed                       |
| `"detener cámara"` / `"parar cámara"` | Detiene la cámara y limpia el canvas                  |
| `"modo manos"`                        | Activa la detección de manos                          |
| `"modo cara"`                         | Activa la detección facial                            |
| `"modo normal"`                       | Muestra el feed sin detección                         |
| `"capturar"`                          | Captura el frame actual como imagen                   |
| `"guardar nota ..."`                  | Guarda una nota con el texto tras la keyword          |
| `"leer notas"`                        | Lee en voz alta todas las notas almacenadas           |
| `"eliminar notas"`                    | Elimina todas las notas (con diálogo de confirmación) |

### 3.3 Estructura de datos en IndexedDB

```
NousSenseDB (v1)
├── history  { id, type, text, date }
├── notes    { id, text, date }
└── captures { id, data, mode, date }
```

Cada store usa auto-increment para la clave primaria `id`. Los registros incluyen siempre un campo `date` con ISO string para ordenación cronológica.

### 3.4 Pruebas realizadas

| Funcionalidad                                       | Resultado |
| --------------------------------------------------- | --------- |
| Escucha de voz y transcripción                      | ✅        |
| Reconexión automática de reconocimiento             | ✅        |
| Síntesis de voz manual y automática                 | ✅        |
| Barra de confianza en cada resultado                | ✅        |
| Forma de onda (waveform) en tiempo real             | ✅        |
| Activación de cámara con try/catch                  | ✅        |
| Detección de manos (callbacks singleton)            | ✅        |
| Detección facial (callbacks singleton)              | ✅        |
| Contador FPS en overlay de cámara                   | ✅        |
| Captura y guardado de imagen                        | ✅        |
| Botón de captura rápida                             | ✅        |
| Guardado/lectura/eliminación de notas por voz       | ✅        |
| Exportación de notas como JSON                      | ✅        |
| Persistencia en IndexedDB tras recarga              | ✅        |
| Dark mode toggle + prefers-color-scheme             | ✅        |
| Sistema de pestañas (main/historial/comandos)       | ✅        |
| KPI en tiempo real (voz, síntesis, capturas, notas) | ✅        |
| Toasts de notificación                              | ✅        |
| Diálogo de confirmación personalizado               | ✅        |
| Feature detection (MediaPipe / SpeechRecognition)   | ✅        |
| Responsive en móvil y escritorio                    | ✅        |

### 3.5 Archivos del proyecto

| Archivo             | Descripción                                                   |
| ------------------- | ------------------------------------------------------------- |
| `index.html`        | Shell HTML5 con estructura de tabs, KPIs, canvas, formularios |
| `assets/app.js`     | Toda la lógica: voz, cámara, DB, UI, waveform, toasts         |
| `assets/styles.css` | Diseño completo v2 con dark mode, animaciones, responsive     |
| `README.md`         | Documentación técnica del proyecto                            |

---

## 4. Conclusión (25 %)

### 4.1 Objetivos cumplidos

La actividad cumple los dos pilares exigidos y va más allá:

**Pilar visual — Interfaz mejorada:**

- Sistema de pestañas para organizar contenido (principal, historial, comandos).
- KPI bar con 4 métricas en tiempo real.
- Dark mode dual: toggle manual con persistencia y auto-detección OS.
- Toasts de notificación con 4 tonos (éxito, error, info, aviso).
- Diálogos de confirmación personalizados (no `window.confirm`).
- Barra de confianza coloreada según el nivel.
- Forma de onda en tiempo real del audio capturado.
- Overlay de cámara con indicador LIVE, modo activo y FPS.
- Placeholder de cámara cuando el feed no está activo.
- Tags coloreados por tipo en el historial.
- Diseño responsive con breakpoints para tablet y móvil.
- Animaciones CSS (fadeIn, slideUp, pulse) para feedback visual.
- Atributos ARIA en botones para accesibilidad.

**Pilar funcional — Modificaciones de mucho calado:**

- Reconocimiento de voz en español con reconexión automática.
- Síntesis de voz para respuestas del asistente.
- Interpretación de 10 comandos de lenguaje natural.
- Integración de MediaPipe Hands y Face Mesh con inicialización singleton.
- Callbacks de resultados registrados una sola vez (no por frame).
- Persistencia completa en IndexedDB con conexión singleton cacheada.
- Captura de imágenes del canvas con almacenamiento binario.
- Exportación de notas como fichero JSON descargable.
- Protección XSS en todo texto renderizado.
- Feature detection para todas las APIs externas.
- Cleanup completo de recursos (cámara, audio, canvas).

### 4.2 Relación con el workflow de clase

Se parte del workflow trabajado en clase:

- Ejemplos de síntesis de voz (Web Speech API).
- Reconocimiento de voz.
- Reconocimiento de manos y cara con MediaPipe.

Sobre esa base se construye una aplicación significativamente más completa: interfaz con tabs y KPIs, persistencia en base de datos, dark mode dual, notificaciones toast, diálogos personalizados, métricas de rendimiento, exportación de datos y manejo robusto de errores.

### 4.3 Valoración técnica

| Aspecto                         | Nivel |
| ------------------------------- | ----- |
| Complejidad de la interfaz      | ★★★★★ |
| Integración de APIs nativas     | ★★★★★ |
| Persistencia y gestión de datos | ★★★★☆ |
| Accesibilidad                   | ★★★★☆ |
| Rendimiento                     | ★★★★☆ |
| Seguridad (XSS, permisos)       | ★★★★★ |

**Estado final:** ✅ Completado y listo para evaluación.

---

## Anexo — Mejoras UI/UX aplicadas (v2)

A continuación se documentan las 14 mejoras de interfaz y experiencia de usuario implementadas en la versión 2 del proyecto.

---

### A.1 Sistema de pestañas (Tabs)

Se añade una navegación por pestañas que organiza el contenido en tres secciones: **Principal**, **Historial** y **Comandos**.

```html
<nav class="tabs" role="tablist">
  <button class="tab active" data-tab="main" role="tab" aria-selected="true">
    Principal
  </button>
  <button class="tab" data-tab="history" role="tab">Historial</button>
  <button class="tab" data-tab="commands" role="tab">Comandos</button>
</nav>
<div id="tab-main" class="tab-content active">...</div>
<div id="tab-history" class="tab-content">...</div>
<div id="tab-commands" class="tab-content">...</div>
```

```javascript
function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}
```

```css
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--border);
}
.tab {
  padding: 10px 18px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: -2px;
}
.tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.tab-content {
  display: none;
}
.tab-content.active {
  display: block;
  animation: fadeIn 0.25s ease;
}
```

---

### A.2 Visualización de forma de onda de audio (Waveform)

Se muestra un canvas que renderiza la onda de audio del micrófono en tiempo real usando la Web Audio API:

```javascript
function startWaveform(stream) {
  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 2048;
  state.waveSource = state.audioCtx.createMediaStreamSource(stream);
  state.waveSource.connect(state.analyser);
  drawWaveform();
}

function drawWaveform() {
  if (!state.analyser) return;
  const canvas = el.waveformCanvas;
  const ctx = canvas.getContext("2d");
  const bufferLength = state.analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);
  (function loop() {
    state.waveRaf = requestAnimationFrame(loop);
    state.analyser.getByteTimeDomainData(data);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--bg");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue(
      "--accent",
    );
    ctx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = data[i] / 128.0;
      const y = (v * canvas.height) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  })();
}

function stopWaveform() {
  if (state.waveRaf) cancelAnimationFrame(state.waveRaf);
  if (state.waveSource) state.waveSource.disconnect();
  if (state.audioCtx) state.audioCtx.close();
  state.waveRaf = state.analyser = state.waveSource = state.audioCtx = null;
}
```

```css
#waveformCanvas {
  width: 100%;
  height: 60px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
```

---

### A.3 Indicador de confianza del reconocimiento

Tras cada resultado de voz se muestra una barra de confianza con código de color:

```javascript
function showConfidence(value) {
  const pct = Math.round(value * 100);
  const fill = el.confidenceFill;
  const label = el.confidenceLabel;
  if (!fill || !label) return;
  fill.style.width = pct + "%";
  fill.className =
    "confidence-fill " +
    (pct >= 80 ? "conf-green" : pct >= 50 ? "conf-amber" : "conf-red");
  label.textContent = pct + "%";
}
```

```css
.confidence-bar {
  position: relative;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg);
}
.confidence-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.3s ease;
}
.conf-green {
  background: var(--green);
}
.conf-amber {
  background: var(--amber);
}
.conf-red {
  background: var(--red);
}
```

---

### A.4 Contador de FPS en cámara

El renderizado del canvas mide el tiempo entre frames y muestra los FPS en un overlay:

```javascript
function drawFrame(image, handLandmarks, faceLandmarks) {
  const now = performance.now();
  if (state.lastFrameTime) {
    state.fps = Math.round(1000 / (now - state.lastFrameTime));
    if (el.fpsDisplay) el.fpsDisplay.textContent = state.fps + " FPS";
  }
  state.lastFrameTime = now;
  // ... renderizado del canvas ...
}
```

```css
.camera-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
  z-index: 3;
  pointer-events: none;
}
```

---

### A.5 Placeholder de cámara

Cuando la cámara no está activa, se muestra un mensaje centrado en el contenedor:

```html
<div class="camera-wrapper">
  <div class="camera-placeholder" id="cameraPlaceholder">
    📷 Cámara no iniciada
  </div>
  <div class="camera-overlay" id="cameraOverlay" hidden>
    <span><span class="live-dot">●</span> LIVE</span>
    <span id="modeDisplay">normal</span>
    <span id="fpsDisplay">-- FPS</span>
  </div>
  <canvas id="outputCanvas"></canvas>
</div>
```

```css
.camera-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #94a3b8;
  background: #0f172a;
  z-index: 2;
}
.camera-placeholder[hidden] {
  display: none;
}
```

---

### A.6 Barra de KPIs

Cuatro indicadores numéricos que se actualizan en tiempo real:

```html
<section class="kpi-bar">
  <div class="kpi kpi-blue"><span id="kpiVoice">0</span>Transcripciones</div>
  <div class="kpi kpi-green"><span id="kpiSynth">0</span>Síntesis</div>
  <div class="kpi kpi-amber"><span id="kpiCap">0</span>Capturas</div>
  <div class="kpi kpi-red"><span id="kpiNotes">0</span>Notas</div>
</section>
```

```javascript
function updateKpi(id) {
  const span = document.getElementById(id);
  if (span) span.textContent = parseInt(span.textContent || "0") + 1;
}

// Se invoca en: recognition.onresult → updateKpi('kpiVoice')
//               speak() → updateKpi('kpiSynth')
//               captureImage() → updateKpi('kpiCap')
//               addNote() → updateKpi('kpiNotes')
```

---

### A.7 Estados del badge mejorados

El badge del asistente refleja 4 estados distintos con colores y animación:

```javascript
function setAssistantState(mode) {
  const badge = el.badge;
  if (!badge) return;
  badge.className = "badge badge-" + mode;
  const labels = {
    idle: "⏸ Inactivo",
    listening: "🎙 Escuchando…",
    speaking: "🔊 Hablando…",
    error: "⚠ Error",
  };
  badge.innerHTML = '<span class="badge-dot"></span> ' + (labels[mode] || mode);
}
```

```css
.badge-idle .badge-dot {
  background: var(--muted);
}
.badge-listening {
  background: #dbeafe;
  border-color: var(--blue);
}
.badge-listening .badge-dot {
  background: var(--blue);
  animation: pulse 1.5s infinite;
}
.badge-speaking {
  background: #dcfce7;
  border-color: var(--green);
}
.badge-speaking .badge-dot {
  background: var(--green);
}
.badge-error {
  background: #fef2f2;
  border-color: var(--red);
}
.badge-error .badge-dot {
  background: var(--red);
}
```

---

### A.8 Dark mode con toggle manual

Además de la media query automática, se añade un botón de toggle que persiste la preferencia en `localStorage`:

```javascript
function initDarkMode() {
  const saved = localStorage.getItem("nous-dark");
  if (saved === "true") document.body.classList.add("dark");
  if (saved === "false") document.body.classList.remove("dark");
  el.darkModeBtn?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("nous-dark", document.body.classList.contains("dark"));
    showToast(
      document.body.classList.contains("dark")
        ? "Modo oscuro activado"
        : "Modo claro activado",
      "info",
    );
  });
}
```

```css
body.dark {
  --bg: #1a1b1e;
  --panel: #25272b;
  --text: #e4e5e7;
  --muted: #9ca3af;
  --border: #3a3d42;
  --border-strong: #4b4f56;
  --accent: #e4e5e7;
}
```

---

### A.9 Sistema de notificaciones toast

Permite mostrar mensajes temporales con 4 tonos semánticos:

```javascript
function showToast(msg, tone = "info") {
  const icons = { success: "✓", error: "✗", info: "ℹ", warning: "⚠" };
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const div = document.createElement("div");
  div.className = "toast toast-" + tone;
  div.innerHTML =
    '<span class="toast-icon">' +
    (icons[tone] || "") +
    "</span> " +
    escapeHtml(msg);
  container.appendChild(div);
  setTimeout(() => {
    div.classList.add("fadeOut");
    div.addEventListener("animationend", () => div.remove());
  }, 3000);
}
```

```css
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 500;
  color: #fff;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.toast-success {
  background: #16a34a;
}
.toast-error {
  background: #dc2626;
}
.toast-info {
  background: #2563eb;
}
.toast-warning {
  background: #d97706;
}
.toast.fadeOut {
  animation: fadeOut 0.4s ease forwards;
}
```

---

### A.10 Diálogos de confirmación personalizados

Se reemplaza `window.confirm()` por un diálogo HTML/CSS con promesa:

```javascript
function nousConfirm(message) {
  return new Promise((resolve) => {
    const overlay = el.confirmOverlay;
    const msgEl = document.getElementById("confirmMsg");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");
    if (!overlay || !msgEl) {
      resolve(confirm(message));
      return;
    }
    msgEl.textContent = message;
    overlay.hidden = false;
    const close = (val) => {
      overlay.hidden = true;
      resolve(val);
    };
    yesBtn.onclick = () => close(true);
    noBtn.onclick = () => close(false);
  });
}
```

```html
<div class="confirm-overlay" id="confirmOverlay" hidden>
  <div class="confirm-dialog">
    <h3>Confirmación</h3>
    <p id="confirmMsg"></p>
    <div class="actions">
      <button id="confirmNo" class="secondary">Cancelar</button>
      <button id="confirmYes">Confirmar</button>
    </div>
  </div>
</div>
```

---

### A.11 Botón de captura rápida

Se añade un botón junto a la cámara para capturar sin usar la voz:

```html
<button id="captureBtn" aria-label="Captura rápida">📸 Captura rápida</button>
```

```javascript
el.captureBtn?.addEventListener("click", () => captureImage());
```

---

### A.12 Exportación de notas como JSON

Permite descargar todas las notas almacenadas en un archivo `.json`:

```javascript
async function exportNotes() {
  const db = await openDb();
  const tx = db.transaction("notes", "readonly");
  const store = tx.objectStore("notes");
  const req = store.getAll();
  req.onsuccess = () => {
    const blob = new Blob([JSON.stringify(req.result, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "noussense-notas.json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Notas exportadas", "success");
  };
}
```

---

### A.13 Etiquetas coloreadas en el historial

Cada tipo de entrada se muestra con un tag de color distinto:

```javascript
function kindTag(type) {
  const map = {
    voice: ["Voz", "blue"],
    command: ["Comando", "green"],
    synthesis: ["Síntesis", "amber"],
    note: ["Nota", "purple"],
    capture: ["Captura", "red"],
  };
  const [label, color] = map[type] || [type, "gray"];
  return '<span class="tag tag-' + color + '">' + escapeHtml(label) + "</span>";
}
```

```css
.tag {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
}
.tag-blue {
  background: #dbeafe;
  color: #1d4ed8;
}
.tag-green {
  background: #dcfce7;
  color: #15803d;
}
.tag-amber {
  background: #fef3c7;
  color: #92400e;
}
.tag-purple {
  background: #ede9fe;
  color: #6d28d9;
}
.tag-red {
  background: #fef2f2;
  color: #b91c1c;
}
```

---

### A.14 Mejoras CSS generales

- **Animaciones suaves:** `fadeIn`, `slideUp`, `fadeOut` para transiciones de contenido.
- **Botones con transformación:** `button:active { transform: scale(.97); }` para feedback táctil.
- **Hover en capturas:** `box-shadow` progresivo al pasar el ratón.
- **`noscript`** y etiqueta `<meta>` para viewport.
- **Variables CSS** centralizadas con `body.dark` y media query para doble soporte.
- **Responsive:** breakpoints a 980px (tablet) y 600px (móvil) ajustan grids y layouts.

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
  }
}
```

---

_Documento generado para la actividad de Desarrollo de Interfaces — DAM2 2025/26._
