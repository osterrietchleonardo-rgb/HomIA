// Seed maestro HomIA — ecosistema demo completo (3 roles + 2 usuarios extra para
// directorio/regla de chat). Ejecutar: node scripts/demo-seed.mjs
import fs from 'fs'
import path from 'path'
import { db, PW, HASH, D, cleanup, recomputeRatings } from './demo-seed-lib.mjs'

const J = JSON.stringify
const ASSETS = path.resolve('scripts/assets')

async function main() {
  console.log('🌱 Seed maestro HomIA — creando ecosistema demo completo...')
  await cleanup()

  // ───────────── USUARIOS ─────────────
  const cli = await db.user.create({ data: {
    email: 'cliente@homia.test', passwordHash: HASH, roles: J(['cliente']),
    displayName: 'Valentina Ríos', phone: '+54 9 11 5546-2231',
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires',
    lat: -34.6015, lng: -58.4158, locationShared: true,
    howFoundUs: 'recomendacion', birthday: '1988-04-12', searchRadiusKm: 10,
    createdAt: D(120), updatedAt: D(8),
  } })
  const pro = await db.user.create({ data: {
    email: 'profesional@homia.test', passwordHash: HASH, roles: J(['profesional']),
    displayName: 'Matías Ferrer', phone: '+54 9 11 6678-9012',
    address: 'Av. Independencia 3120', city: 'Buenos Aires',
    lat: -34.6172, lng: -58.4090, locationShared: true,
    howFoundUs: 'google', birthday: '1990-09-03', searchRadiusKm: 15,
    createdAt: D(200), updatedAt: D(9),
  } })
  const prv = await db.user.create({ data: {
    email: 'proveedor@homia.test', passwordHash: HASH, roles: J(['proveedor']),
    displayName: 'Ferrer Hnos. Suministros', phone: '+54 11 4941-5588',
    address: 'Av. San Juan 2847', city: 'Buenos Aires',
    lat: -34.6245, lng: -58.4058, locationShared: true,
    howFoundUs: 'redes', birthday: '1982-02-17', searchRadiusKm: 25,
    createdAt: D(300), updatedAt: D(7),
  } })

  // Segundo profesional (Carolina) y segundo cliente (Julián): dan más cuerpo al
  // directorio y permiten demostrar la regla "los clientes escriben primero".
  // Carolina NO sube su DNI → queda "No verificado" (visible para todos).
  const caro = await db.user.create({ data: {
    email: 'carolina@homia.test', passwordHash: HASH, roles: J(['profesional']),
    displayName: 'Carolina Páez', phone: '+54 9 11 4455-8811',
    address: 'Av. Rivadavia 5210', city: 'Buenos Aires',
    lat: -34.6210, lng: -58.4380, locationShared: true,
    howFoundUs: 'redes', birthday: '1992-05-03', searchRadiusKm: 12,
    createdAt: D(150), updatedAt: D(5),
  } })
  const jul = await db.user.create({ data: {
    email: 'julian@homia.test', passwordHash: HASH, roles: J(['cliente']),
    displayName: 'Julián Sosa', phone: '+54 9 11 3322-7744',
    address: 'Rivadavia 5123, 2°A', city: 'Buenos Aires',
    lat: -34.6235, lng: -58.4310, locationShared: false,
    howFoundUs: 'google', birthday: '1997-09-19', searchRadiusKm: 8,
    createdAt: D(45), updatedAt: D(4),
  } })

  // ───────────── PERFILES ─────────────
  const proP = await db.professionalProfile.create({ data: {
    userId: pro.id, personType: 'persona',
    professions: J(['plomeria', 'gasistas', 'climatizacion']),
    skills: J(['Reparación de fugas', 'Destapes con equipo', 'Instalación de termotanques',
      'Calefacción por radiadores', 'Instalación de artefactos de gas', 'Mantenimiento preventivo']),
    experienceYears: 14,
    bio: 'Plomero y gasista matriculado. Trabajo con garantía escrita de 6 meses, presupuesto sin cargo y materiales con factura. Atiendo urgencias en CABA y GBA norte. Más de 400 trabajos realizados y clientes que vuelven a llamarme para cada refacción.',
    dniCuil: '20-31456789-4', serviceRadiusKm: 20, verified: true,
    worksCount: 2, subscription: 'pro', proSince: D(95),
    city: 'Buenos Aires', lat: -34.6172, lng: -58.4090,
    createdAt: D(200), updatedAt: D(9),
  } })
  const prvP = await db.providerProfile.create({ data: {
    userId: prv.id, businessName: 'Ferretería Ferrer Hnos.', kind: 'ferreteria',
    cuit: '30-71234567-8',
    description: 'Corralón y ferretería con 25 años en San Cristóbal. Stock permanente de plomería, electricidad, albañilería y pintura. Precios de mayorista para profesionales vinculados, entrega en obra dentro de CABA y cuentas corrientes para clientes recurrentes.',
    address: 'Av. San Juan 2847', city: 'Buenos Aires',
    lat: -34.6245, lng: -58.4058, verified: true,
    subscription: 'pro', proSince: D(80), trialEndsAt: D(286),
    createdAt: D(300), updatedAt: D(7),
  } })

  const caroP = await db.professionalProfile.create({ data: {
    userId: caro.id, personType: 'persona',
    professions: J(['electricidad', 'climatizacion']),
    skills: J(['Instalación de tableros', 'Cableados embedidos', 'Aire acondicionado split', 'Termicas y diferenciales']),
    experienceYears: 9,
    bio: 'Electricista matriculada. Instalaciones y reparaciones para hogares y comercios: tableros, cableados, artefactos y puesta en marcha de aires split. Trabajo con certificado de instalación cuando corresponde.',
    dniCuil: '27-38764129-1', serviceRadiusKm: 12, verified: false,
    worksCount: 0, subscription: 'free',
    city: 'Buenos Aires', lat: -34.6210, lng: -58.4380,
    createdAt: D(150), updatedAt: D(5),
  } })

  // Assets (DNI + fotos de reseñas) → carpetas por usuario en /public/uploads
  await copyAssets({ cli, pro, prv, cliReviews: true })

  // El estado de verificación lo define la IA analizando las fotos reales (part4).
  // Aquí solo copiamos los archivos a las carpetas de cada usuario (copyAssets).

  // Catálogo estándar (seed.ts) para materiales/stock
  const elems = await db.catalogElement.findMany({ include: { category: true } })
  const E = (name) => { const e = elems.find((x) => x.name === name); if (!e) throw new Error(`Elemento catálogo no encontrado: ${name}`); return e }

  // ───────────── TRABAJOS PUBLICADOS POR LA CLIENTE ─────────────
  const j1 = await db.jobPost.create({ data: {
    userId: cli.id, title: 'Fuga de agua en cocina — urgente',
    description: 'Perdía de agua bajo la mesada, la canilla de la cocina no cierra bien y hay humedad en la pared. Necesito alguien esta semana, preferentemente mañana temprano.',
    categorySlug: 'plomeria', urgency: 'urgente', budgetMin: 50000, budgetMax: 120000,
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires', lat: -34.6015, lng: -58.4158,
    status: 'abierto', createdAt: D(1), updatedAt: D(0.4),
  } })
  const j2 = await db.jobPost.create({ data: {
    userId: cli.id, title: 'Reparación de fuga y cambio de grifería en cocina',
    description: 'Además de arreglar la fuga, quiero cambiar la grifería de cocina y de baño por monocomando. Tengo fotos del lugar. Busco presupuesto cerrado con mano de obra y materiales.',
    categorySlug: 'plomeria', urgency: 'alta', budgetMin: 180000, budgetMax: 300000,
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires', lat: -34.6015, lng: -58.4158,
    status: 'en_proceso', createdAt: D(14), updatedAt: D(6),
  } })
  const j3 = await db.jobPost.create({ data: {
    userId: cli.id, title: 'Renovación completa del baño',
    description: 'Cambio de inodoro y bidet, revisión de cañerías, colocación de griferías nuevas y sellado. Baño de 4m² en departamento. Ya tengo el revestimiento puesto, falta todo el sanitario.',
    categorySlug: 'plomeria', urgency: 'normal', budgetMin: 450000, budgetMax: 700000,
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires', lat: -34.6015, lng: -58.4158,
    status: 'cerrado', createdAt: D(40), updatedAt: D(9),
  } })
  const j4 = await db.jobPost.create({ data: {
    userId: cli.id, title: 'Pintura del living y pasillo',
    description: 'Pintar living-comedor y pasillo, aproximadamente 60m². Dos manos, enduido previo en algunas grietas.',
    categorySlug: 'pintura', urgency: 'baja', budgetMin: 150000, budgetMax: 250000,
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires', lat: -34.6015, lng: -58.4158,
    status: 'cancelado', createdAt: D(30), updatedAt: D(26),
  } })
  const j5 = await db.jobPost.create({ data: {
    userId: cli.id, title: 'Destape de cañería en baño de servicio',
    description: 'El desagüe del baño de servicio está lentísimo, ya probé soda cáustica y no da. Creo que hay que usar equipo. Departamento 5° piso con ascensor.',
    categorySlug: 'plomeria', urgency: 'normal', budgetMin: 40000, budgetMax: 80000,
    address: 'Av. Corrientes 4567, 3°B', city: 'Buenos Aires', lat: -34.6015, lng: -58.4158,
    status: 'abierto', createdAt: D(2), updatedAt: D(1.5),
  } })

  // Trabajo de Julián (electricidad) — da contexto a Carolina en la bolsa
  const j6 = await db.jobPost.create({ data: {
    userId: jul.id, title: 'Cambio de tablero eléctrico y térmicas',
    description: 'El tablero del departamento es viejísimo y saltan las térmicas todo el tiempo. Necesito cambiarlo y dejarlo certificado. Un ambiente, trabajo de un día.',
    categorySlug: 'electricidad', urgency: 'normal', budgetMin: 100000, budgetMax: 200000,
    address: 'Rivadavia 5123, 2°A', city: 'Buenos Aires', lat: -34.6235, lng: -58.4310,
    status: 'abierto', createdAt: D(3), updatedAt: D(2),
  } })

  // ───────────── PRESUPUESTOS (BIDS) DEL PROFESIONAL ─────────────
  const bid1 = await db.jobBid.create({ data: { jobId: j1.id, professionalId: proP.id, amount: 88000, timelineDays: 2, message: 'Buenas! Puedo pasar mañana a la mañana con equipo de detección. Presupuesto incluye reparación y prueba de presión.', status: 'pendiente', createdAt: D(0.5) } })
  const bid2 = await db.jobBid.create({ data: { jobId: j2.id, professionalId: proP.id, amount: 256000, timelineDays: 6, message: 'Presupuesto cerrado: reparación de fuga, caños nuevos de termofusión y colocación de griferías monocomando (materiales cotizados aparte con corralón vinculado).', status: 'aceptado', createdAt: D(13), updatedAt: D(12.5) } })
  const bid3 = await db.jobBid.create({ data: { jobId: j3.id, professionalId: proP.id, amount: 634800, timelineDays: 12, message: 'Incluye inodoro y bidet Ferrum, griferías FV, sellado sanitario y garantía escrita. Materiales del corralón Ferrer Hnos. con factura.', status: 'aceptado', createdAt: D(39), updatedAt: D(38) } })
  await db.jobBid.create({ data: { jobId: j4.id, professionalId: proP.id, amount: 120000, timelineDays: 5, message: 'Fuera de mi especialidad principal, retiro la oferta para no demorarla.', status: 'retirado', createdAt: D(29), updatedAt: D(28) } })
  const bid5 = await db.jobBid.create({ data: { jobId: j5.id, professionalId: proP.id, amount: 62000, timelineDays: 3, message: 'Destape con máquina de presión y verificación con cámara. Si hay rotura de caño te cotizo ahí mismo.', status: 'pendiente', createdAt: D(1.5) } })
  const bid6 = await db.jobBid.create({ data: { jobId: j6.id, professionalId: caroP.id, amount: 148000, timelineDays: 2, message: 'Hola Julián! Cambio tablero completo con térmicas nuevas y certificado de instalación. En dos días lo tenés listo.', status: 'pendiente', createdAt: D(2.5) } })

  await db.jobPost.update({ where: { id: j2.id }, data: { selectedBidId: bid2.id } })
  await db.jobPost.update({ where: { id: j3.id }, data: { selectedBidId: bid3.id } })

  // ───────────── PROYECTOS (conectan cliente ↔ profesional ↔ proveedor) ─────────────
  const projA = await db.project.create({ data: {
    jobId: j2.id, clientId: cli.id, professionalId: proP.id,
    title: 'Reparación de fuga y grifería nueva en cocina',
    description: 'Fuga reparada bajo mesada, renovación de tramo de termofusión y colocación de griferías monocomando.',
    status: 'activo', stage: 'ejecucion',
    laborCost: 185000, materialsCost: 71000,
    escrowStatus: 'retained', escrowPaymentId: 'MP-DEMO-7741009', escrowAmount: 256000,
    lat: -34.6015, lng: -58.4158, createdAt: D(12), updatedAt: D(1),
  } })
  const projB = await db.project.create({ data: {
    jobId: j3.id, clientId: cli.id, professionalId: proP.id,
    title: 'Renovación completa de baño en Almagro',
    description: 'Cambio completo de sanitarios Ferrum, griferías FV y sellado sanitario. Obra entregada con garantía.',
    status: 'finalizado', stage: 'finalizado',
    laborCost: 320000, materialsCost: 314800,
    escrowStatus: 'released', escrowPaymentId: 'MP-DEMO-7732810', escrowAmount: 634800, escrowReleasedAt: D(9),
    lat: -34.6015, lng: -58.4158, createdAt: D(38), updatedAt: D(9),
  } })

  // Materiales proyecto A (aprobados con proveedor + ciclo de alternativas)
  const mA1 = await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Caño termofusión 25mm').id, name: 'Caño termofusión 25mm', providerId: prvP.id, quantity: 12, unit: 'unidad', unitPrice: 3800, status: 'aprobado', createdAt: D(11), updatedAt: D(10) } })
  const mA2 = await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Llave de paso esférica 1/2"').id, name: 'Llave de paso esférica 1/2"', providerId: prvP.id, quantity: 3, unit: 'unidad', unitPrice: 4200, status: 'aprobado', createdAt: D(11), updatedAt: D(10) } })
  const mA3 = await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Flexible de inodoro').id, name: 'Flexible de inodoro', providerId: prvP.id, quantity: 2, unit: 'unidad', unitPrice: 2900, status: 'aprobado', createdAt: D(11), updatedAt: D(10) } })
  const mA4 = await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Silicona sanitaria').id, name: 'Silicona sanitaria', providerId: prvP.id, quantity: 2, unit: 'unidad', unitPrice: 3500, status: 'aprobado', createdAt: D(11), updatedAt: D(10) } })
  const mA5 = await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Grifería monocomando baño').id, name: 'Grifería monocomando baño', providerId: prvP.id, quantity: 1, unit: 'unidad', unitPrice: 48000, status: 'rechazado', note: 'La cliente prefiere esperar la oferta de FV de la semana próxima.', createdAt: D(11), updatedAt: D(9) } })
  await db.projectMaterial.create({ data: { projectId: projA.id, elementId: E('Grifería monocomando cocina').id, name: 'Grifería monocomando cocina', providerId: prvP.id, quantity: 1, unit: 'unidad', unitPrice: 52000, status: 'propuesto', alternativeOfId: mA5.id, note: 'Alternativa propuesta por el profesional: misma calidad, 8% más económica.', createdAt: D(9), updatedAt: D(9) } })

  // Materiales proyecto B (todos aprobados, consumidos)
  const mB1 = await db.projectMaterial.create({ data: { projectId: projB.id, elementId: E('Inodoro blanco completo').id, name: 'Inodoro blanco completo', providerId: prvP.id, quantity: 1, unit: 'unidad', unitPrice: 185000, status: 'aprobado', createdAt: D(37), updatedAt: D(36) } })
  const mB2 = await db.projectMaterial.create({ data: { projectId: projB.id, elementId: E('Bidet blanco').id, name: 'Bidet blanco', providerId: prvP.id, quantity: 1, unit: 'unidad', unitPrice: 98000, status: 'aprobado', createdAt: D(37), updatedAt: D(36) } })
  const mB3 = await db.projectMaterial.create({ data: { projectId: projB.id, elementId: E('Caño termofusión 32mm').id, name: 'Caño termofusión 32mm', providerId: prvP.id, quantity: 4, unit: 'unidad', unitPrice: 4900, status: 'aprobado', createdAt: D(37), updatedAt: D(36) } })
  const mB4 = await db.projectMaterial.create({ data: { projectId: projB.id, elementId: E('Cemento hidrófugo').id, name: 'Cemento hidrófugo', providerId: prvP.id, quantity: 2, unit: 'unidad', unitPrice: 6100, status: 'aprobado', createdAt: D(37), updatedAt: D(36) } })

  // ───────────── FACTURAS + PAGOS ─────────────
  const invA = await db.invoice.create({ data: {
    projectId: projA.id, number: 'A-0001-000187', clientId: cli.id, professionalId: proP.id,
    laborCost: 185000, materialsCost: 71000, total: 256000, status: 'pendiente', issuedAt: D(6),
  } })
  await db.invoiceItem.create({ data: { invoiceId: invA.id, kind: 'mano_obra', description: 'Reparación de fuga, renovación de tramo y colocación de griferías', quantity: 1, unitPrice: 185000, subtotal: 185000 } })
  await db.invoiceItem.create({ data: { invoiceId: invA.id, kind: 'material', description: 'Caño termofusión 25mm x12 (Ferrer Hnos.)', quantity: 12, unitPrice: 3800, subtotal: 45600 } })
  await db.invoiceItem.create({ data: { invoiceId: invA.id, kind: 'material', description: 'Llave de paso 1/2" x3 + flexibles x2', quantity: 5, unitPrice: 3800, subtotal: 18400 } })
  await db.invoiceItem.create({ data: { invoiceId: invA.id, kind: 'material', description: 'Silicona sanitaria x2', quantity: 2, unitPrice: 3500, subtotal: 7000 } })

  const invB = await db.invoice.create({ data: {
    projectId: projB.id, number: 'A-0001-000163', clientId: cli.id, professionalId: proP.id,
    laborCost: 320000, materialsCost: 314800, total: 634800, status: 'pagada',
    mpPreferenceId: 'MP-PREF-DEMO-2291', mpPaymentId: 'MP-DEMO-8831201',
    paidAt: D(9), issuedAt: D(20),
  } })
  await db.invoiceItem.create({ data: { invoiceId: invB.id, kind: 'mano_obra', description: 'Renovación completa de baño — mano de obra', quantity: 1, unitPrice: 320000, subtotal: 320000 } })
  await db.invoiceItem.create({ data: { invoiceId: invB.id, kind: 'material', description: 'Inodoro Ferrum blanco completo', quantity: 1, unitPrice: 185000, subtotal: 185000 } })
  await db.invoiceItem.create({ data: { invoiceId: invB.id, kind: 'material', description: 'Bidet Ferrum blanco', quantity: 1, unitPrice: 98000, subtotal: 98000 } })
  await db.invoiceItem.create({ data: { invoiceId: invB.id, kind: 'material', description: 'Termofusión 32mm x4 + cemento hidrófugo x2', quantity: 6, unitPrice: 5133.34, subtotal: 30800 } })
  await db.payment.create({ data: { invoiceId: invB.id, mpPaymentId: 'MP-DEMO-8831201', status: 'approved', amount: 634800, createdAt: D(9) } })

  console.log('✅ Usuarios, perfiles, trabajos, proyectos y facturas creados')

  const ctx = { cli, pro, prv, caro, jul, proP, prvP, caroP, j1, j2, j3, j5, j6, projA, projB, mA1, mB1, bid1, bid2, bid5, bid6, elems, E }
  await part2(ctx)
  await part3(ctx)
  await part4(ctx)
  await recomputeRatings()
  await summary()
}

// ───────────── ASSETS: DNI + FOTOS DE RESEÑAS → /public/uploads/{userId}/ ─────────────
function copyAssets({ cli, pro, prv }) {
  const copies = [
    // DNI de los 3 verificados (Carolina y Julián no suben → "No verificado")
    [pro.id, 'dni', 'dni-matias-frente.jpg', 'frente.jpg'],
    [pro.id, 'dni', 'dni-matias-dorso.jpg', 'dorso.jpg'],
    [cli.id, 'dni', 'dni-valentina-frente.jpg', 'frente.jpg'],
    [cli.id, 'dni', 'dni-valentina-dorso.jpg', 'dorso.jpg'],
    [prv.id, 'dni', 'dni-ferrer-frente.jpg', 'frente.jpg'],
    [prv.id, 'dni', 'dni-ferrer-dorso.jpg', 'dorso.jpg'],
    // fotos de reseñas (las sube la cliente)
    [cli.id, 'resenas', 'bano-renovado.jpg', 'bano-renovado.jpg'],
    [cli.id, 'resenas', 'griferia-cocina.jpg', 'griferia-cocina.jpg'],
    [cli.id, 'resenas', 'materiales-entrega.jpg', 'materiales-entrega.jpg'],
  ]
  for (const [userId, folder, src, dest] of copies) {
    const from = path.join(ASSETS, folder === 'dni' ? 'dni' : 'reviews', src)
    const dir = path.join(process.cwd(), 'public', 'uploads', userId, folder)
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(from, path.join(dir, dest))
  }
  console.log('📁 Assets copiados: DNI ×3 usuarios + 3 fotos de reseñas')
}

// ───────────── VERIFICACIÓN DNI CON IA REAL ─────────────
// Misma lógica que src/lib/dni-ai.ts: el modelo de visión analiza frente + dorso
// y el dictamen mapea a verificado | en_revision | rechazado.
async function analyzeDniAi(frontPath, backPath) {
  try {
    const ZAI = (await import('../src/lib/ai.ts')).default
    const zai = await ZAI.create()
    const b64 = (p) => fs.readFileSync(p).toString('base64')
    const res = await zai.chat.completions.createVision({
      model: 'glm-4.5v',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Analizá estas dos fotos de un documento de identidad (frente y dorso) y respondé SOLO JSON, sin markdown: {"esDocumento":bool,"pareceReal":bool,"legible":bool,"mismoTitular":bool,"tipo":"dni|pasaporte|otro|desconocido","confianza":0.0-1.0,"motivo":"explicación breve en español"}' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64(frontPath)}` } },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64(backPath)}` } },
        ],
      }],
      thinking: { type: 'disabled' },
    })
    const raw = res.choices?.[0]?.message?.content ?? ''
    const m = raw.replace(/```json/gi, '```').replace(/```/g, ' ').match(/\{[\s\S]*\}/)
    const v = m ? JSON.parse(m[0]) : null
    if (!v || typeof v.esDocumento !== 'boolean') return { status: 'en_revision', score: 0, verdict: null, notes: 'El análisis de IA no devolvió un dictamen claro — quedó en revisión.' }
    if (!v.esDocumento || v.mismoTitular === false) return { status: 'rechazado', score: v.confianza || 0, verdict: v, notes: `Rechazado por IA: ${v.motivo || 'no es un documento válido'}` }
    if (!v.legible || (v.confianza || 0) < 0.7) return { status: 'en_revision', score: v.confianza || 0, verdict: v, notes: `IA con dudas (${Math.round((v.confianza || 0) * 100)}%): ${v.motivo} — quedó en revisión.` }
    return {
      status: 'verificado',
      score: v.confianza || 0,
      verdict: v,
      notes: v.pareceReal ? `IA: documento real y consistente (${Math.round((v.confianza || 0) * 100)}%). ${v.motivo}` : `Verificado con reserva de IA (${Math.round((v.confianza || 0) * 100)}%): ${v.motivo}`,
    }
  } catch (e) {
    return { status: 'en_revision', score: 0, verdict: null, notes: 'IA no disponible durante el seed — quedó en revisión.' }
  }
}

async function part4({ cli, pro, prv }) {
  console.log('🪪 Verificación de identidad con IA (modelo de visión, 3 documentos)...')
  for (const [user, tipo] of [[cli, 'dni'], [pro, 'dni'], [prv, 'dni']]) {
    const front = path.join(process.cwd(), 'public', 'uploads', user.id, 'dni', 'frente.jpg')
    const back = path.join(process.cwd(), 'public', 'uploads', user.id, 'dni', 'dorso.jpg')
    const analysis = await analyzeDniAi(front, back)
    await db.identityDocument.create({
      data: {
        userId: user.id, type: tipo, frontUrl: `/uploads/${user.id}/dni/frente.jpg`, backUrl: `/uploads/${user.id}/dni/dorso.jpg`,
        status: analysis.status, aiVerdict: analysis.verdict ? JSON.stringify(analysis.verdict) : null,
        aiScore: analysis.score, aiNotes: analysis.notes, createdAt: D(20),
      },
    })
    await db.user.update({
      where: { id: user.id },
      data: { verificationStatus: analysis.status, verifiedAt: analysis.status === 'verificado' ? D(20) : null },
    })
    console.log(`   ${user.displayName}: ${analysis.status} (${Math.round(analysis.score * 100)}% confianza)`)
  }
  // Carolina y Julián quedan verificationStatus 'none' → todos los ven "No verificado"
  console.log('✅ Verificación DNI lista (Carolina y Julián sin subir: "No verificado")')
}

// ───────────── MENSAJES DIRECTOS DEMO ─────────────
async function part3({ cli, pro, prv }) {
  const pair = (a, b) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a })
  const conv = async (a, b, days) => db.conversation.create({ data: { ...pair(a, b), lastMessageAt: D(days), createdAt: D(days + 2) } })
  const msg = (convId, senderId, body, days, read) => db.message.create({ data: { conversationId: convId, senderId, body, createdAt: D(days), ...(read ? { readAt: D(days - 0.1) } : {}) } })

  // Valentina ↔ Matías (proyecto activo) — LA CLIENTE escribe primero (regla HomIA:
  // los profesionales no pueden iniciar el chat con clientes)
  const c1 = await conv(cli.id, pro.id, 11)
  await msg(c1.id, cli.id, '¡Hola Matías! Somos del depto de Corrientes 4567 — te guardamos la tarjeta cuando viste la fuga de la cocina. ¿Podés pasar a presupuestar la reparación?', 11, true)
  await msg(c1.id, pro.id, '¡Hola Valentina! Sí, me acuerdo de la casa. Pasé ayer a revisarlo: el ramal bajo mesada está vencido. Te preparo la propuesta con caños nuevos.', 11, true)
  await msg(c1.id, cli.id, '¡Gracias por ir tan rápido! Dale, esperó el presupuesto cerrado.', 10.5, true)
  await msg(c1.id, pro.id, 'Te lo dejé cargado en el proyecto. Los materiales los cotizo con Ferrer Hnos. para que tengas factura y garantía.', 10, true)
  await msg(c1.id, pro.id, 'Valentina, dejé reservados los caños en el corralón y mañana temprano arranco con la instalación 👌', 8, false)

  // Valentina ↔ Ferrer Hnos. (consulta de stock)
  const c2 = await conv(cli.id, prv.id, 9)
  await msg(c2.id, cli.id, '¡Hola! ¿Tienen grifería monocomando FV en stock? La quiero para la renovación del baño.', 9, true)
  await msg(c2.id, prv.id, '¡Hola Valentina! Sí, tenemos dos modelos: el básico en $48.000 y el de línea Square en $52.000. Podés pasar a verlos por el local de Av. San Juan.', 9, true)

  // Matías ↔ Ferrer Hnos. (operativa vinculada)
  const c3 = await conv(pro.id, prv.id, 8)
  await msg(c3.id, pro.id, '¿Me reservás 12 caños de termofusión 25mm y 3 llaves de paso? Es para el proyecto de la cocina de Valentina.', 8, true)
  await msg(c3.id, prv.id, 'Listo Matías, reservados y anotados en tu cuenta. Los esperamos cuando quieras.', 8, true)
  await msg(c3.id, prv.id, 'Matías, te mando la lista de ofertas de FV de esta semana: griferías con 10% off para cuentas vinculadas.', 2, false)

  console.log('✅ Conversaciones demo creadas (3 hilos, 1 no leído por usuario)')
}

// ───────────── STOCK DEL PROVEEDOR + MOVIMIENTOS + RESERVAS ─────────────
async function part2({ cli, pro, prv, caro, jul, proP, prvP, projA, projB, mA1, mB1, bid1, bid2, bid5, E }) {
  const J = JSON.stringify
  const stockItems = [
    // plomería
    ['Caño termofusión 25mm', 3800, 120, 20, 'Tigre'], ['Caño PVC desagüe 110mm', 5400, 60, 10, 'Amanco'],
    ['Llave de paso esférica 1/2"', 4200, 45, 15, 'FV'], ['Flexible de inodoro', 2900, 80, 20, 'FV'],
    ['Sifón de lavatorio', 2400, 50, 10, 'FV'], ['Cinta teflón', 350, 200, 40, 'Dexel'],
    ['Silicona sanitaria', 3500, 8, 10, 'Molto'], ['Bomba de agua 1/2 HP', 92000, 12, 3, 'Roldán'],
    ['Inodoro blanco completo', 185000, 10, 2, 'Ferrum'], ['Bidet blanco', 98000, 8, 2, 'Ferrum'],
    // electricidad
    ['Cable unipolar 2.5mm x100m', 24500, 40, 10, 'Genrod'], ['Térmica bipolar 25A', 5800, 30, 8, 'SICA'],
    ['Diferencial 2x30mA', 23500, 18, 5, 'Genrod'], ['Toma corriente doble blanco', 1900, 90, 25, 'Genrod'],
    ['Lámpara LED 9W E27', 850, 150, 30, 'Philips'], ['Tablero embutir 12 módulos', 14500, 0, 3, 'Dexel'],
    // albañilería
    ['Cemento Portland 50kg', 6900, 180, 40, 'Loma Negra'], ['Cal hidratada 25kg', 2900, 60, 15, 'Minetti'],
    ['Ladrillo hueco 8cm', 580, 2500, 500, 'Corblock'], ['Placa yeso 9.5mm', 8900, 55, 12, 'Volcanita'],
    // pintura
    ['Látex interior 20L blanco', 29500, 38, 10, 'Alba'], ['Esmalte sintético 4L', 14800, 22, 6, 'Tersuave'],
    ['Rodillo lana 22cm', 2100, 48, 12, 'Akari'],
    // gas
    ['Caño gas epoxi 25mm', 4900, 35, 8, 'Tigre'], ['Llave de paso gas 1/2"', 3800, 26, 6, 'FV'],
    ['Cinta teflón para gas', 480, 70, 15, 'Dexel'],
    // limpieza
    ['Lavandina 5L', 1450, 44, 12, 'Química Andina'], ['Detergente 5L', 2400, 9, 10, 'Dolphin'],
    // rubros nuevos del catálogo maestro (herramientas, techos, maderera, pisos, jardín, seguridad)
    ['Taladro percutor 650W', 58900, 14, 4, 'Bosch'], ['Amoladora angular 4.5"', 42900, 9, 3, 'DeWalt'],
    ['Nivel de aluminio 60cm', 7800, 22, 6, 'Akari'], ['Cinta métrica 5m', 3200, 35, 10, 'Stanley'],
    ['Chapa sinusoidal 1.10x4m', 18900, 85, 20, 'Tecno'], ['Membrana líquida 20kg', 34500, 12, 4, 'Alba'],
    ['Canaleta galvanizada 2m', 5400, 30, 8, 'Tecno'], ['Tornillo autoperforante techo', 890, 400, 80, 'Dexel'],
    ['MDF 18mm 1.83x2.44', 38900, 18, 5, 'KelForm'], ['Pino cepillado 2x4 x3m', 7400, 60, 15, 'Pino Argentino'],
    ['Deck madera 2.5x14', 9800, 120, 30, 'Incorsa'], ['Porcelanato m²', 15900, 240, 50, 'Ilva'],
    ['Adhesivo cerámico 30kg', 8900, 45, 12, 'Falso Uno'], ['Tierra fértil 40kg', 2200, 90, 20, 'Naturverde'],
    ['Manguera 15m', 8900, 25, 6, 'Bahía'], ['Guantes nylon con nitrilo', 1450, 60, 15, '3M'],
    ['Extintor ABC 2.5kg', 32000, 8, 3, 'Fextex'], ['Casco de obra', 5600, 20, 6, 'Alba'],
  ]
  const stock = {}
  for (const [name, price, qty, min, brand] of stockItems) {
    const el = E(name)
    const status = qty <= 0 ? 'agotado' : qty <= min ? 'por_agotar' : 'disponible'
    stock[name] = await db.providerStock.create({ data: {
      providerId: prvP.id, elementId: el.id, price, quantity: qty, minStock: min, status, brand,
      createdAt: D(90), updatedAt: D(Math.random() * 20),
    } })
  }
  // Movimientos de stock con historia real
  const mv = async (name, type, qty, note, days) => db.stockMovement.create({ data: { stockId: stock[name].id, type, quantity: qty, note, createdAt: D(days) } })
  await mv('Cemento Portland 50kg', 'entrada', 100, 'Reposición semanal — proveedor Loma Negra', 21)
  await mv('Cemento Portland 50kg', 'salida', 40, 'Venta mostrador obra Palermo', 12)
  await mv('Caño termofusión 25mm', 'entrada', 60, 'Reposición Tigre', 15)
  await mv('Caño termofusión 25mm', 'salida', 12, 'Consumo proyecto cocina — Matías Ferrer', 8)
  await mv('Inodoro blanco completo', 'entrada', 10, 'Ingreso Ferrum', 40)
  await mv('Inodoro blanco completo', 'salida', 1, 'Consumo proyecto baño — Matías Ferrer', 35)
  await mv('Bidet blanco', 'salida', 1, 'Consumo proyecto baño — Matías Ferrer', 35)
  await mv('Tablero embutir 12 módulos', 'salida', 10, 'Venta mayorista — instalación eléctrica Av. Cruz', 5)
  await mv('Silicona sanitaria', 'ajuste', -2, 'Inventario físico: faltante depósito', 3)
  await mv('Látex interior 20L blanco', 'entrada', 20, 'Reposición Alba', 10)

  // Reservas de stock vinculadas a proyectos reales
  await db.stockReservation.create({ data: { stockId: stock['Caño termofusión 25mm'].id, projectId: projA.id, userId: pro.id, quantity: 12, status: 'activa', createdAt: D(8) } })
  await db.stockReservation.create({ data: { stockId: stock['Inodoro blanco completo'].id, projectId: projB.id, userId: pro.id, quantity: 1, status: 'consumida', createdAt: D(36) } })
  await db.stockReservation.create({ data: { stockId: stock['Látex interior 20L blanco'].id, userId: cli.id, quantity: 2, status: 'liberada', createdAt: D(20) } })

  // ── COMPRAS DIRECTAS DEMO (marketplace cliente → proveedor, sin proyecto) ──
  // Una pagada (habilita reseña por compra) y una solicitada (flujo visible en Cobros → Ventas).
  const comprasDemo = [
    { stock: stock['Cemento Portland 50kg'], qty: 10, note: 'Si puede ser entrega mañana por la mañana en Villa Crespo.', status: 'pagado', days: 12 },
    { stock: stock['Rodillo lana 22cm'], qty: 3, note: 'Para pintar el living, 60m2.', status: 'solicitado', days: 0.2 },
  ]
  for (const c of comprasDemo) {
    const total = Math.round(c.stock.price * c.qty * 100) / 100
    let chargeId = null
    if (c.status === 'pagado') {
      const year = new Date().getFullYear()
      const n = await db.providerCharge.count()
      const ch = await db.providerCharge.create({ data: {
        projectId: null, providerId: prvP.id, clientId: cli.id,
        number: `PRV-${year}-${String(n + 1).padStart(6, '0')}`,
        description: `${c.stock.elementId ? '' : ''}Compra directa — marketplace HomIA`,
        materialIds: '[]', amount: total, status: 'pagada', method: 'mercadopago', paidAt: D(c.days - 0.5),
        createdAt: D(c.days),
      } })
      chargeId = ch.id
    }
    await db.purchase.create({ data: {
      clientId: cli.id, providerId: prvP.id, stockId: c.stock.id, elementId: c.stock.elementId,
      elementName: Object.keys(stock).find((k) => stock[k].id === c.stock.id) || 'Elemento',
      quantity: c.qty, unit: 'unidad', unitPrice: c.stock.price, total, note: c.note,
      status: c.status, chargeId, createdAt: D(c.days),
    } })
  }

  // ── SEARCH EVENTS DEMO (alimentan la analítica PRO: consultas del rubro + te encontraron) ──
  const queriesDemo = [
    ['cemento 50kg paraologistar', 26], ['cemento loma negra', 22], ['cal hidratada', 18],
    ['membrana para humedad terraza', 14], ['latex interior blanco 20 litros', 12],
    ['caños termofusion 25', 9], ['taladro percutor', 8], ['cable unipolar 2.5', 7],
    ['inodoro blanco ferrum', 6], ['rodillo para pintura', 5],
  ]
  for (const [query, days] of queriesDemo) {
    await db.searchEvent.create({ data: {
      userId: null, mode: 'materiales', query,
      intent: JSON.stringify({ cat: '', radius: 25 }),
      results: JSON.stringify({ count: 3, providerIds: [prvP.id] }),
      createdAt: D(Math.max(0.3, days * (0.6 + Math.random() * 0.8))),
    } })
  }

  // ───────────── VÍNCULOS PROVEEDOR ↔ PROFESIONAL ─────────────
  await db.providerLink.create({ data: { providerId: prvP.id, professionalId: proP.id, accountLabel: 'Cuenta principal — Matías Ferrer', notes: 'Retira en local de Av. San Juan 2847. Cuenta corriente a 30 días, precios de mayorista.', active: true, createdAt: D(85) } })
  await db.providerLink.create({ data: { providerId: prvP.id, professionalId: proP.id, accountLabel: 'Cuenta obra Palermo (2025)', notes: 'Cuenta de obra cerrada, archivada.', active: false, createdAt: D(150) } })

  // ───────────── CRM PROFESIONAL ─────────────
  const pipePro = await db.crmPipeline.create({ data: { ownerId: pro.id, ownerRole: 'profesional', name: 'Clientes', createdAt: D(200) } })
  const stPro = {}
  const stagesPro = [['Consultas', '#1D63B8'], ['Presupuesto enviado', '#00A3E0'], ['En negociación', '#FFC700'], ['En obra', '#FF5A1F'], ['Cerrado / Facturado', '#16A34A']]
  for (let i = 0; i < stagesPro.length; i++) stPro[stagesPro[i][0]] = await db.crmStage.create({ data: { pipelineId: pipePro.id, name: stagesPro[i][0], sortOrder: i, color: stagesPro[i][1] } })
  await db.crmDeal.create({ data: { pipelineId: pipePro.id, stageId: stPro['Consultas'].id, title: 'Mantenimiento de calefacción — refacción anual', value: 95000, note: 'Consulta entró desde búsqueda HomIA, pasar presupuesto.', position: 0, createdAt: D(3) } })
  await db.crmDeal.create({ data: { pipelineId: pipePro.id, stageId: stPro['Presupuesto enviado'].id, title: 'Instalación termotanque 80L — cocina', value: 189000, counterpartyId: cli.id, note: 'Esperando confirmación de la cliente.', position: 0, createdAt: D(5) } })
  await db.crmDeal.create({ data: { pipelineId: pipePro.id, stageId: stPro['En negociación'].id, title: 'Destape de cañería baño de servicio', value: 62000, counterpartyId: cli.id, note: 'Oferta enviada, pendiente de aceptación.', position: 0, createdAt: D(2) } })
  await db.crmDeal.create({ data: { pipelineId: pipePro.id, stageId: stPro['En obra'].id, title: 'Reparación de fuga y grifería — cocina', value: 256000, counterpartyId: cli.id, projectId: projA.id, note: 'En ejecución, escrow retenido.', position: 0, createdAt: D(12) } })
  await db.crmDeal.create({ data: { pipelineId: pipePro.id, stageId: stPro['Cerrado / Facturado'].id, title: 'Renovación completa de baño', value: 634800, counterpartyId: cli.id, projectId: projB.id, note: 'Factura pagada y reseña 5★.', position: 0, createdAt: D(38) } })

  // ───────────── CRM PROVEEDOR ─────────────
  const pipePrv = await db.crmPipeline.create({ data: { ownerId: prv.id, ownerRole: 'proveedor', name: 'Clientes y Profesionales', createdAt: D(300) } })
  const stPrv = {}
  const stagesPrv = [['Nuevos contactos', '#1D63B8'], ['Cotizando', '#00A3E0'], ['Compra en curso', '#FF5A1F'], ['Cliente recurrente', '#16A34A']]
  for (let i = 0; i < stagesPrv.length; i++) stPrv[stagesPrv[i][0]] = await db.crmStage.create({ data: { pipelineId: pipePrv.id, name: stagesPrv[i][0], sortOrder: i, color: stagesPrv[i][1] } })
  await db.crmDeal.create({ data: { pipelineId: pipePrv.id, stageId: stPrv['Nuevos contactos'].id, title: 'Obra Palermo — primer contacto', value: 0, note: 'Arquitecto pidió lista de precios de plomería.', position: 0, createdAt: D(4) } })
  await db.crmDeal.create({ data: { pipelineId: pipePrv.id, stageId: stPrv['Cotizando'].id, title: 'Lista materiales — refacción Monoambientes', value: 145000, note: 'Cotización enviada por WhatsApp, seguimiento viernes.', position: 0, createdAt: D(6) } })
  await db.crmDeal.create({ data: { pipelineId: pipePrv.id, stageId: stPrv['Compra en curso'].id, title: 'Materiales renovación cocina', value: 71000, counterpartyId: cli.id, projectId: projA.id, note: 'Materiales aprobados por la cliente, retira Matías.', position: 0, createdAt: D(11) } })
  await db.crmDeal.create({ data: { pipelineId: pipePrv.id, stageId: stPrv['Cliente recurrente'].id, title: 'Pedido mensual — Matías Ferrer', value: 320000, counterpartyId: pro.id, note: 'Compra promedio mensual, cuenta corriente 30 días.', position: 0, createdAt: D(85) } })

  // ───────────── OBRAS PUBLICADAS ─────────────
  await db.completedWork.create({ data: { authorId: pro.id, authorRole: 'profesional', projectId: projB.id, title: 'Renovación integral de baño en Almagro', description: 'Cambio completo de sanitarios Ferrum y griferías FV sobre instalación nueva de termofusión. Entregado en 12 días, con sellado sanitario y garantía escrita de 6 meses.', photos: J([]), categorySlug: 'plomeria', visible: true, createdAt: D(9) } })
  await db.completedWork.create({ data: { authorId: pro.id, authorRole: 'profesional', title: 'Calefacción por radiadores en departamento', description: 'Instalación completa de 6 radiadores con caldera mural, incluyendo circulación y balanceo hidráulico. Puesta en marcha y explicación de uso al propietario.', photos: J([]), categorySlug: 'climatizacion', visible: true, createdAt: D(25) } })
  await db.completedWork.create({ data: { authorId: cli.id, authorRole: 'cliente', professionalId: proP.id, projectId: projB.id, title: 'Mi baño renovado con Matías', description: 'Contraté la renovación completa del baño por HomIA: presupuesto cerrado, materiales del corralón vinculado y todo dentro del plazo. El resultado quedó impecable.', photos: J([]), categorySlug: 'plomeria', visible: true, createdAt: D(8) } })

  // ───────────── RESEÑAS 360° (con fotos que avalan las opiniones) ─────────────
  const revDir = `/uploads/${cli.id}/resenas`
  await db.review.create({ data: { authorId: cli.id, targetUserId: pro.id, context: 'proyecto', projectId: projB.id, rating: 5, comment: 'Matías es un crack: puntual, limpio y el presupuesto cerrado se cumplió al centavo. El baño quedó como nuevo — miren las fotos del resultado. Lo recomiendo y ya lo volví a llamar.', photos: J([`${revDir}/bano-renovado.jpg`, `${revDir}/griferia-cocina.jpg`]), reply: '¡Gracias Valentina! Un placer trabajar para vos, siempre bienvenida.', replyAt: D(8), createdAt: D(8.5) } })
  await db.review.create({ data: { authorId: pro.id, targetUserId: cli.id, context: 'proyecto', projectId: projB.id, rating: 5, comment: 'Excelente cliente: comunicación clara, pagos en término vía escrow y buena predisposición para coordinar horarios. Un 10.', createdAt: D(8.2) } })
  await db.review.create({ data: { authorId: cli.id, targetUserId: prv.id, context: 'perfil', rating: 4, comment: 'Materiales a tiempo y buena atención en el local. La entrega demoró un poco más de lo prometido (foto de la entrega), pero el trato fue muy bueno.', photos: J([`${revDir}/materiales-entrega.jpg`]), createdAt: D(7) } })
  await db.review.create({ data: { authorId: pro.id, targetUserId: prv.id, context: 'perfil', rating: 5, comment: 'Siempre tienen stock de lo que necesito y me ahorran horas de recorrer corralones. La cuenta corriente me facilita mucho la operatoria.', createdAt: D(6) } })
  await db.review.create({ data: { authorId: prv.id, targetUserId: pro.id, context: 'perfil', rating: 5, comment: 'Cliente que paga en término y retira en horario. Un gusto tener profesionales así vinculados al local.', createdAt: D(6.5) } })
  await db.review.create({ data: { authorId: jul.id, targetUserId: caro.id, context: 'obra', rating: 5, comment: 'Carolina cambió el tablero en un día, dejó todo prolijo y con certificado. Muy clara explicando qué necesitaba y por qué. Súper recomendable.', reply: '¡Gracias Julián! Cualquier cosa que necesites de electricidad, acá estoy.', replyAt: D(2), createdAt: D(2.5) } })

  // ───────────── FAVORITOS ─────────────
  await db.favorite.create({ data: { userId: cli.id, targetUserId: pro.id, createdAt: D(39) } })
  await db.favorite.create({ data: { userId: cli.id, targetUserId: prv.id, createdAt: D(30) } })
  await db.favorite.create({ data: { userId: pro.id, targetUserId: prv.id, createdAt: D(85) } })
  await db.favorite.create({ data: { userId: prv.id, targetUserId: pro.id, createdAt: D(85) } })

  // ───────────── NOTIFICACIONES ─────────────
  const notif = (userId, type, title, body, link, read, days) => db.notification.create({ data: { userId, type, title, body, link, read, createdAt: D(days) } })
  await notif(cli.id, 'bid', 'Presupuesto recibido — Fuga de agua en cocina', 'Matías Ferrer ofertó $88.000 con entrega en 2 días.', '/panel/cliente/trabajos', false, 0.4)
  await notif(cli.id, 'bid', 'Presupuesto recibido — Destape de cañería', 'Matías Ferrer ofertó $62.000 con equipo de presión.', '/panel/cliente/trabajos', false, 1.5)
  await notif(cli.id, 'material', 'Nueva alternativa de material propuesta', 'El profesional propuso una grifería alternativa 8% más económica.', `/panel/cliente/proyectos/${projA.id}`, false, 9)
  await notif(cli.id, 'invoice', 'Factura disponible — A-0001-000187', 'Tu factura de $256.000 está lista para pagar con escrow.', '/panel/cliente/facturas', true, 6)
  await notif(cli.id, 'project', 'Proyecto finalizado — Renovación de baño', 'Calificá a Matías y cerrá el proyecto.', `/panel/cliente/proyectos/${projB.id}`, true, 9)
  await notif(pro.id, 'job', 'Nueva obra en tu zona: Fuga de agua en cocina', 'Urgencia alta a 2.1 km de tu radio de cobertura.', '/panel/profesional/bolsa', false, 0.3)
  await notif(pro.id, 'job', 'Nueva obra en tu zona: Destape de cañería', 'Presupuesto estimado entre $40.000 y $80.000.', '/panel/profesional/bolsa', false, 2)
  await notif(pro.id, 'bid', 'Tu presupuesto fue aceptado', 'Valentina aceptó tu oferta para la renovación de cocina.', `/panel/profesional/proyectos/${projA.id}`, true, 12)
  await notif(pro.id, 'link', 'Te vinculaste a Ferretería Ferrer Hnos.', 'Ya podés retirar materiales con cuenta corriente.', '/panel/profesional/vinculaciones', true, 5)
  await notif(pro.id, 'invoice', 'Pago recibido — A-0001-000163', 'El escrow liberó $634.800 a tu cuenta.', `/panel/profesional/proyectos/${projB.id}`, true, 9)
  await notif(prv.id, 'stock', 'Reserva de stock para proyecto', 'Matías Ferrer reservó 12 caños termofusión 25mm.', '/panel/proveedor/stock', false, 8)
  await notif(prv.id, 'stock', 'Alerta de stock: Silicona sanitaria', 'Quedan 8 unidades — por debajo del mínimo (10).', '/panel/proveedor/stock', false, 3)
  await notif(prv.id, 'review', 'Nueva reseña 4★ de Valentina Ríos', '"Materiales a tiempo y buena atención en el local."', '/panel/proveedor', true, 7)
  await notif(prv.id, 'link', 'Nueva vinculación de cuenta', 'Matías Ferrer sumó una segunda cuenta de retiro.', '/panel/proveedor/vinculaciones', true, 5)
  await notif(prv.id, 'crm', 'Pedido recurrente confirmado', 'Matías Ferrer: compra mensual estimada $320.000.', '/panel/proveedor/crm', true, 10)

  // ───────────── SESIONES HOMY (asistente IA) ─────────────
  const s1 = await db.homySession.create({ data: { userId: cli.id, title: 'Fuga de agua en la cocina', createdAt: D(1), updatedAt: D(1) } })
  await db.homyMessage.create({ data: { sessionId: s1.id, role: 'user', content: 'Tengo una fuga de agua debajo de la mesada de la cocina, ¿es urgente?', createdAt: D(1) } })
  await db.homyMessage.create({ data: { sessionId: s1.id, role: 'homy', content: 'Si el agua sigue corriendo, cerrá la llave de paso general para evitar daños. Te sugiero publicar el trabajo como urgente para que los plomeros cercanos te oferten hoy mismo.', intent: J({ category: 'plomeria', urgency: 'urgente', summary: 'Fuga bajo mesada en cocina' }), createdAt: D(1) } })
  await db.homyMessage.create({ data: { sessionId: s1.id, role: 'user', content: 'Listo, cerré la llave. Publiqué el trabajo, ¿me conviene aceptar el primero que llegue?', createdAt: D(0.9) } })
  await db.homyMessage.create({ data: { sessionId: s1.id, role: 'homy', content: 'Compará al menos dos presupuestos: mirá la calificación, los comentarios de otros clientes y si el profesional está verificado. Con escrow, tu pago queda protegido hasta que des conformidad.', createdAt: D(0.9) } })
  const s2 = await db.homySession.create({ data: { userId: pro.id, title: '¿Cómo armo un presupuesto de destape?', createdAt: D(2), updatedAt: D(2) } })
  await db.homyMessage.create({ data: { sessionId: s2.id, role: 'user', content: 'Nunca presupuesto destapes con cámara, ¿cuánto suelo costar?', createdAt: D(2) } })
  await db.homyMessage.create({ data: { sessionId: s2.id, role: 'homy', content: 'En CABA los destapes con máquina rondan entre $45.000 y $75.000, y sumar cámara de inspección agrega entre $15.000 y $25.000. Si encontrás rotura, cotizá la reparación aparte con materiales del corralón con el que estás vinculado.', intent: J({ category: 'presupuestos', urgency: 'normal', summary: 'Cómo presupuestar destapes' }), createdAt: D(2) } })
  const s3 = await db.homySession.create({ data: { userId: prv.id, title: 'Promociones para profesionales', createdAt: D(4), updatedAt: D(4) } })
  await db.homyMessage.create({ data: { sessionId: s3.id, role: 'user', content: '¿Cómo hago para que más profesionales se vinculen a mi local?', createdAt: D(4) } })
  await db.homyMessage.create({ data: { sessionId: s3.id, role: 'homy', content: 'Mantené tu stock actualizado con precios de mayorista: los profesionales vinculados filtran por precio y disponibilidad. Un descuento del 5% para cuentas corrientes y respuesta rápida a reservas suelen convertir consultas en vínculos.', createdAt: D(4) } })

  console.log('✅ Stock, CRM, obras, reseñas, favoritos, notificaciones y Homy creados')
}

// ───────────── RESUMEN FINAL ─────────────
async function summary() {
  const line = '—'
  const count = async (label, fn) => console.log(`  ${label}: ${await fn()}`)
  console.log(`\n📊 RESUMEN DEL ECOSISTEMA DEMO ${line.repeat(4)}`)
  await count('Publicaciones de trabajo', () => db.jobPost.count())
  await count('Presupuestos (bids)', () => db.jobBid.count())
  await count('Proyectos', () => db.project.count())
  await count('Materiales de proyecto', () => db.projectMaterial.count())
  await count('Facturas', () => db.invoice.count())
  await count('Pagos', () => db.payment.count())
  await count('Ítems de stock', () => db.providerStock.count())
  await count('Movimientos de stock', () => db.stockMovement.count())
  await count('Reservas de stock', () => db.stockReservation.count())
  await count('Vínculos proveedor↔pro', () => db.providerLink.count())
  await count('Pipelines CRM', () => db.crmPipeline.count())
  await count('Deals CRM', () => db.crmDeal.count())
  await count('Obras completadas', () => db.completedWork.count())
  await count('Reseñas', () => db.review.count())
  await count('Favoritos', () => db.favorite.count())
  await count('Notificaciones', () => db.notification.count())
  await count('Conversaciones', () => db.conversation.count())
  await count('Mensajes directos', () => db.message.count())
  await count('Mensajes Homy', () => db.homyMessage.count())
  const users = await db.user.findMany({ where: { email: { endsWith: '@homia.test' } }, select: { email: true, displayName: true, rating: true, reviewsCount: true, roles: true, verificationStatus: true } })
  console.log('\n👥 USUARIOS DEMO:')
  for (const u of users) console.log(`  ${u.email} — ${u.displayName} — roles=${u.roles} rating=${u.rating} (${u.reviewsCount}) verificación=${u.verificationStatus}`)
  console.log(`\n🔑 CONTRASEÑA ÚNICA: ${PW}`)
}

main()
  .catch((e) => { console.error('❌ Seed falló:', e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
