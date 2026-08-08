-- MR FIESTA LIVE · esquema inicial seguro para Supabase PostgreSQL
-- Ejecuta este archivo completo en SQL Editor de un proyecto nuevo.
create extension if not exists pgcrypto;

create type public.event_status as enum ('draft', 'active', 'finished');
create type public.request_status as enum ('pending', 'queued', 'playing', 'completed', 'rejected');
create type public.photo_status as enum ('published', 'pending', 'hidden');
create type public.staff_role as enum ('owner', 'dj', 'moderator');

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  celebrant_name text not null check (char_length(celebrant_name) between 1 and 80),
  celebrant_age integer check (celebrant_age between 1 and 120),
  event_date date not null,
  status public.event_status not null default 'draft',
  cover_url text,
  theme jsonb not null default '{"gallery_moderation":"auto"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null default 'dj',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 48),
  table_number text check (char_length(table_number) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 2 and 48),
  table_number text check (char_length(table_number) <= 20),
  song_title text not null check (char_length(trim(song_title)) between 1 and 100),
  artist text check (char_length(artist) <= 100),
  dedication text check (char_length(dedication) <= 180),
  status public.request_status not null default 'pending',
  position integer check (position is null or position > 0),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);
create index song_requests_event_status_idx on public.song_requests(event_id, status, created_at desc);
create index song_requests_guest_idx on public.song_requests(guest_id, created_at desc);
create unique index one_playing_song_per_event on public.song_requests(event_id) where status = 'playing';

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 2 and 48),
  storage_path text not null unique,
  caption text check (char_length(caption) <= 300),
  status public.photo_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photos_event_status_idx on public.photos(event_id, status, created_at desc);

create table public.photo_likes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(photo_id, guest_id)
);
create index photo_likes_event_idx on public.photo_likes(event_id, photo_id);

create table public.photo_reactions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reaction text not null check (reaction in ('🔥', '🎉', '🙌', '💃', '💖')),
  created_at timestamptz not null default now(),
  unique(photo_id, guest_id, reaction)
);
create index photo_reactions_event_idx on public.photo_reactions(event_id, photo_id);

create table public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 2 and 48),
  content text not null check (char_length(trim(content)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index photo_comments_photo_idx on public.photo_comments(photo_id, created_at);

create table public.song_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  song_request_id uuid not null references public.song_requests(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(song_request_id, guest_id)
);
create index song_votes_event_idx on public.song_votes(event_id, song_request_id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger guests_updated_at before update on public.guests for each row execute function public.set_updated_at();
create trigger photos_updated_at before update on public.photos for each row execute function public.set_updated_at();

-- Las funciones SECURITY DEFINER fuerzan permisos sin exponer una service role al navegador.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;
create or replace function public.can_manage_event(target_event uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists(select 1 from public.event_staff where event_id = target_event and user_id = auth.uid());
$$;
create or replace function public.is_own_guest(target_guest uuid, target_event uuid default null) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.guests where id = target_guest and user_id = auth.uid() and (target_event is null or event_id = target_event));
$$;

-- Operación atómica: nunca habrá dos canciones en playing para el mismo evento.
create or replace function public.start_song_request(request_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare target_event uuid;
begin
  select event_id into target_event from public.song_requests where id = request_id and status = 'queued';
  if target_event is null then raise exception 'La solicitud no está disponible para reproducir'; end if;
  if not public.can_manage_event(target_event) then raise exception 'No autorizado'; end if;
  update public.song_requests set status = 'completed', completed_at = now() where event_id = target_event and status = 'playing';
  update public.song_requests set status = 'playing', started_at = now() where id = request_id;
end; $$;
grant execute on function public.start_song_request(uuid) to authenticated;

alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.event_staff enable row level security;
alter table public.guests enable row level security;
alter table public.song_requests enable row level security;
alter table public.photos enable row level security;
alter table public.photo_likes enable row level security;
alter table public.photo_reactions enable row level security;
alter table public.photo_comments enable row level security;
alter table public.song_votes enable row level security;

create policy "active events are visible" on public.events for select using (status = 'active' or public.can_manage_event(id));
create policy "admins create events" on public.events for insert to authenticated with check (public.is_admin());
create policy "staff edit event" on public.events for update to authenticated using (public.can_manage_event(id)) with check (public.can_manage_event(id));
create policy "admins delete events" on public.events for delete to authenticated using (public.is_admin());
create policy "staff visible to staff" on public.event_staff for select to authenticated using (public.can_manage_event(event_id));
create policy "admins manage staff" on public.event_staff for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "guest reads own record" on public.guests for select to authenticated using (user_id = auth.uid() or public.can_manage_event(event_id));
create policy "anonymous user creates self" on public.guests for insert to authenticated with check (user_id = auth.uid() and exists(select 1 from public.events where id = event_id and status = 'active'));
create policy "guest edits self" on public.guests for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff sees guests" on public.guests for select to authenticated using (public.can_manage_event(event_id));

create policy "active event requests are visible" on public.song_requests for select to authenticated using (exists(select 1 from public.events where id = event_id and status = 'active') or public.can_manage_event(event_id));
create policy "guest creates own request" on public.song_requests for insert to authenticated with check (public.is_own_guest(guest_id, event_id) and exists(select 1 from public.events where id = event_id and status = 'active'));
create policy "staff updates requests" on public.song_requests for update to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "published photos are visible" on public.photos for select to authenticated using ((status = 'published' and exists(select 1 from public.events where id = event_id and status = 'active')) or public.is_own_guest(guest_id, event_id) or public.can_manage_event(event_id));
create policy "guest adds own photo" on public.photos for insert to authenticated with check (public.is_own_guest(guest_id, event_id));
create policy "staff moderates photo" on public.photos for update to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
create policy "guest removes own photo" on public.photos for delete to authenticated using (public.is_own_guest(guest_id, event_id) or public.can_manage_event(event_id));

create policy "event likes visible" on public.photo_likes for select to authenticated using (exists(select 1 from public.events where id = event_id and status = 'active') or public.can_manage_event(event_id));
create policy "guest manages own likes" on public.photo_likes for insert to authenticated with check (public.is_own_guest(guest_id, event_id));
create policy "guest removes own likes" on public.photo_likes for delete to authenticated using (public.is_own_guest(guest_id, event_id));
create policy "event reactions visible" on public.photo_reactions for select to authenticated using (exists(select 1 from public.events where id = event_id and status = 'active') or public.can_manage_event(event_id));
create policy "guest adds reaction" on public.photo_reactions for insert to authenticated with check (public.is_own_guest(guest_id, event_id));
create policy "event comments visible" on public.photo_comments for select to authenticated using (exists(select 1 from public.events where id = event_id and status = 'active') or public.can_manage_event(event_id));
create policy "guest adds comment" on public.photo_comments for insert to authenticated with check (public.is_own_guest(guest_id, event_id));
create policy "event votes visible" on public.song_votes for select to authenticated using (exists(select 1 from public.events where id = event_id and status = 'active') or public.can_manage_event(event_id));
create policy "guest votes once" on public.song_votes for insert to authenticated with check (public.is_own_guest(guest_id, event_id));

-- Bucket público para servir fotos; las inserciones se validan por carpeta eventId/guestId.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('event-photos', 'event-photos', true, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = true, file_size_limit = 10485760;
create policy "guests upload to own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'event-photos' and (storage.foldername(name))[2] is not null and exists(select 1 from public.guests where event_id::text = (storage.foldername(name))[1] and id::text = (storage.foldername(name))[2] and user_id = auth.uid())
);
create policy "photos public read" on storage.objects for select using (bucket_id = 'event-photos');
create policy "guests remove own uploads" on storage.objects for delete to authenticated using (bucket_id = 'event-photos' and exists(select 1 from public.guests where event_id::text = (storage.foldername(name))[1] and id::text = (storage.foldername(name))[2] and user_id = auth.uid()));

-- Realtime (Postgres Changes) para los flujos que se actualizan sin refrescar.
alter publication supabase_realtime add table public.song_requests, public.photos, public.photo_likes, public.photo_reactions, public.photo_comments, public.song_votes;

-- En Authentication > Providers habilita Anonymous Sign-Ins antes de probar invitados.
