import { useState, type ReactNode } from 'react'
import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { ChecklistItem, EquipmentAsset, ProductionContext, ProductionPlan, StaffAssignment } from './model'
import { balance, costTotal, operationalUtility } from './rules'
import { collaboratorMessage, exportProductionPdf, productionDate, whatsappLink } from './exports'
import { automaticActivities, simpleChecklist, staffPeriod, suggestSimpleStaff } from './simpleWorkflow'
import { contractUrl } from './contractDocument'
import './simple.css'

interface OrganizerProps {
  event: CrmEvent
  plan: ProductionPlan
  onChange: (plan: ProductionPlan) => void
  collaborators: CrmCollaborator[]
  assets: EquipmentAsset[]
  contexts: ProductionContext[]
  userId: string
}
const sections = ['Personal', 'Checklist', 'Resumen del evento']
const roles = ['DJ', 'Animador', 'Animadora', 'Responsable de Glitter', 'Maquilladora', 'Asistente de producción', 'Personal de instalación', 'Conductor', 'Responsable de desmontaje', 'Supervisor']
const id = () => crypto.randomUUID()
const amount = (value: unknown) => `S/ ${Number(value || 0).toFixed(2)}`
const confirmation = (value: StaffAssignment['confirmation']) => value === 'confirmed' ? 'Confirmado' : value === 'declined' ? 'No disponible' : 'Por confirmar'
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="prod-field"><span>{label}</span>{children}</label> }
function updateRow<T extends { id: string }>(rows: T[], rowId: string, patch: Partial<T>): T[] { return rows.map(row => row.id === rowId ? { ...row, ...patch } : row) }

export function Organizer({ event, plan, onChange, collaborators, assets, contexts, userId }: OrganizerProps) {
  const [section, setSection] = useState(1)
  const [selectedPerson, setSelectedPerson] = useState('')
  const [message, setMessage] = useState('')
  const set = <K extends keyof ProductionPlan>(key: K, value: ProductionPlan[K]) => onChange({ ...plan, [key]: value })
  const tasks = simpleChecklist(event, plan)
  const completed = tasks.filter(task => task.done).length
  const pdf = contractUrl(event.drive_pdf_url)
  const people = (personId: string) => collaborators.find(person => person.id === personId)
  const schedule = automaticActivities(event)
  const additionalPayments = plan.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const staffingCosts = plan.staff.reduce((sum, member) => sum + Number(member.fee || 0), 0)
  const updateStaff = (assignment: StaffAssignment, patch: Partial<StaffAssignment>) => set('staff', updateRow(plan.staff, assignment.id, patch))
  const toggleTask = (task: ChecklistItem, done: boolean) => {
    const updated = { ...task, done, completedBy: done ? userId : undefined, completedAt: done ? new Date().toISOString() : undefined }
    set('checklist', [...plan.checklist.filter(item => item.id !== task.id), updated])
  }
  const addPerson = () => {
    const person = people(selectedPerson)
    if (!person) return
    const period = staffPeriod(event, person.rol)
    const assignment: StaffAssignment = { id: id(), collaboratorId: person.id, role: person.rol || 'Asistente de producción', arrival: period.start, start: period.start, end: period.end, confirmation: 'pending', notes: '', fee: 0, transferMinutes: plan.logistics.transferMinutes || 45 }
    set('staff', [...plan.staff, assignment]); setSelectedPerson('')
  }
  const exportPdf = (staffOnly: boolean, collaboratorId?: string) => {
    try { exportProductionPdf([{ event, plan }], collaborators, assets, staffOnly, collaboratorId) }
    catch { setMessage('No se pudo generar el PDF. Inténtalo nuevamente.') }
  }
  const downloadContract = async () => {
    if (!pdf) return
    try {
      const response = await fetch(pdf.original, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw new Error('No disponible')
      const blob = await response.blob()
      if (!blob.type.includes('pdf')) throw new Error('No es un PDF directo')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `contrato_original_${event.fecha_evento}.pdf`; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch { setMessage('Abre el contrato original y usa la descarga del proveedor. Puede solicitar acceso.') }
  }

  return <div className="prod-organizer prod-simple">
    <nav className="prod-tabs" aria-label="Secciones del organizador">{sections.map((label, index) => <button key={label} type="button" className={section === index ? 'active' : undefined} aria-current={section === index ? 'page' : undefined} onClick={() => { setSection(index); setMessage('') }}>{label}</button>)}</nav>
    {message && <p className="prod-note" role="status">{message}</p>}
    <section className="prod-section" aria-label={sections[section]}>
      <div className="prod-section-heading"><h2>{section === 1 ? 'Checklist de salida' : sections[section]}</h2>{section === 1 && <span className="prod-simple-count">{completed} de {tasks.length} completados</span>}</div>

      {section === 0 && <>
        <div className="prod-simple-add-person"><Field label="Colaborador"><select aria-label="Colaborador" value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)}><option value="">Selecciona una persona</option>{collaborators.filter(person => person.activo).map(person => <option key={person.id} value={person.id}>{person.nombre} · {person.rol}</option>)}</select></Field><button type="button" disabled={!selectedPerson} onClick={addPerson}>Agregar al evento</button><button type="button" onClick={() => { const result = suggestSimpleStaff(event, plan, collaborators, contexts); onChange(result.plan); setMessage(`${result.staffAdded ? `${result.staffAdded} funciones sugeridas. Confirma con tu equipo.` : 'No se añadieron nuevas funciones.'}${result.warnings.length ? `\n${result.warnings.join('\n')}` : ''}`) }}>Sugerir personal</button></div>
        <p className="prod-muted">Los horarios se toman del contrato. Puedes ajustarlos para cada función.</p>
        {plan.staff.length ? <div className="prod-simple-team">{plan.staff.map(assignment => {
          const person = people(assignment.collaboratorId)
          const whatsapp = person ? whatsappLink(person, collaboratorMessage(event, plan, person)) : null
          return <article key={assignment.id} className="prod-resource-card">
            <div className="prod-row-heading"><div><h3>{person?.nombre || 'Colaborador no disponible'}</h3>{person?.telefono && <small>{person.telefono}</small>}</div><button type="button" className="prod-simple-remove" onClick={() => set('staff', plan.staff.filter(member => member.id !== assignment.id))}>Quitar</button></div>
            <div className="prod-simple-staff-fields"><Field label="Función"><input value={assignment.role} list="production-simple-roles" onChange={e => { const period = staffPeriod(event, e.target.value); updateStaff(assignment, { role: e.target.value, ...(!assignment.start ? { start: period.start, arrival: assignment.arrival || period.start } : {}), ...(!assignment.end ? { end: period.end } : {}) }) }} /></Field><Field label="Inicio"><input type="datetime-local" value={assignment.start} onChange={e => updateStaff(assignment, { start: e.target.value, ...(!assignment.arrival || assignment.arrival === assignment.start ? { arrival: e.target.value } : {}) })} /></Field><Field label="Salida"><input type="datetime-local" value={assignment.end} onChange={e => updateStaff(assignment, { end: e.target.value })} /></Field><Field label="Confirmación"><select aria-label="Confirmación" value={assignment.confirmation} onChange={e => updateStaff(assignment, { confirmation: e.target.value as StaffAssignment['confirmation'] })}><option value="pending">Por confirmar</option><option value="confirmed">Confirmado</option><option value="declined">No disponible</option></select></Field></div>
            <details className="prod-simple-optional"><summary>Honorarios y detalles opcionales</summary><div className="prod-grid"><Field label="Honorarios (S/)"><input type="number" min="0" step="0.01" value={assignment.fee} onChange={e => updateStaff(assignment, { fee: Math.max(0, Number(e.target.value)) })} /></Field><Field label="Llegada"><input type="datetime-local" value={assignment.arrival} onChange={e => updateStaff(assignment, { arrival: e.target.value })} /></Field><Field label="Traslado entre eventos (minutos)"><input type="number" min="0" value={assignment.transferMinutes} onChange={e => updateStaff(assignment, { transferMinutes: Math.max(0, Number(e.target.value)) })} /></Field><Field label="Observación interna"><input value={assignment.notes} onChange={e => updateStaff(assignment, { notes: e.target.value })} /></Field></div></details>
            <div className="prod-actions">{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">Preparar WhatsApp</a>}<button type="button" onClick={() => exportPdf(true, assignment.collaboratorId)}>Hoja de trabajo</button></div>
          </article>
        })}</div> : <p className="prod-empty">Selecciona a tu equipo o pulsa Sugerir personal.</p>}
        <datalist id="production-simple-roles">{roles.map(role => <option key={role} value={role} />)}</datalist>
      </>}

      {section === 1 && <>
        <p className="prod-muted">Se prepara automáticamente con tu paquete y los adicionales registrados.</p>
        <progress className="prod-simple-check-progress" aria-label="Avance del checklist" max={tasks.length || 1} value={completed} />
        {(['package', 'extras'] as const).map(group => {
          const groupTasks = tasks.filter(task => task.id.startsWith('simple-extra-') === (group === 'extras'))
          if (!groupTasks.length) return null
          return <section className="prod-check-stage" key={group}><h3>{group === 'extras' ? 'Adicionales del CRM' : 'Preparar para llevar'} <small>{groupTasks.filter(task => task.done).length}/{groupTasks.length}</small></h3>{groupTasks.map(task => <label className={`prod-check ${task.done ? 'prod-simple-done' : ''}`} key={task.id}><input type="checkbox" checked={task.done} onChange={e => toggleTask(task, e.target.checked)} /><span>{task.label}{task.done && <small title={`Usuario ${task.completedBy || userId}`}>Completado · {productionDate(task.completedAt || '')}</small>}</span></label>)}</section>
        })}
      </>}

      {section === 2 && <>
        <dl className="prod-summary"><div><dt>Cliente</dt><dd>{event.cliente}</dd></div><div><dt>Protagonista</dt><dd>{event.agasajado || 'No registrado'}</dd></div><div><dt>Fecha y horario</dt><dd>{productionDate(event.fecha_evento)} · {event.hora_inicio} – {event.hora_fin || 'Por confirmar'}</dd></div><div><dt>Teléfono</dt><dd>{event.telefono || 'No registrado'}</dd></div><div><dt>Dirección</dt><dd>{event.direccion || 'Por confirmar'} · {event.lugar || 'Distrito por confirmar'}</dd></div><div><dt>Invitados</dt><dd>{event.invitados ?? 'No registrado'}{event.edad ? ` · ${event.edad} años` : ''}</dd></div>{event.referencia && <div><dt>Referencia</dt><dd>{event.referencia}</dd></div>}<div><dt>Reserva / pago</dt><dd>{event.estado_pago}</dd></div></dl>
        <section className="prod-simple-summary-block"><h3>Contrato</h3><dl className="prod-simple-contract"><dt>Paquete contratado</dt><dd>{event.paquete}</dd><dt>Servicios y condiciones</dt><dd className="prod-preserve">{event.detalle_servicio || 'Sin detalle de servicio registrado.'}</dd>{event.juegos_elegidos && <><dt>Juegos y dinámicas</dt><dd className="prod-preserve">{event.juegos_elegidos}</dd></>}{event.adicionales_requerimientos && <><dt>Adicionales y requerimientos</dt><dd className="prod-preserve">{event.adicionales_requerimientos}</dd></>}{event.adicionales?.trim() && <><dt>Adicionales registrados</dt><dd className="prod-preserve">{event.adicionales}</dd></>}{event.movilidad?.trim() && <><dt>Movilidad registrada</dt><dd>{event.movilidad}</dd></>}{(event.dni_ruc || event.dni) && <><dt>Documento del contratante</dt><dd>{event.dni_ruc || event.dni}</dd></>}{event.tematica_invitacion && <><dt>Temática</dt><dd>{event.tematica_invitacion}</dd></>}{event.cancion_invitacion && <><dt>Canción para la invitación</dt><dd>{event.cancion_invitacion}</dd></>}</dl>
          {pdf ? <><div className="prod-actions"><a href={pdf.original} target="_blank" rel="noopener noreferrer">Abrir contrato original ↗</a><button type="button" onClick={() => void downloadContract()}>Descargar contrato</button></div><details className="prod-simple-optional"><summary>Ver PDF original aquí</summary><iframe title="Contrato original enlazado en el CRM" src={pdf.preview} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-downloads" /></details></> : <p className="prod-muted">{event.drive_pdf_url ? 'El enlace del contrato necesita revisión en el CRM.' : 'No hay PDF original enlazado. Arriba se muestra el contenido registrado en el CRM.'}</p>}
          {!!plan.agreements.length && <details className="prod-simple-optional"><summary>Acuerdos adicionales registrados</summary>{plan.agreements.map(agreement => <p key={agreement.id}><b>{productionDate(agreement.date)} · {agreement.responsible}</b><br />{agreement.note}</p>)}</details>}
        </section>
        <section className="prod-simple-summary-block"><h3>Cronograma del contrato</h3>{schedule.length ? <><div className="prod-table-wrap"><table className="prod-table"><thead><tr><th>Actividad</th><th>Inicio</th><th>Fin</th></tr></thead><tbody>{schedule.map(activity => <tr key={activity.id}><td>{activity.name}</td><td>{productionDate(activity.start)}</td><td>{productionDate(activity.end)}</td></tr>)}</tbody></table></div><details className="prod-simple-optional"><summary>Texto original del cronograma</summary><p className="prod-preserve">{event.cronograma}</p></details></> : <p className="prod-preserve">{event.cronograma || 'El contrato todavía no tiene un cronograma registrado.'}</p>}<p className="prod-muted">Se toma automáticamente del CRM.</p></section>
        <section className="prod-simple-summary-block"><h3>Personal asignado</h3>{plan.staff.length ? <div className="prod-table-wrap"><table className="prod-table"><thead><tr><th>Colaborador</th><th>Función</th><th>Horario</th><th>Confirmación</th></tr></thead><tbody>{plan.staff.map(member => <tr key={member.id}><td>{people(member.collaboratorId)?.nombre || 'Colaborador no disponible'}</td><td>{member.role}</td><td>{productionDate(member.start)} – {productionDate(member.end)}</td><td>{confirmation(member.confirmation)}</td></tr>)}</tbody></table></div> : <p>El equipo aún está pendiente.</p>}</section>
        <section className="prod-simple-summary-block"><h3>Finanzas</h3><div className="prod-metrics"><div className="prod-metric"><span>Total contratado</span><strong>{amount(event.total)}</strong></div><div className="prod-metric"><span>Adelanto</span><strong>{amount(event.adelanto)}</strong></div><div className="prod-metric"><span>Saldo pendiente</span><strong>{amount(balance(event, plan))}</strong></div></div><div className="prod-simple-finance-line"><span>Costos de producción <b>{amount(costTotal(plan))}</b></span><span>Utilidad estimada <b>{amount(operationalUtility(event, plan))}</b></span></div>
          <details className="prod-simple-optional"><summary>Registrar pagos adicionales y gastos</summary><p className="prod-muted">Los pagos siguientes son adicionales al adelanto del CRM. Los honorarios del personal ya están incluidos en los costos.</p><h4>Pagos adicionales · {amount(additionalPayments)}</h4>{plan.payments.map(payment => <div className="prod-simple-money-row" key={payment.id}><Field label="Pago adicional (S/)"><input type="number" min="0" step="0.01" value={payment.amount} onChange={e => set('payments', updateRow(plan.payments, payment.id, { amount: Math.max(0, Number(e.target.value)) }))} /></Field><Field label="Fecha del pago"><input type="datetime-local" value={payment.date} onChange={e => set('payments', updateRow(plan.payments, payment.id, { date: e.target.value }))} /></Field><Field label="Referencia del pago"><input value={payment.note} onChange={e => set('payments', updateRow(plan.payments, payment.id, { note: e.target.value }))} /></Field><button type="button" aria-label="Quitar pago adicional" onClick={() => set('payments', plan.payments.filter(item => item.id !== payment.id))}>Quitar</button></div>)}<button type="button" onClick={() => set('payments', [...plan.payments, { id: id(), amount: 0, date: '', note: '' }])}>Añadir pago</button><h4>Gastos internos</h4><p className="prod-muted">Honorarios del equipo: {amount(staffingCosts)}</p>{plan.costs.map(cost => <div className="prod-simple-money-row" key={cost.id}><Field label="Concepto del gasto"><input value={cost.category} onChange={e => set('costs', updateRow(plan.costs, cost.id, { category: e.target.value }))} placeholder="Movilidad, materiales, otros…" /></Field><Field label="Detalle del gasto"><input value={cost.description} onChange={e => set('costs', updateRow(plan.costs, cost.id, { description: e.target.value }))} /></Field><Field label="Gasto (S/)"><input type="number" min="0" step="0.01" value={cost.amount} onChange={e => set('costs', updateRow(plan.costs, cost.id, { amount: Math.max(0, Number(e.target.value)) }))} /></Field><button type="button" aria-label="Quitar gasto" onClick={() => set('costs', plan.costs.filter(item => item.id !== cost.id))}>Quitar</button></div>)}<button type="button" onClick={() => set('costs', [...plan.costs, { id: id(), category: '', description: '', amount: 0 }])}>Añadir gasto</button></details>
        </section>
        {event.observaciones && <section className="prod-simple-summary-block"><h3>Observaciones</h3><p className="prod-preserve">{event.observaciones}</p></section>}
        <div className="prod-actions prod-simple-exports"><button type="button" onClick={() => exportPdf(false)}>Descargar resumen · PDF</button><button type="button" onClick={() => exportPdf(true)}>Hoja de trabajo del equipo</button></div>
      </>}
    </section>
  </div>
}
