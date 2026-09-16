import 'server-only'
import { db } from '@/lib/db'

// Crea CRM pipelines por defecto según roles del usuario
export async function ensureDefaultPipelines(userId: string, roles: string[]) {
  const existing = await db.crmPipeline.count({ where: { ownerId: userId } })
  if (existing > 0) return
  if (roles.includes('profesional')) {
    const pipeline = await db.crmPipeline.create({
      data: { ownerId: userId, ownerRole: 'profesional', name: 'Clientes' },
    })
    const stages = [
      { name: 'Consultas', color: '#1D63B8' },
      { name: 'Presupuesto enviado', color: '#00A3E0' },
      { name: 'En negociación', color: '#FFC700' },
      { name: 'En obra', color: '#FF5A1F' },
      { name: 'Cerrado / Facturado', color: '#16A34A' },
    ]
    for (let i = 0; i < stages.length; i++) {
      await db.crmStage.create({ data: { pipelineId: pipeline.id, name: stages[i].name, sortOrder: i, color: stages[i].color } })
    }
  }
  if (roles.includes('proveedor')) {
    const pipeline = await db.crmPipeline.create({
      data: { ownerId: userId, ownerRole: 'proveedor', name: 'Clientes y Profesionales' },
    })
    const stages = [
      { name: 'Nuevos contactos', color: '#1D63B8' },
      { name: 'Cotizando', color: '#00A3E0' },
      { name: 'Compra en curso', color: '#FF5A1F' },
      { name: 'Cliente recurrente', color: '#16A34A' },
    ]
    for (let i = 0; i < stages.length; i++) {
      await db.crmStage.create({ data: { pipelineId: pipeline.id, name: stages[i].name, sortOrder: i, color: stages[i].color } })
    }
  }
}
