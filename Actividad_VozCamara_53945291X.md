# Paso 4 · Actividad y entrega

**DNI:** 53945291X  
**Curso:** DAM2 - Desarrollo de interfaces  
**Lección:** `dam2526/Segundo/Desarrollo de interfaces/301-Actividades final de unidad - Segundo trimestre/002-Proyecto de reconocimiento de voz y camara`

## 1) Proyecto desarrollado

He desarrollado el software **NousSense Lab**, un proyecto de interfaz natural que combina voz, síntesis de habla y visión por cámara.

Ruta de entrega:

- `002-Proyecto de reconocimiento de voz y camara/noussense_lab/`

## 2) Pilar visual: modificaciones estéticas y UX

Se ha construido una interfaz moderna y amigable estilo Notion:

- Estructura por paneles para voz, cámara, notas e historial.
- Diseño claro con jerarquía visual, feedback de estado y controles accesibles.
- Canvas de cámara integrado con controles de modo de detección.
- Sección de capturas y timeline de eventos para seguimiento de uso.
- Dark mode automático vía `prefers-color-scheme` con variables CSS.
- Badge animado con pulso visual cuando el asistente escucha.
- Atributos ARIA en botones para accesibilidad.
- Transiciones CSS suaves en botones y badge.

```css
/* Variables CSS con dark mode automático */
:root {
  --bg: #f7f7f5;  --panel: #ffffff;  --text: #2f3437;
  --muted: #6b7280;  --border: #e8eaed;  --accent: #2f3437;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1b1e;  --panel: #25272b;  --text: #e4e5e7;
    --muted: #9ca3af;  --border: #3a3d42;  --accent: #e4e5e7;
  }
}
/* Animación de pulso al escuchar */
.badge.listening {
  background: #dcfce7;  border-color: #86efac;
  animation: pulse 1.5s ease-in-out infinite;
}
```

## 3) Pilar funcional: modificaciones de mucho calado

### 3.1 Voz y síntesis natural

- Integración de reconocimiento de voz en español (`es-ES`).
- Síntesis de voz para respuestas del asistente.
- Botones de escucha/habla y control de silencio.
- Reconexión automática si la escucha se interrumpe inesperadamente.

```javascript
// Reconocimiento con auto-restart ante desconexiones inesperadas
recognition.onend = () => {
  state.listening = false;
  if (!state.stoppingRecognition) {
    try { recognition.start(); } catch { /* ya iniciado */ }
    return;
  }
  state.stoppingRecognition = false;
  setAssistantState('Asistente inactivo');
  el.listenBtn.disabled = false;
};
```

### 3.2 Visión por cámara y análisis corporal

- Integración con MediaPipe Hands y Face Mesh.
- Detección seleccionable en tiempo real: modo normal, manos, cara.
- Renderizado sobre canvas de landmarks y conectores.
- Inicialización singleton: los motores MediaPipe se crean UNA sola vez.
- Callbacks `onResults` registrados una vez (no por frame).

```javascript
// Singleton de motores de visión con feature detection
async function setupVisionEngines() {
  if (state.visionReady) return;
  if (typeof Hands === 'undefined' || typeof FaceMesh === 'undefined') {
    console.warn('MediaPipe no disponible');
    return;
  }
  state.hands = new Hands({ locateFile: (f) => `.../${f}` });
  state.hands.setOptions({ maxNumHands: 2, modelComplexity: 0, ... });
  state.hands.onResults((results) => { drawFrame(results.image, ...); });
  // ... idem faceMesh ...
  state.visionReady = true;
}

// Procesamiento por frame — solo envía, no re-registra callbacks
async function processVision() {
  try {
    if (state.mode === 'hands' && state.hands) {
      await state.hands.send({ image: el.inputVideo });
      return;
    }
    if (state.mode === 'face' && state.faceMesh) {
      await state.faceMesh.send({ image: el.inputVideo });
      return;
    }
    drawFrame(el.inputVideo);
  } catch (err) {
    drawFrame(el.inputVideo);
  }
}
```

### 3.3 Comandos por lenguaje natural

La app interpreta comandos de voz y ejecuta acciones reales:

```javascript
async function handleVoiceCommand(rawText) {
  const text = rawText.toLowerCase();
  if (text.includes('modo manos'))   { setMode('hands'); speak('Modo manos activado'); return; }
  if (text.includes('modo cara'))    { setMode('face');  speak('Modo cara activado');  return; }
  if (text.includes('iniciar cámara')) { await startCamera(); speak('Cámara iniciada'); return; }
  if (text.includes('capturar'))     { await captureImage(); return; }
  if (text.startsWith('guardar nota')) {
    const note = rawText.replace(/guardar nota/i, '').trim();
    if (note) { await addNote(note); speak('Nota guardada'); }
    return;
  }
  // ... leer notas, eliminar notas ...
}
```

### 3.4 Base de datos (persistencia) con IndexedDB

Se implementa una capa de base de datos local con tres stores y conexión cacheada:

```javascript
// Conexión singleton — evita abrir/cerrar en cada operación
function openDb() {
  if (state.dbConnection) return Promise.resolve(state.dbConnection);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { /* crear stores: history, notes, captures */ };
    req.onsuccess = () => {
      state.dbConnection = req.result;
      state.dbConnection.onclose = () => { state.dbConnection = null; };
      resolve(state.dbConnection);
    };
  });
}
```

### 3.5 Seguridad y robustez

- **XSS**: función `escapeHtml()` protege todo texto renderizado, incluido `row.mode` en capturas.
- **Permisos**: cámara/micrófono solicitados solo bajo acción del usuario.
- **Cleanup**: `stopCamera()` libera tracks de vídeo (`srcObject.getTracks().stop()`) y limpia canvas.
- **Feature detection**: comprueba `SpeechRecognition`, `Camera`, `Hands`, `FaceMesh` antes de usar.
- **Error handling**: `startCamera()`, `processVision()` y `recognition.start()` protegidos con try/catch.

```javascript
// Limpieza completa de cámara
async function stopCamera() {
  if (!state.camera) return;
  state.camera.stop();
  state.camera = null;
  const tracks = el.inputVideo.srcObject?.getTracks();
  if (tracks) tracks.forEach((t) => t.stop());
  el.inputVideo.srcObject = null;
  const ctx = el.outputCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.outputCanvas.width, el.outputCanvas.height);
}
```

## 4) Relación con el workflow de clase

Se parte del workflow trabajado en clase:

- ejemplos de síntesis de voz,
- reconocimiento de voz,
- reconocimiento de manos/cara con MediaPipe.

Sobre esa base se construye una aplicación más completa, con integración unificada, persistencia en base de datos local, dark mode, accesibilidad y manejo robusto de errores.

## 5) Archivos principales

- `noussense_lab/index.html`
- `noussense_lab/assets/styles.css`
- `noussense_lab/assets/app.js`
- `noussense_lab/README.md`

## 6) Pruebas realizadas

- Escucha de voz y transcripción: ✅
- Reconexión automática de reconocimiento: ✅
- Síntesis de voz manual y automática: ✅
- Activación de cámara con try/catch: ✅
- Detección de manos y cara (callbacks singleton): ✅
- Captura y guardado de imagen: ✅
- Guardado/lectura/eliminación de notas por voz: ✅
- Persistencia en IndexedDB tras recarga (conexión cacheada): ✅
- Dark mode automático: ✅
- Feature detection (MediaPipe / SpeechRecognition): ✅

## 7) Conclusión

La actividad cumple los dos pilares exigidos:

1. **Pilar visual:** interfaz mejorada con dark mode, animaciones, ARIA y diseño responsive.
2. **Pilar funcional:** integración de tecnologías naturales + persistencia con IndexedDB + seguridad XSS + cleanup de recursos + reconnection de voz.

**Estado final:** ✅ Completado y listo para evaluación.
