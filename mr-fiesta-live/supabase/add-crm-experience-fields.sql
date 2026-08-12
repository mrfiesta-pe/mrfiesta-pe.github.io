-- Ejecutar una sola vez en Supabase LIVE > SQL Editor.
-- Agrega datos operativos a reservas existentes sin modificar ni borrar información.
alter table public.crm_events add column if not exists juegos_elegidos text not null default '';
alter table public.crm_events add column if not exists adicionales_requerimientos text not null default '';
alter table public.crm_events add column if not exists referencia text not null default '';
alter table public.crm_events add column if not exists tematica_invitacion text not null default '';
alter table public.crm_events add column if not exists cancion_invitacion text not null default '';
alter table public.crm_events add column if not exists dni_ruc text not null default '';

create table if not exists public.crm_collaborators (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) between 2 and 120),
  rol text not null default 'Staff',
  telefono text not null check (char_length(regexp_replace(telefono, '[^0-9]', '', 'g')) between 9 and 15),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.crm_collaborators enable row level security;
drop policy if exists "admins manage crm collaborators" on public.crm_collaborators;
create policy "admins manage crm collaborators" on public.crm_collaborators for all to authenticated using (public.is_admin()) with check (public.is_admin());
