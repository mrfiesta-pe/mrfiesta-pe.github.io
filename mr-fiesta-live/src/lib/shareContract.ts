export async function shareContract(file: File, clientName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Contrato Mr. Fiesta', text: `Hola ${clientName}, adjunto el contrato para tu evento con Mr. Fiesta.` })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // Browsers can advertise file sharing but block it at runtime.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
