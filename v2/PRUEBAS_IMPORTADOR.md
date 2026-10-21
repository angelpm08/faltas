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
- Actualización desarrollada en rama de pruebas; se publicará una vez validados los resultados con el PDF GestIB recibido.

## Pruebas técnicas ejecutadas (2026-10-21)
- 15 celdas: tabla de mañana con días catalanes — 15/15 detectadas.
- 14 celdas: tabla de tarde con encabezados castellanos y un hueco — 14/14 detectadas.
- 10 celdas: tabla sin horas — 10/10 detectadas y 0 horas inventadas.
- 30 celdas: tabla con asignaturas multilínea y horarios de tarde — 30/30 y 30 rangos horarios.
- 20 celdas: PDF de horario de prueba convertido a PNG y leído por Tesseract en catalán+castellano+inglés; salida OCR con 63 palabras; motor recuperó 20/20 clases y sus horas.
- Integración de vista previa de importación y selección de archivo simulada con motor OCR — 20 filas visibles y resultado correcto.
- Lectura simulada de Tesseract en formato `blocks`/TSV — comprobada.

## Prueba con documento GestIB real del usuario (21/10/2026)
- PDF original de una página enviado por el usuario, con texto extraíble, cinco columnas independientes y franjas diferentes según el día.
- Comparación con su contenido real: lunes 6, martes 6, miércoles 7, jueves 6, viernes 6: **31 sesiones**.
- El fallo original se debía principalmente a que el PDF no tiene una columna horaria general: las horas están dentro de cada columna de día.
- El nuevo motor extrae 31/31 sesiones, conserva la hora de inicio y fin de cada clase, incluida la tutoría del miércoles 15:05-16:00.
- En el ordenador se generó una imagen 3x del PDF y se analizó con Tesseract en catalán, castellano e inglés. Las palabras reconocidas contienen las 31 franjas horarias; el motor se verificó además con una reconstrucción de esas posiciones y variaciones OCR: 31/31 franjas y días correctos. Algunos nombres tenían errores OCR (por ejemplo `Sist,` por `Sist.`, una `I` en lugar de `II`), de modo que **debe mantenerse la confirmación manual**.
- Prueba de integración de la interfaz con 31 filas reconocidas y guardadas; comprobado que se retiene el identificador de una clase anterior y la falta existente.

## Tests de regresión
Ejecutar `node v2/test-schedule-import.cjs` (ejemplos sin datos personales). Incluye 31 franjas en catalán, horas especiales, Word en una celda, tabla sin horas y detección de entrada inválida.

## Límites
- No se dispone de un teléfono Android/iPhone real para verificar la selección de archivos, ni de una ejecución del motor PDF.js completo en el navegador en esta sesión.
- La prueba se ha hecho con un PDF real (extracción estructurada independiente), una imagen derivada del mismo PDF procesada por Tesseract, la lógica JavaScript y pruebas simuladas de integración.
- Otros formatos de horarios pueden necesitar ajustes, y ninguna lectura OCR garantiza transcripción exacta al 100%.
- Nunca se publicará el PDF privado original del usuario en el repositorio.
