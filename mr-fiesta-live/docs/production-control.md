# Organizador sencillo de MR FIESTA

El organizador tiene tres apartados: **Personal**, **Checklist** y **Resumen del evento**. Se abre inicialmente en el checklist. Funciona para cualquier reserva y fecha del CRM existente.

## Checklist automático de salida

La lista sirve únicamente para preparar la salida del almacén. No incluye tareas de montaje, show, cierre ni retorno.

Se genera según los servicios del paquete contratado. El catálogo es el mismo que usa el CRM (`src/lib/crmPackages.ts`), sin duplicar sus precios o descripciones en el frontend. Si la reserva ya tiene un detalle de servicio específico, ese texto prevalece, incluidas las exclusiones. El catálogo se usa como respaldo cuando el detalle está vacío.

Los campos **Adicionales / requerimientos** y **Adicionales históricos** se incorporan directamente a la lista. Cada línea o elemento separado por punto y coma conserva su texto exacto. No hay que volver a escribir los extras ni pulsar un botón para regenerar la lista. Al volver a abrir o actualizar el evento se toman los datos actuales del CRM.

Los adicionales tienen identificadores basados en su contenido. Si se cambia o agrega un extra, aparece sin marcar; las tareas sin cambios conservan su avance. Los adicionales retirados dejan de aparecer, conservando los registros anteriores en el documento guardado.

La salida incluye solo los kits y materiales relevantes: DJ, sonido, pista LED, proyección, luces, Glitter, decoración, efectos, juegos y accesorios, según lo contratado. Humo o burbujas se presenta como una alternativa cuando así está expresado. El checklist de retorno queda fuera de esta versión.

## Personal

Selecciona colaboradores del registro existente o pulsa **Sugerir personal**. La función y el período se completan con la información disponible del contrato. Las propuestas quedan pendientes de confirmación y se evitan los cruces de horario conocidos. Una persona puede tener varias funciones compatibles.

La vista principal muestra función, inicio, salida y confirmación. Honorarios, llegada, traslado y observaciones quedan en un apartado opcional. Las hojas de trabajo y los enlaces de WhatsApp excluyen los datos financieros y notas privadas; no se envían mensajes automáticamente.

## Resumen del evento

Es el último apartado y contiene cliente, protagonista, fecha, horarios, dirección, invitados, paquete, detalle completo del servicio, adicionales, cronograma y personal asignado. El cronograma se consulta automáticamente desde la reserva, sin un formulario adicional.

El visor abre el PDF original si existe un enlace HTTPS accesible. Si no existe, se muestra el contenido estructurado del CRM y se indica que no hay PDF enlazado. No se inventan documentos, versiones ni fechas de generación.

Las finanzas están integradas al resumen: total, adelanto, saldo calculado, costos y utilidad. Registrar pagos adicionales y gastos es opcional. El saldo se calcula en centavos con total menos adelanto menos pagos adicionales; no utiliza el campo histórico saldo. El precio contractual no se edita desde producción.

Se retiraron de la interfaz Equipamiento, Logística, Bitácora, el editor manual de cronograma y la matriz de múltiples checks contractuales. El centro diario muestra tarjetas, tabla y personal del día.

## Guardado y permisos

Pulsa **Guardar producción** para confirmar los cambios en Supabase. La aplicación muestra guardado solo después de la respuesta del servidor. Los borradores incompletos se pueden guardar; para marcar el evento listo se revisan el checklist de salida y el personal confirmado, sin exigir los formularios retirados.

Se mantienen la sesión del CRM, RLS para administradores, el control de revisión contra sobrescrituras entre pestañas y el registro automático interno de cambios. No se carga una pantalla de bitácora ni un inventario. Las estructuras anteriores permanecen almacenadas para conservar información, sin trabajo adicional para el usuario.

La migración `supabase/production-simple-workflow.sql` reemplaza la validación anterior y añade funciones privadas que generan los requisitos del checklist de salida en el servidor. No elimina tablas ni actualiza contratos, eventos o planes existentes. Se aplica después de las dos migraciones originales. Los detalles están en `production-database.md`.

## Archivos principales

- `src/lib/crmPackages.ts` y `src/pages/CrmPage.tsx`: catálogo compartido con las mismas definiciones comerciales.
- `src/production/simpleWorkflow.ts`: checklist automático, extras, progreso, personal y validación sencilla.
- `src/production/Organizer.tsx` y `simple.css`: tres apartados y campos opcionales plegados.
- `src/production/ProductionPage.tsx` y `api.ts`: carga, guardado y protección de sesión.
- `src/production/ProductionCenter.tsx`: centro diario sin gestión de equipos ni logística.
- `src/production/exports.ts`: resumen y hojas de trabajo con cronograma automático.
- `supabase/production-simple-workflow.sql` y `production-simple-tests.sql`: validación y pruebas reales de base de datos.
- `tests/production-simple.test.ts` y `production-browser.mjs`: automatización y flujo simplificado.

## Verificación y publicación

Se ejecutan `npm test`, `npm run build`, `npm run lint` y `npm run test:production:browser`. Las pruebas incluyen paquetes, exclusiones, adicionales automáticos, cambios de extras que deben revisarse otra vez, conservación de checks, personal, saldo y privacidad. Se conservan las pruebas de contratos, captura y contactos existentes.

Las pruebas SQL usan los roles reales de Supabase y revierten sus datos temporales con ROLLBACK. Las pruebas de interfaz usan Edge con la API interceptada y fixtures aislados; comprueban guardado, errores, permisos y diseño adaptable sin modificar datos reales. El inventario y la bitácora ya no se consultan desde esta interfaz.

La publicación conserva el script `scripts/publish-github-pages.ps1` y la ruta existente: https://mrfiesta-pe.github.io/live/#/production.
