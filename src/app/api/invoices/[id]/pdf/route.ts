import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { db } from '@/lib/db'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getSessionUser } from '@/lib/auth'

// Formato de moneda para el PDF (es-AR, sin decimales)
function ars(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function fecha(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}
// pdf-lib StandardFonts usan WinAnsi: reemplazamos glifos fuera de tabla
function winansi(s: string): string {
  return s
    .replace(/\u2192/g, '->').replace(/\u2013|\u2014/g, '-').replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'").replace(/\u2026/g, '...').replace(/\t/g, ' ')
}

// GET /api/invoices/[id]/pdf — comprobante PDF real (cliente o profesional del proyecto)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { items: true, project: { select: { id: true, title: true, stage: true, materialsPaymentMode: true } }, payments: true },
  })
  if (!invoice) return fail('Factura no encontrada', 404)

  // permiso: solo las partes del proyecto
  const client = await db.user.findUnique({ where: { id: invoice.clientId }, select: { id: true, displayName: true, email: true } })
  const pro = await db.professionalProfile.findUnique({
    where: { id: invoice.professionalId },
    include: { user: { select: { displayName: true, email: true } } },
  })
  const isClient = user.id === invoice.clientId
  const isPro = pro ? user.id === pro.userId : false
  if (!isClient && !isPro) return fail('No tenés acceso a esta factura', 403)

  // ── PDF ────────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Factura ${invoice.number} - HomIA`)
  pdf.setCreator('HomIA')
  const page = pdf.addPage([595, 842]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const NAVY = rgb(0.039, 0.145, 0.251)   // #0A2540
  const BLUE = rgb(0.114, 0.388, 0.722)   // #1D63B8
  const ORANGE = rgb(1, 0.353, 0.122)     // #FF5A1F
  const GOLD = rgb(1, 0.78, 0)            // #FFC700
  const INK = rgb(0.15, 0.18, 0.23)
  const MUTED = rgb(0.45, 0.5, 0.56)
  const LINE = rgb(0.88, 0.9, 0.93)
  const SOFT = rgb(0.965, 0.973, 0.98)

  const W = 595, M = 50
  let y = 842

  // banda superior navy
  const bandH = 118
  page.drawRectangle({ x: 0, y: y - bandH, width: W, height: bandH, color: NAVY })
  page.drawRectangle({ x: 0, y: y - bandH, width: W, height: 3, color: GOLD })
  page.drawText('HomIA', { x: M, y: y - 44, size: 26, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Tu hogar, en orden.', { x: M, y: y - 62, size: 9.5, font, color: rgb(0.4, 0.87, 1) })
  page.drawText('Comprobante de obra y servicios', { x: M, y: y - 84, size: 9, font, color: rgb(0.72, 0.8, 0.88) })

  // columna derecha del header: eyebrow + número + fecha + badge, cada uno en su
  // propia línea (sin maxWidth para que pdf-lib no envuelva el texto y pise la fecha)
  page.drawText('FACTURA', { x: W - M - 210, y: y - 34, size: 9, font: bold, color: rgb(0.4, 0.87, 1) })
  // el número se encoge si no entra en los 210pt de la columna
  let numSize = 18
  while (bold.widthOfTextAtSize(invoice.number, numSize) > 210 && numSize > 10) numSize -= 0.5
  page.drawText(invoice.number, { x: W - M - 210, y: y - 58, size: numSize, font: bold, color: rgb(1, 1, 1) })
  page.drawText(`Emitida: ${fecha(invoice.issuedAt)}`, { x: W - M - 210, y: y - 78, size: 9, font, color: rgb(0.72, 0.8, 0.88) })
  const statusLabel = invoice.status === 'pagada' ? 'PAGADA' : invoice.status === 'vencida' ? 'VENCIDA' : 'PENDIENTE DE PAGO'
  const statusColor = invoice.status === 'pagada' ? rgb(0.06, 0.62, 0.43) : invoice.status === 'vencida' ? ORANGE : GOLD
  page.drawRectangle({ x: W - M - 210, y: y - 104, width: bold.widthOfTextAtSize(statusLabel, 8.5) + 16, height: 17, color: statusColor, opacity: 0.95 })
  page.drawText(statusLabel, { x: W - M - 202, y: y - 99, size: 8.5, font: bold, color: NAVY })
  y -= bandH + 26

  const two = (leftTitle: string, leftLines: string[], rightTitle: string, rightLines: string[]) => {
    const colW = (W - M * 2 - 16) / 2
    const box = (x: number, title: string, lines: string[]) => {
      const h = 26 + lines.length * 13 + 10
      page.drawRectangle({ x, y: y - h, width: colW, height: h, color: SOFT })
      page.drawRectangle({ x, y: y - h, width: 3, height: h, color: BLUE })
      page.drawText(title.toUpperCase(), { x: x + 12, y: y - 18, size: 8, font: bold, color: BLUE })
      lines.forEach((ln, i) => {
        const t = winansi(ln)
        page.drawText(t, { x: x + 12, y: y - 34 - i * 13, size: 9.5, font: i === 0 ? bold : font, color: INK, maxWidth: colW - 22 })
      })
      return h
    }
    const h1 = box(M, leftTitle, leftLines)
    const h2 = box(M + colW + 16, rightTitle, rightLines)
    y -= Math.max(h1, h2) + 14
  }

  two(
    'Cliente',
    [client?.displayName || 'Cliente', client?.email || '', ''],
    'Profesional',
    [pro ? (pro.companyName || pro.user.displayName) : 'Profesional', pro?.user.email || '', '']
  )
  two(
    'Proyecto',
    [invoice.project.title, `Etapa: ${invoice.project.stage}`, `Proyecto #${invoice.project.id.slice(-6)}`],
    'Detalle',
    [`Factura: ${invoice.number}`, `Emitida: ${fecha(invoice.issuedAt)}`, invoice.paidAt ? `Pago: ${fecha(invoice.paidAt)}` : 'Pago: pendiente']
  )

  // tabla de items
  page.drawText('DETALLE DEL TRABAJO', { x: M, y: y - 12, size: 9.5, font: bold, color: NAVY })
  y -= 24
  const cols = { desc: M + 10, cant: 380, unit: 448, sub: W - M - 10 }
  page.drawRectangle({ x: M, y: y - 20, width: W - M * 2, height: 20, color: NAVY })
  page.drawText('Descripción', { x: cols.desc, y: y - 14, size: 8.5, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Cant.', { x: cols.cant, y: y - 14, size: 8.5, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Precio unit.', { x: cols.unit, y: y - 14, size: 8.5, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Subtotal', { x: cols.sub - bold.widthOfTextAtSize('Subtotal', 8.5), y: y - 14, size: 8.5, font: bold, color: rgb(1, 1, 1) })
  y -= 20

  const kindLabel: Record<string, string> = { mano_obra: 'Mano de obra', material: 'Material' }
  invoice.items.forEach((it, i) => {
    const rowH = 24
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W - M * 2, height: rowH, color: SOFT })
    const kind = kindLabel[it.kind] || it.kind
    const descFull = winansi(`[${kind}] ${it.description}`)
    let desc = descFull
    while (font.widthOfTextAtSize(desc, 9) > 300 && desc.length > 8) desc = desc.slice(0, -2)
    if (desc !== descFull) desc += '...'
    page.drawText(desc, { x: cols.desc, y: y - 16, size: 9, font, color: INK })
    page.drawText(String(it.quantity).replace('.', ','), { x: cols.cant, y: y - 16, size: 9, font, color: INK })
    page.drawText(ars(it.unitPrice), { x: cols.unit, y: y - 16, size: 9, font, color: INK })
    const st = ars(it.subtotal)
    page.drawText(st, { x: cols.sub - font.widthOfTextAtSize(st, 9), y: y - 16, size: 9, font: bold, color: INK })
    y -= rowH
  })
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE })
  y -= 12

  // totales
  const totalRows: [string, string][] = [
    ['Mano de obra', ars(invoice.laborCost)],
    ['Materiales', ars(invoice.materialsCost)],
  ]
  totalRows.forEach(([k, v]) => {
    page.drawText(k, { x: cols.cant - 60, y: y - 10, size: 9.5, font, color: MUTED })
    page.drawText(v, { x: cols.sub - font.widthOfTextAtSize(v, 9.5), y: y - 10, size: 9.5, font, color: INK })
    y -= 17
  })
  y -= 4
  page.drawRectangle({ x: 330, y: y - 30, width: W - M - 330, height: 30, color: NAVY })
  page.drawText('TOTAL', { x: 344, y: y - 20, size: 10.5, font: bold, color: rgb(1, 1, 1) })
  const total = ars(invoice.total)
  page.drawText(total, { x: W - M - 14 - bold.widthOfTextAtSize(total, 12), y: y - 21.5, size: 12, font: bold, color: GOLD })
  y -= 44

  // modo de pago de materiales (contexto para el cliente)
  if (invoice.project.materialsPaymentMode === 'cliente_paga_proveedor' && invoice.materialsCost === 0) {
    page.drawRectangle({ x: M, y: y - 30, width: W - M * 2, height: 30, color: rgb(0.9, 0.96, 1) })
    page.drawRectangle({ x: M, y: y - 30, width: 3, height: 30, color: BLUE })
    page.drawText('MATERIALES POR FUERA DE ESTA FACTURA', { x: M + 14, y: y - 13, size: 8.5, font: bold, color: BLUE })
    page.drawText(winansi('Los materiales se abonan directamente al proveedor (cobro aparte). Esta factura cubre solo mano de obra.'), {
      x: M + 14, y: y - 25, size: 8.5, font, color: INK, maxWidth: W - M * 2 - 26,
    })
    y -= 44
  }

  // pagos / estado
  const METHOD_LABEL: Record<string, string> = { mercadopago: 'Mercado Pago', efectivo: 'Efectivo' }
  if (invoice.payments.length > 0) {
    page.drawText('PAGOS REGISTRADOS', { x: M, y: y - 10, size: 9, font: bold, color: NAVY })
    y -= 24
    invoice.payments.forEach((p) => {
      const metodo = METHOD_LABEL[p.method] || p.method
      const detalle = p.method === 'efectivo'
        ? (p.confirmedAt ? 'cobro confirmado por el profesional' : 'acordado - esperando confirmacion del profesional')
        : `(${p.mpPaymentId})`
      const ln = `${fecha(p.createdAt)} - ${metodo} - ${detalle} - ${p.status} - ${ars(p.amount)}`
      page.drawText(winansi(ln), { x: M + 4, y, size: 9, font, color: INK, maxWidth: W - M * 2 - 8 })
      y -= 14
    })
    y -= 8
  } else if (invoice.status !== 'pagada') {
    const efectivoAcordado = invoice.paymentMethod === 'efectivo'
    page.drawRectangle({ x: M, y: y - 40, width: W - M * 2, height: 40, color: efectivoAcordado ? rgb(0.93, 0.97, 1) : rgb(1, 0.93, 0.88) })
    page.drawRectangle({ x: M, y: y - 40, width: 3, height: 40, color: efectivoAcordado ? BLUE : ORANGE })
    page.drawText(efectivoAcordado ? 'PAGO EN EFECTIVO ACORDADO' : 'PAGO PENDIENTE', { x: M + 14, y: y - 16, size: 8.5, font: bold, color: efectivoAcordado ? BLUE : ORANGE })
    page.drawText(winansi(efectivoAcordado
      ? 'El cliente acordó pagar en efectivo. Queda saldada cuando el profesional confirma el cobro desde su panel.'
      : 'El cliente elige cómo pagar: Mercado Pago (respaldado por HomIA) o efectivo (el profesional confirma el cobro).'), {
      x: M + 14, y: y - 31, size: 8.5, font, color: INK, maxWidth: W - M * 2 - 26,
    })
    y -= 54
  }

  // footer
  page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 1, color: LINE })
  page.drawText(winansi('Documento generado electrónicamente por HomIA - comprobante interno de la plataforma.'), { x: M, y: 48, size: 8, font, color: MUTED })
  page.drawText(winansi('Métodos de pago: Mercado Pago (con respaldo) o efectivo (el profesional confirma el cobro recibido).'), { x: M, y: 36, size: 8, font, color: MUTED })
  page.drawText('homia.app', { x: W - M - bold.widthOfTextAtSize('homia.app', 8.5), y: 48, size: 8.5, font: bold, color: BLUE })

  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Factura-${invoice.number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
