import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { CrmEvent } from '../types/domain'
import { contractClauses } from '../lib/contractClauses'

export type ContractData = Omit<CrmEvent, 'id' | 'created_at' | 'updated_at'>
type Props = { data: ContractData; reference: string; issuedAt: string; logo: string; signature?: string }
const money = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, color: '#242637', paddingTop: 110, paddingHorizontal: 40, paddingBottom: 62 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: 91, backgroundColor: '#0d0d12', borderBottomWidth: 4, borderBottomColor: '#00cde8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32 },
  logo: { width: 112, height: 64, objectFit: 'contain', marginRight: 20 },
  brand: { color: '#ff2f92', fontSize: 23, lineHeight: '28pt', fontFamily: 'Helvetica-Bold' },
  subtitle: { color: '#79eaf4', fontSize: 9, lineHeight: '12pt' },
  reference: { color: '#ffffff', fontSize: 8, lineHeight: '11pt', marginTop: 5 },
  section: { fontSize: 11, lineHeight: '14pt', fontFamily: 'Helvetica-Bold', color: '#a61360', marginTop: 12, marginBottom: 7 },
  paragraph: { marginBottom: 5, lineHeight: '13pt' },
  clauseTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#a61360', marginTop: 10, marginBottom: 5 },
  clauseBody: { fontSize: 9, lineHeight: '12pt', marginBottom: 4 },
  label: { fontFamily: 'Helvetica-Bold' },
  payment: { backgroundColor: '#101322', padding: 16, marginVertical: 16, flexDirection: 'row', justifyContent: 'space-between', borderRadius: 7 },
  paymentLabel: { color: '#b6dfe9', fontSize: 9 },
  amount: { color: '#ffffff', fontSize: 16, marginTop: 3, fontFamily: 'Helvetica-Bold' },
  signatures: { flexDirection: 'row', gap: 40, marginTop: 25 },
  signer: { width: '46%', textAlign: 'center' },
  signatureSpace: { height: 58, justifyContent: 'center', alignItems: 'center' },
  signature: { width: 130, height: 56, objectFit: 'contain' },
  signatureName: { borderTopWidth: 1, borderTopColor: '#777777', paddingTop: 7, fontSize: 9 },
  footer: { position: 'absolute', bottom: 16, left: 40, right: 40, fontSize: 8, color: '#666677', textAlign: 'center', borderTopWidth: 1, borderTopColor: '#dde0e7', paddingTop: 8 },
})

function Paragraph({ label, value }: { label: string; value?: string | number | null }) {
  if (value === '' || value === null || value === undefined) return null
  return <Text style={styles.paragraph} orphans={2} widows={2}><Text style={styles.label}>{label}: </Text>{String(value)}</Text>
}

export function ContractDocument({ data, reference, issuedAt, logo, signature }: Props) {
  return <Document title={`Contrato MR FIESTA - ${data.cliente}`} author="MR FIESTA" language="es-PE">
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header} fixed>
        <Image src={logo} style={styles.logo} />
        <View><Text style={styles.brand}>MR. FIESTA</Text><Text style={styles.subtitle}>CONTRATO DE PRESTACIÓN DE SERVICIOS</Text><Text style={styles.reference}>{reference}</Text></View>
      </View>
      <Text>Fecha de emisión: {issuedAt}</Text>
      <Text style={styles.section} minPresenceAhead={45}>1. CLIENTE Y EVENTO</Text>
      <Paragraph label="Cliente" value={data.cliente} />
      <Paragraph label="DNI / RUC" value={data.dni_ruc} />
      <Paragraph label="Teléfono" value={data.telefono} />
      <Paragraph label="Agasajado/a" value={data.agasajado} />
      <Paragraph label="Edad" value={data.edad} />
      <Paragraph label="Tipo de evento" value={data.tipo_evento} />
      <Paragraph label="Invitados" value={data.invitados} />
      <Paragraph label="Fecha" value={data.fecha_evento} />
      <Paragraph label="Horario" value={`${data.hora_inicio} - ${data.hora_fin || 'Por coordinar'}`} />
      <Paragraph label="Distrito" value={data.lugar} />
      <Paragraph label="Dirección" value={data.direccion} />
      <Paragraph label="Referencia" value={data.referencia} />
      <Paragraph label="Temática de invitación" value={data.tematica_invitacion} />
      <Paragraph label="Canción de invitación" value={data.cancion_invitacion} />
      <Text style={styles.section} minPresenceAhead={45}>2. SERVICIOS CONTRATADOS</Text>
      <Paragraph label="Paquete" value={data.paquete} />
      <Paragraph label="Detalle del servicio" value={data.detalle_servicio} />
      <Paragraph label="Juegos elegidos" value={data.juegos_elegidos} />
      <Paragraph label="Cronograma" value={data.cronograma || 'Por coordinar con el cliente.'} />
      <Paragraph label="Adicionales y requerimientos" value={data.adicionales_requerimientos} />
      <View wrap={false}>
        <Text style={styles.section}>3. COTIZACIÓN Y PAGOS</Text>
        <View style={styles.payment}>
          {[['TOTAL', data.total], ['ADELANTO', data.adelanto], ['SALDO', data.total - data.adelanto]].map(([label, value]) => <View key={label}><Text style={styles.paymentLabel}>{label}</Text><Text style={styles.amount}>{money(Number(value))}</Text></View>)}
        </View>
        <Paragraph label="Estado de pago" value={data.estado_pago} />
      </View>
      <Text style={styles.section} break minPresenceAhead={45}>4. TÉRMINOS Y CONDICIONES DEL SERVICIO</Text>
      {contractClauses.map(([title, body]) => <View key={title}>
        <Text style={styles.clauseTitle} minPresenceAhead={40}>{title}</Text>
        <Text style={styles.clauseBody} orphans={2} widows={2}>{body}</Text>
      </View>)}
      <View style={styles.signatures} wrap={false}>
        <View style={styles.signer}><View style={styles.signatureSpace} /><Text style={styles.signatureName}>{data.cliente}</Text><Text>EL CLIENTE</Text></View>
        <View style={styles.signer}><View style={styles.signatureSpace}>{signature && <Image src={signature} style={styles.signature} />}</View><Text style={styles.signatureName}>JOSÉ ANDRÉ HIDALGO A.</Text><Text>MR. FIESTA</Text></View>
      </View>
      <View fixed style={styles.footer}><Text>MR FIESTA | 961 770 164 - 977 783 926 | mrfiesta.lima@gmail.com</Text><Text render={({ pageNumber, totalPages }) => `${reference} | Página ${pageNumber} de ${totalPages}`} /></View>
    </Page>
  </Document>
}

