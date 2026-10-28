import { useEffect, useRef, useState } from 'react'
import type { CrmCollaborator } from '../types/domain'
import type { AgendaActivity, AgendaEdit } from './agenda'
import { productionDate } from './exports'

export function AgendaQuickEdit({ row, eventName, collaborators, onSave, onClose }: {
  row: AgendaActivity
  eventName: string
  collaborators: CrmCollaborator[]
  onSave: (row: AgendaActivity, patch: AgendaEdit) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(row.name)
  const [start, setStart] = useState(row.start)
  const [end, setEnd] = useState(row.end)
  const [responsibleIds, setResponsibleIds] = useState(row.responsibleIds)
  const [notes, setNotes] = useState(row.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>('input')?.focus() }, [])
  const close = () => { if (!busy) onClose() }
  return <div className="agenda-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="agenda-modal agenda-edit" role="dialog" aria-modal="true" aria-labelledby="agenda-edit-title" ref={panel} onKeyDown={event => {
      if (event.key === 'Escape') close()
      if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || [])]
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className="agenda-modal-head"><div><span className="agenda-eyebrow">{eventName}</span><h2 id="agenda-edit-title">Editar actividad</h2></div><button type="button" aria-label="Cerrar edición" disabled={busy} onClick={close}>×</button></header>
      <form onSubmit={async event => {
        event.preventDefault(); setError('')
        if (start && end && end < start) { setError('El fin no puede ser anterior al inicio.'); return }
        setBusy(true)
        try { await onSave(row, { name: name.trim(), start, end, responsibleIds, notes: notes.trim() }); onClose() }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar. Conservamos tus cambios aquí.') }
        finally { setBusy(false) }
      }}>
        <label>Actividad<input aria-label="Actividad" value={name} required maxLength={300} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <div className="agenda-edit-times"><label>Inicio<input aria-label="Inicio de la actividad" type="datetime-local" value={start} disabled={busy} onChange={event => setStart(event.target.value)} /></label><label>Fin<input aria-label="Fin de la actividad" type="datetime-local" value={end} disabled={busy} onChange={event => setEnd(event.target.value)} /></label></div>
        <label>Responsables<select aria-label="Responsables de la actividad" multiple value={responsibleIds} disabled={busy} onChange={event => setResponsibleIds([...event.target.selectedOptions].map(option => option.value))}>{collaborators.filter(person => person.activo || responsibleIds.includes(person.id)).map(person => <option value={person.id} key={person.id}>{person.nombre} · {person.rol}</option>)}</select></label>
        <label>Observación<textarea aria-label="Observación de la actividad" value={notes} rows={3} disabled={busy} onChange={event => setNotes(event.target.value)} /></label>
        <p className="agenda-hint">Horario de Lima. Este cambio queda confirmado en producción y conserva el contrato original.</p>
        {error && <p className="agenda-error" role="alert">{error}</p>}
        <footer className="agenda-modal-actions"><button type="button" disabled={busy} onClick={close}>Cancelar</button><button className="agenda-primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar cambio'}</button></footer>
      </form>
      <small className="agenda-source">Origen: {row.sourceLabel} · {row.start ? productionDate(row.start) : 'Hora por coordinar'}</small>
    </section>
  </div>
}
