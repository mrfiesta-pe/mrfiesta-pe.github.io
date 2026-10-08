export type ContactRow = { id: string; name: string; phone: string; selected: boolean }

export function normalizeContactPhone(raw: string): string | null {
  const value = raw.trim()
  if (!/^[+\d\s().-]+$/.test(value) || (value.includes('+') && !/^\+[^+]+$/.test(value))) return null
  let digits = value.replace(/\D/g, '')
  const international = value.startsWith('+') || value.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^9\d{8}$/.test(digits) && !international) return '+51' + digits
  if (digits.startsWith('51')) return /^519\d{8}$/.test(digits) ? '+' + digits : null
  return international && /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null
}

export function contactRows(events: { id: string; cliente: string; telefono: string }[]): ContactRow[] {
  const seen = new Set<string>()
  return events.flatMap(event => {
    const phone = normalizeContactPhone(event.telefono || '')
    if (phone && seen.has(phone)) return []
    if (phone) seen.add(phone)
    return [{ id: event.id, name: (event.cliente || '').trim(), phone: phone || event.telefono || '', selected: Boolean(phone && event.cliente?.trim()) }]
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

const escapeText = (value: string) => Array.from(value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('')
function fold(line: string): string {
  const encoder = new TextEncoder()
  let result = '', length = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (length + size > 75) { result += '\r\n '; length = 1 }
    result += char; length += size
  }
  return result
}

export function createContactsVcf(rows: ContactRow[]): { text: string; count: number } {
  const seen = new Set<string>(), cards: string[] = []
  for (const row of rows) {
    if (!row.selected) continue
    const phone = normalizeContactPhone(row.phone)
    if (!phone || !row.name.trim()) throw new Error('Revisa el nombre y teléfono de los contactos seleccionados.')
    if (seen.has(phone)) continue
    seen.add(phone)
    const name = escapeText(row.name.trim() + ' · Mr Fiesta')
    cards.push(['BEGIN:VCARD', 'VERSION:3.0', `N:;${name};;;`, `FN:${name}`, `TEL;TYPE=CELL:${phone}`, 'END:VCARD'].map(fold).join('\r\n'))
  }
  if (!cards.length) throw new Error('Selecciona al menos un contacto válido.')
  return { text: cards.join('\r\n') + '\r\n', count: cards.length }
}
