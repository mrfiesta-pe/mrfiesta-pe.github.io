/** Lifecycle regression. All external requests are intercepted; no real CRM writes. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { newPlan } from '../src/production/rules.ts'

const base = process.env.PRODUCTION_TEST_URL || 'http://127.0.0.1:1431/live/'
const rootUrl = `${base}#/production?date=2026-10-31`
const output = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'artifacts')
const userId = '90000000-0000-4000-8000-000000000001'
const otherId = '90000000-0000-4000-8000-000000000002'
const sessionKey = 'sb-cingnjqvzjkhfuqgvnku-auth-token'
const event = {
  id: '10000000-0000-4000-8000-000000000001', cliente: 'CLIENTE SINTÉTICO', agasajado: 'EVENTO SINTÉTICO', tipo_evento: 'Fixture', edad: null, invitados: 20,
  telefono: '', fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00', lugar: 'DISTRITO SINTÉTICO', direccion: 'DIRECCIÓN SINTÉTICA', dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '',
  paquete: 'Personalizado', detalle_servicio: 'Sonido profesional', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: 'PRIVADO',
  estado_pago: 'Reservado', total: 1000, adelanto: 200, saldo: 800, drive_pdf_url: null, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
}
const seed = newPlan(event)
seed.notes = 'BASELINE SINTÉTICO'
seed.activities = [{ id: 'fixture-installation', name: 'Montaje de prueba', kind: 'setup', start: '2026-10-31T15:00', end: '2026-10-31T16:00', responsibleIds: [], notes: '', status: 'pending', confirmed: true }]
const expiry = Math.floor(Date.now() / 1000) + 3600
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const sessionFor = id => ({ access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: expiry, iat: expiry - 3600 })}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T12:00:00Z', is_anonymous: false } })
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' }
const report = { mode: 'Isolated synthetic fixtures; every external request intercepted', checks: [], errors: [] }
const contexts = []
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })

function barrier() { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
async function scenario() {
  const state = { events: [structuredClone(event)], records: [{ event_id: event.id, document: structuredClone(seed), revision: 1, updated_at: '2026-10-27T12:00:00Z', updated_by: userId }], requests: [], expected: [], readBarrier: null, saveBarrier: null, delayedReads: 0, saveCalls: 0 }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  contexts.push(context)
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: sessionKey, session: sessionFor(userId) })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === new URL(base).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue()
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 200, headers, body: '' })
    const name = url.pathname.replace(/^\/rest\/v1\//, '')
    state.requests.push({ method: request.method(), path: url.pathname })
    const reply = value => route.fulfill({ status: 200, headers, body: JSON.stringify(value) })
    if (request.method() === 'OPTIONS') return reply({})
    if (url.pathname.includes('/auth/v1/')) return reply(url.pathname.endsWith('/user') ? sessionFor(userId).user : sessionFor(userId))
    if (name === 'rpc/is_admin') return reply(true)
    if (name === 'rpc/save_crm_production_plan') {
      const body = request.postDataJSON()
      state.saveCalls++; state.expected.push(body.p_expected_revision)
      if (state.saveBarrier) await state.saveBarrier.promise
      const prior = state.records.find(item => item.event_id === body.p_event_id)
      if (body.p_expected_revision !== (prior?.revision || 0)) return route.fulfill({ status: 409, headers, body: JSON.stringify({ code: '40001', message: 'Synthetic stale revision' }) })
      const row = { event_id: body.p_event_id, document: structuredClone(body.p_document), revision: body.p_expected_revision + 1, updated_at: new Date().toISOString(), updated_by: userId }
      state.records = [...state.records.filter(item => item.event_id !== row.event_id), row]
      return reply([row])
    }
    if (request.method() !== 'GET') throw new Error(`Unexpected mutation blocked: ${request.method()} ${url.pathname}`)
    const tables = { crm_events: state.events, crm_collaborators: [], crm_production_plans: state.records, crm_production_assets: [], crm_production_audit: [] }
    if (!(name in tables)) throw new Error(`Unknown endpoint blocked: ${url.pathname}`)
    const snapshot = structuredClone(tables[name])
    if (state.readBarrier && ['crm_events', 'crm_collaborators', 'crm_production_plans'].includes(name)) { state.delayedReads++; await state.readBarrier.promise }
    return reply(snapshot)
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.goto(rootUrl)
  await expect(page.getByRole('heading', { name: 'Agenda de eventos', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Montaje de prueba de EVENTO SINTÉTICO', exact: true })).toBeVisible()
  return { page, state }
}
async function openAdvanced(page) {
  await page.getByRole('button', { name: /ADMINISTRACIÓN AVANZADA/ }).click()
  await expect(page.getByRole('navigation', { name: 'Secciones avanzadas de producción' })).toBeVisible()
  await page.getByRole('button', { name: /Resumen avanzado/ }).click()
  await expect(page.getByLabel(/^Notas internas de producción/)).toBeVisible()
}
async function edit(page, name, next) {
  await page.getByRole('button', { name: `Editar ${name} de EVENTO SINTÉTICO`, exact: true }).click()
  await page.getByLabel('Actividad', { exact: true }).fill(next)
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function switchIdentity(page, id) {
  await page.evaluate(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); const channel = new BroadcastChannel(key); channel.postMessage({ event: 'SIGNED_IN', session }); setTimeout(() => channel.close(), 100) }, { key: sessionKey, session: sessionFor(id) })
}

try {
  {
    const { page, state } = await scenario()
    assert.equal(state.requests.some(request => /assets|audit/.test(request.path)), false)
    await edit(page, 'Montaje de prueba', 'Montaje editado')
    state.saveBarrier = barrier()
    await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
    await expect.poll(() => state.saveCalls).toBe(1)
    state.readBarrier = barrier()
    // Exercise a reload requested after a write began, while its response is still pending.
    await page.getByRole('button', { name: /VER CRONOGRAMA COMPLETO/ }).evaluate(button => button.click())
    await expect.poll(() => state.delayedReads).toBe(3)
    const staleReads = state.readBarrier
    state.saveBarrier.release(); state.saveBarrier = null
    await expect(page.getByRole('button', { name: 'Editar Montaje editado de EVENTO SINTÉTICO', exact: true })).toBeVisible()
    staleReads.release(); state.readBarrier = null
    await settle(page)
    await edit(page, 'Montaje editado', 'Montaje editado otra vez')
    await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Editar Montaje editado otra vez de EVENTO SINTÉTICO', exact: true })).toBeVisible()
    assert.deepEqual(state.expected, [1, 2])
    report.checks.push('A stale reload finishing after a quick save cannot revert the visible activity or its revision; normal browsing does not load inventory or audit')
  }
  {
    const { page, state } = await scenario()
    await openAdvanced(page)
    await page.getByLabel(/^Notas internas de producción/).fill('BORRADOR A DESCARTAR')
    state.records[0].document.notes = 'VERSIÓN NUEVA DEL SERVIDOR'
    await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click()
    await page.getByRole('button', { name: /Resumen avanzado/ }).click()
    await expect(page.getByLabel(/^Notas internas de producción/)).toHaveValue('VERSIÓN NUEVA DEL SERVIDOR')
    assert.equal(state.saveCalls, 0)
    report.checks.push('Explicitly accepting discard-and-reload removes the dirty cache and restores the server document without writing it')
  }
  {
    const { page, state } = await scenario()
    await openAdvanced(page)
    await page.getByLabel(/^Notas internas de producción/).fill('BORRADOR RECUPERABLE')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Agenda de eventos', exact: true })).toBeVisible()
    state.records[0].revision = 2; state.records[0].document.notes = 'CAMBIO DE OTRA PESTAÑA'
    await page.getByRole('button', { name: /VER CRONOGRAMA COMPLETO/ }).click()
    await expect(page.getByText('Cronograma actualizado.', { exact: true })).toBeVisible()
    await openAdvanced(page)
    await expect(page.getByLabel(/^Notas internas de producción/)).toHaveValue('BORRADOR RECUPERABLE')
    await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Otra pestaña actualizó este plan' })).toBeVisible()
    await expect(page.getByLabel(/^Notas internas de producción/)).toHaveValue('BORRADOR RECUPERABLE')
    assert.deepEqual(state.expected, [1])
    assert.equal(state.records[0].document.notes, 'CAMBIO DE OTRA PESTAÑA')
    report.checks.push('Browser Back preserves an advanced draft in memory; returning after a remote update retains its original revision and rejects overwriting the newer document')
  }
  {
    const { page, state } = await scenario()
    await edit(page, 'Montaje de prueba', 'CAMBIO DE SESIÓN ANTERIOR')
    state.saveBarrier = barrier()
    await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
    await expect.poll(() => state.saveCalls).toBe(1)
    state.events[0].agasajado = 'EVENTO DE CUENTA NUEVA'
    state.readBarrier = barrier()
    await switchIdentity(page, otherId)
    await expect.poll(() => state.delayedReads).toBe(3)
    state.saveBarrier.release(); state.saveBarrier = null
    await expect.poll(() => state.records[0].revision).toBe(2)
    const reads = state.readBarrier; state.readBarrier = null; reads.release()
    await expect(page.getByRole('heading', { name: 'Agenda de eventos', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar Montaje de prueba de EVENTO DE CUENTA NUEVA', exact: true })).toBeVisible()
    assert.equal(await page.getByText('CAMBIO DE SESIÓN ANTERIOR', { exact: true }).count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'No se pudo cargar producción', exact: true }).count(), 0)
    report.checks.push('An old-session save completing during a new-session read cannot cancel that read, restore the old edit, or leave the new account stuck saving')
  }
  assert.deepEqual(report.errors, [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.failure = error.stack || String(error)
  try { await contexts.at(-1)?.pages()[0]?.screenshot({ path: path.join(output, 'production-lifecycle-failure.png'), fullPage: true }) } catch {}
  throw error
} finally {
  await fs.writeFile(path.join(output, 'production-lifecycle-browser-report.json'), JSON.stringify(report, null, 2))
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
  console.log(JSON.stringify(report, null, 2))
}
