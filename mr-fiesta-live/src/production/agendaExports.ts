import { jsPDF } from 'jspdf'
import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { ProductionContext, ProductionPlan } from './model'
import { buildDayAgenda, buildEventAgenda, publicOperationalDetails } from './agenda'
import type { AgendaActivity } from './agenda'
import { toEpoch } from './rules'

function stamp(value: string): string {
  const epoch = toEpoch(value)
  if (!Number.isFinite(epoch)) return 'hora pendiente'
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hourCycle: 'h23', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(epoch))
}
function names(ids: string[], collaborators: CrmCollaborator[]): string {
  return ids.map(id => collaborators.find(person => person.id === id)?.nombre || 'Responsable por confirmar').join(', ') || 'Responsable por confirmar'
}
function activityLine(activity: AgendaActivity, people: CrmCollaborator[]): string {
  const period = activity.end && activity.end !== activity.start ? `${stamp(activity.start)}–${stamp(activity.end)}` : stamp(activity.start)
  const state = activity.source === 'suggested' ? 'SUGERIDO · por confirmar' : activity.pending ? 'Horario pendiente' : activity.source === 'contract' ? 'Contrato' : activity.confirmed ? 'Confirmado' : 'Por confirmar'
  return `${period} · ${activity.name} · ${names(activity.responsibleIds, people)} [${state}]`
}
function teamLines(plan: ProductionPlan, people: CrmCollaborator[]): string[] {
  return plan.staff.filter(member => member.confirmation !== 'declined').map(member => {
    const person = people.find(candidate => candidate.id === member.collaboratorId)
    const phone = person?.telefono?.trim()
    return `${person?.nombre || 'Persona por confirmar'} · ${member.role} · ${stamp(member.start)}–${stamp(member.end)} · ${member.confirmation === 'confirmed' ? 'Confirmado' : 'Por confirmar'}${phone ? ` · Tel. ${phone}` : ''}`
  })
}

/** Operational work order only: no prices, deposits, fees, expenses or internal notes. */
export function eventMessage(event: CrmEvent, plan: ProductionPlan, collaborators: CrmCollaborator[]): string {
  const agenda = buildEventAgenda(event, plan)
  const details = publicOperationalDetails(event, plan)
  return ['*MR FIESTA · AGENDA DEL EVENTO*', `Evento: ${event.agasajado || event.cliente}`, `Cliente: ${event.cliente}`, `Fecha: ${event.fecha_evento}`, `Dirección: ${event.direccion || 'Por confirmar'} · ${event.lugar || 'Distrito por confirmar'}`, `Contacto del cliente: ${event.telefono || 'Por confirmar'}`, `Paquete: ${event.paquete || 'Por confirmar'}`, '', '*Servicios*', ...(details.services.length ? details.services : ['Consultar el servicio descrito en el contrato.']), ...details.extras.map(extra => `Adicional: ${extra}`), ...(details.directions.length ? ['', '*Indicaciones operativas*', ...details.directions.map(detail => `${detail.label}: ${detail.value}`)] : []), '', '*Personal*', ...(teamLines(plan, collaborators).length ? teamLines(plan, collaborators) : ['Personal por confirmar.']), '', '*Agenda*', ...agenda.map(activity => activityLine(activity, collaborators)), '', 'Los bloques marcados SUGERIDO requieren confirmación. Revisa la versión con producción antes de salir.'].join('\n')
}

export function dailyMessage(date: string, contexts: ProductionContext[], collaborators: CrmCollaborator[]): string {
  const agenda = buildDayAgenda(contexts, date)
  const included = contexts.filter(context => context.event.fecha_evento === date || agenda.some(activity => activity.eventId === context.event.id))
  const lines = [`*MR FIESTA · AGENDA DEL DÍA · ${date}*`, '']
  if (!included.length) lines.push('No hay eventos ni movimientos registrados para esta fecha.')
  for (const context of included) {
    const event = context.event
    const details = publicOperationalDetails(event, context.plan)
    lines.push(`*${event.agasajado || event.cliente} · ${event.lugar || 'Distrito pendiente'}*`, `Cliente: ${event.cliente} · Tel. ${event.telefono || 'Por confirmar'}`, `Dirección: ${event.direccion || 'Por confirmar'}`, `Paquete: ${event.paquete || 'Por confirmar'}`, `Servicios: ${details.services.join(' · ') || 'Consultar contrato'}`, ...details.extras.map(extra => `Adicional: ${extra}`), ...details.directions.map(detail => `${detail.label}: ${detail.value}`), ...teamLines(context.plan, collaborators), ...agenda.filter(activity => activity.eventId === event.id).map(activity => activityLine(activity, collaborators)), '')
  }
  lines.push('Los horarios SUGERIDOS siguen pendientes de confirmación. Confirma con producción la versión vigente.')
  return lines.join('\n')
}

/** Empty recipient opens WhatsApp's contact picker. A supplied invalid phone never becomes a link. */
export function safeWhatsApp(phone: string | undefined, message: string): string | null {
  const source = String(phone || '').trim()
  if (!source) return `https://wa.me/?text=${encodeURIComponent(message)}`
  let digits = source.replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) digits = `51${digits}`
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** The generated PDF uses the same privacy boundary and source labels as the WhatsApp preview. */
export function buildAgendaPdf(date: string, contexts: ProductionContext[], collaborators: CrmCollaborator[], eventId?: string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const selected = eventId ? contexts.find(context => context.event.id === eventId) : undefined
  if (eventId && !selected) throw new Error('No se encontró el evento seleccionado para exportar su agenda.')
  const text = selected ? eventMessage(selected.event, selected.plan, collaborators) : dailyMessage(date, contexts, collaborators)
  let y = 20
  const clean = (value: string) => Array.from(value).filter(character => { const code = character.codePointAt(0)!; return code >= 32 && code <= 0xffff }).join('').replace(/\*/g, '').replace(/[\u2010-\u2015]/g, '-')
  for (const sourceLine of text.split('\n')) {
    const heading = /^\*[^*].*\*$/.test(sourceLine)
    pdf.setFont('helvetica', heading ? 'bold' : 'normal'); pdf.setFontSize(heading ? 11 : 9)
    const lines: string[] = pdf.splitTextToSize(clean(sourceLine), 180)
    for (const line of lines.length ? lines : ['']) {
      if (y > 277) { pdf.addPage(); y = 20 }
      pdf.text(line, 15, y); y += heading ? 5.3 : 4.8
    }
    y += heading ? 2 : 0.7
  }
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page++) { pdf.setPage(page); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(90); pdf.text(`MR FIESTA · Agenda operativa · ${page}/${total}`, 15, 290) }
  return pdf
}
export function exportAgendaPdf(date: string, contexts: ProductionContext[], collaborators: CrmCollaborator[], eventId?: string): void {
  buildAgendaPdf(date, contexts, collaborators, eventId).save(`MRF_Agenda_${eventId ? 'evento_' : 'dia_'}${date}.pdf`)
}
