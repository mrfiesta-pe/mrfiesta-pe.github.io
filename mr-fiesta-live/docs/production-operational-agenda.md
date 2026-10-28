# Centro de producción: agenda operativa

La entrada `/production` permite consultar el trabajo del día sin completar formularios de preparación. La pantalla principal presenta dos vistas: **CRONOGRAMA GENERAL** y **POR EVENTO**. El parámetro `date=YYYY-MM-DD` selecciona la fecha; `/production/:eventId` permite enfocar una reserva. Las herramientas de preparación se abren mediante **Más opciones** en `/production/:eventId?advanced=1`.

## Origen de los horarios

`agenda.ts` construye una vista derivada de los datos existentes. Consultarla no crea planes, no confirma propuestas y no modifica reservas ni contratos. La prioridad entre actividades equivalentes es producción confirmada, acuerdos posteriores con el cliente, cronograma del contrato y propuestas del paquete o de las plantillas. Los registros manuales anteriores se conservan como producción guardada, sin inventar una confirmación que no figure en sus datos.

Los horarios desconocidos se muestran pendientes. Las propuestas llevan la marca **SUGERIDO**. Se conservan los movimientos de instalación, pruebas, salida, desmontaje y recojo que ya están registrados. La agenda diaria incluye movimientos de eventos de fechas vecinas cuando su horario corresponde al día consultado; los eventos de ese día muestran su operación completa, incluido el cierre de madrugada.

La edición rápida guarda una actividad mediante el RPC existente con su revisión esperada. No reescribe el cronograma contractual. La confirmación de la actividad editada se registra en el documento de producción. Los demás campos del plan se conservan.

## Consulta y distribución

La ficha operativa reúne agenda, personal, dirección y contacto del cliente. Permite abrir el contrato original y preparar las acciones de contacto. El PDF de agenda y la vista previa de WhatsApp usan los mismos datos operativos y las mismas marcas de origen. Excluyen precios, pagos, honorarios, costos, utilidad y notas internas.

Abrir WhatsApp prepara el mensaje para que una persona elija destinatario y lo envíe. El sistema registra la versión preparada, sin afirmar que el destinatario la recibió. El registro de distribución conserva una huella del contenido operativo; un cambio posterior permite señalar que la agenda compartida necesita actualizarse. La huella debe corresponder a la vista previa o al PDF generado, incluso si se actualizan datos mientras está abierta la vista previa.

## Administración avanzada

`AdvancedProduction` se importa de forma diferida. El inventario y el historial se consultan únicamente al abrir administración avanzada. La carga normal obtiene reservas, colaboradores y documentos de producción; no consulta esas dos fuentes adicionales.

La administración conserva contrato y servicios, cronograma detallado, personal, inventario, logística, checklist de salida y retorno, costos y utilidad, historial y plantillas. Los cambios del documento requieren **Guardar producción**. Las altas y ediciones del registro de inventario tienen una acción explícita e inmediata; no se convierte un equipo reservado en disponible mediante una consulta automática.

Los checks de retorno tienen identificadores propios y no heredan la marca de salida. Los checks antiguos se conservan aunque una modificación del servicio produzca una lista actual distinta. Las plantillas guardan nombre, tipo, diferencia respecto al inicio, duración y servicio opcional en el JSON del plan. Su aplicación es explícita, crea actividades sugeridas y conserva actividades existentes y confirmaciones. Si faltan referencias horarias, no inventa horas.

No se introduce una migración para este rediseño. Se mantienen tablas, RLS, RPC de guardado con revisión optimista y auditoría existentes. Los metadatos opcionales `confirmed`, `confirmedAt`, `agendaOriginId`, `activityTemplates` y `agendaShares` se guardan en el documento JSON, sin cambiar el contrato original.

## Seis flujos de aceptación

Estos flujos son una lista de verificación del despliegue. Su presencia en este documento no significa que la prueba de navegador o la comprobación del sitio publicado ya se haya ejecutado.

| Flujo | Comprobación y resultado esperado |
| --- | --- |
| 1. Consultar el día | Abrir producción, elegir una fecha con eventos y cambiar entre las dos vistas principales. Los eventos de cualquier estado y sin plan previo se pueden consultar. No se crean documentos al abrir la pantalla. Los movimientos de madrugada o de eventos vecinos aparecen en su fecha correspondiente. |
| 2. Resolver el cronograma | Revisar un evento con horarios contractuales, acuerdo posterior, edición confirmada y una propuesta sin confirmar. Prevalece la fuente correspondiente, los horarios pendientes siguen visibles y ninguna propuesta sustituye una hora confirmada. El contrato original no cambia. |
| 3. Editar y conservar | Cambiar hora o responsable de una actividad, guardar y volver a abrirla. Solo cambia su registro de producción; se conservan el resto del plan y sus importes. Una revisión obsoleta muestra un error y conserva el formulario. Actualizaciones concurrentes y cambios de cuenta no reinsertan datos de una sesión anterior ni descartan un borrador pendiente sin decisión del usuario. |
| 4. Consultar el evento | Abrir la ficha, el contrato original, ubicación, llamada y contacto. Se muestran los datos disponibles y mensajes pendientes cuando faltan. La ficha operativa y las acciones de contacto no incorporan honorarios, importes o notas internas. |
| 5. Preparar y exportar | Generar PDF del evento y del día; abrir la vista previa de WhatsApp y luego el enlace. Las propuestas quedan identificadas y el contenido operativo coincide. La versión registrada corresponde al contenido generado, incluidos eventos vecinos presentes en la agenda diaria. Tras una edición posterior se indica la necesidad de actualizar la versión compartida. El envío final de WhatsApp sigue siendo manual. |
| 6. Administrar opcionalmente | Abrir Más opciones y comprobar la carga del inventario y el historial. Editar un equipo con guardado explícito; marcar salida y retorno por separado; guardar un costo y aplicar una plantilla. Se conservan datos previos y confirmaciones, los cambios se guardan con revisión y auditoría, y se puede regresar a la agenda sin completar formularios avanzados. |

## Verificación técnica

La suite `tests/production-advanced.test.ts` pasó **7 de 7 pruebas** el 28 de octubre de 2026: propuestas relativas a hora de Lima, ausencia de mutaciones sobre el plan original, aplicación idempotente, conservación de actividades confirmadas, horarios pendientes, exclusiones contractuales y catálogo de respaldo, validación de configuración y separación del retorno. También comprueba que una actividad nueva de plantilla se presenta en la agenda como sugerida.

`tests/production-lifecycle-browser.mjs` pasó **4 escenarios** en Edge sin interfaz visible, contra el servidor local y con todas las solicitudes externas interceptadas: respuesta obsoleta después de guardar, descarte explícito y recarga, recuperación del borrador mediante Atrás con rechazo de revisión obsoleta y finalización de un guardado de otra sesión durante la carga de la cuenta actual. El informe `artifacts/production-lifecycle-browser-report.json` registró cero errores JavaScript y ninguna escritura real en Supabase. La prueba también verificó que consultar la agenda normal no solicita inventario ni auditoría.

Comandos de regresión del repositorio:

```powershell
npm run test:production
npm run test:production:browser
node --import tsx tests/production-lifecycle-browser.mjs
npm run lint
npm run build
```

La regresión completa `npm test` pasó, incluidas **72 pruebas de producción** y las pruebas existentes de captura, contactos y paginación contractual. La agenda pasó **16 comprobaciones de navegador** y el ciclo de datos pasó **4 escenarios adicionales**, sin errores JavaScript ni solicitudes de Supabase fuera de los fixtures. Build y lint finalizaron sin errores ni advertencias. Se revisaron visualmente escritorio, móvil y el PDF operativo descargado.

Las consultas de base de datos anteriores y posteriores a las pruebas encontraron los mismos **104 eventos, 3 planes, 8 entradas de auditoría y 0 equipos**. El checksum de eventos permaneció en `335c5894fc1ab3425cda4cf121d53a16`. No se requirieron migraciones ni escrituras reales en Supabase para este rediseño. Los archivos de publicación se prepararon para GitHub Pages en `/live/`; el resultado remoto se comprueba después de fusionar la revisión.
