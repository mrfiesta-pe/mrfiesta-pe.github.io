/** Uses the existing source URL; never fabricates a contract document or its generation metadata. */
export function contractUrl(raw: string | null): { original: string; preview: string } | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const fileId = url.hostname === 'drive.google.com' ? url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get('id') : null
    const preview = fileId && /^[a-zA-Z0-9_-]+$/.test(fileId) ? `https://drive.google.com/file/d/${fileId}/preview` : url.href
    return { original: url.href, preview }
  } catch { return null }
}
