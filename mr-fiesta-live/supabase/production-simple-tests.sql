-- Current simple-workflow integration tests. Existing events and collaborators are read only.
-- Operational documents, equipment and audit fixtures are reverted at the end.
begin;
create temporary table simple_test_results(test text primary key,passed boolean not null) on commit drop;
grant select,insert on simple_test_results to authenticated;
create temporary table simple_original_snapshot as
  select md5(string_agg(to_jsonb(e)::text,'' order by id)) as checksum,count(*) as rows from public.crm_events e;

create function pg_temp.simple_fixture(e public.crm_events,person uuid,operation_start timestamp,operation_end timestamp)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  checklist jsonb := '[]'::jsonb;
  key text;
  fmt constant text := 'YYYY-MM-DD"T"HH24:MI';
begin
  for key in select * from mrfiesta_production_private.departure_checks(e) loop
    checklist := checklist || jsonb_build_array(jsonb_build_object('id',key,'stage','before','label',key,'done',true,'completedBy','client-forged-author','completedAt','1999-01-01T00:00:00Z'));
  end loop;
  return jsonb_build_object('version',1,'eventId',e.id,'status','ready','activities','[]'::jsonb,'equipment','[]'::jsonb,
    'staff',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'collaboratorId',person,
      'role','DJ animador animación Glitter maquilladora staff asistente producción',
      'arrival','','start',to_char(operation_start,fmt),'end',to_char(operation_end,fmt),'confirmation','confirmed','fee',0,'transferMinutes',45,'notes','Fixture transaccional, no es una asignación real')),
    'checklist',checklist,'commitments',jsonb_build_array(jsonb_build_object('key','dj','planned',false,'prepared',false,'clientConfirmed',false,'executed',false,'notes','')),
    'agreements','[]'::jsonb,'costs','[]'::jsonb,'payments','[]'::jsonb,'exceptions','[]'::jsonb,'notes','Fixture que se revierte con ROLLBACK','reviewedContract',false,
    'logistics',jsonb_build_object('departure','','installation','','arrival','','test','','serviceStart','','teardown','','pickup','','installerIds','[]'::jsonb,'teardownIds','[]'::jsonb,'setupMinutes',0,'transferMinutes',0));
end;
$$;
grant execute on function pg_temp.simple_fixture(public.crm_events,uuid,timestamp,timestamp) to authenticated;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from public.admins limit 1),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$
declare
  first_event public.crm_events;
  second_event public.crm_events;
  person uuid;
  first_doc jsonb;
  second_doc jsonb;
  saved public.crm_production_plans;
  start_time timestamp;
  end_time timestamp;
  rejected boolean;
  message text;
  asset uuid;
  copied_event public.crm_events;
  expected text[];
  changed text[];
begin
  select * into first_event from public.crm_events e
    where nullif(btrim(e.direccion),'') is not null and nullif(btrim(e.lugar),'') is not null
      and e.hora_inicio ~ '^\d{2}:\d{2}' and e.hora_fin ~ '^\d{2}:\d{2}' and left(e.hora_inicio,5)<>left(e.hora_fin,5)
      and exists(select 1 from mrfiesta_production_private.required_services(e) s where s.service_key='dj')
      and not exists(select 1 from public.crm_production_plans p where p.event_id=e.id) order by e.id limit 1;
  select * into second_event from public.crm_events e where e.id <> first_event.id
    and nullif(btrim(e.direccion),'') is not null and nullif(btrim(e.lugar),'') is not null
    and e.hora_inicio ~ '^\d{2}:\d{2}' and e.hora_fin ~ '^\d{2}:\d{2}' and left(e.hora_inicio,5)<>left(e.hora_fin,5)
    and not exists(select 1 from public.crm_production_plans p where p.event_id=e.id) order by e.id limit 1;
  select id into person from public.crm_collaborators c where c.activo and not exists(
    select 1 from public.crm_production_plans p cross join lateral jsonb_array_elements(p.document->'staff') s where s->>'collaboratorId'=c.id::text) order by c.id limit 1;
  if first_event.id is null or second_event.id is null or person is null then
    raise exception 'Estas pruebas requieren dos eventos completos sin plan y un colaborador activo sin asignaciones; no se modificó ningún evento.';
  end if;
  start_time := first_event.fecha_evento::timestamp;
  end_time := start_time + interval '4 hours';
  first_doc := pg_temp.simple_fixture(first_event,person,start_time,end_time);
  -- Read-only composite copies exercise package fallback and exact additional text.
  copied_event := first_event;
  copied_event.paquete := ' EXPERIENCIA NEON ';
  copied_event.detalle_servicio := '';
  copied_event.adicionales_requerimientos := '';
  copied_event.adicionales := '';
  select array_agg(required) into expected from mrfiesta_production_private.departure_checks(copied_event) required;
  if not expected @> array['simple-out-glitter','simple-out-effects','simple-out-dj'] or 'simple-out-led'=any(expected) then
    raise exception 'El fallback de paquete no coincide con el catálogo real del CRM.';
  end if;
  insert into simple_test_results values('blank stored detail uses the CRM package catalog without changing the original row',true);

  copied_event.paquete := 'Ultra Chicoteca LED';
  copied_event.detalle_servicio := 'DJ. No incluye pista LED.';
  select array_agg(required) into expected from mrfiesta_production_private.departure_checks(copied_event) required;
  if not 'simple-out-dj'=any(expected) or 'simple-out-led'=any(expected) then
    raise exception 'El nombre del paquete reemplazó indebidamente el detalle contractual guardado.';
  end if;
  insert into simple_test_results values('explicit stored inclusions and exclusions take priority over package defaults',true);

  copied_event.adicionales_requerimientos := E'  Cartel Súper Fiesta 🎉 \t;Globos rojos\nCartel Súper Fiesta 🎉';
  copied_event.adicionales := E'Globos rojos; Mesa adicional';
  select array_agg(required) into expected from mrfiesta_production_private.departure_checks(copied_event) required;
  if not expected @> array['simple-extra-'||encode(convert_to('Cartel Súper Fiesta 🎉','UTF8'),'hex'),
    'simple-extra-'||encode(convert_to('Globos rojos','UTF8'),'hex'),'simple-extra-'||encode(convert_to('Mesa adicional','UTF8'),'hex')]
    or (select count(*) from unnest(expected) item where item like 'simple-extra-%')<>3 then
    raise exception 'Los adicionales no conservan su texto exacto o no se deduplican correctamente.';
  end if;
  copied_event.adicionales_requerimientos := 'Cartel Súper Fiesta actualizado 🎉';
  copied_event.adicionales := '';
  select array_agg(required) into changed from mrfiesta_production_private.departure_checks(copied_event) required;
  if ('simple-extra-'||encode(convert_to('Cartel Súper Fiesta 🎉','UTF8'),'hex'))=any(changed)
    or not ('simple-extra-'||encode(convert_to('Cartel Súper Fiesta actualizado 🎉','UTF8'),'hex'))=any(changed) then
    raise exception 'Un adicional modificado heredaría un check antiguo.';
  end if;
  insert into simple_test_results values('each exact additional gets its own UTF8 identity and changed text creates a fresh check',true);

  select * into saved from public.save_crm_production_plan(first_event.id,first_doc,0);
  if saved.revision<>1 or saved.document->>'status'<>'ready' or jsonb_array_length(saved.document->'activities')<>0 or jsonb_array_length(saved.document->'equipment')<>0
    or saved.document->>'reviewedContract'<>'false' then raise exception 'El flujo simple aún exige formularios eliminados.'; end if;
  insert into simple_test_results values('ready accepts automatic/empty schedule, blank logistics, no equipment or commitment ticks',true);

  if saved.document->'checklist'->0->>'completedBy'<>auth.uid()::text or saved.document->'checklist'->0->>'completedAt'='1999-01-01T00:00:00Z' then
    raise exception 'La simplificación perdió la autoría de checklist del servidor.';
  end if;
  if not exists(select 1 from public.crm_production_audit a where a.event_id=first_event.id and a.new_value=saved.document and a.actor=auth.uid()) then
    raise exception 'La simplificación perdió el registro interno de integridad.';
  end if;
  insert into simple_test_results values('checklist identity and immutable internal audit remain server generated',true);

  rejected := false;
  begin perform public.save_crm_production_plan(first_event.id,jsonb_set(first_doc,'{checklist,0,done}','false'::jsonb),1);
  exception when invalid_parameter_value then get stacked diagnostics message=message_text; rejected := message like '%checklist de salida%'; end;
  if not rejected then raise exception 'Se permitió listo con checklist previo pendiente.'; end if;
  insert into simple_test_results values('an unchecked required before item prevents ready',true);

  rejected := false;
  begin perform public.save_crm_production_plan(first_event.id,jsonb_set(first_doc,'{staff}','[]'::jsonb),1);
  exception when invalid_parameter_value then get stacked diagnostics message=message_text; rejected := message like '%personal confirmado%'; end;
  if not rejected then raise exception 'Se permitió listo sin personal esencial contratado.'; end if;
  insert into simple_test_results values('essential contracted personnel remain required',true);

  -- Existing hidden operational content stays valid but is no longer a readiness form.
  insert into public.crm_production_assets(name,identifier,category,status) values('Fixture simple: equipo heredado','SIMPLE-TX-'||gen_random_uuid(),'Prueba','maintenance') returning id into asset;
  first_doc := jsonb_set(first_doc,'{activities}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Actividad heredada incompleta','kind','setup','status','pending','start','','end','','responsibleIds','[]'::jsonb,'notes','Dato heredado preservado')));
  first_doc := jsonb_set(first_doc,'{equipment}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'assetId',asset,'start','','end','','status','maintenance','transferMinutes',0,'notes','Dato heredado preservado')));
  select * into saved from public.save_crm_production_plan(first_event.id,first_doc,1);
  if saved.revision<>2 or saved.document->'activities'->0->>'name'<>'Actividad heredada incompleta' or saved.document->'equipment'->0->>'assetId'<>asset::text then
    raise exception 'Se perdió o bloqueó información anterior de pantallas eliminadas.';
  end if;
  insert into simple_test_results values('legacy hidden activity and equipment data are preserved without readiness blockers',true);

  first_doc := jsonb_set(first_doc,'{checklist}',(first_doc->'checklist')||jsonb_build_array(jsonb_build_object('id','simple-extra-6f62736f6c657465','label','Adicional antiguo que ya no está en el contrato','stage','before','done',false)));
  select * into saved from public.save_crm_production_plan(first_event.id,first_doc,2);
  if saved.revision<>3 then raise exception 'Un check histórico oculto bloqueó el estado listo.'; end if;
  insert into simple_test_results values('obsolete hidden generated checks are retained without blocking current departure readiness',true);

  second_doc := pg_temp.simple_fixture(second_event,person,start_time,end_time);
  rejected := false;
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics message=message_text; rejected := message like '%simultáneamente%'; end;
  if not rejected then raise exception 'No detectó un colaborador ocupado en dos eventos.'; end if;
  insert into simple_test_results values('physical collaborator overlaps remain blocked',true);

  second_doc := jsonb_set(second_doc,'{exceptions}',jsonb_build_array(jsonb_build_object('key','resource:staff:'||person||':'||first_event.id,'reason','No debe ocultar una superposición física')));
  rejected := false;
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics message=message_text; rejected := message like '%simultáneamente%'; end;
  if not rejected then raise exception 'Una nota permitió una superposición física.'; end if;
  insert into simple_test_results values('an exception cannot hide a physical staff conflict',true);

  second_doc := pg_temp.simple_fixture(second_event,person,end_time+interval '10 minutes',end_time+interval '2 hours');
  rejected := false;
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics message=message_text; rejected := message like '%traslado%'; end;
  if not rejected then raise exception 'No detectó tiempo insuficiente de traslado.'; end if;
  insert into simple_test_results values('assigned staff transfer minutes remain enforced',true);

  second_doc := jsonb_set(second_doc,'{exceptions}',jsonb_build_array(jsonb_build_object('key','resource:staff:'||person||':'||first_event.id,'reason','Excepción de traslado acordada y verificada en prueba')));
  select * into saved from public.save_crm_production_plan(second_event.id,second_doc,0);
  if saved.document->>'status'<>'ready' then raise exception 'No admitió excepción específica de traslado.'; end if;
  insert into simple_test_results values('specific transfer justification still permits nonoverlapping staff assignments',true);
end;
$$;
reset role;
do $$
begin
  if (select checksum from simple_original_snapshot) is distinct from (select md5(string_agg(to_jsonb(e)::text,'' order by id)) from public.crm_events e)
    or (select rows from simple_original_snapshot)<>(select count(*) from public.crm_events) then
    raise exception 'Una prueba modificó los eventos originales.';
  end if;
end;
$$;
rollback;
select 'PASS: 13 simple-workflow database assertions; fixtures rolled back and original events unchanged' as validation;
