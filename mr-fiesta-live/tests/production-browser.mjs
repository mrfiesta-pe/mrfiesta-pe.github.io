/** Browser regression for the simple workflow. Every Supabase request is intercepted. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { newPlan } from '../src/production/rules.ts'

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const output = path.join(project, 'artifacts')
const base = process.env.PRODUCTION_TEST_URL || 'http://127.0.0.1:1431/live/'
const rootUrl = `${base}#/production?date=2026-10-31`
const userId = '90000000-0000-4000-8000-000000000001'
const djId = '80000000-0000-4000-8000-000000000001'
const glitterId = '80000000-0000-4000-8000-000000000002'
const declinedId = '80000000-0000-4000-8000-000000000003'
const sessionKey = 'sb-cingnjqvzjkhfuqgvnku-auth-token'
const fixtures = Array.from({ length: 5 }, (_, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`, cliente: `PRUEBA AUTOMÁTICA · Cliente ${index + 1}`, agasajado: `PRUEBA AUTOMÁTICA · Evento ${index + 1}`,
  tipo_evento: 'Fixture', edad: null, invitados: 20, telefono: '', fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00',
  lugar: `DISTRITO DE PRUEBA ${index + 1}`, direccion: `DIRECCIÓN SINTÉTICA ${index + 1}`, dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '',
  paquete: 'Ultra Chicoteca LED', detalle_servicio: '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación con animador(a). Incluye DJ, sonido profesional, pista LED, proyector y ecran, luces y accesorios.', juegos_elegidos: '',
  cronograma: 'Estación Glitter 5:50 pm a 6:50 pm, Show 6:50 pm a 8:50 pm, DJ de cierre 8:50 pm a 9:00 pm.', adicionales_requerimientos: 'EXTRA DE PRUEBA', observaciones: 'OBSERVACIÓN PRIVADA DE PRUEBA',
  estado_pago: 'Reservado', total: 1000, adelanto: 200, saldo: 0, drive_pdf_url: null, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
}))
const collaborators = [
  { id: djId, nombre: 'DJ DE PRUEBA', rol: 'DJ', telefono: '', activo: true, created_at: '2026-10-01T12:00:00Z' },
  { id: glitterId, nombre: 'GLITTER DE PRUEBA', rol: 'Responsable de Glitter', telefono: '', activo: true, created_at: '2026-10-01T12:00:00Z' },
  { id: declinedId, nombre: 'RECHAZADO DE PRUEBA', rol: 'Animación', telefono: '', activo: true, created_at: '2026-10-01T12:00:00Z' },
]
const seedPlan = newPlan(fixtures[0])
seedPlan.status = 'planning'
seedPlan.activities.push({ id: 'legacy-activity', name: 'ACTIVIDAD ANTIGUA A CONSERVAR', start: '2026-10-31T09:00', end: '2026-10-31T10:00', responsibleIds: [], notes: 'PRIVADO', status: 'pending', kind: 'setup' })
seedPlan.staff.push({ id: 'staff-fixture', collaboratorId: djId, role: 'DJ', arrival: '2026-10-31T18:00', start: '2026-10-31T18:00', end: '2026-10-31T21:00', confirmation: 'pending', notes: 'NOTA PRIVADA', fee: 100, transferMinutes: 45 })
seedPlan.staff.push({ id: 'declined-fixture', collaboratorId: declinedId, role: 'FUNCIÓN RECHAZADA DE PRUEBA', arrival: '2026-10-31T18:00', start: '2026-10-31T18:00', end: '2026-10-31T21:00', confirmation: 'declined', notes: '', fee: 0, transferMinutes: 45 })
seedPlan.equipment.push({ id: 'legacy-equipment', assetId: '70000000-0000-4000-8000-000000000001', start: '2026-10-30T08:00', end: '2026-11-02T10:00', status: 'reserved', notes: 'CONSERVAR', transferMinutes: 45 })
seedPlan.logistics.vehicle = 'VEHÍCULO LEGACY A CONSERVAR'
seedPlan.notes = 'NOTAS LEGACY A CONSERVAR'
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const expiry = Math.floor(Date.now() / 1000) + 3600
const tokenFor = id => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: expiry, iat: expiry - 3600, is_anonymous: false })}.fixture-signature`
const session = { access_token: tokenFor(userId), refresh_token: 'fixture-token', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T12:00:00Z', is_anonymous: false } }
const report = { mode: 'Isolated fixtures: no real Supabase data or credentials', checks: [], screenshots: [], requests: [], errors: [] }
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
const contexts = []

async function scenario({ auth = true, admin = true } = {}) {
  const state = { admin, events: structuredClone(fixtures), forceStale: false, networkError: false, saveCalls: 0, records: [{ event_id: fixtures[0].id, document: structuredClone(seedPlan), revision: 1, updated_at: '2026-10-27T12:00:00Z', updated_by: userId }], dataReads: 0, requests: [], readBarrier: null, delayedReads: 0 }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  contexts.push(context)
  if (auth) await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: sessionKey, value: session })
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } })
    const name = url.pathname.replace(/^\/rest\/v1\//, '')
    state.requests.push({ method: request.method(), path: url.pathname })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers, body: '{}' })
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ status: 200, headers, body: JSON.stringify(url.pathname.endsWith('/user') ? session.user : session) })
    if (name === 'rpc/is_admin') return route.fulfill({ status: 200, headers, body: JSON.stringify(state.admin) })
    if (name === 'rpc/save_crm_production_plan') {
      state.saveCalls++
      if (state.networkError) return route.abort('failed')
      const body = request.postDataJSON(), prior = state.records.find(row => row.event_id === body.p_event_id)
      if (state.forceStale || body.p_expected_revision !== (prior?.revision || 0)) return route.fulfill({ status: 409, headers, body: JSON.stringify({ code: '40001', message: 'Fixture stale revision' }) })
      const row = { event_id: body.p_event_id, document: structuredClone(body.p_document), revision: body.p_expected_revision + 1, updated_at: new Date().toISOString(), updated_by: userId }
      state.records = [...state.records.filter(item => item.event_id !== row.event_id), row]
      return route.fulfill({ status: 200, headers, body: JSON.stringify([row]) })
    }
    if (request.method() !== 'GET') {
      report.errors.push(`Blocked unexpected mutation ${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 403, headers, body: JSON.stringify({ code: '42501', message: 'Test boundary blocks this mutation' }) })
    }
    state.dataReads++
    if (state.readBarrier) { state.delayedReads++; await state.readBarrier }
    const rows = { crm_events: state.events, crm_collaborators: collaborators, crm_production_plans: state.records }[name]
    if (!rows) {
      report.errors.push(`Unknown or removed endpoint ${url.pathname}`)
      return route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Unknown fixture endpoint' }) })
    }
    return route.fulfill({ status: 200, headers, body: JSON.stringify(rows) })
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  return { page, state }
}
async function screenshot(page, name) {
  const filename = `production-simple-${name}.png`
  await page.screenshot({ path: path.join(output, filename), fullPage: true })
  report.screenshots.push(filename)
}
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
  assert.ok(size.width <= size.viewport + 2, `${name}: ${size.width} > ${size.viewport}`)
  report.checks.push(`${name}: no page overflow`)
}
const tabs = page => page.getByRole('navigation', { name: 'Secciones del organizador' })
const checklistPanel = page => page.getByRole('region', { name: 'Checklist', exact: true })
const save = page => page.getByRole('button', { name: 'Guardar producción', exact: true })

try {
  const { page, state } = await scenario()
  await page.goto(rootUrl)
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  const globalViews = page.getByRole('navigation', { name: 'Vistas del centro de producción' })
  assert.deepEqual(await globalViews.getByRole('button').allTextContents(), ['Tarjetas', 'Tabla', 'Personal del día'])
  assert.equal(await page.locator('.prod-open').first().getAttribute('target'), '_blank')
  await screenshot(page, 'desktop-center')
  await globalViews.getByRole('button', { name: 'Tabla', exact: true }).click()
  await expect(page.locator('.prod-table tbody tr')).toHaveCount(5)
  await globalViews.getByRole('button', { name: 'Personal del día', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Personal del día', exact: true })).toBeVisible()
  await expect(page.locator('.prod-section')).toContainText('DJ DE PRUEBA')
  assert.equal(await page.locator('.prod-section').getByText('RECHAZADO DE PRUEBA', { exact: true }).count(), 0)
  report.checks.push('Five events, three global views and new-tab organizer links; declined staff do not occupy the daily personnel view')
  await globalViews.getByRole('button', { name: 'Tarjetas', exact: true }).click()
  await page.getByLabel('Fecha de producción').fill('2026-11-01')
  await expect(page.locator('.prod-event-card')).toHaveCount(0)
  await page.getByLabel('Fecha de producción').fill('2026-10-31')
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  report.checks.push('Date selector filters the day without fixed runtime dates')

  await page.goto(`${base}#/production/${fixtures[0].id}`)
  await expect(page.getByRole('heading', { name: 'Checklist de salida', exact: true })).toBeVisible()
  assert.deepEqual(await tabs(page).getByRole('button').allTextContents(), ['Personal', 'Checklist', 'Resumen del evento'])
  await expect(tabs(page).getByRole('button', { name: 'Checklist', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(checklistPanel(page)).toContainText('EXTRA DE PRUEBA')
  assert.equal(await checklistPanel(page).locator('input:not([type=checkbox]),select,textarea').count(), 0)
  assert.equal(await page.getByRole('button', { name: /Actualizar borrador|Sugerir recursos|Registrar equipo|Añadir tarea/ }).count(), 0)
  for (const label of ['Durante el evento', 'Durante el show', 'Al terminar', 'Durante la instalación']) assert.equal(await checklistPanel(page).getByRole('heading', { name: label, exact: true }).count(), 0)
  report.checks.push('Exactly three organizer tabs, departure checklist by default, automatic CRM extras and no manual schedule/equipment/logistics/logbook/service matrix')
  await screenshot(page, 'desktop-checklist')

  await checklistPanel(page).getByRole('checkbox').first().check()
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado en Supabase' })).toBeVisible()
  const saved = state.records.find(row => row.event_id === fixtures[0].id).document
  assert.ok(saved.checklist.some(task => task.id.startsWith('simple-') && task.done))
  assert.deepEqual(saved.equipment, seedPlan.equipment)
  assert.deepEqual(saved.logistics, seedPlan.logistics)
  assert.deepEqual(saved.activities, seedPlan.activities)
  assert.equal(saved.notes, seedPlan.notes)
  await page.reload()
  await expect(checklistPanel(page).getByRole('checkbox').first()).toBeChecked()
  report.checks.push('Checklist save survives reload and preserves legacy activities, equipment, logistics and notes without exposing their forms')

  state.events[0].adicionales_requerimientos += '\nEXTRA NUEVO DESDE CRM'
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(checklistPanel(page)).toContainText('EXTRA NUEVO DESDE CRM')
  await expect(checklistPanel(page).getByRole('checkbox').first()).toBeChecked()
  report.checks.push('New CRM extras appear automatically on reload without a manual regeneration button or lost checks')

  await tabs(page).getByRole('button', { name: 'Personal', exact: true }).click()
  await expect(tabs(page).getByRole('button', { name: 'Personal', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByLabel('Colaborador', { exact: true }).selectOption(glitterId)
  await page.getByRole('button', { name: 'Agregar al evento', exact: true }).click()
  const glitter = page.locator('.prod-resource-card').filter({ hasText: 'GLITTER DE PRUEBA' })
  await expect(glitter.getByLabel('Inicio', { exact: true })).toHaveValue('2026-10-31T17:50')
  await expect(glitter.getByLabel('Salida', { exact: true })).toHaveValue('2026-10-31T18:50')
  await glitter.getByLabel('Confirmación', { exact: true }).selectOption('confirmed')
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado en Supabase' })).toBeVisible()
  assert.equal(state.records[0].document.staff.find(person => person.collaboratorId === glitterId).confirmation, 'confirmed')
  report.checks.push('Personal fills service-specific times from the contract and saves explicit confirmation')

  await tabs(page).getByRole('button', { name: 'Resumen del evento', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Finanzas', exact: true })).toBeVisible()
  await expect(page.getByText(fixtures[0].detalle_servicio, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cronograma del contrato', exact: true })).toBeVisible()
  assert.equal(await page.locator('.prod-simple-contract input,.prod-simple-contract textarea').count(), 0)
  assert.equal(await page.getByRole('button', { name: /Añadir actividad|Registrar acuerdo/ }).count(), 0)
  assert.equal(await page.getByText('ACTIVIDAD ANTIGUA A CONSERVAR', { exact: true }).count(), 0)
  await expect(page.getByText('Saldo pendiente', { exact: true })).toBeVisible()
  await expect(page.locator('.prod-metric').filter({ hasText: 'Saldo pendiente' })).toContainText('S/ 800.00')
  await expect(page.getByText('No hay PDF original enlazado.', { exact: false })).toBeVisible()
  report.checks.push('Final summary shows the full stored contract, read-only current chronology and finances with calculated balance')
  await screenshot(page, 'desktop-summary')

  await tabs(page).getByRole('button', { name: 'Checklist', exact: true }).click()
  await checklistPanel(page).getByRole('checkbox').first().uncheck()
  await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toBeVisible()
  state.forceStale = true
  await save(page).click()
  await expect(page.getByRole('alert')).toContainText('Otra pestaña actualizó este plan')
  await expect(checklistPanel(page).getByRole('checkbox').first()).not.toBeChecked()
  state.forceStale = false; state.networkError = true
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toBeVisible()
  assert.equal(await page.getByRole('status').filter({ hasText: 'Guardado en Supabase' }).count(), 0)
  state.networkError = false
  report.checks.push('Stale writes and network errors preserve the edited checklist and never claim a successful save')

  const beforeReady = state.saveCalls
  await page.getByLabel('Estado de producción', { exact: true }).selectOption('ready')
  await save(page).click()
  await expect(page.getByRole('alert')).toContainText('Completa el checklist de salida')
  assert.equal(state.saveCalls, beforeReady)
  await page.getByLabel('Estado de producción', { exact: true }).selectOption('planning')
  report.checks.push('Ready requires departure checks and team confirmation, with no hidden equipment or manual chronology requirements')

  await page.goto(`${base}#/production/${fixtures[1].id}`)
  await expect(page.getByRole('heading', { name: 'Checklist de salida', exact: true })).toBeVisible()
  await expect(save(page)).toBeEnabled()
  await expect(checklistPanel(page)).toContainText('EXTRA DE PRUEBA')
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado en Supabase' })).toBeVisible()
  report.checks.push('A new event opens its generated departure checklist and can save immediately without editing another field')

  await page.setViewportSize({ width: 768, height: 1024 })
  await noOverflow(page, 'Tablet checklist'); await screenshot(page, 'tablet-checklist')
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page, 'Mobile checklist'); await screenshot(page, 'mobile-checklist')
  await tabs(page).getByRole('button', { name: 'Resumen del evento', exact: true }).click()
  await noOverflow(page, 'Mobile summary'); await screenshot(page, 'mobile-summary')
  await page.goto(rootUrl)
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  await noOverflow(page, 'Mobile center'); await screenshot(page, 'mobile-center')
  await page.goto(`${base}#/crm`)
  await expect(page.getByRole('link', { name: '🎛️ CENTRO DE PRODUCCIÓN', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '📋 ORGANIZAR EVENTO', exact: true })).toHaveCount(5)
  assert.equal(await page.getByRole('link', { name: '🎛️ CENTRO DE PRODUCCIÓN', exact: true }).getAttribute('target'), '_blank')
  await noOverflow(page, 'Mobile CRM entry')
  report.checks.push('Existing CRM entry points remain visible and open production in new tabs')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(rootUrl)
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  let releaseReads
  state.readBarrier = new Promise(resolve => { releaseReads = resolve })
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect.poll(() => state.delayedReads).toBe(3)
  state.admin = false
  const switchedId = '90000000-0000-4000-8000-000000000002'
  const switchedSession = { ...session, access_token: tokenFor(switchedId), user: { ...session.user, id: switchedId, email: 'unauthorized@example.invalid' } }
  await page.evaluate(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); const channel = new BroadcastChannel(key); channel.postMessage({ event: 'SIGNED_IN', session: value }); setTimeout(() => channel.close(), 100) }, { key: sessionKey, value: switchedSession })
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  const pending = Promise.all(['crm_events', 'crm_collaborators', 'crm_production_plans'].map(table => page.waitForResponse(response => new URL(response.url()).pathname === `/rest/v1/${table}`)))
  releaseReads(); state.readBarrier = null
  await Promise.all((await pending).map(response => response.finished()))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('.prod-event-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  report.checks.push('Account changes erase private data and delayed responses from three old reads cannot restore it')
  report.requests.push(...state.requests)

  const noauth = await scenario({ auth: false })
  await noauth.page.goto(rootUrl)
  await expect(noauth.page.getByRole('link', { name: 'Entrar desde el CRM' })).toBeVisible()
  assert.equal(noauth.state.dataReads, 0)
  const denied = await scenario({ admin: false })
  await denied.page.goto(rootUrl)
  await expect(denied.page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  assert.equal(denied.state.dataReads, 0)
  report.checks.push('Unauthenticated and non-admin visitors cannot load private event tables')
  assert.equal(state.requests.some(request => /assets|audit/.test(request.path)), false)
  assert.deepEqual(report.errors, [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.failure = error.stack || String(error)
  try { await screenshot(contexts[0].pages()[0], 'failure'); console.error(await contexts[0].pages()[0].getByRole('heading').allTextContents()) } catch {}
  throw error
} finally {
  await fs.writeFile(path.join(output, 'production-browser-report.json'), JSON.stringify(report, null, 2))
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
  console.log(JSON.stringify({ result: report.result, checks: report.checks, screenshots: report.screenshots, errors: report.errors }, null, 2))
}
