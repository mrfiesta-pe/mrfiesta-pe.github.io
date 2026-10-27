# Centro de producción MR FIESTA

## Alcance y diagnóstico

El módulo está integrado en el CRM existente, en el repositorio `mrfiesta-pe/mrfiesta-pe.github.io`, carpeta fuente `mr-fiesta-live`. Conserva React, TypeScript, Vite, el router existente, la sesión Supabase y la identidad visual. La carpeta MR FIESTA STUDIO es otro producto y no se usa como aplicación del CRM.

La auditoría del 27 de octubre de 2026 comprobó 104 reservas en `public.crm_events` y los cinco eventos del 31 de octubre. `crm_collaborators` es el registro real de personal. André y Jochetín ya aparecen después de que administración los agregó. El módulo no requiere esos nombres ni esa fecha: funciona con cualquier reserva accesible del CRM.

Los datos comerciales ya existentes incluyen cliente, protagonista, teléfono, invitados, dirección, distrito, paquete, detalles de servicio, juegos, cronograma textual, adicionales, observaciones, total, adelanto y enlace PDF. Se mantienen también los campos históricos `adicionales`, `movilidad` y `dni` para consultar registros anteriores. La extracción de servicios usa texto contractual explícito; el nombre del paquete y el valor predeterminado de movilidad no se toman como promesas.

El CRM genera contratos con jsPDF y los descarga localmente. Los cinco contratos de la jornada no tienen `drive_pdf_url`; solo existe un bucket de fotografías. Por eso se muestra el texto disponible y una advertencia de PDF ausente, sin fabricar documentos, versiones ni fechas de generación. Los enlaces HTTPS existentes y vistas previas reconocidas de Google Drive se reutilizan; el acceso y la descarga siguen dependiendo del proveedor. No se pudo verificar un PDF original real de esa jornada.

Los saldos históricos de los cinco eventos son cero a pesar de existir diferencias entre total y adelanto. No hay una tabla de pagos separada en el esquema auditado. Producción calcula en centavos `total − adelanto − pagos adicionales de producción`. Estos pagos son adicionales al adelanto, nunca su duplicado. Los descuentos no tienen campo independiente: se consulta el valor contractual y se señala esa limitación.

## Uso

1. Inicia sesión en el CRM con una cuenta de administración.
2. Pulsa **📋 ORGANIZAR EVENTO** en cualquier reserva. Se abre otra pestaña con su identificador real. **🎛️ CENTRO DE PRODUCCIÓN** abre la vista general, cuyo selector permite elegir cualquier fecha.
3. Si todavía no hay plan guardado, el sistema genera automáticamente un borrador desde esa reserva. Importa los horarios textuales inequívocos, crea actividades según los servicios explícitos, prepara el checklist y traslada puntos logísticos reconocidos. Las horas aproximadas conservan esa indicación. Los horarios ambiguos y las duraciones desconocidas quedan pendientes.
4. **Actualizar borrador desde contrato** incorpora nuevas actividades, tareas y compromisos sin reemplazar las ediciones, asignaciones, confirmaciones, acuerdos ni costos ya registrados.
5. **Sugerir recursos disponibles** busca colaboradores activos por sus funciones registradas y equipos identificados. Comprueba ocupación, mantenimiento y márgenes de traslado. Necesita intervalos completos para evaluar disponibilidad. Las propuestas de personal quedan pendientes de confirmación; nunca supone que una participación fue acordada. Los honorarios y las horas de llegada propuestos necesitan revisión.
6. Revisa contrato, cronograma, responsables, logística y equipos; completa fechas de instalación y recojo incluso si ocurren en días distintos. Una misma persona puede cumplir funciones compatibles. Los responsables se vinculan al registro real de colaboradores.
7. Pulsa **Guardar producción**. El aviso de guardado aparece solo después de la confirmación de Supabase. Cambiar un campo vuelve a mostrar **Cambios sin guardar**. El navegador advierte al salir con un borrador pendiente. Si otra pestaña guardó una revisión nueva, se rechaza la escritura obsoleta y se conservan los cambios en pantalla para revisarlos.
8. Para pasar a **Listo para ejecución**, resuelve las alertas críticas y completa el checklist previo, el cronograma, las pruebas, la instalación, los recursos y la revisión contractual. Puedes guardar borradores incompletos en planificación. Las excepciones justificables requieren al menos ocho caracteres. Un recurso físicamente ocupado en dos eventos no puede aprobarse con una nota.
9. En el centro general elige tarjetas, tabla, cronograma, personal, equipos o logística. Las vistas operativas incluyen también instalaciones y reservas que atraviesan varios días. Las ubicaciones representan planificación registrada, no GPS ni seguimiento en vivo.
10. Descarga el PDF operativo, el reporte del día o una hoja de trabajo. Los mensajes y hojas individuales excluyen costos, honorarios, utilidad, acuerdos y comentarios internos. WhatsApp abre contenido preparado; el envío se confirma en WhatsApp.

Los cambios coordinados con el cliente se registran como acuerdos con fecha, responsable y observación. No reemplazan el documento contractual original ni se presentan como una adenda legal ya emitida. La bitácora de Supabase conserva usuario, fecha y documentos anterior/nuevo. Las incidencias internas quedan separadas de esos acuerdos.

## Archivos

- `src/App.tsx`: rutas `/production` y `/production/:eventId` compatibles con HashRouter y BrowserRouter.
- `src/pages/CrmPage.tsx` y su CSS: accesos al centro y al organizador; manejo del rechazo al intentar eliminar una reserva con historial asociado.
- `src/types/domain.ts`: campos opcionales históricos del CRM.
- `src/production/model.ts`: actividades, personal, recursos, logística, compromisos, checklist, pagos y estados.
- `src/production/rules.ts`: servicios con evidencia, disponibilidad, duración, preparación, conflictos y cálculos monetarios.
- `src/production/autoplan.ts`: importación de cronogramas, generación del borrador, actualización conservadora y sugerencias de recursos.
- `src/production/api.ts`: lectura paginada, permisos administrativos, guardado con revisión y bitácora.
- `src/production/ProductionPage.tsx`: sesión, carga, guardado, protección de cambios y alertas. Al cambiar de cuenta borra datos anteriores y descarta respuestas tardías.
- `src/production/Organizer.tsx`: las nueve secciones de trabajo.
- `src/production/ProductionCenter.tsx` y `production.css`: las seis vistas operativas y diseño adaptable.
- `src/production/contractDocument.ts` y `exports.ts`: enlaces contractuales, PDF y mensajes de trabajo.
- `supabase/production-control.sql` y `production-control-hardening.sql`: estructuras y validaciones aplicadas; detalles en `production-database.md`.
- `tests/production*.test.ts`, `production-browser.mjs` y los dos archivos SQL de pruebas: verificación del dominio, automatización, privacidad, interfaz y permisos reales.

## Base de datos y privacidad

Se aplicaron las migraciones `20261027230018_crm_production_control` y `20261027230352_crm_production_hardening` al proyecto existente. Crean `crm_production_plans`, `crm_production_assets` y `crm_production_audit`, más el RPC `save_crm_production_plan` y funciones privadas de validación. No se crean reservas duplicadas ni se actualizan filas contractuales. Un documento JSONB por evento permite guardar todo el plan en una transacción; las referencias de personal y equipos se verifican en el servidor.

Las tres tablas tienen RLS y acceso exclusivo de administradores del CRM. Las cuentas autenticadas sin pertenencia administrativa, incluidas las de colaboradores, no pueden consultar datos personales o financieros de producción. El frontend reutiliza la clave pública y la sesión existentes; no contiene `service_role`. La auditoría se genera en servidor y no admite edición desde clientes.

No se cargaron asignaciones particulares como decisiones nuevas ni se marcaron confirmaciones durante las pruebas. Las referencias de Bellavista proporcionadas en la conversación no cambian silenciosamente su contrato: la interfaz general permite registrar esos acuerdos operativos. El inventario debe contener los equipos reales para poder proponerlos. No se inventó inventario.

## Verificación y publicación

```powershell
npm ci
npm test
npm run build
npm run lint
npm audit
# Servidor local en otra terminal:
npm run dev -- --host 127.0.0.1 --port 1431
npm run test:production:browser
```

Las pruebas de TypeScript cubren horarios en Lima, medianoche, cronogramas textuales, referencias históricas, servicios negativos y alternativos, roles compatibles, reservas multidía, sugerencias, excepciones, saldo con centavos y privacidad de PDF/mensajes. Se ejecutan también las pruebas existentes de captura, contactos y paginación de contratos tras actualizar jsPDF a 4.2.1. La compilación y el linter se ejecutan contra la aplicación completa.

Las pruebas SQL ejecutadas contra Supabase incluyen 11 aserciones de persistencia, revisión, auditoría y permisos, y 8 de preparación y conflictos. Todas las filas de prueba se revierten con ROLLBACK. El checksum de las 104 reservas antes y después fue idéntico: `335c5894fc1ab3425cda4cf121d53a16`. No quedaron planes, activos ni bitácoras de prueba. Los asesores no identificaron nuevos problemas de seguridad en las tablas de producción; permanecen avisos previos ajenos al módulo.

La prueba de navegador usa Edge con la API de Supabase completamente interceptada. Verifica interacción, guardado y recuperación del adaptador simulado, errores, permisos de interfaz y tamaños de escritorio/tablet/móvil. Esta prueba no acredita un inicio de sesión real de administración ni una descarga desde Drive. La validación de escritura y RLS reales corresponde a las pruebas SQL separadas. Capturas e informe se generan en `artifacts/`, que está ignorado por Git.

Para publicar se conserva `scripts/publish-github-pages.ps1`: compila con `/live/` y router hash y prepara la carpeta `live/` del repositorio de publicación. El resultado se entrega junto al código fuente, las migraciones y las pruebas; la URL del centro es `https://mrfiesta-pe.github.io/live/#/production`.
