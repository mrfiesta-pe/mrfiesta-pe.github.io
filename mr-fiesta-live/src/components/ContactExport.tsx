import { useEffect, useRef, useState } from 'react'
import { contactRows, createContactsVcf, normalizeContactPhone, type ContactRow } from '../lib/contactExport'

export function ContactExport({ events, onClose }: { events: { id: string; cliente: string; telefono: string }[]; onClose: () => void }) {
  const [rows, setRows] = useState(() => contactRows(events))
  const [message, setMessage] = useState('')
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus() }, [])
  const update = (id: string, patch: Partial<ContactRow>) => { setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); setMessage('') }
  const valid = (row: ContactRow) => Boolean(row.name.trim() && normalizeContactPhone(row.phone))
  const count = new Set(rows.filter(row => row.selected && valid(row)).map(row => normalizeContactPhone(row.phone))).size
  const invalid = rows.some(row => row.selected && !valid(row))
  const download = () => {
    try {
      const result = createContactsVcf(rows)
      const url = URL.createObjectURL(new Blob([result.text], { type: 'text/vcard;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = 'Clientes_Mr_Fiesta.vcf'; document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setMessage(`Descarga iniciada: ${result.count} contactos. Abre Clientes_Mr_Fiesta.vcf en tu celular e impórtalo en Contactos.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el archivo.') }
  }
  return <div className="crm-modal-backdrop" onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}><section className="crm-modal crm-contact-export" role="dialog" aria-modal="true" aria-labelledby="export-title">
    <button ref={close} type="button" className="crm-modal-close" aria-label="Cerrar exportación" onClick={onClose}>×</button>
    <h2 id="export-title">Exportar contactos</h2>
    <p>Incluye clientes de todo el historial, aunque tengas filtros en la agenda. Se exporta un contacto por teléfono. Las correcciones aquí solo se aplican al archivo.</p>
    <div className="crm-team-tools"><button type="button" onClick={() => { setRows(current => current.map(row => ({ ...row, selected: valid(row) }))); setMessage('') }}>Seleccionar válidos</button><button type="button" onClick={() => { setRows(current => current.map(row => ({ ...row, selected: false }))); setMessage('') }}>Desmarcar todos</button></div>
    <div className="crm-export-list">{rows.map(row => <div className="crm-export-row" key={row.id}>
      <label className="crm-export-select"><input type="checkbox" checked={row.selected} onChange={event => update(row.id, { selected: event.target.checked })} /> Incluir {row.name || 'contacto sin nombre'}</label>
      <label>Nombre<input aria-label={`Nombre de ${row.id}`} value={row.name} maxLength={200} onChange={event => update(row.id, { name: event.target.value })} /></label>
      <label>Teléfono<input type="tel" aria-label={`Teléfono de ${row.id}`} value={row.phone} maxLength={40} placeholder="999 888 777 o +51 999 888 777" onChange={event => update(row.id, { phone: event.target.value })} /></label>
      {!valid(row) && <small>Completa el nombre y un celular válido. Para otros países, incluye + y el código de país.</small>}
    </div>)}{!rows.length && <p>No hay clientes guardados para exportar.</p>}</div>
    <p>Se guardarán como «Nombre · Mr Fiesta». Solo se incluyen nombre y teléfono. Importar varias veces puede duplicar contactos que ya tienes en tu celular.</p>
    <button type="button" className="primary-button" disabled={!count || invalid} onClick={download}>Descargar {count} contactos (.vcf)</button>
    {invalid && <p role="alert">Corrige o desmarca los contactos incompletos.</p>}
    {message && <p role="status">{message}</p>}
  </section></div>
}
