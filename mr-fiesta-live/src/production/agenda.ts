import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { Activity, ActivityKind, ProductionContext, ProductionPlan } from './model'
import { activitiesFromContract } from './autoplan'
import { contractServices, dayLocal, eventBounds, toEpoch } from './rules'
import { checklistExtras, effectiveChecklistEvent } from './simpleWorkflow'

export type AgendaSource = 'production' | 'agreement' | 'contract' | 'suggested'
export interface AgendaActivity extends Activity {
  eventId: string
  source: AgendaSource
  confirmed: boolean
  sourceLabel: string
  pending: boolean
  originId?: string
  revision?: number
}
export interface AgendaEdit { name?: string; start?: string; end?: string; responsibleIds?: string[]; notes?: string }
const norm = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const known = (value: string) => Number.isFinite(toEpoch(value))
const validRange = (activity: Pick<Activity, 'start' | 'end'>) => known(activity.start) && known(activity.end) && toEpoch(activity.end) >= toEpoch(activity.start)
const autoId = (id: string) => /^auto-(?:source|service|base)-/.test(id)
const priorities: Record<AgendaSource, number> = { suggested: 0, contract: 1, agreement: 2, production: 3 }

type SemanticActivity = Pick<Activity, 'name' | 'kind' | 'serviceKey' | 'agendaOriginId' | 'agendaOriginKey'> & { id?: string }
function semantic(activity: SemanticActivity): string {
  const name = norm(activity.name)
  if (activity.agendaOriginKey) return activity.agendaOriginKey
  if (activity.agendaOriginId === 'agenda-boundary-start') return 'boundary:start'
  if (activity.agendaOriginId === 'agenda-boundary-end') return 'boundary:end'
  if (/^(?:inicio|comienzo) (?:del? )?(?:evento|servicio)$/.test(name)) return 'boundary:start'
  if (/^(?:fin|final|finalizacion|cierre) (?:del? )?(?:evento|servicio)$/.test(name) || name === 'finalizacion') return 'boundary:end'
  if (activity.serviceKey === 'dj') return /cierre|final/.test(name) ? 'service:dj:closing' : /previo|apertura|inicio/.test(name) ? 'service:dj:opening' : 'service:dj'
  if (activity.serviceKey && activity.serviceKey !== 'games') return `service:${activity.serviceKey}`
  if (activity.kind === 'setup' && /instala|montaje/.test(name)) return 'operation:installation'
  if (activity.kind === 'test') return 'operation:test'
  if (activity.kind === 'teardown') return 'operation:teardown'
  if (/recojo|recogida/.test(name)) return 'operation:pickup'
  if (/salida.*almacen/.test(name)) return 'operation:departure'
  if (/llegada/.test(name)) return 'operation:arrival'
  return `named:${name}`
}
function matches(a: SemanticActivity, b: SemanticActivity): boolean {
  if ((a.agendaOriginId && (a.agendaOriginId === b.id || a.agendaOriginId === b.agendaOriginId)) || (b.agendaOriginId && b.agendaOriginId === a.id)) return true
  const left = semantic(a), right = semantic(b)
  return left === right || (left === 'service:dj' && right.startsWith('service:dj:')) || (right === 'service:dj' && left.startsWith('service:dj:'))
}
function sameSourceFields(a: Activity, b: Activity) { return a.name === b.name && a.start === b.start && a.end === b.end && a.kind === b.kind && (a.serviceKey || '') === (b.serviceKey || '') }

function legacyProduction(activity: Activity, event: CrmEvent, contract: Activity[]): boolean {
  if (activity.confirmed === true) return true
  if (activity.confirmed === false) return false
  if (!autoId(activity.id)) return !!(activity.start || activity.end)
  if (!activity.id.startsWith('auto-source-')) return !!(activity.start || activity.end)
  // An imported activity keeps its original source phrase. Compare that snapshot before interpreting a legacy edit.
  const snapshot = activity.notes.match(/^Fuente contractual:\s*([\s\S]*?)\. Revisar antes de confirmar\./)?.[1]
  const original = snapshot ? activitiesFromContract({ ...event, cronograma: snapshot })[0] : contract.find(row => row.id === activity.id)
  return !!original && !sameSourceFields(activity, original)
}

function roleMatches(activity: Activity, role: string): boolean {
  const value = norm(role)
  if (activity.serviceKey === 'dj') return /\bdj\b|disc.?jockey/.test(value)
  if (activity.serviceKey === 'glitter') return /glitter|maquill/.test(value)
  if (activity.serviceKey === 'animation' || activity.serviceKey === 'games' || activity.serviceKey === 'hora-loca') return /animador|animadora|animacion/.test(value)
  if (activity.kind === 'setup') return /instala|montaje|produccion|staff/.test(value)
  if (activity.kind === 'test') return /tecnico|sonidista|\bdj\b/.test(value)
  if (activity.kind === 'teardown') return /desmontaje|produccion|staff/.test(value)
  if (activity.kind === 'travel') return /conductor|movilidad|instala|desmontaje/.test(value)
  return false
}
function responsible(activity: Activity, plan: ProductionPlan): string[] {
  const active = plan.staff.filter(member => member.confirmation !== 'declined')
  if (activity.responsibleIds.length) return [...new Set(activity.responsibleIds)]
  return [...new Set(active.filter(member => roleMatches(activity, member.role) && known(activity.start) && known(member.arrival || member.start) && known(member.end) && toEpoch(member.arrival || member.start) <= toEpoch(activity.start) && toEpoch(member.end) >= toEpoch(activity.end || activity.start)).map(member => member.collaboratorId))]
}
function row(event: CrmEvent, plan: ProductionPlan, activity: Activity, source: AgendaSource, sourceLabel: string, revision?: number, point = false): AgendaActivity {
  return { ...activity, responsibleIds: responsible(activity, plan), eventId: event.id, source, sourceLabel, originId: activity.id, revision, confirmed: (source === 'production' && activity.confirmed === true) || source === 'agreement', pending: source === 'suggested' || !(point ? known(activity.start) : validRange(activity)) }
}
function make(id: string, name: string, kind: ActivityKind, start = '', end = '', serviceKey?: string): Activity { return { id, name, kind, start, end, serviceKey, notes: '', responsibleIds: [], status: 'pending' } }
function localAt(epoch: number): string {
  if (!Number.isFinite(epoch)) return ''
  const date = dayLocal(new Date(epoch))
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(epoch))
  return `${date}T${clock}`
}
function ordered(rows: AgendaActivity[]): AgendaActivity[] {
  return rows.map((activity, index) => ({ activity, index })).sort((a, b) => {
    const x = toEpoch(a.activity.start), y = toEpoch(b.activity.start)
    return (Number.isFinite(x) ? x : Infinity) - (Number.isFinite(y) ? y : Infinity) || priorities[b.activity.source] - priorities[a.activity.source] || a.index - b.index
  }).map(item => item.activity)
}
function applySource(existing: AgendaActivity[], incoming: AgendaActivity[]): AgendaActivity[] {
  const replaces = (next: AgendaActivity, old: AgendaActivity) => {
    const linked = next.agendaOriginId ? existing.find(candidate => candidate.id === next.agendaOriginId) : undefined
    // A concrete source link edits one occurrence, even if the renamed label would now be generic.
    if (linked && linked.source === old.source) return linked.id === old.id
    return matches(next, old)
  }
  const retained = existing.filter(old => !incoming.some(next => priorities[next.source] > priorities[old.source] && replaces(next, old)))
  return [...retained, ...incoming.filter(next => !retained.some(old => priorities[old.source] > priorities[next.source] && matches(old, next)))]
}

function agreementActivities(event: CrmEvent, plan: ProductionPlan, revision?: number): AgendaActivity[] {
  let result: AgendaActivity[] = []
  const sorted = plan.agreements.map((agreement, index) => ({ agreement, index })).sort((a, b) => (toEpoch(a.agreement.date) || 0) - (toEpoch(b.agreement.date) || 0) || a.index - b.index)
  for (const { agreement } of sorted) {
    const parsed = activitiesFromContract({ ...event, cronograma: agreement.note }).filter(activity => known(activity.start) && (!activity.end || validRange(activity)))
    if (!parsed.length) continue
    const next = parsed.map(activity => row(event, plan, { ...activity, id: `agenda-agreement-${agreement.id}-${activity.id}`, notes: '', confirmed: true }, 'agreement', `Acuerdo con cliente · ${agreement.responsible || 'Responsable registrado'}`, revision, !activity.end))
    result = [...result.filter(old => !next.some(candidate => matches(candidate, old))), ...next]
  }
  return result
}

function suggestions(event: CrmEvent, plan: ProductionPlan, existing: AgendaActivity[], revision?: number): AgendaActivity[] {
  const services = contractServices(effectiveChecklistEvent(event)).filter(service => service.contracted === true)
  const has = (key: string) => services.some(service => service.key === key)
  const bounds = eventBounds(event), start = toEpoch(bounds.start), finish = toEpoch(bounds.end)
  const templates: Activity[] = []
  for (const template of plan.activityTemplates || []) {
    const at = Number.isFinite(start) && Number.isFinite(template.offsetMinutes) ? start + template.offsetMinutes! * 60000 : NaN
    const end = Number.isFinite(at) && Number.isFinite(template.durationMinutes) && template.durationMinutes! > 0 ? at + template.durationMinutes! * 60000 : NaN
    templates.push(make(`agenda-template-${template.id}`, template.name, template.kind, localAt(at), localAt(end), template.serviceKey))
  }
  const duration = (key: string) => services.find(service => service.key === key)?.durationMinutes
  const glitterMinutes = duration('glitter'), animationMinutes = duration('animation')
  const knownGlitter = existing.find(activity => activity.serviceKey === 'glitter' && validRange(activity))
  const knownAnimation = existing.find(activity => activity.serviceKey === 'animation' && validRange(activity))
  const detail = norm(effectiveChecklistEvent(event).detalle_servicio)
  const splitDj = has('dj') && /antes.*despues|distribuid/.test(detail) && glitterMinutes && animationMinutes && Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, (finish - start) / 60000 - glitterMinutes - animationMinutes) / 2 : 0
  const glitterStart = knownGlitter ? toEpoch(knownGlitter.start) : knownAnimation && glitterMinutes ? toEpoch(knownAnimation.start) - glitterMinutes * 60000 : start + splitDj * 60000
  const glitterEnd = knownGlitter ? toEpoch(knownGlitter.end) : Number.isFinite(glitterStart) && glitterMinutes ? glitterStart + glitterMinutes * 60000 : NaN
  if (has('glitter')) templates.push(make('agenda-suggested-glitter', 'Estación Glitter', 'show', glitterMinutes ? localAt(glitterStart) : '', localAt(glitterEnd), 'glitter'))
  if (has('animation')) {
    const animationStart = has('glitter') ? glitterEnd : start + splitDj * 60000
    const animationEnd = Number.isFinite(animationStart) && animationMinutes ? animationStart + animationMinutes * 60000 : NaN
    templates.push(make('agenda-suggested-animation', 'Show de animación', 'show', animationMinutes ? localAt(animationStart) : '', localAt(animationEnd), 'animation'))
  }
  if (has('dj')) {
    if (splitDj > 0) templates.push(make('agenda-suggested-dj-opening', 'DJ previo', 'show', bounds.start, localAt(start + splitDj * 60000), 'dj'), make('agenda-suggested-dj-closing', 'DJ de cierre', 'show', localAt(finish - splitDj * 60000), bounds.end, 'dj'))
    else templates.push(make('agenda-suggested-dj', 'DJ', 'show', Number.isFinite(start) ? bounds.start : '', Number.isFinite(finish) ? bounds.end : '', 'dj'))
  }
  if (has('games') && !has('animation')) templates.push(make('agenda-suggested-games', 'Juegos / Karaoke / Just Dance', 'show', '', '', 'games'))
  if (has('hora-loca') && !has('animation')) templates.push(make('agenda-suggested-hora-loca', 'Hora Loca', 'show', '', '', 'hora-loca'))
  if (services.some(service => ['dj', 'sound', 'led', 'lights', 'projection', 'decoration', 'effects', 'smoke', 'bubbles'].includes(service.key))) {
    templates.push(make('agenda-suggested-installation', 'Instalación', 'setup'), make('agenda-suggested-test', 'Pruebas técnicas', 'test'), make('agenda-suggested-teardown', 'Desmontaje', 'teardown'))
  }
  const result: AgendaActivity[] = []
  for (const activity of templates) {
    if ([...existing, ...result].some(current => matches(current, activity))) continue
    result.push(row(event, plan, activity, 'suggested', activity.id.startsWith('agenda-template-') ? 'SUGERIDO · plantilla interna' : 'SUGERIDO · servicios / paquete', revision))
  }
  return result
}

/** A derived read model. Opening an agenda never writes or confirms suggested schedules. */
export function buildEventAgenda(event: CrmEvent, plan: ProductionPlan, revision?: number): AgendaActivity[] {
  const contract = activitiesFromContract(event)
  let rows = contract.map(activity => row(event, plan, activity, 'contract', 'Cronograma del contrato', revision, !activity.end && known(activity.start)))
  rows = applySource(rows, agreementActivities(event, plan, revision))
  const production = plan.activities.filter(activity => legacyProduction(activity, event, contract)).map(activity => row(event, plan, activity, 'production', activity.confirmed === true ? 'Producción confirmada' : 'Producción guardada', revision, !activity.end && known(activity.start)))
  const pendingProduction = plan.activities.filter(activity => !legacyProduction(activity, event, contract) && (!autoId(activity.id) || activity.confirmed === false)).map(activity => row(event, plan, activity, 'suggested', 'SUGERIDO · producción sin confirmar', revision))
  const logistics = plan.logistics
  const points: [keyof typeof logistics, string, ActivityKind, string[]][] = [['departure', 'Salida del almacén', 'travel', []], ['arrival', 'Llegada al local', 'travel', []], ['installation', 'Instalación', 'setup', logistics.installerIds], ['test', 'Pruebas técnicas', 'test', []], ['teardown', 'Desmontaje', 'teardown', logistics.teardownIds], ['pickup', 'Recojo', 'travel', logistics.teardownIds]]
  for (const [field, name, kind, ids] of points) {
    const value = logistics[field]
    if (typeof value !== 'string' || !known(value)) continue
    const activity = { ...make(`agenda-logistics-${field}`, name, kind, value), responsibleIds: ids }
    if (production.some(current => matches(current, activity))) continue
    // An automatically copied contractual point is still contractual; it must not outrank a later agreement.
    if (contract.some(current => matches(current, activity) && current.start === value) || plan.activities.some(current => autoId(current.id) && current.start === value && matches(current, activity) && !legacyProduction(current, event, contract))) continue
    production.push(row(event, plan, activity, 'production', 'Coordinación guardada', revision, true))
  }
  rows = applySource(rows, production)
  rows = applySource(rows, pendingProduction)
  const bounds = eventBounds(event)
  for (const [which, label, value] of [['start', 'Inicio del evento', bounds.start], ['end', 'Finalización del evento', bounds.end]] as const) {
    const boundary = make(`agenda-boundary-${which}`, label, 'other', value)
    if (known(value) && !rows.some(current => semantic(current) === `boundary:${which}`)) rows.push(row(event, plan, boundary, 'contract', 'Horario del contrato', revision, true))
  }
  return ordered([...rows, ...suggestions(event, plan, rows, revision)])
}

/** Selected-date events keep their full operation; adjacent events contribute only activities on that day. */
export function buildDayAgenda(contexts: ProductionContext[], date: string): AgendaActivity[] {
  return ordered(contexts.flatMap(context => buildEventAgenda(context.event, context.plan, context.revision).filter(activity => context.event.fecha_evento === date || (known(activity.start) && activity.start.slice(0, 10) <= date && (activity.end || activity.start).slice(0, 10) >= date))))
}

/** A quick edit records just this activity, preserving unrelated documents, confirmations and monetary fields. */
export function applyAgendaEdit(event: CrmEvent, plan: ProductionPlan, activity: AgendaActivity, patch: AgendaEdit): ProductionPlan {
  if (activity.eventId !== event.id || plan.eventId !== event.id) throw new Error('La actividad no corresponde a este evento.')
  const name = (patch.name ?? activity.name).trim()
  const start = patch.start ?? activity.start, end = patch.end ?? activity.end
  if (!name) throw new Error('Escribe el nombre de la actividad.')
  if ((start && !known(start)) || (end && !known(end)) || (start && end && toEpoch(end) < toEpoch(start))) throw new Error('Revisa las fechas y horas de la actividad.')
  const previous = plan.activities.find(item => item.id === activity.originId || item.id === activity.id)
  const id = activity.source === 'production' && previous ? previous.id : `agenda-confirmed-${activity.originId || activity.id}`
  const next: Activity = { ...(previous || make(id, name, activity.kind)), id, name, start, end, kind: activity.kind, serviceKey: activity.serviceKey, responsibleIds: [...new Set(patch.responsibleIds ?? activity.responsibleIds)], notes: patch.notes ?? previous?.notes ?? '', confirmed: true, confirmedAt: new Date().toISOString(), agendaOriginId: previous?.agendaOriginId || activity.agendaOriginId || activity.originId || activity.id, agendaOriginKey: previous?.agendaOriginKey || activity.agendaOriginKey || semantic(activity) }
  return { ...plan, activities: [...plan.activities.filter(item => item.id !== id && item.id !== previous?.id), next] }
}

function hash(value: string): string {
  let a = 2166136261, b = 2246822519
  for (const byte of new TextEncoder().encode(value)) { a = Math.imul(a ^ byte, 16777619) >>> 0; b = Math.imul(b ^ byte, 3266489917) >>> 0 }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}
function operationalText(value: string): string {
  return String(value || '').split(/[\r\n;]+/).filter(fragment => !/honorari|costo|utilidad|ganancia|adelanto|saldo|pago|descuento|precio|sueldo|comision|presupuesto/i.test(norm(fragment)))
    .map(fragment => fragment.replace(/(?:S\/\.?|PEN\b|USD\b|US\$|\$|€)\s*[-+]?\d[\d.,]*/gi, '').replace(/\b\d[\d.,]*\s*(?:soles?|d[oó]lares?)\b/gi, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ')
}
export function publicOperationalDetails(event: CrmEvent, plan: ProductionPlan): { services: string[]; extras: string[]; directions: { label: string; value: string }[] } {
  const services = contractServices(effectiveChecklistEvent(event)).filter(service => service.contracted === true && !['additional'].includes(service.key)).map(service => {
    const dimensions = service.key === 'led' ? service.evidence.match(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*m(?:etros)?)?\b/i)?.[0] : undefined
    return `${service.label}${service.durationMinutes ? ` · ${service.durationMinutes} min` : ''}${dimensions ? ` · ${dimensions}` : ''}`
  })
  const games = operationalText(event.juegos_elegidos)
  if (games) services.push(`Juegos elegidos: ${games}`)
  const extras = checklistExtras(event).map(extra => operationalText(extra.label)).filter(Boolean)
  const source: [string, string | undefined][] = [['Referencia', event.referencia], ['Piso', plan.logistics.floor], ['Ascensor', plan.logistics.elevator], ['Escaleras', plan.logistics.stairs], ['Acceso vehicular', plan.logistics.vehicleAccess], ['Estacionamiento', plan.logistics.parking], ['Descarga', plan.logistics.unloading], ['Restricciones de ingreso', plan.logistics.entryRestrictions], ['Contacto de recepción', plan.logistics.receptionContact], ['Electricidad', plan.logistics.electricity], ['Espacio disponible', plan.logistics.space], ['Luz natural', plan.logistics.naturalLight], ['Vehículo', plan.logistics.vehicle], ['Destino posterior', plan.logistics.destination]]
  const directions = source.map(([label, value]) => ({ label, value: operationalText(value || '') })).filter(detail => detail.value)
  return { services, extras, directions }
}
/** Sharing only tracks operational content; internal notes, fees, costs and financial totals are excluded. */
export function eventAgendaFingerprint(event: CrmEvent, plan: ProductionPlan, people: CrmCollaborator[] = []): string {
  const agenda = buildEventAgenda(event, plan).map(activity => ({ name: activity.name, start: activity.start, end: activity.end, responsibleIds: [...activity.responsibleIds].sort(), source: activity.source, confirmed: activity.confirmed, pending: activity.pending }))
  const staff = plan.staff.filter(member => member.confirmation !== 'declined').map(member => ({ id: member.collaboratorId, role: member.role, arrival: member.arrival, start: member.start, end: member.end, confirmation: member.confirmation })).sort((a, b) => a.id.localeCompare(b.id) || a.role.localeCompare(b.role))
  const content = { event: { id: event.id, cliente: event.cliente, agasajado: event.agasajado, date: event.fecha_evento, start: event.hora_inicio, end: event.hora_fin, address: event.direccion, district: event.lugar, phone: event.telefono, paquete: event.paquete }, details: publicOperationalDetails(event, plan), agenda, staff }
  const participantIds = new Set([...staff.map(member => member.id), ...agenda.flatMap(activity => activity.responsibleIds)])
  const contacts = people.filter(person => participantIds.has(person.id)).map(person => ({ id: person.id, name: person.nombre, phone: person.telefono })).sort((a, b) => a.id.localeCompare(b.id))
  return `agenda-v1:${hash(JSON.stringify(content))}:${hash(JSON.stringify(contacts))}`
}
export const agendaFingerprint = eventAgendaFingerprint
export function isShareOutdated(event: CrmEvent, plan: ProductionPlan, people?: CrmCollaborator[]): boolean
export function isShareOutdated(plan: ProductionPlan, event: CrmEvent, people?: CrmCollaborator[]): boolean
export function isShareOutdated(first: CrmEvent | ProductionPlan, second: CrmEvent | ProductionPlan, people: CrmCollaborator[] = []): boolean {
  const event = ('fecha_evento' in first ? first : second) as CrmEvent
  const plan = ('eventId' in first ? first : second) as ProductionPlan
  const latest = [...(plan.agendaShares || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  if (!latest) return false
  const current = eventAgendaFingerprint(event, plan, people)
  return people.length ? current !== latest.fingerprint : current.split(':').slice(0, 2).join(':') !== latest.fingerprint.split(':').slice(0, 2).join(':')
}
