# NousSense Lab

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/ES2022-F7DF1E?logo=javascript&logoColor=black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0097A7?logo=google&logoColor=white)
![IndexedDB](https://img.shields.io/badge/IndexedDB-4285F4?logo=googlechrome&logoColor=white)
![Web Audio](https://img.shields.io/badge/Web_Audio-FF6F61?logo=audio&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**Interfaz natural** que combina reconocimiento de voz, síntesis de habla y visión por cámara con detección de manos y cara en tiempo real. Cero backend — todo corre en el navegador.

---

## Características principales

| Módulo | Descripción |
|--------|-------------|
| **Voz → Texto** | Reconocimiento continuo en español con `SpeechRecognition` y barra de confianza coloreada. |
| **Texto → Voz** | Síntesis de habla con `speechSynthesis` para respuestas del asistente. |
| **Waveform en tiempo real** | Visualización de la onda de audio del micrófono con Web Audio API. |
| **Cámara + MediaPipe** | Detección de manos (21 landmarks) y cara (468+ puntos) sobre canvas con overlay LIVE y FPS. |
| **Comandos naturales** | 10 comandos de voz: cambio de modo, cámara, captura, notas, lectura, borrado. |
| **Persistencia IndexedDB** | Historial, notas y capturas persistentes entre sesiones con conexión singleton. |
| **Sistema de pestañas** | Tres tabs: Principal, Historial y Referencia de comandos. |
| **KPI en tiempo real** | 4 métricas: transcripciones, síntesis, capturas y notas. |
| **Dark mode dual** | Toggle manual con `localStorage` + detección automática OS (`prefers-color-scheme`). |
| **Toasts** | Notificaciones temporales con 4 tonos: éxito, error, info, aviso. |
| **Diálogo de confirmación** | Reemplazo de `window.confirm()` por modal HTML/CSS accesible. |
| **Exportación JSON** | Descarga de notas como archivo `.json`. |

## Comandos de voz

| Comando | Acción |
|---------|--------|
| `modo manos` | Activa detección de manos. |
| `modo cara` | Activa detección facial. |
| `modo normal` | Desactiva detección, vista directa de cámara. |
| `iniciar cámara` | Enciende la cámara y el canvas. |
| `detener cámara` / `parar cámara` | Apaga la cámara y libera recursos. |
| `capturar` | Guarda snapshot del canvas en IndexedDB. |
| `guardar nota ...` | Guarda una nota de texto dictada. |
| `leer notas` | Lee en voz alta la última nota guardada. |
| `eliminar notas` | Borra todas las notas (con diálogo de confirmación). |

## Arquitectura

```
NousSense-Lab/
├── index.html              ← SPA con tabs, KPIs, toasts, confirm dialog
├── assets/
│   ├── app.js              ← Lógica: voz, cámara, DB, waveform, UI
│   └── styles.css           ← UI v2: dark mode dual, animaciones, responsive
└── README.md
```

### Flujo de datos

```
Micrófono ──▶ SpeechRecognition ──▶ handleVoiceCommand()
     │                                    │
     ▼                  ┌─────────────────┤
 Web Audio API          ▼                 ▼
 (waveform)       setMode()/speak()  addNote()/addCapture()
                                          │
                                    IndexedDB
                                    (history / notes / captures)

Cámara ──▶ MediaPipe Camera ──▶ processVision()
                                      │
                        ┌─────────────┤
                        ▼             ▼
                   Hands.send()   FaceMesh.send()
                        │             │
                        ▼             ▼
                    onResults ──▶ drawFrame(canvas) + FPS counter
```

## Mejoras v2

- **Tabs** — navegación por pestañas (Principal / Historial / Comandos).
- **Waveform** — forma de onda del audio del micrófono en tiempo real.
- **Confianza** — barra coloreada (verde/ámbar/rojo) por cada resultado de voz.
- **FPS overlay** — indicador LIVE + modo + FPS sobre el canvas de cámara.
- **Placeholder** — estado visual cuando la cámara no está activa.
- **KPI bar** — 4 métricas numéricas actualizadas en tiempo real.
- **Badge 4 estados** — idle / listening / speaking / error con colores y animación.
- **Dark mode toggle** — `localStorage` + botón 🌓 + prefers-color-scheme.
- **Toasts** — notificaciones con 4 tonos (success, error, info, warning).
- **Confirm dialog** — modal personalizado en lugar de `window.confirm()`.
- **Captura rápida** — botón junto al canvas sin necesidad de voz.
- **Exportar notas** — descarga en formato JSON.
- **Tags coloreados** — etiquetas por tipo en historial (Voz, Comando, Síntesis, Nota, Captura).
- **CSS mejorado** — animaciones (fadeIn, slideUp, pulse), responsive 980px / 600px.

## Tecnologías

- **Web Speech API** — reconocimiento y síntesis de voz nativos del navegador.
- **Web Audio API** — `AnalyserNode` para visualización de forma de onda.
- **MediaPipe Hands** — detección de 21 landmarks por mano.
- **MediaPipe Face Mesh** — malla de 468+ puntos faciales con teselación.
- **MediaPipe Camera Utils** — bucle optimizado de captura de vídeo.
- **IndexedDB** — almacenamiento local NoSQL con stores tipados.
- **CSS Custom Properties** — tematización dual (toggle + OS detection).

## Puesta en marcha

```bash
# No requiere instalación ni servidor — abrir directamente:
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

> **Requisito:** Chrome 90+ o Edge 90+ (SpeechRecognition + MediaPipe).
> Conceder permisos de micrófono y cámara cuando el navegador los solicite.

## Seguridad y buenas prácticas

- **XSS**: todo texto renderizado pasa por `escapeHtml()`.
- **Permisos**: solicita micrófono/cámara solo bajo acción del usuario.
- **Cleanup**: `stopCamera()` libera tracks de vídeo, cierra audio context y limpia canvas.
- **Reconexión**: reconocimiento de voz se reinicia automáticamente ante desconexiones.
- **Singleton DB**: conexión IndexedDB cacheada para evitar aperturas repetidas.
- **Feature detection**: comprueba `SpeechRecognition`, `Camera`, `Hands`, `FaceMesh`.

## Desarrollado

Luis Rodriguez
