import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPayment } from '@/lib/mercadopago'

// Webhook de Mercado Pago: confirma pagos de facturas
export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const bodyData = await req.json().catch(() => ({}) as Record<string, unknown>)
    const paymentId =
      (bodyData as { data?: { id?: string } }).data?.id ||
      sp.get('data.id') ||
      sp.get('id')

    if (!paymentId) return NextResponse.json({ received: true })

    const payment = await getPayment(String(paymentId))
    if (!payment.externalReference) return NextResponse.json({ received: true })

    const invoice = await db.invoice.findUnique({
      where: { id: payment.externalReference },
    })
    if (!invoice) return NextResponse.json({ received: true })

    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        mpPaymentId: payment.id,
        status: payment.status,
        amount: payment.transactionAmount || invoice.total,
      },
    })

    if (payment.status === 'approved' && invoice.status !== 'pagada') {
      await db.invoice.update({
        where: { id: invoice.id },
        data: { status: 'pagada', mpPaymentId: payment.id, paidAt: new Date() },
      })
      // notificar al profesional
      const pro = await db.professionalProfile.findUnique({
        where: { id: invoice.professionalId },
        select: { userId: true },
      })
      if (pro) {
        await db.notification.create({
          data: {
            userId: pro.userId,
            type: 'factura_pagada',
            title: 'Factura pagada',
            body: `${invoice.number} fue pagada por Mercado Pago`,
            link: '#/panel/profesional/facturas',
          },
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('MP webhook error:', e)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
