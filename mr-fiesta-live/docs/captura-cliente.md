# Captura de datos del cliente

La captura se ejecuta en el navegador, sin IA, claves ni llamadas externas. Solo interpreta texto; aplicar no guarda una reserva.

## Flujo

1. Pegar la plantilla contestada o una conversación de WhatsApp (máximo 30 000 caracteres).
2. Pulsar **Detectar datos**.
3. Revisar los once campos, corregirlos y marcar los que se aplicarán. Los valores existentes no se seleccionan para reemplazo automático. Las fechas u horas ambiguas requieren selección explícita.
4. Elegir el teléfono principal cuando hay varios. Los adicionales se agregan a las observaciones de la reserva al aplicar el teléfono.
5. Aplicar los datos seleccionados y guardar la reserva por separado.

El mensaje de faltantes se calcula a partir de los datos actuales y los seleccionados. La referencia, canción, temática y datos del cumpleañero también se solicitan si faltan, aunque sean opcionales para guardar el contrato.

## Reglas

- Los encabezados de WhatsApp no son fechas del evento. Se ignoran mensajes de remitentes llamados MR Fiesta o Mister Fiesta.
- Se conserva la última propuesta del cliente. Cuando hay valores distintos sin una corrección reconocida, se pide revisar. Si hay varios remitentes, se muestra una advertencia.
- Sin año se toma el del equipo; si el día y mes ya pasaron se usa el siguiente. Años explícitos y referencias al pasado no se desplazan automáticamente.
- Las fechas imposibles, los días de semana incompatibles y horas sin mañana/tarde se marcan para revisión.
- Se distinguen mensajes de llegada o instalación que no indiquen inicio del evento. No se infiere un paquete a partir de su precio ni se modifican pagos.
- Se reconocen etiquetas con tildes, sin tildes, en varias líneas y algunas variantes conversacionales; los valores no reconocidos quedan pendientes.
- Fechas relativas como «el próximo sábado», nombres omitidos, distritos implícitos por un colegio y expresiones no contempladas no se adivinan. Deben completarse en la revisión.
- Cada campo detectado conserva el fragmento de origen durante la revisión. El chat no se persiste ni se envía a servicios externos.

## Verificación

Ejecutar `npm run test:capture`, `npm run build` y `npm run lint`.
Las pruebas cubren correcciones en WhatsApp, once campos de la plantilla, texto libre, año implícito, fechas inválidas, medianoche/mediodía, teléfonos y aplicación selectiva.
La implementación principal del CRM está en `src/pages/CrmPage.tsx`; `src/CrmPage.tsx` es únicamente un punto de compatibilidad.
