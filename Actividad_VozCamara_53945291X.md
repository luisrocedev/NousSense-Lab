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

## 3) Pilar funcional: modificaciones de mucho calado

### 3.1 Voz y síntesis natural

- Integración de reconocimiento de voz en español (`es-ES`).
- Síntesis de voz para respuestas del asistente.
- Botones de escucha/habla y control de silencio.

### 3.2 Visión por cámara y análisis corporal

- Integración con MediaPipe Hands y Face Mesh.
- Detección seleccionable en tiempo real:
  - modo normal,
  - manos,
  - cara.
- Renderizado sobre canvas de landmarks y conectores.

### 3.3 Comandos por lenguaje natural

La app interpreta comandos de voz y ejecuta acciones reales:

- cambio de modo de detección,
- arranque/parada de cámara,
- captura de imagen,
- guardado y lectura de notas,
- eliminación de notas.

### 3.4 Base de datos (persistencia) con IndexedDB

Se implementa una capa de base de datos local con tres stores:

- `history` → historial de voz/eventos/comandos,
- `notes` → notas dictadas,
- `captures` → imágenes capturadas desde cámara.

Esto añade persistencia real entre sesiones, con operaciones CRUD y recarga de datos.

## 4) Relación con el workflow de clase

Se parte del workflow trabajado en clase:

- ejemplos de síntesis de voz,
- reconocimiento de voz,
- reconocimiento de manos/cara con MediaPipe.

Sobre esa base se construye una aplicación más completa, con integración unificada y persistencia en base de datos local.

## 5) Archivos principales

- `noussense_lab/index.html`
- `noussense_lab/assets/styles.css`
- `noussense_lab/assets/app.js`
- `noussense_lab/README.md`

## 6) Pruebas realizadas

- Escucha de voz y transcripción: ✅
- Síntesis de voz manual y automática: ✅
- Activación de cámara: ✅
- Detección de manos y cara: ✅
- Captura y guardado de imagen: ✅
- Guardado/lectura/eliminación de notas por voz: ✅
- Persistencia en IndexedDB tras recarga: ✅

## 7) Conclusión

La actividad cumple los dos pilares exigidos:

1. **Pilar visual:** interfaz mejorada y amigable.
2. **Pilar funcional:** integración de tecnologías naturales + persistencia con base de datos local.

**Estado final:** ✅ Completado y listo para evaluación.
