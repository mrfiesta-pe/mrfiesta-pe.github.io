const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')

// Load the actual TypeScript implementation, including its React PDF component.
function load(file) {
  const filename = path.join(root, file)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  const requireHere = createRequire(filename)
  const localRequire = name => name === '../lib/contractClauses' ? load('src/lib/contractClauses.ts') : requireHere(name)
  Function('exports', 'require', code)(exports, localRequire)
  return exports
}

async function main() {
  const lib = load('src/lib/shareContract.ts')
  const blob = new Blob(['%PDF-1.7 test'], { type: 'application/pdf' })
  const setNavigator = value => Object.defineProperty(globalThis, 'navigator', { configurable: true, value })
  let clicked = 0, removed = 0, revoked = 0, deferred
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { clicked++ }, remove() { removed++ } }) }
  globalThis.window = { setTimeout(fn) { deferred = fn } }
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => revoked++
  setNavigator({})
  assert.equal(await lib.shareContractToWhatsApp(blob, 'José / Pérez'), 'downloaded')
  assert.equal(clicked, 1); assert.equal(removed, 1); assert.equal(revoked, 0)
  deferred(); assert.equal(revoked, 1)
  assert.equal(lib.contractFileName('José / Pérez'), 'Contrato_MrFiesta_Jose_Perez.pdf')
  let shared
  setNavigator({ canShare: () => true, share: async data => { shared = data } })
  assert.equal(await lib.shareContractToWhatsApp(blob, 'Ana'), 'shared')
  assert.equal(shared.files[0].type, 'application/pdf')
  assert.equal(shared.text, 'Hola Ana, adjunto el contrato para tu evento con Mr. Fiesta.')
  setNavigator({ canShare: () => true, share: async () => { throw new DOMException('Cancelled', 'AbortError') } })
  assert.equal(await lib.shareContractToWhatsApp(blob, 'Ana'), 'cancelled')
  assert.equal(clicked, 1, 'Cancellation must not trigger a download')
  setNavigator({ canShare: () => true, share: async () => { throw new DOMException('Failed', 'DataError') } })
  await assert.rejects(lib.shareContractToWhatsApp(blob, 'Ana'), { name: 'DataError' })
  // Exercise the draft hook through real React effects, including pending timers.
  const React = require('react')
  const { create, act } = require('react-test-renderer')
  const { useContractDraft } = load('src/hooks/useContractDraft.ts')
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const storage = new Map()
  const timers = new Map()
  const listeners = new Map()
  let timerId = 0, hook, renderer
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  globalThis.window = { setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id), addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  const initial = { cliente: '', total: 0 }
  const key = 'mrfiesta_contract_draft'
  storage.set(key, JSON.stringify({ version: 1, form: { cliente: 'Recuperado', total: 950 }, editingId: 'event-id' }))
  function Harness() { hook = useContractDraft(initial); return null }
  await act(async () => { renderer = create(React.createElement(Harness)) })
  assert.equal(hook.form.cliente, 'Recuperado'); assert.equal(hook.editingId, 'event-id')
  await act(async () => hook.setForm({ cliente: 'Cambio', total: 950 }))
  await act(async () => { for (const fn of timers.values()) fn(); timers.clear() })
  assert.equal(JSON.parse(storage.get(key)).form.cliente, 'Cambio')
  const old = hook.draftSnapshot
  await act(async () => hook.setForm({ cliente: 'Última edición', total: 1000 }))
  await act(async () => hook.clearExportedDraft(old))
  assert.ok(storage.has(key), 'An older PDF must not remove newer edits')
  await act(async () => listeners.get('pagehide')())
  assert.equal(JSON.parse(storage.get(key)).form.cliente, 'Última edición')
  await act(async () => hook.clearExportedDraft(hook.draftSnapshot))
  assert.equal(storage.has(key), false)
  await act(async () => { for (const fn of timers.values()) fn(); timers.clear() })
  assert.equal(storage.has(key), false, 'Pending debounce must not recreate exported draft')
  await act(async () => hook.setForm({ cliente: 'Nuevo cambio', total: 1200 }))
  await act(async () => listeners.get('pagehide')())
  assert.equal(JSON.parse(storage.get(key)).form.cliente, 'Nuevo cambio')
  await act(async () => renderer.unmount())
  storage.set(key, 'invalid JSON')
  await act(async () => { renderer = create(React.createElement(Harness)) })
  assert.equal(hook.form.cliente, '')
  assert.match(hook.draftMessage, /No se pudo recuperar/)
  await act(async () => renderer.unmount())
  delete globalThis.window; delete globalThis.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = false

  const { renderToFile } = require('@react-pdf/renderer')
  const { ContractDocument } = load('src/components/ContractDocument.tsx')
  const data = { cliente: 'Cliente de prueba', telefono: '+51 999 888 777', dni_ruc: '00000000', agasajado: 'Cumpleañero de prueba', edad: 10, invitados: 25, tipo_evento: 'Cumpleaños', fecha_evento: '2026-12-12', hora_inicio: '17:00', hora_fin: '20:00', lugar: 'Lima', direccion: 'Dirección de prueba 123', referencia: 'Portón principal', tematica_invitacion: 'Neón', cancion_invitacion: 'Canción de prueba', paquete: 'Experiencia Neón', detalle_servicio: 'Animación, DJ, sonido, iluminación y juegos acordados.', juegos_elegidos: 'Just Dance, karaoke y concursos.', cronograma: '17:00 Recepción\n18:00 Juegos\n19:00 Karaoke\n20:00 Cierre CUARTO-PASO', adicionales_requerimientos: 'Acceso por ascensor. ADICIONAL-FINAL', total: 950, adelanto: 200, saldo: 750, estado_pago: 'Reservado', observaciones: 'NOTA-INTERNA-NO-PUBLICAR', drive_pdf_url: null }
  const output = path.join(root, 'output/pdf')
  fs.mkdirSync(output, { recursive: true })
  const image = file => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public', file)).toString('base64')
  const props = { data, reference: 'MRF-PRUEBA', issuedAt: '07/10/2026', logo: image('mr-fiesta-contract-logo.png'), signature: image('firma-andre.png') }
  await renderToFile(React.createElement(ContractDocument, props), path.join(output, 'contrato-prueba.pdf'))
  const long = { ...data, detalle_servicio: Array.from({ length: 55 }, (_, i) => `Servicio ${i + 1}: animación e iluminación acordadas con el cliente.\n`).join('') + ' SERVICIO-FINAL', cronograma: Array.from({ length: 45 }, (_, i) => `Paso ${i + 1}: actividad pactada con el cliente.\n`).join('') + ' CRONOGRAMA-FINAL', juegos_elegidos: 'Juego largo y actividad de equipo. '.repeat(70) + ' JUEGOS-FINAL', adicionales_requerimientos: 'Requerimiento adicional y condiciones de acceso. '.repeat(70) + ' ADICIONAL-FINAL' }
  await renderToFile(React.createElement(ContractDocument, { ...props, data: long }), path.join(output, 'contrato-largo-prueba.pdf'))
  console.log('PASS: share, download, cancellation, errors, filenames, draft restoration/debounce/export/races; normal and long PDFs generated.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
