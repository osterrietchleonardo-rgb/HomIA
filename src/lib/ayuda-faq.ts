// Preguntas frecuentes del Centro de ayuda (/ayuda). Una sola fuente: las muestra la pantalla
// (help-screen.tsx) y Homy las importa como conocimiento (src/lib/homy/conocimiento.ts).
// Cada pregunta tiene `tema`: `/ayuda?tema=<tema>` abre esa pregunta desplegada y a la vista
// (lo usan el pie de página, Homy y cualquier link). Regla: lo que dice cada respuesta tiene que
// ser lo que hace el sistema hoy; si algo no existe, no se promete.
import { PLAN_PRICE_ARS, TRIAL_DAYS } from '@/lib/plans'
import { CATEGORIES_FALLBACK } from '@/lib/categories-data'

export type Faq = { tema: string; q: string; a: string }

const ars = (n: number) => `$${n.toLocaleString('es-AR')}`
const RUBROS = CATEGORIES_FALLBACK.map((c) => c.name).join(', ')

export const FAQ: Faq[] = [
  {
    tema: 'pago-al-finalizar',
    q: '¿Cómo funciona el pago al finalizar la obra?',
    a: 'Cuando la obra está terminada, el cliente la revisa y toca «Finalizar obra» (solo él puede darla por terminada). El profesional emite la factura y el cliente la paga con Mercado Pago o en efectivo. El dinero va directo al profesional: HomIA no lo retiene. Así el cliente paga recién cuando está conforme con el trabajo.',
  },
  {
    tema: 'resenas',
    q: '¿Dónde dejo una reseña, a quién y en qué momento?',
    a: 'Las reseñas de una obra se dejan desde el detalle del proyecto y se activan recién cuando la obra finaliza: el cliente califica a su profesional y a cada proveedor que le vendió materiales, y el profesional califica al cliente. Las compras de materiales se califican desde Mis pedidos cuando quedaron pagadas y entregadas. Una reseña por persona y proyecto (o compra), con estrellas, comentario y hasta 4 fotos. Nadie puede reseñar sin un trabajo o una compra real entre ambos.',
  },
  {
    tema: 'pagos',
    q: '¿Cómo pago una factura: Mercado Pago o efectivo?',
    a: 'El cliente elige el método al pagar: Mercado Pago (el dinero va directo a la cuenta de quien cobra: el profesional o el proveedor, nunca queda retenido en HomIA; se suma un «Cargo de servicio HomIA (1%)» que ves antes de pagar) o efectivo (sin cargo). Para cobrar por Mercado Pago, el profesional o el proveedor tiene que haber conectado su cuenta; si no lo hizo, te lo decimos y podés pagar en efectivo. Con efectivo, el acuerdo queda registrado: el profesional ve que va a cobrar en efectivo y confirma desde su panel cuando recibe el dinero; recién ahí la factura queda pagada. Podés cancelar el acuerdo antes de la confirmación y elegir otro método.',
  },
  {
    tema: 'quien-paga-materiales',
    q: '¿Quién paga los materiales de una obra?',
    a: 'Lo elige el profesional en cada proyecto y lo ven los dos siempre en la tarjeta «¿Quién paga los materiales?»: (1) los adelanta el profesional y los cobra junto con la mano de obra en su factura, o (2) el cliente los paga directamente al proveedor: el proveedor emite el cobro desde su panel (Cobros) y el cliente lo paga desde el detalle del proyecto, con Mercado Pago o en efectivo. En el modo 2, la factura del profesional cubre solo la mano de obra.',
  },
  {
    tema: 'verificacion',
    q: '¿Cómo funciona la verificación de identidad y por qué hay usuarios "No verificados"?',
    a: 'HomIA verifica la identidad con el DNI: desde tu panel (Verificación) subís una foto del frente y otra del dorso, y un modelo de IA de visión revisa que sea un documento real, legible y que coincida con los datos de tu cuenta. Podés intentarlo hasta 3 veces por día. Cada perfil muestra siempre su estado: "Verificado", "En revisión" o "No verificado"; nunca se oculta, es información clave para decidir con quién contratás. Las fotos de tu DNI se guardan en un almacenamiento privado: nadie más las ve, los demás solo ven el estado. La insignia confirma el documento; no garantiza la calidad del trabajo.',
  },
  {
    tema: 'chat',
    q: '¿Quién puede iniciar un chat?',
    a: 'Siempre el cliente. Los profesionales y proveedores pueden responder cualquier conversación, pero no pueden escribirle primero a alguien que solo es cliente. Así evitamos molestias y el cliente mantiene el control. Para escribir hace falta cuenta (gratis). Los mensajes del chat no llegan por mail: los ves en Mensajes.',
  },
  {
    tema: 'costos',
    q: '¿Publicar un trabajo cuesta algo?',
    a: 'No. Publicar, recibir presupuestos, contratar y chatear es gratis para el cliente, y también para el profesional. Solo cuando pagás con Mercado Pago (una factura, un cobro de materiales o una compra) se suma un «Cargo de servicio HomIA (1%)» que paga quien compra; el profesional o el proveedor cobra el 100% de su precio. En efectivo no hay cargo.',
  },
  {
    tema: 'carrito',
    q: '¿Cómo funciona el carrito de materiales? ¿Qué diferencia hay entre comprar y reservar?',
    a: 'Sumás productos de uno o varios proveedores con «Agregar al carrito» (también sin cuenta: se guarda en tu dispositivo y, al crear tu cuenta o ingresar, se pasa a tu cuenta). Al confirmar elegís producto por producto qué comprás y qué reservás. COMPRAR (solo con stock) no necesita aprobación del proveedor: el stock queda reservado y tenés 24 h para pagar con Mercado Pago (+1% de cargo de servicio) o elegir efectivo al retirar (7 días para retirar); si no, se cancela sola. RESERVAR (con o sin stock) lo aprueba el proveedor: si lo tiene, te lo guarda 48 h; si no lo tiene, te dice una fecha aproximada y, cuando está disponible, arrancan las 48 h. Lo que no tiene stock solo se puede reservar. A cada proveedor le pagás por separado y todo se sigue en Mis pedidos.',
  },
  {
    tema: 'sobrantes',
    q: '¿Qué hago con los materiales que sobraron?',
    a: 'Se los devolvés a quien te los cobró: al proveedor si se los pagaste a él (compra de materiales o cobro del proveedor), o a tu profesional si te los cobró en su factura. Desde el detalle del proyecto (o desde Mis pedidos, si fue una compra de materiales) cargás cada sobrante con foto y cantidad. Quien te los vendió acepta todos o algunos ítems (si no responde en 72 h le llega un recordatorio), se los entregás y confirma la recepción. Si pagaste con Mercado Pago, el reembolso (el precio de lo que devolvés; el cargo de servicio del 1% no se devuelve) vuelve solo a tu medio de pago; si pagaste en efectivo, te lo devuelven en efectivo y lo confirmás en la app (si no, se confirma solo a las 72 h). Tenés hasta 30 días desde el pago.',
  },
  {
    tema: 'devoluciones-profesional',
    q: 'Soy profesional: ¿cómo manejo las devoluciones de sobrantes?',
    a: 'En Panel → Devoluciones. En «De mis clientes» te llegan los sobrantes de los materiales que les cobraste en tu factura: aceptás todos o algunos (con el monto a devolver) o rechazás con un motivo, y marcás recibido cuando te los entregan. Si el cliente te pagó con Mercado Pago, el reembolso sale solo de tu cuenta; si fue en efectivo, se lo devolvés en mano y tocás «Ya lo reembolsé en efectivo». En «A mis proveedores» ves lo que les pediste devolver desde el proyecto (Sobrantes → Pedir devolución a …): como les pagaste por fuera de HomIA, te devuelven la plata por fuera (efectivo, transferencia o saldo a favor) y vos confirmás que la recibiste.',
  },
  {
    tema: 'plan-proveedor',
    q: '¿Cuánto cuesta HomIA para un proveedor?',
    a: `Los primeros ${TRIAL_DAYS} días son gratis. Después, el plan Básico cuesta ${ars(PLAN_PRICE_ARS.basic)}/mes e incluye la app completa: stock, ventas, cobros por Mercado Pago y efectivo, CRM y vinculaciones. El plan PRO cuesta ${ars(PLAN_PRICE_ARS.pro)}/mes y suma tu logo y marca en la cinta de la portada (se cargan en Mi perfil), la tarjeta "Recomendado" en materiales y directorio, y la analítica de demanda de los últimos 30 días (en tu Inicio). Se paga por suscripción de Mercado Pago desde Panel → Mi plan; la cancelás desde tu cuenta de Mercado Pago (en la app no hay botón). Sin plan activo tu negocio deja de aparecer en materiales, directorio, búsquedas y Homy, y no podés tocar el stock ni gestionar ventas; tus datos, reseñas y vinculaciones se conservan.`,
  },
  {
    tema: 'finanzas',
    q: '¿Para qué sirve Finanzas y qué tengo que cargar?',
    a: 'Finanzas (en el panel del profesional y del proveedor, gratis en todos los planes) te muestra si tu negocio gana plata (Resultados), cuánta plata tenés (Caja), cuánto vale (Balance) y las métricas clave con recomendaciones. Lo que pasa por HomIA se carga solo y dice "Automático · viene de HomIA": tus facturas o ventas (facturado y cobrado por separado), las devoluciones de sobrantes, los materiales que compraste en la app y los subcontratos. Vos cargás el resto en Movimientos: trabajos o ventas por fuera de HomIA, costos de cada trabajo, gastos fijos (los mensuales se cargan una vez y se repiten solos), inversiones como herramientas o un vehículo (se reparten mes a mes: amortización), retiros, aportes y préstamos. Cada categoría explica qué es con ejemplos, y la pestaña Aprendé tiene la guía y el glosario. El cargo de servicio del 1% lo paga el cliente: no es ingreso ni gasto tuyo. HomIA no recibe las comisiones que te descuenta Mercado Pago: si querés verlas, cargalas como gasto. Podés exportar todo a Excel. No es asesoramiento impositivo: para impuestos consultá a un contador.',
  },
  {
    tema: 'calendario',
    q: '¿Cómo se acuerdan las fechas y el horario de un trabajo?',
    a: 'Con el presupuesto aprobado, en el detalle del proyecto aparece «Fechas del trabajo»: el profesional propone inicio, fin estimado y el horario de cada día (por ejemplo de 07:00 a 12:00, o todo el día), y el cliente las acepta, las rechaza o propone otras. Nadie acepta su propia propuesta, y cada paso le llega al otro como aviso. Lo acordado se puede reprogramar: mientras el otro decide, siguen las fechas acordadas. Si el horario choca con otro trabajo ya acordado del profesional, HomIA no deja confirmarlo; si choca solo con una propuesta sin confirmar, avisa. El profesional ve todo en Panel → Calendario (con su jornada, que por defecto es de 06:00 a 18:00 y se cambia en «Mi jornada»), y en su perfil cualquiera ve su Disponibilidad de los próximos meses sin detalles de cada trabajo.',
  },
  {
    tema: 'contratar',
    q: '¿Cómo funciona "Contratar" desde el directorio?',
    a: 'Elegís un profesional del directorio, tocás «Contratar» y un asistente de 4 pasos te guía: qué necesitás (con fotos), cuándo y dónde, presupuesto estimado y confirmación. Si ya habías publicado ese trabajo, arriba elegilo en «¿Es para algo que ya publicaste?» y se cargan sus datos (los podés cambiar); si ese profesional te había ofertado, se acepta su oferta y las demás se rechazan con aviso. Se crea el proyecto y el profesional recibe todo el pedido al instante. Un profesional también puede contratar a otro para una obra suya (subcontratar): elige uno de sus proyectos activos y su cliente no lo ve.',
  },
  {
    tema: 'cobros-profesional',
    q: 'Soy profesional: ¿dónde veo lo que cobré y cómo cobro con Mercado Pago?',
    a: 'En Panel → Cobros (en el celular, dentro de «Más»). Arriba tocás «Conectar Mercado Pago» y autorizás a HomIA: desde ahí tus clientes te pagan las facturas por Mercado Pago y la plata entra directo en tu cuenta (cobrás el 100%; el 1% lo paga el cliente aparte). Sin conexión, solo pueden pagarte en efectivo. Debajo ves lo cobrado este mes, lo pendiente y todas tus facturas con filtros Pendientes / Cobradas / Todas: descargás el PDF y, si el cliente te pagó en efectivo, tocás «Confirmar cobro en efectivo».',
  },
  {
    tema: 'facturas-pdf',
    q: '¿Puedo descargar mis facturas?',
    a: 'Sí, todas las facturas se ven y descargan como PDF: el cliente desde Facturas o desde el detalle de cada proyecto; el profesional desde Cobros o desde el proyecto. Si se pagó con Mercado Pago, el PDF muestra también el cargo de servicio.',
  },
  {
    tema: 'registro',
    q: '¿Cómo creo mi cuenta? ¿Qué es el código que me llega por mail?',
    a: 'Crear la cuenta es gratis y son 4 pasos: elegís tu rol (cliente, profesional o proveedor); cargás nombre, apellido, email, el país de tu celular y el celular (dos veces; sirve cualquier país), contraseña y ciudad; confirmás el email con un código de 6 números que te llega por mail (vence en 10 minutos; si no llega, mirá spam y pedí otro al minuto); y completás lo de tu rol (el profesional, sus rubros y su zona; el proveedor, el nombre, el tipo y la dirección del comercio) y aceptás los Términos y la Política de Privacidad. El DNI es opcional y se puede verificar después. El celular no se verifica con código: se guarda en formato internacional. Si tu email figura «Sin verificar» en Mi perfil → Email y celular, tocá «Verificar ahora» y te mandamos un código.',
  },
  {
    tema: 'roles',
    q: '¿Puedo tener más de un rol?',
    a: 'Todo el que se registra también queda como cliente: un profesional o un proveedor puede contratar y comprar materiales como cualquiera. Cambiás de panel con el selector de perfil de arriba. Hoy no se puede sumar el rol profesional o proveedor a una cuenta que ya existe; si lo necesitás, contanos en Sugerencias.',
  },
  {
    tema: 'rubros',
    q: '¿Qué rubros hay en HomIA?',
    a: `Hay ${CATEGORIES_FALLBACK.length} rubros, que sirven tanto para buscar profesionales como materiales: ${RUBROS}. El profesional elige los suyos al registrarse y los cambia en Mi perfil.`,
  },
  {
    tema: 'fotos',
    q: 'No puedo subir una foto, ¿qué hago?',
    a: 'Podés subir fotos sacadas con el celular de cualquier tamaño: la app las achica sola antes de subirlas (JPG, PNG o WEBP, o la foto de la cámara). Si algo falla, el mensaje te dice el motivo: sin conexión, imagen dañada, o una foto HEIC del iPhone que ese navegador no puede abrir (subila desde el iPhone, o en Ajustes > Cámara > Formatos elegí "Más compatible", o mandala como JPG).',
  },
  {
    tema: 'contrasena',
    q: '¿Me olvidé la contraseña?',
    a: 'En Ingresar tocá "¿Olvidaste tu contraseña?", escribí el email de tu cuenta y te mandamos un link para crear una nueva (revisá también spam o promociones). El link vence en 1 hora y sirve una sola vez; si venció, pedí otro (hasta 3 por hora). Después ingresás con la contraseña nueva: tus datos, proyectos y pedidos quedan como estaban.',
  },
  {
    tema: 'avisos-mail',
    q: '¿HomIA me avisa por mail?',
    a: 'Sí, además del aviso en la campanita te mandamos un mail con lo importante: una compra o reserva nueva (proveedor), que te contrataron o te aceptaron un presupuesto (profesional), una oferta nueva, una factura o una reserva aprobada o lista para retirar (cliente), pagos acreditados por Mercado Pago, pedidos de devolución de sobrantes y la respuesta del equipo a tus sugerencias. Los mensajes del chat no llegan por mail. Podés apagar los avisos por mail desde Mi perfil → «Recibir avisos por mail» (el mail para crear una contraseña nueva llega siempre).',
  },
  {
    tema: 'sugerencias',
    q: '¿Cómo dejo una sugerencia, una queja o aviso que algo no funciona?',
    a: 'Desde tu panel, en Sugerencias (está en los tres roles, cerca de Ayuda): tocás «Nueva sugerencia», elegís el tipo (Sugerencia, Queja, Mejora, Oportunidad, Problema técnico u Otro), sobre qué parte de HomIA es, un título y la descripción. Podés sumar hasta 4 fotos o capturas desde la cámara o la galería: se guardan en un almacenamiento privado que solo ven vos y el equipo de HomIA. Si es un problema técnico, se adjunta solo la pantalla desde la que venías, tu navegador, tu dispositivo y la fecha, para encontrarlo más rápido. En «Mis envíos» ves el estado (Recibida, En revisión, Planificada, Resuelta o Descartada) y nuestra respuesta, que también te llega como notificación y por mail. Podés mandar hasta 10 por día.',
  },
  {
    tema: 'tour',
    q: '¿Dónde está el recorrido guiado y las guías paso a paso?',
    a: 'En el botón de Homy (abajo a la derecha, en el panel) → «Guías y tour»: ahí está el recorrido de tu rol (completo o solo la sección que quieras), «¿Cómo hago?» con cada acción paso a paso, «Me trabé» con los atascos típicos y los videos. El recorrido no arranca solo: también lo empezás desde esta página o desde la tarjeta «Tus primeros pasos» del Inicio. En la vista «Homy» le podés preguntar lo que quieras.',
  },
  {
    tema: 'eliminar-cuenta',
    q: '¿Cómo elimino mi cuenta?',
    a: 'Desde Mi perfil, al final: "Eliminar mi cuenta". Escribís ELIMINAR y tu contraseña. Si tenés proyectos, pedidos, facturas, cobros o devoluciones abiertos (o, si sos proveedor, tu suscripción de Mercado Pago activa), primero tenés que cerrarlos: la app te dice cuáles. Se borran tus datos personales, las fotos de tu DNI, tu carrito, favoritos, conversaciones con Homy y notificaciones, y tu perfil deja de aparecer. Las facturas, pagos y pedidos cerrados se conservan sin tu nombre porque la ley nos obliga, y tus reseñas y mensajes quedan como "Usuario eliminado". No se puede deshacer.',
  },
  {
    tema: 'terminos',
    q: '¿Dónde están los Términos y la Política de Privacidad?',
    a: 'En el pie de la portada ("Términos y Condiciones" y "Política de Privacidad") y en la casilla que se acepta al crear la cuenta. Tienen un resumen "En pocas palabras", índice y tablas con los plazos, quién paga qué, los planes y qué datos guardamos y para qué. Se pueden imprimir o guardar en PDF.',
  },
]
