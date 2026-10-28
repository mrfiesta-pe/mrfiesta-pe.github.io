import type { CrmEvent } from '../types/domain'

export type ProductionStatus = 'unorganized' | 'planning' | 'confirming' | 'ready' | 'setup' | 'live' | 'finished' | 'closed'
export type ActivityStatus = 'pending' | 'preparing' | 'live' | 'completed' | 'cancelled'
export type ActivityKind = 'setup' | 'test' | 'show' | 'travel' | 'teardown' | 'other'
export interface Activity {
  id: string
  name: string
  start: string
  end: string
  responsibleIds: string[]
  notes: string
  status: ActivityStatus
  kind: ActivityKind
  serviceKey?: string
  exception?: string
  confirmed?: boolean
  confirmedAt?: string
  agendaOriginId?: string
  agendaOriginKey?: string
}
export interface StaffAssignment {
  id: string
  collaboratorId: string
  role: string
  arrival: string
  start: string
  end: string
  confirmation: 'pending' | 'confirmed' | 'declined'
  notes: string
  fee: number
  transferMinutes: number
}
export type EquipmentStatus = 'reserved' | 'installed' | 'in_use' | 'pickup' | 'available' | 'maintenance'
export interface EquipmentAsset {
  id: string
  name: string
  category: string
  identifier: string
  status: 'available' | 'maintenance'
  notes?: string
}
export interface EquipmentAssignment {
  id: string
  assetId: string
  start: string
  end: string
  status: EquipmentStatus
  notes: string
  transferMinutes: number
}
export interface ChecklistItem {
  id: string
  label: string
  stage: 'before' | 'setup' | 'show' | 'after'
  serviceKey?: string
  done: boolean
  completedBy?: string
  completedAt?: string
}
export interface Logistics {
  departure: string
  installation: string
  arrival: string
  test: string
  serviceStart: string
  teardown: string
  pickup: string
  vehicle: string
  installerIds: string[]
  teardownIds: string[]
  setupMinutes: number
  transferMinutes: number
  destination: string
  floor: string
  elevator: string
  stairs: string
  vehicleAccess: string
  parking: string
  unloading: string
  entryRestrictions: string
  receptionContact: string
  electricity: string
  space: string
  naturalLight: string
  notes: string
}
export interface Commitment {
  key: string
  planned: boolean
  prepared: boolean
  clientConfirmed: boolean
  executed: boolean
  notes: string
}
export interface Agreement { id: string; date: string; responsible: string; note: string }
export interface Cost { id: string; category: string; description: string; amount: number }
/** Payments are additional to crm_events.adelanto, never a copy of that deposit. */
export interface AdditionalPayment { id: string; amount: number; date: string; note: string }
export interface ActivityTemplate { id: string; name: string; kind: ActivityKind; offsetMinutes?: number; durationMinutes?: number; serviceKey?: string }
export interface AgendaShare { id: string; scope: 'event' | 'day'; at: string; fingerprint: string }
export interface ProductionPlan {
  version: 1
  eventId: string
  status: ProductionStatus
  activities: Activity[]
  staff: StaffAssignment[]
  equipment: EquipmentAssignment[]
  checklist: ChecklistItem[]
  logistics: Logistics
  commitments: Commitment[]
  agreements: Agreement[]
  costs: Cost[]
  payments: AdditionalPayment[]
  notes: string
  reviewedContract: boolean
  exceptions: { key: string; reason: string }[]
  agendaShares?: AgendaShare[]
  activityTemplates?: ActivityTemplate[]
}
export interface ContractService {
  key: string
  label: string
  contracted: boolean | null
  evidence: string
  durationMinutes?: number
}
export interface ProductionContext { event: CrmEvent; plan: ProductionPlan; revision?: number }
export interface Alert {
  key: string
  severity: 'critical' | 'warning'
  message: string
  fix: string
  canJustify: boolean
}
export interface JournalEntry {
  id: string
  event_id: string
  created_at: string
  actor: string
  action: string
  description: string
  old_value?: unknown
  new_value?: unknown
}

export const productionStatuses: Record<ProductionStatus, string> = {
  unorganized: 'Sin organizar', planning: 'En planificación', confirming: 'Personal por confirmar',
  ready: 'Listo para ejecución', setup: 'En montaje', live: 'En desarrollo', finished: 'Finalizado', closed: 'Cerrado',
}
