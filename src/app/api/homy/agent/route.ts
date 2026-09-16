import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { runHomyAgent, type AgentMode } from '@/lib/homy-agent'

export const runtime = 'nodejs'

const BodySchema = z.object({
  message: z.string().min(1).max(800),
  mode: z.enum(['cliente', 'profesional', 'auto']).default('auto'),
  sessionId: z.string().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Datos inválidos' }, { status: 400 })
  }
  const { message, mode, sessionId, lat, lng } = parsed.data
  const user = await getSessionUser()

  try {
    // historial de la sesión (persistente)
    let history: { role: 'user' | 'homy'; content: string }[] = []
    let session: Awaited<ReturnType<typeof db.homySession.findUnique>> = null
    if (sessionId) {
      session = await db.homySession.findUnique({ where: { id: sessionId } })
      if (session) {
        const msgs = await db.homyMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'asc' },
          take: 10,
        })
        history = msgs
          .filter((m) => m.role !== 'tool')
          .map((m) => ({ role: m.role as 'user' | 'homy', content: m.content }))
      }
    }

    const result = await runHomyAgent({
      messages: [...history, { role: 'user', content: message }],
      mode,
      lat: lat ?? user?.lat ?? null,
      lng: lng ?? user?.lng ?? null,
    })

    // persistir sesión real
    let activeSessionId = sessionId
    if (user) {
      if (!activeSessionId || !session) {
        const s = await db.homySession.create({
          data: { userId: user.id, title: message.slice(0, 60) },
        })
        activeSessionId = s.id
      }
      await db.homyMessage.createMany({
        data: [
          { sessionId: activeSessionId, role: 'user', content: message },
          { sessionId: activeSessionId, role: 'homy', content: result.message },
        ],
      })
    }

    // registrar evento de búsqueda (analítica del grafo)
    const foundCount =
      (result.results.professionals?.length || 0) +
      (result.results.jobs?.length || 0) +
      (result.results.materials?.length || 0) +
      (result.results.comparables?.length || 0)
    await db.searchEvent.create({
      data: {
        userId: user?.id || null,
        mode,
        query: message,
        intent: JSON.stringify({ steps: result.steps, question: result.question }),
        results: JSON.stringify({ count: foundCount }),
      },
    })

    return NextResponse.json({
      ok: true,
      sessionId: activeSessionId,
      message: result.message,
      suggestions: result.suggestions,
      intent: result.intent,
      question: result.question,
      results: result.results,
      steps: result.steps,
      foundCount,
    })
  } catch (error) {
    console.error('[api/homy/agent] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'El superagente tuvo un problema. Probá de nuevo.' },
      { status: 500 }
    )
  }
}
