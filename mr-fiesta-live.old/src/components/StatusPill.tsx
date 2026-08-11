import type { RequestStatus } from '../types/domain'
const labels: Record<RequestStatus, string> = { pending: 'Pendiente', queued: 'En cola', playing: 'Sonando', completed: 'Finalizado', rejected: 'No disponible' }
export function StatusPill({ status }: { status: RequestStatus }) { return <span className={`status-pill ${status}`}>{labels[status]}</span> }
