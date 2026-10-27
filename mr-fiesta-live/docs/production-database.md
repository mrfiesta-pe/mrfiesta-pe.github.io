# Persistencia y permisos del centro de producción

El módulo reutiliza `public.crm_events`, `public.crm_collaborators`, la sesión de Supabase y la pertenencia administrativa comprobada por `public.is_admin()`. No actualiza eventos, contratos, precios, adelantos ni documentos originales.

`supabase/production-control.sql` es una migración aditiva revisable para el proyecto existente. Crea:

- `crm_production_plans`: un documento operativo por `crm_events.id`, con clave foránea restrictiva, revisión, fecha y usuario de guardado. Contiene cronograma, asignaciones, logística, compromisos operativos, checklist, acuerdos, costos y pagos adicionales. JSONB mantiene todos los cambios de un evento en una transacción; los identificadores de colaboradores y equipos se validan contra los registros reales al guardar.
- `crm_production_assets`: equipos con identificador individual único y estado de disponibilidad o mantenimiento.
- `crm_production_audit`: historial inmutable generado en el servidor con documento anterior, documento nuevo, usuario y fecha. El cliente solo puede leerlo si es administrador.

Las tres tablas tienen RLS. Solamente las cuentas existentes de `admins` pueden acceder; usuarios anónimos y colaboradores sin pertenencia administrativa no tienen acceso a datos personales, costos ni utilidad. No se amplían permisos de las tablas existentes. Las políticas excluyen sesiones de inicio anónimo. Nunca se utiliza `user_metadata` como autorización.

`supabase/production-control-hardening.sql` se aplica después de la migración inicial. Añade índices de las claves de usuario, prepara las consultas de autorización para evaluación por sentencia y amplía la lectura contractual al campo legado `adicionales`. El valor predeterminado legado de `movilidad` no se interpreta automáticamente como un compromiso. La misma validación de preparación se mantiene también para los estados finalizado y cerrado, de modo que no se puedan usar para saltar el cronograma obligatorio.

`save_crm_production_plan(event_id, document, expected_revision)` ejecuta una comparación y actualización atómica. Una revisión obsoleta produce `40001`, sin sobrescribir otra pestaña. Los desencadenadores validan también las escrituras directas: versión y evento del documento, listas, identificadores reales, importes y fechas. Las fechas de operación se interpretan explícitamente en `America/Lima` y admiten instalación y recojo en fechas diferentes.

El estado listo, montaje o desarrollo requiere cronograma con servicio, montaje y pruebas; responsables activos; personal confirmado; instalación y responsable; checklist previo completo; contrato revisado y servicios preparados; recursos identificados y con intervalos que cubran instalación, servicio y recojo. La extracción de servicios usa solamente el texto registrado en el evento, con distinción conservadora entre afirmaciones, exclusiones y alternativas. No presupone contenido por nombre de paquete. Las duraciones explícitas requieren cobertura o una excepción específica.

Las reservas se comparan con todos los planes, incluyendo fechas adyacentes y tiempos configurados de traslado. Las superposiciones físicas entre eventos no se pueden justificar. Un traslado más breve puede tener excepción con clave específica y explicación de al menos ocho caracteres. Los guardados se serializan mediante un bloqueo de transacción para evitar aprobar simultáneamente el mismo recurso en eventos distintos.

La identidad, revisión y fecha de guardado no pueden falsificarse desde el frontend. Completar una tarea genera en el servidor `completedBy` y `completedAt`; conservar una tarea completada preserva su autor y fecha. La función de auditoría usa privilegios elevados únicamente para insertar el historial; está en un esquema privado, con `search_path` fijo y ejecución revocada a clientes.

`src/production/api.ts` usa la conexión ya configurada, lectura paginada de todas las filas, confirmación de revisión del servidor y errores comprensibles. No guarda planes en almacenamiento del navegador. El único almacenamiento de sesión sigue siendo el provisto por Supabase Auth.

## Validación

`supabase/production-control-tests.sql` debe ejecutarse con la cuenta de migración. Sus aserciones cambian a los roles `authenticated` y `anon`, prueban persistencia, auditoría, falsificación de actor, revisiones obsoletas, ejecución incompleta, identificadores inexistentes y aislamiento RLS. Todo dato de prueba se revierte con `ROLLBACK`; no se modifican registros contractuales. El archivo requiere por lo menos un administrador existente y un evento que todavía no tenga plan.

`supabase/production-control-resource-tests.sql` añade pruebas positivas de transición a listo y conflictos físicos de personal y equipos. Verifica los tiempos de traslado y que una excepción documentada permita únicamente un traslado más breve, sin ocultar superposiciones físicas. Usa los servicios de los eventos reales y sus identificadores de colaboradores; los documentos y equipos de prueba se revierten por completo. Requiere dos eventos del 31 de octubre sin plan y dos colaboradores activos sin asignación previa.

La migración no importa contratos PDF antiguos que solo se descargaron localmente. El visor reutiliza enlaces reales disponibles y señala cuando el PDF no está archivado. Los pagos de producción son **adicionales** al adelanto existente; no vuelven a registrar ese adelanto. El saldo mostrado se calcula a partir de `total − adelanto − pagos adicionales`, no del campo histórico `saldo`.

Documentación consultada: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones de base de datos](https://supabase.com/docs/guides/database/functions), [seguridad de la API](https://supabase.com/docs/guides/api/securing-your-api).
