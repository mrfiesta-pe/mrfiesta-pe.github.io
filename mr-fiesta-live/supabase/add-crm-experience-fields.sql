-- Ejecutar una sola vez en Supabase LIVE > SQL Editor.
-- Agrega datos operativos a reservas existentes sin modificar ni borrar información.
alter table public.crm_events add column if not exists juegos_elegidos text not null default '';
alter table public.crm_events add column if not exists adicionales_requerimientos text not null default '';
alter table public.crm_events add column if not exists referencia text not null default '';
alter table public.crm_events add column if not exists tematica_invitacion text not null default '';
alter table public.crm_events add column if not exists cancion_invitacion text not null default '';
