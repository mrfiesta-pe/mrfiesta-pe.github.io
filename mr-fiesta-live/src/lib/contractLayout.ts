import type { jsPDF } from 'jspdf'

type Details = { detalle_servicio: string; cronograma: string; juegos_elegidos: string; adicionales_requerimientos: string }
type Row = { text: string; height: number; size: number; kind: 'service' | 'timeline' | 'text' | 'heading'; first?: boolean }
const items = (value: string) => value.replace(/\r?\n/g, ',').split(/[,;]|\.\s+/).map(item => item.trim().replace(/^[•-]\s*/, '')).filter(Boolean)
const timelineItems = (value: string) => value.replace(/\r?\n/g, ',').split(/[,;]+/).map(item => item.trim().replace(/^[•-]\s*/, '')).filter(Boolean)

// Consume lines, not whole paragraphs: even a single exceptionally long item
// must be able to span pages without getting dropped or looping forever.
export function takeRows(rows: Row[], capacity: number): Row[] {
  const result: Row[] = []
  let used = 0
  while (rows.length) {
    const row = rows[0]
    const required = row.height + (row.kind === 'heading' ? rows[1]?.height ?? 0 : 0)
    if (used + required > capacity) break
    result.push(rows.shift()!)
    used += row.height
  }
  return result
}

export function renderContractDetails(doc: jsPDF, data: Details, startY: number, newPage: () => number): number {
  const left: Row[] = []
  const right: Row[] = []
  const wrap = (text: string, width: number, size: number): string[] => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size)
    return doc.splitTextToSize(text, width)
  }
  for (const item of items(data.detalle_servicio || 'Servicio de entretenimiento MR FIESTA.')) {
    const lines = wrap(item, 77, 6.8)
    lines.forEach((text, i) => left.push({ text, size: 6.8, height: 3.35 + (i === lines.length - 1 ? 0.7 : 0), kind: 'service', first: i === 0 }))
  }
  for (const item of timelineItems(data.cronograma || 'Horario por coordinar con el cliente.')) {
    const lines = wrap(item, 66, 7.4)
    lines.forEach((text, i) => right.push({ text, size: 7.4, height: 3.9 + (i === lines.length - 1 ? 6.1 : 0), kind: 'timeline', first: i === 0 }))
  }
  for (const [heading, value] of [['JUEGOS ELEGIDOS', data.juegos_elegidos], ['ADICIONALES / REQUERIMIENTOS', data.adicionales_requerimientos]]) {
    if (!value.trim()) continue
    right.push({ text: heading, size: 6.8, height: 7, kind: 'heading' })
    for (const text of wrap(value, 78, 6.6)) right.push({ text, size: 6.6, height: 3.3, kind: 'text' })
  }
  let y = startY
  while (left.length || right.length) {
    if (270 - y < 35) y = newPage()
    const capacity = 270 - y - 22
    const a = takeRows(left, capacity), b = takeRows(right, capacity)
    if (!a.length && !b.length) throw new Error('No hay espacio suficiente para el detalle del contrato.')
    const height = Math.max(35, Math.max(a.reduce((sum, row) => sum + row.height, 0), b.reduce((sum, row) => sum + row.height, 0)) + 22)
    doc.setDrawColor(225, 225, 230); doc.roundedRect(15, y, 180, height, 5, 5, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.setTextColor(255, 47, 146); doc.text('DETALLE DEL SERVICIO', 20, y + 8)
    doc.setTextColor(0, 185, 215); doc.text('CRONOGRAMA / ACTIVIDADES', 112, y + 8)
    doc.setDrawColor(220, 220, 220); doc.line(106, y + 10, 106, y + height - 8)
    let cursor = y + 16
    for (const row of a) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(row.size); doc.setTextColor(40, 40, 40)
      if (row.first) { doc.setFillColor(255, 47, 146); doc.circle(21, cursor - 1.15, 0.75, 'F') }
      doc.text(row.text, 24, cursor); cursor += row.height
    }
    cursor = y + 17
    const timeline = b.filter(row => row.kind === 'timeline')
    if (timeline.length) {
      doc.setDrawColor(0, 205, 225); doc.setLineWidth(1)
      doc.line(116, cursor - 1.3, 116, cursor + timeline.reduce((sum, row) => sum + row.height, 0) - 5)
      doc.setLineWidth(0.2)
    }
    for (const row of b) {
      doc.setFont('helvetica', row.kind === 'heading' ? 'bold' : 'normal'); doc.setFontSize(row.size)
      if (row.kind === 'heading') doc.setTextColor(255, 47, 146)
      else doc.setTextColor(40, 40, 40)
      if (row.kind === 'timeline' && row.first) {
        doc.setFillColor(0, 220, 245); doc.circle(116, cursor - 1.3, 3.2, 'F')
        doc.setFillColor(255, 47, 146); doc.circle(116, cursor - 1.3, 1.3, 'F')
      }
      doc.text(row.text, row.kind === 'timeline' ? 122 : 112, cursor)
      cursor += row.height
    }
    y += height + 9
    if (left.length || right.length) y = newPage()
  }
  return y
}
