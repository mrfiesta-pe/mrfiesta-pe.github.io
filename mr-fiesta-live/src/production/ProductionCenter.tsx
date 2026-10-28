import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CrmCollaborator } from '../types/domain'
import type { ProductionContext } from './model'
import { dayLocal } from './rules'
import { productionDate } from './exports'
import { agendaFingerprint, buildDayAgenda, buildEventAgenda, isShareOutdated, type AgendaActivity, type AgendaEdit } from './agenda'
import { dailyMessage, eventMessage, exportAgendaPdf, safeWhatsApp } from './agendaExports'
import { AgendaQuickEdit } from './AgendaQuickEdit'
import { ContractView } from './ContractView'
import './agenda.css'

interface Props {
  contexts: ProductionContext[]
  collaborators: CrmCollaborator[]
  selectedEventId?: string
  onRefresh: () => Promise<void>
  onSaveActivity: (row: AgendaActivity, patch: AgendaEdit) => Promise<void>
  onOpenAdvanced: (eventId?: string) => void
  onShare?: (eventIds: string[], channel: 'whatsapp' | 'pdf', fingerprints?: Record<string, string>) => Promise<void>
}
type Share = { eventId?: string; label: string; message: string; eventIds: string[]; fingerprints: Record<string, string> }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const nameOf = (context: ProductionContext) => context.event.agasajado || context.event.cliente
const colorOf = (id: string) => {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return ['#67d9f0', '#f7aa78', '#b49bff', '#6ed9af', '#f08eb6', '#e4d36f'][hash % 6]
}
const clock = (value: string) => value?.slice(11, 16) || 'Por coordinar'
const clockRange = (start: string, end: string) => start ? `${clock(start)}${end ? ` – ${clock(end)}` : ''}` : 'Por programar'
const periodDate = (start: string, end: string, reference: string) => {
  const first = start.slice(0, 10), last = end.slice(0, 10)
  if (!first) return last ? `Fin ${productionDate(last)}` : ''
  if (last && last !== first) return `${productionDate(first)} → ${productionDate(last)}`
  return first !== reference ? productionDate(first) : ''
}
function phoneDigits(phone: string) { const digits = phone.replace(/\D/g, ''); return /^9\d{8}$/.test(digits) ? `51${digits}` : /^[1-9]\d{7,14}$/.test(digits) ? digits : '' }
function offsetDay(date: string, offset: number) { const parsed = new Date(`${date}T12:00:00-05:00`); return Number.isFinite(parsed.getTime()) ? dayLocal(new Date(parsed.getTime() + offset * 86400000)) : dayLocal() }

function Modal({ title, eyebrow, children, onClose, busy = false, className = '' }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.querySelector<HTMLElement>('button,input,textarea,a[href]')?.focus() }, [])
  return <div className="agenda-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><section ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`agenda-modal ${className}`} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose()
    if (event.key === 'Tab') {
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || [])]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}><header className="agenda-modal-head"><div>{eyebrow && <span className="agenda-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button type="button" aria-label={`Cerrar ${title}`} disabled={busy} onClick={onClose}>×</button></header>{children}</section></div>
}

export function ProductionCenter({ contexts, collaborators, selectedEventId, onRefresh, onSaveActivity, onOpenAdvanced, onShare }: Props) {
  const [search, setSearch] = useSearchParams()
  const focused = contexts.find(context => context.event.id === selectedEventId)
  const date = search.get('date') || focused?.event.fecha_evento || dayLocal()
  const lastDate = useRef(date)
  const [view, setView] = useState<'timeline' | 'events'>(selectedEventId ? 'events' : 'timeline')
  const [detailId, setDetailId] = useState<string | undefined>()
  const [contractId, setContractId] = useState<string | undefined>()
  const [editing, setEditing] = useState<AgendaActivity>()
  const [share, setShare] = useState<Share>()
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const rows = useMemo(() => buildDayAgenda(contexts, date), [contexts, date])
  const selected = useMemo(() => contexts.filter(context => context.event.fecha_evento === date || rows.some(row => row.eventId === context.event.id)).sort((a, b) => Number(b.event.id === selectedEventId) - Number(a.event.id === selectedEventId) || a.event.hora_inicio.localeCompare(b.event.hora_inicio)), [contexts, date, rows, selectedEventId])
  const scheduled = selected.filter(context => context.event.fecha_evento === date)
  const related = selected.length - scheduled.length
  const detail = contexts.find(context => context.event.id === detailId)
  const contract = contexts.find(context => context.event.id === contractId)
  const editingContext = contexts.find(context => context.event.id === editing?.eventId)
  const names = (ids: string[]) => ids.map(id => collaborators.find(person => person.id === id)?.nombre || 'Colaborador no disponible').join(', ') || 'Por asignar'
  useEffect(() => { if (selectedEventId) setView('events') }, [selectedEventId])
  useEffect(() => {
    if (lastDate.current === date) return
    lastDate.current = date
    let active = true
    setBusy(true); setError(''); setNotice('')
    void onRefresh().catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'No se pudo actualizar esta fecha.') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [date, onRefresh])
  useEffect(() => {
    if (!detailId && !contractId && !editing && !share) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [detailId, contractId, editing, share])
  const setDate = (value: string) => { const next = new URLSearchParams(search); next.set('date', value || dayLocal()); setSearch(next); setDetailId(undefined); setEditing(undefined); setShare(undefined); setError(''); setNotice('') }
  const editRow = (row: AgendaActivity) => {
    const context = contexts.find(item => item.event.id === row.eventId)
    setDetailId(undefined); setEditing({ ...row, revision: context?.revision ?? 0 }); setError('')
  }
  const showContract = (id: string) => { setDetailId(undefined); setContractId(id) }
  const fingerprintsOf = (items: ProductionContext[]) => Object.fromEntries(items.map(context => [context.event.id, agendaFingerprint(context.event, context.plan, collaborators)]))
  const adminPhone = (items: ProductionContext[]) => {
    const assigned = items.flatMap(context => context.plan.staff.filter(member => member.confirmation !== 'declined' && /administr|coordin|supervisor|responsable general|produccion/.test(normalize(member.role))))
    const confirmed = assigned.filter(member => member.confirmation === 'confirmed')
    const phones = [...new Set((confirmed.length ? confirmed : assigned).map(member => collaborators.find(person => person.id === member.collaboratorId)?.telefono || '').filter(Boolean))]
    return phones.length === 1 ? phones[0] : ''
  }
  const showShare = (context?: ProductionContext) => {
    const items = context ? [context] : selected
    setDetailId(undefined); setRecipient(adminPhone(items)); setError('')
    setShare({ eventId: context?.event.id, label: context ? nameOf(context) : productionDate(date), eventIds: items.map(item => item.event.id), fingerprints: fingerprintsOf(items), message: context ? eventMessage(context.event, context.plan, collaborators) : dailyMessage(date, contexts, collaborators) })
  }
  const download = async (context?: ProductionContext) => {
    setBusy(true); setError(''); setNotice('')
    const items = context ? [context] : selected
    const fingerprints = fingerprintsOf(items)
    let generated = false
    try {
      exportAgendaPdf(date, contexts, collaborators, context?.event.id)
      generated = true
      await onShare?.(items.map(item => item.event.id), 'pdf', fingerprints)
      setNotice(context ? 'PDF del evento generado.' : 'PDF del día generado.')
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : 'No se pudo generar el PDF.'
      setError(generated ? `PDF generado, pero no pudimos registrar esta versión: ${reason}` : reason)
    }
    finally { setBusy(false) }
  }
  const roleNames = (context: ProductionContext, pattern: RegExp) => {
    const assignments = context.plan.staff.filter(person => person.confirmation !== 'declined' && pattern.test(normalize(person.role)))
    return assignments.length ? assignments.map(person => `${names([person.collaboratorId])}${person.confirmation === 'confirmed' ? '' : ' · por confirmar'}`).join(', ') : 'Por asignar'
  }
  const rowStatus = (row: AgendaActivity) => <span className={`agenda-origin ${row.pending ? 'pending' : ''}`}>{row.sourceLabel}</span>
  const eventCard = (context: ProductionContext, expanded = false) => {
    const event = context.event
    const agenda = buildEventAgenda(event, context.plan, context.revision)
    const digits = phoneDigits(event.telefono || '')
    const mapQuery = [event.direccion, event.lugar].filter(Boolean).join(', ')
    return <article key={event.id} id={`agenda-event-${event.id}`} className={`agenda-event ${selectedEventId === event.id ? 'focused' : ''}`} style={{ '--event-color': colorOf(event.id) } as CSSProperties}>
      <header className="agenda-event-head"><div><span className="agenda-event-district">{event.lugar || 'Distrito por confirmar'}</span>{event.fecha_evento !== date && <span className="agenda-other-date">Evento del {productionDate(event.fecha_evento)}</span>}<h2>{nameOf(context)}</h2><p>{event.hora_inicio || '?'} – {event.hora_fin || '?'} <span>· {event.paquete}</span></p></div>{!expanded && <button type="button" className="agenda-details-button" onClick={() => setDetailId(event.id)} aria-label={`Ver información de ${nameOf(context)}`}>Ver evento ↗</button>}</header>
      <dl className="agenda-event-info"><div><dt>Cliente</dt><dd>{event.cliente}</dd></div><div><dt>Dirección</dt><dd>{event.direccion || 'Por confirmar'}</dd></div><div><dt>Teléfono</dt><dd>{event.telefono || 'Por confirmar'}</dd></div></dl>
      <div className="agenda-team"><div><span>Administración</span><b>{roleNames(context, /administr|coordin|supervisor|responsable general|produccion/)}</b></div><div><span>DJ</span><b>{roleNames(context, /\bdj\b|disc.?jockey/)}</b></div><div><span>Animación</span><b>{roleNames(context, /animador|animadora|animacion/)}</b></div><div><span>Glitter</span><b>{roleNames(context, /glitter|maquill/)}</b></div></div>
      {isShareOutdated(context.plan, event, collaborators) && <p className="agenda-share-warning">La última orden preparada usa otro cronograma. Genera una nueva versión.</p>}
      <div className="agenda-event-agenda"><h3>Cronograma del evento</h3>{agenda.length ? agenda.map(row => <div className="agenda-card-row" key={row.id}><time>{clockRange(row.start, row.end)}{periodDate(row.start, row.end, event.fecha_evento) && <small className="agenda-date-marker">{periodDate(row.start, row.end, event.fecha_evento)}</small>}</time><div><b>{row.name}</b><small>{names(row.responsibleIds)}</small>{rowStatus(row)}</div><button type="button" onClick={() => editRow(row)} aria-label={`Editar ${row.name} de ${nameOf(context)}`}>Editar</button></div>) : <p className="agenda-soft-note">Todavía no hay horarios registrados. Abre el contrato para consultar el servicio.</p>}</div>
      {!!context.plan.agreements.length && <details className="agenda-important"><summary>Indicaciones y acuerdos ({context.plan.agreements.length})</summary>{context.plan.agreements.map(agreement => <p key={agreement.id}><b>{productionDate(agreement.date)} · {agreement.responsible}</b><br />{agreement.note}</p>)}</details>}
      <footer className="agenda-event-actions"><button type="button" onClick={() => showContract(event.id)}>Contrato</button>{mapQuery && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">{event.direccion ? 'Maps ↗' : 'Mapa del distrito ↗'}</a>}{digits && <a href={`tel:+${digits}`}>Llamar</a>}<button type="button" onClick={() => showShare(context)}>WhatsApp</button><button type="button" disabled={busy} onClick={() => void download(context)}>PDF</button><button type="button" className="agenda-advanced-link" onClick={() => onOpenAdvanced(event.id)}>Más opciones</button></footer>
    </article>
  }
  return <div className="event-agenda">
    <section className="agenda-heading"><div><span className="agenda-eyebrow">MR FIESTA · PRODUCCIÓN</span><h1>Agenda de eventos</h1><p>Todos los horarios y responsables, en una sola pantalla.</p></div><button type="button" className="agenda-advanced-link" onClick={() => onOpenAdvanced(selectedEventId)}>⚙️ ADMINISTRACIÓN AVANZADA</button></section>
    <section className="agenda-day-bar"><div className="agenda-date-tools"><button type="button" onClick={() => setDate(offsetDay(date, -1))} aria-label="Día anterior">‹</button><label><span>Fecha de los eventos</span><input aria-label="Fecha de la agenda" type="date" value={date} onChange={event => setDate(event.target.value)} /></label><button type="button" onClick={() => setDate(offsetDay(date, 1))} aria-label="Día siguiente">›</button><button type="button" onClick={() => setDate(dayLocal())}>Hoy</button></div><span className="agenda-event-count">{scheduled.length} {scheduled.length === 1 ? 'evento' : 'eventos'}{related > 0 && <small>+ {related} con movimientos de otra fecha</small>}</span><button type="button" className="agenda-show-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); setNotice(''); try { await onRefresh(); setView('timeline'); setNotice('Cronograma actualizado.') } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el cronograma.') } finally { setBusy(false) } }}>{busy ? 'Actualizando…' : '⚡ VER CRONOGRAMA COMPLETO'}</button></section>
    <div className="agenda-toolbar"><nav className="agenda-switch" aria-label="Vistas de la agenda"><button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>CRONOGRAMA GENERAL</button><button type="button" aria-pressed={view === 'events'} onClick={() => setView('events')}>POR EVENTO</button></nav><div className="agenda-share-actions"><button type="button" disabled={!selected.length || busy} onClick={() => showShare()}>WhatsApp del día</button><button type="button" disabled={!selected.length || busy} onClick={() => void download()}>PDF del día</button></div></div>
    {error && <p className="agenda-error" role="alert">{error}</p>}{notice && <p className="agenda-status" role="status">{notice}</p>}
    {!selected.length ? <section className="agenda-empty"><span>📅</span><h2>No hay eventos programados para esta fecha</h2><p>Elige otro día para consultar su cronograma.</p></section> : view === 'timeline' ? <section className="agenda-general" aria-label="Cronograma general del día"><div className="agenda-timeline-head"><span>Hora</span><span>Evento</span><span>Actividad</span><span>Distrito</span><span>Responsables</span><span /></div>{rows.map(row => { const context = contexts.find(item => item.event.id === row.eventId); if (!context) return null; return <div className="agenda-timeline-row" key={`${row.eventId}-${row.id}`} style={{ '--event-color': colorOf(row.eventId) } as CSSProperties}><button type="button" className="agenda-row-info" onClick={() => setDetailId(row.eventId)} aria-label={`Ver evento ${nameOf(context)}, ${row.name}, ${clockRange(row.start, row.end)}`}><time>{clockRange(row.start, row.end)}{periodDate(row.start, row.end, date) && <small className="agenda-date-marker">{periodDate(row.start, row.end, date)}</small>}</time><span className="agenda-row-event">{nameOf(context)}</span><span className="agenda-row-activity"><b>{row.name}</b>{rowStatus(row)}</span><span className="agenda-row-district">{context.event.lugar || 'Por confirmar'}</span><span className="agenda-row-people">{names(row.responsibleIds)}</span></button><button type="button" className="agenda-row-edit" onClick={() => editRow(row)} aria-label={`Editar ${row.name} de ${nameOf(context)}`}>Editar</button></div> })}{!rows.length && <p className="agenda-soft-note">Hay eventos registrados, pero aún no hay actividades. Consulta cada contrato en POR EVENTO.</p>}<p className="agenda-legend">Los colores identifican cada evento. Los horarios por coordinar quedan al final.</p></section> : <section className="agenda-events" aria-label="Eventos del día">{selected.map(context => eventCard(context))}</section>}
    {detail && <Modal title="Información del evento" eyebrow={nameOf(detail)} onClose={() => setDetailId(undefined)} className="agenda-detail-modal">{eventCard(detail, true)}</Modal>}
    {contract && <ContractView event={contract.event} plan={contract.plan} onClose={() => setContractId(undefined)} />}
    {editing && editingContext && <AgendaQuickEdit row={editing} eventName={nameOf(editingContext)} collaborators={collaborators} onClose={() => setEditing(undefined)} onSave={async (row, patch) => { await onSaveActivity(row, patch); setNotice('Cambio guardado en el cronograma.'); setError('') }} />}
    {share && <Modal title="Compartir cronograma" eyebrow={share.label} onClose={() => setShare(undefined)} busy={busy} className="agenda-share-modal"><p className="agenda-hint">Revisa el contenido antes de abrir WhatsApp.</p><textarea aria-label="Vista previa del mensaje" className="agenda-message-preview" value={share.message} readOnly rows={15} /><label>Destinatario (opcional)<input aria-label="Teléfono de destino" inputMode="tel" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="Vacío: elegir contacto en WhatsApp" /></label>{recipient && !safeWhatsApp(recipient, share.message) && <p className="agenda-error">Escribe un teléfono válido con código de país o un celular peruano.</p>}{error && <p className="agenda-error" role="alert">{error}</p>}<footer className="agenda-modal-actions"><button type="button" disabled={busy} onClick={() => setShare(undefined)}>Cerrar</button><button type="button" className="agenda-primary" disabled={busy || !safeWhatsApp(recipient, share.message)} onClick={async () => {
      const link = safeWhatsApp(recipient, share.message)
      if (!link) return
      window.open(link, '_blank', 'noopener,noreferrer')
      setBusy(true); setError('')
      try { await onShare?.(share.eventIds, 'whatsapp', share.fingerprints); setShare(undefined); setNotice('WhatsApp abierto con el cronograma. Confirma el envío allí.') }
      catch (caught) { setError(caught instanceof Error ? `WhatsApp se abrió, pero no pudimos registrar esta versión: ${caught.message}` : 'WhatsApp se abrió, pero no pudimos registrar esta versión.') }
      finally { setBusy(false) }
    }}>Abrir WhatsApp</button></footer></Modal>}
  </div>
}
