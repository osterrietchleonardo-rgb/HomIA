// Tour guiado HomIA — contenido por rol.
// Cada paso recorre UNA sección real de la plataforma: qué es, qué podés hacer ahí
// y un tip para no trabarte. Los pasos con `target` iluminan el elemento con
// data-tour correspondiente (nav del panel o topbar); si no existe/cae fuera de
// pantalla, la tarjeta se muestra centrada. Los pasos con `route` navegan por la SPA.
export type TourRole = 'cliente' | 'profesional' | 'proveedor'

export type TourStep = {
  id: string
  /** ruta SPA a la que navegar antes de mostrar el paso */
  route?: string
  /** data-tour del elemento a iluminar (nav-inicio, nav-publicar, top-notificaciones…) */
  target?: string
  title: string
  body: string
  tip?: string
}

export const ROLE_TOUR_META: Record<TourRole, { label: string; tourTitle: string; tourSub: string }> = {
  cliente: {
    label: 'Cliente',
    tourTitle: 'Recorrido para clientes',
    tourSub: 'Publicar, comparar, contratar, pagar y calificar — cada sección explicada.',
  },
  profesional: {
    label: 'Profesional',
    tourTitle: 'Recorrido para profesionales',
    tourSub: 'Conseguir trabajos, presupuestar, comprar materiales y cobrar por Mercado Pago o efectivo.',
  },
  proveedor: {
    label: 'Proveedor',
    tourTitle: 'Recorrido para proveedores',
    tourSub: 'Vidriera de materiales, cobros directos y reputación con evidencia.',
  },
}

export const TOURS: Record<TourRole, TourStep[]> = {
  cliente: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido a HomIA!',
      body: 'Este recorrido te muestra cada sección, qué podés hacer en cada una y cómo no trabarte. Son 11 paradas de 15 segundos; podés repetirlo cuando quieras desde el botón de ayuda de abajo a la derecha.',
      tip: 'Podés avanzar con las flechas ← → del teclado y salir con Esc.',
    },
    {
      id: 'inicio',
      route: '/panel/cliente',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Tu centro de mando: resumen de trabajos, proyectos y pagos, avisos de lo que necesita tu atención, y el checklist de primeros pasos que se tilda solo a medida que usás la plataforma.',
      tip: 'Cada tarjeta del Inicio te lleva directo a la acción: nada es decorativo.',
    },
    {
      id: 'publicar',
      route: '/panel/cliente/publicar',
      target: 'nav-publicar',
      title: 'Publicar un trabajo (gratis)',
      body: 'Contás qué necesitás con fotos, zona y presupuesto estimado, y tu publicación sale a la bolsa de trabajos. Los profesionales te mandan presupuestos y vos elegís. Publicar, recibir presupuestos y contratar no cuesta nada: HomIA solo cobra una comisión del 1% en las compras de materiales pagadas por Mercado Pago.',
      tip: 'Cuantas más fotos y detalle, mejores presupuestos recibís.',
    },
    {
      id: 'trabajos',
      route: '/panel/cliente/trabajos',
      target: 'nav-trabajos',
      title: 'Mis trabajos: comparar y elegir',
      body: 'Cada publicación vive acá con su estado. Entrando ves los presupuestos que te mandaron (precio, plazo y mensaje), chateás con los profesionales sin compromiso y contratás al que más te convenga.',
      tip: 'Preguntá lo que quieras por chat antes de decidir: no hay obligación de contratar.',
    },
    {
      id: 'proyectos',
      route: '/panel/cliente/proyectos',
      target: 'nav-proyectos',
      title: 'Proyectos: tu obra, siempre a la vista',
      body: 'Al contratar se crea un proyecto: etapas, materiales que tu profesional propone con precios reales, y el acuerdo de quién paga los materiales (si los adelanta él, van en su factura; si no, te los cobra el proveedor directo). Al finalizar, acá mismo dejás tu reseña con estrellas, comentario y fotos, y si sobró material lo cargás en Sobrantes para devolverlo al local del proveedor.',
      tip: 'Todo queda registrado en la plataforma: nada depende de la memoria de nadie.',
    },
    {
      id: 'facturas',
      route: '/panel/cliente/facturas',
      target: 'nav-facturas',
      title: 'Facturas: pagá como prefieras',
      body: 'Elegís el método en cada factura: Mercado Pago (pagás al finalizar la obra y el dinero va directo al profesional) o efectivo (el acuerdo queda registrado y el profesional confirma cuando lo cobra). Todas se descargan en PDF con un botón.',
      tip: 'Si acordás efectivo y te arrepentís, podés cancelar el acuerdo y volver a Mercado Pago.',
    },
    {
      id: 'directorio',
      route: '/panel/cliente/directorio',
      target: 'nav-directorio',
      title: 'Directorio: elegí con datos, no con fe',
      body: 'Profesionales y proveedores ordenados de mejor a peor reputación: reseñas reales con fotos, obras hechas y si están verificados con DNI o no. Filtrá por rubro y precio promedio, y usá el botón Contratar: un asistente de 4 pasos crea el proyecto por vos.',
      tip: '"No verificado" también es información: decidís con todo a la vista.',
    },
    {
      id: 'mensajes',
      route: '/panel/cliente/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: vos siempre empezás',
      body: 'Chat estilo WhatsApp con tu profesional o proveedor. Por tu seguridad, nadie puede escribirte primero: profesionales y proveedores solo pueden responder. Toda la conversación queda registrada.',
      tip: 'Lo que se promete por chat queda por escrito: es tu mejor respaldo.',
    },
    {
      id: 'verificacion',
      route: '/panel/cliente/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación: tu sello de confianza',
      body: 'Subís foto del frente y del dorso de tu DNI y una IA analiza que sea real y legible. Con el check verde "Verificado" generás más confianza tanto al contratar como al recibir presupuestos.',
      tip: 'Tus fotos se usan únicamente para verificar tu identidad.',
    },
    {
      id: 'notificaciones',
      route: '/panel/cliente',
      target: 'top-notificaciones',
      title: 'La campana: tu periódico personal',
      body: 'Presupuestos nuevos, mensajes, pagos acreditados, cobros de proveedores, avances de tu obra: todo aparece acá. El numerito naranja te avisa cuando hay cosas sin leer.',
      tip: 'Antes de preguntar "¿qué pasó con…?", mirá la campana: casi siempre ya te avisaron.',
    },
    {
      id: 'cierre',
      title: '¿Te trabás? Nunca más',
      body: 'El botón de ayuda de abajo a la derecha está siempre a la vista: te repite este recorrido, tiene guías paso a paso de cada acción ("¿Cómo hago…?") y soluciones a los atascos típicos ("Me trabé"). El mapa completo de la plataforma está en el Centro de ayuda.',
      tip: 'El checklist del Inicio se tilda solo: es tu mapa de qué falta hacer.',
    },
  ],

  profesional: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido, profesional!',
      body: 'Este recorrido te muestra tu caja de herramientas completa: conseguir trabajos, presupuestar, comprar materiales más barato, gestionar la obra y cobrar sin comisión. Podés repetirlo cuando quieras desde el botón de ayuda de abajo a la derecha.',
      tip: 'Avanzá con las flechas ← → y salí con Esc cuando quieras.',
    },
    {
      id: 'inicio',
      route: '/panel/profesional',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Resumen de tu actividad: oportunidades sin responder, proyectos activos, cobros pendientes y el checklist de primeros pasos que se tilda solo. Si algo necesita tu atención, aparece acá.',
      tip: 'El Inicio se actualiza solo: es tu rutina de cada mañana.',
    },
    {
      id: 'bolsa',
      route: '/panel/profesional/bolsa',
      target: 'nav-bolsa',
      title: 'Bolsa de trabajos: tu fuente de clientes',
      body: 'Trabajos publicados por clientes, filtrables por rubro y zona. Leés el brief con fotos, y si te interesa mandás tu presupuesto: precio, plazo y un mensaje que sume. El cliente compara y elige.',
      tip: 'Respondé rápido y con detalle: los primeros presupuestos bien hechos son los que se aceptan.',
    },
    {
      id: 'presupuestos',
      route: '/panel/profesional/presupuestos',
      target: 'nav-presupuestos',
      title: 'Mis ofertas: nada se pierde',
      body: 'Todos tus presupuestos con su estado: enviado, aceptado o rechazado. Mientras está enviado podés editarlo o retirarlo. Si te aceptan uno, el proyecto se crea solo y te aparece en Proyectos.',
      tip: 'Un presupuesto rechazado también enseña: mirá qué eligió el cliente y ajustá el próximo.',
    },
    {
      id: 'proyectos',
      route: '/panel/profesional/proyectos',
      target: 'nav-proyectos',
      title: 'Proyectos: gestioná cada obra',
      body: 'El corazón de tu trabajo: etapas de la obra, materiales que proponés (con precios reales comparados entre proveedores), el acuerdo de quién paga los materiales, y las facturas. Emitís factura cuando corresponde y cobrás por Mercado Pago o en efectivo (el cliente elige; vos confirmás el efectivo al recibirlo). Sin comisión sobre tus facturas.',
      tip: 'Si el cliente paga los materiales directo al proveedor, tu factura va solo con mano de obra: queda escrito para los dos.',
    },
    {
      id: 'materiales',
      route: '/panel/profesional/materiales',
      target: 'nav-materiales',
      title: 'Materiales: compará antes de comprar',
      body: 'El catálogo de todos los proveedores en un solo lugar: precio, stock y distancia. Comparás, elegís el mejor y lo proponés en tu proyecto con un toque. Comprar más barato sube tu margen sin tocar el precio del cliente.',
      tip: 'Chequeá el stock antes de prometer plazos: está actualizado por cada proveedor.',
    },
    {
      id: 'obras',
      route: '/panel/profesional/obras',
      target: 'nav-obras',
      title: 'Mis obras: tu vitrina',
      body: 'Las fotos de tus trabajos terminados alimentan tu tarjeta del directorio, que es la vidriera donde los clientes te eligen. Una vitrina con obras reales multiplica los presupuestos aceptados.',
      tip: 'Cargá tu mejor foto primero: es la que se ve en el directorio.',
    },
    {
      id: 'crm',
      route: '/panel/profesional/crm',
      target: 'nav-crm',
      title: 'CRM clientes: tu memoria comercial',
      body: 'Historial completo de cada cliente: proyectos, facturas, notas y estados. Vuelve a quien te trató bien, y acá tenés todo el contexto para hacerlo.',
      tip: 'Una nota por cliente ("prefiere llamas por la tarde") vale oro a la hora de volver a vender.',
    },
    {
      id: 'vinculaciones',
      route: '/panel/profesional/vinculaciones',
      target: 'nav-vinculaciones',
      title: 'Vinculaciones: retirá materiales a cuenta',
      body: 'Una "cuenta de retiro" es tu vínculo con un proveedor: la creás con su email (o él con el tuyo) y retirás materiales de su local a cuenta del proyecto, sin pagar en el momento. Acá ves tus vinculaciones y las pausás cuando quieras. No es una cuenta bancaria: tus cobros llegan por Mercado Pago o efectivo desde las facturas.',
      tip: 'Vinculate con el proveedor al que más le comprás: te ahorra viajes y adelantos.',
    },
    {
      id: 'directorio',
      route: '/panel/profesional/directorio',
      target: 'nav-directorio',
      title: 'Tu tarjeta en el directorio',
      body: 'Así te ven los clientes: reseñas con fotos, tus obras, precio promedio de presupuestos y tu sello de verificación. El orden es por reputación: más reseñas positivas, más arriba, más trabajo.',
      tip: 'Perfil completo + DNI verificado = el check verde que multiplica contrataciones.',
    },
    {
      id: 'mensajes',
      route: '/panel/profesional/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: el cliente empieza, vos respondés',
      body: 'Chat estilo WhatsApp con tus clientes. La regla de confianza de HomIA: la conversación nueva siempre la inicia el cliente; vos podés responder todo lo que te llega. Las conversaciones de tus proyectos activos también viven acá.',
      tip: 'Respondé dentro del día: el cliente está comparando y la rapidez pesa.',
    },
    {
      id: 'verificacion',
      route: '/panel/profesional/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación: tu sello de confianza',
      body: 'Subí frente y dorso de tu DNI: una IA los valida y tu perfil muestra el check verde. Sin verificar, figurás como "No verificado" y perdés contrataciones. Es gratis y tarda 2 minutos.',
      tip: 'El check verde es la mejora de 2 minutos con mayor impacto en tu perfil.',
    },
    {
      id: 'cierre',
      title: '¿Te trabás? Nunca más',
      body: 'El botón de ayuda de abajo a la derecha está siempre a la vista: repite este recorrido, tiene guías paso a paso de cada acción ("¿Cómo hago…?") y soluciones a los atascos típicos ("Me trabé"). Las reglas de oro: cobrás al finalizar y sin comisión, el cliente inicia los chats y las reseñas vienen de obras reales.',
      tip: 'Tu reputación es tu marketing: cada obra terminada bien documentada te consigue la siguiente.',
    },
  ],

  proveedor: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido, proveedor!',
      body: 'Este recorrido te muestra cómo convertir tu catálogo en ventas: stock como vidriera, cobros directos a clientes, y reputación con evidencia. Podés repetirlo cuando quieras desde el botón de ayuda de abajo a la derecha.',
      tip: 'Avanzá con las flechas ← → y salí con Esc cuando quieras.',
    },
    {
      id: 'inicio',
      route: '/panel/proveedor',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Resumen de tu negocio: alertas de stock por agotar y agotado (tu plata perdida favorita), pedidos en curso y el checklist de primeros pasos que se tilda solo.',
      tip: 'Reponé antes de llegar a cero: el profesional compra donde hay stock.',
    },
    {
      id: 'stock',
      route: '/panel/proveedor/stock',
      target: 'nav-stock',
      title: 'Stock: tu vidriera',
      body: 'Acá cargás y actualizás tus materiales: precio, cantidad disponible y estado. Tu catálogo aparece en el comparador de materiales que los profesionales usan antes de cada compra, y en tu perfil público.',
      tip: 'Precio competitivo + stock actualizado = aparecer arriba y vender más.',
    },
    {
      id: 'cobros',
      route: '/panel/proveedor/cobros',
      target: 'nav-cobros',
      title: 'Cobros: cobrá tus materiales directo',
      body: 'Primero tocá "Conectá Mercado Pago" para que los pagos lleguen directo a tu cuenta. Después, en proyectos donde el cliente te paga a vos, emitís el cobro por los materiales aprobados desde acá: el cliente paga con Mercado Pago o acuerda efectivo (lo confirmás vos al recibirlo). En la pestaña Devoluciones gestionás los sobrantes que te traen de vuelta.',
      tip: 'Sin Mercado Pago conectado solo podés cobrar en efectivo: conectalo hoy.',
    },
    {
      id: 'plan',
      route: '/panel/proveedor/plan',
      target: 'nav-plan',
      title: 'Mi plan: 14 días gratis',
      body: 'Probás la app completa gratis durante 14 días. Después elegís: Básico ($50.000/mes) con stock, ventas, cobros por Mercado Pago y efectivo, CRM y vinculaciones; o PRO ($100.000/mes), que suma tu logo y marca en la home, la tarjeta "Recomendado" en marketplace y directorio, y analítica de demanda.',
      tip: 'Acá ves cuántos días de prueba te quedan y cambiás de plan cuando quieras.',
    },
    {
      id: 'crm',
      route: '/panel/proveedor/crm',
      target: 'nav-crm',
      title: 'CRM: tus clientes profesionales',
      body: 'Historial de los profesionales que compran tus materiales: qué compraron, cuándo y cuánto. Es tu base para reponer lo que rota y ofrecer lo que falta.',
      tip: 'El que compra decos vuelve por pintura: mirá el historial antes de definir precios.',
    },
    {
      id: 'vinculaciones',
      route: '/panel/proveedor/vinculaciones',
      target: 'nav-vinculaciones',
      title: 'Vinculaciones: profesionales que retiran a cuenta',
      body: 'Una "cuenta de retiro" es tu vínculo con un profesional: la creás con su email (o él con el tuyo) y a partir de ahí retira materiales de tu local a cuenta de un proyecto, sin pagar en el momento. Después lo cobrás desde Cobros. No es una cuenta bancaria: el dinero llega por Mercado Pago (lo conectás en Cobros) o en efectivo.',
      tip: 'Vinculá primero a los profesionales que ya te compran seguido: es fidelización con control.',
    },
    {
      id: 'directorio',
      route: '/panel/proveedor/directorio',
      target: 'nav-directorio',
      title: 'Tu tarjeta en el directorio',
      body: 'Tu perfil público se arma solo con tu stock, tus reseñas y tu verificación. Los clientes te evalúan con evidencia: fotos de entregas, estrellas y el check verde del DNI.',
      tip: 'El orden del directorio es por reputación: cuidar reseñas es cuidar tus ventas.',
    },
    {
      id: 'mensajes',
      route: '/panel/proveedor/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: el cliente empieza, vos respondés',
      body: 'Chat estilo WhatsApp con clientes y profesionales. La regla de confianza de HomIA: la conversación nueva siempre la inicia el cliente; vos respondés todo lo que te llega.',
      tip: 'Respondé rápido: el profesional está comparando proveedores en ese momento.',
    },
    {
      id: 'verificacion',
      route: '/panel/proveedor/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación: el check que vende',
      body: 'Subí frente y dorso de tu DNI: una IA los valida y tu perfil muestra el check verde. Sin verificar, figurás como "No verificado" frente a todos los clientes.',
      tip: 'Entre dos proveedores con precio parecido, gana el verificado: es un hecho.',
    },
    {
      id: 'cierre',
      title: '¿Te trabás? Nunca más',
      body: 'El botón de ayuda de abajo a la derecha está siempre a la vista: repite este recorrido, tiene guías paso a paso ("¿Cómo hago…?") y soluciones a los atascos típicos ("Me trabé"). Tus reglas de oro: stock actualizado es vidriera, cobro emitido a tiempo es plata, y reseña con foto es marketing gratis.',
      tip: 'Tu reputación es tu marketing: cada entrega bien hecha te consigue el siguiente cliente.',
    },
  ],
}

/** Devuelve el tour de un rol de forma segura (si el rol no existe → cliente). */
export function getTour(role: string | undefined | null): { role: TourRole; steps: TourStep[] } {
  const r = (role === 'profesional' || role === 'proveedor' ? role : 'cliente') as TourRole
  return { role: r, steps: TOURS[r] }
}
