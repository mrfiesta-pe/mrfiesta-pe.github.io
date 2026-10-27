-- Follow-up hardening for crm_production_control. No changes to contractual rows.
begin;
create index if not exists crm_production_audit_actor_idx on public.crm_production_audit(actor);
create index if not exists crm_production_plans_updated_by_idx on public.crm_production_plans(updated_by);
alter policy production_assets_admin on public.crm_production_assets using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select public.is_admin())) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select public.is_admin()));
alter policy production_plans_admin on public.crm_production_plans using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select public.is_admin())) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select public.is_admin()));
alter policy production_audit_admin_read on public.crm_production_audit using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (select public.is_admin()));

-- Reuse legacy additional contractual text without interpreting the default movilidad field as a promise.
CREATE OR REPLACE FUNCTION mrfiesta_production_private.required_services(event public.crm_events)
 RETURNS TABLE(service_key text, service_pattern text, service_minutes numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  service record;
  clause text;
  normalized text;
  matched text;
  prefix text;
  suffix text;
  scopes text[];
  marker text;
  last_marker text;
  positive boolean;
  negative boolean;
  is_negative boolean;
  alternative boolean := false;
  clauses text[];
  duration_match text[];
begin
  normalized := lower(translate(coalesce(event.detalle_servicio,'') || E'\n' || coalesce(event.adicionales_requerimientos,'') || E'\n' || coalesce(event.adicionales,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  clauses := regexp_split_to_array(normalized,E'\\n|[.;](?=\\s|$)');
  alternative := normalized ~ 'humo\s+o\s+(?:maquina\s+de\s+)?burbujas|burbujas\s+o\s+(?:maquina\s+de\s+)?humo'
    and normalized !~ '(sin|no incluye|excluye)\s+(?:maquina\s+de\s+)?(?:humo|burbujas)';
  for service in select * from (values
    ('dj','\ydj\y'),('animation','\yanimador(?:a|es)?\y|\yanimacion\y'),
    ('glitter','\yglitter\y|tatuajes? neon'),('led','\ypista(?: de baile)?(?: led)?\y'),
    ('lights','\yluces\y|\yiluminacion\y|\ylaser\y'),('projection','\yproyector\y|\yecran\y|\ypantalla\y|\yproyeccion\y'),
    ('smoke','\yhumo\y'),('bubbles','\yburbujas\y'),('decoration','\ydecoracion\y|\ybacking\y|\ypanel(?:es)?\y'),
    ('hora-loca','\yhora loca\y'),('accessories','\yaccesorios\y|\yglobos\y|\ypulseras\y'),
    ('games','\yjuegos\y|\ydinamicas\y|\yjust dance\y|\ykaraoke\y|\ylimbo\y|salta soga'),
    ('sound','\ysonido\y|\yparlantes?\y|\ymicrofonos?\y'),('assistant','\ystaff\y|\yasistente\y'),
    ('makeup','\ymaquillador(?:a)?\y'),('transport','\ymovilidad\y|\ytransporte\y')
  ) as catalog(key,pattern) loop
    positive := false; negative := false; service_minutes := null;
    foreach clause in array clauses loop
      if clause ~ service.pattern then
        matched := (regexp_match(clause,'(' || service.pattern || ')'))[1];
        prefix := left(clause,strpos(clause,matched)-1);
        suffix := substr(clause,strpos(clause,matched)+length(matched));
        scopes := regexp_split_to_array(prefix,'\y(?:pero|sin embargo)\y');
        last_marker := '';
        for marker in select m[1] from regexp_matches(scopes[array_length(scopes,1)],'\y(no incluye|no incluido|no contratado|sin|excluye|excluido|excepto|incluye|incluido|incluidos|con)\y','g') m loop
          last_marker := marker;
        end loop;
        is_negative := last_marker ~ '^(no |sin$|excluye$|excluido$|excepto$)' or suffix ~ '^\s*(?:no incluid[oa]|excluid[oa]|no contratad[oa])\y';
        if is_negative then negative := true; else positive := true; end if;
        if service_minutes is null then
          duration_match := regexp_match(clause,'([0-9]+(?:[.,][0-9]+)?)\s*(horas?|minutos?)(?:\s+de)?\s*(?:estacion\s+)?(?:' || service.pattern || ')');
          if duration_match is null then
            duration_match := regexp_match(clause,'(?:' || service.pattern || ')\s*(?:durante|por|de|:)\s*([0-9]+(?:[.,][0-9]+)?)\s*(horas?|minutos?)');
          end if;
          if duration_match is not null then service_minutes := replace(duration_match[1],',','.')::numeric * case when duration_match[2] like 'hora%' then 60 else 1 end; end if;
        end if;
      end if;
    end loop;
    if service.key = 'games' and nullif(btrim(event.juegos_elegidos),'') is not null then positive := true; end if;
    if positive and not negative and not (alternative and service.key in ('smoke','bubbles')) then
      service_key := service.key; service_pattern := service.pattern; return next;
    end if;
  end loop;
  service_minutes := null;
  if alternative then service_key := 'effects'; service_pattern := 'humo|burbujas'; return next; end if;
  if nullif(btrim(coalesce(event.adicionales_requerimientos,'') || coalesce(event.adicionales,'')),'') is not null then service_key := 'additional'; service_pattern := ''; return next; end if;
  if lower(coalesce(event.detalle_servicio,'')) ~ '(?:^|[.;]\s*)\d+(?:[.,]\d+)?\s*(horas?|minutos?)\s*(?:de\s+)?(?:evento|experiencia|fiesta|servicio)' then service_key := 'duration'; service_pattern := ''; return next; end if;
end;
$function$;


-- Terminal states cannot bypass the readiness checks required before execution.
CREATE OR REPLACE FUNCTION mrfiesta_production_private.guard_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
  transfer integer;
  ready boolean;
  base_event public.crm_events;
  old_task jsonb;
  tasks jsonb := '[]'::jsonb;
  service record;
  role_pattern text;
  exception_key text;
  show_start timestamptz;
  required_end timestamptz;
  required_start timestamptz;
  service_duration numeric;
begin
  if auth.uid() is null or not public.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode = '42501', message = 'Solo administradores del CRM pueden modificar producción.';
  end if;
  -- Serialize resource checks across different events, including overnight reservations.
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
    for entry in select value from jsonb_array_elements(doc->field) loop
      if jsonb_typeof(entry) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'Las listas de producción solo admiten elementos estructurados.';
      end if;
    end loop;
    if field not in ('commitments','exceptions') and exists (
      select 1 from jsonb_array_elements(doc->field) e group by e->>'id' having e->>'id' is null or count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'Los elementos de producción deben tener identificadores únicos: ' || field;
    end if;
  end loop;
  if jsonb_typeof(doc->'logistics') is distinct from 'object' or jsonb_typeof(doc->'reviewedContract') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'Revisa la logística y la revisión contractual del plan.';
  end if;
  ready := doc->>'status' = any(array['ready','setup','live','finished','closed']);
  select * into strict base_event from public.crm_events where id = new.event_id;
  -- Completion identity is derived from the authenticated session and server clock.
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
  foreach field in array array['departure','installation','arrival','test','serviceStart','teardown','pickup'] loop
    perform mrfiesta_production_private.local_time(doc->'logistics'->>field);
  end loop;
  foreach field in array array['setupMinutes','transferMinutes'] loop
    if jsonb_typeof(doc->'logistics'->field) is distinct from 'number' or (doc->'logistics'->>field)::numeric < 0
      or (doc->'logistics'->>field)::numeric > 10080 then
      raise exception using errcode = '22023', message = 'Revisa los minutos previstos de montaje y traslado.';
    end if;
  end loop;
  foreach field in array array['installerIds','teardownIds'] loop
    if jsonb_typeof(doc->'logistics'->field) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'La logística debe contener listas de responsables.';
    end if;
    for member in select jsonb_array_elements_text(doc->'logistics'->field) loop
      if not exists (select 1 from public.crm_collaborators c where c.id::text = member) then
        raise exception using errcode = '22023', message = 'Un responsable logístico ya no existe en el registro de colaboradores.';
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
    first_time := mrfiesta_production_private.local_time(entry->>'start');
    last_time := mrfiesta_production_private.local_time(entry->>'end');
    if jsonb_typeof(entry->'responsibleIds') is distinct from 'array'
      or not coalesce(entry->>'status' = any(array['pending','preparing','live','completed','cancelled']),false)
      or not coalesce(entry->>'kind' = any(array['setup','test','show','travel','teardown','other']),false) then
      raise exception using errcode = '22023', message = 'Una actividad del cronograma tiene un formato inválido.';
    end if;
    for member in select jsonb_array_elements_text(entry->'responsibleIds') loop
      if not exists (select 1 from public.crm_collaborators c where c.id::text = member) then
        raise exception using errcode = '22023', message = 'Un responsable de actividad no existe en colaboradores.';
      end if;
    end loop;
    if ready and entry->>'status' <> 'cancelled' and
      (nullif(btrim(entry->>'name'),'') is null or first_time is null or last_time is null or last_time <= first_time
       or jsonb_array_length(entry->'responsibleIds') = 0) then
      raise exception using errcode = '22023', message = 'Para ejecución, completa nombre, fechas y responsable de cada actividad.';
    end if;
    if ready and entry->>'status' <> 'cancelled' then
      for member in select jsonb_array_elements_text(entry->'responsibleIds') loop
        if not exists (select 1 from jsonb_array_elements(doc->'staff') s where s->>'collaboratorId'=member and s->>'confirmation' <> 'declined') then
          raise exception using errcode = '22023', message = 'Un responsable del cronograma no está asignado al personal activo del evento.';
        end if;
        exception_key := 'activity-availability-' || (entry->>'id') || '-' || member;
        if not exists (select 1 from jsonb_array_elements(doc->'staff') s where s->>'collaboratorId'=member and s->>'confirmation' <> 'declined'
          and mrfiesta_production_private.local_time(coalesce(nullif(s->>'arrival',''),s->>'start')) <= first_time
          and mrfiesta_production_private.local_time(s->>'end') >= last_time)
          and not exists (select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key'=exception_key and char_length(btrim(ex->>'reason')) >= 8) then
          raise exception using errcode = '22023', message = 'El responsable de una actividad no cubre todo su horario.';
        end if;
      end loop;
      for other_entry in select value from jsonb_array_elements(doc->'activities') a where a->>'status' <> 'cancelled' and a->>'id' > entry->>'id' loop
        if first_time < mrfiesta_production_private.local_time(other_entry->>'end') and last_time > mrfiesta_production_private.local_time(other_entry->>'start')
          and exists (select 1 from jsonb_array_elements_text(entry->'responsibleIds') as r(person_id) where other_entry->'responsibleIds' ? r.person_id) then
          exception_key := 'activity-overlap-' || (entry->>'id') || '-' || (other_entry->>'id');
          if not exists (select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key'=exception_key and char_length(btrim(ex->>'reason')) >= 8) then
            raise exception using errcode = '22023', message = 'Un mismo responsable tiene actividades superpuestas. Corrige el cronograma o justifica la compatibilidad.';
          end if;
        end if;
      end loop;
    end if;
  end loop;
  foreach field in array array['staff','equipment'] loop
    for entry in select value from jsonb_array_elements(doc->field) loop
      first_time := mrfiesta_production_private.local_time(entry->>'start');
      last_time := mrfiesta_production_private.local_time(entry->>'end');
      if jsonb_typeof(entry->'transferMinutes') is distinct from 'number' or (entry->>'transferMinutes')::numeric < 0
        or (entry->>'transferMinutes')::numeric > 10080 then
        raise exception using errcode = '22023', message = 'Revisa los minutos de traslado de los recursos.';
      end if;
      if field = 'staff' then
        perform mrfiesta_production_private.local_time(entry->>'arrival');
        member := entry->>'collaboratorId';
        if coalesce(member,'') <> '' and not exists (select 1 from public.crm_collaborators c where c.id::text = member) then
          raise exception using errcode = '22023', message = 'Selecciona personal del registro real de colaboradores.';
        end if;
        if jsonb_typeof(entry->'fee') is distinct from 'number' or (entry->>'fee')::numeric < 0
          or not coalesce(entry->>'confirmation' = any(array['pending','confirmed','declined']),false) then
          raise exception using errcode = '22023', message = 'Revisa los honorarios y la confirmación del personal.';
        end if;
      else
        member := entry->>'assetId';
        if coalesce(member,'') <> '' and not exists (select 1 from public.crm_production_assets a where a.id::text = member) then
          raise exception using errcode = '22023', message = 'Selecciona un equipo del inventario real.';
        end if;
        if not coalesce(entry->>'status' = any(array['reserved','installed','in_use','pickup','available','maintenance']),false) then
          raise exception using errcode = '22023', message = 'Revisa el estado de disponibilidad del equipo.';
        end if;
      end if;
      if ready and not (field = 'staff' and entry->>'confirmation' = 'declined') then
        if coalesce(member,'') = '' or first_time is null or last_time is null or last_time <= first_time then
          raise exception using errcode = '22023', message = 'Para ejecución, completa el recurso y las fechas de sus asignaciones.';
        end if;
        if field = 'staff' and entry->>'confirmation' <> 'confirmed' then
          raise exception using errcode = '22023', message = 'Confirma al personal antes de marcar el evento listo.';
        end if;
        if field = 'staff' then
          if nullif(btrim(entry->>'role'),'') is null or mrfiesta_production_private.local_time(entry->>'arrival') is null
            or mrfiesta_production_private.local_time(entry->>'arrival') > first_time then
            raise exception using errcode = '22023', message = 'Completa la función y llegada del personal antes de su inicio.';
          end if;
          first_time := mrfiesta_production_private.local_time(entry->>'arrival');
        end if;
        if field = 'equipment' and (entry->>'status' = 'maintenance' or exists (select 1 from public.crm_production_assets a where a.id::text = member and a.status = 'maintenance')) then
          raise exception using errcode = '22023', message = 'Un equipo en mantenimiento no puede asignarse a ejecución.';
        end if;
        if field = 'equipment' then
          if (select count(*) from jsonb_array_elements(doc->'equipment') a where a->>'assetId'=member) > 1 then
            raise exception using errcode = '22023', message = 'Un equipo está duplicado dentro del mismo plan. Usa una única reserva que cubra la operación.';
          end if;
          required_end := mrfiesta_production_private.local_time(base_event.fecha_evento::text || 'T' || base_event.hora_fin);
          if required_end < mrfiesta_production_private.local_time(base_event.fecha_evento::text || 'T' || base_event.hora_inicio) then
            required_end := required_end + interval '1 day';
          end if;
          required_end := greatest(required_end,mrfiesta_production_private.local_time(doc->'logistics'->>'pickup'),mrfiesta_production_private.local_time(doc->'logistics'->>'teardown'),
            (select max(mrfiesta_production_private.local_time(a->>'end')) from jsonb_array_elements(doc->'activities') a where a->>'kind'='teardown' and a->>'status' <> 'cancelled'));
          required_start := least(mrfiesta_production_private.local_time(doc->'logistics'->>'installation'),
            (select min(mrfiesta_production_private.local_time(a->>'start')) from jsonb_array_elements(doc->'activities') a where a->>'kind'='setup' and a->>'status' <> 'cancelled'));
          if first_time > required_start or last_time < required_end then
            raise exception using errcode = '22023', message = 'La reserva del equipo debe cubrir desde la instalación hasta el recojo, desmontaje o final del servicio.';
          end if;
        end if;
        -- Conflicts can be drafted; ready/executing states require an explicit exception per resource pair.
        for existing_plan in select event_id, document from public.crm_production_plans where event_id <> new.event_id loop
          for other_entry in select value from jsonb_array_elements(existing_plan.document->field) loop
            if (field = 'staff' and other_entry->>'collaboratorId' = member and other_entry->>'confirmation' <> 'declined')
              or (field = 'equipment' and other_entry->>'assetId' = member) then
              other_start := mrfiesta_production_private.local_time(case when field='staff' then coalesce(nullif(other_entry->>'arrival',''),other_entry->>'start') else other_entry->>'start' end);
              other_end := mrfiesta_production_private.local_time(other_entry->>'end');
              transfer := ceiling(greatest(coalesce((entry->>'transferMinutes')::numeric,0),coalesce((other_entry->>'transferMinutes')::numeric,0)))::integer;
              if field = 'staff' then
                transfer := ceiling(greatest(transfer,coalesce((doc->'logistics'->>'transferMinutes')::numeric,0),coalesce((existing_plan.document->'logistics'->>'transferMinutes')::numeric,0)))::integer;
              end if;
              if first_time < other_end and last_time > other_start then
                raise exception using errcode = '22023', message = 'Un recurso está asignado simultáneamente a dos eventos. Corrige las fechas o reasígnalo; una justificación no elimina el conflicto físico.';
              end if;
              if first_time < other_end + make_interval(mins => transfer) and last_time + make_interval(mins => transfer) > other_start
                and not exists (select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key' = 'resource:' || field || ':' || member || ':' || existing_plan.event_id::text and char_length(btrim(ex->>'reason')) >= 8) then
                raise exception using errcode = '22023', message = 'Conflicto de ' || case when field='staff' then 'personal' else 'equipo' end || ' con otro evento. Resuélvelo o registra una excepción justificada.';
              end if;
            end if;
          end loop;
        end loop;
      end if;
    end loop;
  end loop;
  if ready then
    if nullif(btrim(base_event.direccion),'') is null or nullif(btrim(base_event.lugar),'') is null
      or coalesce(base_event.hora_inicio,'') !~ '^\d{2}:\d{2}' or coalesce(base_event.hora_fin,'') !~ '^\d{2}:\d{2}' then
      raise exception using errcode = '22023', message = 'Confirma dirección, distrito y horarios del evento en el CRM.';
    end if;
    foreach field in array array['contract','services','address','times','staff','equipment','materials','transport','schedule','client'] loop
      if not exists (select 1 from jsonb_array_elements(doc->'checklist') task where task->>'id'=field and task->>'done'='true' and nullif(task->>'completedBy','') is not null and nullif(task->>'completedAt','') is not null) then
        raise exception using errcode = '22023', message = 'Completa el checklist previo antes de marcar el evento listo: ' || field;
      end if;
    end loop;
    if jsonb_array_length(doc->'activities') = 0 or not exists (select 1 from jsonb_array_elements(doc->'activities') a where a->>'status' <> 'cancelled' and a->>'kind' = 'show') then
      raise exception using errcode = '22023', message = 'El cronograma con actividades de servicio es obligatorio para ejecución.';
    end if;
    if doc->>'reviewedContract' <> 'true' then
      raise exception using errcode = '22023', message = 'Revisa los compromisos contractuales antes de ejecución.';
    end if;
    if jsonb_array_length(doc->'staff') = 0 or nullif(doc->'logistics'->>'installation','') is null or jsonb_array_length(doc->'logistics'->'installerIds') = 0 then
      raise exception using errcode = '22023', message = 'Programa la instalación, su responsable y el personal del evento.';
    end if;
    for member in select jsonb_array_elements_text(doc->'logistics'->'installerIds') loop
      if not exists (select 1 from jsonb_array_elements(doc->'staff') s where s->>'collaboratorId'=member and s->>'confirmation'='confirmed') then
        raise exception using errcode = '22023', message = 'El responsable de instalación debe estar asignado y confirmado en Personal.';
      end if;
    end loop;
    if not exists (select 1 from jsonb_array_elements(doc->'activities') a where a->>'kind' = 'setup' and a->>'status' <> 'cancelled')
       or not exists (select 1 from jsonb_array_elements(doc->'activities') a where a->>'kind' = 'test' and a->>'status' <> 'cancelled') then
      raise exception using errcode = '22023', message = 'Programa el montaje y las pruebas técnicas en el cronograma.';
    end if;
    select min(mrfiesta_production_private.local_time(a->>'start')) into show_start
      from jsonb_array_elements(doc->'activities') a where a->>'kind'='show' and a->>'status' <> 'cancelled';
    foreach field in array array['setup','test'] loop
      exception_key := case when field='setup' then 'setup-after-show' else 'tests-after-show' end;
      if exists (select 1 from jsonb_array_elements(doc->'activities') a where a->>'kind'=field and a->>'status' <> 'cancelled'
        and mrfiesta_production_private.local_time(a->>'end') > show_start)
        and not exists (select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key'=exception_key and char_length(btrim(ex->>'reason')) >= 8) then
        raise exception using errcode = '22023', message = 'El montaje y las pruebas deben terminar antes del servicio o contar con una excepción justificada.';
      end if;
    end loop;
    if exists (select 1 from jsonb_array_elements(doc->'commitments') c where c->>'prepared' is distinct from 'true') then
      raise exception using errcode = '22023', message = 'Existen compromisos contractuales todavía sin preparar.';
    end if;
    for service in select * from mrfiesta_production_private.required_services(base_event) loop
      if not exists (select 1 from jsonb_array_elements(doc->'commitments') c where c->>'key'=service.service_key and c->>'prepared'='true') then
        raise exception using errcode = '22023', message = 'Falta preparar un servicio registrado en el contrato: ' || service.service_key;
      end if;
      role_pattern := case service.service_key when 'dj' then '\ydj\y' when 'animation' then 'animador|animadora|animacion'
        when 'glitter' then 'glitter|maquill' when 'makeup' then 'maquill|glitter' when 'assistant' then 'asistente|staff|produccion' else null end;
      if role_pattern is not null and not exists (select 1 from jsonb_array_elements(doc->'staff') s
        where s->>'confirmation'='confirmed' and lower(translate(s->>'role','ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) ~ role_pattern) then
        raise exception using errcode = '22023', message = 'Falta personal confirmado para un servicio contratado: ' || service.service_key;
      end if;
      if service.service_key in ('led','projection','sound','lights','smoke','bubbles','decoration','effects') and not exists (
        select 1 from jsonb_array_elements(doc->'equipment') eq join public.crm_production_assets a on a.id::text=eq->>'assetId'
        where lower(translate(a.name || ' ' || a.category || ' ' || a.identifier,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) ~ service.service_pattern
      ) then
        raise exception using errcode = '22023', message = 'Falta un equipo identificado para un servicio contratado: ' || service.service_key;
      end if;
      if service.service_minutes is not null then
        select coalesce(sum(extract(epoch from (mrfiesta_production_private.local_time(a->>'end') - mrfiesta_production_private.local_time(a->>'start'))) / 60),0)
          into service_duration from jsonb_array_elements(doc->'activities') a where a->>'serviceKey'=service.service_key and a->>'status' <> 'cancelled';
        if service_duration < service.service_minutes and not exists (
          select 1 from jsonb_array_elements(doc->'exceptions') ex where ex->>'key'='duration-' || service.service_key and char_length(btrim(ex->>'reason')) >= 8
        ) then
          raise exception using errcode = '22023', message = 'La duración programada es menor a la del servicio contratado: ' || service.service_key;
        end if;
      end if;
    end loop;
  end if;
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.document := doc;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

commit;

