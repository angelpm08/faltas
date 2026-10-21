# ControlFaltas 2.0 — corrección de módulos duplicados y carga de horas

## Problema
Al importar horarios PDF o fotos desde GestIB se creaban asignaturas nuevas a pesar de que las materias originales ya estaban registradas con sus horas. Las nuevas tenían 0 horas y su porcentaje era imposible de calcular, mientras la página seguía mostrando duplicados.

## Solución
- Equivalencias exactas y conservadoras entre denominaciones en castellano y catalán, abreviaturas conocidas y sufijos del grupo -A/-B.
- El usuario revisa el horario y una lista de módulos únicos con horas lectivas individuales antes de guardar. Si faltan horas, la interfaz las solicita y advierte de que el porcentaje quedará pendiente.
- Al confirmar la importación, reconcilia materias y reasigna referencias de faltas, exámenes y sesiones antiguas; conserva las horas del módulo previamente configurado.
- Archiva módulos que no figuran en el nuevo horario para eliminarlos de las listas habituales sin borrar su historial.
- Botón **Ajustes → Asignaturas → Unificar asignaturas de mi horario** para arreglar importaciones realizadas antes de la actualización sin tener que subir otra vez el PDF.
- La tutoría figura en el horario pero no se confunde con un módulo profesional con porcentaje lectivo.
- El registro permite elegir la comunidad autónoma. Para SMR de Illes Balears (segundo curso, currículo de la cohorte 2025/26) utiliza una tabla oficial: Sistemas operativos en red 215 h, Seguridad informática 180 h, Servicios en red 220 h, Aplicaciones web 180 h, Sostenibilidad 30 h, Itinerario II 60 h, Proyecto intermodular 50 h, Módulo optativo 80 h. Total de segundo 1.015 h y del título completo 2.000 h. El módulo específico «Introducción a la programación» **no** hereda automáticamente las 80 h del optativo: el alumno debe confirmarlo.
- No se inventan horas de módulos de otras comunidades o ciclos. El total del ciclo tampoco se divide entre asignaturas.

Fuentes:
- Govern de les Illes Balears: https://caib.es/sites/fp/ca/sistemes_microinformatics_i_xarxes/
- Ministerio de Educación, TodoFP: https://www.todofp.es/que-estudiar/familias-profesionales/informatica-comunicaciones/sistemas-microniformaticos-redes.html

## Pruebas
- `v2/test-module-reconcile.cjs`: nombres equivalentes, módulos distintos, horas oficiales, preservación de faltas/exámenes, archivado, segunda importación sin duplicaciones.
- Prueba de integración de la interfaz con el horario GestIB de 31 sesiones: 31/31 sesiones conservadas, 9 módulos activos, 7 con horas de las materias conocidas, tutoría 0 h curriculares y «Introducción a la programación» indicada manualmente como 80 h. Verificado que los registros anteriores permanecen asociados al módulo original.
- Prueba de reparación de importación antigua desde Ajustes: dos módulos equivalentes se reducen a uno activo con 220 h, sin perder la falta ni el examen.
- Prueba de registro: selección de SMR en segundo y Illes Balears precarga ocho materias con sus horas; no introduce un horario ajeno.

Nota: los datos locales del usuario nunca se envían al repositorio. Un curso FP en otra comunidad, año académico o plan educativo puede tener distintas horas: mostrar y confirmar los valores es obligatorio.
