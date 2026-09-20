import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPayment, getPreapproval } from '@/lib/mercadopago'

// Webhook de Mercado Pago: confirma pagos de facturas, escrow de
// proyectos y altas/bajas de la suscripción PRO de proveedores (preapproval).
export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const bodyData = await req.json().catch(() => ({}) as Record<string, unknown>)
    const type =
      (bodyData as { type?: string; topic?: string }).type ||
      (bodyData as { topic?: string }).topic ||
      sp.get('type') ||
      sp.get('topic') ||
      ''

    // ── Suscripción PRO (preapproval) ──
    if (type.includes('preapproval')) {
      const preapprovalId =
        (bodyData as { data?: { id?: string } }).data?.id ||
        sp.get('data.id') ||
        sp.get('preapproval_id')
      if (preapprovalId) {
        await handlePreapproval(String(preapprovalId))
        return NextResponse.json({ received: true })
      }
    }

    // ── Pagos (facturas y escrow) ──
    const paymentId =
      (bodyData as { data?: { id?: string } }).data?.id ||
      sp.get('data.id') ||
      sp.get('id')

    if (!paymentId) return NextResponse.json({ received: true })

    const payment = await getPayment(String(paymentId))
    if (!payment.externalReference) return NextResponse.json({ received: true })

    // Escrow de proyecto: external_reference = "escrow:<projectId>"
    if (payment.externalReference.startsWith('escrow:')) {
      const projectId = payment.externalReference.slice('escrow:'.length)
      if (payment.status === 'approved') {
        const project = await db.project.findUnique({ where: { id: projectId } })
        if (project && project.escrowStatus === 'none') {
          await db.project.update({
            where: { id: projectId },
            data: {
              escrowStatus: 'retained',
              escrowPaymentId: payment.id,
              escrowAmount: payment.transactionAmount || 0,
            },
          })
          // notificar a las dos partes
          await db.notification.createMany({
            data: [
              {
                userId: project.clientId,
                type: 'escrow_retained',
                title: 'Pago en garantía recibido',
                body: `Tus fondos por "${project.title}" quedaron retenidos. Se liberan cuando des conformidad.`,
                link: `#/panel/cliente/proyectos/${projectId}`,
              },
            ],
          })
          const pro = await db.professionalProfile.findUnique({
            where: { id: project.professionalId },
            select: { userId: true },
          })
          if (pro) {
            await db.notification.create({
              data: {
                userId: pro.userId,
                type: 'escrow_retained',
                title: 'Pago en garantía del cliente',
                body: `El cliente retuvo el pago de "${project.title}". Podés trabajar tranquilo: está en garantía.`,
                link: `#/panel/profesional/proyectos/${projectId}`,
              },
            })
          }
        }
      }
      return NextResponse.json({ received: true })
    }

    // Cobro de materiales proveedor → cliente: external_reference = "charge:<chargeId>"
    if (payment.externalReference.startsWith('charge:')) {
      const chargeId = payment.externalReference.slice('charge:'.length)
      const charge = await db.providerCharge.findUnique({
        where: { id: chargeId },
        include: { provider: { select: { userId: true } } },
      })
      if (charge && payment.status === 'approved' && charge.status !== 'pagada') {
        await db.providerCharge.update({
          where: { id: charge.id },
          data: { status: 'pagada', method: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date() },
        })
        // si el cobro nació de una compra directa, la compra queda pagada → habilita reseña
        if (charge.projectId == null) {
          await db.purchase.updateMany({ where: { chargeId: charge.id }, data: { status: 'pagado' } })
        }
        await db.notification.createMany({
          data: [
            {
              userId: charge.provider.userId,
              type: 'cobro_pagado',
              title: 'Cobro de materiales pagado',
              body: `El cliente pagó tu cobro ${charge.number} con Mercado Pago.`,
              link: '#/panel/proveedor/cobros',
            },
            {
              userId: charge.clientId,
              type: 'cobro_pagado',
              title: 'Pago del cobro acreditado',
              body: `Tu pago de ${charge.number} quedó acreditado para el proveedor.`,
              link: charge.projectId ? `#/panel/cliente/proyectos/${charge.projectId}` : '#/panel/cliente/materiales?tab=compras',
            },
          ],
        })
      }
      return NextResponse.json({ received: true })
    }

    // Factura normal
    const invoice = await db.invoice.findUnique({
      where: { id: payment.externalReference },
    })
    if (!invoice) return NextResponse.json({ received: true })

    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        method: 'mercadopago',
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

// external_reference de suscripción PRO: "pro:provider:<id>" | "pro:professional:<id>"
// (legado pre-producción: "provider_pro:<id>")
function parseProReference(ref: string): { kind: 'provider' | 'professional'; profileId: string } | null {
  if (ref.startsWith('provider_pro:')) {
    return { kind: 'provider', profileId: ref.slice('provider_pro:'.length) }
  }
  const m = /^pro:(provider|professional):(.+)$/.exec(ref)
  if (m) return { kind: m[1] as 'provider' | 'professional', profileId: m[2] }
  return null
}

// Planes de proveedor: "plan:provider:<profileId>:<plan>" (basic|pro)
function parsePlanReference(ref: string): { profileId: string; plan: 'basic' | 'pro' } | null {
  const m = /^plan:provider:(.+):(basic|pro)$/.exec(ref)
  if (m) return { profileId: m[1], plan: m[2] as 'basic' | 'pro' }
  return null
}

async function handlePreapproval(preapprovalId: string) {
  const pre = await getPreapproval(preapprovalId)

  // ── Planes de proveedor (basic | pro) — el único rol con suscripción ──
  const planRef = parsePlanReference(pre.externalReference || '')
  if (planRef) {
    const prov = await db.providerProfile.findUnique({
      where: { id: planRef.profileId },
      select: { id: true, userId: true },
    })
    if (!prov) return
    if (pre.status === 'authorized') {
      await db.providerProfile.update({
        where: { id: prov.id },
        data: { subscription: planRef.plan, proSince: new Date(), mpPreapprovalId: pre.id },
      })
      await db.notification.create({
        data: {
          userId: prov.userId,
          type: 'pro_activa',
          title: planRef.plan === 'pro' ? 'Plan PRO activo' : 'Plan Básico activo',
          body:
            planRef.plan === 'pro'
              ? 'Tu Plan PRO está activo: analítica del negocio, tarjeta Recomendado y sponsor en la home.'
              : 'Tu Plan Básico está activo: usá la plataforma sin límites.',
          link: '#/panel/proveedor/plan',
        },
      })
    } else if (pre.status === 'cancelled' || pre.status === 'paused') {
      // Sin plan de pago vuelve al estado de prueba (ya consumida) → se le pide elegir plan
      await db.providerProfile.update({
        where: { id: prov.id },
        data: { subscription: 'trial', trialEndsAt: new Date(0) },
      })
    }
    return
  }

  const parsed = parseProReference(pre.externalReference || '')
  if (!parsed) return

  if (parsed.kind === 'provider') {
    const prov = await db.providerProfile.findUnique({
      where: { id: parsed.profileId },
      select: { id: true, userId: true },
    })
    if (!prov) return

    if (pre.status === 'authorized') {
      await db.providerProfile.update({
        where: { id: prov.id },
        data: { subscription: 'pro', proSince: new Date(), mpPreapprovalId: pre.id },
      })
      await db.notification.create({
        data: {
          userId: prov.userId,
          type: 'pro_activa',
          title: 'Plan PRO activo',
          body: 'Tu suscripción PRO está activa: tu negocio ya muestra el badge PRO.',
          link: '#/panel/proveedor/perfil',
        },
      })
    } else if (pre.status === 'cancelled' || pre.status === 'paused') {
      await db.providerProfile.update({
        where: { id: prov.id },
        data: { subscription: 'trial', trialEndsAt: new Date(0) },
      })
    }
    return
  }

  // Suscripción PRO de profesional
  const pro = await db.professionalProfile.findUnique({
    where: { id: parsed.profileId },
    select: { id: true, userId: true },
  })
  if (!pro) return

  if (pre.status === 'authorized') {
    await db.professionalProfile.update({
      where: { id: pro.id },
      data: { subscription: 'pro', proSince: new Date(), mpPreapprovalId: pre.id },
    })
    await db.notification.create({
      data: {
        userId: pro.userId,
        type: 'pro_activa',
        title: 'Plan PRO activo',
        body: 'Tu suscripción PRO está activa: tu perfil ya muestra el badge PRO.',
        link: '#/panel/profesional/perfil',
      },
    })
  } else if (pre.status === 'cancelled' || pre.status === 'paused') {
    await db.professionalProfile.update({
      where: { id: pro.id },
      data: { subscription: 'free' },
    })
  }
}
