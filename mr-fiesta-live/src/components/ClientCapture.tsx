import { useState } from 'react'
import { Clipboard, Check, Search } from 'lucide-react'
import { buildMissingMessage, captureFields, clientTemplate, parseClientCapture, selectedCapture, validateCaptureValue, type CaptureKey, type CaptureResult, type CaptureValues } from '../lib/clientCapture'
import './ClientCapture.css'
type Props = { current: CaptureValues; onApply: (values: CaptureValues, additionalPhones: string[]) => void }
export function ClientCapture({ current, onApply }: Props) {
 const [text,setText]=useState('');const [review,setReview]=useState<CaptureResult|null>(null)
 const [selected,setSelected]=useState<Partial<Record<CaptureKey,boolean>>>({});const [message,setMessage]=useState('');const [copyText,setCopyText]=useState('')
 const analyze=()=>{const result=parseClientCapture(text);setReview(result);setSelected(Object.fromEntries(result.fields.map(f=>[f.key,Boolean(f.value&&!f.warning&&!validateCaptureValue(f.key,f.value)&&(current[f.key]===null||current[f.key]===undefined||current[f.key]===''))])));setMessage('Revisa los datos. Marca explícitamente los que reemplazan información existente.');setCopyText('')}
 const copy=async(value:string)=>{setCopyText(value);try{await navigator.clipboard.writeText(value);setMessage('Mensaje copiado.')}catch{setMessage('No se pudo copiar automáticamente. Selecciona y copia el mensaje de abajo.')}}
 const update=(key:CaptureKey,value:string)=>{setReview(r=>r?{...r,fields:r.fields.map(f=>f.key===key?{...f,value}:f)}:r);setSelected(s=>({...s,[key]:Boolean(value.trim())}));setCopyText('')}
 const apply=()=>{if(!review)return;try{const values=selectedCapture(review.fields,selected);if(!Object.keys(values).length){setMessage('Marca al menos un dato para aplicar.');return}const extra=values.telefono?review.phones.filter(p=>p.replace(/^\+?51/,'')!==String(values.telefono).replace(/^\+?51/,'')):[];onApply(values,extra);setReview(null);setMessage('Datos aplicados al formulario. La reserva todavía no se ha guardado.');setCopyText('')}catch(error){setMessage(error instanceof Error?error.message:'Revisa los datos seleccionados.')}}
 return <section className="client-capture" aria-label="Captura de datos del cliente">
  <div className="capture-heading"><div><b><Clipboard size={16}/> Captura inteligente</b><p>Pega la plantilla o el chat de WhatsApp. Revisa los datos antes de aplicarlos.</p></div><span className="capture-local">Revisa antes de aplicar</span></div>
  <label className="capture-input-label" htmlFor="capture-text">Respuesta del cliente</label>
  <textarea id="capture-text" value={text} maxLength={30000} onChange={e=>{setText(e.target.value);setReview(null);setCopyText('');setMessage('')}} placeholder={'Pega aquí el mensaje o la conversación completa…\n\nNombre: Cecilia Martínez\nFecha: 28 noviembre / 4pm\nDirección: Colegio Franco Peruano, Jr. Morro Solar 550'} />
  <div className="capture-controls"><button type="button" className="crm-small" onClick={()=>void copy(clientTemplate)}>Copiar plantilla</button><button type="button" className="crm-small crm-small-primary" disabled={!text.trim()} onClick={analyze}><Search size={14}/> Detectar datos</button></div>
  {message&&<p role="status" className="capture-status">{message}</p>}
  {review&&<div className="capture-review"><h3>Revisa los datos detectados</h3><p>Corrige lo necesario y marca los campos que quieres aplicar. Los campos sin marcar se conservan.</p>
    {!!review.warnings.length&&<ul className="capture-warnings">{review.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
    {review.phones.length>1&&<label className="capture-phone-choice">Elige el teléfono principal<select value={review.fields.find(f=>f.key==='telefono')?.value||''} onChange={e=>update('telefono',e.target.value)}>{review.phones.map(p=><option key={p} value={p}>{p}</option>)}</select></label>}
    <div className="capture-fields">{review.fields.map(field=>{const label=captureFields.find(([key])=>key===field.key)![1];const existing=current[field.key];const changed=existing!==null&&existing!==undefined&&existing!==''&&String(existing)!==field.value;const invalid=field.value?validateCaptureValue(field.key,field.value):'';return <div className="capture-field" key={field.key}>
      <label className="capture-check"><input type="checkbox" aria-label={'Aplicar '+label} checked={Boolean(selected[field.key])} disabled={!field.value.trim()||Boolean(invalid)} onChange={e=>setSelected(s=>({...s,[field.key]:e.target.checked}))}/><span>{label}</span></label>
      <input aria-label={label+' detectado'} value={field.value} onChange={e=>update(field.key,e.target.value)} placeholder="Pendiente" aria-invalid={Boolean(invalid)} />
      {changed&&<small className="capture-warning">Reemplazará: {String(existing)}</small>}
      {(field.warning||invalid)&&<small className="capture-warning">{invalid||field.warning}</small>}
      {field.source&&<details><summary>Ver texto original</summary><p>{field.source}</p></details>}
    </div>})}</div>
    <div className="capture-controls"><button type="button" className="crm-small crm-small-primary" onClick={apply}><Check size={14}/> Aplicar datos seleccionados</button><button type="button" className="crm-small" onClick={()=>{try{void copy(buildMissingMessage(current,selectedCapture(review.fields,selected)))}catch{setMessage('Corrige los datos seleccionados antes de generar el mensaje.')}}}>Copiar mensaje de faltantes</button><button type="button" className="crm-small" onClick={()=>setReview(null)}>Cancelar revisión</button></div>
  </div>}
  {copyText&&<textarea className="capture-copy" aria-label="Mensaje listo para copiar" readOnly value={copyText} onFocus={e=>e.target.select()}/>}
 </section>
}
