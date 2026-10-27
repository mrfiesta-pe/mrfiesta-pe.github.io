-- Positive readiness and resource conflicts, using real event/collaborator identifiers.
-- Fixtures are operational documents/equipment only, and the whole transaction rolls back.
begin;
create temporary table resource_test_results(test text primary key, passed boolean not null) on commit drop;
grant select,insert on resource_test_results to authenticated;

create function pg_temp.production_fixture(e public.crm_events, person uuid, asset uuid, operation_start timestamp)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  activities jsonb;
  checklist jsonb := '[]'::jsonb;
  commitments jsonb := '[]'::jsonb;
  required_service record;
  cursor_time timestamp := operation_start + interval '2 hours';
  end_time timestamp;
  key text;
  has_service boolean := false;
  fmt constant text := 'YYYY-MM-DD"T"HH24:MI';
begin
  activities := jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'name','Prueba transaccional: montaje','kind','setup','status','pending','start',to_char(operation_start,fmt),'end',to_char(operation_start+interval '1 hour',fmt),'responsibleIds',jsonb_build_array(person),'notes','Test fixture'),
    jsonb_build_object('id',gen_random_uuid(),'name','Prueba transaccional: pruebas','kind','test','status','pending','start',to_char(operation_start+interval '1 hour',fmt),'end',to_char(operation_start+interval '90 minutes',fmt),'responsibleIds',jsonb_build_array(person),'notes','Test fixture'));
  for required_service in select * from mrfiesta_production_private.required_services(e) loop
    commitments := commitments || jsonb_build_array(jsonb_build_object('key',required_service.service_key,'planned',true,'prepared',true,'clientConfirmed',false,'executed',false,'notes','Test fixture; not a client agreement'));
    if required_service.service_minutes is not null then
      end_time := cursor_time + make_interval(mins => ceiling(required_service.service_minutes)::integer);
      activities := activities || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Prueba de duración ' || required_service.service_key,'serviceKey',required_service.service_key,'kind','show','status','pending','start',to_char(cursor_time,fmt),'end',to_char(end_time,fmt),'responsibleIds',jsonb_build_array(person),'notes','Test fixture'));
      cursor_time := end_time;
      has_service := true;
    end if;
  end loop;
  if not has_service then
    activities := activities || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Prueba transaccional: servicio','kind','show','status','pending','start',to_char(cursor_time,fmt),'end',to_char(cursor_time+interval '1 hour',fmt),'responsibleIds',jsonb_build_array(person),'notes','Test fixture'));
  end if;
  foreach key in array array['contract','services','address','times','staff','equipment','materials','transport','schedule','client'] loop
    checklist := checklist || jsonb_build_array(jsonb_build_object('id',key,'stage','before','label',key,'done',true));
  end loop;
  return jsonb_build_object('version',1,'eventId',e.id,'status','ready','activities',activities,
    'staff',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'collaboratorId',person,'role','DJ animador animación Glitter maquilladora staff asistente producción instalación desmontaje','arrival',to_char(operation_start,fmt),'start',to_char(operation_start,fmt),'end',to_char(operation_start+interval '3 days',fmt),'confirmation','confirmed','notes','Test fixture','fee',0,'transferMinutes',45)),
    'equipment',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'assetId',asset,'start',to_char(operation_start,fmt),'end',to_char(operation_start+interval '3 days',fmt),'status','reserved','notes','Test fixture','transferMinutes',45)),
    'logistics',jsonb_build_object('installation',to_char(operation_start,fmt),'pickup',to_char(operation_start+interval '3 days',fmt),'installerIds',jsonb_build_array(person),'teardownIds',jsonb_build_array(person),'setupMinutes',60,'transferMinutes',45),
    'checklist',checklist,'commitments',commitments,'agreements','[]'::jsonb,'costs','[]'::jsonb,'payments','[]'::jsonb,'exceptions','[]'::jsonb,'reviewedContract',true,'notes','Test fixture; rolled back, never an operational assignment');
end;
$$;
grant execute on function pg_temp.production_fixture(public.crm_events,uuid,uuid,timestamp) to authenticated;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from public.admins limit 1),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$
declare
  first_event public.crm_events;
  second_event public.crm_events;
  person_one uuid;
  person_two uuid;
  asset_one uuid;
  asset_two uuid;
  first_doc jsonb;
  second_doc jsonb;
  saved public.crm_production_plans;
  first_start timestamp;
  first_end timestamp;
  rejected boolean;
  error_message text;
begin
  select * into first_event from public.crm_events e where e.fecha_evento='2026-10-31' and nullif(btrim(e.direccion),'') is not null
    and not exists (select 1 from public.crm_production_plans p where p.event_id=e.id) order by e.id limit 1;
  select * into second_event from public.crm_events e where e.fecha_evento='2026-10-31' and e.id <> first_event.id and nullif(btrim(e.direccion),'') is not null
    and not exists (select 1 from public.crm_production_plans p where p.event_id=e.id) order by e.id limit 1;
  select c.id into person_one from public.crm_collaborators c where c.activo and not exists
    (select 1 from public.crm_production_plans p cross join lateral jsonb_array_elements(p.document->'staff') s where s->>'collaboratorId'=c.id::text) order by c.id limit 1;
  select c.id into person_two from public.crm_collaborators c where c.activo and c.id <> person_one and not exists
    (select 1 from public.crm_production_plans p cross join lateral jsonb_array_elements(p.document->'staff') s where s->>'collaboratorId'=c.id::text) order by c.id limit 1;
  if first_event.id is null or second_event.id is null or person_one is null or person_two is null then
    raise exception 'Estas pruebas requieren dos eventos del 31 de octubre sin plan y dos colaboradores activos sin asignaciones. No se modificó ningún evento.';
  end if;
  insert into public.crm_production_assets(name,identifier,category,status) values ('Prueba transaccional de recursos','TX-'||gen_random_uuid(),'Pista LED proyector ecran sonido luces humo burbujas decoración','available') returning id into asset_one;
  insert into public.crm_production_assets(name,identifier,category,status) values ('Prueba transaccional de recursos 2','TX-'||gen_random_uuid(),'Pista LED proyector ecran sonido luces humo burbujas decoración','available') returning id into asset_two;
  first_start := first_event.fecha_evento::timestamp;
  first_end := first_start + interval '3 days';
  first_doc := pg_temp.production_fixture(first_event,person_one,asset_one,first_start);
  select * into saved from public.save_crm_production_plan(first_event.id,first_doc,0);
  if saved.document->>'status' <> 'ready' or saved.revision <> 1 then raise exception 'No guardó un plan completo válido como listo.'; end if;
  insert into resource_test_results values ('complete plan can reach ready with real source services and resource IDs',true);

  rejected := false;
  second_doc := pg_temp.production_fixture(second_event,person_one,asset_two,first_start);
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics error_message = message_text; rejected := error_message like '%simultáneamente%'; end;
  if not rejected then raise exception 'No detectó superposición física de personal.'; end if;
  insert into resource_test_results values ('same collaborator cannot occupy two events simultaneously',true);

  rejected := false;
  second_doc := jsonb_set(second_doc,'{exceptions}',jsonb_build_array(jsonb_build_object('key','resource:staff:' || person_one || ':' || first_event.id,'reason','Intento de justificar una superposición física')));
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics error_message = message_text; rejected := error_message like '%simultáneamente%'; end;
  if not rejected then raise exception 'Una excepción eliminó indebidamente un conflicto físico.'; end if;
  insert into resource_test_results values ('physical overlap cannot be bypassed by an exception note',true);

  rejected := false;
  second_doc := pg_temp.production_fixture(second_event,person_two,asset_one,first_start);
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics error_message = message_text; rejected := error_message like '%simultáneamente%'; end;
  if not rejected then raise exception 'No detectó superposición física de equipos.'; end if;
  insert into resource_test_results values ('same identified asset cannot occupy two events simultaneously',true);

  rejected := false;
  second_doc := pg_temp.production_fixture(second_event,person_one,asset_one,first_end+interval '10 minutes');
  begin perform public.save_crm_production_plan(second_event.id,second_doc,0);
  exception when invalid_parameter_value then get stacked diagnostics error_message = message_text; rejected := error_message like '%Conflicto de%'; end;
  if not rejected then raise exception 'No detectó tiempo insuficiente de traslado entre eventos.'; end if;
  insert into resource_test_results values ('ten minute transfer is rejected when forty five minutes are required',true);

  second_doc := jsonb_set(second_doc,'{exceptions}',jsonb_build_array(
    jsonb_build_object('key','resource:staff:' || person_one || ':' || first_event.id,'reason','Traslado excepcional verificado para la prueba transaccional'),
    jsonb_build_object('key','resource:equipment:' || asset_one || ':' || first_event.id,'reason','Traslado excepcional verificado para la prueba transaccional')));
  select * into saved from public.save_crm_production_plan(second_event.id,second_doc,0);
  if saved.document->>'status' <> 'ready' then raise exception 'No respetó la excepción específica de traslado.'; end if;
  insert into resource_test_results values ('specific documented transfer exception permits valid nonoverlapping reservations',true);

  rejected := false;
  begin perform public.save_crm_production_plan(first_event.id,jsonb_set(jsonb_set(first_doc,'{status}','"closed"'::jsonb),'{activities}','[]'::jsonb),1);
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Se pudo eludir validación saltando a cerrado.'; end if;
  insert into resource_test_results values ('closed state cannot bypass mandatory schedule validation',true);

  rejected := false;
  begin perform public.save_crm_production_plan(first_event.id,jsonb_set(first_doc,'{equipment}',(first_doc->'equipment') || (first_doc->'equipment')),1);
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Se permitió duplicar un mismo equipo en el plan.'; end if;
  insert into resource_test_results values ('duplicate asset reservation is rejected',true);
end;
$$;
reset role;
select jsonb_agg(to_jsonb(results) order by test) as resource_tests from resource_test_results results;
rollback;
select 'PASS: 8 transactional readiness and resource assertions; fixtures rolled back' as validation;
