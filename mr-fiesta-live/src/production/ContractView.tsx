import { useEffect, useRef, useState } from 'react'
import type { CrmEvent } from '../types/domain'
import { contractUrl } from './contractDocument'
import { productionDate } from './exports'
import type { ProductionPlan } from './model'

export function ContractView({ event, plan, onClose }: { event: CrmEvent; plan?: ProductionPlan; onClose: () => void }) {
  const original = contractUrl(event.drive_pdf_url)
  const panel = useRef<HTMLElement>(null)
  const [showPdf, setShowPdf] = useState(false)
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])
  return <div className="agenda-overlay" onMouseDown={click => { if (click.target === click.currentTarget) onClose() }}>
    <section className="agenda-modal agenda-contract" role="dialog" aria-modal="true" aria-labelledby="agenda-contract-title" ref={panel} onKeyDown={key => {
      if (key.key === 'Escape') onClose()
      if (key.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button,a[href],iframe') || [])]
        const first = controls[0], last = controls.at(-1)
        if (key.shiftKey && document.activeElement === first) { key.preventDefault(); last?.focus() }
        else if (!key.shiftKey && document.activeElement === last) { key.preventDefault(); first?.focus() }
      }
    }}>
      <header className="agenda-modal-head"><div><span className="agenda-eyebrow">{event.agasajado || event.cliente}</span><h2 id="agenda-contract-title">Contrato del evento</h2></div><button type="button" aria-label="Cerrar contrato" onClick={onClose}>×</button></header>
      {original ? <><div className="agenda-contract-actions"><a href={original.original} target="_blank" rel="noopener noreferrer">Abrir original / descargar ↗</a><button type="button" onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Ocultar PDF' : 'Ver PDF aquí'}</button></div>{showPdf && <iframe title="Contrato original" src={original.preview} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-downloads" />}</> : <p className="agenda-soft-note">{event.drive_pdf_url ? 'El enlace del archivo necesita revisión. Se muestran los campos registrados.' : 'No hay PDF original enlazado. Esta es la información registrada en el CRM; no se ha reconstruido un contrato.'}</p>}
      <dl className="agenda-contract-fields"><dt>Cliente</dt><dd>{event.cliente}</dd><dt>Protagonista</dt><dd>{event.agasajado || 'No registrado'}</dd><dt>Fecha y horario</dt><dd>{productionDate(event.fecha_evento)} · {event.hora_inicio}–{event.hora_fin || 'Por confirmar'}</dd><dt>Dirección</dt><dd>{event.direccion || 'Por confirmar'} · {event.lugar}</dd><dt>Paquete</dt><dd>{event.paquete}</dd><dt>Servicio exacto registrado</dt><dd>{event.detalle_servicio || 'No registrado'}</dd>{event.juegos_elegidos && <><dt>Juegos</dt><dd>{event.juegos_elegidos}</dd></>}{event.cronograma && <><dt>Cronograma contractual</dt><dd>{event.cronograma}</dd></>}{event.adicionales_requerimientos && <><dt>Adicionales y requerimientos</dt><dd>{event.adicionales_requerimientos}</dd></>}{event.adicionales && <><dt>Adicionales históricos</dt><dd>{event.adicionales}</dd></>}{event.movilidad && <><dt>Movilidad registrada</dt><dd>{event.movilidad}</dd></>}{event.invitados != null && <><dt>Invitados</dt><dd>{event.invitados}</dd></>}{event.telefono && <><dt>Teléfono</dt><dd>{event.telefono}</dd></>}{(event.dni_ruc || event.dni) && <><dt>Documento del contratante</dt><dd>{event.dni_ruc || event.dni}</dd></>}</dl>
      <dl className="agenda-contract-fields"><dt>Tipo de evento</dt><dd>{event.tipo_evento || 'No registrado'}</dd>{event.edad != null && <><dt>Edad</dt><dd>{event.edad}</dd></>}{event.referencia && <><dt>Referencia</dt><dd>{event.referencia}</dd></>}{event.observaciones && <><dt>Observaciones registradas</dt><dd>{event.observaciones}</dd></>}<dt>Precio contratado</dt><dd>S/ {Number(event.total || 0).toFixed(2)}</dd><dt>Adelanto contractual</dt><dd>S/ {Number(event.adelanto || 0).toFixed(2)}</dd><dt>Saldo contractual calculado</dt><dd>S/ {(Number(event.total || 0) - Number(event.adelanto || 0)).toFixed(2)}</dd></dl>
      {!!plan?.agreements.length && <section className="agenda-contract-agreements"><h3>Acuerdos posteriores registrados</h3>{plan.agreements.map(agreement => <p key={agreement.id}><b>{productionDate(agreement.date)} · {agreement.responsible}</b><br />{agreement.note}</p>)}</section>}
      <p className="agenda-hint">Consulta de solo lectura. La versión y fecha de generación del PDF no están registradas en el CRM actual.</p>
    </section>
  </div>
}
