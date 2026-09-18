// Limpia cuentas de prueba legadas de tareas anteriores (NO toca las cuentas "leo" reales ni las 3 demo)
import { purgeByEmails, db } from './demo-seed-lib.mjs'

const LEGACY = [
  'sergio@plomero.com', 'ferreteria@test.com', 'maria@test.com', 'juana.perez@homia.com',
  'corralon.mitre@homia.com', 'maria.gonzalez@test.com', 'test.diag@homia.com',
  'pro.diag@homia.com', 'prov.diag@homia.com', 'cliente.ui@homia.com',
  'loginflow.test@homia.com', 'pro.mp@homia.com',
]

const n = await purgeByEmails(LEGACY)
if (!n) console.log('No había usuarios legados')
const rest = await db.user.findMany({ select: { email: true } })
console.log(`Quedan ${rest.length} usuarios:`)
for (const u of rest) console.log(' ', u.email)
await db.$disconnect()
