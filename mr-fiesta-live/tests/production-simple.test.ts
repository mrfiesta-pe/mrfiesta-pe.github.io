import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmCollaborator, CrmEvent } from '../src/types/domain'
import { newPlan } from '../src/production/rules'
import { automaticActivities, checklistExtras, mergeSimpleChecklist, simpleChecklist, simpleProgress, simpleReadiness, staffPeriod, suggestSimpleStaff } from '../src/production/simpleWorkflow'
import type { ProductionPlan, StaffAssignment } from '../src/production/model'

const event = (patch: Partial<CrmEvent> = {}): CrmEvent => ({ id: 'event', cliente: 'Cliente', agasajado: 'Celebración', tipo_evento: 'Prueba', edad: null, invitados: 30, telefono: '', fecha_evento: '2028-03-18', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Surco', direccion: 'Dirección registrada', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Nombre sin inferencias', detalle_servicio: 'Incluye DJ.', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 1000, adelanto: 200, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '', ...patch })
const assignment = (patch: Partial<StaffAssignment> = {}): StaffAssignment => ({ id: 'staff', collaboratorId: 'dj', role: 'DJ', arrival: '', start: '2028-03-18T18:00', end: '2028-03-18T21:00', confirmation: 'confirmed', notes: '', fee: 0, transferMinutes: 45, ...patch })
const person = (id: string, role: string, active = true): CrmCollaborator => ({ id, nombre: id, rol: role, activo: active, telefono: '', created_at: '' })
function checked(event: CrmEvent): ProductionPlan {
  const plan = mergeSimpleChecklist(event, newPlan(event))
  for (const task of plan.checklist.filter(task => task.id.startsWith('simple-') && task.stage === 'before')) Object.assign(task, { done: true, completedBy: 'admin', completedAt: '2028-03-17T12:00:00Z' })
  plan.staff = [assignment()]
  return plan
}

test('simple readiness permits execution without equipment, logistics, service matrix or manual schedule', () => {
  const item = event()
  const plan = checked(item)
  assert.equal(plan.activities.length, 0)
  assert.equal(plan.equipment.length, 0)
  assert.equal(plan.reviewedContract, false)
  assert.equal(plan.logistics.installation, '')
  assert.ok(plan.commitments.every(service => !service.prepared))
  assert.equal(simpleReadiness(item, plan).ready, true)
  assert.equal(simpleProgress(item, plan), 100)
})

test('checklist is only a warehouse-departure packing list generated from actual services', () => {
  const minimal = simpleChecklist(event({ detalle_servicio: 'Incluye DJ. No incluye pista LED ni Glitter.' }))
  assert.ok(minimal.every(task => task.stage === 'before' && task.id.startsWith('simple-out-')))
  assert.equal(minimal.some(task => task.serviceKey === 'led' || task.serviceKey === 'glitter'), false)
  assert.equal(minimal.some(task => task.serviceKey === 'sound'), false)
  assert.deepEqual(minimal.map(task => task.id), ['simple-out-dj'])
  const withServices = simpleChecklist(event({ detalle_servicio: 'Incluye DJ, pista LED, sonido y micrófonos, proyector y pantalla, estación Glitter. No incluye decoración.' }))
  for (const key of ['led', 'sound', 'projection', 'glitter']) assert.ok(withServices.some(task => task.serviceKey === key))
  assert.equal(withServices.some(task => task.serviceKey === 'decoration'), false)
  assert.ok(withServices.every(task => !/instalad|probado|finalizado|saldo|cliente/i.test(task.label)))
})

test('legacy completions and custom tasks remain stored without appearing as packing confirmations', () => {
  const item = event({ detalle_servicio: 'Incluye DJ y pista LED.' })
  const plan = newPlan(item)
  for (const task of plan.checklist.filter(task => ['contract', 'services', 'address', 'times', 'service-led'].includes(task.id))) Object.assign(task, { done: true, completedBy: 'original-user', completedAt: '2028-03-17T11:00:00Z' })
  plan.checklist.push({ id: 'custom-uuid', label: 'Llevar adaptador especial acordado', stage: 'before', done: false })
  const original = structuredClone(plan)
  const visible = simpleChecklist(item, plan)
  assert.equal(visible.find(task => task.id === 'simple-out-led')?.done, false)
  assert.equal(visible.some(task => task.id === 'custom-uuid'), false)
  assert.equal(visible.some(task => ['equipment', 'transport', 'schedule', 'incidents'].includes(task.id)), false)
  const merged = mergeSimpleChecklist(item, plan)
  assert.ok(merged.checklist.some(task => task.id === 'schedule'))
  assert.ok(merged.checklist.some(task => task.id === 'custom-uuid'))
  assert.deepEqual(merged.checklist.find(task => task.id === 'contract'), original.checklist.find(task => task.id === 'contract'))
  assert.deepEqual(plan, original)
  assert.deepEqual(mergeSimpleChecklist(item, merged), merged)
})

test('current packing completions retain their author and date when the list is regenerated', () => {
  const item = event()
  const plan = checked(item)
  const original = structuredClone(plan.checklist.find(task => task.id === 'simple-out-dj'))
  assert.deepEqual(simpleChecklist(item, plan).find(task => task.id === 'simple-out-dj'), original)
})

test('essential staff and before checklist still protect execution without hidden requirements', () => {
  const item = event({ detalle_servicio: 'Incluye DJ y animación.' })
  const plan = checked(item)
  const missing = simpleReadiness(item, plan)
  assert.ok(missing.blocking.some(alert => alert.key === 'role-animation'))
  assert.equal(missing.alerts.some(alert => /equipment|installation|schedule|service-/.test(alert.key)), false)
  plan.staff.push(assignment({ id: 'animation', collaboratorId: 'artist', role: 'Animadora', confirmation: 'pending' }))
  assert.ok(simpleReadiness(item, plan).blocking.some(alert => alert.key === 'staff-confirmation-animation'))
  plan.staff[1].confirmation = 'confirmed'
  assert.equal(simpleReadiness(item, plan).ready, true)
  plan.checklist.find(task => task.id === 'simple-out-dj')!.done = false
  assert.ok(simpleReadiness(item, plan).blocking.some(alert => alert.key === 'checklist-simple-out-dj'))
})

test('an empty service description uses the configured CRM package, while explicit exclusions win', () => {
  const fromPackage = simpleChecklist(event({ detalle_servicio: '', paquete: 'Ultra Chicoteca LED' }))
  for (const key of ['dj', 'glitter', 'led', 'projection', 'lights']) assert.ok(fromPackage.some(task => task.serviceKey === key))
  const explicit = simpleChecklist(event({ detalle_servicio: 'Solo DJ. No incluye pista LED, Glitter ni proyector.', paquete: 'Ultra Chicoteca LED' }))
  assert.deepEqual(explicit.map(task => task.id), ['simple-out-dj'])
  const djPackage = simpleChecklist(event({ detalle_servicio: '', paquete: 'Just Dance & Karaoke Party' }))
  assert.ok(djPackage.some(task => task.serviceKey === 'sound'))
  assert.ok(djPackage.some(task => task.serviceKey === 'projection'))
  assert.equal(djPackage.some(task => task.serviceKey === 'led' || task.serviceKey === 'glitter'), false)
})

test('every CRM extra is added verbatim, deduplicated and identified by UTF-8 source content', () => {
  const item = event({ adicionales_requerimientos: '  Mesa especial;Letrero: ¡Feliz cumple! 🎉\nAdaptador de corriente\n', adicionales: 'Mesa especial;Letrero: ¡Feliz cumple! 🎉' })
  const extras = checklistExtras(item)
  assert.deepEqual(extras.map(extra => extra.label), ['Mesa especial', 'Letrero: ¡Feliz cumple! 🎉', 'Adaptador de corriente'])
  assert.equal(extras[0].id, 'simple-extra-4d65736120657370656369616c')
  assert.equal(extras[1].id, 'simple-extra-' + Buffer.from(extras[1].label, 'utf8').toString('hex'))
  const tasks = simpleChecklist(item)
  assert.ok(extras.every(extra => tasks.some(task => task.id === extra.id && task.label === extra.label && task.stage === 'before')))
})

test('a modified or newly added extra requires its own unchecked packing confirmation', () => {
  const item = event({ adicionales_requerimientos: 'Mesa especial' })
  const plan = checked(item)
  const oldExtra = plan.checklist.find(task => task.id.startsWith('simple-extra-'))!
  assert.equal(oldExtra.done, true)
  const changed = { ...item, adicionales_requerimientos: 'Mesa especial ampliada;2 micrófonos adicionales' }
  const regenerated = simpleChecklist(changed, plan)
  const extras = regenerated.filter(task => task.id.startsWith('simple-extra-'))
  assert.equal(extras.length, 2)
  assert.ok(extras.every(task => task.done === false && !task.completedBy && !task.completedAt))
  const merged = mergeSimpleChecklist(changed, plan)
  assert.deepEqual(merged.checklist.find(task => task.id === oldExtra.id), oldExtra)
  assert.equal(simpleReadiness(changed, merged).ready, false)
})

test('staff physical overlaps remain critical; transfer uses staff margins, not removed logistics', () => {
  const item = event()
  const plan = checked(item)
  const other = event({ id: 'other', hora_inicio: '20:00', hora_fin: '22:00' })
  const otherPlan = newPlan(other)
  otherPlan.staff = [assignment({ id: 'other-staff', start: '2028-03-18T20:00', end: '2028-03-18T22:00' })]
  plan.exceptions = [{ key: 'resource:staff:dj:other', reason: 'Una nota no cambia la ocupación real' }]
  assert.equal(simpleReadiness(item, plan, [{ event: other, plan: otherPlan }]).ready, false)
  assert.equal(simpleReadiness(item, plan, [{ event: other, plan: otherPlan }]).blocking.find(alert => alert.key === 'resource:staff:dj:other')?.canJustify, false)
  otherPlan.staff[0].start = '2028-03-18T21:10'
  plan.exceptions = []
  assert.equal(simpleReadiness(item, plan, [{ event: other, plan: otherPlan }]).blocking.find(alert => alert.key === 'resource:staff:dj:other')?.canJustify, true)
  plan.exceptions = [{ key: 'resource:staff:dj:other', reason: 'Traslado cercano coordinado por producción' }]
  assert.equal(simpleReadiness(item, plan, [{ event: other, plan: otherPlan }]).ready, true)
  plan.staff[0].transferMinutes = 0
  otherPlan.staff[0].transferMinutes = 0
  plan.logistics.transferMinutes = 999
  plan.exceptions = []
  assert.equal(simpleReadiness(item, plan, [{ event: other, plan: otherPlan }]).ready, true)
})

test('automatic schedule and staff defaults follow the current CRM contract on arbitrary dates', () => {
  const item = event({ cronograma: 'Instalación 9 am, Glitter 5:50 pm a 6:50 pm, Show 6:50 pm a 8:50 pm', detalle_servicio: 'Incluye DJ, Glitter y animación.' })
  assert.equal(automaticActivities(item).length, 3)
  assert.ok(automaticActivities(item).every(activity => !activity.id.startsWith('auto-base-')))
  assert.deepEqual(staffPeriod(item, 'Glitter'), { start: '2028-03-18T17:50', end: '2028-03-18T18:50' })
  assert.deepEqual(staffPeriod(item, 'Animadora'), { start: '2028-03-18T18:50', end: '2028-03-18T20:50' })
  assert.deepEqual(staffPeriod(item, 'DJ'), { start: '2028-03-18T18:00', end: '2028-03-18T21:00' })
  assert.deepEqual(staffPeriod(item, 'Personal de instalación'), { start: '2028-03-18T09:00', end: '' })
})

test('staff proposals exclude busy or inactive people, stay pending and never create equipment assignments', () => {
  const item = event()
  const plan = newPlan(item)
  const other = event({ id: 'other' })
  const otherPlan = newPlan(other)
  otherPlan.staff = [assignment({ collaboratorId: 'A ocupado' })]
  const original = structuredClone(plan)
  const result = suggestSimpleStaff(item, plan, [person('A ocupado', 'DJ'), person('B inactivo', 'DJ', false), person('C equivocado', 'Animadora'), person('D disponible', 'DJ')], [{ event: other, plan: otherPlan }])
  assert.equal(result.staffAdded, 1)
  assert.equal(result.plan.staff[0].collaboratorId, 'D disponible')
  assert.equal(result.plan.staff[0].confirmation, 'pending')
  assert.equal(result.plan.equipment.length, 0)
  assert.equal(result.plan.activities.length, 0)
  assert.deepEqual(plan, original)
  assert.equal(suggestSimpleStaff(item, result.plan, [person('D disponible', 'DJ')], []).staffAdded, 0)
})
