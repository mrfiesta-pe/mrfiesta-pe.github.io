import type { CrmEvent } from '../types/domain'
import type { ActivityTemplate, ChecklistItem, ProductionPlan } from './model'
import { contractServices, eventBounds, toEpoch } from './rules'
import { effectiveChecklistEvent, simpleChecklist } from './simpleWorkflow'

const kinds = new Set(['setup', 'test', 'show', 'travel', 'teardown', 'other'])
const localMinute = (value: number) => new Date(value - 5 * 3600000).toISOString().slice(0, 16)

export function templateProblems(template: ActivityTemplate): string[] {
  const issues: string[] = []
  if (!template.id?.trim() || !template.name?.trim()) issues.push('Completa el nombre de la plantilla.')
  if (!kinds.has(template.kind)) issues.push('Selecciona un tipo de actividad válido.')
  if (template.offsetMinutes !== undefined && (!Number.isInteger(template.offsetMinutes) || Math.abs(template.offsetMinutes) > 10080)) issues.push('La diferencia respecto del inicio debe ser un número entero entre −10080 y 10080 minutos.')
  if (template.durationMinutes !== undefined && (!Number.isInteger(template.durationMinutes) || template.durationMinutes <= 0 || template.durationMinutes > 10080)) issues.push('La duración debe ser un número entero de minutos mayor que cero y menor o igual a 10080.')
  return issues
}

/** Import only plain template data; executable content and unknown object shapes are never evaluated. */
export function parseActivityTemplates(json: string): ActivityTemplate[] {
  const input: unknown = JSON.parse(json)
  if (!Array.isArray(input) || input.length > 500) throw new Error('La configuración debe ser una lista de hasta 500 plantillas.')
  const ids = new Set<string>()
  return input.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Plantilla ${index + 1}: formato inválido.`)
    const item = row as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.kind !== 'string' || (item.serviceKey !== undefined && typeof item.serviceKey !== 'string')) throw new Error(`Plantilla ${index + 1}: faltan nombre, identificador o tipo.`)
    const template: ActivityTemplate = { id: item.id, name: item.name, kind: item.kind as ActivityTemplate['kind'], ...(item.offsetMinutes !== undefined ? { offsetMinutes: item.offsetMinutes as number } : {}), ...(item.durationMinutes !== undefined ? { durationMinutes: item.durationMinutes as number } : {}), ...(item.serviceKey ? { serviceKey: item.serviceKey as string } : {}) }
    const problems = templateProblems(template)
    if (problems.length) throw new Error(`Plantilla ${index + 1}: ${problems.join(' ')}`)
    if (ids.has(template.id)) throw new Error('No se admiten identificadores de plantilla duplicados.')
    ids.add(template.id)
    return template
  })
}

/** Applying a template appends a pending suggestion; existing activities and confirmed assignments always win. */
export function applyActivityTemplates(event: CrmEvent, original: ProductionPlan, templates: ActivityTemplate[]): { plan: ProductionPlan; added: number; preserved: number; warnings: string[] } {
  const plan = structuredClone(original)
  const warnings: string[] = []
  const services = new Set(contractServices(effectiveChecklistEvent(event)).filter(service => service.contracted === true).map(service => service.key))
  const start = toEpoch(eventBounds(event).start)
  let added = 0
  let preserved = 0
  for (const template of templates) {
    const problems = templateProblems(template)
    if (problems.length) { warnings.push(`${template.name || 'Plantilla sin nombre'}: ${problems.join(' ')}`); continue }
    if (template.serviceKey && !services.has(template.serviceKey)) {
      warnings.push(`${template.name}: no se añadió porque ese servicio no consta como contratado.`)
      continue
    }
    const id = `template-${template.id}`
    if (plan.activities.some(activity => activity.id === id || activity.name.trim().toLowerCase() === template.name.trim().toLowerCase())) { preserved++; continue }
    const begin = Number.isFinite(start) && template.offsetMinutes !== undefined ? start + template.offsetMinutes * 60000 : Number.NaN
    const end = Number.isFinite(begin) && template.durationMinutes !== undefined ? begin + template.durationMinutes * 60000 : Number.NaN
    plan.activities.push({ id, name: template.name.trim(), kind: template.kind, start: Number.isFinite(begin) ? localMinute(begin) : '', end: Number.isFinite(end) ? localMinute(end) : '', serviceKey: template.serviceKey || undefined, responsibleIds: [], notes: 'Actividad propuesta desde una plantilla interna. Revisa sus horarios y asigna responsables.', status: 'pending', confirmed: false })
    added++
  }
  return { plan, added, preserved, warnings }
}

/** Return checks are separate from the departure list and never reuse its completion. */
export function returnChecklist(event: CrmEvent, plan: ProductionPlan): ChecklistItem[] {
  return simpleChecklist(event, plan).map(task => {
    const id = `return-${task.id}`
    const previous = plan.checklist.find(item => item.id === id)
    return { id, label: `Retorno · ${task.label}`, stage: 'after', serviceKey: task.serviceKey, done: previous?.done ?? false, ...(previous?.completedBy ? { completedBy: previous.completedBy } : {}), ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}) }
  })
}

export function mergeReturnChecklist(event: CrmEvent, plan: ProductionPlan): ProductionPlan {
  const tasks = returnChecklist(event, plan)
  const ids = new Set(tasks.map(task => task.id))
  return { ...plan, checklist: [...plan.checklist.filter(task => !ids.has(task.id)), ...tasks] }
}
