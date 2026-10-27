import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmCollaborator, CrmEvent } from '../src/types/domain'
import { newPlan } from '../src/production/rules'
import { buildProductionPdf, collaboratorMessage, productionDate, whatsappLink } from '../src/production/exports'
import { contractUrl } from '../src/production/contractDocument'

const event: CrmEvent = { id: 'example-event', cliente: 'Cliente', agasajado: 'Celebracion', tipo_evento: 'Prueba', edad: null, invitados: null, telefono: '999999999', fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Surco', direccion: 'Direccion operativa 123', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: 'CONTRACT_PRIVATE', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: 'CRM_PRIVATE', estado_pago: 'Reservado', total: 1000.35, adelanto: 300.1, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '' }
const person: CrmCollaborator = { id: 'person-1', nombre: 'Persona asignada', rol: 'DJ', telefono: '999999999', activo: true, created_at: '' }
function plan() {
  const document = newPlan(event)
  document.notes = 'INTERNAL_PRIVATE'
  document.agreements = [{ id: 'agreement-1', date: '2026-10-27T10:00', responsible: 'Responsable', note: 'AGREEMENT_PRIVATE' }]
  document.costs = [{ id: 'cost-1', category: 'Otros', amount: 50.25, description: 'COST_PRIVATE' }]
  document.payments = [{ id: 'payment-1', amount: 100.2, date: '2026-10-27T10:00', note: 'PAYMENT_PRIVATE' }]
  document.staff = [{ id: 'assignment-1', collaboratorId: person.id, role: 'DJ', arrival: '2026-10-31T17:00', start: '2026-10-31T18:00', end: '2026-10-31T21:00', confirmation: 'confirmed', notes: 'STAFF_PRIVATE', fee: 100, transferMinutes: 45 }]
  document.activities = [{ id: 'activity-1', name: 'Actuacion DJ', start: '2026-10-31T18:00', end: '2026-10-31T21:00', responsibleIds: [person.id], notes: 'ACTIVITY_PRIVATE', status: 'pending', kind: 'show', exception: 'EXCEPTION_PRIVATE' }]
  document.logistics.notes = 'LOGISTICS_PRIVATE'
  return document
}
const privateMarkers = ['CONTRACT_PRIVATE', 'CRM_PRIVATE', 'INTERNAL_PRIVATE', 'AGREEMENT_PRIVATE', 'COST_PRIVATE', 'PAYMENT_PRIVATE', 'STAFF_PRIVATE', 'ACTIVITY_PRIVATE', 'EXCEPTION_PRIVATE', 'LOGISTICS_PRIVATE']

test('collaborator messages include assignments and operational schedule without private or financial fields', () => {
  const message = collaboratorMessage(event, plan(), person)
  assert.ok(message.includes(person.nombre))
  assert.ok(message.includes('Actuacion DJ'))
  assert.ok(message.includes(event.direccion))
  assert.ok(message.includes('Confirmado'))
  for (const marker of privateMarkers) assert.equal(message.includes(marker), false, marker)
  for (const financial of ['1000.35', '300.10', 'honorarios', 'utilidad']) assert.equal(message.includes(financial), false, financial)
})

test('staff PDF applies the same privacy boundaries to actual generated PDF content', () => {
  const pdf = buildProductionPdf([{ event, plan: plan() }], [person], [], true, person.id)
  const source = pdf.output()
  assert.ok(source.includes('Actuacion DJ'))
  assert.ok(source.includes(event.direccion))
  for (const marker of privateMarkers) assert.equal(source.includes(marker), false, marker)
  assert.equal(source.includes('1000.35'), false)
  assert.equal(source.includes('Utilidad estimada'), false)
})

test('internal operational PDF preserves notes and uses actual deposit plus extra payments', () => {
  const pdf = buildProductionPdf([{ event, plan: plan() }], [person], [])
  const source = pdf.output()
  assert.ok(source.includes('INTERNAL_PRIVATE'))
  assert.ok(source.includes('AGREEMENT_PRIVATE'))
  assert.ok(source.includes('COST_PRIVATE'))
  assert.ok(source.includes('600.05'), 'saldo debe usar 1000.35 - 300.10 - 100.20')
  assert.ok(source.includes('850.10'), 'utilidad debe restar costo y honorarios')
})

test('long operational notes paginate and consolidated reports include every event', () => {
  const document = plan()
  document.notes = `${'Detalle largo de operacion y coordinacion. '.repeat(800)}FINISH_MARKER`
  const contexts = Array.from({ length: 5 }, (_, index) => ({ event: { ...event, id: `event-${index}`, agasajado: `EVENT_MARKER_${index}` }, plan: document }))
  const pdf = buildProductionPdf(contexts, [person], [])
  assert.ok(pdf.getNumberOfPages() > 5)
  const source = pdf.output()
  for (let index = 0; index < 5; index++) assert.ok(source.includes(`EVENT_MARKER_${index}`))
  assert.equal((source.match(/FINISH_MARKER/g) || []).length, 5)
})

test('WhatsApp prepares a link only for valid international or Peruvian mobile numbers', () => {
  const link = whatsappLink(person, 'Texto & sin envio')
  assert.ok(link?.startsWith('https://wa.me/51999999999?text='))
  assert.ok(link?.endsWith(encodeURIComponent('Texto & sin envio')))
  assert.equal(whatsappLink({ ...person, telefono: 'javascript:alert(1)' }, 'test'), null)
  assert.equal(whatsappLink({ ...person, telefono: '12' }, 'test'), null)
})

test('contract viewer retains HTTPS source and only rewrites recognized Drive file previews', () => {
  assert.equal(contractUrl('javascript:alert(1)'), null)
  assert.equal(contractUrl('http://example.com/file.pdf'), null)
  assert.equal(contractUrl('https://user:pass@example.com/file.pdf'), null)
  assert.equal(contractUrl('https://drive.google.com.evil.test/file/d/abc/view')?.preview, 'https://drive.google.com.evil.test/file/d/abc/view')
  assert.deepEqual(contractUrl('https://drive.google.com/file/d/real_file-id/view'), { original: 'https://drive.google.com/file/d/real_file-id/view', preview: 'https://drive.google.com/file/d/real_file-id/preview' })
  assert.equal(contractUrl(null), null)
})

test('operational timestamps always format in Lima even for UTC source times', () => {
  const text = productionDate('2026-11-01T03:00:00Z')
  assert.ok(text.includes('31/10/26'))
  assert.ok(text.includes('22:00'))
  assert.equal(productionDate(''), 'Por confirmar')
})
