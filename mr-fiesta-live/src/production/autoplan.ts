import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { Activity, ActivityKind, EquipmentAsset, ProductionContext, ProductionPlan } from './model'
import { contractServices, eventBounds, newPlan, toEpoch } from './rules'

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const slug = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'actividad'
const generationNote = 'Borrador generado desde los campos reales del contrato. Revisa los horarios importados y completa responsables, instalación, pruebas y recursos. No se han confirmado personas, equipos ni acuerdos con el cliente.'

interface Clock { hour: number; minute: number; marker: 'am' | 'pm' | ''; explicit24: boolean; index: number; end: number }
function clocks(source: string): Clock[] {
  const values: Clock[] = []
  const pattern = /(?<![\d/:])\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\b(?![\d/:])/g
  for (const match of source.matchAll(pattern)) {
    const hour = Number(match[1]), marker = (match[3] || '') as Clock['marker']
    if (hour > 23 || (marker && (hour < 1 || hour > 12))) continue
    values.push({ hour, minute: Number(match[2] || 0), marker, explicit24: !marker && (hour === 0 || hour > 12 || (match[1].length === 2 && match[1].startsWith('0') && match[2] !== undefined)), index: match.index!, end: match.index! + match[0].length })
  }
  return values
}
function minutes(clock: Clock, inferred?: 'am' | 'pm'): number | null {
  const marker = clock.marker || inferred
  if (marker) return (clock.hour % 12 + (marker === 'pm' ? 12 : 0)) * 60 + clock.minute
  return clock.explicit24 ? clock.hour * 60 + clock.minute : null
}
function range(first: Clock, second?: Clock): { start: number; end?: number } | null {
  if (!second) { const start = minutes(first); return start === null ? null : { start } }
  let start = minutes(first), end = minutes(second)
  // A single AM/PM marker may qualify the whole range only when it gives a forward interval.
  // "6 a 9 pm" is clear; "11 a 1 pm" has competing morning/overnight interpretations.
  if (start === null && second.marker && first.hour >= 1 && first.hour <= 12) {
    const candidate = minutes(first, second.marker)
    if (candidate !== null && end !== null && candidate < end) start = candidate
  }
  if (end === null && first.marker && second.hour >= 1 && second.hour <= 12) {
    const candidate = minutes(second, first.marker)
    if (candidate !== null && start !== null && candidate > start) end = candidate
  }
  return start === null || end === null || start === end ? null : { start, end }
}
function localDate(base: string, offset: number, value: number): string {
  const baseEpoch = toEpoch(`${base}T12:00`)
  if (!Number.isFinite(baseEpoch)) return ''
  const date = new Date(baseEpoch + offset * 86_400_000).toISOString().slice(0, 10)
  return `${date}T${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
function describe(name: string): { kind: ActivityKind; serviceKey?: string } {
  const value = normalize(name)
  if (/desmont|desinstal/.test(value)) return { kind: 'teardown' }
  if (/prueba|test tecnico|chequeo tecnico/.test(value)) return { kind: 'test' }
  if (/instala|montaje|descarga/.test(value)) return { kind: 'setup' }
  if (/salida|traslado|retorno|recojo|llegada/.test(value)) return { kind: 'travel' }
  if (/g[l]?itter|glitter|tatuaje/.test(value)) return { kind: 'show', serviceKey: 'glitter' }
  if (/\bdj\b/.test(value)) return { kind: 'show', serviceKey: 'dj' }
  if (/animacion|animador|\bshow\b/.test(value)) return { kind: 'show', serviceKey: 'animation' }
  if (/hora loca/.test(value)) return { kind: 'show', serviceKey: 'hora-loca' }
  if (/juego|dinamica|karaoke|just dance/.test(value)) return { kind: 'show', serviceKey: 'games' }
  if (/recepcion|invitados|fiesta|servicio/.test(value)) return { kind: 'show' }
  return { kind: 'other' }
}
function blank(id: string, name: string, kind: ActivityKind, serviceKey?: string): Activity {
  return { id, name, kind, ...(serviceKey ? { serviceKey } : {}), start: '', end: '', responsibleIds: [], notes: 'Borrador: completar horario y responsables.', status: 'pending' }
}

/** Conservative importer: unsupported or ambiguous text stays visible in notes and never becomes an invented time. */
export function activitiesFromContract(event: CrmEvent): Activity[] {
  const text = (event.cronograma || '').replace(/\ba\s*\.\s*m\s*\.?|\ba\s+m\b/gi, 'am').replace(/\bp\s*\.\s*m\s*\.?|\bp\s+m\b/gi, 'pm')
  const fragments = text.split(/[,;\n]|\.(?=\s|$)/).map(value => value.trim()).filter(Boolean)
  const result: Activity[] = []
  const occurrences = new Map<string, number>()
  const bounds = eventBounds(event)
  for (const fragment of fragments) {
    const normalized = normalize(fragment)
    const times = clocks(normalized)
    if (!times.length) continue
    const first = times[0], second = times[1]
    const name = fragment.slice(0, first.index).replace(/\b(?:del?\s+)?dia\s+(?:anterior|siguiente)\b/gi, '').replace(/\b(?:desde|de|a las|aproximadamente|aprox)\s*$/i, '').replace(/[-:\s]+$/, '').trim() || 'Actividad contractual'
    const meta = describe(name)
    const key = `${meta.kind}-${slug(name)}`
    const occurrence = (occurrences.get(key) || 0) + 1; occurrences.set(key, occurrence)
    const activity = blank(`auto-source-${key}-${occurrence}`, name, meta.kind, meta.serviceKey)
    activity.notes = `Fuente contractual: ${fragment}. Revisar antes de confirmar.`
    // More than two times, unsupported date syntax or a missing range connector are not interpreted.
    const connector = second ? normalized.slice(first.end, second.index).trim() : ''
    const validConnector = !second || /^(?:a|hasta|al|-|–|—)\s*(?:las\s*)?$/.test(connector)
    const parsed = times.length <= 2 && !/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(normalized) && validConnector ? range(first, second) : null
    if (parsed) {
      let offset = /dia anterior|un dia antes/.test(normalized) ? -1 : /dia siguiente|un dia despues/.test(normalized) ? 1 : 0
      const explicitDay = /dia anterior|un dia antes|dia siguiente|un dia despues/.test(normalized)
      if (!explicitDay && meta.kind === 'show' && bounds.end.slice(0, 10) > bounds.start.slice(0, 10)) {
        const endMinutes = Number(event.hora_fin.slice(0, 2)) * 60 + Number(event.hora_fin.slice(3, 5))
        if (parsed.start <= endMinutes) offset = 1
      }
      activity.start = localDate(event.fecha_evento, offset, parsed.start)
      if (parsed.end !== undefined) activity.end = localDate(event.fecha_evento, offset + (parsed.end < parsed.start ? 1 : 0), parsed.end)
      if (/aprox|aproximad/.test(normalized)) activity.notes += ' La hora original es aproximada.'
      if (!second) activity.notes += ' El contrato indica una hora puntual; la duración sigue pendiente.'
    } else activity.notes += ' Horario ambiguo o formato no reconocido: completa las fechas manualmente.'
    result.push(activity)
  }
  return result
}

/** Builds a reusable draft from this event only. It never assigns or confirms a person or an asset. */
export function autoPlan(event: CrmEvent): ProductionPlan {
  const plan = newPlan(event)
  plan.activities = activitiesFromContract(event)
  const contracted = contractServices(event).filter(service => service.contracted === true)
  const scaffold: { id: string; name: string; kind: ActivityKind; serviceKey?: string }[] = [
    { id: 'auto-base-setup', name: 'Instalación', kind: 'setup' },
    { id: 'auto-base-tests', name: 'Pruebas técnicas', kind: 'test' },
    ...contracted.filter(service => ['dj', 'animation', 'glitter', 'games', 'hora-loca'].includes(service.key)).map(service => ({ id: `auto-service-${service.key}`, name: service.label, kind: 'show' as const, serviceKey: service.key })),
    { id: 'auto-base-teardown', name: 'Desmontaje', kind: 'teardown' },
  ]
  for (const item of scaffold) if (!plan.activities.some(activity => item.serviceKey ? activity.serviceKey === item.serviceKey : activity.kind === item.kind)) plan.activities.push(blank(item.id, item.name, item.kind, item.serviceKey))
  const source = plan.activities.filter(activity => activity.id.startsWith('auto-source-') && activity.start)
  const unique = (predicate: (activity: Activity) => boolean) => { const found = source.filter(predicate); return found.length === 1 ? found[0].start : '' }
  plan.logistics.installation = unique(activity => activity.kind === 'setup' && /instala|montaje/.test(normalize(activity.name)))
  plan.logistics.test = unique(activity => activity.kind === 'test')
  plan.logistics.teardown = unique(activity => activity.kind === 'teardown')
  plan.logistics.pickup = unique(activity => /recojo/.test(normalize(activity.name)))
  plan.logistics.departure = unique(activity => /salida.*almacen/.test(normalize(activity.name)))
  plan.logistics.arrival = unique(activity => /llegada/.test(normalize(activity.name)))
  plan.logistics.serviceStart = source.filter(activity => activity.kind === 'show').sort((a, b) => a.start.localeCompare(b.start))[0]?.start || ''
  plan.notes = generationNote
  return plan
}

export interface PlanMerge {
  plan: ProductionPlan
  addedActivities: number
  addedChecklist: number
  addedCommitments: number
  preservedActivities: number
}
/** Adds source novelties only. Existing edits, assignments, statuses, fees, agreements and confirmations win. */
export function mergeOfferPlan(event: CrmEvent, existing: ProductionPlan): PlanMerge {
  const generated = autoPlan(event)
  let preservedActivities = 0
  const addedActivities = generated.activities.filter(candidate => {
    const present = existing.activities.some(current => current.id === candidate.id || (normalize(current.name).trim() === normalize(candidate.name).trim() && current.kind === candidate.kind) || (candidate.id.startsWith('auto-base-') && current.kind === candidate.kind) || (candidate.id.startsWith('auto-service-') && !!candidate.serviceKey && current.serviceKey === candidate.serviceKey))
    if (present) preservedActivities++
    return !present
  })
  const addedChecklist = generated.checklist.filter(candidate => !existing.checklist.some(current => current.id === candidate.id || normalize(current.label).trim() === normalize(candidate.label).trim()))
  const addedCommitments = generated.commitments.filter(candidate => !existing.commitments.some(current => current.key === candidate.key))
  return { plan: { ...existing, activities: [...existing.activities, ...addedActivities], checklist: [...existing.checklist, ...addedChecklist], commitments: [...existing.commitments, ...addedCommitments] }, addedActivities: addedActivities.length, addedChecklist: addedChecklist.length, addedCommitments: addedCommitments.length, preservedActivities }
}

interface ResourceRequest { key: string; label: string; activities: Activity[]; role: RegExp }
export interface ResourceSuggestions { plan: ProductionPlan; staffAdded: number; equipmentAdded: number; responsibilitiesAdded: number; warnings: string[] }
function valid(start: string, end: string) { return Number.isFinite(toEpoch(start)) && Number.isFinite(toEpoch(end)) && toEpoch(end) > toEpoch(start) }
function incompatible(start: string, end: string, otherStart: string, otherEnd: string, margin: number) {
  if (!valid(start, end) || !valid(otherStart, otherEnd)) return true
  const a = toEpoch(start), b = toEpoch(end), c = toEpoch(otherStart), d = toEpoch(otherEnd)
  return a < d && c < b || Math.max(a - d, c - b) / 60_000 < margin
}

/** Explicit user-triggered suggestions. All assignments remain pending and every existing edit wins. */
export function suggestResources(event: CrmEvent, existing: ProductionPlan, collaborators: CrmCollaborator[], assets: EquipmentAsset[], contexts: ProductionContext[]): ResourceSuggestions {
  const plan = structuredClone(existing)
  const warnings: string[] = []
  const result: ResourceSuggestions = { plan, staffAdded: 0, equipmentAdded: 0, responsibilitiesAdded: 0, warnings }
  const requests: ResourceRequest[] = [
    { key: 'dj', label: 'DJ', activities: [], role: /\bdj\b|disc.?jockey/ },
    { key: 'animation', label: 'Animación', activities: [], role: /animador|animadora|animacion/ },
    { key: 'glitter', label: 'Responsable de Glitter', activities: [], role: /glitter|maquillador|maquilladora/ },
    { key: 'setup', label: 'Personal de instalación', activities: [], role: /instalacion|instalador|montajista|montaje/ },
    { key: 'test', label: 'Pruebas técnicas', activities: [], role: /tecnico|tecnica|sonidista/ },
    { key: 'teardown', label: 'Responsable de desmontaje', activities: [], role: /desmontaje|desmontajista/ },
  ]
  const contracted = contractServices(event).filter(service => service.contracted === true)
  for (const activity of plan.activities.filter(item => item.status !== 'cancelled')) {
    const key = ['setup', 'test', 'teardown'].includes(activity.kind) ? activity.kind : activity.serviceKey === 'dj' ? 'dj' : activity.serviceKey === 'glitter' ? 'glitter' : ['animation', 'games', 'hora-loca'].includes(activity.serviceKey || '') ? 'animation' : ''
    requests.find(request => request.key === key)?.activities.push(activity)
  }
  for (const request of requests) {
    if (!request.activities.length && !contracted.some(service => service.key === request.key)) continue
    for (const activity of request.activities.filter(item => !item.responsibleIds.length && valid(item.start, item.end))) {
      const assigned = plan.staff.find(member => member.confirmation !== 'declined' && request.role.test(normalize(member.role)) && valid(member.arrival || member.start, member.end) && toEpoch(member.arrival || member.start) <= toEpoch(activity.start) && toEpoch(member.end) >= toEpoch(activity.end))
      if (assigned) { activity.responsibleIds = [assigned.collaboratorId]; result.responsibilitiesAdded++ }
    }
    const pending = request.activities.filter(activity => !activity.responsibleIds.length)
    if (request.activities.length && !pending.length) continue
    if (!pending.length || pending.some(activity => !valid(activity.start, activity.end))) {
      warnings.push(`${request.label}: completa el inicio y fin de sus actividades para poder proponer personal.`); continue
    }
    const start = pending.map(activity => activity.start).sort()[0]
    const end = pending.map(activity => activity.end).sort().at(-1)!
    const transfer = Math.max(0, plan.logistics.transferMinutes || 0)
    const candidates = collaborators.filter(person => person.activo && request.role.test(normalize(person.rol)) && !plan.staff.some(assignment => assignment.collaboratorId === person.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const person = candidates.find(candidate => contexts.filter(context => context.event.id !== event.id).every(context => context.plan.staff.filter(assignment => assignment.collaboratorId === candidate.id && assignment.confirmation !== 'declined').every(assignment => {
      const otherStart = assignment.arrival || assignment.start
      const margin = Math.max(transfer, assignment.transferMinutes || 0, context.plan.logistics.transferMinutes || 0)
      if (!valid(otherStart, assignment.end)) {
        if (context.event.fecha_evento === event.fecha_evento) return false
        const bounds = eventBounds(context.event)
        return valid(bounds.start, bounds.end) && !incompatible(start, end, bounds.start, bounds.end, margin)
      }
      return !incompatible(start, end, otherStart, assignment.end, margin)
    })))
    if (!person) { warnings.push(`${request.label}: no se encontró una persona activa con función compatible y disponibilidad verificable. Revisa el registro de colaboradores y los otros compromisos.`); continue }
    plan.staff.push({ id: `suggest-staff-${request.key}-${person.id}`, collaboratorId: person.id, role: request.label, arrival: start, start, end, confirmation: 'pending', notes: 'Sugerencia automática por función registrada y horarios de actividades. Confirmar participación, llegada, honorarios y traslado.', fee: 0, transferMinutes: transfer })
    result.staffAdded++
    for (const activity of pending) {
      // The request is built from matching activity kinds/services and its occupation covers each full interval.
      activity.responsibleIds = [person.id]; result.responsibilitiesAdded++
    }
    if (request.key === 'setup' && !plan.logistics.installerIds.length) plan.logistics.installerIds = [person.id]
    if (request.key === 'teardown' && !plan.logistics.teardownIds.length) plan.logistics.teardownIds = [person.id]
  }

  const equipmentRequests: { key: string; label: string; pattern: RegExp }[] = []
  const need = (key: string) => contracted.some(service => service.key === key)
  if (need('led')) equipmentRequests.push({ key: 'led', label: 'Pista LED', pattern: /pista.*led|led.*pista/ })
  if (need('projection')) {
    equipmentRequests.push({ key: 'projector', label: 'Proyector', pattern: /proyector/ })
    const evidence = normalize(contracted.find(service => service.key === 'projection')!.evidence)
    if (/ecran|pantalla/.test(evidence)) equipmentRequests.push({ key: 'screen', label: 'Ecran / pantalla', pattern: /ecran|pantalla/ })
  }
  if (need('sound')) equipmentRequests.push({ key: 'sound', label: 'Sonido', pattern: /parlante|sonido/ })
  if (need('lights')) equipmentRequests.push({ key: 'lights', label: 'Iluminación', pattern: /luces|iluminacion|laser|\buv\b/ })
  if (need('effects')) equipmentRequests.push({ key: 'effects', label: 'Humo o burbujas', pattern: /humo|burbujas/ })
  else {
    if (need('smoke')) equipmentRequests.push({ key: 'smoke', label: 'Humo', pattern: /humo/ })
    if (need('bubbles')) equipmentRequests.push({ key: 'bubbles', label: 'Burbujas', pattern: /burbujas/ })
  }
  if (need('decoration')) equipmentRequests.push({ key: 'decoration', label: 'Decoración', pattern: /decoracion|backing|panel/ })
  const starts = [plan.logistics.installation, ...plan.activities.filter(activity => activity.kind === 'setup').map(activity => activity.start)].filter(value => Number.isFinite(toEpoch(value))).sort()
  const ends = [plan.logistics.pickup, ...plan.activities.filter(activity => activity.kind === 'teardown').map(activity => activity.end)].filter(value => Number.isFinite(toEpoch(value))).sort()
  const equipmentStart = starts[0] || '', equipmentEnd = ends.at(-1) || ''
  const bounds = eventBounds(event)
  const serviceEnds = [bounds.end, ...plan.activities.filter(activity => activity.kind === 'show' && activity.status !== 'cancelled').map(activity => activity.end)].filter(value => Number.isFinite(toEpoch(value))).sort()
  const finalServiceEnd = serviceEnds.at(-1) || ''
  for (const request of equipmentRequests) {
    if (plan.equipment.some(assignment => assets.some(asset => asset.id === assignment.assetId && request.pattern.test(normalize(`${asset.name} ${asset.identifier}`))))) continue
    if (!valid(equipmentStart, equipmentEnd) || (finalServiceEnd && toEpoch(equipmentEnd) < toEpoch(finalServiceEnd))) { warnings.push(`${request.label}: completa instalación y fin de desmontaje o recojo que cubran todo el servicio antes de proponer una reserva completa de equipo.`); continue }
    const transfer = Math.max(0, plan.logistics.transferMinutes || 0)
    const asset = assets.filter(candidate => candidate.status === 'available' && request.pattern.test(normalize(`${candidate.name} ${candidate.identifier}`)) && !plan.equipment.some(assignment => assignment.assetId === candidate.id))
      .sort((a, b) => a.identifier.localeCompare(b.identifier, 'es'))
      .find(candidate => contexts.filter(context => context.event.id !== event.id).every(context => context.plan.equipment.filter(assignment => assignment.assetId === candidate.id).every(assignment => !incompatible(equipmentStart, equipmentEnd, assignment.start, assignment.end, Math.max(transfer, assignment.transferMinutes || 0, context.plan.logistics.transferMinutes || 0)))))
    if (!asset) { warnings.push(`${request.label}: no hay un equipo identificado disponible sin conflictos; registra o revisa el inventario.`); continue }
    plan.equipment.push({ id: `suggest-asset-${request.key}-${asset.id}`, assetId: asset.id, start: equipmentStart, end: equipmentEnd, status: 'reserved', transferMinutes: transfer, notes: 'Propuesta de reserva basada en instalación y recojo/desmontaje registrados. Revisar dimensiones, accesorios, transporte y disponibilidad física antes de confirmar la producción.' })
    result.equipmentAdded++
  }
  return result
}
