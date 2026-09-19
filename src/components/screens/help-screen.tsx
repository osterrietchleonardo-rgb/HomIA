'use client'
// Centro de ayuda HomIA — "¿Dónde hago cada cosa?" por rol + reglas de confianza + FAQ.
// Pública (desde home/footer) y embebida en el panel de los 3 roles.
import { useState } from 'react'
import { navigate, Link } from '@/lib/router'
import { useSession } from '@/lib/store'
import { startTour } from '@/components/help/tour-overlay'
import { type TourRole } from '@/lib/tour-content'
import {
  LifeBuoy, User, HardHat, Boxes, ShieldCheck, Star, MessageCircle, Wallet,
  Compass, FolderKanban, Megaphone, ClipboardList, FileText, Search, Package,
  ArrowRight, ChevronDown, ChevronUp, BadgeCheck, Lock, Handshake, Play,
} from 'lucide-react'

type Row = { what: string; where: string; href?: string; hrefLabel?: string }
type RoleGuide = {
  id: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string
  intro: string
  rows: Row[]
  rules: { title: string; body: string }[]
}

const GUIDES: RoleGuide[] = [
  {
    id: 'cliente',
    label: 'Soy cliente',
    icon: User,
    tone: 'homy-chip-blue',
    intro: 'Publicás lo que necesitás, comparás presupuestos, contratá con escrow y calificá a quienes trabajaron en tu casa.',
    rows: [
      { what: 'Publicar un trabajo (gratis)', where: 'Panel → Publicar trabajo', href: '/panel/cliente/publicar', hrefLabel: 'Publicar' },
      { what: 'Comparar presupuestos recibidos', where: 'Panel → Mis trabajos → elegí la publicación', href: '/panel/cliente/trabajos', hrefLabel: 'Mis trabajos' },
      { what: 'Buscar y contactar profesionales', where: 'Directorio (ordenado por reseñas) → botón Contactar o Contratar', href: '/panel/cliente/directorio', hrefLabel: 'Directorio' },
      { what: 'Contratar paso a paso', where: 'Directorio → botón Contratar en la tarjeta del profesional', href: '/panel/cliente/directorio', hrefLabel: 'Contratar' },
      { what: 'Aprobar materiales y seguir la obra', where: 'Panel → Proyectos → detalle del proyecto', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Pagar una factura (Mercado Pago o efectivo)', where: 'Panel → Facturas → elegí el método al pagar', href: '/panel/cliente/facturas', hrefLabel: 'Facturas' },
      { what: 'Ver y descargar facturas en PDF', where: 'Panel → Facturas → botón PDF', href: '/panel/cliente/facturas', hrefLabel: 'Facturas' },
      { what: 'Dejar una reseña (pro y proveedor)', where: 'Detalle de un proyecto finalizado → sección Reseñas (con fotos)', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Pagar materiales al proveedor', where: 'Detalle del proyecto → Pagos a proveedores (cobros de cada proveedor)', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Chatear con profesional o proveedor', where: 'Panel → Mensajes (vos siempre iniciás la conversación)', href: '/panel/cliente/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación (la IA valida tus fotos)', href: '/panel/cliente/verificacion', hrefLabel: 'Verificación' },
    ],
    rules: [
      { title: 'El pago queda protegido (escrow)', body: 'Elegís cómo pagar cada factura: Mercado Pago (respaldado por la plataforma) o efectivo (el profesional confirma cuando cobra). Con escrow, el dinero queda retenido hasta que des conformidad.' },
      { title: 'Vos iniciás el chat', body: 'Por tu seguridad, los profesionales y proveedores no pueden escribirte primero: solo pueden responder a tus mensajes.' },
      { title: 'Reseñas: solo de obras reales y finalizadas', body: 'Al finalizar el proyecto aparece la sección Reseñas: calificás a tu profesional y a cada proveedor con estrellas, comentario y hasta 4 fotos. Nadie puede reseñar sin un proyecto real entre ambos.' },
    ],
  },
  {
    id: 'profesional',
    label: 'Soy profesional',
    icon: HardHat,
    tone: 'homy-chip-orange',
    intro: 'Encontrá trabajos, mandá presupuestos, comprá materiales al mejor precio y cobré protegido con escrow.',
    rows: [
      { what: 'Buscar trabajos publicados', where: 'Panel → Bolsa de trabajos (filtrá por tu rubro y zona)', href: '/panel/profesional/bolsa', hrefLabel: 'Bolsa' },
      { what: 'Enviar presupuestos', where: 'Detalle del trabajo → Enviar presupuesto', href: '/panel/profesional/bolsa', hrefLabel: 'Bolsa' },
      { what: 'Seguir tus proyectos y etapas', where: 'Panel → Proyectos → detalle (materiales, facturas, escrow)', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Proponer materiales y comparar precios', where: 'Detalle del proyecto → Materiales (comparables entre proveedores)', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Emitir facturas y cobrar', where: 'Detalle del proyecto → Emitir factura (el cliente paga con Mercado Pago o efectivo — confirmás el cobro)', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Definir quién paga los materiales', where: 'Detalle del proyecto → tarjeta ¿Quién paga los materiales?', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Mostrar tus obras (vitrina)', where: 'Panel → Mis obras → cargar fotos del trabajo terminado', href: '/panel/profesional/obras', hrefLabel: 'Mis obras' },
      { what: 'Gestionar tus clientes (CRM)', where: 'Panel → CRM clientes', href: '/panel/profesional/crm', hrefLabel: 'CRM' },
      { what: 'Dejar una reseña al cliente', where: 'Detalle de un proyecto finalizado → formulario de reseña', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Responder chats', where: 'Panel → Mensajes (los clientes inician, vos respondés)', href: '/panel/profesional/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación — sin verificar quedás como "No verificado" ante todos', href: '/panel/profesional/verificacion', hrefLabel: 'Verificación' },
    ],
    rules: [
      { title: 'Cobrá protegido', body: 'Con Mercado Pago, el dinero queda retenido por la plataforma hasta que el cliente apruebe la obra. Si el cliente paga en efectivo, el acuerdo queda registrado y vos confirmás el cobro cuando lo recibís.' },
      { title: 'Los clientes escriben primero', body: 'Podés responder todos los chats que quieras, pero la conversación nueva siempre la inicia el cliente. Es la regla de confianza de HomIA.' },
      { title: 'Tu verificación vale oro', body: 'El check verde de identidad (validado por IA) multiplica tus chances de ser contratado. Si no subís tu DNI figurás como "No verificado".' },
    ],
  },
  {
    id: 'proveedor',
    label: 'Soy proveedor',
    icon: Boxes,
    tone: 'homy-chip-ai',
    intro: 'Publicá tu catálogo, conectá con profesionales que compran materiales y gestioná tu stock y tus tratos.',
    rows: [
      { what: 'Publicar materiales y precios', where: 'Panel → Stock → agregar elementos al catálogo', href: '/panel/proveedor/stock', hrefLabel: 'Stock' },
      { what: 'Alertas de reposición', where: 'Panel → Inicio (marcados "por agotar" y "agotados")', href: '/panel/proveedor', hrefLabel: 'Inicio' },
      { what: 'Vincularte con profesionales', where: 'Panel → Vinculaciones → crear cuenta de retiro', href: '/panel/proveedor/vinculaciones', hrefLabel: 'Vinculaciones' },
      { what: 'Gestionar tratos (CRM)', where: 'Panel → CRM', href: '/panel/proveedor/crm', hrefLabel: 'CRM' },
      { what: 'Aparecer en el directorio', where: 'Tu perfil público se arma solo con tu stock y reseñas', href: '/panel/proveedor/directorio', hrefLabel: 'Directorio' },
      { what: 'Recibir reseñas de clientes', where: 'Los clientes califican tu entrega al finalizar proyectos con tus materiales', href: '/panel/proveedor/directorio', hrefLabel: 'Directorio' },
      { what: 'Cobrar materiales directo al cliente', where: 'Panel → Cobros → emitir cobro por los materiales aprobados', href: '/panel/proveedor/cobros', hrefLabel: 'Cobros' },
      { what: 'Responder chats', where: 'Panel → Mensajes (los clientes inician, vos respondés)', href: '/panel/proveedor/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación — el check verde aumenta tus ventas', href: '/panel/proveedor/verificacion', hrefLabel: 'Verificación' },
    ],
    rules: [
      { title: 'Tu stock es tu vidriera', body: 'Los profesionales comparan precios entre proveedores antes de comprar: catálogo completo y actualizado = más ventas.' },
      { title: 'Cobros directos al cliente', body: 'En proyectos con modo "el cliente paga al proveedor", emitís el cobro por tus materiales desde Cobros y el cliente te paga con Mercado Pago o efectivo (lo confirmás vos).' },
      { title: 'Reputación con evidencia', body: 'Las reseñas de los clientes pueden incluir fotos de la entrega: más confianza, más ventas. Solo clientes con un proyecto real finalizado pueden reseñarte.' },
    ],
  },
]

const FAQ = [
  {
    q: '¿Qué es el escrow y por qué es más seguro?',
    a: 'Cuando el cliente paga una factura, el dinero queda retenido por HomIA (no va directo al profesional). Se libera cuando el cliente aprueba el trabajo terminado. Así el profesional sabe que el dinero existe, y el cliente sabe que solo se libera si la obra salió bien.',
  },
  {
    q: '¿Dónde dejo una reseña, a quién y en qué momento?',
    a: 'Las reseñas se dejan desde el detalle de un proyecto, y se activan recién cuando la obra finaliza. Solo pueden reseñarse participantes reales de esa obra: el cliente califica a su profesional y a cada proveedor que le vendió materiales, y el profesional califica al cliente. Una reseña por persona y proyecto, con estrellas, comentario y hasta 4 fotos. Nadie puede reseñar sin un proyecto real entre ambos.',
  },
  {
    q: '¿Cómo pago una factura: Mercado Pago o efectivo?',
    a: 'El cliente elige el método al pagar: Mercado Pago (el pago queda respaldado por la plataforma) o efectivo. Con efectivo, el acuerdo queda registrado: el profesional ve que va a cobrar en efectivo y confirma desde su panel cuando recibe el dinero — recién ahí la factura queda pagada. Podés cancelar el acuerdo antes de la confirmación y elegir otro método.',
  },
  {
    q: '¿Quién paga los materiales?',
    a: 'Lo acuerdan profesional y cliente en cada proyecto y lo ven los dos siempre: (1) los adelanta el profesional y los cobra junto con la mano de obra en su factura, o (2) el cliente los paga directamente al proveedor: el proveedor emite el cobro desde su panel (Panel → Cobros) y el cliente paga con Mercado Pago o acuerda efectivo. En el modo 2, la factura del profesional cubre solo mano de obra y la garantía (escrow) retiene solo ese monto.',
  },
  {
    q: '¿Por qué hay usuarios "No verificados"?',
    a: 'HomIA verifica la identidad con el DNI: subís foto del frente y del dorso y un modelo de IA analiza que el documento sea real y legible. Quien no lo subió aparece con la marca "No verificado" junto a su nombre — es información clave para decidir con quién contratás.',
  },
  {
    q: '¿Quién puede iniciar un chat?',
    a: 'Siempre el cliente. Los profesionales y proveedores pueden responder cualquier conversación, pero no pueden escribirle primero a un cliente. Así evitamos molestias y el cliente mantiene el control.',
  },
  {
    q: '¿Publicar un trabajo cuesta algo?',
    a: 'No. Publicar, recibir presupuestos y chatear es gratis para el cliente. HomIA cobra comisión solo cuando se ejecuta y factura un trabajo.',
  },
  {
    q: '¿Cómo funciona "Contratar" desde el directorio?',
    a: 'Elegís un profesional del directorio, tocás "Contratar" y un asistente de 4 pasos te guía: qué necesitás (con fotos), cuándo y dónde, presupuesto estimado y confirmación. Se crea el proyecto y el profesional recibe todo el brief al instante.',
  },
  {
    q: '¿Puedo descargar mis facturas?',
    a: 'Sí, todas las facturas se ven y descargan como PDF con formato profesional: desde Facturas (panel del cliente) o desde el detalle de cada proyecto.',
  },
  {
    q: '¿Puedo tener más de un rol?',
    a: 'Sí. Con la misma cuenta podés ser cliente, profesional y/o proveedor. Cambiás de rol desde el selector arriba a la derecha del panel, y cada rol tiene su propio panel con sus herramientas.',
  },
]

const TOUR_ROLES: { id: TourRole; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { id: 'cliente', label: 'Cliente', icon: User, tone: 'homy-chip-blue' },
  { id: 'profesional', label: 'Profesional', icon: HardHat, tone: 'homy-chip-orange' },
  { id: 'proveedor', label: 'Proveedor', icon: Boxes, tone: 'homy-chip-ai' },
]

export default function HelpScreen({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState('cliente')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const { user } = useSession()
  const guide = GUIDES.find((g) => g.id === tab) || GUIDES[0]

  return (
    <div className={embedded ? 'homy-page' : 'mx-auto w-full max-w-5xl px-4 py-10 sm:py-14'}>
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Centro de ayuda</span>
          <h1 className="homy-page-title mt-1.5">¿Dónde hago cada cosa?</h1>
          <p className="homy-page-sub">
            Guía rápida por rol: cada acción de HomIA con su lugar exacto en la plataforma. Sin vueltas.
          </p>
        </div>
        <span className="homy-icon-chip homy-chip-blue size-14 shrink-0 [&_svg]:size-7" aria-hidden><LifeBuoy /></span>
      </header>

      {/* recorrido guiado por rol — el tutorial completo en la app */}
      <section className="homy-glass-dark relative mb-5 overflow-hidden rounded-3xl p-5 sm:p-6" aria-label="Recorrido guiado por rol">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#00C4FF]/18 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 left-[-10%] size-56 rounded-full bg-[#FF5A1F]/12 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="homy-icon-chip homy-chip-ai size-11 shrink-0 [&_svg]:size-5.5" aria-hidden><Compass /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-white sm:text-lg">Recorrido guiado por rol</h2>
            <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-slate-300">
              Un tutorial interactivo te lleva sección por sección: qué es, qué podés hacer ahí y cómo no trabarte. Se arranca solo en tu primer ingreso y lo repetís cuando quieras desde el botón de ayuda (abajo a la derecha).
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {TOUR_ROLES.map((r) => {
            const available = !!user?.roles?.includes(r.id)
            return (
              <button key={r.id} disabled={!available} onClick={() => startTour({ role: r.id })}
                title={available ? `Empezar el recorrido ${r.label}` : 'Disponible al activar ese rol en tu cuenta'}
                className={`homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
                  available
                    ? 'bg-white text-[#0A2540] shadow-lg hover:bg-slate-100'
                    : 'cursor-not-allowed bg-white/10 text-slate-400'
                }`}>
                <Play className={`size-4 ${available ? 'text-[#1D63B8]' : ''}`} aria-hidden />
                Tour {r.label}
              </button>
            )
          })}
          {!user && (
            <button onClick={() => navigate('/registrarse')} className="homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#0A2540] shadow-lg transition hover:bg-slate-100">
              Crear cuenta para empezar <ArrowRight className="size-4 text-[#1D63B8]" aria-hidden />
            </button>
          )}
        </div>
      </section>

      {/* tabs por rol */}
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Elegí tu rol">
        {GUIDES.map((g) => (
          <button key={g.id} role="tab" aria-selected={tab === g.id} onClick={() => setTab(g.id)}
            className={`homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
              tab === g.id ? 'bg-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'
            }`}>
            <g.icon className="size-4" aria-hidden />
            {g.label}
          </button>
        ))}
      </div>

      {/* intro + tabla dónde hago cada cosa */}
      <section className="homy-glass rounded-3xl p-5 sm:p-6" aria-label={`Guía ${guide.label}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`homy-icon-chip size-10 shrink-0 [&_svg]:size-5 ${guide.tone}`} aria-hidden><guide.icon /></span>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-slate-600">{guide.intro}</p>
        </div>
        <ul className="mt-4 divide-y divide-[#0A2540]/6">
          {guide.rows.map((r) => (
            <li key={r.what} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#0A2540]">{r.what}</span>
                <span className="mt-0.5 block text-xs font-medium text-slate-400">{r.where}</span>
              </span>
              {r.href && (
                <button onClick={() => navigate(r.href!)}
                  className="homy-focus inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-[#1D63B8]/10 px-3.5 py-1.5 text-xs font-extrabold text-[#1D63B8] transition hover:bg-[#1D63B8] hover:text-white">
                  {r.hrefLabel || 'Ir'} <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* reglas de confianza del rol */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {guide.rules.map((r) => (
          <article key={r.title} className="homy-glass-soft rounded-2xl p-4">
            <ShieldCheck className="size-5 text-[#0e9f6e]" aria-hidden />
            <h3 className="mt-2 text-sm font-extrabold text-[#0A2540]">{r.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{r.body}</p>
          </article>
        ))}
      </div>

      {/* pilares de confianza (siempre visibles) */}
      <section className="mt-7" aria-label="Cómo te cuidamos">
        <h2 className="homy-section-title">
          <span className="homy-icon-chip homy-chip-mint size-8 shrink-0 [&_svg]:size-4" aria-hidden><Handshake /></span>
          Los 4 pilares de confianza HomIA
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TrustCard icon={Wallet} tone="text-[#0e9f6e]" title="Escrow real" body="El dinero se retiene y se libera solo cuando el trabajo se aprueba." />
          <TrustCard icon={BadgeCheck} tone="text-[#0e9f6e]" title="Identidad por IA" body="DNI frente + dorso analizados por IA de visión. Verificado o No verificado, a la vista de todos." />
          <TrustCard icon={Star} tone="text-[#B98A00]" title="Reseñas con fotos" body="Estrellas + comentario + fotos del trabajo: decisiones con evidencia, no con promesas." />
          <TrustCard icon={MessageCircle} tone="text-[#1D63B8]" title="Chat seguro" body="El cliente siempre inicia la conversación. Nadie puede escribirte sin tu consentimiento previo." />
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-7" aria-label="Preguntas frecuentes">
        <h2 className="homy-section-title">
          <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><Lock /></span>
          Preguntas frecuentes
        </h2>
        <div className="mt-4 space-y-2">
          {FAQ.map((f, i) => (
            <div key={f.q} className="homy-glass-soft overflow-hidden rounded-2xl">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}
                className="homy-focus flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0 flex-1 text-sm font-extrabold text-[#0A2540]">{f.q}</span>
                {openFaq === i
                  ? <ChevronUp className="size-4 shrink-0 text-slate-400" aria-hidden />
                  : <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />}
              </button>
              {openFaq === i && (
                <p className="px-4 pb-4 text-sm leading-relaxed text-slate-500">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      {!embedded && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 rounded-3xl homy-glass-dark p-6 text-center text-white">
          <p className="w-full text-sm font-semibold text-slate-300">¿Listo para empezar? Creá tu cuenta gratis y elegí tu rol.</p>
          <button onClick={() => navigate('/registrarse')} className="homy-btn-primary px-6 py-3 text-sm">Crear cuenta gratis</button>
          <Link to="/" className="homy-btn-ghost px-6 py-3 text-sm">Volver al inicio</Link>
        </div>
      )}
    </div>
  )
}

function TrustCard({ icon: Icon, tone, title, body }: { icon: React.ComponentType<{ className?: string }>; tone: string; title: string; body: string }) {
  return (
    <article className="homy-glass homy-lift rounded-2xl p-4">
      <Icon className={`size-5 ${tone}`} aria-hidden />
      <h3 className="mt-2 text-sm font-extrabold text-[#0A2540]">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
    </article>
  )
}
