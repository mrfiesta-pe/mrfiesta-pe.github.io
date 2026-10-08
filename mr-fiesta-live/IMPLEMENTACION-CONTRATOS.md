# Generador de contratos: cuatro tareas implementadas

Esta es una copia modificada del código recuperado de `C:\MrFiestaWeb`. El sitio publicado y la carpeta original no se han modificado. El formulario real es `src/pages/CrmPage.tsx`; este proyecto no tenía `QuoteForm.tsx` ni usaba html2canvas. Usaba jsPDF directamente.

## 1. PDF vectorial

- Nuevo: `src/components/ContractDocument.tsx`. Documento A4 con `Document`, `Page`, `View`, `Text`, `Image` y `StyleSheet.create`.
- Nuevo: `src/lib/contractPdf.tsx`. Genera el Blob con `pdf(...).toBlob()` y carga logo/firma con `import.meta.env.BASE_URL`.
- Nuevo: `src/lib/contractClauses.ts`. Conserva el texto contractual existente.
- Modificados: `package.json` y `package-lock.json`. Se retiró jsPDF y se agregó `@react-pdf/renderer` con versión exacta. `buffer` resuelve la decodificación de imágenes en navegador.

El texto del PDF es seleccionable/vectorial; logo y firma siguen siendo imágenes. El contenido largo continúa en páginas adicionales, sin `slice()` ni truncamientos. El saldo se calcula desde total y adelanto. Las notas internas no se imprimen. El encabezado y la numeración se repiten. La librería del PDF se importa al pulsar **Preparar PDF**, evitando cargarla con la pantalla inicial.

Las reservas guardadas usan su UUID como referencia estable `MRF-<id>`. Las no guardadas indican **BORRADOR - SIN RESERVA GUARDADA**. Esto no implementa todavía un correlativo anual de base de datos.

## 2. Compartir el archivo

- Nuevo: `src/lib/shareContract.ts`.
- Integración: `src/pages/CrmPage.tsx`.

Flujo: completar datos → **Preparar PDF** → **Compartir PDF** o **Descargar PDF**. El segundo clic conserva la activación del usuario exigida por el navegador, aunque generar el documento tarde. La función `shareContractToWhatsApp(blob, nombre)` crea un File, consulta `navigator.canShare` y llama a `navigator.share` con el archivo y el mensaje solicitado.

La hoja nativa permite elegir WhatsApp si está instalado/disponible; una web no puede seleccionar automáticamente esa aplicación ni confirmar que se envió el mensaje. Si no hay soporte, se inicia la descarga mediante un enlace con Object URL. Cancelar no descarga ni elimina el borrador. Un error de compartir conserva el borrador y permite reintentar o descargar explícitamente. Las URLs se revocan después de dar tiempo al navegador para consumirlas.

Cambiar datos invalida el PDF preparado. No se puede compartir la versión anterior desde el panel.

## 3. Borrador automático

- Nuevo: `src/hooks/useContractDraft.ts`.
- Integración: `src/pages/CrmPage.tsx`, propietario del formulario completo.

Clave: `mrfiesta_contract_draft`. Guarda formulario, identificador de la reserva editada y versión de formato. Restaura al montar, guarda a los 500 ms y también al ocultar/cerrar la página. Informa si el almacenamiento falla.

Solo se elimina tras una operación de compartir resuelta o una descarga iniciada. El navegador no permite confirmar que el usuario guardó físicamente un archivo descargado. Guardar la reserva en la base no elimina el borrador. Un temporizador pendiente no vuelve a crearlo tras exportar, y una exportación anterior no elimina ediciones posteriores.

El borrador es local a ese navegador. No constituye una copia de seguridad de las reservas ni se sincroniza con otros dispositivos. Se guardan los datos aplicados al formulario; el chat crudo pegado en Captura inteligente no se conserva.

## 4. Formulario móvil

- Modificados: `src/pages/CrmPage.tsx` y `src/pages/CrmPage.css`.

Se usaron acordeones nativos accesibles, una de las alternativas solicitadas:

1. Datos del cliente: captura, nombre, teléfono, DNI/RUC, distrito, dirección y referencia.
2. Detalles del evento: agasajado, edad, invitados, motivo, fecha, horarios, invitación, paquete y servicios.
3. Cotización y pagos: estado, total, adelanto y saldo calculado.

Los inputs tienen 16 px de letra y al menos 48 px de alto. En móvil, los campos y acciones usan una columna; teléfono, importes y cantidades solicitan los teclados adecuados. Si un campo obligatorio está dentro de un acordeón cerrado, se abre al validar. Se conserva Guardar/Actualizar para la reserva y el WhatsApp de resumen normalizado.

## Ejecutar

Con Node.js 22 actualizado o superior y npm, abre una terminal en esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env.local
# Completar las variables públicas del proyecto en .env.local.
npm run dev
```

Abre `http://localhost:5173/crm`. El CRM real requiere las credenciales y permisos existentes. Para compilar bajo `/live/`:

```powershell
$env:VITE_BASE_PATH = '/live/'
$env:VITE_ROUTER = 'hash'
npm run build
```

El resultado queda en `dist`. No se ha desplegado esta versión.

## Verificación

```powershell
npm run lint
npm run test:capture
npm run test:contracts
npm run build
```

`tests/contracts.cjs` prueba compartir, descarga, cancelación, errores, nombres, restauración, autoguardado, limpieza y ediciones concurrentes con una exportación. Genera un PDF normal y otro largo en `output/pdf`. El workflow ejecuta lint y ambas suites antes de compilar.

Se verificaron además con extracción de texto y renderizado: contrato normal de 2 páginas y contrato extenso de 5 páginas, todos los marcadores finales presentes y sin notas internas. Se probó en Edge automatizado con tamaño móvil 390 × 844 y escritorio, usando datos/sesión simulados: restauración tras recargar, generación del PDF con imágenes, invalidación al editar, descarga y eliminación del borrador. El acceso real a la base de datos y la hoja nativa de WhatsApp en un teléfono no se probaron.

## Alcance pendiente de la auditoría original

Las cuatro tareas anteriores están implementadas. La lista inicial contenía cambios adicionales que requieren otro trabajo: firma en Storage privado, numeración correlativa transaccional y almacenamiento privado del PDF, comprobación de administrador/carga tras login, historial de pagos, cancelaciones, conflictos de agenda, notas separadas para el equipo, catálogo central y revisión legal de cláusulas. La firma conserva su ubicación pública actual; no se migró ni se modificó la base de datos.

Se eliminaron las copias de código sin uso `src/AdminPage.tsx`, `src/CrmPage.tsx`, `src/CrmPage.css` y `src/domain.ts`. Las versiones HTML antiguas están fuera de este proyecto y no se migraron.

Documentación consultada: https://react-pdf.org/docs/v4/advanced y https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
