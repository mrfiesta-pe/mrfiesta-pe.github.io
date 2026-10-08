export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

export function contractFileName(clientName: string) {
  const name = clientName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'Cliente'
  return `Contrato_MrFiesta_${name}.pdf`
}

export function downloadContract(blob: Blob, clientName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = contractFileName(clientName)
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Mobile browsers may read the blob after the click has returned.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

// Call directly from a click with a prepared Blob: rendering first can consume
// the transient user activation required by the native share sheet.
export async function shareContractToWhatsApp(pdfBlob: Blob, clientName: string): Promise<ShareResult> {
  const file = new File([pdfBlob], contractFileName(clientName), { type: 'application/pdf' })
  let supported = false
  try { supported = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) } catch { /* Download below. */ }
  if (supported) {
    try {
      await navigator.share({ files: [file], title: 'Contrato MR FIESTA', text: `Hola ${clientName}, adjunto el contrato para tu evento con Mr. Fiesta.` })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // A failed share is not a successful export; preserve the draft and let
      // the user explicitly retry or choose the separate download button.
      throw error
    }
  }
  downloadContract(pdfBlob, clientName)
  return 'downloaded'
}
