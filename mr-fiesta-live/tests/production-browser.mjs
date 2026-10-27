/** Local browser integration tests. Every Supabase request is intercepted; fixtures never touch live data. */
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
const collaboratorId = '80000000-0000-4000-8000-000000000001'
const assetId = '70000000-0000-4000-8000-000000000001'
const sessionKey = 'sb-cingnjqvzjkhfuqgvnku-auth-token'
const fixtures = Array.from({ length: 5 }, (_, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`, cliente: `PRUEBA AUTOMÁTICA · Cliente ${index + 1}`, agasajado: `PRUEBA AUTOMÁTICA · Evento ${index + 1}`,
  tipo_evento: 'Fixture de prueba', edad: null, invitados: 20, telefono: '', fecha_evento: '2026-10-31', hora_inicio: `${16 + index}:00`, hora_fin: `${19 + index}:00`,
  lugar: `DISTRITO DE PRUEBA ${index + 1}`, direccion: `DIRECCIÓN SINTÉTICA ${index + 1}`, dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '',
  paquete: 'PAQUETE DE PRUEBA', detalle_servicio: 'Servicio personalizado de prueba; no representa un contrato real.', juegos_elegidos: '', cronograma: '', adicionales_requerimientos: '', observaciones: '',
  estado_pago: 'Reservado', total: 1000, adelanto: 200, saldo: 0, drive_pdf_url: null, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
}))
const declinedCollaboratorId = '80000000-0000-4000-8000-000000000002'
const collaborators = [{ id: collaboratorId, nombre: 'PERSONAL DE PRUEBA', rol: 'Supervisor', telefono: '', activo: true, created_at: '2026-10-01T12:00:00Z' }, { id: declinedCollaboratorId, nombre: 'PERSONAL RECHAZADO DE PRUEBA', rol: 'Asistente', telefono: '', activo: true, created_at: '2026-10-01T12:00:00Z' }]
const assets = [{ id: assetId, name: 'EQUIPO DE PRUEBA', identifier: 'PRUEBA 01', category: 'Otros', status: 'available', notes: '' }]
const seedPlan = newPlan(fixtures[0])
seedPlan.status = 'planning'
seedPlan.activities.push({ id: 'activity-fixture', name: 'ACTIVIDAD SINTÉTICA INICIAL', start: '2026-10-31T09:00', end: '2026-10-31T10:00', responsibleIds: [collaboratorId], notes: '', status: 'pending', kind: 'other' })
seedPlan.staff.push({ id: 'staff-fixture', collaboratorId, role: 'Supervisor de prueba', arrival: '2026-10-31T08:00', start: '2026-10-31T08:00', end: '2026-10-31T23:00', confirmation: 'pending', notes: '', fee: 100, transferMinutes: 45 })
seedPlan.staff.push({ id: 'declined-fixture', collaboratorId: declinedCollaboratorId, role: 'FUNCIÓN RECHAZADA DE PRUEBA', arrival: '2026-10-31T08:00', start: '2026-10-31T08:00', end: '2026-10-31T23:00', confirmation: 'declined', notes: '', fee: 0, transferMinutes: 45 })
seedPlan.equipment.push({ id: 'equipment-fixture', assetId, start: '2026-10-31T08:00', end: '2026-10-31T23:00', status: 'reserved', notes: '', transferMinutes: 45 })
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const expiry = Math.floor(Date.now() / 1000) + 3600
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: expiry, iat: expiry - 3600, is_anonymous: false })}.fixture-test-signature`
const session = { access_token: token, refresh_token: 'fixture-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T12:00:00Z', is_anonymous: false } }
const report = { mode: 'Isolated fixtures: no real Supabase data or credentials', checks: [], screenshots: [], requests: [], errors: [] }
await fs.mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
const contexts = []

async function scenario({ auth = true, admin = true } = {}) {
  const state = { admin, forceStale: false, networkError: false, saveCalls: 0, audit: [], records: [{ event_id: fixtures[0].id, document: structuredClone(seedPlan), revision: 1, updated_at: '2026-10-27T12:00:00Z', updated_by: userId }], dataReads: 0, requests: [], readBarrier: null, delayedReads: 0 }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  contexts.push(context)
  if (auth) await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: sessionKey, value: session })
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === new URL(base).origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    // This deny-by-default external boundary also prevents accidentally accessing linked real PDFs.
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
      state.audit.unshift({ id: `audit-${row.revision}`, event_id: row.event_id, created_at: row.updated_at, actor: userId, action: 'plan_updated', description: `PRUEBA · revisión ${row.revision}`, old_value: prior?.document || null, new_value: row.document })
      return route.fulfill({ status: 200, headers, body: JSON.stringify([row]) })
    }
    if (request.method() !== 'GET') {
      report.errors.push(`Blocked unexpected mutation ${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 403, headers, body: JSON.stringify({ code: '42501', message: 'Test boundary blocks this mutation' }) })
    }
    state.dataReads++
    if (state.readBarrier) { state.delayedReads++; await state.readBarrier }
    const rows = { crm_events: fixtures, crm_collaborators: collaborators, crm_production_assets: assets, crm_production_plans: state.records, crm_production_audit: state.audit }[name]
    if (!rows) {
      report.errors.push(`Unknown mock endpoint ${url.pathname}`)
      return route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Unknown fixture endpoint' }) })
    }
    const eventFilter = url.searchParams.get('event_id')?.replace(/^eq\./, '')
    return route.fulfill({ status: 200, headers, body: JSON.stringify(eventFilter ? rows.filter(row => row.event_id === eventFilter) : rows) })
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  return { page, state }
}
async function screenshot(page, name) {
  const filename = `production-${name}.png`
  await page.screenshot({ path: path.join(output, filename), fullPage: true })
  report.screenshots.push(filename)
}
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth }))
  assert.ok(size.body <= size.viewport + 2, `${name} overflow: ${size.body} > ${size.viewport}`)
  report.checks.push(`${name}: no page overflow`)
}

try {
  const { page, state } = await scenario()
  await page.goto(rootUrl)
  await expect(page.getByRole('heading', { name: 'Centro de producción', exact: true })).toBeVisible()
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  await expect(page.getByRole('navigation', { name: 'Vistas del centro de producción' }).getByRole('button')).toHaveCount(6)
  assert.equal(await page.locator('.prod-open').first().getAttribute('target'), '_blank')
  report.checks.push('Five fixture events, six global views and organizer opens a new tab')
  await screenshot(page, 'desktop-center')
  for (const [label, heading] of [['Tabla', null], ['Cronograma general', 'Cronogramas e instalaciones'], ['Por personal', 'Jornada por colaborador'], ['Por equipos', 'Ubicación programada de equipos'], ['Logística', 'Instalaciones, vehículos y recojos']]) {
    await page.getByRole('navigation', { name: 'Vistas del centro de producción' }).getByRole('button', { name: label, exact: true }).click()
    if (heading) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    else await expect(page.locator('.prod-table tbody tr')).toHaveCount(5)
    if (label === 'Por personal') {
      await expect(page.locator('.prod-day-row')).toHaveCount(1)
      assert.equal(await page.locator('.prod-day-row').filter({ hasText: 'PERSONAL RECHAZADO DE PRUEBA' }).count(), 0)
      await expect(page.locator('.prod-section')).toContainText('PERSONAL RECHAZADO DE PRUEBA')
      report.checks.push('Declined staff assignments do not occupy the daily personnel timeline and remain listed without an active assignment')
    }
  }
  report.checks.push('Table, daily timeline, staff, equipment and logistics views render')
  await page.getByRole('navigation', { name: 'Vistas del centro de producción' }).getByRole('button', { name: 'Tarjetas', exact: true }).click()
  await page.getByLabel('Fecha de producción').fill('2026-11-01')
  await expect(page.locator('.prod-event-card')).toHaveCount(0)
  await page.getByLabel('Fecha de producción').fill('2026-10-31')
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  report.checks.push('Date selector filters actual supplied event dates')
  await page.goto(`${base}#/production/${fixtures[0].id}`)
  await expect(page.getByRole('heading', { name: fixtures[0].agasajado, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '2. Contrato y servicios', exact: true }).click()
  await expect(page.getByText('Este evento no tiene PDF original enlazado.', { exact: false })).toBeVisible()
  assert.equal(await page.locator('.prod-contract-data input').count(), 0)
  report.checks.push('Original contract is read-only and missing PDF has an explicit truthful warning')
  await page.getByRole('button', { name: '3. Cronograma', exact: true }).click()
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill('ACTIVIDAD SINTÉTICA EDITADA')
  await page.getByLabel('Inicio (Lima)', { exact: true }).fill('2026-10-31T10:00')
  await page.getByLabel('Fin (Lima)', { exact: true }).fill('2026-10-31T11:30')
  await expect(page.getByText('Duración calculada: 90 minutos', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Línea de tiempo del evento')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado en Supabase · revisión 2.' })).toBeVisible()
  assert.equal(state.records[0].document.activities[0].name, 'ACTIVIDAD SINTÉTICA EDITADA')
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill('CAMBIO LOCAL DESPUÉS DE GUARDAR')
  await expect(page.locator('.prod-save-panel [role="status"]')).toHaveText('Cambios sin guardar')
  report.checks.push('Editing after a successful save immediately replaces the old saved notice with the unsaved indicator')
  await page.reload()
  await page.getByRole('button', { name: '3. Cronograma', exact: true }).click()
  await expect(page.getByLabel('Nombre de la actividad', { exact: true })).toHaveValue('ACTIVIDAD SINTÉTICA EDITADA')
  await expect(page.getByLabel('Fin (Lima)', { exact: true })).toHaveValue('2026-10-31T11:30')
  report.checks.push('Timeline editing recalculates duration; successful save survives browser reload through mocked remote persistence')
  state.forceStale = true
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill('PRUEBA DE CONCURRENCIA')
  await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Otra pestaña actualizó este plan')
  assert.equal(state.records[0].document.activities[0].name, 'ACTIVIDAD SINTÉTICA EDITADA')
  report.checks.push('Stale revision is reported and cannot overwrite the saved document')
  state.forceStale = false
  state.networkError = true
  await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar producción', exact: true })).toBeEnabled()
  assert.equal(await page.getByRole('status').filter({ hasText: 'Guardado en Supabase' }).count(), 0)
  report.checks.push('Network failure retains unsaved data and never claims the save succeeded')
  state.networkError = false
  await page.getByLabel('Estado de producción', { exact: true }).selectOption('ready')
  const savesBefore = state.saveCalls
  await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Resuelve las alertas críticas')
  assert.equal(state.saveCalls, savesBefore)
  report.checks.push('Incomplete production cannot be marked ready; draft saving remains available')
  await page.reload()
  await page.getByRole('button', { name: '3. Cronograma', exact: true }).click()
  assert.equal(await page.locator('.prod-alerts').getAttribute('open'), null)
  await screenshot(page, 'desktop-organizer')
  await page.setViewportSize({ width: 768, height: 1024 })
  await noOverflow(page, 'Tablet organizer')
  await screenshot(page, 'tablet-organizer')
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page, 'Mobile organizer')
  await screenshot(page, 'mobile-organizer')
  await page.goto(rootUrl)
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  await noOverflow(page, 'Mobile center')
  await screenshot(page, 'mobile-center')

  // An event without a saved production row must show a generated draft that can actually be saved.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}#/production/${fixtures[1].id}`)
  await expect(page.getByRole('heading', { name: fixtures[1].agasajado, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar producción', exact: true })).toBeEnabled()
  await expect(page.locator('.prod-save-panel [role="status"]')).toHaveText('Cambios sin guardar')
  await expect(page.getByRole('button', { name: 'Sugerir recursos disponibles', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sugerir recursos disponibles', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sugerencia en borrador:' })).toBeVisible()
  await page.getByRole('button', { name: '3. Cronograma', exact: true }).click()
  const activityNames = await page.getByLabel('Nombre de la actividad', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value))
  assert.ok(activityNames.includes('Instalación'))
  assert.ok(activityNames.includes('Pruebas técnicas'))
  assert.ok(activityNames.includes('Desmontaje'))
  assert.ok((await page.getByLabel('Inicio (Lima)', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value))).every(value => value === ''))
  await page.getByRole('button', { name: 'Guardar producción', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Guardado en Supabase · revisión 1.' })).toBeVisible()
  assert.ok(state.records.some(row => row.event_id === fixtures[1].id && row.document.activities.some(activity => activity.kind === 'setup')))
  await page.reload()
  await page.getByRole('button', { name: '3. Cronograma', exact: true }).click()
  await expect(page.getByLabel('Nombre de la actividad', { exact: true })).toHaveCount(activityNames.length)
  report.checks.push('A previously unorganized event opens a generated, immediately saveable draft with setup, tests and teardown; no schedule or assignments are invented')

  // Occupation is an interval, so a reservation must remain visible on a day between installation and pickup.
  const originalDate = fixtures[1].fecha_evento
  const existingSecond = state.records.find(row => row.event_id === fixtures[1].id)
  const priorSecondDocument = structuredClone(existingSecond.document)
  fixtures[1].fecha_evento = '2026-10-30'
  existingSecond.document.equipment = [{ id: 'overnight-fixture', assetId, start: '2026-10-30T09:00', end: '2026-11-02T09:00', status: 'reserved', notes: 'PRUEBA: instalación multifecha', transferMinutes: 45 }]
  existingSecond.document.logistics.installation = '2026-10-30T09:00'
  existingSecond.document.logistics.pickup = '2026-11-02T09:00'
  await page.goto(`${base}#/production?date=2026-11-01`)
  await page.reload() // Fetch the deliberately changed remote fixtures; hash navigation preserves loaded React state.
  await expect(page.locator('.prod-event-card')).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Vistas del centro de producción' }).getByRole('button', { name: 'Por equipos', exact: true }).click()
  await expect(page.locator('.prod-day-track')).toContainText('DISTRITO DE PRUEBA 2')
  await page.getByRole('navigation', { name: 'Vistas del centro de producción' }).getByRole('button', { name: 'Logística', exact: true }).click()
  await expect(page.locator('.prod-table tbody')).toContainText(fixtures[1].cliente)
  fixtures[1].fecha_evento = originalDate
  existingSecond.document = priorSecondDocument
  report.checks.push('Equipment installed October 30 and collected November 2 remains visible on November 1, although the event date differs')

  await page.goto(`${base}#/crm`)
  await expect(page.getByRole('link', { name: '🎛️ CENTRO DE PRODUCCIÓN', exact: true })).toBeVisible()
  assert.equal(await page.getByRole('link', { name: '🎛️ CENTRO DE PRODUCCIÓN', exact: true }).getAttribute('target'), '_blank')
  await expect(page.getByRole('link', { name: '📋 ORGANIZAR EVENTO', exact: true })).toHaveCount(5)
  assert.ok((await page.getByRole('link', { name: '📋 ORGANIZAR EVENTO', exact: true }).evaluateAll(links => links.map(link => link.target))).every(value => value === '_blank'))
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('link', { name: '🎛️ CENTRO DE PRODUCCIÓN', exact: true })).toBeVisible()
  await noOverflow(page, 'Mobile existing CRM with production links')
  await screenshot(page, 'mobile-crm-entry')
  report.checks.push('Existing CRM exposes the general production center and one organizer link per event, all in new tabs')

  // Exercise the real Supabase cross-tab auth notification while old authorized reads are still in flight.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(rootUrl)
  await expect(page.locator('.prod-event-card')).toHaveCount(5)
  let releaseReads
  state.readBarrier = new Promise(resolve => { releaseReads = resolve })
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect.poll(() => state.delayedReads).toBe(4)
  state.admin = false
  const switchedId = '90000000-0000-4000-8000-000000000002'
  const switchedToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: switchedId, aud: 'authenticated', role: 'authenticated', exp: expiry, iat: expiry - 3600, is_anonymous: false })}.fixture-test-signature`
  const switchedSession = { ...session, access_token: switchedToken, user: { ...session.user, id: switchedId, email: 'unauthorized-fixture@example.invalid' } }
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value))
    const channel = new BroadcastChannel(key)
    channel.postMessage({ event: 'SIGNED_IN', session: value })
    setTimeout(() => channel.close(), 100)
  }, { key: sessionKey, value: switchedSession })
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  const oldResponses = Promise.all(['crm_events', 'crm_collaborators', 'crm_production_assets', 'crm_production_plans'].map(table => page.waitForResponse(response => new URL(response.url()).pathname === `/rest/v1/${table}`)))
  releaseReads()
  state.readBarrier = null
  await Promise.all((await oldResponses).map(response => response.finished()))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('.prod-event-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  assert.equal(await page.getByText(fixtures[0].cliente, { exact: true }).count(), 0)
  report.checks.push('Switching to another unauthorized account clears prior private data; delayed responses from the old identity cannot restore it')
  report.requests.push(...state.requests)

  const noauth = await scenario({ auth: false })
  await noauth.page.goto(rootUrl)
  await expect(noauth.page.getByRole('link', { name: 'Entrar desde el CRM' })).toBeVisible()
  assert.equal(noauth.state.dataReads, 0)
  report.checks.push('Unauthenticated visitors receive the CRM login link without loading private tables')
  const denied = await scenario({ admin: false })
  await denied.page.goto(rootUrl)
  await expect(denied.page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  assert.equal(denied.state.dataReads, 0)
  report.checks.push('Authenticated non-admin visitors cannot load private production tables')
  assert.deepEqual(report.errors, [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.failure = error.stack || String(error)
  throw error
} finally {
  await fs.writeFile(path.join(output, 'production-browser-report.json'), JSON.stringify(report, null, 2))
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
  console.log(JSON.stringify({ result: report.result, checks: report.checks, screenshots: report.screenshots, errors: report.errors }, null, 2))
}
