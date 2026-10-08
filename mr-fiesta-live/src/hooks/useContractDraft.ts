import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'mrfiesta_contract_draft'
type Snapshot<T> = { version: 1; form: T; editingId: string | null }

export function useContractDraft<T extends object>(initial: T) {
  const [form, setForm] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const exported = useRef<string | null>(null)
  const latest = useRef('')
  const serialized = JSON.stringify({ version: 1, form, editingId } satisfies Snapshot<T>)
  latest.current = serialized

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Snapshot<T>
        if (saved.version !== 1 || !saved.form || typeof saved.form !== 'object') throw new Error('Invalid draft')
        // Only restore known fields of the expected primitive type.
        const restored = { ...initial }
        for (const key of Object.keys(initial) as (keyof T)[]) {
          const value = saved.form[key]
          const expected = initial[key]
          if (expected === null ? value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) : typeof value === typeof expected) restored[key] = value
        }
        setForm(restored)
        setEditingId(typeof saved.editingId === 'string' ? saved.editingId : null)
        setMessage('Borrador recuperado de este dispositivo.')
      }
    } catch { setMessage('No se pudo recuperar el borrador local. Revisa los datos antes de continuar.') }
    setReady(true)
  }, [initial])

  useEffect(() => {
    if (!ready) return
    const persist = () => {
      if (exported.current === latest.current) return
      try { localStorage.setItem(KEY, latest.current); setMessage('Borrador guardado en este dispositivo.') }
      catch { setMessage('No se pudo guardar el borrador local. No cierres la página antes de exportar.') }
    }
    const timeout = window.setTimeout(persist, 500)
    const onHide = () => { if (document.visibilityState === 'hidden') persist() }
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', onHide)
    return () => { window.clearTimeout(timeout); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', onHide) }
  }, [ready, serialized])

  const clearExportedDraft = useCallback((snapshot: string) => {
    if (snapshot !== latest.current) return // Do not erase edits made during an export.
    try {
      localStorage.removeItem(KEY)
      exported.current = snapshot // Prevent a pending debounce from recreating it.
      setMessage('Contrato exportado. Borrador local eliminado.')
    } catch { setMessage('Contrato exportado; no se pudo eliminar el borrador local.') }
  }, [])

  return { form, setForm, editingId, setEditingId, draftReady: ready, draftMessage: message, draftSnapshot: serialized, clearExportedDraft }
}
