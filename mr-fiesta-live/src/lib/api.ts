import type { Event, Guest, Photo, SongRequest } from '../types/domain'
import { requireSupabase } from './supabase'

export const getEvent = async (slug: string) => {
  const { data, error } = await requireSupabase().from('events').select('*').eq('slug', slug).single()
  if (error) throw error
  return data as Event
}

export async function ensureAnonymousUser() {
  const client = requireSupabase()
  const { data: { session } } = await client.auth.getSession()
  if (session) return session.user
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.user) throw error ?? new Error('No se pudo iniciar la sesión de invitado.')
  return data.user
}

export async function createGuest(eventId: string, displayName: string, tableNumber: string) {
  const user = await ensureAnonymousUser()
  const { data, error } = await requireSupabase().from('guests').insert({
    event_id: eventId, user_id: user.id, display_name: displayName.trim(), table_number: tableNumber.trim() || null,
  }).select('*').single()
  if (error) throw error
  return data as Guest
}

export async function getGuest(id: string) {
  const { data, error } = await requireSupabase().from('guests').select('*').eq('id', id).single()
  if (error) throw error
  return data as Guest
}

export async function updateGuest(id: string, displayName: string, tableNumber: string) {
  const { data, error } = await requireSupabase().from('guests').update({ display_name: displayName.trim(), table_number: tableNumber.trim() || null }).eq('id', id).select('*').single()
  if (error) throw error
  return data as Guest
}

export async function getRequests(eventId: string, guestId?: string) {
  let query = requireSupabase().from('song_requests').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (guestId) query = query.eq('guest_id', guestId)
  const [{ data, error }, { data: voteRows, error: voteError }] = await Promise.all([
    query,
    requireSupabase().from('song_votes').select('song_request_id').eq('event_id', eventId),
  ])
  if (error) throw error
  if (voteError) throw voteError
  const counts = (voteRows ?? []).reduce<Record<string, number>>((result, vote) => ({ ...result, [vote.song_request_id]: (result[vote.song_request_id] ?? 0) + 1 }), {})
  return (data as SongRequest[]).map((request) => ({ ...request, votes: counts[request.id] ?? 0 }))
}

export async function createRequest(event: Event, guest: Guest, values: { song: string; artist: string; dedication: string }) {
  const { data, error } = await requireSupabase().from('song_requests').insert({
    event_id: event.id, guest_id: guest.id, guest_name: guest.display_name, table_number: guest.table_number,
    song_title: values.song.trim(), artist: values.artist.trim() || null, dedication: values.dedication.trim() || null,
  }).select('*').single()
  if (error) throw error
  return data as SongRequest
}

export async function setRequestStatus(request: SongRequest, status: 'queued' | 'rejected' | 'completed') {
  const values = status === 'queued' ? { status, approved_at: new Date().toISOString() } : status === 'completed' ? { status, completed_at: new Date().toISOString() } : { status }
  const { error } = await requireSupabase().from('song_requests').update(values).eq('id', request.id)
  if (error) throw error
}

export async function startRequest(requestId: string) {
  const { error } = await requireSupabase().rpc('start_song_request', { request_id: requestId })
  if (error) throw error
}

export async function getPhotos(eventId: string, guestId: string) {
  const client = requireSupabase()
  const [{ data: photos, error }, { data: likes }, { data: reactions }] = await Promise.all([
    client.from('photos').select('*').eq('event_id', eventId).eq('status', 'published').order('created_at', { ascending: false }),
    client.from('photo_likes').select('photo_id,guest_id').eq('event_id', eventId),
    client.from('photo_reactions').select('photo_id,reaction').eq('event_id', eventId),
  ])
  if (error) throw error
  return (photos ?? []).map((photo) => {
    const photoLikes = (likes ?? []).filter((like) => like.photo_id === photo.id)
    const photoReactions = (reactions ?? []).filter((reaction) => reaction.photo_id === photo.id)
    const counts = photoReactions.reduce<Record<string, number>>((sum, reaction) => ({ ...sum, [reaction.reaction]: (sum[reaction.reaction] ?? 0) + 1 }), {})
    return { ...photo, public_url: client.storage.from('event-photos').getPublicUrl(photo.storage_path).data.publicUrl, likes: photoLikes.length, likedByMe: photoLikes.some((like) => like.guest_id === guestId), reactions: counts } as Photo
  })
}

export async function toggleLike(photo: Photo, guestId: string) {
  const client = requireSupabase()
  if (photo.likedByMe) {
    const { error } = await client.from('photo_likes').delete().eq('photo_id', photo.id).eq('guest_id', guestId)
    if (error) throw error
  } else {
    const { error } = await client.from('photo_likes').insert({ photo_id: photo.id, event_id: photo.event_id, guest_id: guestId })
    if (error) throw error
  }
}

export async function addReaction(photo: Photo, guestId: string, reaction: string) {
  const { error } = await requireSupabase().from('photo_reactions').upsert({ photo_id: photo.id, event_id: photo.event_id, guest_id: guestId, reaction }, { onConflict: 'photo_id,guest_id,reaction' })
  if (error) throw error
}

export async function addComment(photo: Photo, guest: Guest, content: string) {
  const { error } = await requireSupabase().from('photo_comments').insert({ photo_id: photo.id, event_id: photo.event_id, guest_id: guest.id, guest_name: guest.display_name, content: content.trim() })
  if (error) throw error
}
