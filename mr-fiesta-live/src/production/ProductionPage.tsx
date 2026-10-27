import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { supabase } from '../lib/supabase'
import { createAsset, isProductionAdmin, loadJournal, loadProduction, savePlan } from './api'
import type { JournalEntry, ProductionPlan, ProductionStatus } from './model'
import { productionStatuses } from './model'
import { progress, readiness } from './rules'
import { autoPlan } from './autoplan'
import { Organizer } from './Organizer'
import { ProductionCenter } from './ProductionCenter'
import './production.css'

type Dataset = Awaited<ReturnType<typeof loadProduction>>
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación. Revisa la conexión y los permisos.'
const crmHref = `${import.meta.env.BASE_URL}${import.meta.env.VITE_ROUTER === 'hash' ? '#/' : ''}crm`

export function ProductionPage() {
  const { eventId } = useParams()
  const [userId, setUserId] = useState<string | null | undefined>()
  const [data, setData] = useState<Dataset>()
  const [draft, setDraft] = useState<ProductionPlan>()
  const [baseline, setBaseline] = useState('')
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const authVersion = useRef(0)
  const identity = useRef<string | null | undefined>(undefined)
  const dirty = !!draft && JSON.stringify(draft) !== baseline

  useEffect(() => {
    if (!supabase) { setUserId(null); return }
    const applyIdentity = (next: string | null) => {
      if (identity.current === next) return
      identity.current = next; authVersion.current++
      setData(undefined); setDraft(undefined); setJournal([]); setDenied(false); setError(''); setNotice('')
      setUserId(next)
    }
    void supabase.auth.getSession().then(({ data: auth }) => { if (!authVersion.current) applyIdentity(auth.session?.user.id ?? null) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyIdentity(session?.user.id ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    const version = authVersion.current
    setBusy(true); setError(''); setNotice('')
    try {
      const admin = await isProductionAdmin()
      if (authVersion.current !== version) return
      if (!admin) { setDenied(true); setData(undefined); return }
      setDenied(false)
      const loaded = await loadProduction()
      if (authVersion.current !== version) return
      setData(loaded)
    } catch (caught) { if (authVersion.current === version) setError(messageOf(caught)) }
    finally { if (authVersion.current === version) setBusy(false) }
  }, [])

  useEffect(() => { if (userId) void reload() }, [userId, reload])
  useEffect(() => {
    const event = data?.events.find(item => item.id === eventId)
    if (!event) { setDraft(undefined); setJournal([]); return }
    const record = data?.records.find(item => item.eventId === eventId)
    const document = record?.document ?? autoPlan(event)
    setDraft(structuredClone(document)); setBaseline(record ? JSON.stringify(document) : "")
    let active = true
    void loadJournal(event.id).then(items => { if (active) setJournal(items) }).catch(caught => { if (active) setError(messageOf(caught)) })
    return () => { active = false }
  }, [data?.events, data?.records, eventId])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const contexts = useMemo(() => data?.events.map(event => ({ event, plan: event.id === eventId && draft ? draft : data.records.find(record => record.eventId === event.id)?.document ?? autoPlan(event) })) ?? [], [data, draft, eventId])
  const selected = contexts.find(context => context.event.id === eventId)
  const analysis = selected ? readiness(selected.event, selected.plan, contexts, data?.assets ?? []) : { alerts: [], blocking: [] }
  const alerts = analysis.alerts
  const unresolved = analysis.blocking

  const save = async () => {
    if (!eventId || !draft || !data) return
    if (['ready', 'setup', 'live', 'finished', 'closed'].includes(draft.status) && unresolved.length) {
      setError('Resuelve las alertas críticas antes de avanzar a ejecución. Puedes guardar el trabajo en planificación.'); return
    }
    setBusy(true); setError(''); setNotice('')
    const version = authVersion.current
    try {
      const record = await savePlan(eventId, draft, data.records.find(item => item.eventId === eventId)?.revision ?? 0)
      if (authVersion.current !== version) return
      setData(current => current ? { ...current, records: [...current.records.filter(item => item.eventId !== eventId), record] } : current)
      setBaseline(JSON.stringify(record.document))
      setNotice(`Guardado en Supabase · revisión ${record.revision}.`)
      const entries = await loadJournal(eventId)
      if (authVersion.current === version) setJournal(entries)
    } catch (caught) { if (authVersion.current === version) setError(messageOf(caught)) }
    finally { if (authVersion.current === version) setBusy(false) }
  }

  if (!supabase) return <main className="production"><p role="alert">Falta la configuración de Supabase del CRM.</p><a href={crmHref}>Volver al CRM</a></main>
  if (userId === undefined) return <main className="loading-screen">Comprobando sesión…</main>
  if (!userId) return <main className="production prod-access"><BrandLogo /><h1>Centro de producción</h1><p>Inicia sesión con tu cuenta de administración del CRM. La sesión se comparte entre las pestañas de MR FIESTA.</p><a className="primary-button" href={crmHref}>Entrar desde el CRM</a></main>
  return <main className="production">
    <header className="prod-header"><a href={crmHref} className="prod-brand"><BrandLogo /><span>MR FIESTA <small>CENTRO DE PRODUCCIÓN</small></span></a><div className="prod-actions"><a href={crmHref}>Volver al CRM</a>{eventId && <Link to="/production" target="_blank" rel="noopener noreferrer">Vista del día ↗</Link>}<button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Recargar desde Supabase y descartarlos?')) void reload() }}>Actualizar</button></div></header>
    {error && <div role="alert" className="prod-banner prod-danger">{error}<button type="button" onClick={() => setError('')} aria-label="Cerrar error">×</button></div>}
    {denied ? <section className="prod-section"><h1>Acceso restringido</h1><p>Tu cuenta no tiene permisos de administración del CRM.</p></section> : !data ? <section className="prod-section"><h1>{busy ? 'Cargando producción…' : 'No se pudo cargar producción'}</h1><button onClick={() => void reload()} disabled={busy}>Reintentar</button></section> : !eventId ? <ProductionCenter contexts={contexts} assets={data.assets} collaborators={data.collaborators} /> : !selected || !draft ? <section className="prod-section"><h1>Evento no encontrado</h1><p>No existe o no tienes acceso a esta reserva.</p></section> : <>
      <section className="prod-event-head"><div><span className="eyebrow">ORGANIZADOR DEL EVENTO</span><h1>{selected.event.agasajado || selected.event.cliente}</h1><p>{selected.event.cliente} · {selected.event.fecha_evento} · {selected.event.hora_inicio}–{selected.event.hora_fin || 'Por confirmar'} · {selected.event.lugar}</p><p>{selected.event.direccion || 'Dirección pendiente'} · {selected.event.paquete}</p><p>Cliente: {selected.event.telefono || 'Teléfono pendiente'} · Invitados: {selected.event.invitados ?? 'Sin dato'} · Reserva / pago: {selected.event.estado_pago}</p></div><div className="prod-save-panel"><label>Estado de producción<select aria-label="Estado de producción" disabled={busy} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ProductionStatus })}>{Object.entries(productionStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar producción'}</button><span role="status" aria-live="polite">{dirty ? 'Cambios sin guardar' : notice || 'Sin cambios pendientes'}</span><small>{progress(draft)}% preparado · {unresolved.length} alertas críticas</small></div></section>
      {!!alerts.length && <details className="prod-alerts"><summary>{unresolved.length ? '🔴 RIESGO' : '🟡 EN PREPARACIÓN'} · {alerts.length} avisos operativos</summary>{alerts.map(alert => { const exception = draft.exceptions.find(item => item.key === alert.key); return <article key={alert.key} className={`prod-alert ${alert.severity}`}><strong>{alert.message}</strong><p>{alert.fix}</p>{alert.canJustify && <label>Justificación de excepción<input disabled={busy} aria-label={`Justificación: ${alert.message}`} placeholder="Motivo acordado, responsable y referencia" value={exception?.reason ?? ''} onChange={event => setDraft({ ...draft, exceptions: [...draft.exceptions.filter(item => item.key !== alert.key), { key: alert.key, reason: event.target.value }] })} /></label>}</article> })}</details>}
      <fieldset disabled={busy} className="prod-edit-fieldset"><Organizer event={selected.event} plan={draft} onChange={setDraft} collaborators={data.collaborators} assets={data.assets} contexts={contexts} journal={journal} userId={userId} onCreateAsset={async input => { const asset = await createAsset(input); setData(current => current ? { ...current, assets: [...current.assets, asset] } : current); return asset }} /></fieldset>
    </>}
  </main>
}
