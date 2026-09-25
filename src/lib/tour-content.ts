// Tour guiado HomIA — contenido por rol.
// Cada paso recorre UNA sección real de la plataforma: qué es, qué podés hacer ahí
// y un tip para no trabarte. Los pasos con `target` iluminan el elemento con
// data-tour (o data-tour-m en la barra inferior del celular) correspondiente: los del menú
// salen de panel-layout.tsx como `nav-<pantalla>` (nav-inicio, nav-calendario, nav-ayuda…);
// el resto está escrito en el componente (top-notificaciones, top-carrito, tab-ventas…).
// Un test verifica que cada target exista en el código (src/lib/__tests__/ayuda.test.ts).
// En el celular, si la sección vive dentro de «Más», el tour ilumina ese botón.
// Los pasos con `route` navegan por la SPA (ruta sin query: el tour compara el path).
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
    tourSub: 'Publicar, comparar, contratar, comprar materiales, pagar y calificar: cada sección explicada.',
  },
  profesional: {
    label: 'Profesional',
    tourTitle: 'Recorrido para profesionales',
    tourSub: 'Conseguir trabajos, presupuestar, agendar, cobrar por Mercado Pago o efectivo y ver tus números.',
  },
  proveedor: {
    label: 'Proveedor',
    tourTitle: 'Recorrido para proveedores',
    tourSub: 'Stock, ventas y reservas, cobros directos, tu plan y tus números.',
  },
}

export const TOURS: Record<TourRole, TourStep[]> = {
  cliente: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido a HomIA!',
      body: 'Este recorrido te muestra cada sección de tu panel, qué podés hacer en cada una y cómo no trabarte. Lo repetís cuando quieras desde el botón de Homy (abajo a la derecha) → «Guías y tour».',
      tip: 'En la compu avanzás con las flechas ← → del teclado y salís con Esc.',
    },
    {
      id: 'inicio',
      route: '/panel/cliente',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Tu resumen: trabajos, proyectos y pagos, avisos de lo que necesita tu atención, y la tarjeta «Tus primeros pasos», que se tilda sola a medida que usás la plataforma.',
      tip: 'Cada tarjeta del Inicio te lleva directo a la acción.',
    },
    {
      id: 'publicar',
      route: '/panel/cliente/publicar',
      target: 'nav-publicar',
      title: 'Publicar un trabajo (gratis)',
      body: 'Contás qué necesitás con fotos, zona y presupuesto estimado, y tu publicación sale a la bolsa de trabajos. Los profesionales te mandan presupuestos y vos elegís. Publicar, recibir presupuestos y contratar no cuesta nada. Solo cuando pagás con Mercado Pago se suma un cargo de servicio HomIA del 1% (en efectivo, sin cargo).',
      tip: 'Cuantas más fotos y detalle, mejores presupuestos recibís. Las fotos del celular se suben de cualquier tamaño.',
    },
    {
      id: 'trabajos',
      route: '/panel/cliente/trabajos',
      target: 'nav-trabajos',
      title: 'Mis trabajos: comparar y elegir',
      body: 'Cada publicación vive acá con su estado. Entrando ves los presupuestos que te mandaron (precio, plazo y mensaje), chateás con los profesionales sin compromiso y aceptás el que más te convenga. Si ya no la necesitás, la cerrás (y la podés reabrir).',
      tip: 'Una publicación no se edita: si cambió algo importante, cerrala y publicá una nueva.',
    },
    {
      id: 'directorio',
      route: '/panel/cliente/directorio',
      target: 'nav-directorio',
      title: 'Directorio: elegí con datos',
      body: 'Profesionales y proveedores ordenados por reputación: reseñas reales con fotos, obras hechas y si están verificados con DNI o no. Filtrá por rubro y precio, y usá el botón Contratar: un asistente de 4 pasos crea el proyecto. Si ya publicaste ese trabajo, elegilo arriba y se cargan sus datos.',
      tip: 'En el perfil de cada profesional ves su Disponibilidad: días libres, con lugar o completos.',
    },
    {
      id: 'proyectos',
      route: '/panel/cliente/proyectos',
      target: 'nav-proyectos',
      title: 'Proyectos: tu obra, siempre a la vista',
      body: 'Al contratar se crea un proyecto: etapas, fechas y horario que te propone el profesional (las aceptás, rechazás o proponés otras), materiales con precios reales para aprobar, y quién paga los materiales. Cuando la obra está terminada, la finalizás vos: ahí se activan las reseñas. Si sobró material, lo cargás en Sobrantes para devolvérselo a quien te lo cobró.',
      tip: 'Solo vos podés dar la obra por terminada: revisala con calma antes de tocar «Finalizar obra».',
    },
    {
      id: 'facturas',
      route: '/panel/cliente/facturas',
      target: 'nav-facturas',
      title: 'Facturas: pagá como prefieras',
      body: 'Elegís el método en cada factura: Mercado Pago (el dinero va directo al profesional y se suma el cargo de servicio HomIA del 1%) o efectivo sin cargo (el acuerdo queda registrado y el profesional confirma cuando lo cobra). Todas se descargan en PDF.',
      tip: 'Si acordás efectivo y te arrepentís, podés cancelar el acuerdo y volver a Mercado Pago.',
    },
    {
      id: 'materiales',
      route: '/panel/cliente/materiales',
      target: 'nav-materiales',
      title: 'Materiales: comprá o reservá',
      body: 'Buscás un material y ves las ofertas de todos los proveedores con precio, marca, stock y distancia. «Agregar al carrito» para comprar lo que tiene stock, o «Reservar» (lo que no tiene stock solo se reserva). El carrito es el ícono de arriba y junta productos de varios proveedores.',
      tip: 'La búsqueda entiende errores de tipeo y plurales: escribí como te salga.',
    },
    {
      id: 'pedidos',
      route: '/panel/cliente/pedidos',
      target: 'nav-pedidos',
      title: 'Mis pedidos',
      body: 'Al confirmar el carrito se arma un pedido con una parte por proveedor. Lo que comprás con stock no necesita aprobación: queda reservado y lo pagás en 24 h (Mercado Pago +1%, o efectivo al retirar, con 7 días para retirar). Lo que reservás lo aprueba el proveedor. Acá pagás cada parte, seguís su línea de tiempo y calificás la compra cuando la retirás.',
      tip: 'Si te sobró algo de una compra, desde el pedido pedís la devolución.',
    },
    {
      id: 'mensajes',
      route: '/panel/cliente/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: vos siempre empezás',
      body: 'Chat estilo WhatsApp con tu profesional o proveedor. Nadie puede escribirte primero: profesionales y proveedores solo pueden responder. Toda la conversación queda registrada.',
      tip: 'Lo que se promete por chat queda por escrito: es tu mejor respaldo.',
    },
    {
      id: 'verificacion',
      route: '/panel/cliente/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación de identidad',
      body: 'Subís foto del frente y del dorso de tu DNI y una IA revisa que sea real, legible y coincida con tu cuenta. Con «Verificado» generás más confianza al contratar. Podés intentarlo hasta 3 veces por día.',
      tip: 'Tus fotos del DNI son privadas: los demás solo ven el estado.',
    },
    {
      id: 'perfil',
      route: '/panel/cliente/perfil',
      target: 'nav-perfil',
      title: 'Mi perfil: tus datos y tu cuenta',
      body: 'Cambiás tu nombre, el país y el número de celular, dirección y ciudad. En «Email y celular» ves si tu email está verificado (si no, «Verificar ahora» te manda un código). Abajo prendés o apagás «Recibir avisos por mail» y, si algún día querés, eliminás tu cuenta.',
      tip: 'Los mensajes del chat no llegan por mail: los ves en Mensajes.',
    },
    {
      id: 'sugerencias',
      route: '/panel/cliente/sugerencias',
      target: 'nav-sugerencias',
      title: 'Sugerencias: contanos',
      body: 'Una idea, una queja o algo que no funciona: tocás «Nueva sugerencia», elegís el tipo y la parte de HomIA, y podés sumar hasta 4 fotos. En «Mis envíos» ves el estado y la respuesta del equipo, que también te llega por notificación y por mail.',
      tip: 'Si es un problema técnico, se adjunta solo desde qué pantalla venías: así lo encontramos más rápido.',
    },
    {
      id: 'notificaciones',
      route: '/panel/cliente',
      target: 'top-notificaciones',
      title: 'La campana: tus avisos',
      body: 'Presupuestos nuevos, fechas propuestas, pagos acreditados, cobros de proveedores, reservas aprobadas, avances de tu obra: todo aparece acá. El número naranja te avisa cuando hay cosas sin leer.',
      tip: 'Antes de preguntar "¿qué pasó con…?", mirá la campana: casi siempre ya te avisaron.',
    },
    {
      id: 'cierre',
      route: '/panel/cliente',
      target: 'nav-ayuda',
      title: '¿Te trabás? Acá tenés ayuda',
      body: 'El botón de Homy de abajo a la derecha está siempre a mano: preguntale lo que quieras, o abrí «Guías y tour» para repetir este recorrido, ver cada acción paso a paso («¿Cómo hago?»), las soluciones a los atascos típicos («Me trabé») y los videos. En Ayuda tenés el mapa de cada sección y las preguntas frecuentes.',
      tip: 'La tarjeta «Tus primeros pasos» del Inicio se tilda sola: es tu lista de lo que falta hacer.',
    },
  ],

  profesional: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido, profesional!',
      body: 'Este recorrido te muestra tu panel completo: conseguir trabajos, presupuestar, agendar, comprar materiales, gestionar la obra, cobrar sin comisión y ver tus números. Lo repetís cuando quieras desde el botón de Homy (abajo a la derecha) → «Guías y tour».',
      tip: 'En la compu avanzás con las flechas ← → y salís con Esc.',
    },
    {
      id: 'inicio',
      route: '/panel/profesional',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Resumen de tu actividad: próximas acciones, oportunidades para vos y la tarjeta «Tus primeros pasos», que se tilda sola. Si algo necesita tu atención, aparece acá.',
      tip: 'El Inicio se actualiza solo: miralo cada mañana.',
    },
    {
      id: 'bolsa',
      route: '/panel/profesional/bolsa',
      target: 'nav-bolsa',
      title: 'Bolsa de trabajos',
      body: 'Trabajos publicados por clientes, filtrables por rubro y zona. Leés el pedido con fotos y, si te interesa, mandás tu presupuesto: precio, plazo y un mensaje que explique cómo lo resolvés. El cliente compara y elige.',
      tip: 'Respondé rápido y con detalle: los primeros presupuestos bien hechos son los que se aceptan.',
    },
    {
      id: 'presupuestos',
      route: '/panel/profesional/presupuestos',
      target: 'nav-presupuestos',
      title: 'Mis ofertas',
      body: 'Todos tus presupuestos con su estado: pendiente, aceptada, rechazada o retirada. Mientras está pendiente la podés retirar; si la retiraste y el trabajo sigue abierto, podés volver a ofertar. Si te aceptan una, el proyecto se crea solo y aparece en Proyectos.',
      tip: 'Una oferta enviada no se edita: retirala y mandá otra.',
    },
    {
      id: 'proyectos',
      route: '/panel/profesional/proyectos',
      target: 'nav-proyectos',
      title: 'Proyectos: gestioná cada obra',
      body: 'Cotizás la mano de obra, avanzás las etapas (hasta Revisión: la obra la finaliza el cliente), proponés fechas y materiales con precios comparados entre proveedores, elegís quién paga los materiales y emitís la factura. Si necesitás ayuda, podés contratar a otro profesional para esa obra desde su perfil: tu cliente no lo ve.',
      tip: 'Si el cliente paga los materiales directo al proveedor, tu factura va solo con mano de obra.',
    },
    {
      id: 'calendario',
      route: '/panel/profesional/calendario',
      target: 'nav-calendario',
      title: 'Calendario: tus fechas y horarios',
      body: 'Ves el mes con cuántos trabajos tenés cada día y si está completo o con lugar; tocás un día y ves la agenda por hora con tus huecos libres. Las fechas y el horario de cada trabajo los proponés en el proyecto y el cliente los acepta o propone otros. En «Mi jornada» elegís tu horario habitual (por defecto de 06:00 a 18:00).',
      tip: 'Si un horario choca con otro trabajo ya acordado, HomIA no te deja confirmarlo. Tus clientes ven tus días libres u ocupados, no el detalle.',
    },
    {
      id: 'cobros',
      route: '/panel/profesional/cobros',
      target: 'nav-cobros',
      title: 'Cobros: tus facturas y tu Mercado Pago',
      body: 'Conectás tu Mercado Pago, ves lo cobrado este mes y lo pendiente, y seguís todas tus facturas de todos los proyectos: descargás el PDF y confirmás los cobros en efectivo cuando recibís la plata. Cobrás el 100%: el cargo de servicio del 1% lo paga el cliente.',
      tip: 'Con Mercado Pago conectado el cliente elige cómo pagarte; sin conexión, solo puede en efectivo.',
    },
    {
      id: 'finanzas',
      route: '/panel/profesional/finanzas',
      target: 'nav-finanzas',
      title: 'Finanzas: tus números',
      body: 'Si tu trabajo deja ganancia (Resultados), cuánta plata tenés (Caja) y cuánto vale tu negocio (Balance). Lo de HomIA se carga solo (facturas, cobros, materiales, devoluciones); vos sumás en Movimientos lo que hacés por fuera: trabajos, gastos, herramientas, retiros. La pestaña Aprendé explica cada número.',
      tip: 'Cargá tus gastos mensuales una sola vez: se repiten solos cada mes.',
    },
    {
      id: 'materiales',
      route: '/panel/profesional/materiales',
      target: 'nav-materiales',
      title: 'Materiales para vos',
      body: 'El catálogo de todos los proveedores con precio, stock y distancia. Sumás al carrito (de varios proveedores a la vez) o reservás lo que no tiene stock. Para proponerle un material al cliente de una obra, hacelo desde el proyecto, en Materiales.',
      tip: 'Chequeá el stock antes de prometer plazos: lo actualiza cada proveedor.',
    },
    {
      id: 'pedidos',
      route: '/panel/profesional/pedidos',
      target: 'nav-pedidos',
      title: 'Mis pedidos',
      body: 'Lo que compraste en el carrito, con una parte por proveedor. Las compras con stock se pagan en 24 h (Mercado Pago +1% o efectivo al retirar, con 7 días para retirar); las reservas, cuando el proveedor las aprueba. Seguís cada parte con su línea de tiempo y calificás al proveedor cuando retirás.',
      tip: 'Si te sobró algo de una compra, desde el pedido pedís la devolución.',
    },
    {
      id: 'devoluciones',
      route: '/panel/profesional/devoluciones',
      target: 'nav-devoluciones',
      title: 'Devoluciones de sobrantes',
      body: 'En «De mis clientes» te llegan los sobrantes de los materiales que les cobraste en tu factura: aceptás, recibís y reembolsás. En «A mis proveedores» seguís lo que les pediste devolver desde el proyecto; como les pagaste por fuera de HomIA, te devuelven la plata por fuera y vos confirmás.',
      tip: 'Si el cliente te pagó con Mercado Pago, el reembolso sale solo de tu cuenta al marcar recibido.',
    },
    {
      id: 'obras',
      route: '/panel/profesional/obras',
      target: 'nav-obras',
      title: 'Mis obras: tu vitrina',
      body: 'Las fotos de tus trabajos terminados se ven en tu perfil público, y la cantidad de obras aparece en tu tarjeta del directorio (que se puede ordenar por «Más experiencia»).',
      tip: 'Sumá fotos de antes y después: muestran el trabajo mejor que cualquier descripción.',
    },
    {
      id: 'crm',
      route: '/panel/profesional/crm',
      target: 'nav-crm',
      title: 'CRM clientes: tus oportunidades',
      body: 'Un tablero con columnas (Consultas, Presupuesto enviado, En negociación, En obra, Cerrado / Facturado). Sumás cada oportunidad como un trato con nombre y monto estimado, y la movés de columna a medida que avanza.',
      tip: 'Arriba de cada columna ves cuánto suman sus tratos: así sabés qué tenés en camino.',
    },
    {
      id: 'vinculaciones',
      route: '/panel/profesional/vinculaciones',
      target: 'nav-vinculaciones',
      title: 'Cuentas de retiro',
      body: 'Una cuenta de retiro es tu vínculo con un proveedor para retirar materiales de su local a cuenta de tus proyectos. La pedís con su email y el proveedor la activa; vos la podés pausar. No es una cuenta bancaria: tus cobros llegan por Mercado Pago o efectivo desde las facturas.',
      tip: 'Vinculate con el proveedor al que más le comprás: te ahorra viajes y adelantos.',
    },
    {
      id: 'directorio',
      route: '/panel/profesional/directorio',
      target: 'nav-directorio',
      title: 'Tu tarjeta en el directorio',
      body: 'Así te ven los clientes: reseñas con fotos, cantidad de obras, precio de referencia y tu verificación. El orden es por reputación: más reseñas positivas, más arriba.',
      tip: 'Perfil completo y DNI verificado te suben en el orden.',
    },
    {
      id: 'mensajes',
      route: '/panel/profesional/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: el cliente empieza, vos respondés',
      body: 'Chat estilo WhatsApp con tus clientes. La conversación nueva siempre la inicia el cliente; vos podés responder todo lo que te llega. Las conversaciones de tus proyectos también viven acá.',
      tip: 'Respondé dentro del día: el cliente está comparando y la rapidez pesa.',
    },
    {
      id: 'verificacion',
      route: '/panel/profesional/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación de identidad',
      body: 'Subí frente y dorso de tu DNI: una IA los valida y tu perfil muestra «Verificado». Sin verificar, figurás como «No verificado» ante todos. Es gratis y podés intentarlo hasta 3 veces por día.',
      tip: 'Es la mejora de 2 minutos que más confianza da.',
    },
    {
      id: 'perfil',
      route: '/panel/profesional/perfil',
      target: 'nav-perfil',
      title: 'Mi perfil',
      body: 'Tus rubros, tu zona, tu descripción, tu foto y tus datos de contacto (el celular, de cualquier país). En «Email y celular» ves si tu email está verificado. Abajo prendés o apagás «Recibir avisos por mail» (te contrataron, te aceptaron un presupuesto, te pagaron) y está «Eliminar mi cuenta».',
      tip: 'Un perfil completo es lo primero que mira un cliente antes de escribirte.',
    },
    {
      id: 'sugerencias',
      route: '/panel/profesional/sugerencias',
      target: 'nav-sugerencias',
      title: 'Sugerencias: contanos',
      body: 'Una idea, una queja o algo que no funciona: tocás «Nueva sugerencia», elegís el tipo y la parte de HomIA, y podés sumar hasta 4 fotos. En «Mis envíos» ves el estado y la respuesta del equipo.',
      tip: 'Si algo no te anda, elegí «Problema técnico»: se adjunta solo desde qué pantalla venías.',
    },
    {
      id: 'cierre',
      route: '/panel/profesional',
      target: 'nav-ayuda',
      title: '¿Te trabás? Acá tenés ayuda',
      body: 'El botón de Homy de abajo a la derecha está siempre a mano: preguntale lo que quieras, o abrí «Guías y tour» para repetir este recorrido, ver cada acción paso a paso y los atascos típicos. Las reglas de fondo: cobrás al finalizar y sin comisión, el cliente inicia los chats y las reseñas vienen de obras reales.',
      tip: 'Cada obra terminada y bien documentada te ayuda a conseguir la siguiente.',
    },
  ],

  proveedor: [
    {
      id: 'bienvenida',
      title: '¡Bienvenido, proveedor!',
      body: 'Este recorrido te muestra tu panel: stock, ventas y reservas, cobros directos a tu Mercado Pago, tu plan y tus números. Lo repetís cuando quieras desde el botón de Homy (abajo a la derecha) → «Guías y tour».',
      tip: 'En la compu avanzás con las flechas ← → y salís con Esc.',
    },
    {
      id: 'inicio',
      route: '/panel/proveedor',
      target: 'nav-inicio',
      title: 'Tu Inicio',
      body: 'Resumen de tu negocio: stock por agotar y agotado, vinculaciones activas, accesos rápidos y la tarjeta «Tus primeros pasos». Con el plan PRO, acá está la analítica de los últimos 30 días: ventas, elementos más pedidos y búsquedas donde apareciste.',
      tip: 'Reponé antes de llegar a cero: el que compra va donde hay stock.',
    },
    {
      id: 'stock',
      route: '/panel/proveedor/stock',
      target: 'nav-stock',
      title: 'Stock: tu vidriera',
      body: 'Elegís el material del catálogo (el buscador entiende errores de tipeo) y cargás precio, cantidad, marca y foto. Si no está en el catálogo, lo agregás con IA. Tu stock aparece en Materiales, en las búsquedas y en tu perfil público.',
      tip: 'Precio competitivo y stock al día: así aparecés y vendés.',
    },
    {
      id: 'cobros',
      route: '/panel/proveedor/cobros',
      target: 'nav-cobros',
      title: 'Cobros: conectá Mercado Pago',
      body: 'Arriba tocás «Conectar Mercado Pago» para que los pagos lleguen directo a tu cuenta. En la pestaña «Cobros de proyectos» emitís el cobro de los materiales aprobados cuando el cliente te paga a vos; el cliente paga con Mercado Pago o acuerda efectivo (lo confirmás vos al recibirlo).',
      tip: 'Sin Mercado Pago conectado solo podés cobrar en efectivo.',
    },
    {
      id: 'ventas',
      route: '/panel/proveedor/cobros',
      target: 'tab-ventas',
      title: 'Ventas: compras y reservas del carrito',
      body: 'Las compras te llegan ya «por pagar»: el stock quedó reservado y no tenés que aprobar nada, solo prepararlas. Las reservas sí las aprobás: con stock se las guardás 48 h; sin stock indicás una fecha aproximada y, cuando lo tenés, tocás «Ya lo tengo: disponible». Cuando retiran, marcás «Entregado».',
      tip: 'Si no podés cumplir una compra, cancelala con un motivo: si ya estaba pagada por Mercado Pago, se devuelve completa desde tu cuenta.',
    },
    {
      id: 'devoluciones',
      route: '/panel/proveedor/cobros',
      target: 'tab-devoluciones',
      title: 'Devoluciones de sobrantes',
      body: 'Te llegan los sobrantes que un cliente (o un profesional) quiere devolverte, con foto y cantidad. Aceptás todo o algunos, marcás recibido cuando te los traen (vuelven a tu stock) y el reembolso sale solo si pagaron con Mercado Pago. Si te lo pide un profesional, marcás cómo le devolviste la plata por fuera de HomIA.',
      tip: 'Si no respondés en 72 h te llega un recordatorio.',
    },
    {
      id: 'finanzas',
      route: '/panel/proveedor/finanzas',
      target: 'nav-finanzas',
      title: 'Finanzas: tus números',
      body: 'Si tu negocio gana plata (Resultados), cuánta plata tenés (Caja) y cuánto vale (Balance), con tu stock valuado al costo. Tus ventas por HomIA se cargan solas; vos cargás el costo de tus productos, los gastos, las compras de mercadería y lo que vendés en el mostrador. La pestaña Aprendé explica cada número.',
      tip: 'En Resultados → «Cargar costos» ponés lo que te cuesta cada producto; para los que no tengan dato podés usar un margen estimado.',
    },
    {
      id: 'plan',
      route: '/panel/proveedor/plan',
      target: 'nav-plan',
      title: 'Mi plan: 14 días gratis',
      body: 'Probás la app completa gratis durante 14 días. Después elegís: Básico ($50.000/mes) con stock, ventas, cobros por Mercado Pago y efectivo, CRM y vinculaciones; o PRO ($100.000/mes), que suma tu logo y marca en la home, la tarjeta «Recomendado» en materiales y directorio, y la analítica de demanda. Se paga por suscripción de Mercado Pago.',
      tip: 'La suscripción se cancela desde tu cuenta de Mercado Pago. Sin plan activo dejás de aparecer, pero tus datos y reseñas se conservan.',
    },
    {
      id: 'crm',
      route: '/panel/proveedor/crm',
      target: 'nav-crm',
      title: 'CRM: tus tratos',
      body: 'Un tablero con columnas (Nuevos contactos, Cotizando, Compra en curso, Cliente recurrente). Sumás cada trato con nombre, monto estimado y con quién es, y lo movés de columna a medida que avanza.',
      tip: 'Arriba de cada columna ves cuánto suman sus tratos.',
    },
    {
      id: 'vinculaciones',
      route: '/panel/proveedor/vinculaciones',
      target: 'nav-vinculaciones',
      title: 'Vinculaciones: profesionales que retiran a cuenta',
      body: 'Una cuenta de retiro es tu vínculo con un profesional: la creás con su email (o te la pide él y vos la activás) y a partir de ahí retira materiales de tu local a cuenta de un proyecto. La podés pausar cuando quieras sin borrar el historial. No es una cuenta bancaria.',
      tip: 'Vinculá primero a los profesionales que ya te compran seguido.',
    },
    {
      id: 'directorio',
      route: '/panel/proveedor/directorio',
      target: 'nav-directorio',
      title: 'Tu tarjeta en el directorio',
      body: 'Tu perfil público se arma solo con tu stock, tus reseñas y tu verificación. Los clientes te califican con estrellas, comentario y fotos cuando retiran una compra o al finalizar una obra con tus materiales.',
      tip: 'El orden del directorio es por reputación: cuidar las reseñas es cuidar tus ventas.',
    },
    {
      id: 'mensajes',
      route: '/panel/proveedor/mensajes',
      target: 'nav-mensajes',
      title: 'Mensajes: el cliente empieza, vos respondés',
      body: 'Chat estilo WhatsApp con clientes y profesionales. La conversación nueva siempre la inicia el cliente; vos respondés todo lo que te llega.',
      tip: 'Respondé rápido: el que pregunta suele estar comparando proveedores en ese momento.',
    },
    {
      id: 'verificacion',
      route: '/panel/proveedor/verificacion',
      target: 'nav-verificacion',
      title: 'Verificación de identidad',
      body: 'Subí frente y dorso de tu DNI: una IA los valida y tu perfil muestra «Verificado». Sin verificar, figurás como «No verificado» frente a todos los clientes.',
      tip: 'Entre dos proveedores con precio parecido, la verificación ayuda a decidir.',
    },
    {
      id: 'perfil',
      route: '/panel/proveedor/perfil',
      target: 'nav-perfil',
      title: 'Mi perfil y tu marca',
      body: 'Los datos del negocio (nombre, tipo, CUIT, dirección), tu foto y tu celular. Con el plan PRO, en «Tu marca en la home» subís tu logo, una frase y un color para la cinta de la portada. Abajo prendés o apagás «Recibir avisos por mail» (te compraron, te pagaron, te piden devolver) y está «Eliminar mi cuenta».',
      tip: 'Si no subís logo, en la cinta se usa tu foto de perfil.',
    },
    {
      id: 'sugerencias',
      route: '/panel/proveedor/sugerencias',
      target: 'nav-sugerencias',
      title: 'Sugerencias: contanos',
      body: 'Una idea, una queja o algo que no funciona: tocás «Nueva sugerencia», elegís el tipo y la parte de HomIA, y podés sumar hasta 4 fotos. En «Mis envíos» ves el estado y la respuesta del equipo.',
      tip: 'Si algo no te anda, elegí «Problema técnico»: se adjunta solo desde qué pantalla venías.',
    },
    {
      id: 'cierre',
      route: '/panel/proveedor',
      target: 'nav-ayuda',
      title: '¿Te trabás? Acá tenés ayuda',
      body: 'El botón de Homy de abajo a la derecha está siempre a mano: preguntale lo que quieras, o abrí «Guías y tour» para repetir este recorrido, ver cada acción paso a paso y los atascos típicos. En Ayuda tenés el mapa de cada sección y las preguntas frecuentes.',
      tip: 'Stock al día, ventas preparadas a tiempo y reseñas con foto: eso es lo que vende.',
    },
  ],
}

/** Devuelve el tour de un rol de forma segura (si el rol no existe → cliente). */
export function getTour(role: string | undefined | null): { role: TourRole; steps: TourStep[] } {
  const r = (role === 'profesional' || role === 'proveedor' ? role : 'cliente') as TourRole
  return { role: r, steps: TOURS[r] }
}
