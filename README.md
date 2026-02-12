# NousSense Lab

Proyecto de reconocimiento de voz y cámara para DAM2 (Desarrollo de interfaces).

## Funcionalidades

- Reconocimiento de voz (`SpeechRecognition` / `webkitSpeechRecognition`).
- Síntesis de voz (`speechSynthesis`) para respuestas habladas.
- Control de cámara con MediaPipe:
  - modo normal,
  - detección de manos,
  - detección de cara.
- Comandos de voz operativos (modo, cámara, capturas, notas).
- Persistencia con IndexedDB:
  - historial de eventos,
  - notas de voz,
  - capturas de cámara.

## Comandos de voz

- `modo manos`
- `modo cara`
- `modo normal`
- `iniciar cámara` / `detener cámara`
- `capturar`
- `guardar nota ...`
- `leer notas`
- `eliminar notas`

## Ejecutar

No necesita backend: abre `index.html` en navegador moderno (Chrome/Edge recomendado).

Permite permisos de micrófono y cámara cuando los pida el navegador.
