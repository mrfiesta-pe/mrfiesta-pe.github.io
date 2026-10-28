import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmEvent } from '../src/types/domain'
import { newPlan } from '../src/production/rules'
import { simpleChecklist } from '../src/production/simpleWorkflow'
import { buildEventAgenda } from '../src/production/agenda'
import { applyActivityTemplates, mergeReturnChecklist, parseActivityTemplates, returnChecklist, templateProblems } from '../src/production/advancedTemplates'

function fixture(overrides: Partial<CrmEvent> = {}): CrmEvent {
  return { id: 'advanced-test-event', cliente: 'Cliente sintético', agasajado: 'Evento sintético', tipo_evento: 'Prueba', edad: null, invitados: null, telefono: '', fecha_evento: '2026-11-15', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Distrito sintético', direccion: 'Dirección sintética', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: 'DJ y sonido profesional. No incluye pista LED.', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 1000, adelanto: 300, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '', ...overrides }
}

test('advanced templates add pending activities relative to Lima without mutating original data', () => {
  const event = fixture()
  const plan = newPlan(event)
  plan.notes = 'Comentario interno que debe conservarse'
  const before = structuredClone(plan)
  const result = applyActivityTemplates(event, plan, [{ id: 'setup', name: 'Montaje previo', kind: 'setup', offsetMinutes: -1500, durationMinutes: 60 }])
  assert.equal(result.added, 1)
  assert.equal(result.plan.activities[0].start, '2026-11-14T17:00')
  assert.equal(result.plan.activities[0].end, '2026-11-14T18:00')
  assert.equal(result.plan.activities[0].status, 'pending')
  assert.equal(result.plan.activities[0].confirmed, false)
  const agenda = buildEventAgenda(event, result.plan).find(activity => activity.id === result.plan.activities[0].id)
  assert.equal(agenda?.source, 'suggested')
  assert.equal(agenda?.confirmed, false)
  assert.deepEqual(result.plan.activities[0].responsibleIds, [])
  assert.deepEqual(plan, before)
  assert.equal(result.plan.notes, before.notes)
})

test('template application is idempotent and never overwrites confirmed activities or assignments', () => {
  const event = fixture()
  const plan = newPlan(event)
  plan.activities.push({ id: 'template-live', name: 'Show acordado', kind: 'show', start: '2026-11-15T19:00', end: '2026-11-15T20:00', responsibleIds: ['person-real-reference'], status: 'live', notes: 'Confirmado con el cliente', confirmed: true, confirmedAt: '2026-11-01T12:00:00Z' })
  const original = structuredClone(plan)
  const result = applyActivityTemplates(event, plan, [{ id: 'live', name: 'Horario sugerido diferente', kind: 'show', offsetMinutes: 0, durationMinutes: 30 }])
  assert.equal(result.added, 0)
  assert.equal(result.preserved, 1)
  assert.deepEqual(result.plan, original)
  assert.deepEqual(applyActivityTemplates(event, result.plan, [{ id: 'live', name: 'Horario sugerido diferente', kind: 'show', offsetMinutes: 0, durationMinutes: 30 }]).plan, original)
})

test('templates without a specified offset keep the proposed times blank', () => {
  const result = applyActivityTemplates(fixture(), newPlan(fixture()), [{ id: 'unknown', name: 'Recojo por coordinar', kind: 'travel', durationMinutes: 30 }])
  assert.equal(result.plan.activities[0].start, '')
  assert.equal(result.plan.activities[0].end, '')
})

test('template service filters follow stored contract exclusions and real package fallback', () => {
  const event = fixture()
  const templates = [{ id: 'led', name: 'Montar pista', kind: 'setup' as const, serviceKey: 'led', offsetMinutes: -60, durationMinutes: 30 }]
  assert.equal(applyActivityTemplates(event, newPlan(event), templates).added, 0)
  const fallback = fixture({ detalle_servicio: '', paquete: 'Ultra Chicoteca LED' })
  assert.equal(applyActivityTemplates(fallback, newPlan(fallback), templates).added, 1)
})

test('template import validates shape, ranges and unique identifiers without accepting extra executable fields', () => {
  assert.deepEqual(parseActivityTemplates('[{"id":"a","name":"Montaje","kind":"setup","offsetMinutes":-60,"durationMinutes":30,"untrusted":"ignored"}]'), [{ id: 'a', name: 'Montaje', kind: 'setup', offsetMinutes: -60, durationMinutes: 30 }])
  assert.throws(() => parseActivityTemplates('{}'))
  assert.throws(() => parseActivityTemplates('[{"id":"a","name":"M","kind":"setup"},{"id":"a","name":"N","kind":"setup"}]'))
  assert.throws(() => parseActivityTemplates('[{"id":"a","name":"M","kind":"script"}]'))
  assert.throws(() => parseActivityTemplates('[{"id":"a","name":"M","kind":"setup","offsetMinutes":"5"}]'))
  assert.ok(templateProblems({ id: 'bad', name: 'M', kind: 'show', durationMinutes: 0 }).length)
  assert.ok(templateProblems({ id: 'bad', name: 'M', kind: 'show', offsetMinutes: 10081 }).length)
})

test('return checklist has independent completion and preserves prior return metadata', () => {
  const event = fixture({ adicionales_requerimientos: 'Cartel personalizado' })
  const plan = newPlan(event)
  plan.checklist = simpleChecklist(event, plan).map(task => ({ ...task, done: true, completedBy: 'departure-person', completedAt: '2026-11-15T12:00:00Z' }))
  const before = structuredClone(plan)
  const returns = returnChecklist(event, plan)
  assert.ok(returns.length > 0)
  assert.ok(returns.every(task => !task.done && task.stage === 'after' && !task.completedBy))
  const merged = mergeReturnChecklist(event, plan)
  merged.checklist.find(task => task.id === returns[0].id)!.done = true
  merged.checklist.find(task => task.id === returns[0].id)!.completedBy = 'return-person'
  merged.checklist.find(task => task.id === returns[0].id)!.completedAt = '2026-11-16T02:00:00Z'
  assert.equal(returnChecklist(event, merged)[0].completedBy, 'return-person')
  assert.deepEqual(plan, before)
})

test('changed additional material gets a fresh return check without deleting historical data', () => {
  const oldEvent = fixture({ adicionales_requerimientos: 'Cartel azul' })
  const original = mergeReturnChecklist(oldEvent, newPlan(oldEvent))
  original.checklist = original.checklist.map(task => ({ ...task, done: true, completedBy: 'tester', completedAt: '2026-11-15T12:00:00Z' }))
  const changedEvent = fixture({ adicionales_requerimientos: 'Cartel rojo' })
  const next = mergeReturnChecklist(changedEvent, original)
  const oldReturn = original.checklist.find(task => task.label.includes('Cartel azul'))!
  assert.ok(next.checklist.some(task => task.id === oldReturn.id && task.done))
  const newReturn = returnChecklist(changedEvent, next).find(task => task.label.includes('Cartel rojo'))!
  assert.equal(newReturn.done, false)
})
