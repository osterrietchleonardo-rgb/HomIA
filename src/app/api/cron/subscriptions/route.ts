import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { finDePrueba } from '@/lib/plans'
import { registrarEvento, purgarEventosViejos } from '@/lib/analytics/server'
import { aplicarBajaSuscripcion, sincronizarCobros, traerPreapproval, vencerPlanesCancelados } from '@/lib/suscripciones-mp'

// ── RECONCILIACIÓN DIARIA DE SUSCRIPCIONES (Vercel Cron) ──
// El webhook de Mercado Pago puede perderse (caída, reintentos agotados). Una vez
// por día se re-consulta a MP cada suscripción de proveedor con plan de pago:
//  · status cancelled | paused → igual que en el webhook (D33): con período pago
//    vigente conserva el plan hasta `planPaidUntil`; sin período pago, vuelve a la prueba;
//  · status authorized pero sin cobro hace más de 35 días → se degrada por falta
//    de pago y se le avisa (si nunca cobró, se cuenta desde el fin de la prueba:
//    un plan elegido durante la prueba tiene su primer cobro ese día);
//  · basic/pro SIN mpPreapprovalId (datos demo / alta manual) → no se toca;
//  · D33: planes cancelados cuyo `planPaidUntil` ya pasó → prueba finalizada + aviso.
// Devuelve { checked, downgraded, vencidos } (+ detalle de errores de MP, que no degradan).
export const maxDuration = 60

const DIAS_SIN_COBRO = 35

export async function GET(request: Request) {
  // Solo el cron de Vercel (Authorization: Bearer CRON_SECRET). Sin secreto
  // configurado el endpoint queda cerrado: nunca se ejecuta "abierto".
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // D33: primero, los planes cancelados cuyo período pago terminó
    const venc = await vencerPlanesCancelados()
    for (const userId of venc.userIds) {
      registrarEvento(null, { name: 'plan_degradado', userId, path: '/panel/proveedor/plan', props: { motivo: 'fin_periodo_pago' } })
    }

    // las suscripciones vigentes (sin baja programada) se re-consultan a MP
    const provs = await db.providerProfile.findMany({
      where: { subscription: { in: ['basic', 'pro'] }, mpPreapprovalId: { not: null }, planPaidUntil: null },
      select: { id: true, userId: true, subscription: true, mpPreapprovalId: true, trialEndsAt: true, createdAt: true },
    })

    let checked = 0
    let downgraded = 0
    let programadas = 0
    const errors: { providerId: string; error: string }[] = []
    let shapeLogged = false

    for (const prov of provs) {
      const preId = prov.mpPreapprovalId!
      let pre: Awaited<ReturnType<typeof traerPreapproval>>
      try {
        pre = await traerPreapproval(preId)
        if (!pre) throw new Error('suscripción no encontrada en Mercado Pago')
      } catch (e) {
        // MP caído o id inexistente: nunca se degrada por un error nuestro o de MP
        errors.push({ providerId: prov.id, error: e instanceof Error ? e.message : 'error' })
        continue
      }
      checked++
      if (!shapeLogged) {
        // forma real de la respuesta (sin datos personales), para ajustar campos si MP cambia
        console.info('[cron subscriptions] forma de preapproval', {
          keys: Object.keys(pre),
          summarizedKeys: pre.summarized ? Object.keys(pre.summarized) : null,
          status: pre.status,
          last_charged_date: pre.summarized?.last_charged_date ?? null,
          next_payment_date: pre.next_payment_date ?? null,
          start_date: pre.auto_recurring?.start_date ?? null,
        })
        shapeLogged = true
      }

      const status = String(pre.status || '')
      let motivo: 'webhook' | 'impago' | null = null

      if (status === 'cancelled' || status === 'paused') {
        motivo = 'webhook'
      } else if (status === 'authorized') {
        // último cobro; si nunca se cobró, desde lo más tarde entre el alta de la suscripción y el fin
        // de la prueba (D33: elegido en la prueba → el primer cobro es al terminar la prueba)
        const nuncaCobrada = (pre.summarized?.charged_quantity ?? 0) === 0
        let ref: Date | null = pre.summarized?.last_charged_date ? new Date(pre.summarized.last_charged_date) : null
        if (!ref && nuncaCobrada && pre.date_created) {
          const alta = new Date(pre.date_created)
          const fin = finDePrueba(prov)
          ref = fin.getTime() > alta.getTime() ? fin : alta
        }
        if (!ref) {
          console.warn('[cron subscriptions] authorized sin fecha de cobro reconocible', { providerId: prov.id })
          continue
        }
        const dias = (Date.now() - ref.getTime()) / 86_400_000
        if (Number.isFinite(dias) && dias > DIAS_SIN_COBRO) motivo = 'impago'
      }
      if (!motivo) continue

      const r = await aplicarBajaSuscripcion({ providerId: prov.id, preapprovalId: preId, status, motivo, source: 'cron', pre })
      if (r.kind === 'ignorar' || !r.aplicado) continue
      if (r.kind === 'programar_baja') programadas++
      else downgraded++
      registrarEvento(null, { name: 'plan_degradado', userId: prov.userId, path: '/panel/proveedor/plan', props: { desde: prov.subscription, motivo: r.kind === 'programar_baja' ? 'mercadopago_con_periodo_pago' : motivo } })
    }

    // D30: reconciliación de los cobros de suscripción con Mercado Pago (los que el webhook no
    // registró) + movimientos del plan reconstruidos con fechas de MP. Nunca tira el cron.
    let cobros: { nuevos: number; actualizados: number; errores: string[] } | { error: string }
    try {
      const rep = await sincronizarCobros({ fuente: 'cron', reconstruirEventos: true, entornos: ['live'] })
      const ents = Object.values(rep.entornos)
      cobros = { nuevos: ents.reduce((s, r) => s + (r?.nuevos ?? 0), 0), actualizados: ents.reduce((s, r) => s + (r?.actualizados ?? 0), 0), errores: rep.errores }
    } catch (e) {
      console.error('[cron subscriptions] reconciliación de cobros', e)
      cobros = { error: e instanceof Error ? e.message : 'error' }
    }

    // retención de métricas de uso (D27): eventos crudos de más de 13 meses (nunca tira)
    const metricasPurgadas = await purgarEventosViejos()
    return NextResponse.json({ success: true, checked, downgraded, programadas, vencidos: venc.vencidos, total: provs.length, errors, metricasPurgadas, cobros })
  } catch (error) {
    console.error('Error in subscriptions cron:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
