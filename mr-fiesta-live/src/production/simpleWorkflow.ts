import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { Activity, Alert, ChecklistItem, ProductionContext, ProductionPlan, StaffAssignment } from './model'
import { activitiesFromContract } from './autoplan'
import { contractServices, eventBounds, toEpoch } from './rules'
import { crmPackages } from '../lib/crmPackages'

const normalize = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const positive = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0
const valid = (start: string, end: string) => Number.isFinite(toEpoch(start)) && Number.isFinite(toEpoch(end)) && toEpoch(end) > toEpoch(start)

/** Package configuration is a fallback only when this reservation has no explicit service description. */
export function effectiveChecklistEvent(event: CrmEvent): CrmEvent {
  if (event.detalle_servicio?.trim()) return event
  const packageName = Object.keys(crmPackages).find(name => normalize(name).trim() === normalize(event.paquete).trim())
  const detail = packageName ? crmPackages[packageName].detail : ''
  return detail ? { ...event, detalle_servicio: detail } : event
}

interface PackingItem { id: string; label: string; serviceKey: string; unless?: string[] }
const packingItems: PackingItem[] = [
  { id: 'simple-out-dj', label: 'Laptop, cabina y accesorios del DJ', serviceKey: 'dj' },
  { id: 'simple-out-sound', label: 'Parlantes, consola, micrófonos y cables', serviceKey: 'sound' },
  { id: 'simple-out-led', label: 'Pista LED: módulos, controlador, fuentes y cables', serviceKey: 'led' },
  { id: 'simple-out-projection', label: 'Proyector, ecran/pantalla, cable HDMI y adaptadores', serviceKey: 'projection' },
  { id: 'simple-out-lights', label: 'Luces, UV/láser y conexiones indicadas en el servicio', serviceKey: 'lights' },
  { id: 'simple-out-glitter', label: 'Kit Glitter, maquillaje y materiales', serviceKey: 'glitter' },
  { id: 'simple-out-decoration', label: 'Decoración, paneles y accesorios contratados', serviceKey: 'decoration' },
  { id: 'simple-out-effects', label: 'Máquina de humo o burbujas acordada, líquido y conexiones', serviceKey: 'effects' },
  { id: 'simple-out-smoke', label: 'Máquina de humo, líquido y conexiones', serviceKey: 'smoke' },
  { id: 'simple-out-bubbles', label: 'Máquina de burbujas, líquido y conexiones', serviceKey: 'bubbles' },
  { id: 'simple-out-games', label: 'Materiales para juegos y dinámicas', serviceKey: 'games' },
  { id: 'simple-out-hora-loca', label: 'Accesorios de Hora Loca', serviceKey: 'hora-loca' },
  { id: 'simple-out-accessories', label: 'Accesorios y consumibles contratados', serviceKey: 'accessories', unless: ['hora-loca'] },
  { id: 'simple-out-animation', label: 'Materiales del show de animación', serviceKey: 'animation', unless: ['games', 'hora-loca'] },
  { id: 'simple-out-makeup', label: 'Kit de maquillaje y materiales', serviceKey: 'makeup', unless: ['glitter'] },
]

/** Exact extras receive content-based IDs, so changing an extra can never reuse an old completion. */
export function checklistExtras(event: CrmEvent): { id: string; label: string }[] {
  const unique = new Map<string, { id: string; label: string }>()
  for (const source of [event.adicionales_requerimientos, event.adicionales]) {
    for (const fragment of String(source || '').split(/[\r\n;]+/)) {
      const label = fragment.replace(/^[\t ]+|[\t ]+$/g, '')
      if (!label || unique.has(label)) continue
      const hex = Array.from(new TextEncoder().encode(label), byte => byte.toString(16).padStart(2, '0')).join('')
      unique.set(label, { id: `simple-extra-${hex}`, label })
    }
  }
  return [...unique.values()]
}

/** Only the automatic warehouse-departure list is displayed. Historic stage checklists remain stored. */
export function simpleChecklist(event: CrmEvent, plan?: ProductionPlan): ChecklistItem[] {
  const included = new Set(contractServices(effectiveChecklistEvent(event)).filter(service => service.contracted === true).map(service => service.key))
  const definitions: { id: string; label: string; serviceKey?: string }[] = [...packingItems.filter(task => included.has(task.serviceKey) && !task.unless?.some(key => included.has(key))), ...checklistExtras(event)]
  if (!definitions.length) definitions.push({ id: 'simple-out-general', label: 'Materiales del servicio contratado listos para salir' })
  const previous = plan?.checklist || []
  return definitions.map(definition => {
    const current = previous.find(task => task.id === definition.id)
    const serviceKey = definition.serviceKey
    return { ...(current || { id: definition.id, done: false }), label: definition.label, stage: 'before' as const, ...(serviceKey ? { serviceKey } : {}) }
  })
}

/** Retain the original checklist for history; the new interface only displays simpleChecklist(). */
export function mergeSimpleChecklist(event: CrmEvent, plan: ProductionPlan): ProductionPlan {
  const visible = simpleChecklist(event, plan)
  const visibleIds = new Set(visible.map(task => task.id))
  return { ...plan, checklist: [...plan.checklist.filter(task => !visibleIds.has(task.id)), ...visible] }
}

/** Read-only schedule from the current contractual source. No installation durations or extra activities are invented. */
export function automaticActivities(event: CrmEvent): Activity[] { return activitiesFromContract(event) }

interface EssentialRole { key: string; label: string; pattern: RegExp }
const essentialRoles: EssentialRole[] = [
  { key: 'dj', label: 'DJ', pattern: /\bdj\b|disc.?jockey/ },
  { key: 'animation', label: 'Animación', pattern: /animador|animadora|animacion/ },
  { key: 'glitter', label: 'Responsable de Glitter', pattern: /glitter|maquill/ },
  { key: 'makeup', label: 'Maquilladora', pattern: /maquill|glitter/ },
  { key: 'assistant', label: 'Asistente de producción', pattern: /asistente|staff|produccion/ },
]
const rolesFor = (event: CrmEvent) => {
  const included = new Set(contractServices(effectiveChecklistEvent(event)).filter(service => service.contracted === true).map(service => service.key))
  return essentialRoles.filter(role => included.has(role.key))
}
const roleMatches = (value: string, role: EssentialRole) => role.pattern.test(normalize(value))

/** Artist periods use the real service range when available, or the overall reservation as a draft default. */
export function staffPeriod(event: CrmEvent, role: string): { start: string; end: string } {
  const key = essentialRoles.find(candidate => roleMatches(role, candidate))?.key
  const kind = /desmont/.test(normalize(role)) ? 'teardown' : /instala|montaje/.test(normalize(role)) ? 'setup' : undefined
  const source = automaticActivities(event).filter(activity => key ? activity.serviceKey === key || (key === 'makeup' && activity.serviceKey === 'glitter') : kind && activity.kind === kind)
  const periods = source.filter(activity => valid(activity.start, activity.end))
  if (periods.length) return { start: periods.map(activity => activity.start).sort()[0], end: periods.map(activity => activity.end).sort().at(-1)! }
  if (kind && source.some(activity => activity.start)) return { start: source.find(activity => activity.start)!.start, end: '' }
  return eventBounds(event)
}

function gap(start: string, end: string, otherStart: string, otherEnd: string): number {
  if (!valid(start, end) || !valid(otherStart, otherEnd)) return Infinity
  const a = toEpoch(start), b = toEpoch(end), c = toEpoch(otherStart), d = toEpoch(otherEnd)
  if (a < d && c < b) return -1
  return Math.max(a - d, c - b) / 60000
}

/** Readiness has no equipment, logistics, service-matrix or manual-schedule requirements. */
export function simpleReadiness(event: CrmEvent, plan: ProductionPlan, contexts: ProductionContext[] = []): { ready: boolean; alerts: Alert[]; unresolved: Alert[]; blocking: Alert[] } {
  const alerts: Alert[] = []
  const add = (key: string, message: string, fix: string, canJustify = false) => alerts.push({ key, message, fix, canJustify, severity: 'critical' as const })
  const bounds = eventBounds(event)
  if (!event.direccion?.trim() || !event.lugar?.trim() || !valid(bounds.start, bounds.end)) add('event-data', 'Faltan dirección, distrito u horarios del evento.', 'Completa los datos de la reserva en el CRM.')
  for (const task of simpleChecklist(event, plan).filter(item => item.stage === 'before')) {
    if (!task.done || !task.completedBy?.trim() || !task.completedAt || !Number.isFinite(toEpoch(task.completedAt))) add(`checklist-${task.id}`, `Pendiente: ${task.label}.`, 'Márcalo en el checklist cuando esté verificado.')
  }
  const staff = plan.staff.filter(member => member.confirmation !== 'declined')
  for (const role of rolesFor(event)) {
    if (!staff.some(member => roleMatches(member.role, role))) add(`role-${role.key}`, `Falta asignar ${role.label}.`, 'Añade una persona para esta función en Personal.')
  }
  for (const member of staff) {
    if (!member.collaboratorId || !member.role.trim() || !valid(member.start, member.end) || (member.arrival && (!Number.isFinite(toEpoch(member.arrival)) || toEpoch(member.arrival) > toEpoch(member.start)))) add(`staff-invalid-${member.id}`, 'Una asignación de personal tiene datos u horarios incompletos.', 'Revisa su función, inicio y salida en Personal.')
    if (member.confirmation !== 'confirmed') add(`staff-confirmation-${member.id}`, 'Hay personal pendiente de confirmación.', 'Confirma su participación en Personal.')
    if (!Number.isFinite(member.fee) || member.fee < 0 || !Number.isFinite(member.transferMinutes) || member.transferMinutes < 0) add(`staff-values-${member.id}`, 'Revisa los honorarios o minutos de traslado de una persona.', 'Utiliza importes y minutos positivos o cero.')
    for (const other of contexts.filter(context => context.event.id !== event.id)) {
      for (const external of other.plan.staff.filter(item => item.collaboratorId === member.collaboratorId && item.confirmation !== 'declined')) {
        const separation = gap(member.arrival || member.start, member.end, external.arrival || external.start, external.end)
        const margin = Math.max(positive(member.transferMinutes), positive(external.transferMinutes))
        const key = `resource:staff:${member.collaboratorId}:${other.event.id}`
        const otherName = other.event.agasajado || other.event.cliente
        if (separation < 0) add(key, `Un colaborador también está asignado a «${otherName}» en el mismo horario.`, 'Cambia de persona o corrige los horarios.')
        else if (separation < margin) add(key, `Un colaborador tiene ${separation} min de traslado hacia/desde «${otherName}» y necesita ${margin} min.`, 'Ajusta los horarios o registra una excepción de traslado.', true)
      }
    }
  }
  if (plan.payments.some(payment => !Number.isFinite(payment.amount) || payment.amount <= 0 || !payment.date)) add('payments-invalid', 'Hay un pago adicional sin fecha o importe válido.', 'Revisa ese pago en el resumen financiero.')
  if (plan.costs.some(cost => !Number.isFinite(cost.amount) || cost.amount < 0)) add('costs-invalid', 'Hay un costo con importe inválido.', 'Revisa los costos en el resumen financiero.')
  const unique = new Map<string, Alert>()
  for (const alert of alerts) if (!unique.has(alert.key) || (unique.get(alert.key)?.canJustify && !alert.canJustify)) unique.set(alert.key, alert)
  const all = [...unique.values()]
  const unresolved = all.filter(alert => !(alert.canJustify && plan.exceptions.some(exception => exception.key === alert.key && exception.reason.trim().length >= 8)))
  return { ready: !unresolved.length, alerts: all, unresolved, blocking: unresolved }
}

/** Preparation progress counts only the short before-event checklist and confirmed essential functions. */
export function simpleProgress(event: CrmEvent, plan: ProductionPlan): number {
  const before = simpleChecklist(event, plan).filter(task => task.stage === 'before')
  const staff = plan.staff.filter(member => member.confirmation !== 'declined')
  const checks = [...before.map(task => task.done), ...rolesFor(event).map(role => staff.some(member => member.confirmation === 'confirmed' && roleMatches(member.role, role))), ...staff.map(member => member.confirmation === 'confirmed')]
  return checks.length ? Math.round(checks.filter(Boolean).length / checks.length * 100) : 0
}

export interface SimpleStaffSuggestion { plan: ProductionPlan; staffAdded: number; warnings: string[] }
/** Suggestions use real registry functions and occupied periods. Confirmation always remains a human decision. */
export function suggestSimpleStaff(event: CrmEvent, existing: ProductionPlan, collaborators: CrmCollaborator[], contexts: ProductionContext[] = []): SimpleStaffSuggestion {
  const plan = structuredClone(existing)
  const result: SimpleStaffSuggestion = { plan, staffAdded: 0, warnings: [] }
  for (const role of rolesFor(event)) {
    if (plan.staff.some(member => member.confirmation !== 'declined' && roleMatches(member.role, role))) continue
    const period = staffPeriod(event, role.label)
    if (!valid(period.start, period.end)) { result.warnings.push(`${role.label}: faltan los horarios de la reserva.`); continue }
    const margin = 45
    const compatible = (person: CrmCollaborator) => {
      if (!person.activo || !roleMatches(person.rol, role)) return false
      if (plan.staff.some(member => member.collaboratorId === person.id && member.confirmation !== 'declined' && gap(period.start, period.end, member.arrival || member.start, member.end) < 0)) return false
      return contexts.filter(context => context.event.id !== event.id).every(context => context.plan.staff.filter(member => member.collaboratorId === person.id && member.confirmation !== 'declined').every(member => {
        const occupiedStart = member.arrival || member.start
        if (!valid(occupiedStart, member.end)) {
          if (context.event.fecha_evento === event.fecha_evento) return false
          const bounds = eventBounds(context.event)
          return valid(bounds.start, bounds.end) && gap(period.start, period.end, bounds.start, bounds.end) >= Math.max(margin, positive(member.transferMinutes))
        }
        return gap(period.start, period.end, occupiedStart, member.end) >= Math.max(margin, positive(member.transferMinutes))
      }))
    }
    const person = [...collaborators].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).find(compatible)
    if (!person) { result.warnings.push(`${role.label}: no se encontró una persona disponible con esa función registrada.`); continue }
    const member: StaffAssignment = { id: `simple-staff-${role.key}-${person.id}`, collaboratorId: person.id, role: role.label, arrival: period.start, start: period.start, end: period.end, confirmation: 'pending', notes: 'Sugerencia por función registrada y horario contractual. Confirmar participación y honorarios.', fee: 0, transferMinutes: margin }
    plan.staff.push(member); result.staffAdded++
  }
  return result
}
