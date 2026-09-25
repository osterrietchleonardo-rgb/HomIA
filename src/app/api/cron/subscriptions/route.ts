import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { planTransicion } from '@/lib/plans'
import { registrarEvento, purgarEventosViejos } from '@/lib/analytics/server'
import { registrarBaja, sincronizarCobros } from '@/lib/suscripciones-mp'

// ── RECONCILIACIÓN DIARIA DE SUSCRIPCIONES (Vercel Cron) ──
// El webhook de Mercado Pago puede perderse (caída, reintentos agotados). Una vez
// por día se re-consulta a MP cada suscripción de proveedor con plan de pago:
//  · status cancelled | paused → se degrada igual que en el webhook;
//  · status authorized pero sin cobro hace más de 35 días → se degrada por falta
//    de pago y se le avisa;
//  · basic/pro SIN mpPreapprovalId (datos demo / alta manual) → no se toca.
// Devuelve { checked, downgraded } (+ detalle de errores de MP, que no degradan).
export const maxDuration = 60

const MP_API = 'https://api.mercadopago.com'
const DIAS_SIN_COBRO = 35

type MpPreapproval = {
  id?: string
  status?: string
  external_reference?: string
  date_created?: string
  next_payment_date?: string
  summarized?: {
    charged_quantity?: number | null
    last_charged_date?: string | null
    last_charged_amount?: number | null
    semaphore?: string | null
  } | null
}

function tokens(): { live: string; test: string } {
  return {
    live: process.env.MP_SUB_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '',
    test: process.env.MP_SUB_TEST_ACCESS_TOKEN || '',
  }
}

async function fetchPreapproval(id: string, token: string): Promise<MpPreapproval> {
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`MP preapproval ${res.status}`)
  return (await res.json()) as MpPreapproval
}

/** Igual que el webhook: si no aparece en producción, se busca en el entorno de prueba (y viceversa). */
async function getPreapprovalAnyEnv(id: string): Promise<MpPreapproval> {
  const { live, test } = tokens()
  const orden = [live, test].filter((t) => t.length > 10)
  if (orden.length === 0) throw new Error('MP_SUB_ACCESS_TOKEN no configurada')
  let lastErr: unknown
  for (const t of orden) {
    try {
      return await fetchPreapproval(id, t)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Mercado Pago no respondió')
}

export async function GET(request: Request) {
  // Solo el cron de Vercel (Authorization: Bearer CRON_SECRET). Sin secreto
  // configurado el endpoint queda cerrado: nunca se ejecuta "abierto".
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const provs = await db.providerProfile.findMany({
      where: { subscription: { in: ['basic', 'pro'] }, mpPreapprovalId: { not: null } },
      select: { id: true, userId: true, subscription: true, mpPreapprovalId: true },
    })

    let checked = 0
    let downgraded = 0
    const errors: { providerId: string; error: string }[] = []
    let shapeLogged = false

    for (const prov of provs) {
      const preId = prov.mpPreapprovalId!
      let pre: MpPreapproval
      try {
        pre = await getPreapprovalAnyEnv(preId)
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
        })
        shapeLogged = true
      }

      const status = String(pre.status || '')
      const plan: 'basic' | 'pro' = prov.subscription === 'pro' ? 'pro' : 'basic'
      let motivo: 'webhook' | 'impago' | null = null

      if (status === 'cancelled' || status === 'paused') {
        motivo = 'webhook'
      } else if (status === 'authorized') {
        // último cobro; si nunca se cobró, se toma la fecha de alta de la suscripción
        const nuncaCobrada = (pre.summarized?.charged_quantity ?? 0) === 0
        const ref = pre.summarized?.last_charged_date || (nuncaCobrada ? pre.date_created : null)
        if (!ref) {
          console.warn('[cron subscriptions] authorized sin fecha de cobro reconocible', { providerId: prov.id })
          continue
        }
        const dias = (Date.now() - new Date(ref).getTime()) / 86_400_000
        if (Number.isFinite(dias) && dias > DIAS_SIN_COBRO) motivo = 'impago'
      }
      if (!motivo) continue

      const t = planTransicion(prov, { id: preId, status }, plan, motivo)
      if (t.kind !== 'degradar') continue
      // D30: movimiento del plan antes del update (idempotente por dedupeKey)
      await registrarBaja({ providerId: prov.id, plan, preapprovalId: preId, tipo: motivo === 'impago' ? 'impago' : status === 'paused' ? 'pausada' : 'cancelada', source: 'cron' })
      const upd = await db.providerProfile.updateMany({
        where: { id: prov.id, mpPreapprovalId: preId, subscription: { in: ['basic', 'pro'] } },
        data: t.data,
      })
      if (upd.count > 0) {
        downgraded++
        await db.notification.create({ data: { userId: prov.userId, ...t.notificacion } })
        registrarEvento(null, { name: 'plan_degradado', userId: prov.userId, path: '/panel/proveedor/plan', props: { desde: prov.subscription, motivo } })
      }
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
    return NextResponse.json({ success: true, checked, downgraded, total: provs.length, errors, metricasPurgadas, cobros })
  } catch (error) {
    console.error('Error in subscriptions cron:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
