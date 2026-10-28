-- Simplify the operating workflow without removing any saved plan, contract or audit entry.
-- Existing RLS policies, save RPC, revision checks and immutable audit triggers are unchanged.
begin;
-- Snapshot of the CRM package catalog, used only when the event has no stored service detail.
-- This edits an in-memory composite value, never the contractual row.
create function mrfiesta_production_private.departure_source(event public.crm_events) returns public.crm_events
language plpgsql stable security invoker set search_path = pg_catalog as $$
declare
  source public.crm_events := event;
  catalog_name text;
begin
  if nullif(btrim(coalesce(source.detalle_servicio,'')),'') is null then
    select name into catalog_name from (values ('Just Dance & Karaoke Party'),('Chicoteca en casa'),('Experiencia Neón'),('Ultra Chicoteca LED'),('Ultra Chicoteca + Decoración'),('Personalizado')) catalog(name)
      where lower(translate(btrim(name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) = lower(translate(btrim(coalesce(source.paquete,'')),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) limit 1;
    source.detalle_servicio := coalesce(case catalog_name
    when 'Just Dance & Karaoke Party' then '2 horas de fiesta con DJ en vivo, sonido profesional, proyector y ecran, 2 micrófonos inalámbricos, Just Dance, Karaoke y luces inteligentes. No incluye movilidad.'
    when 'Chicoteca en casa' then '2 horas de animación con animador(a) y DJ. Incluye juegos y bailes guiados, luces tipo discoteca y neón, Just Dance o Karaoke, invitación virtual y mini hora loca con globos pencil, pulseras neón y accesorios LED. Movilidad incluida en zonas seleccionadas.'
    when 'Experiencia Neón' then '3 horas de evento: 1 hora de estación Glitter y tatuajes neón + 2 horas de animación con animador(a). Incluye juegos modernos, mini hora loca, invitación virtual, globos pencil, pulseras neón, accesorios LED, DJ y sonido profesional, luces inteligentes y luz UV, proyector gigante para Karaoke y Just Dance, y máquina de humo o burbujas. Movilidad incluida.'
    when 'Ultra Chicoteca LED' then '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de Animación Chicoteca LED. Incluye pista LED de 3x2 metros, animador(a), Staff (Asistente), DJ, maquilladora, luces inteligentes y láser, proyección láser del nombre, proyector y ecran gigante para Just Dance y Karaoke, juegos de competencia según la edad y mini hora loca LED con globos pencil, pulseras neón, limbo, salta soga y burbujas. Movilidad incluida.'
    when 'Ultra Chicoteca + Decoración' then '4 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación + 1 hora adicional de DJ, distribuida en 30 minutos antes del evento y 30 minutos después del show. Incluye pista LED de 3x2 metros, animador(a), staff escénico, DJ y maquilladora, juegos exclusivos, proyector y ecran para Just Dance y Karaoke, mini hora loca LED con globos pencil, pulseras neón, limbo y salta soga. Incluye decoración temática base Neón/Glow con backing y cartel neón, 3 mesas acrílicas o cilindros decorativos y accesorios para torta y bocaditos. Movilidad incluida.'
    when 'Personalizado' then 'Servicio personalizado de acuerdo con las características y requerimientos del evento.'
    end,'');
  end if;
  return source;
end;
$$;
revoke all on function mrfiesta_production_private.departure_source(public.crm_events) from public,anon;
grant execute on function mrfiesta_production_private.departure_source(public.crm_events) to authenticated;

create function mrfiesta_production_private.departure_checks(event public.crm_events) returns setof text
language plpgsql stable security invoker set search_path = pg_catalog as $$
declare
  source public.crm_events := mrfiesta_production_private.departure_source(event);
  included text[];
  item text;
  found_item boolean := false;
begin
  select coalesce(array_agg(service_key),'{}'::text[]) into included from mrfiesta_production_private.required_services(source);
  foreach item in array array['dj','sound','led','projection','lights','glitter','decoration','effects','smoke','bubbles','games','hora-loca','accessories','animation','makeup'] loop
    if item = any(included)
      and not (item='accessories' and 'hora-loca'=any(included))
      and not (item='animation' and ('games'=any(included) or 'hora-loca'=any(included)))
      and not (item='makeup' and 'glitter'=any(included)) then
      return next 'simple-out-' || item;
      found_item := true;
    end if;
  end loop;
  for item in select distinct btrim(fragment,E' \t') from regexp_split_to_table(coalesce(event.adicionales_requerimientos,'') || E'\n' || coalesce(event.adicionales,''),E'[\\r\\n;]+') as items(fragment)
    where nullif(btrim(fragment,E' \t'),'') is not null loop
    return next 'simple-extra-' || encode(convert_to(item,'UTF8'),'hex');
    found_item := true;
  end loop;
  if not found_item then return next 'simple-out-general'; end if;
end;
$$;
revoke all on function mrfiesta_production_private.departure_checks(public.crm_events) from public,anon;
grant execute on function mrfiesta_production_private.departure_checks(public.crm_events) to authenticated;

create or replace function mrfiesta_production_private.guard_plan() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
declare
  doc jsonb := new.document;
  entry jsonb;
  other_entry jsonb;
  existing_plan record;
  field text;
  member text;
  first_time timestamptz;
  last_time timestamptz;
  other_start timestamptz;
  other_end timestamptz;
  event_start timestamptz;
  event_end timestamptz;
  transfer integer;
  ready boolean;
  base_event public.crm_events;
  old_task jsonb;
  tasks jsonb := '[]'::jsonb;
  service record;
  role_pattern text;
begin
  if auth.uid() is null or not public.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode = '42501', message = 'Solo administradores del CRM pueden modificar producción.';
  end if;
  perform pg_advisory_xact_lock(hashtext('mrfiesta-production-resources'));
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then
    raise exception using errcode = '22023', message = 'No se puede trasladar un plan a otro evento.';
  end if;
  if doc->>'version' is distinct from '1' or doc->>'eventId' is distinct from new.event_id::text
    or not coalesce(doc->>'status' = any(array['unorganized','planning','confirming','ready','setup','live','finished','closed']),false) then
    raise exception using errcode = '22023', message = 'El documento de producción no corresponde al evento o a una versión admitida.';
  end if;
  foreach field in array array['activities','staff','equipment','checklist','commitments','agreements','costs','payments','exceptions'] loop
    if jsonb_typeof(doc->field) is distinct from 'array' or jsonb_array_length(doc->field) > 1000 then
      raise exception using errcode = '22023', message = 'El plan contiene una lista inválida: ' || field;
    end if;
    if exists(select 1 from jsonb_array_elements(doc->field) item where jsonb_typeof(item) <> 'object') then
      raise exception using errcode = '22023', message = 'Las listas de producción solo admiten elementos estructurados.';
    end if;
    if field not in ('commitments','exceptions') and exists (
      select 1 from jsonb_array_elements(doc->field) item group by item->>'id' having item->>'id' is null or count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'Los elementos de producción deben tener identificadores únicos: ' || field;
    end if;
  end loop;
  if jsonb_typeof(doc->'logistics') is distinct from 'object' or jsonb_typeof(doc->'reviewedContract') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'El documento de producción tiene un formato inválido.';
  end if;
  ready := doc->>'status' = any(array['ready','setup','live','finished','closed']);
  select * into strict base_event from public.crm_events where id = new.event_id;

  -- Keep completion provenance server-generated, including when a client copies an old task.
  for entry in select value from jsonb_array_elements(doc->'checklist') loop
    if jsonb_typeof(entry->'done') is distinct from 'boolean' or nullif(entry->>'id','') is null
      or not coalesce(entry->>'stage' = any(array['before','setup','show','after']),false) then
      raise exception using errcode = '22023', message = 'Una tarea de checklist tiene un formato inválido.';
    end if;
    old_task := null;
    if tg_op = 'UPDATE' then
      select value into old_task from jsonb_array_elements(old.document->'checklist') where value->>'id' = entry->>'id' limit 1;
    end if;
    if entry->>'done' = 'true' then
      if coalesce(old_task->>'done','false') = 'true' then
        entry := entry || jsonb_build_object('completedBy',old_task->>'completedBy','completedAt',old_task->>'completedAt');
      else
        entry := entry || jsonb_build_object('completedBy',auth.uid()::text,'completedAt',clock_timestamp());
      end if;
    else
      entry := entry - 'completedBy' - 'completedAt';
    end if;
    tasks := tasks || jsonb_build_array(entry);
  end loop;
  doc := jsonb_set(doc,'{checklist}',tasks);

  -- Retain validation of legacy fields, but never require filling removed screens.
  foreach field in array array['departure','installation','arrival','test','serviceStart','teardown','pickup'] loop
    perform mrfiesta_production_private.local_time(doc->'logistics'->>field);
  end loop;
  foreach field in array array['setupMinutes','transferMinutes'] loop
    if jsonb_typeof(doc->'logistics'->field) is distinct from 'number' or (doc->'logistics'->>field)::numeric < 0
      or (doc->'logistics'->>field)::numeric > 10080 then
      raise exception using errcode = '22023', message = 'Revisa los minutos previstos de traslado.';
    end if;
  end loop;
  foreach field in array array['installerIds','teardownIds'] loop
    if jsonb_typeof(doc->'logistics'->field) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'El documento de producción tiene un formato inválido.';
    end if;
    for member in select jsonb_array_elements_text(doc->'logistics'->field) loop
      if not exists(select 1 from public.crm_collaborators c where c.id::text = member) then
        raise exception using errcode = '22023', message = 'Un colaborador guardado ya no existe en el registro.';
      end if;
    end loop;
  end loop;
  foreach field in array array['costs','payments'] loop
    for entry in select value from jsonb_array_elements(doc->field) loop
      if jsonb_typeof(entry->'amount') is distinct from 'number' or (entry->>'amount')::numeric < 0 then
        raise exception using errcode = '22023', message = 'Los importes de producción deben ser números no negativos.';
      end if;
    end loop;
  end loop;
  for entry in select value from jsonb_array_elements(doc->'activities') loop
    perform mrfiesta_production_private.local_time(entry->>'start');
    perform mrfiesta_production_private.local_time(entry->>'end');
    if jsonb_typeof(entry->'responsibleIds') is distinct from 'array'
      or not coalesce(entry->>'status' = any(array['pending','preparing','live','completed','cancelled']),false)
      or not coalesce(entry->>'kind' = any(array['setup','test','show','travel','teardown','other']),false) then
      raise exception using errcode = '22023', message = 'Una actividad guardada tiene un formato inválido.';
    end if;
    for member in select jsonb_array_elements_text(entry->'responsibleIds') loop
      if not exists(select 1 from public.crm_collaborators c where c.id::text = member) then
        raise exception using errcode = '22023', message = 'Un responsable guardado no existe en colaboradores.';
      end if;
    end loop;
  end loop;
  for entry in select value from jsonb_array_elements(doc->'equipment') loop
    perform mrfiesta_production_private.local_time(entry->>'start');
    perform mrfiesta_production_private.local_time(entry->>'end');
    if coalesce(entry->>'assetId','') <> '' and not exists(select 1 from public.crm_production_assets a where a.id::text = entry->>'assetId') then
      raise exception using errcode = '22023', message = 'Un equipo guardado ya no existe en el registro.';
    end if;
    if not coalesce(entry->>'status' = any(array['reserved','installed','in_use','pickup','available','maintenance']),false)
      or jsonb_typeof(entry->'transferMinutes') is distinct from 'number' or (entry->>'transferMinutes')::numeric < 0
      or (entry->>'transferMinutes')::numeric > 10080 then
      raise exception using errcode = '22023', message = 'Un equipo guardado tiene un formato inválido.';
    end if;
  end loop;

  -- The only resource requirements in the simple workflow are the assigned people.
  for entry in select value from jsonb_array_elements(doc->'staff') loop
    first_time := mrfiesta_production_private.local_time(entry->>'start');
    last_time := mrfiesta_production_private.local_time(entry->>'end');
    other_start := mrfiesta_production_private.local_time(entry->>'arrival');
    member := entry->>'collaboratorId';
    if coalesce(member,'') <> '' and not exists(select 1 from public.crm_collaborators c where c.id::text = member) then
      raise exception using errcode = '22023', message = 'Selecciona personal del registro real de colaboradores.';
    end if;
    if jsonb_typeof(entry->'fee') is distinct from 'number' or (entry->>'fee')::numeric < 0
      or not coalesce(entry->>'confirmation' = any(array['pending','confirmed','declined']),false)
      or jsonb_typeof(entry->'transferMinutes') is distinct from 'number' or (entry->>'transferMinutes')::numeric < 0
      or (entry->>'transferMinutes')::numeric > 10080 then
      raise exception using errcode = '22023', message = 'Revisa los honorarios y la confirmación del personal.';
    end if;
    if ready and entry->>'confirmation' <> 'declined' then
      if nullif(member,'') is null or nullif(btrim(entry->>'role'),'') is null
        or first_time is null or last_time is null or last_time <= first_time or other_start > first_time then
        raise exception using errcode = '22023', message = 'Completa la función y el horario del personal.';
      end if;
      if entry->>'confirmation' <> 'confirmed' then
        raise exception using errcode = '22023', message = 'Confirma al personal antes de marcar el evento listo.';
      end if;
      first_time := coalesce(other_start,first_time);
      for existing_plan in select event_id,document from public.crm_production_plans where event_id <> new.event_id loop
        for other_entry in select value from jsonb_array_elements(existing_plan.document->'staff') other
          where other->>'collaboratorId' = member and other->>'confirmation' <> 'declined' loop
          other_start := mrfiesta_production_private.local_time(coalesce(nullif(other_entry->>'arrival',''),other_entry->>'start'));
          other_end := mrfiesta_production_private.local_time(other_entry->>'end');
          transfer := ceiling(greatest(coalesce((entry->>'transferMinutes')::numeric,0),coalesce((other_entry->>'transferMinutes')::numeric,0)))::integer;
          if first_time < other_end and last_time > other_start then
            raise exception using errcode = '22023', message = 'Un colaborador está asignado simultáneamente a dos eventos. Corrige su horario o asígnalo a otro evento.';
          end if;
          if first_time < other_end + make_interval(mins => transfer) and last_time + make_interval(mins => transfer) > other_start
            and not exists(select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key'='resource:staff:' || member || ':' || existing_plan.event_id::text and char_length(btrim(ex->>'reason')) >= 8) then
            raise exception using errcode = '22023', message = 'Un colaborador no tiene tiempo suficiente de traslado entre eventos.';
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  if ready then
    event_start := mrfiesta_production_private.local_time(base_event.fecha_evento::text || 'T' || base_event.hora_inicio);
    event_end := mrfiesta_production_private.local_time(base_event.fecha_evento::text || 'T' || base_event.hora_fin);
    if nullif(btrim(base_event.direccion),'') is null or nullif(btrim(base_event.lugar),'') is null or event_start is null or event_end is null or event_start = event_end then
      raise exception using errcode = '22023', message = 'Confirma dirección, distrito y horarios del evento en el CRM.';
    end if;
    for field in select * from mrfiesta_production_private.departure_checks(base_event) loop
      if not exists(select 1 from jsonb_array_elements(doc->'checklist') task where task->>'id'=field and task->>'done'='true' and task->>'stage'='before') then
        raise exception using errcode = '22023', message = 'Completa el checklist de salida antes de marcar el evento listo.';
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(doc->'payments') payment where (payment->>'amount')::numeric <= 0 or nullif(payment->>'date','') is null) then
      raise exception using errcode = '22023', message = 'Revisa la fecha y el importe del pago adicional.';
    end if;
    for service in select * from mrfiesta_production_private.required_services(mrfiesta_production_private.departure_source(base_event)) loop
      role_pattern := case service.service_key when 'dj' then '\ydj\y|disc.?jockey' when 'animation' then 'animador|animadora|animacion'
        when 'glitter' then 'glitter|maquill' when 'makeup' then 'maquill|glitter' when 'assistant' then 'asistente|staff|produccion' else null end;
      if role_pattern is not null and not exists(select 1 from jsonb_array_elements(doc->'staff') s where s->>'confirmation'='confirmed'
        and lower(translate(s->>'role','ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) ~ role_pattern) then
        raise exception using errcode = '22023', message = 'Falta personal confirmado para un servicio contratado: ' || service.service_key;
      end if;
    end loop;
  end if;
  new.revision := case when tg_op='INSERT' then 1 else old.revision + 1 end;
  new.document := doc;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function mrfiesta_production_private.guard_plan() from public,anon,authenticated;

commit;
