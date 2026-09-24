// Base de conocimiento de HomIA para el súper agente Homy.
// Fuente: las guías que ya ve el usuario (howto-content, tour-content, FAQ del
// centro de ayuda) + reglas de negocio decididas por el dueño. Las guías se
// IMPORTAN (una sola fuente de verdad): si alguien edita el tour o el "¿Cómo
// hago?", Homy lo sabe sin tocar este archivo.
// Regla: no inventar funciones. Lo que NO existe también está escrito acá.
import { HOWTOS, TROUBLES } from '@/lib/howto-content'
import { TOURS, type TourRole } from '@/lib/tour-content'
import { PLAN_PRICE_ARS, TRIAL_DAYS } from '@/lib/plans'
import type { RolHomy } from './tipos'

export type Entrada = {
  id: string
  titulo: string
  /** a quién aplica; 'todos' incluye visitantes */
  roles: (RolHomy | 'todos')[]
  texto: string
  /** sección de la app donde se hace (ruta SPA) */
  ruta?: string
  /** palabras con las que la gente lo pregunta (mejoran la búsqueda) */
  claves?: string
}

const ars = (n: number) => `$${n.toLocaleString('es-AR')}`
const BASICO = ars(PLAN_PRICE_ARS.basic)
const PRO = ars(PLAN_PRICE_ARS.pro)

/** Reglas de negocio y conceptos (decisiones del dueño, 2026-09-24). */
const NUCLEO: Entrada[] = [
  {
    id: 'que-es',
    titulo: 'Qué es HomIA',
    roles: ['todos'],
    texto:
      'HomIA es un ecosistema de servicios del hogar en Argentina con tres roles: el cliente busca y contrata profesionales (plomeros, electricistas, gasistas, pintores, etc.) y compra materiales; el profesional consigue trabajos, presupuesta, ejecuta y cobra; el proveedor (ferretería, corralón, pinturería, etc.) vende sus materiales con stock propio. Todo queda registrado en la plataforma: presupuestos, proyectos, pagos, facturas en PDF, reseñas y chats.',
    claves: 'que es homia como funciona para que sirve plataforma app',
  },
  {
    id: 'precios',
    titulo: 'Cuánto cuesta usar HomIA',
    roles: ['todos'],
    texto: `Para el cliente y para el profesional HomIA es gratis: registrarse, publicar trabajos, recibir presupuestos, contratar, chatear y facturar no cuesta nada. El proveedor tiene ${TRIAL_DAYS} días de prueba gratis y después elige plan: Básico ${BASICO} por mes (la app completa: stock, ventas, cobros por Mercado Pago y efectivo, CRM y vinculaciones) o PRO ${PRO} por mes (todo lo del Básico + su logo y marca en la cinta de sponsors de la home, la marca "Recomendado" y prioridad en marketplace, directorio, búsquedas y en Homy, y analítica de demanda de su zona). Además existe un cargo de servicio de HomIA del 1% que paga el cliente SOLO cuando paga con Mercado Pago; pagando en efectivo no hay cargo.`,
    ruta: '/ayuda',
    claves: 'precio costo cuanto cuesta gratis plan suscripcion comision cargo servicio 1% basico pro abono mensual',
  },
  {
    id: 'proveedor-planes',
    titulo: 'Planes del proveedor (prueba, Básico, PRO)',
    roles: ['todos', 'proveedor'],
    texto: `El proveedor arranca con ${TRIAL_DAYS} días gratis desde el alta. Al terminar la prueba tiene que elegir plan para seguir apareciendo y vendiendo: Básico ${BASICO}/mes o PRO ${PRO}/mes, que se pagan por suscripción de Mercado Pago. Sin plan activo (prueba vencida o suscripción cancelada), su stock deja de aparecer en búsquedas, marketplace, directorio y en Homy. El PRO suma: logo y marca en la home, tarjeta "Recomendado" y prioridad ante empates, y analítica (elementos más pedidos y consultas del rubro). Se gestiona en Panel → Mi plan.`,
    ruta: '/panel/proveedor/plan',
    claves: 'ser proveedor vender materiales plan pro basico prueba gratis 14 dias suscripcion recomendado sponsor analitica cancelar',
  },
  {
    id: 'pago',
    titulo: 'Cómo funciona el pago',
    roles: ['todos'],
    texto:
      'No hay pago por adelantado ni retención (HomIA no hace escrow). Trabajos: cuando la obra termina, el profesional emite la factura y el cliente la paga con Mercado Pago (el dinero va directo a la cuenta del profesional) o en efectivo (el acuerdo queda registrado y el profesional confirma cuando lo recibe). Materiales: cada proveedor cobra lo suyo, con Mercado Pago o en efectivo. Si el cliente paga con Mercado Pago se suma el cargo de servicio de HomIA del 1%; en efectivo no. Las facturas se descargan en PDF.',
    ruta: '/ayuda',
    claves: 'pago pagar como se paga mercado pago efectivo factura cobro adelanto seña garantia escrow',
  },
  {
    id: 'carrito',
    titulo: 'Comprar materiales: carrito multiproveedor',
    roles: ['todos', 'cliente', 'profesional'],
    texto:
      'Los materiales se compran desde Materiales (o desde la búsqueda): buscás el producto, ves las ofertas de todos los proveedores (precio, marca, stock, distancia, reseñas, si está verificado y si es Recomendado) y lo agregás al carrito o lo reservás. El carrito puede tener productos de varios proveedores y se paga a cada proveedor por separado. Hay dos formas: COMPRAR, solo si el proveedor tiene stock: no necesita aprobación, al confirmar el stock queda reservado y aparece "por pagar" en Mis pedidos; tenés 24 horas para pagar por Mercado Pago o elegir efectivo al retirar (con efectivo, 7 días para retirar y pagar); si no, se cancela sola. RESERVAR, con o sin stock: la tiene que aprobar el proveedor; si tiene stock te lo guarda 48 horas para pagar y retirar, y si no tiene te dice una fecha aproximada y te avisa cuando está disponible (ahí arrancan las 48 horas). Un producto sin stock solo se puede reservar.',
    ruta: '/panel/cliente/materiales',
    claves: 'comprar materiales carrito pedido varios proveedores pagar pedido marketplace mis compras mis pedidos reservar reserva sin stock aprobacion compra directa plazo 24 horas',
  },
  {
    id: 'mp-proveedor-no',
    titulo: 'Por qué no puedo pagar con Mercado Pago a un proveedor',
    roles: ['todos', 'cliente', 'profesional'],
    texto:
      'Mercado Pago solo aparece si ESE proveedor conectó su cuenta de Mercado Pago en HomIA (así el dinero le llega directo a él). Si no la conectó, con ese proveedor por ahora se paga en efectivo al retirar, o le pedís por chat que la conecte. Las compras con stock se pagan enseguida, sin aprobación; una reserva, en cambio, se paga recién cuando el proveedor la aprueba (y, si no tenía stock, cuando la marca disponible).',
    ruta: '/panel/cliente/materiales',
    claves: 'no puedo pagar mercado pago proveedor no aparece boton pagar solo efectivo',
  },
  {
    id: 'conectar-mp',
    titulo: 'Conectar Mercado Pago (proveedor)',
    roles: ['proveedor', 'todos'],
    texto:
      'El proveedor lo conecta en Panel → Cobros con el botón "Conectá Mercado Pago": se abre Mercado Pago, autorizás a HomIA y volvés al panel con la cuenta conectada. Desde ahí los clientes pueden pagarte con Mercado Pago y el dinero entra directo a tu cuenta. Si no conectás, solo podés cobrar en efectivo. Si algo falla al volver, reintentá desde el mismo botón.',
    ruta: '/panel/proveedor/cobros',
    claves: 'conectar mercado pago cuenta mp vincular cobrar oauth autorizar',
  },
  {
    id: 'cobros-profesional',
    titulo: 'Cobros del profesional (facturas y Mercado Pago)',
    roles: ['profesional', 'todos'],
    texto:
      'El profesional tiene todo lo de cobrar en Panel → Cobros (en el celular, dentro de "Más"). Arriba conecta su Mercado Pago con "Conectar Mercado Pago": autoriza a HomIA y vuelve a Cobros con la cuenta conectada; así sus clientes le pagan las facturas por Mercado Pago y la plata entra directo en su cuenta (cobra el 100%: el cargo de servicio HomIA del 1% lo paga el cliente aparte). Sin conexión, sus clientes solo pueden pagarle en efectivo. Debajo ve lo cobrado este mes, lo pendiente de cobro y cuántas facturas faltan, y la lista de TODAS sus facturas de todos los proyectos (número, proyecto, cliente, fecha, total, estado y cómo se pagó) con filtros Pendientes / Cobradas / Todas: puede descargar cada PDF y, si el cliente acordó pagar en efectivo, tocar "Confirmar cobro en efectivo" cuando recibe la plata. Desde ahí también va a Comprar materiales y a Mis pedidos.',
    ruta: '/panel/profesional/cobros',
    claves: 'cobros cobrar facturas factura profesional conectar mercado pago mp cobrado pendiente efectivo confirmar cobro donde cobro recibir pagos',
  },
  {
    id: 'sobrantes',
    titulo: 'Qué pasa con los materiales que sobran',
    roles: ['todos', 'cliente', 'profesional', 'proveedor'],
    texto:
      'Los sobrantes se devuelven a quien los cobró: al proveedor si el cliente se los pagó a él (compra directa o cobro del proveedor), o al profesional si los cobró en su factura (él los recibe y reembolsa; los gestiona en Panel → Devoluciones). Desde el detalle del proyecto (o desde Mis pedidos si fue una compra directa) cargás cada sobrante con foto y cantidad (sin abrir o abierto sin usar). Quien vendió acepta todos o algunos, se los entregás y confirma la recepción. Si pagaste con Mercado Pago el reembolso vuelve solo a tu medio de pago; si pagaste en efectivo te lo devuelven en efectivo. Hay hasta 30 días desde el pago. El profesional, además, puede pedirle la devolución a su proveedor desde el proyecto (Sobrantes → Pedir devolución a …): como le pagó por fuera de HomIA, el proveedor le devuelve la plata por fuera (efectivo, transferencia o saldo a favor) y lo marca. El proveedor los gestiona en Panel → Cobros → Devoluciones.',
    ruta: '/panel/cliente/proyectos',
    claves: 'sobra sobrante devolver devolucion reembolso material que sobro me sobraron',
  },
  {
    id: 'verificacion',
    titulo: 'Verificación de identidad con DNI',
    roles: ['todos', 'cliente', 'profesional', 'proveedor'],
    texto:
      'Cada usuario puede verificar su identidad subiendo foto del frente y del dorso del DNI: una IA revisa que el documento sea real y legible y el perfil muestra "Verificado". Quien no lo hizo figura como "No verificado" (nunca se oculta). Es gratis y se hace en Panel → Verificación. Homy prioriza a los verificados en sus recomendaciones.',
    claves: 'verificar verificado dni identidad check confianza no verificado',
  },
  {
    id: 'resenas',
    titulo: 'Reseñas',
    roles: ['todos', 'cliente', 'profesional', 'proveedor'],
    texto:
      'Las reseñas son de trabajos y compras reales: se activan cuando el proyecto finaliza (el cliente califica al profesional y a cada proveedor; el profesional califica al cliente) o cuando una compra de materiales quedó pagada y entregada. Llevan estrellas, comentario y hasta 4 fotos. El directorio se ordena por reseñas.',
    claves: 'reseña calificar estrellas opinion comentario puntuar',
  },
  {
    id: 'mensajes',
    titulo: 'Mensajes (chat)',
    roles: ['todos', 'cliente', 'profesional', 'proveedor'],
    texto:
      'El chat es estilo WhatsApp dentro de HomIA. La conversación nueva SIEMPRE la inicia el cliente; profesionales y proveedores no pueden escribirle primero a un cliente, solo responder. Para contactar a alguien hace falta cuenta (gratis). Todo queda registrado.',
    claves: 'chat mensaje escribir contactar hablar whatsapp',
  },
  {
    id: 'multi-rol',
    titulo: 'Tener más de un rol',
    roles: ['todos', 'cliente', 'profesional', 'proveedor'],
    texto: 'Con la misma cuenta podés ser cliente, profesional y/o proveedor; cambiás de rol desde el selector del panel y cada rol tiene su panel.',
    claves: 'varios roles cambiar rol ser profesional y cliente',
  },
  {
    id: 'registro',
    titulo: 'Crear cuenta',
    roles: ['visitante', 'todos'],
    texto:
      'Crear la cuenta es gratis y tarda un minuto: elegís tu rol (cliente, profesional o proveedor), tus datos y listo. Sin cuenta podés buscar y mirar; para contactar, contratar, comprar, publicar u ofertar necesitás cuenta.',
    ruta: '/registrarse',
    claves: 'registrarme crear cuenta registro alta sumarme',
  },
  {
    id: 'contratar',
    titulo: 'Contratar un profesional',
    roles: ['todos', 'cliente'],
    texto:
      'Dos caminos: (1) publicás tu trabajo gratis (qué necesitás, fotos, zona y presupuesto estimado) y los profesionales te mandan presupuestos para comparar; (2) elegís a alguien del directorio (ordenado por reseñas) y tocás Contratar: un asistente de 4 pasos arma el pedido y se crea el proyecto. Si ya habías publicado ese trabajo, en el asistente lo elegís en "¿Es para algo que ya publicaste?" y se cargan sus datos: al confirmar el trabajo queda en proceso, si ese profesional te había ofertado se acepta su oferta y las demás ofertas se rechazan con aviso. Después seguís la obra por etapas, aprobás materiales y pagás al finalizar.',
    ruta: '/panel/cliente/publicar',
    claves: 'contratar plomero electricista gasista presupuesto publicar trabajo como consigo',
  },
  {
    id: 'profesional-trabajos',
    titulo: 'Conseguir trabajos como profesional',
    roles: ['todos', 'profesional'],
    texto:
      'En Panel → Bolsa de trabajos ves los trabajos publicados por clientes, filtrás por rubro y zona y mandás tu presupuesto (precio, plazo y mensaje). Si el cliente lo acepta, se crea el proyecto. También te contratan directo desde el directorio. Y si necesitás ayuda en una obra, podés subcontratar a otro profesional: en su perfil tocás Contratar y elegís uno de tus proyectos activos; queda vinculado a tu proyecto y tu cliente no lo ve. Tener DNI verificado, obras cargadas con fotos y buenas reseñas te sube en el orden.',
    ruta: '/panel/profesional/bolsa',
    claves: 'trabajo conseguir clientes bolsa ofertar presupuestar soy plomero hay trabajos',
  },
  {
    id: 'cotizar-proyecto',
    titulo: 'Cotizar (presupuestar) como profesional',
    roles: ['profesional'],
    texto:
      'Para un trabajo publicado: Bolsa de trabajos → abrís el trabajo → Enviar presupuesto con precio, plazo en días y un mensaje que explique cómo lo resolvés. Queda en Mis ofertas con su estado (pendiente, aceptado, rechazado). Dentro de un proyecto ya contratado: en el detalle cargás la mano de obra, proponés materiales comparando precios entre proveedores (el cliente aprueba cada uno) y al terminar emitís la factura.',
    ruta: '/panel/profesional/bolsa',
    claves: 'cotizar cotizo presupuesto presupuestar mandar oferta precio proyecto',
  },
  {
    id: 'calendario',
    titulo: 'Calendario y fechas del trabajo',
    roles: ['todos', 'profesional', 'cliente'],
    texto:
      'Con el presupuesto aprobado, en el detalle del proyecto aparece "Fechas del trabajo": el profesional propone inicio y fin estimado, y el cliente las acepta, las rechaza o propone otras (el profesional también puede aceptar, rechazar o contraproponer lo que proponga el cliente; nadie acepta su propia propuesta). Lo acordado se puede reprogramar: mientras el otro decide, siguen las fechas acordadas. Cada paso le llega al otro como aviso. El profesional ve todo en Panel → Calendario (mes con lo acordado y lo propuesto, días libres y ocupados, próximos trabajos y proyectos sin fecha). En el perfil del profesional, clientes y proveedores ven su Disponibilidad de los próximos 3 meses: días ocupados, por confirmar y la próxima fecha libre, sin ver de qué trabajo se trata. Si dos trabajos se superponen, HomIA avisa pero no lo bloquea.',
    ruta: '/panel/profesional/calendario',
    claves: 'calendario agenda fechas fecha inicio fin disponibilidad disponible ocupado cuando empieza reprogramar turno',
  },
  {
    id: 'homy',
    titulo: 'Homy, el asistente',
    roles: ['todos'],
    texto:
      'Homy responde con datos reales de HomIA: busca profesionales, proveedores con stock, trabajos publicados y explica cómo se usa cada sección. Sin cuenta hay 8 consultas por día; con cuenta, 60 por día. Homy no contrata, no compra ni escribe por vos: te lleva a la sección donde se hace.',
    claves: 'homy asistente ia limite consultas',
  },
  {
    id: 'privacidad',
    titulo: 'Datos personales de otros usuarios',
    roles: ['todos'],
    texto:
      'HomIA no comparte teléfonos, emails, direcciones ni DNI de otros usuarios. Para hablar con un profesional o proveedor se usa el chat de la plataforma (el cliente inicia). Los perfiles públicos muestran nombre, rubro, zona, reseñas, obras y si está verificado.',
    claves: 'telefono email direccion dni datos contacto de otro usuario privacidad',
  },
  {
    id: 'recuperar-contrasena',
    titulo: 'Me olvidé la contraseña',
    roles: ['todos'],
    ruta: '/recuperar',
    texto:
      'En Ingresar se toca "¿Olvidaste tu contraseña?", se escribe el email de la cuenta y HomIA manda un link para crear una contraseña nueva (mirar también spam o promociones). El link vence en 1 hora y sirve una sola vez; si venció o ya se usó, se pide otro. Se pueden pedir hasta 3 links por hora. Después se ingresa con la contraseña nueva: los datos, proyectos y pedidos quedan como estaban. Homy no puede cambiar ni ver contraseñas.',
    claves: 'olvide contraseña clave password recuperar restablecer no puedo entrar ingresar cuenta bloqueada link mail',
  },
  {
    id: 'avisos-mail',
    titulo: 'Avisos por mail',
    roles: ['todos'],
    ruta: '/panel',
    texto:
      'Además del aviso en la campanita, HomIA manda un mail al email de la cuenta con los eventos importantes: compra o reserva nueva (al proveedor), te contrataron o te aceptaron el presupuesto (al profesional), oferta nueva en tu trabajo, factura emitida y reserva aprobada o lista para retirar (al cliente), pago acreditado por Mercado Pago (a quien cobra) y pedido de devolución de sobrantes (a quien lo recibe). Los mensajes del chat NO llegan por mail. Se apagan desde Mi perfil → "Recibir avisos por mail" (el mail para crear una nueva contraseña llega siempre).',
    claves: 'mail email correo aviso notificacion me avisan enterarme apagar desactivar dejar de recibir spam',
  },
  {
    id: 'eliminar-cuenta',
    titulo: 'Eliminar mi cuenta',
    roles: ['todos'],
    ruta: '/panel',
    texto:
      'Se hace desde Mi perfil → "Eliminar mi cuenta" (al final de la página, en los tres roles): hay que escribir ELIMINAR y la contraseña. Si hay algo abierto (proyectos activos, facturas o cobros sin pagar, pedidos sin cerrar, devoluciones en curso o, si es proveedor, la suscripción de Mercado Pago activa) no se elimina y la app lista qué cerrar primero. Al eliminarla se borran los datos personales (nombre, email, teléfono, dirección, foto, ubicación, cumpleaños), las fotos del DNI, el carrito, los favoritos, las conversaciones con Homy y las notificaciones, y el perfil deja de aparecer; se conservan sin nombre las facturas, pagos y pedidos cerrados (obligación legal) y las reseñas y mensajes, que figuran como "Usuario eliminado". No se puede deshacer. Homy no puede eliminar cuentas.',
    claves: 'eliminar borrar dar de baja cerrar cuenta darme de baja borrar mis datos supresion ley 25326 privacidad',
  },
  {
    id: 'terminos',
    titulo: 'Términos y Política de Privacidad',
    roles: ['todos'],
    texto:
      'Para crear una cuenta hay que aceptar los Términos y Condiciones y la Política de Privacidad (casilla obligatoria en el último paso del registro). Las dos páginas están en el pie de la portada ("Términos y Condiciones" y "Política de Privacidad") y explican las reglas de uso, pagos, plazos, qué datos se guardan y para qué.',
    claves: 'terminos condiciones politica privacidad legal datos personales aceptar',
  },
  {
    id: 'no-existe',
    titulo: 'Lo que HomIA NO hace (hoy)',
    roles: ['todos'],
    texto:
      'HomIA no retiene el dinero (no hay escrow ni seña por la plataforma), no garantiza plazos ni precios de terceros, no asigna profesionales automáticamente (el cliente elige), no comparte datos de contacto por fuera del chat y no fija los precios de materiales (los pone cada proveedor).',
    claves: 'garantia escrow seguro plazo asignan envio',
  },
]

/** Pasos del tour, guías "¿Cómo hago?" y "Me trabé": se convierten en entradas. */
function desdeGuias(): Entrada[] {
  const out: Entrada[] = []
  for (const rol of ['cliente', 'profesional', 'proveedor'] as TourRole[]) {
    for (const h of HOWTOS[rol]) {
      out.push({
        id: `como-${rol}-${h.id}`,
        titulo: h.title,
        roles: [rol],
        texto: h.steps.map((s, i) => `${i + 1}. ${s}`).join(' '),
        ruta: h.href,
      })
    }
    for (const t of TROUBLES[rol]) {
      out.push({
        id: `trabe-${rol}-${t.id}`,
        titulo: t.q,
        roles: [rol],
        texto: `Por qué pasa: ${t.why} Qué hacer: ${t.fix}`,
        ruta: t.href,
      })
    }
    for (const s of TOURS[rol]) {
      if (!s.route) continue
      out.push({
        id: `seccion-${rol}-${s.id}`,
        titulo: `Sección: ${s.title}`,
        roles: [rol],
        texto: `${s.body}${s.tip ? ` Tip: ${s.tip}` : ''}`,
        ruta: s.route,
      })
    }
  }
  return out
}

export const CONOCIMIENTO: Entrada[] = [...NUCLEO, ...desdeGuias()]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const VACIAS = new Set(['que', 'los', 'las', 'por', 'para', 'con', 'del', 'como', 'una', 'uno', 'hay', 'mas', 'esta', 'este', 'donde', 'cuando', 'hago', 'puedo', 'tengo', 'quiero', 'necesito'])

function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9ñ%]+/)
    .filter((w) => w.length >= 3 && !VACIAS.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w))
}

/**
 * Búsqueda por tokens normalizados (sin acentos, singular/plural) sobre título
 * (peso 3), claves (peso 2) y texto (peso 1). Filtra por rol: las entradas del
 * rol del usuario y las de 'todos'.
 */
export function buscarConocimiento(tema: string, rol: RolHomy, max = 4): Entrada[] {
  const q = tokens(tema)
  if (q.length === 0) return []
  const scored = CONOCIMIENTO.filter((e) => e.roles.includes('todos') || e.roles.includes(rol))
    .map((e) => {
      const t = norm(e.titulo)
      const c = norm(e.claves || '')
      const x = norm(e.texto)
      let score = 0
      for (const w of q) {
        if (t.includes(w)) score += 3
        if (c.includes(w)) score += 2
        if (x.includes(w)) score += 1
      }
      // lo del rol del usuario pesa un poco más que lo general
      if (rol !== 'visitante' && e.roles.includes(rol)) score += 0.5
      return { e, score }
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((r) => r.e)
}
