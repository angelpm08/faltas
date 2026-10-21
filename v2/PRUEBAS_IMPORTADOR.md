# ControlFaltas 2.0 — Importación de horarios (rama de pruebas)

## Problemas detectados
1. El importador antiguo leía `result.data.words` del OCR de Tesseract sin contemplar la salida en bloques/TSV. Según la versión, esto devolvía ninguna palabra y fallaba incluso con imágenes nítidas.
2. Solo detectaba días en castellano y no las cabeceras de GestIB en catalán (`Dilluns`, `Dimarts`, `Dimecres`, `Dijous`, `Divendres`).
3. Agrupaba las palabras por su altura, no por la fila de horas real; podía confundir líneas de profesores, rangos horarios, recreos y asignaturas.
4. Si no encontraba las horas, inventaba franjas desde las 08:00, lo que podía producir horarios incorrectos.

## Solución en desarrollo
- Motor independiente `schedule-import.js`: columna/día, franja horaria y celdas basados en geometría del documento.
- `schedule-file-reader.js`: lectura de PDF con texto real antes del OCR, OCR de PDF escaneado, imagen y tablas DOCX, con salida Tesseract `blocks` o TSV.
- Soporte para encabezados de castellano, catalán e inglés.
- Para un archivo ambiguo no se generan horas ficticias: obliga a completar fechas y horas en vista de revisión.
- Permite añadir/eliminar filas, informa sobre resultados, detecta solapamientos y conserva los ID de clases sin cambios.
- Carga de librerías OCR bajo demanda (requiere internet la primera vez). El archivo se procesa localmente en el navegador.
- La actualización aún NO se ha fusionado en `main`, mientras falta comprobar el archivo GestIB concreto del usuario.

## Pruebas técnicas ejecutadas (2026-10-21)
- 15 celdas: tabla de mañana con días catalanes — 15/15 detectadas.
- 14 celdas: tabla de tarde con encabezados castellanos y un hueco — 14/14 detectadas.
- 10 celdas: tabla sin horas — 10/10 detectadas y 0 horas inventadas.
- 30 celdas: tabla con asignaturas multilínea y horarios de tarde — 30/30 y 30 rangos horarios.
- 20 celdas: PDF de horario de prueba convertido a PNG y leído por Tesseract en catalán+castellano+inglés; salida OCR con 63 palabras; motor recuperó 20/20 clases y sus horas.
- Integración de vista previa de importación y selección de archivo simulada con motor OCR — 20 filas visibles y resultado correcto.
- Lectura simulada de Tesseract en formato `blocks`/TSV — comprobada.

### Pendiente antes de publicación
- Archivo oficial real de GestIB (anonimizado si contiene datos personales) para probar la distribución exacta de sus columnas, PDF con texto y fotografía.
- Pruebas de instalación y selección de archivos desde navegador iOS/Android real.
- Tras verificar el archivo real, revisar los cambios y fusionar esta rama a `main`.

Las pruebas simuladas no garantizan que cualquier archivo de GestIB se interprete correctamente.
