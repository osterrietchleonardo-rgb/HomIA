import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { matchScore } from '@/lib/search-match'
import { AREA_IDS, ESTADO_IDS, ROLES_FEEDBACK, TIPO_IDS } from '@/lib/feedback'
import { firmarFotos, refsDeFotos, vistaFeedback } from '@/lib/feedback-server'

// GET /api/admin/feedback — bandeja de sugerencias (solo la sesión de admin de /admin, D29).
// Sin ella responde 404, como si no existiera.
// Filtros: ?status= &type= &role= &area= &q= (búsqueda difusa en título y descripción).
const LIMITE = 500

const valido = (v: string | null, lista: readonly string[]) => (v && lista.includes(v) ? v : undefined)

export async function GET(req: NextRequest) {
  const adm = await requireAdmin()
  if (adm.response) return adm.response

  const sp = req.nextUrl.searchParams
  const where = {
    status: valido(sp.get('status'), ESTADO_IDS),
    type: valido(sp.get('type'), TIPO_IDS),
    role: valido(sp.get('role'), ROLES_FEEDBACK),
    area: valido(sp.get('area'), AREA_IDS),
  }
  const q = (sp.get('q') || '').trim().slice(0, 120)

  const [filas, porEstado] = await Promise.all([
    db.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIMITE,
      include: { user: { select: { id: true, displayName: true, email: true, deletedAt: true } } },
    }),
    db.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  let lista = filas
  if (q) {
    lista = filas
      .map((f) => ({ f, s: matchScore(q, `${f.title} ${f.description}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.f.createdAt.getTime() - a.f.createdAt.getTime())
      .map((x) => x.f)
  }

  const firmas = await firmarFotos(refsDeFotos(lista))
  return ok({
    items: lista.map((f) => ({
      ...vistaFeedback(f, firmas),
      author: {
        id: f.user.id,
        name: f.user.displayName,
        // el email solo si aceptó que lo contacten (y nunca el de una cuenta eliminada)
        email: f.contactOk && !f.user.deletedAt ? f.user.email : null,
        deleted: !!f.user.deletedAt,
      },
    })),
    counts: Object.fromEntries(porEstado.map((c) => [c.status, c._count._all])),
    truncated: filas.length >= LIMITE,
  })
}
