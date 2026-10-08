import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useContractDraft } from '../hooks/useContractDraft'
import { downloadContract, shareContractToWhatsApp } from '../lib/shareContract'
import { CalendarDays, FileText, LoaderCircle, LogOut, MapPin, MessageCircle, Pencil, Phone, Save, Trash2, UserPlus, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppError } from '../components/AppError'
import { BrandLogo } from '../components/BrandLogo'
import { ToastStack } from '../components/ToastStack'
import { requireSupabase, supabase } from '../lib/supabase'
import type { CrmCollaborator, CrmEvent, ToastMessage } from '../types/domain'
import './CrmPage.css'
import { ClientCapture } from '../components/ClientCapture'

const packages: Record<string, { price: number; hours: number; detail: string }> = {
  'Just Dance & Karaoke Party': {
    price: 420,
    hours: 2,
    detail: '2 horas de fiesta con DJ en vivo, sonido profesional, proyector y ecran, 2 micrófonos inalámbricos, Just Dance, Karaoke y luces inteligentes. No incluye movilidad.',
  },
  'Chicoteca en casa': {
    price: 750,
    hours: 2,
    detail: '2 horas de animación con animador(a) y DJ. Incluye juegos y bailes guiados, luces tipo discoteca y neón, Just Dance o Karaoke, invitación virtual y mini hora loca con globos pencil, pulseras neón y accesorios LED. Movilidad incluida en zonas seleccionadas.',
  },
  'Experiencia Neón': {
    price: 950,
    hours: 3,
    detail: '3 horas de evento: 1 hora de estación Glitter y tatuajes neón + 2 horas de animación con animador(a). Incluye juegos modernos, mini hora loca, invitación virtual, globos pencil, pulseras neón, accesorios LED, DJ y sonido profesional, luces inteligentes y luz UV, proyector gigante para Karaoke y Just Dance, y máquina de humo o burbujas. Movilidad incluida.',
  },
  'Ultra Chicoteca LED': {
    price: 1290,
    hours: 3,
    detail: '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de Animación Chicoteca LED. Incluye pista LED de 3x2 metros, animador(a), Staff (Asistente), DJ, maquilladora, luces inteligentes y láser, proyección láser del nombre, proyector y ecran gigante para Just Dance y Karaoke, juegos de competencia según la edad y mini hora loca LED con globos pencil, pulseras neón, limbo, salta soga y burbujas. Movilidad incluida.',
  },
  'Ultra Chicoteca + Decoración': {
    price: 1590,
    hours: 4,
    detail: '4 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación + 1 hora adicional de DJ, distribuida en 30 minutos antes del evento y 30 minutos después del show. Incluye pista LED de 3x2 metros, animador(a), staff escénico, DJ y maquilladora, juegos exclusivos, proyector y ecran para Just Dance y Karaoke, mini hora loca LED con globos pencil, pulseras neón, limbo y salta soga. Incluye decoración temática base Neón/Glow con backing y cartel neón, 3 mesas acrílicas o cilindros decorativos y accesorios para torta y bocaditos. Movilidad incluida.',
  },
  Personalizado: {
    price: 0,
    hours: 3,
    detail: 'Servicio personalizado de acuerdo con las características y requerimientos del evento.',
  },
}

type FormState = Omit<CrmEvent, 'id' | 'created_at' | 'updated_at'>
const initial: FormState = { cliente: '', agasajado: '', tipo_evento: 'Cumpleaños', edad: null, invitados: null, telefono: '', fecha_evento: '', hora_inicio: '', hora_fin: '', lugar: '', direccion: '', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '', paquete: 'Personalizado', detalle_servicio: '', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '', estado_pago: 'Reservado', total: 0, adelanto: 0, saldo: 0, drive_pdf_url: null }
const money = (value: number) => `S/ ${Number(value || 0).toFixed(2)}`
function clientPhone(raw: string | null | undefined): string | null {
  const value = (raw || '').trim();
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^9\d{8}$/.test(digits)) return '51' + digits;
  if (/^51\d{9}$/.test(digits)) return digits;
  if ((value.startsWith('+') || value.startsWith('00')) && /^[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

const balanceOf = (total: number, adelanto: number) => Math.max(0, Number(total || 0) - Number(adelanto || 0))
const dateLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Sin fecha'
const addHours = (time: string, hours: number) => { if (!time) return ''; const [h, m] = time.split(':').map(Number); const minutes = (h * 60 + m + hours * 60) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
export function CrmPage() {
  const { form, setForm, editingId, setEditingId, draftReady, draftMessage, draftSnapshot, clearExportedDraft } = useContractDraft(initial)
  const [preparing, setPreparing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [prepared, setPrepared] = useState<{ blob: Blob; snapshot: string; client: string } | null>(null)
  const currentPdf = prepared?.snapshot === draftSnapshot ? prepared : null
  const [captureVersion, setCaptureVersion] = useState(0)
  const [ready, setReady] = useState(false); const [authenticated, setAuthenticated] = useState(false); const [events, setEvents] = useState<CrmEvent[]>([]); const [collaborators, setCollaborators] = useState<CrmCollaborator[]>([]);  const [history, setHistory] = useState(false); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [toasts, setToasts] = useState<ToastMessage[]>([]); const [teamEvent, setTeamEvent] = useState<CrmEvent | null>(null); const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]); const [addingCollaborator, setAddingCollaborator] = useState(false)
  const notify = (title: string, body?: string, kind: ToastMessage['kind'] = 'success') => { const item = { id: Date.now(), title, body, kind }; setToasts((all) => [...all, item]); window.setTimeout(() => setToasts((all) => all.filter((toast) => toast.id !== item.id)), 4200) }
  const load = async () => { const client = requireSupabase(); const { data, error: loadError } = await client.from('crm_events').select('*').order('fecha_evento').order('hora_inicio'); if (loadError) throw loadError; setEvents((data ?? []) as CrmEvent[]); const collaboratorsResult = await client.from('crm_collaborators').select('*').eq('activo', true).order('nombre'); if (!collaboratorsResult.error) setCollaborators((collaboratorsResult.data ?? []) as CrmCollaborator[]) }
  useEffect(() => { if (!supabase) { setReady(true); return }; void supabase.auth.getSession().then(async ({ data }) => { setAuthenticated(Boolean(data.session)); if (data.session) try { await load() } catch (caught) { setError(caught instanceof Error ? `${caught.message}` : 'No se pudo cargar el CRM.') }; setReady(true) }); const { data: listener } = supabase.auth.onAuthStateChange((_type, session) => setAuthenticated(Boolean(session))); return () => listener.subscription.unsubscribe() }, [])
  const visible = useMemo(() => { const today = new Date(); today.setHours(0, 0, 0, 0); return events.filter((item) => { const text = [item.cliente, item.agasajado, item.paquete, item.lugar, item.direccion].join(' ').toLowerCase(); return (!query || text.includes(query.toLowerCase())) && (!status || item.estado_pago === status) && (history || new Date(`${item.fecha_evento}T12:00:00`) >= today) }) }, [events, query, status, history])
  const update = (key: keyof FormState, value: string | number | null) => setForm((current) => { const next = { ...current, [key]: value } as FormState; if (key === 'total' || key === 'adelanto') next.saldo = balanceOf(Number(next.total), Number(next.adelanto)); return next })
  const clear = () => { setForm(initial); setEditingId(null); setCaptureVersion(v => v + 1) }
  const missingContractFields = () => { const fields: string[] = []; if (!form.cliente.trim()) fields.push('nombre del contratante'); if (!form.telefono.trim()) fields.push('teléfono'); if (!form.direccion.trim()) fields.push('dirección exacta'); if (!form.lugar.trim()) fields.push('distrito'); if (!form.fecha_evento) fields.push('fecha'); if (!form.hora_inicio) fields.push('hora'); return fields }
  const saveSmart = async (event: FormEvent) => { event.preventDefault(); const missing = missingContractFields(); if (missing.length || form.total <= 0 || form.adelanto > form.total) return notify('Faltan datos para el contrato', missing.length ? missing.join(', ') : 'Revisa el total y el adelanto.', 'error'); setBusy(true); try { const { saldo: _saldo, ...payload } = form; void _saldo; const client = requireSupabase(); const result = editingId ? await client.from('crm_events').update(payload).eq('id', editingId).select('*').single() : await client.from('crm_events').insert(payload).select('*').single(); if (result.error) throw result.error; await load(); setEditingId((result.data as CrmEvent).id); setForm(result.data as CrmEvent); notify(editingId ? 'Reserva actualizada' : 'Reserva guardada') } catch (caught) { notify('No se pudo guardar', caught instanceof Error ? caught.message : 'Revisa los permisos de Supabase.', 'error') } finally { setBusy(false) } }
  const addCollaborator = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const nombre = String(data.get('nombre') || '').trim(); const rol = String(data.get('rol') || 'Staff').trim(); const telefono = String(data.get('telefono') || '').replace(/\D/g, ''); if (nombre.length < 2 || telefono.length < 9) return notify('Revisa el colaborador', 'Ingresa nombre y teléfono válido.', 'error'); const result = await requireSupabase().from('crm_collaborators').insert({ nombre, rol, telefono }).select('*').single(); if (result.error) return notify('No se pudo agregar', result.error.message, 'error'); setCollaborators((current) => [...current, result.data as CrmCollaborator].sort((a, b) => a.nombre.localeCompare(b.nombre))); setAddingCollaborator(false); notify('Colaborador agregado', `${nombre} ya aparece para formar equipo.`) }
  const teamMessage = (item: CrmEvent) => [`*MR FIESTA - DETALLES DEL SHOW*`, `Cliente: ${item.cliente}`, item.agasajado ? `Agasajado: ${item.agasajado}${item.edad ? ` (${item.edad} años)` : ''}` : '', `Fecha: ${dateLabel(item.fecha_evento)}`, `Horario: ${item.hora_inicio} - ${item.hora_fin || 'por confirmar'}`, `Paquete: ${item.paquete}`, `Ubicación: ${item.lugar} - ${item.direccion}`, item.juegos_elegidos ? `Juegos: ${item.juegos_elegidos}` : '', item.cronograma ? `Cronograma: ${item.cronograma}` : '', item.adicionales_requerimientos ? `Adicionales/requerimientos: ${item.adicionales_requerimientos}` : '', item.observaciones ? `Nota interna: ${item.observaciones}` : ''].filter(Boolean).join('\n')
  const sendTeam = () => { if (!teamEvent) return; const selected = collaborators.filter((item) => selectedCollaboratorIds.includes(item.id)); if (!selected.length) return notify('Selecciona el equipo', 'Marca al menos un colaborador.', 'error'); selected.forEach((person) => window.open(`https://wa.me/51${person.telefono.replace(/^51/, '')}?text=${encodeURIComponent(teamMessage(teamEvent))}`, '_blank', 'noopener,noreferrer')); setTeamEvent(null); notify('Equipo listo', `Abrí WhatsApp para ${selected.length} colaborador(es).`) }
  const print = async () => {
    const missing = missingContractFields()
    if (missing.length || !Number.isFinite(form.total) || !Number.isFinite(form.adelanto) || form.total <= 0 || form.adelanto < 0 || form.adelanto > form.total) {
      notify('Contrato incompleto', missing.length ? missing.join(', ') : 'Revisa el total y el adelanto.', 'error'); return
    }
    setPreparing(true)
    try {
      const { createContractPdf } = await import('../lib/contractPdf')
      // A saved event has a stable UUID reference. This is not a fiscal sequence.
      const reference = editingId ? 'MRF-' + editingId : 'BORRADOR - SIN RESERVA GUARDADA'
      const blob = await createContractPdf(form, reference)
      setPrepared({ blob, snapshot: draftSnapshot, client: form.cliente })
      notify('PDF listo', 'Puedes descargarlo o elegir WhatsApp en la hoja de compartir.')
    } catch (caught) { notify('No pude generar el PDF', caught instanceof Error ? caught.message : 'Intenta de nuevo.', 'error') }
    finally { setPreparing(false) }
  }
  const exportPdf = async (share: boolean) => {
    if (!currentPdf || sharing) return
    setSharing(true)
    try {
      const result = share ? await shareContractToWhatsApp(currentPdf.blob, currentPdf.client) : (downloadContract(currentPdf.blob, currentPdf.client), 'downloaded')
      if (result === 'cancelled') { notify('Compartir cancelado', 'Tu borrador sigue guardado.'); return }
      clearExportedDraft(currentPdf.snapshot)
      notify(result === 'shared' ? 'Archivo entregado a la aplicación' : 'Descarga iniciada', result === 'shared' ? 'Completa el envío en la aplicación elegida.' : 'Revisa las descargas de tu navegador.')
    } catch (caught) { notify('No se pudo compartir', caught instanceof Error ? caught.message : 'Puedes usar Descargar PDF.', 'error') }
    finally { setSharing(false) }
  }
  const whatsapp = () => { const text = `¡Hola ${form.cliente}! 🎉\n\nReserva MR FIESTA\nPaquete: ${form.paquete}\nFecha: ${dateLabel(form.fecha_evento)}\nHora: ${form.hora_inicio}\nLugar: ${form.lugar || '-'}\n\nTotal: ${money(form.total)}\nAdelanto: ${money(form.adelanto)}\nSaldo: ${money(balanceOf(Number(form.total), Number(form.adelanto)))}`; const phone = clientPhone(form.telefono); if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer') }
  if (!ready || !draftReady) return <main className="loading-screen"><LoaderCircle className="spin" /></main>; if (!supabase) return <AppError />; if (!authenticated) return <Login />; if (error) return <AppError message={error} />
  return (
    <main className="crm-shell">
      <ToastStack messages={toasts} />
      <header className="crm-header"><Link to="/admin" className="admin-brand"><BrandLogo className="admin-logo" /><span>CRM · MR FIESTA</span></Link><div><Link className="crm-nav" to="/admin">LIVE CONTROL</Link><button className="crm-nav-button" onClick={() => void requireSupabase().auth.signOut()}><LogOut size={15} /> Salir</button></div></header>
      <section className="crm-hero"><div className="crm-overview-head"><div><span className="eyebrow">PANEL GENERAL</span><h1>Control de <em>reservas.</em></h1><p>Resumen automático de tus contratos y shows sincronizados.</p></div><div className="crm-status-chips"><span className="reserved">● {events.filter((item) => item.estado_pago === 'Reservado').length} Reservado</span><span className="paid">● {events.filter((item) => item.estado_pago === 'Pagado').length} Pagado</span><span className="pending">● {events.filter((item) => item.estado_pago === 'Pendiente').length} Pendiente</span></div></div><div className="crm-kpi"><article className="crm-metric"><span>Eventos registrados</span><strong>{events.length}</strong></article><article className="crm-metric"><span>Total facturado</span><strong>{money(events.reduce((sum, item) => sum + Number(item.total || 0), 0))}</strong></article><article className="crm-metric"><span>Total adelantado</span><strong>{money(events.reduce((sum, item) => sum + Number(item.adelanto || 0), 0))}</strong></article><article className="crm-metric crm-metric-accent"><span>Saldo pendiente</span><strong>{money(events.reduce((sum, item) => sum + balanceOf(Number(item.total), Number(item.adelanto)), 0))}</strong></article></div></section>
      <section className="crm-layout">
        <form className="crm-form" onInvalidCapture={event => { const field = event.target as HTMLElement; field.closest('details')?.setAttribute('open', ''); }} onSubmit={saveSmart}>
          <div className="crm-title"><div><span className="eyebrow">{editingId ? 'EDITANDO RESERVA' : 'NUEVA RESERVA'}</span><h2>Diseña el show</h2></div>{editingId && <button type="button" className="crm-small" onClick={clear}><X size={14} /> Nueva</button>}</div>
          <p className="crm-draft-status" role="status">{draftMessage}</p>
          <details className="crm-step" open><summary>1. Datos del cliente</summary>
          <ClientCapture key={(editingId || 'new') + ':' + captureVersion} current={form} onApply={(values, additionalPhones) => {
            setForm(current => {
              const next = { ...current, ...values } as FormState
              if (values.hora_inicio && !current.hora_fin) next.hora_fin = addHours(String(values.hora_inicio), packages[current.paquete]?.hours ?? 3)
              if (additionalPhones.length) {
                const note = 'Teléfonos adicionales: ' + additionalPhones.join(' / ')
                if (!current.observaciones.includes(note)) next.observaciones = [current.observaciones, note].filter(Boolean).join('\n')
              }
              return next
            })
            notify('Datos aplicados', 'Revisa el formulario y pulsa Guardar cuando esté listo.')
          }} />
          <div className="crm-grid two">
            <Field label="Nombre del contratante"><input autoComplete="name" value={form.cliente} onChange={e => update('cliente', e.target.value)} required /></Field>
            <Field label="Teléfono"><input type="tel" inputMode="tel" autoComplete="tel" value={form.telefono} onChange={e => update('telefono', e.target.value)} required /></Field>
            <Field label="DNI/RUC (opcional)"><input inputMode="numeric" value={form.dni_ruc} onChange={e => update('dni_ruc', e.target.value)} /></Field>
            <Field label="Distrito / zona"><input value={form.lugar} onChange={e => update('lugar', e.target.value)} required /></Field>
            <Field label="Dirección exacta del evento"><input autoComplete="street-address" value={form.direccion} onChange={e => update('direccion', e.target.value)} required /></Field>
            <Field label="Referencia de dirección"><input value={form.referencia} onChange={e => update('referencia', e.target.value)} /></Field>
          </div></details>
          <details className="crm-step" open><summary>2. Detalles del evento</summary>
          <div className="crm-grid two">
            <Field label="Nombre del agasajado/a"><input value={form.agasajado} onChange={e => update('agasajado', e.target.value)} /></Field>
            <Field label="Edad"><input type="number" inputMode="numeric" min="1" max="99" value={form.edad ?? ''} onChange={e => update('edad', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Invitados"><input type="number" inputMode="numeric" min="1" value={form.invitados ?? ''} onChange={e => update('invitados', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Tipo"><select value={form.tipo_evento} onChange={e => update('tipo_evento', e.target.value)}>{['Cumpleaños','Quinceañero','Promoción','Baby Shower','Evento personalizado'].map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Fecha"><input type="date" value={form.fecha_evento} onChange={e => update('fecha_evento', e.target.value)} required /></Field>
            <Field label="Inicio"><input type="time" value={form.hora_inicio} onChange={e => { update('hora_inicio', e.target.value); if (!form.hora_fin) update('hora_fin', addHours(e.target.value, packages[form.paquete]?.hours ?? 3)) }} required /></Field>
            <Field label="Fin"><input type="time" value={form.hora_fin} onChange={e => update('hora_fin', e.target.value)} /></Field>
            <Field label="Canción para la invitación"><input value={form.cancion_invitacion} onChange={e => update('cancion_invitacion', e.target.value)} /></Field>
            <Field label="Temática para la invitación"><input value={form.tematica_invitacion} onChange={e => update('tematica_invitacion', e.target.value)} /></Field>
          </div>
          <Field label="Paquete"><select value={form.paquete} onChange={(e) => { const value = e.target.value; update('paquete', value); update('detalle_servicio', packages[value].detail); if (packages[value].price) update('total', packages[value].price); if (!form.hora_fin) update('hora_fin', addHours(form.hora_inicio, packages[value].hours)) }}>{Object.keys(packages).map((item) => <option key={item}>{item}</option>)}</select></Field>
          <section className="crm-experience-panel"><span className="crm-panel-kicker">EXPERIENCIA DEL EVENTO</span><Field label="Detalle del servicio"><textarea value={form.detalle_servicio} onChange={(e) => update('detalle_servicio', e.target.value)} /></Field><Field label="Juegos elegidos"><textarea value={form.juegos_elegidos} onChange={(e) => update('juegos_elegidos', e.target.value)} placeholder="Ej.: Just Dance, Preguntados, Canta y Gana" /></Field><Field label="Cronograma del evento"><textarea value={form.cronograma} onChange={(e) => update('cronograma', e.target.value)} placeholder="Instalación 5:00 pm, Estación Glitter 6:00 pm a 7:00 pm, Show 7:00 pm a 9:00 pm" /></Field><div className="crm-grid two"><Field label="Adicionales / requerimientos"><textarea value={form.adicionales_requerimientos} onChange={(e) => update('adicionales_requerimientos', e.target.value)} placeholder="Ej.: glitter, tatuajes neón, acceso por escalera, 2 personajes" /></Field><Field label="Observaciones internas"><textarea value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} placeholder="Notas solo para el equipo MR FIESTA" /></Field></div></section>
          </details>
          <details className="crm-step" open><summary>3. Cotización y pagos</summary>
          <div className="crm-grid three"><Field label="Estado de pago"><select value={form.estado_pago} onChange={(e) => update('estado_pago', e.target.value)}><option>Reservado</option><option>Pendiente</option><option>Pagado</option></select></Field><Field label="Total S/"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.total} onChange={(e) => update('total', Number(e.target.value))} required /></Field><Field label="Adelanto S/"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.adelanto} onChange={(e) => update('adelanto', Number(e.target.value))} /></Field></div>
          <div className="crm-balance">Saldo pendiente <strong>{money(balanceOf(Number(form.total), Number(form.adelanto)))}</strong></div></details><div className="crm-actions"><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save size={16} />} {editingId ? 'Actualizar' : 'Guardar'}</button><button type="button" className="crm-action" disabled={preparing || busy || sharing} onClick={print}>{preparing ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} {preparing ? 'Preparando PDF…' : 'Preparar PDF'}</button><button type="button" className="crm-action" onClick={whatsapp}><MessageCircle size={16} /> WhatsApp</button></div>
          {currentPdf && <div className="crm-export-panel" role="region" aria-label="PDF listo"><p>PDF listo. Elige WhatsApp en la hoja de compartir de tu celular.</p><div className="crm-actions"><button type="button" className="primary-button" disabled={sharing} onClick={() => void exportPdf(true)}>Compartir PDF</button><button type="button" className="crm-action" disabled={sharing} onClick={() => void exportPdf(false)}>Descargar PDF</button></div></div>}
        </form>
        <aside className="crm-agenda"><div className="crm-title"><div><span className="eyebrow">AGENDA</span><h2>{history ? 'Historial completo' : 'Próximos shows'}</h2></div><div className="crm-agenda-actions"><button type="button" className="crm-small" onClick={() => setAddingCollaborator(true)}><UserPlus size={13} /> Colaborador</button><button type="button" className="crm-small" onClick={() => setHistory((value) => !value)}>{history ? 'Ver próximos' : 'Ver historial'}</button></div></div><div className="crm-filters"><input placeholder="Buscar cliente, paquete o distrito" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos los pagos</option><option>Reservado</option><option>Pendiente</option><option>Pagado</option></select></div>{visible.length ? visible.map((item) => <article className="crm-card" key={item.id}><div className="crm-card-top"><span className={`crm-status ${item.estado_pago.toLowerCase()}`}>{item.estado_pago}</span><span>{dateLabel(item.fecha_evento)}</span></div><h3>{item.cliente}</h3><p><CalendarDays size={13} /> {item.hora_inicio} - {item.hora_fin || '—'} · {item.paquete}</p><p><MapPin size={13} /> {item.lugar || 'Sin distrito'} · {item.direccion || 'Sin dirección'}</p><div className="crm-card-money">Total {money(item.total)} <b>Saldo {money(balanceOf(Number(item.total), Number(item.adelanto)))}</b></div><div className="crm-card-buttons"><button type="button" className="crm-contact-whatsapp" disabled={!clientPhone(item.telefono)} title={clientPhone(item.telefono) ? 'Abrir WhatsApp: ' + item.telefono : 'Agrega un teléfono válido a la reserva'} onClick={() => { const phone = clientPhone(item.telefono); if (phone) window.open('https://wa.me/' + phone, '_blank', 'noopener,noreferrer') }}><MessageCircle size={13} /> WhatsApp</button><button type="button" className="crm-contact-call" disabled={!clientPhone(item.telefono)} title={clientPhone(item.telefono) ? 'Llamar: ' + item.telefono : 'Agrega un teléfono válido a la reserva'} onClick={() => { const phone = clientPhone(item.telefono); if (phone) window.location.href = 'tel:+' + phone }}><Phone size={13} /> Llamar</button><button type="button" onClick={() => { const { id, created_at, updated_at, ...values } = item; void created_at; void updated_at; setForm(values); setEditingId(id) }}><Pencil size={13} /> Editar</button><button type="button" className="crm-team-button" onClick={() => { setTeamEvent(item); setSelectedCollaboratorIds([]) }}><Users size={13} /> Equipo</button><button type="button" onClick={() => { if (window.confirm('¿Eliminar esta reserva?')) void requireSupabase().from('crm_events').delete().eq('id', item.id).then(() => { setEvents((all) => all.filter((entry) => entry.id !== item.id)); notify('Reserva eliminada') }) }}><Trash2 size={13} /> Eliminar</button></div></article>) : <div className="crm-empty">No hay reservas para este filtro.</div>}</aside>
      </section>
      {addingCollaborator && <div className="crm-modal-backdrop"><section className="crm-modal"><button type="button" className="crm-modal-close" onClick={() => setAddingCollaborator(false)}><X size={18} /></button><span className="eyebrow">NUEVO COLABORADOR</span><h2>Agrega a tu equipo.</h2><p>Quedará disponible para enviarle el detalle de cualquier show por WhatsApp.</p><form onSubmit={addCollaborator}><Field label="Nombre"><input name="nombre" required placeholder="Ej.: María José" /></Field><Field label="Rol"><input name="rol" defaultValue="Staff" placeholder="Ej.: Animadora, DJ, asistente" /></Field><Field label="WhatsApp"><input name="telefono" required inputMode="numeric" placeholder="Ej.: 940758037" /></Field><button className="primary-button">Guardar colaborador</button></form></section></div>}
      {teamEvent && <div className="crm-modal-backdrop"><section className="crm-modal crm-team-modal"><button type="button" className="crm-modal-close" onClick={() => setTeamEvent(null)}><X size={18} /></button><span className="eyebrow">EQUIPO DEL SHOW</span><h2>{teamEvent.cliente}</h2><p>Selecciona quién recibirá el detalle completo del evento.</p><div className="crm-team-tools"><button type="button" onClick={() => setSelectedCollaboratorIds(collaborators.map((item) => item.id))}>Seleccionar todos</button><button type="button" onClick={() => setSelectedCollaboratorIds([])}>Limpiar</button></div><div className="crm-collaborator-list">{collaborators.length ? collaborators.map((person) => <label key={person.id} className="crm-collaborator"><input type="checkbox" checked={selectedCollaboratorIds.includes(person.id)} onChange={() => setSelectedCollaboratorIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /><span><b>{person.nombre}</b><small>{person.rol} · {person.telefono}</small></span></label>) : <div className="crm-empty">Aún no tienes colaboradores. Agrégalos desde Agenda.</div>}</div><button type="button" className="primary-button" onClick={sendTeam}><MessageCircle size={16} /> Enviar detalle por WhatsApp</button></section></div>}
    </main>
  )
}

function Login() { const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const { error } = await requireSupabase().auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) }); if (error) setMessage('No pudimos iniciar sesión. Revisa tus credenciales.'); setBusy(false) }; return <main className="admin-login"><div className="login-card"><BrandLogo className="login-logo" /><span className="eyebrow">CRM MR FIESTA</span><h1>Entrar al CRM</h1><p>Acceso reservado para administración.</p><form onSubmit={submit}><label>Email<input name="email" type="email" required /></label><label>Contraseña<input name="password" type="password" required /></label>{message && <p className="form-error">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : 'Entrar'}</button></form></div></main> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="crm-field">{label}{children}</label> }
