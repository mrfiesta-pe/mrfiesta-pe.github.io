# MR FIESTA LIVE

Aplicación móvil para invitados y cabina DJ en tiempo real. React + Vite + TypeScript + Tailwind CSS + Supabase.

## Qué está implementado

- Eventos independientes por slug: `/e/:slug`, `/cabina/:slug`, `/admin`.
- Ingreso de invitado sin email mediante Supabase Anonymous Auth y una identidad propia por evento.
- Solicitudes musicales, aprobación/rechazo, cola, reproducción exclusiva y finalización.
- Suscripciones Supabase Realtime para solicitudes, canciones en vivo, fotos, likes y reacciones.
- Galería con compresión cliente, Supabase Storage, likes, reacciones y comentarios.
- Top/votación de canciones, perfil editable, tema claro/oscuro persistido solo como preferencia visual.
- Panel protegido con Supabase Auth para crear, activar, cerrar, borrar eventos y descargar QR.
- RLS, policies, índices, constraints y Storage incluidos en `supabase/schema.sql`.

## Instalación local

```bash
npm install
copy .env.example .env.local
npm run dev
```

En `.env.local`, añade las claves públicas de **Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Nunca añadas `SUPABASE_SERVICE_ROLE_KEY` al frontend.

## Crear Supabase (pasos exactos)

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard) y en **Authentication → Providers** habilita **Anonymous Sign-Ins**.
2. Abre **SQL Editor**, pega y ejecuta todo [`supabase/schema.sql`](supabase/schema.sql). El proyecto no inserta eventos ficticios: crea el primer evento real desde `/admin`.
3. En **Authentication → Users**, crea el usuario con email/contraseña que administrará la plataforma. Copia su UUID y ejecuta una vez en SQL Editor: `insert into public.admins (user_id) values ('UUID-DEL-USUARIO');`.
4. Copia el Project URL y anon key a `.env.local`; ejecuta `npm run dev`. Inicia sesión en `/admin`, crea un evento y actívalo.

Al crear un evento desde Admin, su creador queda como `owner` de la cabina. Para conceder acceso a otro DJ, inserta su usuario en `event_staff` desde SQL Editor (rol `dj`).

## Prueba de Realtime

1. En una ventana inicia sesión en `/admin`, crea/activa un evento y abre `/cabina/<slug>`.
2. En otra ventana o dispositivo abre `/e/<slug>`, usa un nombre y mesa, y envía una canción.
3. La solicitud llega a **Nuevas** sin refrescar. Apruébala: el invitado verá el estado **En cola**. Pulsa Play: ambos verán la canción **Sonando ahora**.

## Despliegue en Vercel

1. Sube esta carpeta a GitHub y en [Vercel](https://vercel.com/new) importa el repositorio (framework: Vite).
2. En **Environment Variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para Production y Preview.
3. Despliega. `vercel.json` permite cargar directamente las rutas `/e/slug`, `/cabina/slug` y `/admin` al refrescar.
4. En Supabase → **Authentication → URL Configuration**, añade el dominio de Vercel como Site URL y Redirect URL.

## Despliegue en GitHub Pages

El proyecto ya incluye [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). GitHub Pages publica archivos estáticos, por lo que Supabase continúa siendo el backend y no hace falta un servidor adicional.

1. Sube el contenido de esta carpeta a la rama `main` de tu repositorio GitHub.
2. En el repositorio abre **Settings → Pages** y selecciona **Source: GitHub Actions**.
3. En **Settings → Secrets and variables → Actions**, crea la variable de repositorio `VITE_SUPABASE_URL` y el secret `VITE_SUPABASE_ANON_KEY`.
4. Haz push a `main`. El workflow instala, compila y publica automáticamente `dist`.

La URL quedará como `https://TU-USUARIO.github.io/TU-REPOSITORIO/`. En Pages, las rutas usan hash para soportar refrescos: por ejemplo `https://TU-USUARIO.github.io/TU-REPOSITORIO/#/e/mi-evento`. Los QR generados desde Admin ya respetan esa URL automáticamente.

### Publicar dentro del sitio raíz de MR Fiesta

Si este proyecto se guarda en `C:\MrFiestaWeb\mr-fiesta-live`, ejecuta `powershell -ExecutionPolicy Bypass -File .\scripts\publish-github-pages.ps1`. Compila la aplicación y actualiza únicamente `C:\MrFiestaWeb\live`; después sincroniza ambos cambios mediante tu flujo normal de GitHub.

## Verificación

```bash
npm run lint
npm run build
```

## PWA

La UI es mobile-first y no depende de localhost. Se puede añadir un manifest y service worker sin modificar el modelo de datos ni las rutas.
