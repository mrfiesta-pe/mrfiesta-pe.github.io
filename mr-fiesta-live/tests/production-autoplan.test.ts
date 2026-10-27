import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmCollaborator, CrmEvent } from '../src/types/domain'
import type { EquipmentAsset } from '../src/production/model'
import { activitiesFromContract, autoPlan, mergeOfferPlan, suggestResources } from '../src/production/autoplan'

function event(patch: Partial<CrmEvent> = {}): CrmEvent {
  return { id: 'any-event', cliente: 'Cliente', agasajado: 'Celebracion', tipo_evento: 'Prueba', edad: null, invitados: null, telefono: '', fecha_evento: '2027-04-18', hora_inicio: '16:30', hora_fin: '20:30', lugar: 'Surco', direccion: 'Direccion', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: 'Incluye DJ, 1 hora de estación Glitter y 2 horas de animación. No incluye pista LED.', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 1000, adelanto: 300, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '', ...patch }
}

test('imports actual textual ranges and a point installation without inventing its duration', () => {
  const item = event({ cronograma: 'Instalación 3:00 pm aprox, Inicio DJ 4:30 pm a 5:00 pm, Estación Gitter 5:00 pm a 6:00 pm, Show 6:00 pm a 8:00 pm, Cierre DJ 8:00 pm a 8:30 pm.' })
  const plan = autoPlan(item)
  const imported = activitiesFromContract(item)
  assert.equal(imported.length, 5)
  assert.equal(imported[0].start, '2027-04-18T15:00')
  assert.equal(imported[0].end, '')
  assert.equal(plan.logistics.installation, '2027-04-18T15:00')
  assert.ok(imported[0].notes.includes('aproximada'))
  assert.equal(imported[1].start, '2027-04-18T16:30')
  assert.equal(imported[1].end, '2027-04-18T17:00')
  assert.equal(imported[2].serviceKey, 'glitter')
  assert.equal(imported[3].serviceKey, 'animation')
  assert.equal(imported[4].end, '2027-04-18T20:30')
  assert.ok(plan.activities.some(activity => activity.kind === 'test' && !activity.start && !activity.end))
  assert.ok(plan.activities.some(activity => activity.kind === 'teardown' && !activity.start && !activity.end))
  assert.deepEqual(plan.staff, [])
  assert.deepEqual(plan.equipment, [])
  assert.ok(plan.activities.every(activity => activity.responsibleIds.length === 0 && activity.status === 'pending'))
  assert.equal(plan.reviewedContract, false)
  assert.ok(plan.commitments.every(commitment => !commitment.prepared && !commitment.clientConfirmed))
})

const person = (id: string, name: string, role = 'DJ', active = true): CrmCollaborator => ({ id, nombre: name, rol: role, activo: active, telefono: '', created_at: '' })
const equipment = (id: string, state: EquipmentAsset['status'] = 'available'): EquipmentAsset => ({ id, identifier: `PISTA LED ${id}`, name: 'Pista LED', category: 'Pistas LED', status: state })

test('resource suggestions use active registered roles and skip simultaneous or transfer conflicts', () => {
  const item = event({ detalle_servicio: 'Incluye DJ.', cronograma: 'DJ 6 pm a 9 pm' })
  const document = autoPlan(item)
  const other = event({ id: 'other-event' })
  const otherPlan = autoPlan(other)
  otherPlan.staff = [
    { id: 'a', collaboratorId: 'busy', role: 'DJ', arrival: '2027-04-18T17:00', start: '2027-04-18T17:00', end: '2027-04-18T19:00', confirmation: 'confirmed', notes: '', fee: 100, transferMinutes: 45 },
    { id: 'b', collaboratorId: 'tight', role: 'DJ', arrival: '2027-04-18T15:00', start: '2027-04-18T15:00', end: '2027-04-18T17:45', confirmation: 'confirmed', notes: '', fee: 100, transferMinutes: 45 },
  ]
  const people = [person('busy', 'A ocupado'), person('inactive', 'B inactivo', 'DJ', false), person('tight', 'C traslado insuficiente'), person('unmatched', 'D funcion distinta', 'Staff'), person('available', 'E disponible')]
  const before = structuredClone(document)
  const proposal = suggestResources(item, document, people, [], [{ event: other, plan: otherPlan }])
  assert.equal(proposal.staffAdded, 1)
  assert.equal(proposal.plan.staff[0].collaboratorId, 'available')
  assert.equal(proposal.plan.staff[0].confirmation, 'pending')
  assert.equal(proposal.plan.staff[0].start, '2027-04-18T18:00')
  assert.equal(proposal.plan.staff[0].end, '2027-04-18T21:00')
  assert.deepEqual(proposal.plan.activities.find(activity => activity.serviceKey === 'dj')?.responsibleIds, ['available'])
  assert.deepEqual(document, before)
  assert.equal(proposal.plan.reviewedContract, false)
  assert.equal(proposal.plan.commitments[0].prepared, false)
})

test('incomplete same-day obligations and installation points never become assumed availability', () => {
  const item = event({ detalle_servicio: 'Incluye DJ y pista LED.', cronograma: 'Instalación 9 am, DJ 6 pm a 9 pm' })
  const other = event({ id: 'other-event' })
  const otherPlan = autoPlan(other)
  otherPlan.staff = [{ id: 'a', collaboratorId: 'unknown', role: 'DJ', arrival: '', start: '', end: '', confirmation: 'pending', notes: '', fee: 0, transferMinutes: 45 }]
  const document = autoPlan(item)
  const proposal = suggestResources(item, document, [person('unknown', 'Persona con horario desconocido'), person('installer', 'Persona instaladora', 'Instalador')], [equipment('01')], [{ event: other, plan: otherPlan }])
  assert.equal(proposal.staffAdded, 0)
  assert.equal(proposal.equipmentAdded, 0)
  assert.ok(proposal.warnings.some(message => message.includes('instalación') && message.includes('inicio y fin')))
  assert.ok(proposal.warnings.some(message => message.includes('Pista LED') && message.includes('recojo')))
})

test('equipment suggestions cover installation through pickup and exclude maintenance and overnight reservations', () => {
  const item = event({ detalle_servicio: 'Incluye pista LED.', cronograma: 'Instalación 9 am, Recojo día siguiente 9 am' })
  const document = autoPlan(item)
  const other = event({ id: 'other-event', fecha_evento: '2027-04-19' })
  const otherPlan = autoPlan(other)
  otherPlan.equipment = [{ id: 'busy', assetId: '02', start: '2027-04-19T08:00', end: '2027-04-19T12:00', status: 'reserved', notes: '', transferMinutes: 30 }]
  const proposal = suggestResources(item, document, [], [equipment('01', 'maintenance'), equipment('02'), equipment('03')], [{ event: other, plan: otherPlan }])
  assert.equal(proposal.equipmentAdded, 1)
  assert.equal(proposal.plan.equipment[0].assetId, '03')
  assert.equal(proposal.plan.equipment[0].start, '2027-04-18T09:00')
  assert.equal(proposal.plan.equipment[0].end, '2027-04-19T09:00')
  assert.equal(suggestResources(item, proposal.plan, [], [equipment('01', 'maintenance'), equipment('02'), equipment('03')], []).equipmentAdded, 0)
})

test('existing compatible assignments can take activities without altering their confirmation, fees or period', () => {
  const item = event({ detalle_servicio: 'Incluye DJ.', cronograma: 'DJ 6 pm a 9 pm' })
  const document = autoPlan(item)
  document.staff = [{ id: 'assigned', collaboratorId: 'already-assigned', role: 'DJ', arrival: '2027-04-18T17:00', start: '2027-04-18T17:30', end: '2027-04-18T22:00', confirmation: 'confirmed', notes: 'Confirmación existente', fee: 150, transferMinutes: 30 }]
  const proposal = suggestResources(item, document, [person('already-assigned', 'Persona existente')], [], [])
  assert.equal(proposal.staffAdded, 0)
  assert.equal(proposal.responsibilitiesAdded, 1)
  assert.deepEqual(proposal.plan.staff, document.staff)
  assert.deepEqual(proposal.plan.activities.find(activity => activity.serviceKey === 'dj')?.responsibleIds, ['already-assigned'])
  assert.equal(suggestResources(item, proposal.plan, [person('already-assigned', 'Persona existente')], [], []).responsibilitiesAdded, 0)
})

test('accepts variable dates, AM installation, punctuation and intentional early Glitter without silently justifying it', () => {
  const item = event({ fecha_evento: '2028-02-29', hora_inicio: '18:00', hora_fin: '21:00', cronograma: 'Instalación 10 a. m. aprox; Estación Glitter 5:50 p. m. a 6:50 p. m.; Show 6:50 PM a 8:50 PM.' })
  const activities = activitiesFromContract(item)
  assert.equal(activities[0].start, '2028-02-29T10:00')
  assert.equal(activities[1].start, '2028-02-29T17:50')
  assert.equal(activities[1].end, '2028-02-29T18:50')
  assert.equal(activities[1].exception, undefined)
  assert.equal(activities[2].end, '2028-02-29T20:50')
})

test('infers a shared endpoint meridiem only when the range is unambiguous', () => {
  const activities = activitiesFromContract(event({ cronograma: 'Show 6 a 9 pm, DJ 10 pm hasta 11, Glitter 11 a 1 pm, Karaoke 6 a 9, Pruebas 09:00 – 09:15' }))
  assert.equal(activities[0].start, '2027-04-18T18:00')
  assert.equal(activities[0].end, '2027-04-18T21:00')
  assert.equal(activities[1].start, '2027-04-18T22:00')
  assert.equal(activities[1].end, '2027-04-18T23:00')
  assert.equal(activities[2].start, '')
  assert.equal(activities[2].end, '')
  assert.equal(activities[3].start, '')
  assert.equal(activities[4].start, '2027-04-18T09:00')
  assert.equal(activities[4].end, '2027-04-18T09:15')
})

test('handles explicit overnight ranges and previous/next-day logistics using full local dates', () => {
  const item = event({ fecha_evento: '2027-12-31', hora_inicio: '23:00', hora_fin: '02:00', cronograma: 'Instalación día anterior 10 am, DJ 11 pm a 1 am, Show 1 am a 2 am, Recojo día siguiente 9 am' })
  const activities = activitiesFromContract(item)
  assert.equal(activities[0].start, '2027-12-30T10:00')
  assert.equal(activities[1].start, '2027-12-31T23:00')
  assert.equal(activities[1].end, '2028-01-01T01:00')
  assert.equal(activities[2].start, '2028-01-01T01:00')
  assert.equal(activities[2].end, '2028-01-01T02:00')
  assert.equal(activities[3].start, '2028-01-01T09:00')
})

test('without textual times it creates only service-specific blank tasks and never package defaults', () => {
  const plan = autoPlan(event({ paquete: 'Ultra Chicoteca LED', detalle_servicio: 'Incluye DJ. No incluye pista LED ni Glitter.' }))
  assert.ok(plan.activities.some(activity => activity.serviceKey === 'dj'))
  assert.equal(plan.activities.some(activity => activity.serviceKey === 'glitter'), false)
  assert.equal(plan.activities.some(activity => activity.serviceKey === 'led'), false)
  assert.ok(plan.activities.every(activity => activity.start === '' && activity.end === ''))
  assert.ok(plan.checklist.every(task => task.done === false))
  assert.ok(plan.notes.includes('Borrador generado'))
})

test('unsupported or ambiguous source remains visible instead of manufacturing a schedule', () => {
  const activities = activitiesFromContract(event({ cronograma: 'Show 6 a 8 a 9 pm, Instalación 31/10 a las 9 am, DJ 11 a 1 am' }))
  assert.ok(activities.length > 0)
  assert.ok(activities.every(activity => activity.start === '' && activity.end === ''))
  assert.ok(activities.every(activity => activity.notes.includes('Fuente contractual')))
})

test('merge is idempotent and preserves all existing edits, confirmations, money and original contract', () => {
  const item = event({ cronograma: 'Glitter 5 pm a 6 pm, Show 6 pm a 8 pm' })
  const document = autoPlan(item)
  document.status = 'planning'
  document.activities[0].start = '2027-04-18T17:15'
  document.activities[0].name = 'Glitter coordinado internamente'
  document.activities[0].responsibleIds = ['real-person']
  document.checklist[0].done = true
  document.checklist[0].completedBy = 'admin'
  document.checklist[0].completedAt = '2027-04-17T12:00:00Z'
  document.staff = [{ id: 'assignment', collaboratorId: 'real-person', role: 'Glitter', arrival: '2027-04-18T17:00', start: '2027-04-18T17:15', end: '2027-04-18T18:00', confirmation: 'confirmed', fee: 150, notes: 'Confirmado previamente', transferMinutes: 30 }]
  document.notes = 'Notas editadas por producción'
  document.commitments[0].prepared = true
  const old = structuredClone(document)
  const originalContract = structuredClone(item)
  const merged = mergeOfferPlan(item, document)
  assert.equal(merged.addedActivities, 0)
  assert.deepEqual(merged.plan, old)
  assert.deepEqual(item, originalContract)
  const updatedContract = { ...item, cronograma: `${item.cronograma}, Recojo 11 pm`, detalle_servicio: `${item.detalle_servicio} Incluye decoración.` }
  const updated = mergeOfferPlan(updatedContract, document)
  assert.equal(updated.addedActivities, 1)
  assert.ok(updated.addedChecklist > 0)
  assert.equal(updated.addedCommitments, 1)
  assert.deepEqual(updated.plan.activities.slice(0, old.activities.length), old.activities)
  assert.deepEqual(updated.plan.staff, old.staff)
  assert.equal(updated.plan.notes, old.notes)
  assert.equal(updated.plan.checklist[0].done, true)
  assert.equal(mergeOfferPlan(updatedContract, updated.plan).addedActivities, 0)
})
