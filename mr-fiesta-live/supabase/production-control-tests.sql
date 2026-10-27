-- Integration and access-control checks. Run as the database migration owner.
-- Every plan, asset and audit fixture is rolled back. Existing CRM rows are read only.
begin;
create temporary table production_test_results(test text primary key, passed boolean not null) on commit drop;
grant select,insert on production_test_results to authenticated,anon;
select set_config('mrfiesta.test_event_id', (select e.id::text from public.crm_events e
  where not exists (select 1 from public.crm_production_plans p where p.event_id=e.id) order by e.id limit 1), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',(select user_id from public.admins limit 1),'role','authenticated','is_anonymous',false)::text, true);
set local role authenticated;

do $$
declare
  test_event_id uuid := nullif(current_setting('mrfiesta.test_event_id',true),'')::uuid;
  doc jsonb;
  saved public.crm_production_plans;
  saved_again public.crm_production_plans;
  rejected boolean;
begin
  if test_event_id is null then raise exception 'Las pruebas requieren un evento sin plan; no se modificó ningún evento existente.'; end if;
  if not public.is_admin() then raise exception 'La cuenta de prueba no es administradora.'; end if;
  doc := jsonb_build_object('version',1,'eventId',test_event_id,'status','planning','activities','[]'::jsonb,'staff','[]'::jsonb,
    'equipment','[]'::jsonb,'checklist',jsonb_build_array(jsonb_build_object('id','contract','stage','before','label','Contrato revisado','done',true,'completedBy','forged','completedAt','1999-01-01T00:00:00Z')),
    'commitments','[]'::jsonb,'agreements','[]'::jsonb,'costs','[]'::jsonb,'payments','[]'::jsonb,'exceptions','[]'::jsonb,
    'logistics',jsonb_build_object('installerIds','[]'::jsonb,'teardownIds','[]'::jsonb,'setupMinutes',60,'transferMinutes',45),
    'notes','Transactional integration test; never committed','reviewedContract',false);

  select * into saved from public.save_crm_production_plan(test_event_id,doc,0);
  if saved.event_id <> test_event_id or saved.revision <> 1 or saved.updated_by <> auth.uid() then raise exception 'Falló creación de borrador.'; end if;
  if not exists (select 1 from public.crm_production_plans p where p.event_id=test_event_id and p.document=saved.document and p.revision=1) then raise exception 'Falló persistencia y recarga.'; end if;
  insert into production_test_results values ('admin can save incomplete draft and reload revision 1',true);

  if saved.document->'checklist'->0->>'completedBy' <> auth.uid()::text or saved.document->'checklist'->0->>'completedAt' = '1999-01-01T00:00:00Z' then raise exception 'El cliente falsificó el autor del checklist.'; end if;
  insert into production_test_results values ('checklist completion uses server identity and clock',true);

  if not exists (select 1 from public.crm_production_audit a where a.event_id=test_event_id and a.actor=auth.uid() and a.action='plan_created' and a.new_value=saved.document and a.old_value is null) then raise exception 'No se generó auditoría.'; end if;
  insert into production_test_results values ('server creates audit with authenticated actor and exact document',true);

  update public.crm_production_plans p set updated_by=gen_random_uuid(),revision=999,updated_at='1999-01-01' where p.event_id=test_event_id returning * into saved_again;
  if saved_again.updated_by <> auth.uid() or saved_again.revision <> 2 or saved_again.updated_at < now()-interval '1 minute' then raise exception 'El cliente falsificó datos de auditoría.'; end if;
  insert into production_test_results values ('guard overwrites forged actor revision and timestamp',true);

  rejected := false;
  begin perform public.save_crm_production_plan(test_event_id,doc,1); exception when serialization_failure then rejected := true; end;
  if not rejected then raise exception 'No rechazó revisión obsoleta.'; end if;
  insert into production_test_results values ('stale revision is rejected without overwriting current plan',true);

  rejected := false;
  begin perform public.save_crm_production_plan(test_event_id,jsonb_set(doc,'{status}','"ready"'::jsonb),2); exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Se permitió ejecución sin cronograma/confirmaciones.'; end if;
  insert into production_test_results values ('ready state rejects incomplete schedule and operation',true);

  rejected := false;
  begin perform public.save_crm_production_plan(test_event_id,jsonb_set(doc,'{staff}',jsonb_build_array(jsonb_build_object('id','invalid-staff','collaboratorId',gen_random_uuid(),'role','DJ','arrival','','start','','end','','confirmation','pending','notes','','fee',0,'transferMinutes',45))),2);
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Se permitió colaborador inexistente.'; end if;
  insert into production_test_results values ('unknown collaborator IDs are rejected server side',true);

  rejected := false;
  begin insert into public.crm_production_audit(event_id,actor,action,description,new_value) values(test_event_id,auth.uid(),'forged','Forged audit',doc);
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Se permitió falsificar la bitácora.'; end if;
  insert into production_test_results values ('clients cannot insert forged audit entries',true);

  if (select p.revision from public.crm_production_plans p where p.event_id=test_event_id) <> 2 then raise exception 'Una operación rechazada alteró el plan.'; end if;
  insert into production_test_results values ('rejected writes leave the persisted plan unchanged',true);
end;
$$;

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false,'user_metadata',jsonb_build_object('is_admin',true))::text,true);
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  if public.is_admin() then raise exception 'User metadata escaló privilegios.'; end if;
  if exists (select 1 from public.crm_production_plans) or exists (select 1 from public.crm_production_assets) or exists (select 1 from public.crm_production_audit) then raise exception 'RLS filtró información a un no administrador.'; end if;
  begin perform public.save_crm_production_plan(current_setting('mrfiesta.test_event_id')::uuid,'{}'::jsonb,0); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'No administrador pudo guardar.'; end if;
  insert into production_test_results values ('authenticated nonadmin cannot read operational or financial data or save',true);
end;
$$;

reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$
declare rejected boolean;
begin
  rejected := false;
  begin perform 1 from public.crm_production_plans limit 1; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anon tiene permiso de lectura de planes.'; end if;
  rejected := false;
  begin perform 1 from public.crm_production_assets limit 1; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anon tiene permiso de lectura de equipos.'; end if;
  rejected := false;
  begin perform 1 from public.crm_production_audit limit 1; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anon tiene permiso de lectura de auditoría.'; end if;
  rejected := false;
  begin perform public.save_crm_production_plan(current_setting('mrfiesta.test_event_id')::uuid,'{}'::jsonb,0); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anon pudo ejecutar guardado.'; end if;
  insert into production_test_results values ('anonymous role has no table or save RPC access',true);
end;
$$;

reset role;
select jsonb_agg(to_jsonb(results) order by test) as production_tests from production_test_results results;
rollback;
select 'PASS: 11 transactional production assertions; all fixtures rolled back' as validation;
