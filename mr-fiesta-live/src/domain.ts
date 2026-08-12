export type EventStatus = 'draft' | 'active' | 'finished'
export type RequestStatus = 'pending' | 'queued' | 'playing' | 'completed' | 'rejected'
export type PhotoStatus = 'published' | 'pending' | 'hidden'

export interface Event {
  id: string
  name: string
  slug: string
  celebrant_name: string
  celebrant_age: number | null
  event_date: string
  status: EventStatus
  cover_url: string | null
  theme: { gallery_moderation?: 'auto' | 'manual' } | null
  created_at: string
}

export interface Guest {
  id: string
  event_id: string
  display_name: string
  table_number: string | null
  created_at: string
}

export interface SongRequest {
  id: string
  event_id: string
  guest_id: string
  guest_name: string
  table_number: string | null
  song_title: string
  artist: string | null
  dedication: string | null
  status: RequestStatus
  position: number | null
  created_at: string
  approved_at: string | null
  started_at: string | null
  completed_at: string | null
  votes?: number
}

export interface Photo {
  id: string
  event_id: string
  guest_id: string
  guest_name: string
  storage_path: string
  caption: string | null
  status: PhotoStatus
  created_at: string
  public_url?: string
  likes?: number
  reactions?: Record<string, number>
  likedByMe?: boolean
}

export interface ToastMessage { id: number; title: string; body?: string; kind?: 'success' | 'error' | 'info' }

export interface CrmEvent {
  id: string
  cliente: string
  agasajado: string
  tipo_evento: string
  edad: number | null
  invitados: number | null
  telefono: string
  fecha_evento: string
  hora_inicio: string
  hora_fin: string
  lugar: string
  direccion: string
  dni_ruc: string
  referencia: string
  tematica_invitacion: string
  cancion_invitacion: string
  paquete: string
  detalle_servicio: string
  juegos_elegidos: string
  cronograma: string
  adicionales_requerimientos: string
  observaciones: string
  estado_pago: 'Reservado' | 'Pendiente' | 'Pagado'
  total: number
  adelanto: number
  saldo: number
  drive_pdf_url: string | null
  created_at: string
  updated_at: string
}

export interface CrmCollaborator {
  id: string
  nombre: string
  rol: string
  telefono: string
  activo: boolean
  created_at: string
}
