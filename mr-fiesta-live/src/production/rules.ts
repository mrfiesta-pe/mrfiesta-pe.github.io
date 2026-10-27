import type { CrmEvent } from '../types/domain'
import type { Activity, Alert, ChecklistItem, ContractService, EquipmentAsset, ProductionContext, ProductionPlan } from './model'

const norm = (text: string) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const money = (value: unknown) => Math.round((Number(value) || 0) * 100)
const nonnegative = (value: unknown) => Math.max(0, Number(value) || 0)
const catalog: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'dj', label: 'DJ', pattern: /\bdj\b/ },
  { key: 'animation', label: 'Animación / animador(a)', pattern: /\banimador(?:a|es)?\b|\banimacion\b/ },
  { key: 'glitter', label: 'Estación Glitter', pattern: /\bglitter\b|tatuajes? neon/ },
  { key: 'led', label: 'Pista LED', pattern: /\bpista(?: de baile)?(?: led)?\b/ },
  { key: 'lights', label: 'Luces', pattern: /\bluces\b|\biluminacion\b|\blaser\b/ },
  { key: 'projection', label: 'Proyector y pantalla', pattern: /\bproyector\b|\becran\b|\bpantalla\b|\bproyeccion\b/ },
  { key: 'smoke', label: 'Humo', pattern: /\bhumo\b/ },
  { key: 'bubbles', label: 'Burbujas', pattern: /\bburbujas\b/ },
  { key: 'decoration', label: 'Decoración', pattern: /\bdecoracion\b|\bbacking\b|\bpanel(?:es)?\b/ },
  { key: 'hora-loca', label: 'Hora Loca', pattern: /\bhora loca\b/ },
  { key: 'accessories', label: 'Accesorios', pattern: /\baccesorios\b|\bglobos\b|\bpulseras\b/ },
  { key: 'games', label: 'Juegos y dinámicas', pattern: /\bjuegos\b|\bdinamicas\b|\bjust dance\b|\bkaraoke\b|\blimbo\b|salta soga/ },
  { key: 'sound', label: 'Sonido y micrófonos', pattern: /\bsonido\b|\bparlantes?\b|\bmicrofonos?\b/ },
  { key: 'assistant', label: 'Staff / asistente', pattern: /\bstaff\b|\basistente\b/ },
  { key: 'makeup', label: 'Maquilladora', pattern: /\bmaquillador(?:a)?\b/ },
  { key: 'transport', label: 'Movilidad', pattern: /\bmovilidad\b|\btransporte\b/ },
]

/** Parses only text stored on this event. Package catalog defaults are deliberately never consulted. */
export function contractServices(event: CrmEvent): ContractService[] {
  const additional = [event.adicionales_requerimientos, event.adicionales].filter((value) => value?.trim()).join('\n')
  const detail = [event.detalle_servicio, additional].filter(Boolean).join('\n')
  const clauses = detail.split(/\n|[.;](?=\s|$)/).map((item) => item.trim()).filter(Boolean)
  const result: ContractService[] = catalog.map(({ key, label, pattern }) => {
    const matches = clauses.filter((item) => pattern.test(norm(item)))
    const affirmations = matches.filter((item) => !isNegative(norm(item), pattern))
    const negatives = matches.filter((item) => isNegative(norm(item), pattern))
    const contracted = affirmations.length && !negatives.length ? true : negatives.length && !affirmations.length ? false : null
    const service: ContractService = { key, label, contracted, evidence: matches.join('; ') || 'No especificado en los campos contractuales disponibles.' }
    const duration = matches.map((item) => serviceDuration(norm(item), pattern)).find((value) => value !== undefined)
    if (duration !== undefined && contracted === true) service.durationMinutes = duration
    return service
  })
  // The contractual free text remains visible even when a service is outside the known vocabulary.
  if (event.juegos_elegidos?.trim()) {
    const games = result.find((item) => item.key === 'games')!
    games.contracted = games.contracted === false ? null : true
    games.evidence = [games.evidence.startsWith('No especificado') ? '' : games.evidence, event.juegos_elegidos].filter(Boolean).join('; ')
  }
  if (additional) result.push({ key: 'additional', label: 'Adicionales y requerimientos registrados', contracted: true, evidence: additional })
  const alternativeEffect = clauses.find((clause) => /humo\s+o\s+(?:maquina\s+de\s+)?burbujas|burbujas\s+o\s+(?:maquina\s+de\s+)?humo/.test(norm(clause)) && !isNegative(norm(clause), /humo|burbujas/))
  if (alternativeEffect) {
    for (const service of result.filter((item) => ['smoke', 'bubbles'].includes(item.key))) {
      service.contracted = null
      service.evidence = `${alternativeEffect} (alternativa: confirmar cuál se llevará)`
    }
    result.push({ key: 'effects', label: 'Humo o burbujas (elegir alternativa)', contracted: true, evidence: alternativeEffect })
  }
  const durationMatch = norm(event.detalle_servicio).match(/(?:^|[.;]\s*)(\d+(?:[.,]\d+)?)\s*(horas?|minutos?)\s*(?:de\s+)?(?:evento|experiencia|fiesta|servicio)/)
  if (durationMatch) result.push({ key: 'duration', label: 'Duración contractual', contracted: true, evidence: durationMatch[0].trim(), durationMinutes: Number(durationMatch[1].replace(',', '.')) * (durationMatch[2].startsWith('hora') ? 60 : 1) })
  return result
}

function isNegative(clause: string, pattern: RegExp) {
  const match = pattern.exec(clause)
  if (!match) return false
  const before = clause.slice(0, match.index)
  const after = clause.slice(match.index + match[0].length)
  // A contrast starts a new positive statement: "sin decoración pero incluye DJ".
  const scope = before.split(/\bpero\b|\bsin embargo\b/).at(-1) || ''
  const markers = [...scope.matchAll(/\b(no incluye|no incluido|no contratado|sin|excluye|excluido|excepto|incluye|incluido|incluidos|con)\b/g)]
  return /^(?:no |sin$|excluye$|excluido$|excepto$)/.test(markers.at(-1)?.[1] || '') || /^\s*(?:no incluid[oa]|excluid[oa]|no contratad[oa])\b/.test(after)
}

function serviceDuration(clause: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(clause)
  if (!match) return undefined
  const before = clause.slice(0, match.index)
  const after = clause.slice(match.index + match[0].length)
  const preceding = before.match(/(\d+(?:[.,]\d+)?)\s*(horas?|minutos?)(?:\s+de)?\s*(?:estacion\s+)?$/)
  const following = after.match(/^\s*(?:durante|por|de|:)\s*(\d+(?:[.,]\d+)?)\s*(horas?|minutos?)/)
  const duration = preceding || following
  return duration ? Number(duration[1].replace(',', '.')) * (duration[2].startsWith('hora') ? 60 : 1) : undefined
}

/** A local date has a fixed -05:00 offset because all operational schedules belong to Lima. */
export function toEpoch(value: string): number {
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?$/.test(value)) return Number.NaN
  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  const dateCheck = new Date(Date.UTC(year, month - 1, day))
  if (dateCheck.getUTCFullYear() !== year || dateCheck.getUTCMonth() !== month - 1 || dateCheck.getUTCDate() !== day || hours > 23 || minutes > 59) return Number.NaN
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}-05:00`)
}

export function dayLocal(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function durationMinutes(start: string, end: string): number {
  const result = (toEpoch(end) - toEpoch(start)) / 60_000
  return Number.isFinite(result) ? result : 0
}

export function eventBounds(event: CrmEvent): { start: string; end: string } {
  const start = event.hora_inicio ? `${event.fecha_evento}T${event.hora_inicio.slice(0, 5)}` : ''
  let end = event.hora_fin ? `${event.fecha_evento}T${event.hora_fin.slice(0, 5)}` : ''
  if (start && end && toEpoch(end) < toEpoch(start)) {
    const next = new Date(toEpoch(end) + 86_400_000)
    end = `${dayLocal(next)}T${event.hora_fin.slice(0, 5)}`
  }
  return { start, end }
}

function initialChecklist(event: CrmEvent): ChecklistItem[] {
  const base: { id: string; label: string; stage: ChecklistItem['stage'] }[] = [
    { id: 'contract', label: 'Contrato revisado', stage: 'before' },
    { id: 'services', label: 'Servicios ofrecidos verificados', stage: 'before' },
    { id: 'address', label: 'Dirección confirmada', stage: 'before' },
    { id: 'times', label: 'Horarios confirmados', stage: 'before' },
    { id: 'staff', label: 'Personal asignado y confirmado', stage: 'before' },
    { id: 'equipment', label: 'Equipos asignados y disponibles', stage: 'before' },
    { id: 'materials', label: 'Materiales preparados', stage: 'before' },
    { id: 'transport', label: 'Transporte coordinado', stage: 'before' },
    { id: 'schedule', label: 'Cronograma validado', stage: 'before' },
    { id: 'client', label: 'Cliente informado', stage: 'before' },
    { id: 'unload', label: 'Equipos descargados', stage: 'setup' },
    { id: 'team', label: 'Personal completo', stage: 'show' },
    { id: 'activities', label: 'Actividades completadas', stage: 'show' },
    { id: 'incidents', label: 'Incidencias registradas o ausencia verificada', stage: 'show' },
    { id: 'finish', label: 'Servicio finalizado', stage: 'after' },
    { id: 'teardown', label: 'Equipos desmontados', stage: 'after' },
    { id: 'inventory', label: 'Inventario verificado y material cargado', stage: 'after' },
    { id: 'balance', label: 'Pago pendiente revisado', stage: 'after' },
    { id: 'close', label: 'Evento cerrado', stage: 'after' },
  ]
  const conditional = contractServices(event).filter((service) => service.contracted === true && !['duration', 'additional'].includes(service.key)).map((service) => ({ id: `service-${service.key}`, label: `${service.label}: preparado y probado`, stage: 'setup' as const, serviceKey: service.key, done: false }))
  return [...base.map((item) => ({ ...item, done: false })), ...conditional]
}

export function newPlan(event: CrmEvent): ProductionPlan {
  return {
    version: 1, eventId: event.id, status: 'unorganized', activities: [], staff: [], equipment: [],
    checklist: initialChecklist(event), commitments: contractServices(event).filter((service) => service.contracted === true).map((service) => ({ key: service.key, planned: false, prepared: false, clientConfirmed: false, executed: false, notes: '' })),
    agreements: [], costs: [], payments: [], notes: '', reviewedContract: false, exceptions: [],
    logistics: { departure: '', installation: '', arrival: '', test: '', serviceStart: '', teardown: '', pickup: '', vehicle: '', installerIds: [], teardownIds: [], setupMinutes: 60, transferMinutes: 45, destination: '', floor: '', elevator: '', stairs: '', vehicleAccess: '', parking: '', unloading: '', entryRestrictions: '', receptionContact: '', electricity: '', space: '', naturalLight: '', notes: '' },
  }
}

function validInterval(start: string, end: string) { return Number.isFinite(toEpoch(start)) && Number.isFinite(toEpoch(end)) && toEpoch(end) > toEpoch(start) }
function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) { return validInterval(aStart, aEnd) && validInterval(bStart, bEnd) && toEpoch(aStart) < toEpoch(bEnd) && toEpoch(bStart) < toEpoch(aEnd) }
function gapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  if (!validInterval(aStart, aEnd) || !validInterval(bStart, bEnd)) return Infinity
  if (overlap(aStart, aEnd, bStart, bEnd)) return -1
  return Math.max(toEpoch(aStart) - toEpoch(bEnd), toEpoch(bStart) - toEpoch(aEnd)) / 60_000
}
function title(event: CrmEvent) { return event.agasajado || event.cliente }
function roleHas(role: string, key: string) {
  const normalized = norm(role)
  const patterns: Record<string, RegExp> = { dj: /\bdj\b/, animation: /animador|animadora|animacion/, glitter: /glitter|maquill/, makeup: /maquill|glitter/, assistant: /asistente|staff|produccion/ }
  return patterns[key]?.test(normalized) || false
}

export function analyze(event: CrmEvent, plan: ProductionPlan, allContexts: ProductionContext[] = [], assets: EquipmentAsset[] = []): Alert[] {
  const alerts: Alert[] = []
  const add = (key: string, severity: Alert['severity'], message: string, fix: string, canJustify = false) => alerts.push({ key, severity, message, fix, canJustify })
  const bounds = eventBounds(event)
  const activities = plan.activities.filter((activity) => activity.status !== 'cancelled')
  const staff = plan.staff.filter((item) => item.confirmation !== 'declined')
  const contracted = contractServices(event).filter((service) => service.contracted === true)
  if (!event.direccion?.trim() || !event.lugar?.trim() || !validInterval(bounds.start, bounds.end)) add('event-data', 'critical', 'Faltan dirección, distrito u horarios válidos del evento.', 'Confirma los datos comerciales del evento desde el CRM.')
  if (!plan.reviewedContract) add('contract-review', 'critical', 'Los compromisos contractuales no han sido revisados.', 'Revisa el contrato o los campos disponibles y registra su revisión.')
  const requiredChecklist = initialChecklist(event).filter((item) => item.stage === 'before')
  for (const item of requiredChecklist) if (!plan.checklist.some((task) => task.id === item.id && task.done && task.completedBy?.trim() && task.completedAt && Number.isFinite(toEpoch(task.completedAt)))) add(`checklist-${item.id}`, 'critical', `Checklist previo pendiente: ${item.label}.`, 'Completa y registra quién verificó esta tarea y cuándo.')
  if (!activities.length) add('schedule-required', 'critical', 'El evento no tiene cronograma.', 'Añade actividades, horarios y responsables antes de marcarlo listo.')
  if (!activities.some((activity) => activity.kind === 'show' && validInterval(activity.start, activity.end))) add('show-required', 'critical', 'Falta una actividad del servicio o show con horario válido.', 'Añade el bloque artístico principal al cronograma.')
  for (const activity of activities) {
    if (!activity.name.trim() || !validInterval(activity.start, activity.end)) add(`activity-invalid-${activity.id}`, 'critical', `La actividad «${activity.name || 'Sin nombre'}» tiene datos u horarios incompletos.`, 'Completa nombre, inicio y final; el final debe ser posterior al inicio.')
    if (!activity.responsibleIds.length) add(`activity-owner-${activity.id}`, 'critical', `«${activity.name || 'Actividad'}» no tiene responsable.`, 'Asigna al menos un colaborador responsable.')
    if (activity.responsibleIds.some((id) => !staff.some((member) => member.collaboratorId === id))) add(`activity-unknown-owner-${activity.id}`, 'critical', `«${activity.name}» tiene responsables sin asignación activa en el evento.`, 'Asigna al colaborador en Personal o cambia al responsable de la actividad.')
    for (const id of activity.responsibleIds) {
      const assignments = staff.filter((member) => member.collaboratorId === id)
      if (validInterval(activity.start, activity.end) && assignments.length && !assignments.some((member) => validInterval(member.arrival || member.start, member.end) && toEpoch(member.arrival || member.start) <= toEpoch(activity.start) && toEpoch(member.end) >= toEpoch(activity.end))) add(`activity-availability-${activity.id}-${id}`, 'critical', `El responsable de «${activity.name}» no cubre todo su horario.`, 'Amplía su asignación o cambia de responsable.', true)
    }
    if (activity.kind === 'show' && validInterval(activity.start, activity.end) && validInterval(bounds.start, bounds.end) && (toEpoch(activity.start) < toEpoch(bounds.start) || toEpoch(activity.end) > toEpoch(bounds.end)) && !activity.exception?.trim()) add(`activity-bounds-${activity.id}`, 'warning', `«${activity.name}» está fuera del horario contractual.`, 'Ajusta el horario o registra una excepción justificada, por ejemplo Glitter previo.', true)
  }
  for (let i = 0; i < activities.length; i++) for (let j = i + 1; j < activities.length; j++) {
    const first = activities[i], second = activities[j]
    if (overlap(first.start, first.end, second.start, second.end)) {
      const shared = first.responsibleIds.some((id) => second.responsibleIds.includes(id))
      add(`activity-overlap-${[first.id, second.id].sort().join('-')}`, shared ? 'critical' : 'warning', `Se superponen «${first.name}» y «${second.name}»${shared ? ' con el mismo responsable' : ''}.`, shared ? 'Separa los horarios o asigna responsables compatibles.' : 'Verifica que puedan realizarse en paralelo y documenta la excepción.', true)
    }
  }
  for (const service of contracted) {
    const commitment = plan.commitments.find((item) => item.key === service.key)
    if (!commitment?.prepared) add(`service-${service.key}`, 'critical', `El servicio contratado «${service.label}» no está preparado.`, 'Planifica los recursos y marca el compromiso como preparado tras revisarlo.')
    if (['dj', 'animation', 'glitter', 'assistant', 'makeup'].includes(service.key) && !staff.some((member) => roleHas(member.role, service.key))) add(`role-${service.key}`, 'critical', `No hay personal asignado para «${service.label}».`, 'Asigna un colaborador del registro existente con la función correspondiente.')
    if (service.durationMinutes && service.key !== 'duration') {
      const duration = activities.filter((activity) => activity.serviceKey === service.key).reduce((sum, activity) => sum + Math.max(0, durationMinutes(activity.start, activity.end)), 0)
      if (duration < service.durationMinutes) add(`duration-${service.key}`, 'critical', `«${service.label}» tiene ${duration} min programados y ${service.durationMinutes} min contratados.`, 'Completa las actividades de ese servicio o registra el acuerdo específico con el cliente.', true)
    }
  }
  const durationContract = contracted.find((service) => service.key === 'duration')
  if (durationContract?.durationMinutes && validInterval(bounds.start, bounds.end) && durationMinutes(bounds.start, bounds.end) < durationContract.durationMinutes) add('duration-event', 'warning', 'La duración del evento es menor que la duración expresada en el contrato.', 'Revisa horarios y duración con el cliente.', true)
  if (staff.length === 0) add('staff-required', 'critical', 'No se ha asignado personal al evento.', 'Asigna los colaboradores responsables de la operación.')
  for (const member of staff) {
    if (!member.collaboratorId || !member.role.trim() || !validInterval(member.start, member.end) || !Number.isFinite(toEpoch(member.arrival)) || toEpoch(member.arrival) > toEpoch(member.start)) add(`staff-invalid-${member.id}`, 'critical', 'Una asignación de personal tiene función, llegada u horarios incompletos.', 'Completa colaborador, función y fechas; la llegada no puede ser posterior al inicio.')
    if (member.confirmation !== 'confirmed') add(`staff-confirmation-${member.id}`, 'critical', 'Hay personal pendiente de confirmación.', 'Confirma su participación antes de marcar el evento listo.')
    if (member.fee < 0 || !Number.isFinite(member.fee) || member.transferMinutes < 0 || !Number.isFinite(member.transferMinutes)) add(`staff-values-${member.id}`, 'critical', 'Honorarios o traslado del personal no son válidos.', 'Utiliza importes y minutos positivos o cero.')
  }
  if (!Number.isFinite(toEpoch(plan.logistics.installation))) add('installation-required', 'critical', 'La instalación no está programada.', 'Indica fecha y hora completas de instalación.')
  if (!plan.logistics.installerIds.length || plan.logistics.installerIds.some((id) => !staff.some((member) => member.collaboratorId === id))) add('installer-required', 'critical', 'Falta un responsable de instalación asignado.', 'Selecciona responsables presentes en la lista de personal.')
  const setup = activities.filter((activity) => activity.kind === 'setup' && validInterval(activity.start, activity.end))
  const tests = activities.filter((activity) => activity.kind === 'test' && validInterval(activity.start, activity.end))
  if (!setup.length) add('setup-required', 'critical', 'Falta el montaje en el cronograma.', 'Añade una actividad de instalación con responsable y horario.')
  if (!tests.length) add('tests-required', 'critical', 'Faltan pruebas técnicas en el cronograma.', 'Programa pruebas antes del inicio del servicio.')
  if (Number.isFinite(toEpoch(plan.logistics.installation)) && setup.length && !setup.some((activity) => toEpoch(activity.start) <= toEpoch(plan.logistics.installation) && toEpoch(activity.end) > toEpoch(plan.logistics.installation))) add('installation-schedule', 'warning', 'La hora logística de instalación no coincide con un montaje del cronograma.', 'Alinea ambos horarios o documenta la razón de la diferencia.', true)
  const firstShow = activities.filter((activity) => activity.kind === 'show' && validInterval(activity.start, activity.end)).sort((a, b) => toEpoch(a.start) - toEpoch(b.start))[0]
  if (setup.length && setup.reduce((sum, activity) => sum + durationMinutes(activity.start, activity.end), 0) < nonnegative(plan.logistics.setupMinutes)) add('setup-time', 'warning', 'El tiempo de montaje programado es menor al estimado.', 'Amplía el montaje o justifica la estimación.', true)
  if (firstShow && setup.some((activity) => toEpoch(activity.end) > toEpoch(firstShow.start))) add('setup-after-show', 'critical', 'El montaje termina después del inicio del servicio.', 'Completa la instalación antes de la primera actividad artística.', true)
  if (firstShow && tests.some((activity) => toEpoch(activity.end) > toEpoch(firstShow.start))) add('tests-after-show', 'critical', 'Las pruebas técnicas terminan después del inicio del servicio.', 'Programa las pruebas antes del show.', true)
  if (setup.length && tests.length && Math.min(...tests.map((activity) => toEpoch(activity.start))) < Math.min(...setup.map((activity) => toEpoch(activity.end)))) add('tests-before-setup', 'warning', 'Las pruebas empiezan antes de terminar el montaje.', 'Verifica el orden técnico y justifica si se prueba por etapas.', true)
  for (const assignment of plan.equipment) {
    const asset = assets.find((item) => item.id === assignment.assetId)
    if (!asset) add(`asset-missing-${assignment.id}`, 'critical', 'Un equipo asignado ya no existe en el registro.', 'Selecciona un equipo válido.')
    if (asset?.status === 'maintenance' || assignment.status === 'maintenance') add(`asset-maintenance-${assignment.id}`, 'critical', `«${asset?.name || 'Equipo'}» está en mantenimiento.`, 'Sustituye el equipo por uno disponible.')
    if (!validInterval(assignment.start, assignment.end)) add(`asset-interval-${assignment.id}`, 'critical', `«${asset?.name || 'Equipo'}» tiene reserva sin fechas válidas.`, 'Incluye desde la instalación hasta el recojo, con fechas completas.')
    const installationStarts = [plan.logistics.installation, ...setup.map((activity) => activity.start)].map(toEpoch).filter(Number.isFinite)
    const operationEnds = [bounds.end, plan.logistics.teardown, plan.logistics.pickup, ...activities.filter((activity) => activity.kind === 'teardown').map((activity) => activity.end)].map(toEpoch).filter(Number.isFinite)
    if (validInterval(assignment.start, assignment.end) && ((installationStarts.length > 0 && toEpoch(assignment.start) > Math.min(...installationStarts)) || (operationEnds.length > 0 && toEpoch(assignment.end) < Math.max(...operationEnds)))) add(`asset-coverage-${assignment.id}`, 'critical', `La reserva de «${asset?.identifier || asset?.name || 'Equipo'}» no cubre toda la instalación, servicio y recojo programados.`, 'Amplía la reserva desde el primer montaje hasta el fin del recojo o desmontaje.')
    if (!Number.isFinite(assignment.transferMinutes) || assignment.transferMinutes < 0) add(`asset-transfer-${assignment.id}`, 'critical', 'Un equipo tiene tiempo de traslado inválido.', 'Introduce minutos positivos o cero.')
  }
  for (let i = 0; i < plan.equipment.length; i++) for (let j = i + 1; j < plan.equipment.length; j++) {
    const first = plan.equipment[i], second = plan.equipment[j]
    if (first.assetId && first.assetId === second.assetId && overlap(first.start, first.end, second.start, second.end)) add(`asset-duplicate:${first.assetId}`, 'critical', 'Un mismo equipo tiene reservas duplicadas que se superponen dentro del evento.', 'Conserva una sola reserva que cubra toda la operación del equipo.')
  }
  for (const service of contracted.filter((item) => ['led', 'projection', 'sound', 'lights', 'smoke', 'bubbles', 'decoration', 'effects'].includes(item.key))) {
    const pattern = service.key === 'effects' ? /humo|burbujas/ : catalog.find((item) => item.key === service.key)!.pattern
    if (!plan.equipment.some((assignment) => assets.some((asset) => asset.id === assignment.assetId && pattern.test(norm(`${asset.name} ${asset.category} ${asset.identifier}`))))) add(`equipment-service-${service.key}`, 'critical', `Faltan equipos identificados para «${service.label}».`, 'Asigna los equipos que cubren este servicio con su identificador individual.')
  }
  const contexts = allContexts.filter((context) => context.event.id !== event.id)
  for (const other of contexts) {
    for (const member of staff) for (const external of other.plan.staff.filter((item) => item.confirmation !== 'declined' && item.collaboratorId === member.collaboratorId)) {
      const gap = gapMinutes(member.arrival || member.start, member.end, external.arrival || external.start, external.end)
      const transfer = Math.max(nonnegative(member.transferMinutes), nonnegative(external.transferMinutes), nonnegative(plan.logistics.transferMinutes), nonnegative(other.plan.logistics.transferMinutes))
      const key = `resource:staff:${member.collaboratorId}:${other.event.id}`
      if (gap < 0) add(key, 'critical', `Un colaborador está asignado simultáneamente a este evento y «${title(other.event)}».`, 'Reasigna al colaborador o corrige sus fechas de ocupación.')
      else if (gap < transfer) add(key, 'critical', `Un colaborador dispone de ${gap} min de traslado hacia/desde «${title(other.event)}», por debajo de ${transfer} min previstos.`, 'Amplía el intervalo, ajusta el traslado estimado o reasigna.', true)
    }
    for (const assignment of plan.equipment) for (const external of other.plan.equipment.filter((item) => item.assetId === assignment.assetId)) {
      const gap = gapMinutes(assignment.start, assignment.end, external.start, external.end)
      const asset = assets.find((item) => item.id === assignment.assetId)
      const transfer = Math.max(nonnegative(assignment.transferMinutes), nonnegative(external.transferMinutes))
      const key = `resource:equipment:${assignment.assetId}:${other.event.id}`
      if (gap < 0) add(key, 'critical', `«${asset?.identifier || asset?.name || 'Equipo'}» está reservado también para «${title(other.event)}» en el mismo intervalo.`, 'Sustituye el equipo o corrige el intervalo instalación–recojo.')
      else if (gap < transfer) add(key, 'critical', `«${asset?.identifier || asset?.name || 'Equipo'}» no dispone de los ${transfer} min de traslado previstos hacia/desde «${title(other.event)}».`, 'Programa traslado suficiente antes del siguiente montaje.', true)
    }
  }
  if (plan.payments.some((item) => !Number.isFinite(item.amount) || item.amount <= 0 || !item.date)) add('payments-invalid', 'critical', 'Hay pagos adicionales sin fecha o importe válido.', 'Completa fecha e importe positivo; no dupliques el adelanto del CRM.')
  if (plan.costs.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) add('costs-invalid', 'critical', 'Hay costos operativos inválidos.', 'Utiliza importes positivos o cero.')
  const unique = new Map<string, Alert>()
  for (const alert of alerts) {
    const previous = unique.get(alert.key)
    // Several assignments may share a resource key: never let an earlier travel warning hide a physical overlap.
    if (!previous || (previous.severity === 'warning' && alert.severity === 'critical') || (previous.canJustify && !alert.canJustify)) unique.set(alert.key, alert)
  }
  return [...unique.values()]
}

/** Unjustifiable physical conflicts cannot be hidden by a generic exception note. */
export function readiness(event: CrmEvent, plan: ProductionPlan, contexts: ProductionContext[] = [], assets: EquipmentAsset[] = []): { ready: boolean; alerts: Alert[]; unresolved: Alert[]; blocking: Alert[] } {
  const alerts = analyze(event, plan, contexts, assets)
  const unresolved = alerts.filter((alert) => alert.severity === 'critical' && !(alert.canJustify && plan.exceptions.some((item) => item.key === alert.key && item.reason.trim().length >= 8)))
  return { ready: unresolved.length === 0, alerts, unresolved, blocking: unresolved }
}

export function progress(plan: ProductionPlan): number {
  const before = plan.checklist.filter((item) => item.stage === 'before' || item.stage === 'setup')
  const tasks = [...before.map((item) => item.done), ...plan.commitments.map((item) => item.prepared), ...plan.staff.map((item) => item.confirmation === 'confirmed'), plan.reviewedContract, plan.activities.some((item) => item.status !== 'cancelled')]
  return tasks.length ? Math.round(tasks.filter(Boolean).length / tasks.length * 100) : 0
}

export function balance(event: CrmEvent, plan: ProductionPlan): number {
  return Math.max(0, money(event.total) - money(event.adelanto) - plan.payments.reduce((sum, item) => sum + Math.max(0, money(item.amount)), 0)) / 100
}

export function operationalUtility(event: CrmEvent, plan: ProductionPlan): number {
  return (money(event.total) - money(costTotal(plan))) / 100
}

export function costTotal(plan: ProductionPlan): number {
  const expenses = plan.costs.reduce((sum, item) => sum + Math.max(0, money(item.amount)), 0) + plan.staff.reduce((sum, item) => sum + Math.max(0, money(item.fee)), 0)
  return expenses / 100
}

export function activityLabel(activity: Activity) { return `${activity.name} (${activity.start.replace('T', ' ')} – ${activity.end.replace('T', ' ')})` }
