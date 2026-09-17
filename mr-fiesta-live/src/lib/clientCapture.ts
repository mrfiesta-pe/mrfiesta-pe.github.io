export const captureFields = [
  ['cliente', 'Nombre del contratante'], ['telefono', 'Teléfono principal'], ['direccion', 'Dirección exacta'],
  ['lugar', 'Distrito'], ['referencia', 'Referencia'], ['fecha_evento', 'Fecha del evento'],
  ['hora_inicio', 'Hora de inicio'], ['agasajado', 'Nombre del cumpleañero/a'], ['edad', 'Edad'],
  ['cancion_invitacion', 'Canción para la invitación'], ['tematica_invitacion', 'Temática para la invitación'],
] as const
export type CaptureKey = typeof captureFields[number][0]
export type CaptureValues = Partial<Record<CaptureKey, string | number | null>>
export type DetectedField = { key: CaptureKey; value: string; source: string; warning: string }
export type CaptureResult = { fields: DetectedField[]; phones: string[]; warnings: string[] }
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const clientTemplate = '¡Hola! Para dejar tu reserva lista, por favor envíame estos datos:\n\nNOMBRE DEL CONTRATANTE:\nTELÉFONO:\nDIRECCIÓN EXACTA:\nDISTRITO:\nREFERENCIA:\nFECHA DEL EVENTO: (dd/mm/aaaa)\nHORA DE INICIO: (ej. 6:30 pm)\nNOMBRE DEL CUMPLEAÑERO/A:\nEDAD:\nCANCIÓN PARA LA INVITACIÓN:\nTEMÁTICA PARA LA INVITACIÓN:'
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const districts = 'San Juan de Lurigancho|San Juan de Miraflores|San Martín de Porres|Santiago de Surco|Villa María del Triunfo|Villa El Salvador|Magdalena del Mar|Santa María del Mar|Carmen de la Legua Reynoso|La Perla|La Punta|Bellavista|Ventanilla|Mi Perú|Callao|Ancón|Ate|Barranco|Breña|Carabayllo|Chaclacayo|Chorrillos|Cieneguilla|Comas|El Agustino|Independencia|Jesús María|La Molina|La Victoria|Lima|Lince|Los Olivos|Lurigancho|Lurín|Miraflores|Pachacámac|Pucusana|Pueblo Libre|Puente Piedra|Punta Hermosa|Punta Negra|Rímac|San Bartolo|San Borja|San Isidro|San Luis|San Miguel|Santa Anita|Santa Rosa|Surquillo|Surco'.split('|').sort((a,b) => b.length-a.length)
const numberWords: Record<string, number> = { cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29, treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 }
function numberOf(s:string): number | undefined { const v=fold(s.trim()); if (/^\d{1,3}$/.test(v)) return Number(v); if (v in numberWords) return numberWords[v]; const p=v.split(' y '); if(p.length===2 && numberWords[p[0]]>=30 && numberWords[p[1]]<10) return numberWords[p[0]]+numberWords[p[1]]; return undefined }
export function validateCaptureValue(key: CaptureKey, value: string): string {
  const v=value.trim(); if(!v) return 'Dato pendiente.'; if(v.length>600) return 'El dato es demasiado largo.'
  if(key==='fecha_evento') { const d=new Date(v+'T12:00:00Z'); if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v) return 'Revisa la fecha completa.' }
  if(key==='hora_inicio'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return 'Confirma la hora en formato 24 h (HH:MM).'
  if(key==='edad'&&(!/^\d{1,2}$/.test(v)||Number(v)<1)) return 'La edad debe estar entre 1 y 99.'
  if(key==='telefono'&&!/^(?:9\d{8}|51\d{9}|\+[1-9]\d{7,14})$/.test(v.replace(/[ ()-]/g,''))) return 'Revisa el teléfono; para otro país incluye + y su código.'
  return ''
}
export function parseDate(value: string, now: Date): {value:string; warning:string} | null {
  const s=fold(value); let day:number,month:number,year:number|undefined
  const iso=s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  const numeric=s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?\b/)
  const named=s.match(/\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s*(?:de[l]?\s+)?(\d{4}))?\b/)
  if(iso) { year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]) }
  else if(numeric) { day=Number(numeric[1]);month=Number(numeric[2]);year=numeric[3]?Number(numeric[3])+(numeric[3].length===2?2000:0):undefined }
  else if(named) { day=Number(named[1]);month=months.indexOf(named[2].replace('setiembre','septiembre'))+1;year=named[3]?Number(named[3]):undefined }
  else return null
  const explicit=year!==undefined;year??=now.getFullYear()
  if(!explicit&&(month<now.getMonth()+1||(month===now.getMonth()+1&&day<now.getDate()))&&!/\b(ayer|pasado|pasada)\b/.test(s))year++
  const result=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const invalid=validateCaptureValue('fecha_evento',result)
  const past=new Date(year,month-1,day)<new Date(now.getFullYear(),now.getMonth(),now.getDate())
  return {value:result,warning:invalid||(past?'La fecha ya pasó. Confirma si corresponde.':'')}
}
function parseTime(value:string): {value:string;warning:string}|null {
  let s=fold(value).replace(/a\s*\.\s*m\s*\.?/g,'am').replace(/p\s*\.\s*m\s*\.?/g,'pm')
  if(/\b(?:lleg\w*|instala\w*|montaje)\b/.test(s)&&!/(?:show|fiesta|evento|inicio|empieza|empezar)/.test(s))return null
  if(s.includes('medianoche'))return {value:'00:00',warning:''}
  if(s.includes('mediodia'))return {value:'12:00',warning:''}
  const word=s.match(/(?:a las?|hora(?: de inicio)?\s*[:=-]?)\s+([a-z]+)(?:\s+y\s+(media|cuarto))?/)
  if(word&&numberOf(word[1])!==undefined)s=s.replace(word[0],`a las ${numberOf(word[1])}:${word[2]==='media'?'30':word[2]==='cuarto'?'15':'00'}`)
  const match=s.match(/(?:\ba las?\s+|\bhora(?:\s+de\s+inicio)?\s*[:=-]?\s*|\binicio\s*[:=-]?\s*|^)(\d{1,2})(?::(\d{2}))?\s*(am|pm|h(?:rs?)?)?\b/) || s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?)\b/) || s.match(/\b(\d{1,2}):(\d{2})\b/)
  if(!match)return null
  let hour=Number(match[1]);const minute=Number(match[2]||0);const meridian=match[3]||(/\b(tarde|noche)\b/.test(s)?'pm':/\bmanana\b/.test(s)?'am':'')
  if(hour>23||minute>59||(meridian==='am'||meridian==='pm')&&(hour<1||hour>12))return {value:match[0].trim(),warning:'Hora inválida.'}
  if(meridian==='pm'&&hour<12)hour+=12;if(meridian==='am'&&hour===12)hour=0
  return {value:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,warning:!meridian&&hour>=1&&hour<=12?'Confirma si es de mañana o tarde.':''}
}
const aliases: Record<CaptureKey,string[]> = {
 cliente:['nombre del cliente','nombre cliente','nombre del contratante','nombre contratante','contratante','cliente','nombre completo','nombre'],telefono:['numero de contacto','telefono','celular','whatsapp','contacto','cel'],direccion:['direccion exacta y referencia','direccion exacta','direccion','ubicacion','lugar del evento'],lugar:['distrito del evento','distrito','zona'],referencia:['referencia de direccion','punto de referencia','referencia','ref'],fecha_evento:['fecha del evento','fecha_evento','fecha','dia del evento'],hora_inicio:['hora de inicio','hora del evento','hora_inicio','horario','hora','inicio'],agasajado:['nombre del cumpleanero/a','nombre del cumpleanero','nombre de la cumpleanera','nombre cumpleanero','cumpleanero/a','cumpleanero','cumpleanera','agasajado','festejado'],edad:['edad del cumpleanero','edad','anos'],cancion_invitacion:['cancion para la invitacion','cancion para invitacion','musica para la invitacion','cancion','musica'],tematica_invitacion:['tematica para la invitacion','tematica para invitacion','tema para la invitacion','tematica','tema'] }
function labeled(line:string): {key:CaptureKey;value:string}|null {
 const normal=fold(line).replace(/^[-•*\s]+/,''); const original=line.replace(/^[-•*\s]+/,'')
 for(const [key,names] of Object.entries(aliases) as [CaptureKey,string[]][])for(const name of names){if(normal.startsWith(name)&&/^\s*[:=–—-]/.test(normal.slice(name.length)))return {key,value:original.slice(name.length).replace(/^\s*[:=–—-]\s*/,'').replace(/\*$/,'').trim()}}
 const loose=original.match(/^(?:nombre(?: del contratante)?|contratante)\s+((?!del?\s)[^:]+)$/i)
 if(loose)return {key:'cliente',value:loose[1].trim()}
 return null
}
export function parseClientCapture(raw:string, now=new Date()):CaptureResult {
 const fields=new Map<CaptureKey,DetectedField>();const phones:string[]=[];const warnings:string[]=[]
 const clean=raw.replace(/&#(?:x20|32);|&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\r\n?/g,'\n').replace(/[\u200e\u200f\u202a-\u202e]/g,'')
 const rows:{text:string;sender:string}[]=[];let sender='';let chat=false
 for(const line of clean.split('\n')) {
  const stamp=line.match(/^\s*(?:\[[^\]]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[^\]]*\]|\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}:\d{2}[^-]*-)\s*([^:]+):\s*(.*)$/)
  if(stamp){chat=true;sender=stamp[1].trim();rows.push({text:stamp[2],sender})}else rows.push({text:line,sender})
 }
 const customerRows=rows.filter(row=>!chat||!/(?:m[ri]ster|mr\.?|mister)\s*fiesta/i.test(row.sender))
 if(chat)warnings.push('Se ignoraron las respuestas de MR FIESTA y las fechas de los encabezados del chat.')
 const senders=new Set(customerRows.map(r=>r.sender).filter(Boolean));if(senders.size>1)warnings.push('Hay varios remitentes: revisa a qué cliente pertenecen los datos.')
 function put(key:CaptureKey,value:string,source:string,warning='') {
  value=value.trim().replace(/\s+/g,' ');if(!value||/^\(.*\)$/.test(value)||/^(pendiente|por confirmar|no se|no sé)$/i.test(value))return
  const prev=fields.get(key);const correction=/\b(es|mejor|corrijo|correccion|perdon|finalmente|correct[ao])\b/.test(fold(source))
  if(prev&&prev.value!==value&&!correction)warning=warning||`Otro dato anterior: ${prev.value}. Confirma cuál corresponde.`
  fields.set(key,{key,value,source:source.trim(),warning})
 }
 let pending:CaptureKey|null=null
 for(const row of customerRows){
  let line=row.text.trim();if(!line)continue
  // Split inline template fields without relying on their order.
  const parts=line.split(/\s+(?=(?:TEL[ÉE]FONO|DIRECCI[ÓO]N(?: EXACTA)?|DISTRITO|REFERENCIA|FECHA(?: DEL EVENTO)?|HORA(?: DE INICIO)?|EDAD|TEM[ÁA]TICA|CANCI[ÓO]N)\s*:)/i)
  for(line of parts){
   const tag=labeled(line);let key=tag?.key;let value=tag?.value??line
   if(tag&&!tag.value){pending=tag.key;continue}if(!tag&&pending){key=pending;pending=null}else if(tag)pending=null
   const n=fold(line)
   const phoneMatches=value.match(/(?<!\d)(?:\+?51[ ()-]*)?9(?:[ ()-]*\d){8}(?!\d)|\+[1-9](?:[ ()-]*\d){7,14}(?!\d)/g)||[]
   if(key==='telefono'||!key)for(const p of phoneMatches){let normalized=p.replace(/[ ()-]/g,'');if(normalized.startsWith('+51')&&normalized.length===12)normalized=normalized.slice(3);else if(normalized.startsWith('51')&&normalized.length===11)normalized=normalized.slice(2);if(!phones.includes(normalized))phones.push(normalized)}
   if(key==='telefono'){if(phoneMatches[0])put(key,phoneMatches[0].replace(/[ ()-]/g,'').replace(/^\+?51(?=9\d{8}$)/,''),line);continue}
   if(key==='fecha_evento'||(!key&&!/\b(naci|nacimiento|cumplio)\b/.test(n))){const date=parseDate(value,now);if(date)put('fecha_evento',date.value,line,date.warning)}
   const timeSource=key==='hora_inicio'?value:line
   if(key==='hora_inicio'||((!key||key==='fecha_evento')&&/(\d\s*(?:pm|am)|\d:\d|a las?\s|hora|inicio|empieza|empezar)/i.test(n))){const time=parseTime(timeSource);if(time){const prev=fields.get('hora_inicio');if(time.warning&&prev&&!prev.warning&&Number(prev.value.slice(0,2))%12===Number(time.value.slice(0,2))%12){time.value=prev.value;time.warning=''}put('hora_inicio',time.value,line,time.warning)}}
   if(key==='edad'){const age=numberOf(fold(value).replace(/\s*(anos|anitos).*$/,'').trim());if(age!==undefined)put(key,String(age),line);continue}
   if(key&&!['telefono','fecha_evento','hora_inicio'].includes(key)){put(key,value,line);continue}
   if(key)continue
   const client=line.match(/(?:mi nombre es|me llamo|soy|contratante\s*(?:es|:))\s+([^,;\n.!?]+)/i);if(client)put('cliente',client[1],line,/\b(mama|papa|madre|padre)\b/.test(fold(client[1]))?'Confirma el nombre completo.':'')
   const child=line.match(/(?:mi hij[oa]|cumpleañer[oa]|festejad[oa]|agasajad[oa])\s+(?:(?:se llama|es)\s+)?([^,;\n.!?]+?)(?=\s+(?:cumple|tiene|va a cumplir)|[,;.!?]|$)/i);if(child)put('agasajado',child[1],line)
   const age=fold(line).match(/(?:cumple|cumplira|va a cumplir|tiene)\s+([a-z\d]+(?:\s+y\s+[a-z]+)?)\s*(?:anos|anitos|$)/);if(age){const val=numberOf(age[1]);if(val!==undefined)put('edad',String(val),line)}
   const address=line.match(/(?:direcci[oó]n(?: exacta)?\s*(?:es|:)?|(?:ser[aá]|es)\s+en)\s+([^\n]+)/i);if(address&&!parseDate(address[1],now))put('direccion',address[1].split(/\s+(?:mi (?:cel|telefono)|queremos|la tematica)/i)[0],line)
   const reference=line.match(/(?:referencia\s*(?:es|:)?\s*|\b)((?:frente a|al costado de|a espaldas de|cerca de)\s+[^;\n]+)/i);if(reference)put('referencia',reference[1],line)
   const song=line.match(/(?:canci[oó]n|m[uú]sica)(?:\s+para (?:la )?invitaci[oó]n)?\s*(?::|es|sera|queremos)?\s+(.+)/i);if(song)put('cancion_invitacion',song[1],line)
   const theme=line.match(/(?:tem[aá]tica|decoraci[oó]n)(?:\s+para (?:la )?invitaci[oó]n)?\s*(?::|es|sera|queremos)?\s*(?:de\s+)?(.+)/i);if(theme)put('tematica_invitacion',theme[1],line)
   if(!fields.has('lugar'))for(const district of districts){if(new RegExp('(?:^|\\b(?:en|distrito|zona)\\s+(?:de\\s+)?)'+fold(district)+'(?:$|[ ,.;])').test(n)){put('lugar',district,line);break}}
   if(/\b(?:el de|paquete|propuesta)\s*(?:de\s*)?(?:s\/\s*)?\d{2,}/i.test(line))warnings.push('Se mencionó un precio o paquete: revísalo manualmente; no se modificaron los importes.')
  }
 }
 if(phones.length&&!fields.has('telefono'))put('telefono',phones[0],phones.join(' / '))
 if(phones.length>1)warnings.push('Hay varios teléfonos. Elige el principal; los demás se conservarán en observaciones al aplicar el teléfono.')
 const date=fields.get('fecha_evento');if(date&&!validateCaptureValue('fecha_evento',date.value)){
  const days=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];const all=fold(customerRows.map(r=>r.text).join('\n'));const mentions=[...all.matchAll(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/g)]
  const last=mentions.at(-1)?.[1];if(last&&days[new Date(date.value+'T12:00:00').getDay()]!==last)date.warning=`La fecha no cae ${last}. Confirma el día y la fecha.`
 }
 return {fields:captureFields.map(([key])=>fields.get(key)||{key,value:'',source:'',warning:''}),phones,warnings:[...new Set(warnings)]}
}
export function selectedCapture(fields:DetectedField[],selected:Partial<Record<CaptureKey,boolean>>):CaptureValues {
 const result:CaptureValues={};for(const field of fields)if(selected[field.key]){const error=validateCaptureValue(field.key,field.value);if(error)throw new Error(error);result[field.key]=field.key==='edad'?Number(field.value):field.value.trim()}return result
}
export function buildMissingMessage(current:CaptureValues,proposed:CaptureValues):string {
 const combined={...current,...proposed};const missing=captureFields.filter(([key])=>combined[key]===null||combined[key]===undefined||validateCaptureValue(key,String(combined[key]))).map(([,label])=>label)
 return missing.length?'¡Hola! Para completar tu reserva, por favor confírmame:\n\n'+missing.map(label=>'• '+label).join('\n')+'\n\nIndica la hora con a. m. o p. m. Si un dato no aplica, avísame. ¡Gracias!':'Ya tenemos todos los datos de la plantilla. ¡Gracias!'
}
