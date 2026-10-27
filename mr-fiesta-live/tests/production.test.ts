import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmEvent } from '../src/types/domain'
import type { EquipmentAsset, ProductionPlan } from '../src/production/model'
import { analyze, balance, contractServices, costTotal, dayLocal, durationMinutes, eventBounds, newPlan, operationalUtility, progress, readiness, toEpoch } from '../src/production/rules'

function event(overrides: Partial<CrmEvent> = {}): CrmEvent {
  return { id: 'event-a', cliente: 'Cliente de prueba', agasajado: '', tipo_evento: 'Prueba', edad: null, invitados: null, telefono: '', fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Surco', direccion: 'Dirección de prueba', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: '', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 1000, adelanto: 300, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '', ...overrides }
}
const date = (time: string, day = '2026-10-31') => `${day}T${time}`
const asset: EquipmentAsset = { id: 'led-01', name: 'Pista LED', category: 'Pistas LED', identifier: 'PISTA LED 01', status: 'available' }
function completePlan(item: CrmEvent): ProductionPlan {
  const plan = newPlan(item)
  plan.status = 'planning'
  plan.reviewedContract = true
  plan.staff = [{ id: 'assignment-a', collaboratorId: 'person-a', role: 'Supervisor', arrival: date('08:00'), start: date('08:00'), end: date('22:00'), confirmation: 'confirmed', notes: '', fee: 100, transferMinutes: 45 }]
  plan.activities = [
    { id: 'setup', name: 'Montaje', start: date('09:00'), end: date('10:00'), responsibleIds: ['person-a'], notes: '', status: 'pending', kind: 'setup' },
    { id: 'test', name: 'Pruebas', start: date('10:00'), end: date('10:15'), responsibleIds: ['person-a'], notes: '', status: 'pending', kind: 'test' },
    { id: 'show', name: 'Show', start: date('18:00'), end: date('21:00'), responsibleIds: ['person-a'], notes: '', status: 'pending', kind: 'show' },
  ]
  plan.logistics.installation = date('09:00')
  plan.logistics.installerIds = ['person-a']
  plan.checklist = plan.checklist.map((task) => ({ ...task, done: true, completedBy: 'tester', completedAt: '2026-10-30T20:00:00Z' }))
  plan.commitments = plan.commitments.map((commitment) => ({ ...commitment, prepared: true, planned: true }))
  return plan
}

test('new draft never invents staff, timelines, confirmations or package inclusions', () => {
  const item = event({ paquete: 'Ultra Chicoteca LED' })
  const plan = newPlan(item)
  assert.equal(plan.eventId, item.id)
  assert.equal(plan.status, 'unorganized')
  assert.deepEqual(plan.activities, [])
  assert.deepEqual(plan.staff, [])
  assert.equal(plan.reviewedContract, false)
  assert.equal(contractServices(item).find((service) => service.key === 'led')?.contracted, null)
  assert.equal(plan.checklist.some((task) => task.serviceKey === 'led'), false)
  assert.equal(progress(plan), 0)
  assert.equal(readiness(item, plan).ready, false)
})

test('contract extraction distinguishes explicit inclusions, exclusions and alternatives', () => {
  const item = event({ detalle_servicio: 'Incluye DJ y proyector. No incluye pista LED, animador ni decoración. Máquina de humo o burbujas.', juegos_elegidos: 'Just Dance' })
  const services = contractServices(item)
  const included = (key: string) => services.find((service) => service.key === key)?.contracted
  assert.equal(included('dj'), true)
  assert.equal(included('projection'), true)
  assert.equal(included('led'), false)
  assert.equal(included('animation'), false)
  assert.equal(included('decoration'), false)
  assert.equal(included('glitter'), null)
  assert.equal(included('smoke'), null)
  assert.equal(included('bubbles'), null)
  assert.equal(included('effects'), true)
  assert.equal(included('games'), true)
  assert.equal(newPlan(item).checklist.some((task) => task.serviceKey === 'led'), false)
})

test('contradictory explicit contract statements stay unresolved instead of assuming inclusion', () => {
  const services = contractServices(event({ detalle_servicio: 'Incluye decoración. No incluye decoración.' }))
  assert.equal(services.find((service) => service.key === 'decoration')?.contracted, null)
})

test('all dates are Lima times with overnight event rollover and multi-day equipment ranges', () => {
  const bounds = eventBounds(event({ hora_inicio: '23:00', hora_fin: '02:00' }))
  assert.deepEqual(bounds, { start: '2026-10-31T23:00', end: '2026-11-01T02:00' })
  assert.equal(durationMinutes(bounds.start, bounds.end), 180)
  assert.equal(toEpoch('2026-10-31T09:00'), Date.parse('2026-10-31T14:00:00Z'))
  assert.equal(dayLocal(new Date('2026-11-01T03:00:00Z')), '2026-10-31')
  assert.equal(durationMinutes('2026-10-30T09:00', '2026-11-01T09:00'), 2880)
  assert.ok(Number.isNaN(toEpoch('2026-02-31T09:00')))
  assert.ok(Number.isNaN(toEpoch('2026-10-31T25:00')))
  assert.equal(durationMinutes('', ''), 0)
})

test('a complete plan can be ready but required chronology and checklist cannot be removed', () => {
  const item = event()
  const plan = completePlan(item)
  assert.equal(readiness(item, plan).ready, true)
  plan.activities = plan.activities.filter((activity) => activity.kind !== 'test')
  assert.ok(readiness(item, plan).blocking.some((alert) => alert.key === 'tests-required'))
  plan.checklist = []
  assert.ok(readiness(item, plan).blocking.some((alert) => alert.key === 'checklist-address'))
})

test('a contracted operational plan with compatible roles, early Glitter and one effect alternative becomes ready', () => {
  const item = event({ detalle_servicio: '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación con DJ. Incluye pista LED y proyector. Máquina de humo o burbujas.' })
  const plan = completePlan(item)
  plan.staff[0].role = 'DJ / animación / Glitter'
  plan.activities[2] = { ...plan.activities[2], name: 'Animación', serviceKey: 'animation', start: date('18:50'), end: date('20:50') }
  plan.activities.push({ id: 'glitter', name: 'Glitter', start: date('17:50'), end: date('18:50'), responsibleIds: ['person-a'], notes: '', status: 'pending', kind: 'show', serviceKey: 'glitter', exception: 'Inicio diez minutos antes coordinado con cliente' })
  const assets: EquipmentAsset[] = [asset, { ...asset, id: 'projector', name: 'Proyector', identifier: 'PROYECTOR 01', category: 'Audiovisual' }, { ...asset, id: 'effect', name: 'Máquina de burbujas', identifier: 'BURBUJAS 01', category: 'Efectos' }]
  plan.equipment = assets.map((item, index) => ({ id: `reservation-${index}`, assetId: item.id, start: date('09:00'), end: date('22:00'), status: 'reserved', notes: '', transferMinutes: 45 }))
  assert.deepEqual(readiness(item, plan, [], assets).blocking, [])
  assert.equal(readiness(item, plan, [], assets).ready, true)
})

test('missing responsible, reversed intervals and overlapping activities are detected', () => {
  const item = event()
  const plan = completePlan(item)
  plan.activities.push({ id: 'bad', name: 'Actividad inválida', start: date('20:00'), end: date('19:00'), responsibleIds: [], notes: '', status: 'pending', kind: 'show' })
  plan.activities.push({ ...plan.activities[2], id: 'parallel', name: 'Paralelo', start: date('19:00'), end: date('20:00') })
  const alerts = analyze(item, plan)
  assert.ok(alerts.some((alert) => alert.key === 'activity-invalid-bad'))
  assert.ok(alerts.some((alert) => alert.key === 'activity-owner-bad'))
  assert.ok(alerts.some((alert) => alert.key.includes('activity-overlap') && alert.severity === 'critical'))
})

test('Glitter may start before the event with an explicit justified exception', () => {
  const item = event()
  const plan = completePlan(item)
  plan.activities.push({ id: 'glitter', name: 'Glitter', start: date('17:50'), end: date('18:50'), responsibleIds: ['person-a'], notes: '', status: 'pending', kind: 'show', exception: 'Inicio previo coordinado con cliente' })
  assert.equal(analyze(item, plan).some((alert) => alert.key === 'activity-bounds-glitter'), false)
})

test('explicit service duration and essential role requirements come from stored contract text', () => {
  const item = event({ detalle_servicio: '1 hora de estación Glitter y 2 horas de animación con DJ.' })
  const plan = completePlan(item)
  plan.activities[2].serviceKey = 'glitter'
  plan.activities[2].end = date('18:30')
  const alerts = analyze(item, plan)
  assert.ok(alerts.some((alert) => alert.key === 'duration-glitter'))
  assert.ok(alerts.some((alert) => alert.key === 'role-glitter'))
  assert.ok(alerts.some((alert) => alert.key === 'role-dj'))
  assert.ok(alerts.some((alert) => alert.key === 'role-animation'))
})

test('same employee cannot occupy two different events and a note cannot hide physical overlap', () => {
  const first = event(), second = event({ id: 'event-b', cliente: 'Otro cliente', lugar: 'Bellavista' })
  const plan = completePlan(first), other = completePlan(second)
  const alert = analyze(first, plan, [{ event: second, plan: other }]).find((item) => item.key.startsWith('resource:staff:'))!
  assert.equal(alert.severity, 'critical')
  assert.equal(alert.canJustify, false)
  plan.exceptions.push({ key: alert.key, reason: 'Excepción de prueba con suficiente texto' })
  assert.ok(readiness(first, plan, [{ event: second, plan: other }]).blocking.some((item) => item.key === alert.key))
})

test('staff transfer time is considered between districts, with reviewable justified exceptions', () => {
  const first = event(), second = event({ id: 'event-b', lugar: 'Bellavista' })
  const plan = completePlan(first), other = completePlan(second)
  other.staff[0].arrival = date('22:15'); other.staff[0].start = date('22:15'); other.staff[0].end = date('23:45')
  const key = `resource:staff:person-a:${second.id}`
  assert.equal(analyze(first, plan, [{ event: second, plan: other }]).find((item) => item.key === key)?.canJustify, true)
  plan.exceptions.push({ key, reason: 'Traslado medido por ruta directa de 10 minutos' })
  assert.equal(readiness(first, plan, [{ event: second, plan: other }]).blocking.some((item) => item.key === key), false)
})

test('equipment conflict covers previous-day installation through next-day pickup', () => {
  const first = event(), second = event({ id: 'event-b', lugar: 'Barranco' })
  const plan = completePlan(first), other = completePlan(second)
  plan.equipment.push({ id: 'reservation-a', assetId: asset.id, start: date('09:00', '2026-10-30'), end: date('09:00', '2026-11-01'), status: 'reserved', notes: '', transferMinutes: 45 })
  other.equipment.push({ id: 'reservation-b', assetId: asset.id, start: date('18:00'), end: date('23:00'), status: 'reserved', notes: '', transferMinutes: 45 })
  const alert = analyze(first, plan, [{ event: second, plan: other }], [asset]).find((item) => item.key.startsWith('resource:equipment:'))!
  assert.equal(alert.canJustify, false)
  assert.ok(alert.message.includes('PISTA LED 01'))
  assert.ok(analyze(first, plan, [], [{ ...asset, status: 'maintenance' }]).some((item) => item.key === 'asset-maintenance-reservation-a'))
})

test('equipment reservation must cover setup, show and next-day pickup, with no overlapping duplicate', () => {
  const item = event(), plan = completePlan(item)
  plan.logistics.pickup = date('09:00', '2026-11-01')
  plan.equipment.push({ id: 'late', assetId: asset.id, start: date('18:00'), end: date('21:00'), status: 'reserved', notes: '', transferMinutes: 45 })
  assert.ok(analyze(item, plan, [], [asset]).some((alert) => alert.key === 'asset-coverage-late'))
  plan.equipment[0].start = date('09:00')
  plan.equipment[0].end = date('09:00', '2026-11-01')
  assert.equal(analyze(item, plan, [], [asset]).some((alert) => alert.key === 'asset-coverage-late'), false)
  plan.equipment.push({ ...plan.equipment[0], id: 'duplicate' })
  assert.ok(analyze(item, plan, [], [asset]).some((alert) => alert.key === `asset-duplicate:${asset.id}`))
})

test('a travel issue cannot mask physical overlap from another assignment of the same resource', () => {
  const first = event(), second = event({ id: 'event-b' })
  const plan = completePlan(first), other = completePlan(second)
  plan.staff[0].end = date('16:45')
  plan.staff.push({ ...plan.staff[0], id: 'second-role', arrival: date('17:30'), start: date('17:30'), end: date('22:00') })
  other.staff[0].arrival = date('17:00'); other.staff[0].start = date('17:00')
  const alert = analyze(first, plan, [{ event: second, plan: other }]).find((item) => item.key === `resource:staff:person-a:${second.id}`)!
  assert.equal(alert.canJustify, false)
  assert.ok(alert.message.includes('simultáneamente'))
})

test('money uses the real deposit and extra payments instead of stale saldo, with cent precision', () => {
  const item = event({ total: 1000.35, adelanto: 300.1, saldo: 0 })
  const plan = newPlan(item)
  assert.equal(balance(item, plan), 700.25)
  plan.payments.push({ id: 'payment-a', amount: 100.2, date: '2026-10-27', note: 'Pago adicional al adelanto' })
  assert.equal(balance(item, plan), 600.05)
  plan.costs.push({ id: 'expense-a', category: 'Movilidad', description: 'Vehículo', amount: 50.25 })
  plan.staff = completePlan(item).staff
  assert.equal(costTotal(plan), 150.25)
  assert.equal(operationalUtility(item, plan), 850.1)
  plan.payments.push({ id: 'payment-b', amount: 1000, date: '2026-10-28', note: '' })
  assert.equal(balance(item, plan), 0)
  assert.equal(item.saldo, 0)
  assert.equal(item.total, 1000.35)
})
