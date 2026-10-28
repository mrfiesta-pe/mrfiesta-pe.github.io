import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmCollaborator, CrmEvent } from '../src/types/domain'
import type { Activity, ProductionPlan } from '../src/production/model'
import { autoPlan } from '../src/production/autoplan'
import { agendaFingerprint, applyAgendaEdit, buildDayAgenda, buildEventAgenda, isShareOutdated, publicOperationalDetails } from '../src/production/agenda'
import { buildAgendaPdf, dailyMessage, eventMessage, safeWhatsApp } from '../src/production/agendaExports'

function event(patch: Partial<CrmEvent> = {}): CrmEvent {
  return { id: 'event', cliente: 'Cliente operativo', agasajado: 'Celebración', tipo_evento: 'Prueba', edad: 10, invitados: 40, telefono: '999111222', fecha_evento: '2029-08-31', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Bellavista', direccion: 'Dirección real de la reserva', dni_ruc: '', referencia: 'Frente al parque', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Ultra Chicoteca LED', detalle_servicio: '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación. Incluye DJ y pista LED de 3x2 metros.', juegos_elegidos: '', cronograma: 'Instalación 10 am, Glitter 5:50 pm a 6:50 pm, Show 6:50 pm a 8:50 pm', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 1290, adelanto: 200, saldo: 1090, drive_pdf_url: null, created_at: '', updated_at: '', ...patch }
}
const person = (id = 'artist', name = 'Artista', phone = '999333444'): CrmCollaborator => ({ id, nombre: name, rol: 'Animadora / Glitter', telefono: phone, activo: true, created_at: '' })
const activity = (patch: Partial<Activity> = {}): Activity => ({ id: 'manual-activity', name: 'Instalación', kind: 'setup', start: '2029-08-31T08:30', end: '2029-08-31T09:30', responsibleIds: [], notes: '', status: 'pending', ...patch })
function staffing(plan: ProductionPlan): void {
  plan.staff = [{ id: 'staff', collaboratorId: 'artist', role: 'Animadora y Glitter', arrival: '2029-08-31T17:30', start: '2029-08-31T17:50', end: '2029-08-31T21:00', confirmation: 'confirmed', notes: 'PRIVATE_STAFF_NOTE', fee: 54321.98, transferMinutes: 45 }]
}

test('read-only agenda uses contract imports and never confirms initial autoPlan scaffolds or changes data', () => {
  const source = event()
  const plan = autoPlan(source)
  const before = structuredClone(plan)
  const rows = buildEventAgenda(source, plan, 7)
  assert.ok(rows.some(row => row.name === 'Glitter' && row.source === 'contract' && row.start === '2029-08-31T17:50'))
  assert.equal(rows.some(row => row.source === 'production'), false)
  assert.ok(rows.filter(row => row.source === 'suggested').every(row => !row.confirmed && row.pending))
  assert.ok(rows.every(row => row.revision === 7))
  assert.equal(rows.filter(row => row.name === 'Inicio del evento').length, 1)
  assert.equal(rows.filter(row => row.name === 'Finalización del evento').length, 1)
  assert.deepEqual(plan, before)
})

test('latest recorded agreement overrides contractual installation using event date, not agreement timestamp', () => {
  const source = event()
  const plan = autoPlan(source)
  plan.agreements = [{ id: 'first', date: '2029-08-10T18:00', responsible: 'Producción', note: 'Instalación 8 am' }, { id: 'latest', date: '2029-08-20T12:00', responsible: 'Cliente', note: 'Instalación 9 am' }]
  const installation = buildEventAgenda(source, plan).filter(row => row.kind === 'setup' && /instala/.test(row.name.toLowerCase()))
  assert.equal(installation.length, 1)
  assert.equal(installation[0].start, '2029-08-31T09:00')
  assert.equal(installation[0].source, 'agreement')
  assert.equal(installation[0].confirmed, true)
})

test('confirmed production takes priority over later agreements; legacy manual edits stay visible', () => {
  const source = event()
  const plan = autoPlan(source)
  plan.agreements = [{ id: 'agreement', date: '2029-08-30T19:00', responsible: 'Cliente', note: 'Instalación 9 am' }]
  plan.activities.push(activity({ confirmed: true }))
  let rows = buildEventAgenda(source, plan)
  assert.equal(rows.find(row => row.kind === 'setup')?.start, '2029-08-31T08:30')
  assert.equal(rows.find(row => row.kind === 'setup')?.source, 'production')
  plan.activities.at(-1)!.confirmed = undefined
  rows = buildEventAgenda(source, plan)
  assert.equal(rows.find(row => row.kind === 'setup')?.sourceLabel, 'Producción guardada')
  assert.equal(rows.find(row => row.kind === 'setup')?.confirmed, false)
})

test('legacy imported schedule edits outrank raw source while untouched copied points remain contractual', () => {
  const source = event()
  const plan = autoPlan(source)
  const glitter = plan.activities.find(item => item.serviceKey === 'glitter')!
  glitter.start = '2029-08-31T17:40'
  const rows = buildEventAgenda(source, plan)
  assert.equal(rows.find(row => row.serviceKey === 'glitter')?.start, '2029-08-31T17:40')
  assert.equal(rows.find(row => row.serviceKey === 'glitter')?.source, 'production')
  const updated = { ...source, cronograma: source.cronograma.replace('10 am', '9 am') }
  assert.equal(buildEventAgenda(updated, plan).find(row => row.kind === 'setup')?.start, '2029-08-31T09:00')
})

test('unparseable agreements do not invent times; unconfirmed production is suggested only when missing', () => {
  const source = event()
  const plan = autoPlan(source)
  plan.agreements = [{ id: 'unclear', date: '2029-08-30T20:00', responsible: 'Cliente', note: 'Instalación a coordinar, probablemente después del almuerzo' }]
  plan.activities.push(activity({ id: 'advanced-unconfirmed', confirmed: false, start: '2029-08-31T07:00', end: '2029-08-31T08:00' }))
  assert.equal(buildEventAgenda(source, plan).find(row => row.kind === 'setup')?.start, '2029-08-31T10:00')
  plan.activities.push(activity({ id: 'advanced-missing', name: 'Entrega de recuerdos', kind: 'other', confirmed: false, start: '', end: '' }))
  const pending = buildEventAgenda(source, plan).find(row => row.name === 'Entrega de recuerdos')!
  assert.equal(pending.source, 'suggested')
  assert.equal(pending.confirmed, false)
  assert.equal(pending.pending, true)
})

test('suggested package choreography is clearly marked and contract-specific exclusions remain respected', () => {
  const source = event({ cronograma: '', detalle_servicio: '' })
  const rows = buildEventAgenda(source, autoPlan(source))
  const glitter = rows.find(row => row.serviceKey === 'glitter')!
  const animation = rows.find(row => row.serviceKey === 'animation')!
  assert.equal(glitter.start, '2029-08-31T18:00')
  assert.equal(glitter.end, '2029-08-31T19:00')
  assert.equal(animation.start, '2029-08-31T19:00')
  assert.equal(animation.end, '2029-08-31T21:00')
  assert.equal(glitter.source, 'suggested')
  assert.ok(glitter.sourceLabel.includes('SUGERIDO'))
  assert.equal(glitter.confirmed, false)
  const excluded = event({ cronograma: '', detalle_servicio: 'Incluye DJ. No incluye Glitter ni animación.' })
  assert.equal(buildEventAgenda(excluded, autoPlan(excluded)).some(row => ['glitter', 'animation'].includes(row.serviceKey || '')), false)
})

test('day agenda includes selected events complete and actual adjacent-day movement with stable chronology', () => {
  const first = event()
  const firstPlan = autoPlan(first)
  firstPlan.logistics.installation = '2029-08-30T09:00'
  firstPlan.logistics.pickup = '2029-09-01T10:00'
  const next = event({ id: 'next', fecha_evento: '2029-09-01', cronograma: '' })
  const nextPlan = autoPlan(next)
  nextPlan.logistics.installation = '2029-08-31T11:00'
  const rows = buildDayAgenda([{ event: first, plan: firstPlan, revision: 2 }, { event: next, plan: nextPlan, revision: 4 }], '2029-08-31')
  assert.ok(rows.some(row => row.eventId === first.id && row.start === '2029-08-30T09:00'))
  assert.ok(rows.some(row => row.eventId === first.id && row.start === '2029-09-01T10:00'))
  assert.ok(rows.some(row => row.eventId === next.id && row.start === '2029-08-31T11:00' && row.revision === 4))
  assert.equal(rows.some(row => row.eventId === next.id && row.start.startsWith('2029-09-01')), false)
  const finite = rows.filter(row => row.start).map(row => row.start)
  assert.deepEqual(finite, [...finite].sort())
  assert.ok(rows.slice(rows.findIndex(row => !row.start)).every(row => !row.start))
})

test('quick edits preserve unrelated periods and explicit responsible IDs outside the staff list', () => {
  const source = event({ cronograma: 'DJ previo 5 pm a 6 pm, DJ de cierre 8 pm a 9 pm' })
  const plan = autoPlan(source)
  plan.notes = 'PRIVATE_PLAN_NOTE'
  plan.costs = [{ id: 'cost', category: 'Costo', description: 'PRIVATE_COST', amount: 77777.12 }]
  const original = structuredClone(plan)
  const opening = buildEventAgenda(source, plan).find(row => /previo/.test(row.name))!
  const changed = applyAgendaEdit(source, plan, opening, { name: 'DJ apertura coordinada', start: '2029-08-31T16:50', responsibleIds: ['registered-person-not-in-plan-staff'] })
  assert.deepEqual(changed.costs, original.costs)
  assert.equal(changed.notes, original.notes)
  assert.ok(changed.activities.some(item => /cierre/.test(item.name) && item.end === '2029-08-31T21:00'))
  const saved = buildEventAgenda(source, changed).find(row => row.name === 'DJ apertura coordinada')!
  assert.deepEqual(saved.responsibleIds, ['registered-person-not-in-plan-staff'])
  assert.equal(saved.confirmed, true)
  assert.equal(saved.source, 'production')
  assert.deepEqual(plan, original)
  assert.throws(() => applyAgendaEdit(event({ id: 'wrong' }), plan, opening, {}))
})

test('boundary quick edits retain semantic origin instead of duplicating the original contract boundary', () => {
  const source = event()
  const plan = autoPlan(source)
  const boundary = buildEventAgenda(source, plan).find(row => row.id === 'agenda-boundary-start')!
  const updated = applyAgendaEdit(source, plan, boundary, { name: 'Arranque coordinado', start: '2029-08-31T18:10' })
  const rows = buildEventAgenda(source, updated)
  assert.ok(rows.some(row => row.name === 'Arranque coordinado' && row.start === '2029-08-31T18:10'))
  assert.equal(rows.some(row => row.id === 'agenda-boundary-start'), false)
})

test('renaming a single DJ closing period to generic DJ keeps the opening period visible', () => {
  const source = event({ cronograma: 'Inicio DJ 6 pm a 7 pm, Cierre DJ 8 pm a 9 pm' })
  const plan = autoPlan(source)
  const closing = buildEventAgenda(source, plan).find(row => row.name === 'Cierre DJ')!
  const updated = applyAgendaEdit(source, plan, closing, { name: 'DJ', start: '2029-08-31T20:15' })
  const rows = buildEventAgenda(source, updated)
  assert.ok(rows.some(row => row.name === 'Inicio DJ' && row.start === '2029-08-31T18:00' && row.source === 'contract'))
  assert.ok(rows.some(row => row.name === 'DJ' && row.start === '2029-08-31T20:15' && row.source === 'production'))
  assert.equal(rows.some(row => row.name === 'Cierre DJ'), false)
  assert.ok(updated.activities.some(row => row.name === 'Inicio DJ'))
})

test('editing one repeated service occurrence preserves the other occurrence in the visible agenda', () => {
  const source = event({ cronograma: 'Glitter 5 pm a 6 pm, Glitter 7 pm a 8 pm' })
  const plan = autoPlan(source)
  const second = buildEventAgenda(source, plan).find(row => row.serviceKey === 'glitter' && row.start === '2029-08-31T19:00')!
  const updated = applyAgendaEdit(source, plan, second, { name: 'Glitter coordinado', start: '2029-08-31T19:15' })
  const rows = buildEventAgenda(source, updated).filter(row => row.serviceKey === 'glitter')
  assert.equal(rows.length, 2)
  assert.ok(rows.some(row => row.start === '2029-08-31T17:00' && row.source === 'contract'))
  assert.ok(rows.some(row => row.start === '2029-08-31T19:15' && row.source === 'production'))
})

test('agenda messages and PDF include operational services/directions but exclude private money and notes', () => {
  const source = event({ adicionales_requerimientos: '2 micrófonos extra;Decoración adicional S/ 85;Honorarios privados S/ 12345.67', observaciones: 'PRIVATE_CRM_NOTE' })
  const plan = autoPlan(source)
  staffing(plan)
  plan.notes = 'PRIVATE_PLAN_NOTE'
  plan.logistics.notes = 'PRIVATE_LOGISTICS_NOTE'
  plan.logistics.parking = 'Estacionamiento en puerta 2'
  plan.logistics.electricity = 'Tomacorriente cerca del escenario'
  plan.agreements = [{ id: 'a', date: '2029-08-30T14:00', responsible: 'Cliente', note: 'PRIVATE_AGREEMENT_FEE S/ 33445.66' }]
  plan.costs = [{ id: 'private', category: 'PRIVATE_COST', description: 'PRIVATE_COST_NOTE', amount: 88888.77 }]
  plan.payments = [{ id: 'payment', amount: 66778.99, date: '2029-08-30T12:00', note: 'PRIVATE_PAYMENT' }]
  const people = [person()]
  const texts = [eventMessage(source, plan, people), dailyMessage(source.fecha_evento, [{ event: source, plan }], people), buildAgendaPdf(source.fecha_evento, [{ event: source, plan }], people).output()]
  for (const text of texts) {
    assert.ok(text.includes('Artista'))
    assert.ok(text.includes('999333444'))
    assert.ok(text.includes('2 micr'))
    assert.ok(text.includes('Estacionamiento en puerta 2'))
    for (const secret of ['PRIVATE_', '12345.67', '54321.98', '33445.66', '88888.77', '66778.99', '1290', '1090']) assert.equal(text.includes(secret), false, secret)
  }
  assert.ok(publicOperationalDetails(source, plan).services.some(service => service.includes('3x2')))
})

test('sharing fingerprint changes for public operations and contacts, not private finances or bookkeeping', () => {
  const source = event()
  const plan = autoPlan(source)
  staffing(plan)
  const people = [person()]
  const fingerprint = agendaFingerprint(source, plan, people)
  plan.agendaShares = [{ id: 'share', scope: 'event', at: '2029-08-30T12:00:00Z', fingerprint }]
  assert.equal(isShareOutdated(source, plan, people), false)
  assert.equal(isShareOutdated(plan, source), false)
  plan.notes = 'Private changed'
  plan.staff[0].fee = 90000
  plan.costs.push({ id: 'cost', category: 'Privado', amount: 5000, description: 'Private' })
  assert.equal(isShareOutdated(source, plan, people), false)
  plan.logistics.parking = 'Nueva puerta 4'
  assert.equal(isShareOutdated(source, plan, people), true)
  plan.logistics.parking = ''
  assert.equal(isShareOutdated(source, plan, [{ ...people[0], telefono: '999777888' }]), true)
  assert.equal(isShareOutdated({ ...source, direccion: 'Nueva dirección' }, plan, people), true)
})

test('safe WhatsApp links support recipient selection and reject invalid supplied numbers', () => {
  assert.ok(safeWhatsApp('', 'Agenda & revisión')?.startsWith('https://wa.me/?text='))
  assert.ok(safeWhatsApp('999333444', 'Agenda')?.startsWith('https://wa.me/51999333444?text='))
  assert.equal(safeWhatsApp('123', 'Agenda'), null)
  assert.ok(safeWhatsApp(undefined, 'Agenda')?.includes('Agenda'))
})

test('explicit activity-only participants are included in share freshness, and invalid individual exports cannot become a full-day report', () => {
  const source = event()
  let plan = autoPlan(source)
  const row = buildEventAgenda(source, plan).find(activity => activity.serviceKey === 'glitter')!
  plan = applyAgendaEdit(source, plan, row, { responsibleIds: ['external-assignee'] })
  const people = [person('external-assignee', 'Responsable directo', '999111555')]
  plan.agendaShares = [{ id: 'share', scope: 'event', at: '2029-08-30T12:00:00Z', fingerprint: agendaFingerprint(source, plan, people) }]
  assert.equal(isShareOutdated(source, plan, people), false)
  assert.equal(isShareOutdated(source, plan, [{ ...people[0], telefono: '999111666' }]), true)
  assert.throws(() => buildAgendaPdf(source.fecha_evento, [{ event: source, plan }], people, 'unknown-event'))
})

test('daily PDF paginates long operations without truncating final events', () => {
  const contexts = Array.from({ length: 8 }, (_, index) => {
    const source = event({ id: `event-${index}`, cliente: `Cliente ${index}`, agasajado: `CELEBRACION_${index}`, adicionales_requerimientos: Array.from({ length: 30 }, (_, extra) => `Instrucción pública ${extra}: ${'material preparado '.repeat(5)}`).join(';') })
    return { event: source, plan: autoPlan(source) }
  })
  const pdf = buildAgendaPdf('2029-08-31', contexts, [])
  assert.ok(pdf.getNumberOfPages() > 8)
  assert.ok(pdf.output().includes('CELEBRACION_7'))
})
