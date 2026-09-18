// Purga del dato creado por el E2E t27: reseña Valentina→Ferrer en el proyecto baño.
// Deja intacta la reseña seed (Valentina→Matías) y el resto del demo.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const valentina = await db.user.findUnique({ where: { email: 'cliente@homia.test' }, select: { id: true } })
const ferrer = await db.user.findUnique({ where: { email: 'proveedor@homia.test' }, select: { id: true } })
const BATH = 'cmu6jhr5i0012r979cp7lwwp6'

if (valentina && ferrer) {
  const del = await db.review.deleteMany({
    where: { authorId: valentina.id, targetUserId: ferrer.id, projectId: BATH },
  })
  console.log('Reseñas E2E purgadas:', del.count)
} else {
  console.log('Usuarios demo no encontrados; nada que purgar')
}
await db.$disconnect()
