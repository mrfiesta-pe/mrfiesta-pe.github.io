import { jsPDF } from 'jspdf'
import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { EquipmentAsset, ProductionContext, ProductionPlan } from './model'
import { productionStatuses } from './model'
import { balance, costTotal, operationalUtility } from './rules'
import { simpleChecklist } from './simpleWorkflow'
import { buildEventAgenda } from './agenda'

const money = (value: number) => `S/ ${Number(value || 0).toFixed(2)}`
export function productionDate(value: string): string {
  if (!value) return 'Por confirmar'
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00-05:00` : /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}-05:00`)
  if (!Number.isFinite(parsed.getTime())) return 'Fecha por revisar'
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hourCycle: 'h23', dateStyle: 'short', ...(value.length > 10 ? { timeStyle: 'short' as const } : {}) }).format(parsed)
}

/** Explicitly contains operational information only; private notes, fees and client finances are excluded. */
export function collaboratorMessage(event: CrmEvent, plan: ProductionPlan, person: CrmCollaborator): string {
  const assignments = plan.staff.filter(item => item.collaboratorId === person.id)
  const activities = buildEventAgenda(event, plan)
  return [
    '*MR FIESTA · HOJA DE TRABAJO*',
    `Para: ${person.nombre}`,
    `Evento: ${event.agasajado || event.cliente}`,
    `Fecha: ${productionDate(event.fecha_evento)}`,
    `Dirección: ${event.direccion || 'Por confirmar'} · ${event.lugar || 'Distrito por confirmar'}`,
    `Servicio: ${event.hora_inicio || 'Por confirmar'} – ${event.hora_fin || 'Por confirmar'}`,
    '', '*Tus funciones*',
    ...(assignments.length ? assignments.map(item => `${item.role} · Llegada ${productionDate(item.arrival)} · Inicio ${productionDate(item.start)} · Salida ${productionDate(item.end)} · ${item.confirmation === 'confirmed' ? 'Confirmado' : item.confirmation === 'declined' ? 'Rechazado' : 'Pendiente de confirmación'}`) : ['Sin funciones asignadas.']),
    '', '*Tu cronograma*',
    ...(activities.length ? activities.map(item => `${productionDate(item.start)} – ${productionDate(item.end)}: ${item.name}`) : ['Actividades por coordinar.']),
    '', 'Revisa los horarios y confirma con producción. Los cambios pendientes de guardar aún pueden variar.',
  ].join('\n')
}

export function whatsappLink(person: CrmCollaborator, message: string): string | null {
  let digits = (person.telefono || '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) digits = `51${digits}`
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** Paged text layout keeps long notes and arbitrary event counts inside the printable area. */
export function buildProductionPdf(contexts: ProductionContext[], collaborators: CrmCollaborator[], _assets: EquipmentAsset[], staffOnly = false, collaboratorId?: string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 24
  const clean = (text: string) => Array.from(text.replace(/[\u{1F000}-\u{1FFFF}]/gu, '')).filter(character => { const code = character.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13 }).join('')
  const line = (text: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(bold ? 10 : 9)
    const lines: string[] = pdf.splitTextToSize(clean(text || '—'), 180)
    for (const textLine of lines) {
      if (y > 278) { pdf.addPage(); y = 24 }
      pdf.text(textLine, 15, y); y += 4.6
    }
    y += 1.2
  }
  const names = (ids: string[]) => ids.map(id => collaborators.find(person => person.id === id)?.nombre || 'Colaborador no disponible').join(', ') || 'Por asignar'
  line(staffOnly ? 'MR FIESTA · HOJA DE TRABAJO' : 'MR FIESTA · PRODUCCIÓN OPERATIVA', true)
  line(`Generado: ${productionDate(new Date().toISOString())} · Hora de Lima`)
  line('Documento operativo. No reemplaza el contrato original.')
  contexts.forEach(({ event, plan }, index) => {
    if (index) { pdf.addPage(); y = 24 }
    line(`${event.agasajado || event.cliente} · ${productionDate(event.fecha_evento)}`, true)
    line(`Cliente: ${event.cliente} · Distrito: ${event.lugar || 'Por confirmar'}`)
    line(`Dirección: ${event.direccion || 'Por confirmar'}`)
    line(`Horario del evento: ${event.hora_inicio || 'Por confirmar'} - ${event.hora_fin || 'Por confirmar'} · Paquete: ${event.paquete}`)
    line(`Producción: ${productionStatuses[plan.status]}`)
    if (!staffOnly) {
      line('REFERENCIA CONTRACTUAL REGISTRADA', true)
      line(event.detalle_servicio || 'Sin detalle contractual estructurado disponible.')
      if (event.juegos_elegidos) line(`Juegos: ${event.juegos_elegidos}`)
      if (event.adicionales_requerimientos) line(`Requerimientos: ${event.adicionales_requerimientos}`)
      if (event.adicionales) line(`Adicionales históricos: ${event.adicionales}`)
      if (event.cronograma) line(`Cronograma contractual original: ${event.cronograma}`)
      line(`PDF original: ${event.drive_pdf_url ? 'Enlace disponible en el organizador; verificar permisos del proveedor.' : 'No existe PDF enlazado en el CRM.'}`)
    }
    line('PERSONAL Y FUNCIONES', true)
    const staff = collaboratorId ? plan.staff.filter(item => item.collaboratorId === collaboratorId) : plan.staff
    if (!staff.length) line('Personal por asignar.')
    staff.forEach(item => line(`${names([item.collaboratorId])} · ${item.role} · Llegada ${productionDate(item.arrival)} · Inicio ${productionDate(item.start)} · Salida ${productionDate(item.end)} · ${item.confirmation === 'confirmed' ? 'Confirmado' : item.confirmation === 'declined' ? 'Rechazado' : 'Por confirmar'}`))
    line('CRONOGRAMA', true)
    const schedule = buildEventAgenda(event, plan)
    if (!schedule.length) line(event.cronograma || 'Sin cronograma registrado en el CRM.')
    schedule.forEach(item => {
      line(`${productionDate(item.start)} - ${productionDate(item.end)} · ${item.name} · ${names(item.responsibleIds)} · ${item.status}`)
      if (!staffOnly && item.notes) line(`Observación interna: ${item.notes}`)
      if (!staffOnly && item.exception) line(`Excepción: ${item.exception}`)
    })
    if (!staffOnly) {
      line('CHECKLIST', true)
      simpleChecklist(event, plan).forEach(item => line(`${item.done ? '[OK]' : '[  ]'} ${item.label}${item.done ? ` · ${productionDate(item.completedAt || '')} · ${item.completedBy || 'Sin autor'}` : ''}`))
      line('ACUERDOS CON EL CLIENTE', true)
      plan.agreements.forEach(item => line(`${productionDate(item.date)} · ${item.responsible}: ${item.note}`))
      if (!plan.agreements.length) line('Sin acuerdos adicionales registrados.')
      line('FINANZAS INTERNAS · ACCESO ADMINISTRACIÓN', true)
      const payments = plan.payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const costs = costTotal(plan)
      line(`Ingreso contratado: ${money(event.total)} · Adelanto: ${money(event.adelanto)} · Pagos adicionales registrados: ${money(payments)}`)
      line(`Saldo calculado: ${money(balance(event, plan))} · Costos: ${money(costs)} · Utilidad estimada: ${money(operationalUtility(event, plan))}`)
      plan.costs.forEach(item => line(`${item.category}: ${money(item.amount)} · ${item.description}`))
      if (plan.notes) { line('NOTAS INTERNAS', true); line(plan.notes) }
      if (event.observaciones) line(`Observaciones del CRM: ${event.observaciones}`)
    }
  })
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFontSize(7); pdf.setTextColor(100); pdf.text(`MR FIESTA · ${staffOnly ? 'Hoja de trabajo' : 'Uso interno de producción'} · ${page}/${pages}`, 15, 290)
  }
  return pdf
}

export function exportProductionPdf(contexts: ProductionContext[], collaborators: CrmCollaborator[], assets: EquipmentAsset[], staffOnly = false, collaboratorId?: string): void {
  const name = contexts.length === 1 ? contexts[0].event.fecha_evento : 'general'
  buildProductionPdf(contexts, collaborators, assets, staffOnly, collaboratorId).save(`MRF_${staffOnly ? 'personal' : 'produccion'}_${name}.pdf`)
}
