export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_200_000) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84))
  return blob ? new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' }) : file
}
