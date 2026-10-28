/** Agenda browser acceptance tests with synthetic fixtures. Every Supabase request is intercepted. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { newPlan } from '../src/production/rules.ts'
import { buildAgendaPdf } from '../src/production/agendaExports.ts'

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const output = path.join(project, 'artifacts')
const base = process.env.PRODUCTION_TEST_URL || 'http://127.0.0.1:1431/live/'
const rootUrl = `${base}#/production?date=2026-10-31`
const userId = '90000000-0000-4000-8000-000000000001'
const djId = '80000000-0000-4000-8000-000000000001'
const glitterId = '80000000-0000-4000-8000-000000000002'
const adminId = '80000000-0000-4000-8000-000000000004'
const declinedId = '80000000-0000-4000-8000-000000000003'
const sessionKey = 'sb-cingnjqvzjkhfuqgvnku-auth-token'
const fixtures = Array.from({ length: 5 }, (_, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`, cliente: `PRUEBA AUTOMÁTICA · Cliente ${index + 1}`, agasajado: `PRUEBA AUTOMÁTICA · Evento ${index + 1}`,
  tipo_evento: 'Fixture', edad: null, invitados: 20, telefono: '999009001', fecha_evento: '2026-10-31', hora_inicio: '18:00', hora_fin: '21:00',
  lugar: `DISTRITO DE PRUEBA ${index + 1}`, direccion: `DIRECCIÓN SINTÉTICA ${index + 1}`, dni_ruc: '', referencia: '', tematica_invitacion: '', cancion_invitacion: '',
  paquete: 'Ultra Chicoteca LED', detalle_servicio: '3 horas de experiencia: 1 hora de estación Glitter + 2 horas de animación con animador(a). Incluye DJ, sonido profesional, pista LED, proyector y ecran, luces y accesorios.', juegos_elegidos: '',
  cronograma: 'Estación Glitter 5:50 pm a 6:50 pm, Show 6:50 pm a 8:50 pm, DJ de cierre 8:50 pm a 9:00 pm.', adicionales_requerimientos: 'EXTRA DE PRUEBA', observaciones: 'OBSERVACIÓN PRIVADA DE PRUEBA',
  estado_pago: 'Reservado', total: 1000, adelanto: 200, saldo: 0, drive_pdf_url: index === 1 ? 'https://drive.google.com/file/d/0123456789abcdefghijklmnop/view' : null, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
}))
const collaborators = [
  { id: adminId, nombre: 'ADMIN DE PRUEBA', rol: 'Administración', telefono: '999009002', activo: true, created_at: '2026-10-01T12:00:00Z' },
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
seedPlan.activities.push({ id: 'cross-day-transfer', name: 'TRASLADO NOCTURNO DE PRUEBA', start: '2026-10-30T23:30', end: '2026-10-31T00:30', responsibleIds: [adminId], notes: 'NOTA OPERATIVA PRIVADA', status: 'pending', kind: 'travel', confirmed: true })
seedPlan.staff.push({ id: 'admin-fixture', collaboratorId: adminId, role: 'Administración', arrival: '2026-10-31T18:00', start: '2026-10-31T18:00', end: '2026-10-31T21:00', confirmation: 'confirmed', notes: 'NOTA PRIVADA ADMIN', fee: 9876.54, transferMinutes: 45 })
seedPlan.costs.push({ id: 'secret-cost', category: 'PRIVADO', description: 'COSTO PRIVADO DE PRUEBA', amount: 6543.21 })
seedPlan.agreements.push({ id: 'door-agreement', date: '2026-10-27T10:00', responsible: 'ADMIN DE PRUEBA', note: 'El cliente autoriza ingreso por la puerta lateral.' })
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
  const filename = `production-agenda-${name}.png`
  await page.screenshot({ path: path.join(output, filename), fullPage: !(await page.getByRole('dialog').count()) })
  report.screenshots.push(filename)
}
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
  assert.ok(size.width <= size.viewport + 2, `${name}: ${size.width} > ${size.viewport}`)
  const overflowingClocks = await page.locator('.agenda-row-info time,.agenda-card-row>time').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent))
  assert.deepEqual(overflowingClocks, [], `${name}: clock labels overlap the next column`)
  report.checks.push(`${name}: no page overflow`)
}
const views = page => page.getByRole('navigation', { name: 'Vistas de la agenda' })
const eventCard = (page, index = 0) => page.locator(`#agenda-event-${fixtures[index].id}`)
const dialog = page => page.getByRole('dialog')
const check = text => { report.checks.push(text); console.log(`PASS ${text}`) }
const secrets = ['COSTO PRIVADO', 'NOTAS LEGACY', 'NOTA PRIVADA', 'OBSERVACIÓN PRIVADA', '9876', '6543']
const privateTextExcluded = text => { for (const secret of secrets) assert.equal(text.includes(secret), false, `Private value leaked: ${secret}`) }
async function editGlitter(page) {
  const card = eventCard(page)
  await card.locator('.agenda-card-row').filter({ hasText: /Glitter/i }).first().getByRole('button', { name: /^Editar / }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Editar actividad' })).toBeVisible()
}
async function modalInViewport(page, name) {
  const box = await dialog(page).boundingBox(), viewport = page.viewportSize()
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, name)
}

try {
  const { page, state } = await scenario()
  await page.goto(rootUrl)
  await expect(page.getByRole('heading', { name: 'Agenda de eventos', exact: true })).toBeVisible()
  assert.deepEqual(await views(page).getByRole('button').allTextContents(), ['CRONOGRAMA GENERAL', 'POR EVENTO'])
  await expect(views(page).getByRole('button', { name: 'CRONOGRAMA GENERAL', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.agenda-event-count')).toHaveText('5 eventos')
  await expect(page.locator('.agenda-timeline-row').first()).toContainText('TRASLADO NOCTURNO DE PRUEBA')
  await expect(page.locator('.agenda-timeline-row').first()).toContainText('30/10/26')
  await expect(page.locator('.agenda-timeline-row').filter({ hasText: 'Estación Glitter' }).first()).toContainText('17:50 – 18:50')
  const timelineText = await page.locator('.event-agenda').innerText()
  privateTextExcluded(timelineText)
  for (const removed of ['Equipamiento', 'Logística', 'Bitácora', 'Checklist', 'Estado de producción']) assert.equal(timelineText.includes(removed), false)
  assert.equal(await page.locator('.event-agenda input').count(), 1)
  assert.equal(state.saveCalls, 0)
  assert.equal(state.dataReads, 3)
  await screenshot(page, 'desktop-general')
  const initialReads = state.dataReads
  await page.getByRole('button', { name: '⚡ VER CRONOGRAMA COMPLETO', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cronograma actualizado.' })).toBeVisible()
  assert.equal(state.dataReads, initialReads + 3)
  assert.equal(state.saveCalls, 0)
  check('Flow 1: opening and refreshing all five events is read-only, with two views and a chronological agenda')

  await page.getByLabel('Fecha de la agenda').fill('2026-11-10')
  await expect(page.getByRole('heading', { name: 'No hay eventos programados para esta fecha' })).toBeVisible()
  await expect.poll(() => state.dataReads).toBe(initialReads + 6)
  await expect(page.getByRole('button', { name: 'PDF del día', exact: true })).toBeDisabled()
  state.events[4].agasajado = 'EVENTO ACTUALIZADO DESDE CRM'
  await page.getByLabel('Fecha de la agenda').fill('2026-10-31')
  await expect(page.locator('.agenda-general')).toContainText('EVENTO ACTUALIZADO DESDE CRM')
  assert.equal(state.saveCalls, 0)
  check('Changing the day automatically reloads current CRM data and handles an empty date without writing')

  await views(page).getByRole('button', { name: 'POR EVENTO', exact: true }).click()
  await expect(page.locator('.agenda-events>.agenda-event')).toHaveCount(5)
  const card = eventCard(page)
  await expect(card.locator('.agenda-team')).toContainText('ADMIN DE PRUEBA')
  await expect(card.locator('.agenda-team')).toContainText('DJ DE PRUEBA · por confirmar')
  await expect(card.locator('.agenda-team')).toContainText('Por asignar')
  assert.equal((await card.innerText()).includes('RECHAZADO DE PRUEBA'), false)
  await expect(card.getByRole('link', { name: 'Maps ↗', exact: true })).toHaveAttribute('href', /google\.com\/maps\/search\//)
  await expect(card.getByRole('link', { name: 'Llamar', exact: true })).toHaveAttribute('href', 'tel:+51999009001')
  await card.getByRole('button', { name: 'Contrato', exact: true }).click()
  await expect(dialog(page)).toContainText('No hay PDF original enlazado.')
  await expect(dialog(page)).toContainText(fixtures[0].detalle_servicio)
  await expect(dialog(page)).toContainText(fixtures[0].cronograma)
  await expect(dialog(page)).toContainText('OBSERVACIÓN PRIVADA DE PRUEBA')
  await expect(dialog(page)).toContainText('Saldo contractual calculado')
  await expect(dialog(page)).toContainText('S/ 800.00')
  await expect(dialog(page)).toContainText('puerta lateral')
  assert.equal(await dialog(page).locator('input,select,textarea').count(), 0)
  await page.getByRole('button', { name: 'Cerrar contrato', exact: true }).click()
  await eventCard(page, 1).getByRole('button', { name: 'Contrato', exact: true }).click()
  await expect(dialog(page).getByRole('link', { name: 'Abrir original / descargar ↗' })).toHaveAttribute('href', fixtures[1].drive_pdf_url)
  await dialog(page).getByRole('button', { name: 'Ver PDF aquí', exact: true }).click()
  await expect(dialog(page).locator('iframe')).toHaveAttribute('src', /drive\.google\.com\/file\/d\/.+\/preview/)
  await page.getByRole('button', { name: 'Cerrar contrato', exact: true }).click()
  await views(page).getByRole('button', { name: 'CRONOGRAMA GENERAL', exact: true }).click()
  await page.locator('.agenda-row-info').first().click()
  await expect(dialog(page).getByRole('heading', { name: 'Información del evento' })).toBeVisible()
  await expect(dialog(page)).toContainText('DIRECCIÓN SINTÉTICA 1')
  await page.getByRole('button', { name: 'Cerrar Información del evento', exact: true }).click()
  await views(page).getByRole('button', { name: 'POR EVENTO', exact: true }).click()
  check('Flow 2: event cards expose assigned and missing roles, real contract information, original PDF, Maps and phone actions')

  await editGlitter(page)
  assert.equal(await dialog(page).locator('input,select,textarea').count(), 5)
  await expect(page.getByLabel('Inicio de la actividad')).toHaveValue('2026-10-31T17:50')
  await expect(page.getByLabel('Fin de la actividad')).toHaveValue('2026-10-31T18:50')
  await page.getByLabel('Actividad', { exact: true }).fill('Glitter ajustado por producción')
  await page.getByLabel('Inicio de la actividad').fill('2026-10-31T17:40')
  await page.getByLabel('Fin de la actividad').fill('2026-10-31T18:40')
  await page.getByLabel('Responsables de la actividad').selectOption(glitterId)
  await page.getByLabel('Observación de la actividad').fill('NOTA PRIVADA DE EDICIÓN')
  await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(card).toContainText('Glitter ajustado por producción')
  const saved = state.records.find(row => row.event_id === fixtures[0].id).document
  assert.ok(saved.activities.some(activity => activity.name === 'Glitter ajustado por producción' && activity.start === '2026-10-31T17:40' && activity.confirmed === true))
  assert.deepEqual(saved.equipment, seedPlan.equipment)
  assert.deepEqual(saved.logistics, seedPlan.logistics)
  assert.deepEqual(saved.staff, seedPlan.staff)
  assert.deepEqual(saved.checklist, seedPlan.checklist)
  assert.deepEqual(saved.costs, seedPlan.costs)
  assert.equal(saved.notes, seedPlan.notes)
  assert.equal(state.events[0].cronograma, fixtures[0].cronograma)
  assert.ok(saved.activities.some(activity => activity.id === 'legacy-activity'))
  await page.goto(`${base}#/production/${fixtures[0].id}`)
  await expect(views(page).getByRole('button', { name: 'POR EVENTO', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(eventCard(page)).toContainText('Glitter ajustado por producción')
  await expect(eventCard(page)).toContainText('17:40 – 18:40')
  await screenshot(page, 'desktop-events')
  check('Flow 3: the five-field editor saves a confirmed override, survives reload and preserves all contract and advanced data')

  await page.evaluate(() => { window.__openedUrls = []; window.open = url => { window.__openedUrls.push(String(url)); return null } })
  const callsBeforePreview = state.saveCalls
  await eventCard(page).getByRole('button', { name: 'WhatsApp', exact: true }).click()
  const preview = await page.getByLabel('Vista previa del mensaje').inputValue()
  assert.ok(preview.includes('Glitter ajustado por producción'))
  assert.ok(preview.includes('17:40'))
  privateTextExcluded(preview)
  await expect(page.getByLabel('Teléfono de destino')).toHaveValue('999009002')
  assert.equal(state.saveCalls, callsBeforePreview)
  assert.deepEqual(await page.evaluate(() => window.__openedUrls), [])
  await screenshot(page, 'desktop-whatsapp-preview')
  state.events[0].direccion = 'DIRECCIÓN ACTUALIZADA EN SEGUNDO PLANO'
  await page.locator('.agenda-show-button').evaluate(button => button.click())
  await expect(page.locator('.agenda-general')).toBeVisible()
  await views(page).getByRole('button', { name: 'POR EVENTO', exact: true }).evaluate(button => button.click())
  await expect(eventCard(page)).toContainText('DIRECCIÓN ACTUALIZADA EN SEGUNDO PLANO')
  await expect(page.getByRole('button', { name: 'Abrir WhatsApp', exact: true })).toBeEnabled()
  assert.equal(await page.getByLabel('Vista previa del mensaje').inputValue(), preview)
  await page.getByRole('button', { name: 'Abrir WhatsApp', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  const opened = await page.evaluate(() => window.__openedUrls)
  assert.equal(opened.length, 1)
  const whatsapp = new URL(opened[0])
  assert.equal(whatsapp.hostname, 'wa.me')
  assert.equal(whatsapp.pathname, '/51999009002')
  assert.equal(whatsapp.searchParams.get('text'), preview)
  await expect(eventCard(page)).toContainText('La última orden preparada usa otro cronograma.')
  assert.ok(state.records.find(row => row.event_id === fixtures[0].id).document.agendaShares?.length)
  const downloadPromise = page.waitForEvent('download')
  await eventCard(page).getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloadPromise
  assert.ok(download.suggestedFilename().endsWith('.pdf'))
  await download.saveAs(path.join(output, 'production-agenda-event.pdf'))
  await expect(page.getByRole('status').filter({ hasText: 'PDF del evento generado.' })).toBeVisible()
  await expect(eventCard(page).locator('.agenda-share-warning')).toHaveCount(0)
  const currentPlan = state.records.find(row => row.event_id === fixtures[0].id).document
  const pdf = buildAgendaPdf('2026-10-31', [{ event: state.events[0], plan: currentPlan }], collaborators, fixtures[0].id).output()
  privateTextExcluded(pdf)
  check('Flow 4: WhatsApp requires preview and explicit opening; prepared versions stay accurate across refresh and private finances never enter messages or PDF')

  await editGlitter(page)
  await page.getByLabel('Actividad', { exact: true }).fill('CAMBIO SIN GUARDAR')
  state.forceStale = true
  await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('Otra pestaña actualizó')
  await expect(page.getByLabel('Actividad', { exact: true })).toHaveValue('CAMBIO SIN GUARDAR')
  state.forceStale = false; state.networkError = true
  await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Actividad', { exact: true })).toHaveValue('CAMBIO SIN GUARDAR')
  state.networkError = false
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(eventCard(page)).toContainText('Glitter ajustado por producción')
  check('Flow 5: stale revisions and network failures retain unsaved edits and never claim a successful write')

  await page.getByLabel('Fecha de la agenda').fill('2026-10-30')
  await expect(page.locator('.agenda-event-count')).toContainText('0 eventos')
  await expect(page.locator('.agenda-event-count')).toContainText('1 con movimientos')
  await expect(page.locator('.agenda-events>.agenda-event')).toHaveCount(1)
  await expect(eventCard(page).locator('.agenda-other-date')).toContainText('31/10/26')
  await views(page).getByRole('button', { name: 'CRONOGRAMA GENERAL', exact: true }).click()
  await expect(page.locator('.agenda-timeline-row')).toHaveCount(1)
  await expect(page.locator('.agenda-timeline-row')).toContainText('TRASLADO NOCTURNO DE PRUEBA')
  await expect(page.locator('.agenda-timeline-row')).toContainText('30/10/26 → 31/10/26')
  await expect(page.getByRole('button', { name: 'PDF del día', exact: true })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'No hay eventos programados para esta fecha' })).toHaveCount(0)
  check('Adjacent-date operations remain visible with explicit dates even when no event starts that day')

  await page.getByLabel('Fecha de la agenda').fill('2026-10-31')
  await expect(page.locator('.agenda-event-count')).toContainText('5 eventos')
  await page.setViewportSize({ width: 768, height: 1024 })
  await noOverflow(page, 'Tablet agenda'); await screenshot(page, 'tablet-general')
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page, 'Mobile agenda'); await screenshot(page, 'mobile-general')
  await page.locator('.agenda-row-edit').filter({ hasText: 'Editar' }).first().click()
  await modalInViewport(page, 'Mobile editor stays in the viewport')
  await noOverflow(page, 'Mobile quick edit'); await screenshot(page, 'mobile-edit')
  await page.getByRole('button', { name: 'Cerrar edición', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Guardar cambio', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await views(page).getByRole('button', { name: 'POR EVENTO', exact: true }).click()
  await noOverflow(page, 'Mobile event cards'); await screenshot(page, 'mobile-events')
  await eventCard(page).getByRole('button', { name: 'Contrato', exact: true }).click()
  await modalInViewport(page, 'Mobile contract stays in the viewport')
  await noOverflow(page, 'Mobile contract'); await screenshot(page, 'mobile-contract')
  await page.getByRole('button', { name: 'Cerrar contrato', exact: true }).click()
  await eventCard(page).getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await modalInViewport(page, 'Mobile preview stays in the viewport')
  await noOverflow(page, 'Mobile WhatsApp preview'); await screenshot(page, 'mobile-preview')
  await page.getByRole('button', { name: 'Cerrar Compartir cronograma', exact: true }).click()
  check('Flow 6: tablet and phone layouts have no horizontal overflow; modals fit, trap focus and close with Escape')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(rootUrl)
  await expect(page.getByRole('heading', { name: 'Agenda de eventos', exact: true })).toBeVisible()
  let releaseReads
  state.readBarrier = new Promise(resolve => { releaseReads = resolve })
  await page.getByRole('button', { name: '⚡ VER CRONOGRAMA COMPLETO', exact: true }).click()
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
  await expect(page.locator('.agenda-event,.agenda-timeline-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  check('Account switches erase private data and delayed responses from three previous reads cannot restore it')
  report.requests.push(...state.requests)
  const noauth = await scenario({ auth: false })
  await noauth.page.goto(rootUrl)
  await expect(noauth.page.getByRole('link', { name: 'Entrar desde el CRM' })).toBeVisible()
  assert.equal(noauth.state.dataReads, 0)
  const denied = await scenario({ admin: false })
  await denied.page.goto(rootUrl)
  await expect(denied.page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  assert.equal(denied.state.dataReads, 0)
  assert.equal(state.requests.some(request => /assets|audit/.test(request.path)), false)
  check('Unauthenticated and non-admin users read no private tables; main agenda never reads assets or audit history')
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
