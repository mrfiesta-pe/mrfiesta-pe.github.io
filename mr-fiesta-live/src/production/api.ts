import { requireSupabase } from '../lib/supabase'
import type { CrmCollaborator, CrmEvent } from '../types/domain'
import type { EquipmentAsset, JournalEntry, ProductionPlan } from './model'

export interface ProductionRecord {
  eventId: string
  document: ProductionPlan
  revision: number
  updatedAt: string
  updatedBy: string
}

export interface ProductionData {
  events: CrmEvent[]
  collaborators: CrmCollaborator[]
  assets: EquipmentAsset[]
  records: ProductionRecord[]
}

interface PlanRow {
  event_id: string
  document: ProductionPlan
  revision: number
  updated_at: string
  updated_by: string
}

function readableError(error: { code?: string; message?: string }): Error {
  if (error.code === '40001' || error.code === '23505') {
    return new Error('Otra pestaña actualizó este plan. Conserva tus cambios, recarga los datos y revisa la versión antes de volver a guardar.')
  }
  if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205') {
    return new Error('El módulo de producción aún no está disponible en Supabase. Falta aplicar la migración production-control.sql.')
  }
  if (error.code === '42501' || error.code === 'PGRST301') {
    return new Error('Tu sesión no tiene permisos de administración de producción. Inicia sesión con una cuenta autorizada del CRM.')
  }
  return new Error(error.message || 'No se pudo completar la operación en Supabase. Revisa tu conexión e inténtalo de nuevo.')
}

async function readAll<T>(table: string, order: string): Promise<T[]> {
  const client = requireSupabase()
  const rows: T[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const result = await client.from(table).select('*').order(order).range(offset, offset + pageSize - 1)
    if (result.error) throw readableError(result.error)
    const page = (result.data || []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function mapRecord(row: PlanRow): ProductionRecord {
  return { eventId: row.event_id, document: row.document, revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by }
}

/** Uses the existing CRM administrator membership, never client editable metadata. */
export async function isProductionAdmin(): Promise<boolean> {
  const client = requireSupabase()
  const session = await client.auth.getSession()
  if (session.error) throw readableError(session.error)
  if (!session.data.session) return false
  const result = await client.rpc('is_admin')
  if (result.error) throw readableError(result.error)
  return result.data === true
}

export async function loadProduction(): Promise<ProductionData> {
  if (!await isProductionAdmin()) throw readableError({ code: '42501' })
  // Load all reservations, including adjacent dates: equipment can remain installed overnight.
  const [events, collaborators, records] = await Promise.all([
    readAll<CrmEvent>('crm_events', 'id'),
    readAll<CrmCollaborator>('crm_collaborators', 'id'),
    readAll<PlanRow>('crm_production_plans', 'event_id'),
  ])
  return { events, collaborators, assets: [], records: records.map(mapRecord) }
}

/** An atomic compare-and-save. A successful network response is the only saved state. */
export async function savePlan(eventId: string, document: ProductionPlan, expectedRevision: number): Promise<ProductionRecord> {
  if (document.eventId !== eventId) throw new Error('El plan no corresponde al evento abierto.')
  const result = await requireSupabase().rpc('save_crm_production_plan', {
    p_event_id: eventId,
    p_document: document,
    p_expected_revision: expectedRevision,
  })
  if (result.error) throw readableError(result.error)
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as PlanRow | undefined
  if (!row || row.event_id !== eventId || row.revision !== expectedRevision + 1) {
    throw new Error('Supabase no confirmó la revisión guardada. Conserva los cambios y recarga para verificar el estado.')
  }
  return mapRecord(row)
}

export async function loadJournal(eventId: string): Promise<JournalEntry[]> {
  const rows: JournalEntry[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await requireSupabase().from('crm_production_audit').select('*').eq('event_id', eventId)
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (result.error) throw readableError(result.error)
    const page = (result.data || []) as JournalEntry[]
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

/** Advanced resources are fetched only when the user opens administration. */
export async function loadAssets(): Promise<EquipmentAsset[]> {
  return readAll<EquipmentAsset>('crm_production_assets', 'id')
}

export async function updateAsset(id: string, input: Partial<Omit<EquipmentAsset, 'id'>>): Promise<EquipmentAsset> {
  const patch: Partial<Omit<EquipmentAsset, 'id'>> = {}
  for (const key of ['name', 'identifier', 'category'] as const) {
    if (input[key] === undefined) continue
    const value = input[key].trim()
    if (!value) throw new Error('El nombre, identificador y categoría no pueden quedar vacíos.')
    patch[key] = value
  }
  if (input.status !== undefined) {
    if (!['available', 'maintenance'].includes(input.status)) throw new Error('Estado de inventario no válido.')
    patch.status = input.status
  }
  if (input.notes !== undefined) patch.notes = input.notes.trim()
  if (!Object.keys(patch).length) throw new Error('No hay cambios de inventario para guardar.')
  const result = await requireSupabase().from('crm_production_assets').update(patch).eq('id', id).select('*').single()
  if (result.error) throw readableError(result.error)
  return result.data as EquipmentAsset
}

export async function createAsset(input: Omit<EquipmentAsset, 'id'>): Promise<EquipmentAsset> {
  const name = input.name.trim()
  const identifier = input.identifier.trim()
  if (!name || !identifier || !input.category.trim()) throw new Error('Completa el nombre, identificador y categoría del equipo.')
  const result = await requireSupabase().from('crm_production_assets').insert({
    name,
    identifier,
    category: input.category.trim(),
    status: input.status,
    notes: input.notes?.trim() || '',
  }).select('*').single()
  if (result.error) {
    if (result.error.code === '23505') throw new Error('Ya existe un equipo con ese identificador. Selecciónalo en el inventario.')
    throw readableError(result.error)
  }
  return result.data as EquipmentAsset
}
