import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { CrmCollaborator } from '../types/domain'
import type { EquipmentAsset, ProductionContext } from './model'
import { productionStatuses } from './model'
import { dayLocal } from './rules'
import { simpleChecklist, simpleProgress, simpleReadiness } from './simpleWorkflow'
import { exportProductionPdf } from './exports'

const views = { cards: 'Tarjetas', table: 'Tabla', staff: 'Personal del día' }
type Props = { contexts: ProductionContext[]; collaborators: CrmCollaborator[]; assets: EquipmentAsset[] }
export function ProductionCenter({ contexts, collaborators, assets }: Props) {
  const [search, setSearch] = useSearchParams()
  const date = search.get('date') || dayLocal()
  const [view, setView] = useState<keyof typeof views>('cards')
  const [exportError, setExportError] = useState('')
  const selected = useMemo(() => contexts.filter(context => context.event.fecha_evento === date).sort((a, b) => a.event.hora_inicio.localeCompare(b.event.hora_inicio)), [contexts, date])
  const name = (id: string) => collaborators.find(person => person.id === id)?.nombre || 'Colaborador no disponible'
  const team = (context: ProductionContext) => context.plan.staff.filter(person => person.confirmation !== 'declined')
  const preparation = (context: ProductionContext) => {
    const check = simpleReadiness(context.event, context.plan, contexts)
    const conflict = check.blocking.some(alert => alert.key.startsWith('resource:'))
    return { ...check, label: conflict ? '🔴 Revisar cruce de personal' : check.ready ? '🟢 Listo' : '🟡 En preparación', className: conflict ? 'risk' : check.ready ? 'ready' : 'preparing' }
  }
  const open = (context: ProductionContext) => <Link className="prod-open" to={`/production/${context.event.id}`} target="_blank" rel="noopener noreferrer">📋 ORGANIZAR EVENTO ↗</Link>
  const done = selected.filter(context => preparation(context).ready).length
  return <>
    <section className="prod-center-hero"><div><span className="eyebrow">MR FIESTA</span><h1>Centro de producción</h1><p>Tu equipo, tu checklist y todos los detalles del evento.</p></div><div className="prod-actions"><label>Fecha<input aria-label="Fecha de producción" type="date" value={date} onChange={event => setSearch({ date: event.target.value })} /></label><button disabled={!selected.length} onClick={() => { try { exportProductionPdf(selected, collaborators, assets); setExportError('') } catch { setExportError('No se pudo generar el reporte. Inténtalo nuevamente.') } }}>Resumen del día · PDF</button></div></section>
    {exportError && <p role="alert" className="prod-danger">{exportError}</p>}
    <section className="prod-kpis prod-kpis-simple"><article><span>Eventos</span><strong>{selected.length}</strong></article><article><span>Listos</span><strong>{done}</strong></article><article><span>Por preparar</span><strong>{selected.length - done}</strong></article></section>
    <nav className="prod-views" aria-label="Vistas del centro de producción">{Object.entries(views).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key as keyof typeof views)}>{label}</button>)}</nav>
    {!selected.length && <p className="prod-empty">No hay eventos para esta fecha.</p>}
    {view === 'cards' && <section className="prod-event-cards">{selected.map(context => { const status = preparation(context); const tasks = simpleChecklist(context.event, context.plan); return <article key={context.event.id} className={`prod-event-card ${status.className}`}><div className="prod-card-heading"><span className={`prod-status ${status.className}`}>{status.label}</span><span>{context.event.hora_inicio}–{context.event.hora_fin || '?'}</span></div><h2>{context.event.agasajado || context.event.cliente}</h2><p>{context.event.cliente}</p><p><b>{context.event.lugar || 'Distrito pendiente'}</b> · {context.event.paquete}</p><dl><dt>Personal</dt><dd>{team(context).map(person => `${name(person.collaboratorId)} · ${person.role}${person.confirmation === 'confirmed' ? ' ✓' : ' (por confirmar)'}`).join(', ') || 'Por asignar'}</dd><dt>Checklist</dt><dd>{tasks.filter(task => task.done).length} de {tasks.length} completadas</dd><dt>Estado</dt><dd>{productionStatuses[context.plan.status]}</dd></dl><div className="prod-progress"><progress aria-label={`Preparación ${context.event.cliente}`} max={100} value={simpleProgress(context.event, context.plan)} /><span>{simpleProgress(context.event, context.plan)}%</span></div>{status.alerts.filter(alert => alert.key.startsWith('resource:')).map(alert => <p key={alert.key} className="prod-card-alert">{alert.message}</p>)}{open(context)}</article> })}</section>}
    {view === 'table' && <div className="prod-table-wrap"><table className="prod-table"><thead><tr><th>Evento / cliente</th><th>Distrito / horario</th><th>Paquete</th><th>Personal</th><th>Checklist</th><th>Estado</th><th>Organizar</th></tr></thead><tbody>{selected.map(context => { const tasks = simpleChecklist(context.event, context.plan); return <tr key={context.event.id}><td><b>{context.event.agasajado || context.event.cliente}</b><br />{context.event.cliente}</td><td>{context.event.lugar}<br />{context.event.hora_inicio}–{context.event.hora_fin}</td><td>{context.event.paquete}</td><td>{team(context).map(person => `${name(person.collaboratorId)} · ${person.role}`).join(', ') || 'Por asignar'}</td><td>{tasks.filter(task => task.done).length}/{tasks.length}</td><td>{preparation(context).label}</td><td>{open(context)}</td></tr> })}</tbody></table></div>}
    {view === 'staff' && <section className="prod-section"><h2>Personal del día</h2>{collaborators.filter(person => selected.some(context => team(context).some(assignment => assignment.collaboratorId === person.id))).map(person => <article key={person.id} className="prod-resource-card"><h3>{person.nombre}</h3>{selected.flatMap(context => team(context).filter(assignment => assignment.collaboratorId === person.id).map(assignment => <p key={`${context.event.id}-${assignment.id}`}><b>{context.event.agasajado || context.event.cliente}</b> · {context.event.lugar} · {assignment.role} · {assignment.start.slice(11, 16) || context.event.hora_inicio}–{assignment.end.slice(11, 16) || context.event.hora_fin} · {assignment.confirmation === 'confirmed' ? 'Confirmado' : 'Por confirmar'}</p>))}</article>)}{!selected.some(context => team(context).length) && <p className="prod-empty">Todavía no hay personal asignado.</p>}</section>}
  </>
}
