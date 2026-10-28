import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { supabase } from '../lib/supabase'
import { createAsset, isProductionAdmin, loadAssets, loadJournal, loadProduction, savePlan, updateAsset } from './api'
import type { EquipmentAsset, JournalEntry, ProductionPlan, ProductionStatus } from './model'
import { productionStatuses } from './model'
import { mergeSimpleChecklist, simpleReadiness } from './simpleWorkflow'
import { autoPlan } from './autoplan'
import { newPlan } from './rules'
import { agendaFingerprint, applyAgendaEdit } from './agenda'
import type { AgendaActivity, AgendaEdit } from './agenda'
import { ProductionCenter } from './ProductionCenter'
import './production.css'

const AdvancedProduction = lazy(() => import('./AdvancedProduction').then(module => ({ default: module.AdvancedProduction })))
type Dataset = Awaited<ReturnType<typeof loadProduction>>
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación. Revisa la conexión y los permisos.'
const crmHref = `${import.meta.env.BASE_URL}${import.meta.env.VITE_ROUTER === 'hash' ? '#/' : ''}crm`

export function ProductionPage() {
  const { eventId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const advanced = params.get('advanced') === '1'
  const [userId, setUserId] = useState<string | null | undefined>()
  const [data, setData] = useState<Dataset>()
  const dataRef = useRef<Dataset | undefined>(undefined)
  const [draft, setDraft] = useState<ProductionPlan>()
  const [baseline, setBaseline] = useState('')
  const [draftRevision, setDraftRevision] = useState(0)
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedError, setAdvancedError] = useState('')
  const [advancedAttempt, setAdvancedAttempt] = useState(0)
  const [denied, setDenied] = useState(false)
  const authVersion = useRef(0), readVersion = useRef(0), writeVersion = useRef(0), mutating = useRef(false)
  const assetVersion = useRef(0)
  const journalVersion = useRef(0)
  const activeIdRef = useRef<string | undefined>(undefined)
  const draftCache = useRef(new Map<string, { document: ProductionPlan; baseline: string; revision: number }>())
  const identity = useRef<string | null | undefined>(undefined)
  const dirty = !!draft && JSON.stringify(draft) !== baseline
  const hasData = !!data
  const activeId = advanced ? eventId || [...(data?.events ?? [])].sort((a, b) => b.fecha_evento.localeCompare(a.fecha_evento))[0]?.id : undefined
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    if (!supabase) { setUserId(null); return }
    const applyIdentity = (next: string | null) => {
      if (identity.current === next) return
      identity.current = next; authVersion.current++; readVersion.current++
      draftCache.current.clear()
      dataRef.current = undefined
      setData(undefined); setDraft(undefined); setJournal([]); setDenied(false); setError(''); setNotice(''); setAdvancedError(''); setSaving(false); setLoading(false); setAdvancedLoading(false)
      setUserId(next)
    }
    void supabase.auth.getSession().then(({ data: auth }) => { if (!authVersion.current) applyIdentity(auth.session?.user.id ?? null) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyIdentity(session?.user.id ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    const version = authVersion.current, request = ++readVersion.current, write = writeVersion.current
    setLoading(true); setError('')
    try {
      const admin = await isProductionAdmin()
      if (authVersion.current !== version || request !== readVersion.current) return
      if (!admin) { setDenied(true); dataRef.current = undefined; setData(undefined); return }
      const loaded = await loadProduction()
      if (authVersion.current !== version || request !== readVersion.current || write !== writeVersion.current) return
      const next = { ...loaded, assets: dataRef.current?.assets ?? [] }
      setDenied(false); dataRef.current = next; setData(next)
    } catch (caught) {
      if (authVersion.current === version && request === readVersion.current) setError(messageOf(caught))
      throw caught
    } finally { if (authVersion.current === version && request === readVersion.current) setLoading(false) }
  }, [])
  useEffect(() => { if (userId) void reload().catch(() => {}) }, [userId, reload])
  useEffect(() => {
    if (draft) draftCache.current.set(draft.eventId, { document: draft, baseline, revision: draftRevision })
  }, [draft, baseline, draftRevision])
  useEffect(() => {
    if (!advanced) { setDraft(undefined); return }
    const event = data?.events.find(item => item.id === activeId)
    if (!event) { setDraft(undefined); return }
    const record = data?.records.find(item => item.eventId === activeId)
    const cached = draftCache.current.get(event.id)
    if (cached && JSON.stringify(cached.document) !== cached.baseline) { setDraft(cached.document); setBaseline(cached.baseline); setDraftRevision(cached.revision); return }
    const document = mergeSimpleChecklist(event, record?.document ?? autoPlan(event))
    setDraft(structuredClone(document)); setBaseline(JSON.stringify(document)); setDraftRevision(record?.revision ?? 0)
  }, [advanced, activeId, data?.events, data?.records])
  useEffect(() => {
    if (!advanced || !userId || !activeId || !hasData) return
    const version = authVersion.current, assetsAtStart = assetVersion.current, historyRequest = ++journalVersion.current
    let cancelled = false
    setAdvancedLoading(true); setAdvancedError(''); setJournal([])
    void Promise.all([loadAssets(), loadJournal(activeId)]).then(([assets, history]) => {
      if (cancelled || authVersion.current !== version) return
      if (assetsAtStart === assetVersion.current) setData(current => { if (!current) return current; const next = { ...current, assets }; dataRef.current = next; return next })
      if (historyRequest === journalVersion.current) setJournal(history)
    }).catch(caught => { if (!cancelled && authVersion.current === version) setAdvancedError(messageOf(caught)) })
      .finally(() => { if (!cancelled && authVersion.current === version) setAdvancedLoading(false) })
    return () => { cancelled = true }
  }, [advanced, activeId, userId, advancedAttempt, hasData])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const contexts = useMemo(() => data?.events.map(event => {
    const record = data.records.find(item => item.eventId === event.id)
    return { event, plan: advanced && event.id === activeId && draft ? draft : record?.document ?? newPlan(event), revision: record?.revision ?? 0 }
  }) ?? [], [data, advanced, draft, activeId])
  const selected = contexts.find(context => context.event.id === activeId)
  const analysis = selected ? simpleReadiness(selected.event, selected.plan, contexts) : { alerts: [], blocking: [] }

  const persist = async (id: string, document: ProductionPlan, expectedRevision: number) => {
    if (mutating.current) throw new Error('Hay otra operación guardándose. Espera un momento y vuelve a intentar.')
    if (!identity.current) throw new Error('Inicia sesión para guardar los cambios.')
    mutating.current = true; setSaving(true); setError(''); setNotice(''); writeVersion.current++
    const version = authVersion.current
    try {
      const record = await savePlan(id, document, expectedRevision)
      if (authVersion.current !== version) throw new Error('La sesión cambió. Vuelve a abrir el evento para comprobar su última revisión.')
      writeVersion.current++; readVersion.current++; setLoading(false)
      const current = dataRef.current
      if (!current) throw new Error('Vuelve a cargar la agenda para comprobar la revisión guardada.')
      draftCache.current.delete(id)
      const next = { ...current, records: [...current.records.filter(item => item.eventId !== id), record] }
      dataRef.current = next; setData(next); setNotice(`Guardado en Supabase · revisión ${record.revision}.`)
      return record
    } finally { mutating.current = false; if (authVersion.current === version) setSaving(false) }
  }
  const saveActivity = async (row: AgendaActivity, patch: AgendaEdit) => {
    const current = dataRef.current, event = current?.events.find(item => item.id === row.eventId)
    if (!current || !event) throw new Error('El evento ya no está disponible. Actualiza la agenda.')
    const record = current.records.find(item => item.eventId === row.eventId)
    if (row.revision !== undefined && row.revision !== (record?.revision ?? 0)) throw new Error('La agenda cambió mientras editabas. Conserva el horario, cierra el editor y abre su versión actual antes de guardar.')
    await persist(event.id, applyAgendaEdit(event, record?.document ?? newPlan(event), row, patch), record?.revision ?? 0)
  }
  const rememberShare = async (ids: string[], _channel: 'whatsapp' | 'pdf', fingerprints?: Record<string, string>) => {
    for (const id of [...new Set(ids)]) {
      const current = dataRef.current, event = current?.events.find(item => item.id === id)
      if (!event || !current) continue
      const record = current.records.find(item => item.eventId === id), document = structuredClone(record?.document ?? newPlan(event))
      const share = { id: crypto.randomUUID(), scope: ids.length > 1 ? 'day' as const : 'event' as const, at: new Date().toISOString(), fingerprint: fingerprints?.[id] ?? agendaFingerprint(event, document, current.collaborators) }
      document.agendaShares = [...(document.agendaShares ?? []).slice(-19), share]
      await persist(id, document, record?.revision ?? 0)
    }
  }
  const saveAdvanced = async () => {
    if (!activeId || !draft || !data) return
    if (['ready', 'setup', 'live', 'finished', 'closed'].includes(draft.status) && analysis.blocking.length) { setError('Completa el checklist de salida y confirma al personal para marcar el evento listo. Puedes guardar el avance en planificación.'); return }
    const version = authVersion.current, id = activeId
    try {
      await persist(id, draft, draftRevision)
      const historyRequest = ++journalVersion.current
      const history = await loadJournal(id)
      if (authVersion.current === version && activeIdRef.current === id && historyRequest === journalVersion.current) setJournal(history)
    } catch (caught) { if (authVersion.current === version && activeIdRef.current === id) setError(messageOf(caught)) }
  }
  const changeAsset = async (input: Omit<EquipmentAsset, 'id'>, id?: string) => {
    const version = authVersion.current
    assetVersion.current++
    const asset = id ? await updateAsset(id, input) : await createAsset(input)
    if (authVersion.current !== version) throw new Error('La sesión cambió. Actualiza el inventario para comprobar el equipo.')
    assetVersion.current++
    setData(current => { if (!current) return current; const next = { ...current, assets: [...current.assets.filter(item => item.id !== asset.id), asset] }; dataRef.current = next; return next })
    return asset
  }
  const navigateSafely = (url: string) => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Salir de administración y descartarlos?')) { if (draft) draftCache.current.delete(draft.eventId); navigate(url) } }
  const refreshAdvanced = () => {
    if (dirty && !window.confirm('¿Descartar los cambios y recargar desde Supabase?')) return
    if (draft) draftCache.current.delete(draft.eventId)
    setAdvancedAttempt(value => value + 1)
    void reload().catch(() => {})
  }

  if (!supabase) return <main className="production"><p role="alert">Falta la configuración de Supabase del CRM.</p><a href={crmHref}>Volver al CRM</a></main>
  if (userId === undefined) return <main className="loading-screen">Comprobando sesión…</main>
  if (!userId) return <main className="production prod-access"><BrandLogo /><h1>Centro de producción</h1><p>Inicia sesión con tu cuenta de administración del CRM. La sesión se comparte entre las pestañas de MR FIESTA.</p><a className="primary-button" href={crmHref}>Entrar desde el CRM</a></main>
  return <main className="production">
    <header className="prod-header"><a href={crmHref} className="prod-brand"><BrandLogo /><span>MR FIESTA <small>CENTRO DE PRODUCCIÓN</small></span></a><div className="prod-actions"><a href={crmHref}>Volver al CRM</a>{advanced && <button type="button" disabled={saving} onClick={() => navigateSafely(`/production${selected ? `?date=${selected.event.fecha_evento}` : ''}`)}>← Volver a la agenda</button>}</div></header>
    {error && <div role="alert" className="prod-banner prod-danger">{error}<button type="button" onClick={() => setError('')} aria-label="Cerrar error">×</button></div>}
    {denied ? <section className="prod-section"><h1>Acceso restringido</h1><p>Tu cuenta no tiene permisos de administración del CRM.</p></section> : !data ? <section className="prod-section"><h1>{loading ? 'Cargando producción…' : 'No se pudo cargar producción'}</h1><button onClick={() => void reload().catch(() => {})} disabled={loading}>Reintentar</button></section> : eventId && !data.events.some(item => item.id === eventId) ? <section className="prod-section"><h1>Evento no encontrado</h1><p>No existe o no tienes acceso a esta reserva.</p></section> : !advanced ? <ProductionCenter contexts={contexts} collaborators={data.collaborators} selectedEventId={eventId} onRefresh={reload} onSaveActivity={saveActivity} onOpenAdvanced={id => navigate(`/production${id ? `/${id}` : ''}?advanced=1`)} onShare={rememberShare} /> : <>
      <section className="prod-section"><span className="eyebrow">ADMINISTRACIÓN AVANZADA</span><h1>Preparación y control</h1><label>Evento en administración<select aria-label="Evento en administración" value={activeId ?? ''} disabled={saving} onChange={event => navigateSafely(`/production/${event.target.value}?advanced=1`)}>{[...data.events].sort((a, b) => b.fecha_evento.localeCompare(a.fecha_evento)).map(event => <option key={event.id} value={event.id}>{event.fecha_evento} · {event.agasajado || event.cliente} · {event.lugar}</option>)}</select></label><p>El inventario, los costos y los controles de preparación se gestionan aquí. La agenda se puede consultar en cualquier estado.</p></section>
      {!selected || !draft ? <p className="prod-empty">Selecciona una reserva para administrar su producción.</p> : <>
        <section className="prod-event-head"><div><h2>{selected.event.agasajado || selected.event.cliente}</h2><p>{selected.event.fecha_evento} · {selected.event.lugar} · {selected.event.paquete}</p><button type="button" disabled={saving} onClick={refreshAdvanced}>Actualizar datos</button></div><div className="prod-save-panel"><label>Estado de producción<select aria-label="Estado de producción" disabled={saving} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ProductionStatus })}>{Object.entries(productionStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-button" disabled={saving || (!dirty && !!data.records.find(item => item.eventId === activeId))} onClick={() => void saveAdvanced()}>{saving ? 'Guardando…' : 'Guardar producción'}</button><span role="status" aria-live="polite">{dirty ? 'Cambios sin guardar' : notice || 'Sin cambios pendientes'}</span></div></section>
        {!!analysis.alerts.length && <details className="prod-alerts"><summary>Controles de preparación · {analysis.blocking.length} pendientes</summary>{analysis.alerts.map(alert => { const exception = draft.exceptions.find(item => item.key === alert.key); return <article key={alert.key} className={`prod-alert ${alert.severity}`}><strong>{alert.message}</strong><p>{alert.fix}</p>{alert.canJustify && <label>Justificación de excepción<input disabled={saving} value={exception?.reason ?? ''} onChange={event => setDraft({ ...draft, exceptions: [...draft.exceptions.filter(item => item.key !== alert.key), { key: alert.key, reason: event.target.value }] })} /></label>}</article> })}</details>}
        {advancedError && <p role="alert" className="prod-danger">{advancedError} <button type="button" onClick={() => setAdvancedAttempt(value => value + 1)}>Reintentar inventario e historial</button></p>}
        {advancedLoading ? <p role="status">Cargando inventario e historial…</p> : <Suspense fallback={<p>Cargando administración…</p>}><fieldset disabled={saving} className="prod-edit-fieldset"><AdvancedProduction event={selected.event} plan={draft} onChange={setDraft} collaborators={data.collaborators} assets={data.assets} contexts={contexts} journal={journal} userId={userId} onCreateAsset={input => changeAsset(input)} onUpdateAsset={async (id, patch) => { const current = dataRef.current?.assets.find(item => item.id === id); if (!current) throw new Error('Equipo no encontrado. Actualiza el inventario.'); return changeAsset({ ...current, ...patch }, id) }} /></fieldset></Suspense>}
      </>}
    </>}
  </main>
}
