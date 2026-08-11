# Arquitectura MR FIESTA LIVE

El navegador usa únicamente el anon key. Los invitados se autentican con **Supabase Anonymous Auth**; la tabla `guests` vincula `auth.uid()` a una identidad del evento. RLS comprueba esa vinculación para cada inserción de solicitud, voto, like, comentario y ruta de Storage.

Los administradores y DJs son usuarios Auth convencionales. `admins` habilita la administración global y `event_staff` autoriza una cabina concreta. La operación `start_song_request()` es una función SQL atómica: termina cualquier canción actual y comienza la nueva en una transacción protegida, de forma que sólo hay una canción `playing` por evento.

`song_requests`, galería e interacciones se publican en `supabase_realtime`. Cada pantalla crea un único canal por evento y lo elimina al desmontarse; tras un cambio recarga únicamente el recurso afectado desde Supabase.
