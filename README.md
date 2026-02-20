# NousSense Lab

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/ES2022-F7DF1E?logo=javascript&logoColor=black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0097A7?logo=google&logoColor=white)
![IndexedDB](https://img.shields.io/badge/IndexedDB-4285F4?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**Interfaz natural** que combina reconocimiento de voz, síntesis de habla y visión por cámara con detección de manos y cara en tiempo real. Cero backend — todo corre en el navegador.

---

## Características principales

| Módulo | Descripción |
|--------|-------------|
| **Voz → Texto** | Reconocimiento continuo en español con `SpeechRecognition` / `webkitSpeechRecognition`. |
| **Texto → Voz** | Síntesis de habla con `speechSynthesis` para respuestas del asistente. |
| **Cámara + MediaPipe Hands** | Detección de landmarks de manos en tiempo real sobre canvas. |
| **Cámara + MediaPipe Face Mesh** | Malla facial con teselación y contornos dibujados en canvas. |
| **Comandos naturales** | Control por voz: cambio de modo, cámara, captura, notas, lectura, borrado. |
| **Persistencia IndexedDB** | Historial de eventos, notas dictadas y capturas de cámara persistentes entre sesiones. |
| **Dark mode** | Soporte automático vía `prefers-color-scheme`. |

## Comandos de voz

| Comando | Acción |
|---------|--------|
| `modo manos` | Activa detección de manos. |
| `modo cara` | Activa detección facial. |
| `modo normal` | Desactiva detección, vista directa de cámara. |
| `iniciar cámara` | Enciende la cámara y el canvas. |
| `detener cámara` | Apaga la cámara y libera recursos. |
| `capturar` | Guarda snapshot del canvas en IndexedDB. |
| `guardar nota ...` | Guarda una nota de texto dictada. |
| `leer notas` | Lee en voz alta la última nota guardada. |
| `eliminar notas` | Borra todas las notas de la base de datos. |

## Arquitectura

```
NousSense-Lab/
├── index.html              ← SPA principal
├── assets/
│   ├── app.js              ← Lógica: voz, cámara, IndexedDB, comandos
│   └── styles.css           ← UI Notion-style + dark mode
└── README.md
```

### Flujo de datos

```
Micrófono ──▶ SpeechRecognition ──▶ handleVoiceCommand()
                                          │
                    ┌─────────────────────┤
                    ▼                     ▼
             setMode()/speak()    addNote()/addCapture()
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
                    onResults ──▶ drawFrame(canvas)
```

## Tecnologías

- **Web Speech API** — reconocimiento y síntesis de voz nativos del navegador.
- **MediaPipe Hands** — detección de 21 landmarks por mano.
- **MediaPipe Face Mesh** — malla de 468+ puntos faciales con teselación.
- **MediaPipe Camera Utils** — bucle optimizado de captura de vídeo.
- **IndexedDB** — almacenamiento local NoSQL con stores tipados.
- **CSS Custom Properties + prefers-color-scheme** — tematización light/dark automática.

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
- **Cleanup**: `stopCamera()` libera tracks de vídeo y limpia canvas.
- **Reconexión**: reconocimiento de voz se reinicia automáticamente ante desconexiones inesperadas.
- **Singleton DB**: conexión IndexedDB cacheada para evitar aperturas repetidas.
- **Feature detection**: comprueba disponibilidad de `SpeechRecognition`, `Camera`, `Hands` y `FaceMesh` antes de usar.

## Licencia

MIT © 2025 Luis Roce
