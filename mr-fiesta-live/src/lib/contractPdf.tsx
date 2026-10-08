import { pdf } from '@react-pdf/renderer'
import { Buffer } from 'buffer'
import { ContractDocument, type ContractData } from '../components/ContractDocument'

// The PNG decoder used by react-pdf expects Buffer even in its browser build.
// This module is lazy loaded, so the polyfill is only loaded for PDF generation.
const runtime = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
runtime.Buffer ??= Buffer

async function asset(name: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}${name}`)
  if (!response.ok) throw new Error(`No se pudo cargar ${name}. Intenta de nuevo.`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error(`El recurso ${name} no es una imagen.`)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`No se pudo leer ${name}.`))
    reader.readAsDataURL(blob)
  })
}

export async function createContractPdf(data: ContractData, reference: string) {
  const [logo, signature] = await Promise.all([asset('mr-fiesta-contract-logo.png'), asset('firma-andre.png')])
  return pdf(<ContractDocument data={data} reference={reference} issuedAt={new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} logo={logo} signature={signature} />).toBlob()
}
