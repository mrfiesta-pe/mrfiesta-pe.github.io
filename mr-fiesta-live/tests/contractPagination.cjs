const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const { jsPDF } = require('jspdf')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'tmp', 'contract-pagination')
fs.mkdirSync(output, { recursive: true })
const source = fs.readFileSync(path.join(root, 'src/pages/CrmPage.tsx'), 'utf8')
const layoutSource = fs.readFileSync(path.join(root, 'src/lib/contractLayout.ts'), 'utf8')
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const layout = {}
Function('exports', compile(layoutSource))(layout)
const printSource = source.slice(source.indexOf('  const print = async () => {'), source.indexOf('  const whatsapp ='))
const fixture = { cliente: 'Cliente de prueba', dni_ruc: '', agasajado: 'Agasajado de prueba', edad: 11, telefono: '999888777', fecha_evento: '2026-10-16', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'Lima', direccion: 'Dirección de prueba 123', tematica_invitacion: 'Lila, morado y mariposas', cancion_invitacion: 'Canción de prueba', paquete: 'Ultra Chicoteca + Decoración', detalle_servicio: Array.from({length: 30}, (_, i) => `Servicio ${i + 1} acordado para el evento`).join('; ') + '; SERVICIO_FINAL', juegos_elegidos: 'Juego con equipos y música. '.repeat(12) + 'JUEGO_FINAL', cronograma: Array.from({length: 12}, (_, i) => `Actividad ${i + 1} del cronograma completo`).join('; ') + '; CRONOGRAMA_FINAL', adicionales_requerimientos: 'Decoración lila y morada, flores, mariposas y cartel personalizado. '.repeat(10) + 'ADICIONAL_FINAL', total: 1810, adelanto: 500 }

async function run(name, form) {
  const dataUrl = async asset => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public', path.basename(asset))).toString('base64')
  let saved
  function Pdf(options) { const doc = new jsPDF(options); doc.save = () => { saved = doc; fs.writeFileSync(path.join(output, name + '.pdf'), Buffer.from(doc.output('arraybuffer'))); return doc }; return doc }
  const generate = Function('jsPDF', 'renderContractDetails', 'form', 'missingContractFields', 'assetToDataUrl', 'balanceOf', 'money', 'dateLabel', 'contractFileName', 'notify', compile(printSource) + '; return print;')(
    Pdf, layout.renderContractDetails, form, () => [], dataUrl, (total, deposit) => total - deposit, value => `S/ ${Number(value).toFixed(2)}`, value => value, () => name + '.pdf', (title, body, kind) => { if (kind === 'error') throw new Error(title + ': ' + body) })
  await generate()
  assert.ok(saved)
  console.log(name + ': ' + saved.getNumberOfPages() + ' pages')
}

async function main() {
  await run('full-details', fixture)
  await run('single-long-item', {...fixture, detalle_servicio: 'Una actividad muy larga sin separadores '.repeat(350) + 'SERVICIO_FINAL', cronograma: 'Una actividad extensa sin separadores '.repeat(220) + 'CRONOGRAMA_FINAL'})
  await run('short', {...fixture, detalle_servicio: 'DJ; Sonido; Luces; SERVICIO_FINAL', cronograma: 'Recepción; Juegos; Baile; CRONOGRAMA_FINAL', juegos_elegidos: 'JUEGO_FINAL', adicionales_requerimientos: 'ADICIONAL_FINAL'})
  const rows = [{text:'A',height:4,size:7,kind:'text'}, {text:'Título',height:7,size:7,kind:'heading'}, {text:'B',height:4,size:7,kind:'text'}]
  assert.equal(layout.takeRows(rows, 12).length, 1, 'Do not orphan a heading')
  assert.equal(layout.takeRows(rows, 12).length, 2)
  console.log('Pagination scenarios generated without losing queued content.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
