import test from 'node:test'
import assert from 'node:assert/strict'
import type { CrmEvent } from '../src/types/domain'
import { contractServices, newPlan } from '../src/production/rules'

function event(overrides: Partial<CrmEvent> = {}): CrmEvent {
  return { id: 'legacy-event', cliente: 'Cliente', agasajado: '', tipo_evento: 'Prueba', edad: null, invitados: null, telefono: '',
    fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Surco', direccion: 'Dirección',
    dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: '',
    juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado',
    total: 1000, adelanto: 200, saldo: 0, drive_pdf_url: null, created_at: '', updated_at: '', ...overrides }
}

test('legacy additional contract text creates actual service commitments and an adapted checklist', () => {
  const item = event({ adicionales: 'Incluye proyector y 1 hora de estación Glitter. No incluye pista LED.' })
  const services = contractServices(item)
  assert.equal(services.find((service) => service.key === 'projection')?.contracted, true)
  assert.equal(services.find((service) => service.key === 'glitter')?.durationMinutes, 60)
  assert.equal(services.find((service) => service.key === 'led')?.contracted, false)
  const plan = newPlan(item)
  assert.ok(plan.commitments.some((commitment) => commitment.key === 'projection'))
  assert.ok(plan.checklist.some((task) => task.serviceKey === 'glitter'))
  assert.equal(plan.checklist.some((task) => task.serviceKey === 'led'), false)
})

test('legacy and current additional fields remain available together without duplicate commitment keys', () => {
  const item = event({ adicionales_requerimientos: 'Incluye DJ.', adicionales: 'Incluye decoración temática.' })
  const services = contractServices(item)
  const additional = services.filter((service) => service.key === 'additional')
  assert.equal(additional.length, 1)
  assert.equal(additional[0].evidence, 'Incluye DJ.\nIncluye decoración temática.')
  assert.equal(services.find((service) => service.key === 'dj')?.contracted, true)
  assert.equal(services.find((service) => service.key === 'decoration')?.contracted, true)
  assert.equal(new Set(newPlan(item).commitments.map((commitment) => commitment.key)).size, newPlan(item).commitments.length)
})

test('contradictions in legacy text stay unresolved and alternatives do not require both machines', () => {
  const item = event({ detalle_servicio: 'Incluye pista LED.', adicionales: 'No incluye pista LED. Máquina de humo o burbujas.' })
  const services = contractServices(item)
  assert.equal(services.find((service) => service.key === 'led')?.contracted, null)
  assert.equal(services.find((service) => service.key === 'smoke')?.contracted, null)
  assert.equal(services.find((service) => service.key === 'bubbles')?.contracted, null)
  assert.equal(services.find((service) => service.key === 'effects')?.contracted, true)
})

test('the default legacy mobility field and package name do not invent contractual promises', () => {
  const item = event({ paquete: 'Ultra Chicoteca LED', movilidad: 'Incluida', adicionales: null })
  const services = contractServices(item)
  assert.equal(services.find((service) => service.key === 'transport')?.contracted, null)
  assert.equal(services.find((service) => service.key === 'led')?.contracted, null)
  assert.equal(services.some((service) => service.key === 'additional'), false)
  assert.deepEqual(newPlan(item).commitments, [])
})

test('reading old contractual fields preserves every original value', () => {
  const item = event({ adicionales: 'Incluye DJ.', movilidad: 'Incluida', dni: '00000000', dni_ruc: '' })
  const before = JSON.stringify(item)
  Object.freeze(item)
  contractServices(item)
  newPlan(item)
  assert.equal(JSON.stringify(item), before)
})
