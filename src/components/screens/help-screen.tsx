'use client'
// Centro de ayuda HomIA — "¿Dónde hago cada cosa?" por rol + reglas de confianza + FAQ.
// Pública (desde home/footer) y embebida en el panel de los 3 roles.
import { useEffect, useState } from 'react'
import { navigate, Link, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { startTour } from '@/components/help/tour-overlay'
import { openVideo } from '@/components/help/video-modal'
import { videosForRole } from '@/lib/videos-content'
import { type TourRole } from '@/lib/tour-content'
import { FAQ } from '@/lib/ayuda-faq'
import {
  LifeBuoy, User, HardHat, Boxes, ShieldCheck, Star, MessageCircle, Wallet,
  Compass, FolderKanban, Megaphone, ClipboardList, FileText, Search, Package,
  ArrowRight, ChevronDown, ChevronUp, BadgeCheck, Lock, Handshake, Play, Clapperboard,
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
    intro: 'Publicás lo que necesitás, comparás presupuestos, contratás y calificás a quienes trabajaron en tu casa.',
    rows: [
      { what: 'Publicar un trabajo (gratis)', where: 'Panel → Publicar trabajo', href: '/panel/cliente/publicar', hrefLabel: 'Publicar' },
      { what: 'Comparar presupuestos recibidos', where: 'Panel → Mis trabajos → elegí la publicación (también la cerrás o la reabrís)', href: '/panel/cliente/trabajos', hrefLabel: 'Mis trabajos' },
      { what: 'Buscar y contactar profesionales', where: 'Directorio (ordenado por reseñas) → botón Contactar o Contratar', href: '/panel/cliente/directorio', hrefLabel: 'Directorio' },
      { what: 'Contratar paso a paso', where: 'Directorio → Contratar en la tarjeta del profesional (si ya lo publicaste, elegí tu trabajo arriba y se cargan sus datos)', href: '/panel/cliente/directorio', hrefLabel: 'Contratar' },
      { what: 'Aprobar materiales y seguir la obra', where: 'Panel → Proyectos → detalle del proyecto', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Acordar fechas y horario del trabajo', where: 'Detalle del proyecto → Fechas del trabajo: aceptar, proponer otras o rechazar', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Dar la obra por terminada', where: 'Detalle del proyecto → Finalizar obra (solo vos podés)', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Pagar una factura (Mercado Pago o efectivo)', where: 'Panel → Facturas → elegí el método al pagar', href: '/panel/cliente/facturas', hrefLabel: 'Facturas' },
      { what: 'Ver y descargar facturas en PDF', where: 'Panel → Facturas → botón PDF', href: '/panel/cliente/facturas', hrefLabel: 'Facturas' },
      { what: 'Dejar una reseña (pro y proveedor)', where: 'Detalle de un proyecto finalizado → sección Reseñas (con fotos)', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Pagar materiales al proveedor', where: 'Detalle del proyecto → Pagos a proveedores (cobros de cada proveedor)', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Comprar o reservar materiales (carrito)', where: 'Panel → Materiales → Agregar al carrito o Reservar; el carrito es el ícono de arriba', href: '/panel/cliente/materiales', hrefLabel: 'Materiales' },
      { what: 'Pagar y seguir tus pedidos', where: 'Panel → Mis pedidos: cada proveedor por separado, con su línea de tiempo; calificás la compra cuando la retirás', href: '/panel/cliente/pedidos', hrefLabel: 'Mis pedidos' },
      { what: 'Devolver sobrantes', where: 'Detalle del proyecto → Sobrantes (o el pedido en Mis pedidos) → cargá foto y cantidad; quien te cobró los materiales los acepta y se los entregás', href: '/panel/cliente/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Chatear con profesional o proveedor', where: 'Panel → Mensajes (vos siempre iniciás la conversación)', href: '/panel/cliente/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación (la IA valida tus fotos)', href: '/panel/cliente/verificacion', hrefLabel: 'Verificación' },
      { what: 'Tus datos, email y celular, avisos por mail o eliminar la cuenta', where: 'Panel → Mi perfil', href: '/panel/cliente/perfil', hrefLabel: 'Mi perfil' },
      { what: 'Mandar una sugerencia, queja o problema', where: 'Panel → Sugerencias → Nueva sugerencia (con fotos)', href: '/panel/cliente/sugerencias', hrefLabel: 'Sugerencias' },
    ],
    rules: [
      { title: 'Pago al finalizar la obra', body: 'Elegís cómo pagar cada factura: Mercado Pago o efectivo (el profesional confirma cuando cobra). Pagás al finalizar la obra, una vez que das tu conformidad, y el dinero va directo al profesional.' },
      { title: 'Vos iniciás el chat', body: 'Por tu seguridad, los profesionales y proveedores no pueden escribirte primero: solo pueden responder a tus mensajes.' },
      { title: 'Reseñas: solo de obras reales y finalizadas', body: 'Al finalizar el proyecto aparece la sección Reseñas: calificás a tu profesional y a cada proveedor con estrellas, comentario y hasta 4 fotos. Nadie puede reseñar sin un proyecto real entre ambos.' },
    ],
  },
  {
    id: 'profesional',
    label: 'Soy profesional',
    icon: HardHat,
    tone: 'homy-chip-orange',
    intro: 'Encontrá trabajos, mandá presupuestos, comprá materiales al mejor precio y cobrá por Mercado Pago o efectivo.',
    rows: [
      { what: 'Buscar trabajos publicados', where: 'Panel → Bolsa de trabajos (filtrá por tu rubro y zona)', href: '/panel/profesional/bolsa', hrefLabel: 'Bolsa' },
      { what: 'Enviar presupuestos', where: 'Detalle del trabajo → Enviar presupuesto; lo seguís (o lo retirás) en Mis ofertas', href: '/panel/profesional/bolsa', hrefLabel: 'Bolsa' },
      { what: 'Seguir tus proyectos y etapas', where: 'Panel → Proyectos → detalle (avanzás de etapa hasta Revisión; el cliente la finaliza)', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Proponer fechas y ver tu calendario', where: 'Detalle del proyecto → Fechas del trabajo; Panel → Calendario para el mes, la agenda de cada día y Mi jornada', href: '/panel/profesional/calendario', hrefLabel: 'Calendario' },
      { what: 'Proponer materiales y comparar precios', where: 'Detalle del proyecto → Materiales (comparables entre proveedores)', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Definir quién paga los materiales', where: 'Detalle del proyecto → tarjeta ¿Quién paga los materiales?', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Emitir la factura', where: 'Detalle del proyecto → Emitir factura', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Cobrar: conectar Mercado Pago y ver tus facturas', where: 'Panel → Cobros: conectás tu Mercado Pago, ves lo cobrado y lo pendiente, descargás PDF y confirmás el efectivo', href: '/panel/profesional/cobros', hrefLabel: 'Cobros' },
      { what: 'Ver tus finanzas (ganancia, caja, balance)', where: 'Panel → Finanzas: tus facturas se cargan solas; sumás gastos, costos, inversiones e ingresos por fuera. Pestaña Aprendé para entender cada número', href: '/panel/profesional/finanzas', hrefLabel: 'Finanzas' },
      { what: 'Comprar materiales para vos', where: 'Panel → Materiales (carrito) y Mis pedidos', href: '/panel/profesional/materiales', hrefLabel: 'Materiales' },
      { what: 'Devoluciones de sobrantes', where: 'Panel → Devoluciones: las de tus clientes por materiales que cobraste en tu factura (aceptás, recibís y reembolsás) y las que les pedís a tus proveedores desde el proyecto (Sobrantes → Pedir devolución a …)', href: '/panel/profesional/devoluciones', hrefLabel: 'Devoluciones' },
      { what: 'Subcontratar a otro profesional', where: 'Perfil del otro profesional → Contratar → elegí uno de tus proyectos activos (tu cliente no lo ve)', href: '/panel/profesional/directorio', hrefLabel: 'Directorio' },
      { what: 'Mostrar tus obras (vitrina)', where: 'Panel → Mis obras → cargar fotos del trabajo terminado', href: '/panel/profesional/obras', hrefLabel: 'Mis obras' },
      { what: 'Seguir tus oportunidades (CRM)', where: 'Panel → CRM clientes: tablero de tratos por etapa', href: '/panel/profesional/crm', hrefLabel: 'CRM' },
      { what: 'Dejar una reseña al cliente', where: 'Detalle de un proyecto finalizado → formulario de reseña', href: '/panel/profesional/proyectos', hrefLabel: 'Proyectos' },
      { what: 'Responder chats', where: 'Panel → Mensajes (los clientes inician, vos respondés)', href: '/panel/profesional/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación: sin verificar quedás como "No verificado" ante todos', href: '/panel/profesional/verificacion', hrefLabel: 'Verificación' },
      { what: 'Tus rubros, zona, datos, avisos por mail o eliminar la cuenta', where: 'Panel → Mi perfil', href: '/panel/profesional/perfil', hrefLabel: 'Mi perfil' },
      { what: 'Mandar una sugerencia, queja o problema', where: 'Panel → Sugerencias → Nueva sugerencia (con fotos)', href: '/panel/profesional/sugerencias', hrefLabel: 'Sugerencias' },
    ],
    rules: [
      { title: 'Cobrás al finalizar, sin comisión', body: 'Emitís la factura cuando la obra termina y el cliente la paga con Mercado Pago (va directo a tu cuenta) o en efectivo (el acuerdo queda registrado y vos confirmás el cobro cuando lo recibís). HomIA no cobra comisión sobre tus facturas.' },
      { title: 'Los clientes escriben primero', body: 'Podés responder todos los chats que quieras, pero la conversación nueva siempre la inicia el cliente. Es la regla de confianza de HomIA.' },
      { title: 'Tu verificación vale oro', body: 'El check verde de identidad (validado por IA) multiplica tus chances de ser contratado. Si no subís tu DNI figurás como "No verificado".' },
    ],
  },
  {
    id: 'proveedor',
    label: 'Soy proveedor',
    icon: Boxes,
    tone: 'homy-chip-ai',
    intro: 'Publicá tu catálogo, vendé con compras y reservas, cobrá directo en tu Mercado Pago o en efectivo y seguí tus números.',
    rows: [
      { what: 'Publicar materiales y precios', where: 'Panel → Stock → elegí el elemento del catálogo y cargá precio, cantidad, marca y foto (si no está, lo agregás con IA)', href: '/panel/proveedor/stock', hrefLabel: 'Stock' },
      { what: 'Alertas de reposición', where: 'Panel → Inicio (marcados "por agotar" y "agotados")', href: '/panel/proveedor', hrefLabel: 'Inicio' },
      { what: 'Compras y reservas del carrito', where: 'Panel → Cobros → Ventas (pedidos): las compras llegan por pagar; las reservas las aprobás o les ponés fecha', href: '/panel/proveedor/cobros', hrefLabel: 'Ventas' },
      { what: 'Cobrar materiales de un proyecto', where: 'Panel → Cobros → Cobros de proyectos → emitir cobro por los materiales aprobados', href: '/panel/proveedor/cobros', hrefLabel: 'Cobros' },
      { what: 'Conectar Mercado Pago', where: 'Panel → Cobros → botón "Conectar Mercado Pago" (así los pagos van directo a tu cuenta)', href: '/panel/proveedor/cobros', hrefLabel: 'Cobros' },
      { what: 'Gestionar devoluciones de sobrantes', where: 'Panel → Cobros → Devoluciones → aceptá los ítems, marcá recibido cuando los traigan y registrá el reembolso (si te lo pide un profesional, marcás cómo le devolviste la plata por fuera de HomIA)', href: '/panel/proveedor/cobros', hrefLabel: 'Cobros' },
      { what: 'Mi plan (Básico o PRO)', where: 'Panel → Mi plan → 14 días gratis, después Básico $50.000/mes o PRO $100.000/mes; se cancela desde tu cuenta de Mercado Pago', href: '/panel/proveedor/plan', hrefLabel: 'Mi plan' },
      { what: 'Tu logo y marca en la portada (PRO)', where: 'Panel → Mi perfil → Tu marca en la home', href: '/panel/proveedor/perfil', hrefLabel: 'Mi perfil' },
      { what: 'Analítica de demanda (PRO)', where: 'Panel → Inicio: ventas, elementos más pedidos y búsquedas de los últimos 30 días', href: '/panel/proveedor', hrefLabel: 'Inicio' },
      { what: 'Ver tus finanzas (ganancia, caja, balance, stock al costo)', where: 'Panel → Finanzas: tus ventas se cargan solas; cargás el costo de tus productos, gastos, compras de mercadería e ingresos de mostrador. Pestaña Aprendé para entender cada número', href: '/panel/proveedor/finanzas', hrefLabel: 'Finanzas' },
      { what: 'Vincularte con profesionales', where: 'Panel → Vinculaciones → activá el vínculo para que retiren materiales a cuenta de un proyecto', href: '/panel/proveedor/vinculaciones', hrefLabel: 'Vinculaciones' },
      { what: 'Seguir tus tratos (CRM)', where: 'Panel → CRM: tablero de tratos por etapa', href: '/panel/proveedor/crm', hrefLabel: 'CRM' },
      { what: 'Aparecer en el directorio', where: 'Tu perfil público se arma solo con tu stock, tus reseñas y tu verificación', href: '/panel/proveedor/directorio', hrefLabel: 'Directorio' },
      { what: 'Recibir reseñas de clientes', where: 'Los clientes te califican al retirar una compra o al finalizar una obra con tus materiales', href: '/panel/proveedor/directorio', hrefLabel: 'Directorio' },
      { what: 'Responder chats', where: 'Panel → Mensajes (los clientes inician, vos respondés)', href: '/panel/proveedor/mensajes', hrefLabel: 'Mensajes' },
      { what: 'Verificar tu identidad con DNI', where: 'Panel → Verificación: el check verde aumenta tus ventas', href: '/panel/proveedor/verificacion', hrefLabel: 'Verificación' },
      { what: 'Datos del negocio, avisos por mail o eliminar la cuenta', where: 'Panel → Mi perfil', href: '/panel/proveedor/perfil', hrefLabel: 'Mi perfil' },
      { what: 'Mandar una sugerencia, queja o problema', where: 'Panel → Sugerencias → Nueva sugerencia (con fotos)', href: '/panel/proveedor/sugerencias', hrefLabel: 'Sugerencias' },
    ],
    rules: [
      { title: 'Tu stock es tu vidriera', body: 'Los profesionales comparan precios entre proveedores antes de comprar: catálogo completo y actualizado = más ventas.' },
      { title: 'Cobros directos al cliente', body: 'En proyectos con modo "el cliente paga al proveedor", emitís el cobro por tus materiales desde Cobros y el cliente te paga con Mercado Pago o efectivo (lo confirmás vos).' },
      { title: 'Reputación con evidencia', body: 'Las reseñas de los clientes pueden incluir fotos de la entrega: más confianza, más ventas. Solo te reseña quien te compró de verdad: una compra entregada o una obra finalizada con tus materiales.' },
    ],
  },
]

const TOUR_ROLES: { id: TourRole; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { id: 'cliente', label: 'Cliente', icon: User, tone: 'homy-chip-blue' },
  { id: 'profesional', label: 'Profesional', icon: HardHat, tone: 'homy-chip-orange' },
  { id: 'proveedor', label: 'Proveedor', icon: Boxes, tone: 'homy-chip-ai' },
]

export default function HelpScreen({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession()
  // Si está logueado, solo mostrar los roles que tiene; si no, mostrar todos
  const userRoles = user?.roles ?? []
  const visibleGuides = userRoles.length > 0
    ? GUIDES.filter((g) => userRoles.includes(g.id))
    : GUIDES
  const visibleTourRoles = userRoles.length > 0
    ? TOUR_ROLES.filter((r) => userRoles.includes(r.id))
    : TOUR_ROLES
  const defaultTab = visibleGuides[0]?.id ?? 'cliente'
  const [tab, setTab] = useState(defaultTab)
  // ?tema=<tema> (pie de página, Homy, guías): abre esa pregunta y la muestra (temas en src/lib/ayuda-faq.ts)
  const { query } = useRoute()
  const tema = query.tema
  const faqDelTema = tema ? FAQ.findIndex((f) => f.tema === tema) : -1
  const [openFaq, setOpenFaq] = useState<number | null>(faqDelTema >= 0 ? faqDelTema : 0)
  useEffect(() => {
    if (faqDelTema < 0) return
    // después del reseteo de scroll de navigate(); abre la pregunta aunque la pantalla ya estuviera montada
    const t = window.setTimeout(() => {
      setOpenFaq(faqDelTema)
      document.getElementById(`ayuda-${tema}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 250)
    return () => window.clearTimeout(t)
  }, [faqDelTema, tema])
  const guide = visibleGuides.find((g) => g.id === tab) || visibleGuides[0] || GUIDES[0]

  return (
    <div className={embedded ? 'homy-page' : 'mx-auto w-full max-w-5xl px-4 pt-8 pb-10 sm:pb-14'}>
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

      {/* recorrido guiado por rol — solo los del usuario logueado */}
      <section className="homy-glass-dark relative mb-5 overflow-hidden rounded-3xl p-5 sm:p-6" aria-label="Recorrido guiado por rol">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#00C4FF]/18 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 left-[-10%] size-56 rounded-full bg-[#FF5A1F]/12 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="homy-icon-chip homy-chip-ai size-11 shrink-0 [&_svg]:size-5.5" aria-hidden><Compass /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-white sm:text-lg">Recorrido guiado por rol</h2>
            <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-slate-300">
              Un tutorial interactivo te lleva sección por sección: qué es, qué podés hacer ahí y cómo no trabarte. No arranca solo: lo empezás acá, desde «Tus primeros pasos» del Inicio o desde el botón de Homy (abajo a la derecha) → «Guías y tour».
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {user ? (
            visibleTourRoles.map((r) => (
              <button key={r.id} onClick={() => startTour({ role: r.id })}
                title={`Empezar el recorrido ${r.label}`}
                className="homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#0A2540] shadow-lg transition hover:bg-slate-100">
                <Play className="size-4 text-[#1D63B8]" aria-hidden />
                Tour {r.label}
              </button>
            ))
          ) : (
            // El recorrido señala secciones del panel: sin sesión no hay panel que recorrer.
            <button onClick={() => navigate('/registrarse')} className="homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#0A2540] shadow-lg transition hover:bg-slate-100">
              Creá tu cuenta para hacer el recorrido <ArrowRight className="size-4 text-[#1D63B8]" aria-hidden />
            </button>
          )}
        </div>
      </section>

      {/* tabs por rol — solo los roles del usuario */}
      {visibleGuides.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Elegí tu rol">
          {visibleGuides.map((g) => (
            <button key={g.id} role="tab" aria-selected={tab === g.id} onClick={() => setTab(g.id)}
              className={`homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
                tab === g.id ? 'bg-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'
              }`}>
              <g.icon className="size-4" aria-hidden />
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* videoteca: videitos cortos con locución, por rol */}
      <section className="homy-glass mb-5 rounded-3xl p-5 sm:p-6" aria-label="Videoteca HomIA">
        <div className="flex flex-wrap items-center gap-3">
          <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-5" aria-hidden><Clapperboard /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-[#0A2540] sm:text-lg">Videoteca {guide.label}</h2>
            <p className="text-xs font-semibold text-slate-500 sm:text-[13px]">
              Videitos cortos con voz: miralos cuando no sepas cómo hacer algo o antes de arrancar.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {videosForRole(tab).map((v) => (
            <button key={v.id} onClick={() => openVideo(v)}
              className="homy-focus group flex w-full items-center gap-3.5 rounded-2xl homy-glass-soft p-2.5 text-left transition hover:bg-white">
              <span className="relative block w-32 shrink-0 overflow-hidden rounded-xl sm:w-40" aria-hidden>
                <img src={`/videos/${v.id}.jpg`} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                <span className="absolute inset-0 grid place-items-center bg-[#0A2540]/25 transition group-hover:bg-[#1D63B8]/40">
                  <span className="grid size-9 place-items-center rounded-full bg-white/90 text-[#1D63B8] shadow transition group-hover:scale-110">
                    <Play className="size-4 fill-current" aria-hidden />
                  </span>
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug text-[#0A2540]">{v.title}</span>
                <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{v.desc}</span>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#1D63B8]/10 px-2.5 py-1 text-[11px] font-extrabold text-[#1D63B8] transition group-hover:bg-[#1D63B8] group-hover:text-white">
                  <Play className="size-3 fill-current" aria-hidden /> Reproducir
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

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
          <TrustCard icon={Wallet} tone="text-[#0e9f6e]" title="Pagás al finalizar" body="Pagás cuando la obra termina, con Mercado Pago o efectivo. El dinero va directo a quien trabajó." />
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
            <div key={f.q} id={`ayuda-${f.tema}`} className={`homy-glass-soft overflow-hidden rounded-2xl ${embedded ? 'scroll-mt-48 lg:scroll-mt-36' : 'scroll-mt-24'}`}>
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
