// Textos legales de HomIA: Términos y Condiciones y Política de Privacidad.
// Versión del 24/09/2026, redactada a partir de cómo funciona el sistema HOY (reglas de
// docs/interno/LOGICA-HOMIA.md y docs/interno/decisiones.md). Cada plazo, porcentaje y dato
// mencionado acá existe en el código: si cambia una regla, hay que cambiar este archivo y subir
// LEGAL_VERSION. Son la versión vigente: Leonardo decidió el 25/09/2026 no hacerlos revisar
// por un abogado (D22).
// Los datos de la empresa (razón social, CUIT, domicilio, email) salen de variables de entorno
// públicas NEXT_PUBLIC_LEGAL_*; si faltan, la página lo dice en vez de inventarlos.

// D27: registro de uso de la plataforma (Privacidad §2, §3, §9, §11 y §12). D33 (mismo día): cancelación de la
// suscripción, sin reintegro y con acceso hasta el fin del período pago; primer cobro al terminar la prueba
// (Términos, planes). La versión es por día (AAAA-MM-DD): ya era la de hoy, así que no cambia.
export const LEGAL_VERSION = '2026-09-25'

// Titular de HomIA, responsable de la plataforma y de la base de datos. Datos públicos que dio
// Leonardo el 25/09/2026. Sin domicilio: pedido expreso de Leonardo. Las variables
// NEXT_PUBLIC_LEGAL_* (si se cargan en Vercel) reemplazan cada valor.
export const TITULAR = {
  nombre: process.env.NEXT_PUBLIC_LEGAL_RAZON_SOCIAL || 'Leonardo Osterrietch',
  cuit: process.env.NEXT_PUBLIC_LEGAL_CUIT || '20-39833562-8',
  domicilio: process.env.NEXT_PUBLIC_LEGAL_DOMICILIO || '',
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'business@vakdor.com',
}

/** Un bloque de texto: párrafo, lista con viñetas, tabla o nota destacada. */
export type LegalBlock =
  | string
  | { lista: string[] }
  | { tabla: { columnas: string[]; filas: string[][] } }
  | { nota: string }

export type LegalSection = { id: string; titulo: string; bloques: LegalBlock[] }

export type LegalDoc = {
  titulo: string
  bajada: string
  resumen: string[]
  secciones: LegalSection[]
}

// ───────────────────────────── TÉRMINOS Y CONDICIONES ─────────────────────────────

export const TERMINOS: LegalDoc = {
  titulo: 'Términos y Condiciones',
  bajada:
    'Las reglas para usar HomIA, explicadas en simple. Cada plazo y cada porcentaje que leés acá es el mismo que aplica el sistema.',
  resumen: [
    'HomIA conecta clientes con profesionales de oficios y con proveedores de materiales. No hace los trabajos ni vende los materiales: pone las herramientas para encontrarse, acordar, pagar y calificar.',
    'Para clientes y profesionales usar HomIA es gratis. Los proveedores pagan un plan mensual después de 14 días de prueba.',
    'Si pagás con Mercado Pago, se suma un cargo de servicio del 1% que ves antes de pagar. En efectivo no hay cargo.',
    'La plata va directo a la cuenta de Mercado Pago de quien vende. HomIA no retiene pagos ni hace de garante.',
    'Las compras con stock se confirman al instante y tenés 24 horas para pagar. Las reservas las aprueba el proveedor.',
    'Podés devolver materiales que te sobraron hasta 30 días después de pagarlos.',
    'Solo califican quienes trabajaron o compraron de verdad, una vez por cada caso.',
  ],
  secciones: [
    {
      id: 'que-es',
      titulo: '1. Qué es HomIA y cómo aceptás estos términos',
      bloques: [
        'HomIA (en adelante, "HomIA" o "nosotros") es una plataforma web que conecta a personas que necesitan resolver algo en su hogar con profesionales de oficios y con proveedores de materiales de construcción y ferretería de la Argentina.',
        'HomIA no presta los servicios de los profesionales ni vende los materiales de los proveedores. Brinda las herramientas para encontrarse, conversar, acordar presupuestos y fechas, seguir el avance, pagar, devolver sobrantes y calificar.',
        'Al crear tu cuenta tildás la casilla "Acepto los Términos y Condiciones y la Política de Privacidad". Guardamos la fecha y la versión que aceptaste. Si no estás de acuerdo con estos términos, no uses la plataforma.',
      ],
    },
    {
      id: 'definiciones',
      titulo: '2. Palabras que usamos',
      bloques: [
        {
          tabla: {
            columnas: ['Palabra', 'Qué significa'],
            filas: [
              ['Cliente', 'Quien busca un profesional o compra materiales. Toda cuenta es cliente.'],
              ['Profesional', 'Quien ofrece un oficio (plomería, electricidad, pintura, etc.), cotiza y ejecuta trabajos.'],
              ['Proveedor', 'Comercio que publica materiales con su stock y precio, y los vende o reserva.'],
              ['Trabajo publicado', 'Pedido que publica un cliente para recibir ofertas de profesionales.'],
              ['Proyecto', 'Trabajo acordado entre un cliente y un profesional, con etapas, materiales, fechas y factura.'],
              ['Pedido', 'Lo que confirmás desde el carrito. Se divide en una parte por proveedor.'],
              ['Compra', 'Producto con stock que se confirma sin aprobación del proveedor.'],
              ['Reserva', 'Producto que se aparta y que el proveedor tiene que aprobar, tenga o no stock.'],
              ['Cargo de servicio', 'El 1% que cobra HomIA sobre el subtotal, solo en pagos con Mercado Pago.'],
              ['Sobrantes', 'Materiales pagados que no usaste y querés devolver.'],
            ],
          },
        },
      ],
    },
    {
      id: 'cuentas',
      titulo: '3. Tu cuenta',
      bloques: [
        {
          lista: [
            'Tenés que ser mayor de 18 años y dar datos verdaderos, completos y actualizados.',
            'Para crear la cuenta confirmás tu email con un código de 6 números que te mandamos por mail (vence a los 10 minutos). Tu celular lo escribís dos veces, con su país, y lo guardamos en formato internacional; no lo verificamos con un código.',
            'Una misma cuenta puede tener perfil de cliente, de profesional y de proveedor.',
            'Sos responsable de cuidar tu contraseña y de todo lo que se haga desde tu cuenta. Si creés que alguien entró sin permiso, cambiá la contraseña y avisanos.',
            'Si te olvidaste la contraseña, la recuperás desde "¿Olvidaste tu contraseña?" con un enlace que te llega por email.',
            'La sesión dura hasta 30 días en el mismo navegador o hasta que cierres sesión.',
          ],
        },
        'Podemos suspender o dar de baja cuentas que den información falsa, se hagan pasar por otra persona, incumplan estos términos o perjudiquen a otros usuarios. Salvo casos graves o urgentes, te avisamos el motivo.',
      ],
    },
    {
      id: 'verificacion',
      titulo: '4. Verificación de identidad',
      bloques: [
        'Podés verificar tu identidad subiendo fotos del frente y del dorso de tu DNI. Un sistema de inteligencia artificial revisa que sea un documento legible, que parezca real y que coincida con los datos de tu cuenta. Podés intentarlo hasta 3 veces por día.',
        'Tu perfil muestra siempre uno de tres estados: "Verificado", "En revisión" o "No verificado". Nunca ocultamos el estado.',
        { nota: 'La insignia "Verificado" dice que se validó el documento de esa persona. No es una garantía de la calidad del trabajo, de los productos ni de la conducta de nadie.' },
      ],
    },
    {
      id: 'contratar',
      titulo: '5. Contratar a un profesional',
      bloques: [
        'Podés publicar un trabajo para recibir ofertas o contratar directamente desde el perfil de un profesional. El proyecto avanza por etapas, siempre hacia adelante:',
        {
          tabla: {
            columnas: ['Etapa', 'Qué pasa'],
            filas: [
              ['Presupuesto', 'El profesional cotiza la mano de obra y elige cómo se pagan los materiales.'],
              ['Materiales', 'Se definen y aprueban los materiales.'],
              ['Ejecución', 'Se hace el trabajo.'],
              ['Revisión', 'El cliente revisa lo hecho.'],
              ['Finalizado', 'Solo el cliente puede dar la obra por terminada.'],
            ],
          },
        },
        'Fechas: con el presupuesto aprobado, el profesional propone una fecha de inicio y una fecha estimada de finalización. El cliente puede aceptarlas, rechazarlas o proponer otras, y el profesional hace lo mismo con las del cliente. Nadie puede aceptar su propia propuesta. La fecha de finalización es estimada: los cambios se vuelven a acordar por la plataforma.',
        'Materiales: el profesional elige una de dos formas. O los adelanta él y los cobra en su factura, o el cliente se los paga directamente al proveedor.',
        'Cancelación: cualquiera de las dos partes puede cancelar el proyecto en las etapas de presupuesto o materiales, contando el motivo. Una vez que la obra empezó, los cambios se coordinan por el chat.',
        'Los acuerdos sobre alcance, calidad, garantía, plazos y precio son entre cliente y profesional. HomIA registra lo acordado para que las dos partes tengan un historial claro.',
      ],
    },
    {
      id: 'materiales',
      titulo: '6. Comprar y reservar materiales',
      bloques: [
        'Podés sumar productos de varios proveedores al carrito, incluso sin tener cuenta. Al confirmar, el pedido se divide en una parte por proveedor y cada parte se paga por separado. Para cada producto elegís si lo comprás o lo reservás.',
        {
          tabla: {
            columnas: ['Situación', 'Qué pasa y en qué plazo'],
            filas: [
              ['Compra (con stock)', 'Se confirma al instante, sin aprobación, y el stock queda apartado. Tenés 24 horas para pagar por Mercado Pago o elegir efectivo.'],
              ['Pago en efectivo', 'Tenés 7 días desde la compra para retirar y pagar en el local.'],
              ['Reserva con stock', 'El proveedor la aprueba o la rechaza. Si la aprueba, te la guarda 48 horas para pagar y retirar.'],
              ['Reserva sin stock', 'El proveedor indica una fecha aproximada. Cuando llega el producto, te avisamos y tenés 48 horas.'],
              ['Plazo vencido sin pagar', 'La compra o la reserva se cancela sola y el stock se libera. No tiene costo para vos.'],
            ],
          },
        },
        'Podés cancelar una compra mientras no esté pagada. El proveedor puede cancelar una compra que no puede cumplir, contando el motivo. Si ya la habías pagado por Mercado Pago y no te la entregó, se te reembolsa el total.',
        'Los precios, el stock, las marcas y las fotos los publica cada proveedor, que es responsable de que sean correctos.',
      ],
    },
    {
      id: 'pagos',
      titulo: '7. Pagos y cargo de servicio',
      bloques: [
        {
          tabla: {
            columnas: ['Cómo pagás', 'Cuánto pagás', 'A quién le llega'],
            filas: [
              ['Mercado Pago', 'Subtotal + 1% de cargo de servicio HomIA', 'El subtotal va a la cuenta de Mercado Pago del profesional o del proveedor. El 1% va a HomIA.'],
              ['Efectivo', 'Solo el subtotal, sin cargo', 'Se paga en mano al profesional o al proveedor.'],
            ],
          },
        },
        'El cargo de servicio se muestra en el carrito, en cada pedido y en cada factura antes de pagar. El profesional y el proveedor cobran el 100% de su precio.',
        'Para cobrar por Mercado Pago, el profesional o el proveedor tiene que conectar su cuenta. Si no la conectó, la plataforma lo dice y solo se puede pagar en efectivo.',
        'Las facturas de proyecto se pagan al final, cuando el cliente da la obra por terminada. HomIA no retiene el dinero, no ofrece pagos en garantía y no garantiza los trabajos ni las compras.',
        { nota: 'El PDF que genera HomIA es un comprobante interno de la operación. No reemplaza la factura fiscal que el profesional o el proveedor tenga que emitir según su situación ante ARCA.' },
      ],
    },
    {
      id: 'sobrantes',
      titulo: '8. Devolución de materiales sobrantes',
      bloques: [
        {
          lista: [
            'Tenés hasta 30 días desde el pago para pedir la devolución de materiales que sobraron, con foto, cantidad y estado.',
            'La devolución se le pide a quien te vendió: al proveedor, o al profesional si incluyó los materiales en su factura.',
            'El vendedor acepta todo, una parte o nada. Si no responde en 72 horas, le mandamos un recordatorio.',
            'Cuando recibe los materiales, te reembolsa por el mismo medio. Si pagaste por Mercado Pago, el reembolso vuelve a tu medio de pago. Si pagaste en efectivo, te lo devuelve en mano y vos confirmás que lo recibiste; si no lo confirmás en 72 horas, se da por confirmado.',
            'El cargo de servicio del 1% no se reembolsa en las devoluciones de sobrantes.',
            'Si el profesional te devolvió dinero por materiales que le compró a un proveedor, puede pedirle la devolución a ese proveedor. Ese reembolso se arregla entre ellos, por fuera de Mercado Pago.',
          ],
        },
      ],
    },
    {
      id: 'planes',
      titulo: '9. Planes para proveedores',
      bloques: [
        {
          tabla: {
            columnas: ['Plan', 'Precio', 'Qué incluye'],
            filas: [
              ['Prueba', 'Gratis, 14 días', 'Todas las funciones del plan Básico.'],
              ['Básico', '$50.000 por mes', 'Publicar stock, vender, reservar, cobrar y gestionar pedidos y devoluciones.'],
              ['PRO', '$100.000 por mes', 'Todo lo del Básico, más "Recomendado" y primero en búsquedas y directorio, logo y marca en la home y analítica de demanda.'],
            ],
          },
        },
        'Los precios están en pesos argentinos. La suscripción se cobra por Mercado Pago todos los meses. Si elegís un plan durante la prueba gratis, el primer cobro es el día en que termina la prueba.',
        'Podés cancelar la suscripción cuando quieras, sin penalidad, desde HomIA (Mi plan → Cancelar suscripción) o desde Mercado Pago → Suscripciones. Desde la cancelación no se te vuelve a cobrar. Lo ya pagado no se reintegra, pero conservás tu plan hasta el fin del período que pagaste.',
        'Si la suscripción se cancela o se pausa y termina el período pago, o pasan 35 días sin un cobro, el proveedor deja de aparecer en el marketplace, en las búsquedas, en el directorio y en la home, y no puede abrir ventas nuevas hasta que vuelva a suscribirse. Puede terminar las ventas, entregas, cobros y devoluciones que ya tenía; sus datos, stock, ventas y pedidos anteriores se conservan.',
        'Para clientes y profesionales usar HomIA es gratis.',
      ],
    },
    {
      id: 'obligaciones',
      titulo: '10. Si ofrecés servicios o vendés materiales',
      bloques: [
        {
          lista: [
            'Publicá precios, stock, fotos y descripciones reales y mantenelos al día.',
            'Cumplí lo que acordás: presupuestos, fechas, entregas y devoluciones.',
            'Contá con las habilitaciones, matrículas y seguros que tu actividad exige.',
            'Emití la factura fiscal que corresponda y cumplí tus obligaciones impositivas.',
            'Respondé los mensajes y las solicitudes en un tiempo razonable.',
          ],
        },
      ],
    },
    {
      id: 'resenas',
      titulo: '11. Reseñas',
      bloques: [
        'Solo pueden calificar quienes participaron de un proyecto finalizado o de una compra, una vez por cada caso. La reseña tiene estrellas, un comentario y, si querés, fotos. Los profesionales también pueden calificar al cliente.',
        'Las reseñas tienen que ser verdaderas y respetuosas. No se pueden comprar, ofrecer beneficios a cambio ni escribirse sobre uno mismo. Podemos quitar reseñas ofensivas, falsas, discriminatorias o que muestren datos personales de otros.',
      ],
    },
    {
      id: 'mensajes',
      titulo: '12. Mensajes y avisos',
      bloques: [
        'La conversación la inicia siempre quien busca un servicio o un producto. Los profesionales y proveedores no pueden escribirle primero a un cliente. Está prohibido usar el chat para publicidad no pedida, para pedir pagos por fuera de lo acordado o para acosar.',
        'Te mandamos avisos dentro de la plataforma y por email sobre tu actividad: ofertas, contrataciones, facturas, pedidos, pagos y devoluciones. Los emails de avisos se pueden apagar desde tu perfil. Los de seguridad, como recuperar la contraseña, llegan siempre.',
      ],
    },
    {
      id: 'homy',
      titulo: '13. Homy, el asistente con inteligencia artificial',
      bloques: [
        'Homy responde con datos reales de la plataforma: profesionales, proveedores, stock y precios publicados. Sus sugerencias son orientativas. Antes de contratar o comprar, revisá el perfil, las reseñas y el producto.',
        'Para que siga siendo gratis, Homy tiene un límite de uso: 8 consultas por día para visitantes y 60 para usuarios con cuenta.',
      ],
    },
    {
      id: 'prohibido',
      titulo: '14. Qué no está permitido',
      bloques: [
        {
          lista: [
            'Publicar información falsa o engañosa, o hacerse pasar por otra persona o comercio.',
            'Vender productos ilegales, robados, falsificados o peligrosos sin las advertencias que exige la ley.',
            'Subir contenido ofensivo, discriminatorio, violento, sexual o que infrinja derechos de otros.',
            'Usar datos de otros usuarios para algo distinto de la operación en curso.',
            'Automatizar el uso de la plataforma, copiar sus datos en forma masiva o intentar vulnerar su seguridad.',
            'Llevar por fuera de la plataforma el pago de operaciones iniciadas en HomIA para evitar el cargo de servicio.',
          ],
        },
      ],
    },
    {
      id: 'propiedad',
      titulo: '15. Contenido y propiedad intelectual',
      bloques: [
        'La marca HomIA, el diseño, el código y los textos de la plataforma son de HomIA.',
        'Las fotos y los textos que subís siguen siendo tuyos. Nos autorizás a mostrarlos dentro de HomIA mientras sean necesarios para el servicio. Asegurate de tener derecho a publicarlos.',
      ],
    },
    {
      id: 'responsabilidad',
      titulo: '16. Responsabilidad',
      bloques: [
        'Hacemos nuestro mejor esfuerzo para que la plataforma funcione bien y sin interrupciones, pero puede haber cortes o errores. Si pasa, lo arreglamos lo antes posible.',
        'HomIA no es responsable por los trabajos de los profesionales, por los productos de los proveedores ni por los acuerdos entre usuarios. Esto no limita los derechos que te da la Ley 24.240 de Defensa del Consumidor.',
      ],
    },
    {
      id: 'baja',
      titulo: '17. Dar de baja tu cuenta',
      bloques: [
        'Podés eliminar tu cuenta cuando quieras desde "Eliminar mi cuenta", al final de tu perfil. Si tenés proyectos, pedidos, cobros o devoluciones en curso, te mostramos cuáles tenés que cerrar primero para no perjudicar a la otra parte.',
        'Qué se borra y qué se conserva está explicado en la Política de Privacidad.',
      ],
    },
    {
      id: 'cambios',
      titulo: '18. Cambios en estos términos',
      bloques: [
        'Si cambiamos algo importante, te avisamos dentro de la plataforma antes de que empiece a regir. La fecha de vigencia siempre está arriba de esta página. Si seguís usando HomIA después del aviso, aceptás la nueva versión. Si no estás de acuerdo, podés dar de baja tu cuenta.',
      ],
    },
    {
      id: 'ley',
      titulo: '19. Ley aplicable y reclamos',
      bloques: [
        'Estos términos se rigen por las leyes de la República Argentina. Si tenés un problema, escribinos primero: la mayoría se resuelve rápido.',
        'Si sos consumidor, podés reclamar ante la autoridad de defensa del consumidor de tu jurisdicción. Son competentes los tribunales del domicilio del consumidor.',
      ],
    },
  ],
}

// ───────────────────────────── POLÍTICA DE PRIVACIDAD ─────────────────────────────

export const PRIVACIDAD: LegalDoc = {
  titulo: 'Política de Privacidad',
  bajada:
    'Qué datos tuyos usamos, para qué, quién los ve, dónde se guardan y cómo los borrás. Sin letra chica.',
  resumen: [
    'Usamos tus datos solo para que HomIA funcione: conectarte, gestionar tus operaciones, cuidar la seguridad y cumplir la ley.',
    'No vendemos tus datos. No usamos cookies de publicidad ni herramientas de seguimiento de terceros.',
    'Las fotos de tu DNI se guardan en un almacenamiento privado. Nadie más las ve: los demás solo ven si estás verificado o no.',
    'No guardamos datos de tarjetas. Los pagos los procesa Mercado Pago.',
    'Tu teléfono y la dirección de la obra los ve solo la otra parte de una operación, nunca el público.',
    'Podés ver, corregir y eliminar tus datos desde tu perfil, incluida la baja completa de la cuenta.',
  ],
  secciones: [
    {
      id: 'responsable',
      titulo: '1. Quién es responsable de tus datos',
      bloques: [
        'El responsable de la base de datos es el titular de HomIA, cuyo nombre, CUIT y email de contacto figuran al final de esta página. Esta política se rige por la Ley 25.326 de Protección de Datos Personales y sus normas complementarias.',
      ],
    },
    {
      id: 'datos',
      titulo: '2. Qué datos recopilamos',
      bloques: [
        {
          tabla: {
            columnas: ['Tipo de dato', 'Ejemplos', 'De dónde sale'],
            filas: [
              ['Cuenta', 'Nombre, apellido, email, celular, ciudad, contraseña (guardada cifrada, nunca en texto), roles, cómo nos conociste, fecha y versión de los términos aceptados, y cuándo confirmaste tu email', 'Lo cargás al registrarte'],
              ['Códigos de verificación', 'El código de 6 números que te mandamos por mail para confirmar tu email (guardado cifrado, vence a los 10 minutos) y la dirección IP desde la que se pidió, para frenar abusos', 'Se genera al registrarte o al verificar tu email'],
              ['Perfil', 'Foto, teléfono, fecha de nacimiento, dirección, ciudad, oficios, descripción, obras realizadas', 'Lo cargás vos'],
              ['Negocio (proveedor)', 'Razón social, CUIT, logo, tipo de comercio, stock y precios', 'Lo cargás vos'],
              ['Ubicación', 'Ubicación aproximada para buscar cerca', 'Solo si la compartís desde el navegador'],
              ['Identidad', 'Fotos del frente y dorso del DNI y el resultado del análisis', 'Solo si verificás tu identidad'],
              ['Actividad', 'Trabajos, ofertas, proyectos, fechas, facturas, pedidos, pagos, devoluciones, reseñas, mensajes y notificaciones', 'Se genera al usar HomIA'],
              ['Pagos', 'Número y estado de cada pago de Mercado Pago. Nunca datos de tarjetas', 'Mercado Pago'],
              ['Conexión con Mercado Pago', 'Credenciales para crear cobros a tu nombre', 'Solo si conectás tu cuenta para cobrar'],
              ['Asistente Homy', 'Tus preguntas, las respuestas y qué datos consultó', 'Se genera al usar Homy'],
              ['Búsquedas', 'Qué buscaste, para mejorar los resultados y la analítica agregada', 'Se genera al buscar'],
              ['Uso de la plataforma', 'Pantallas que visitás, botones que tocás, envíos que hacés (solo si salieron bien o no), tiempo de uso y dispositivo aproximado (celu o compu, navegador y sistema). Nunca lo que escribís en los formularios ni el contenido de tus mensajes', 'Se genera al usar HomIA, con un registro propio (sin herramientas de terceros)'],
              ['Técnicos', 'Una huella cifrada e irreversible de tu dirección IP, para limitar el uso gratuito de Homy', 'Tu conexión'],
            ],
          },
        },
      ],
    },
    {
      id: 'para-que',
      titulo: '3. Para qué los usamos',
      bloques: [
        {
          lista: [
            'Prestar el servicio: mostrar perfiles y productos, conectar a las partes, gestionar proyectos, fechas, pedidos, pagos, devoluciones y reseñas.',
            'Avisarte sobre tu actividad, dentro de la plataforma y por email.',
            'Cuidar a la comunidad: verificar identidades, prevenir fraudes y abusos y limitar el uso indebido.',
            'Cumplir obligaciones legales y fiscales y responder pedidos de autoridades.',
            'Mejorar HomIA con estadísticas de uso. La analítica del plan PRO usa datos agregados de demanda que no identifican a nadie.',
            'Medir cómo se usa la plataforma (qué pantallas y herramientas se usan, cuánto tiempo, dónde se traban las personas) para mejorarla. Ese registro de uso solo lo ve el equipo de HomIA; no se vende ni se comparte.',
          ],
        },
        'No usamos tus datos para publicidad de terceros ni para armar perfiles comerciales para vender.',
      ],
    },
    {
      id: 'quien-ve',
      titulo: '4. Quién ve cada dato',
      bloques: [
        {
          tabla: {
            columnas: ['Dato', 'Quién lo ve'],
            filas: [
              ['Nombre, foto, ciudad o zona, oficios, obras, reseñas e insignia de verificación', 'Usuarios de HomIA que entran a tu perfil de profesional o proveedor'],
              ['Días ocupados en tu calendario de profesional', 'Quien mira tu perfil, sin el título del trabajo, el cliente ni la dirección'],
              ['Stock, precios y datos del comercio', 'Todos, en el marketplace y en las búsquedas'],
              ['Teléfono, dirección de la obra y mensajes', 'Solo la otra parte de la conversación o de la operación'],
              ['Resumen de reputación del cliente', 'Profesionales y proveedores con los que operás, para que haya confianza de los dos lados'],
              ['Fotos del DNI', 'Solo vos y el sistema de verificación. Nunca otros usuarios'],
              ['Email, contraseña, fecha de nacimiento y datos de pago', 'Solo vos'],
            ],
          },
        },
        { nota: 'Las fotos que publicás en obras, reseñas, logos y devoluciones se guardan en un almacenamiento público: cualquiera que tenga el enlace puede verlas. No subas fotos con datos personales, documentos ni caras de otras personas sin su permiso.' },
      ],
    },
    {
      id: 'dni',
      titulo: '5. Tu DNI y la inteligencia artificial',
      bloques: [
        'Las fotos del DNI se guardan en un almacenamiento privado. Para mostrártelas, el sistema genera un enlace que vence a los 10 minutos y solo te lo da a vos.',
        'Para verificarlas, las imágenes se envían a OpenAI, que las analiza y devuelve un dictamen: si es un documento, si es legible, si parece real y si coincide con tus datos. Guardamos ese dictamen. Según las condiciones de OpenAI para su servicio por API, los datos enviados no se usan para entrenar sus modelos.',
        'Las fotos se usan solo para verificar tu identidad y se borran si eliminás tu cuenta.',
      ],
    },
    {
      id: 'homy',
      titulo: '6. Homy y la inteligencia artificial',
      bloques: [
        'Cuando le preguntás algo a Homy, tu pregunta y los datos públicos de la plataforma que hagan falta para responder se envían a OpenAI. No le mandamos tu DNI, tu contraseña ni datos de pago.',
        'Guardamos las conversaciones para mostrarte tu historial, controlar la calidad de las respuestas y prevenir abusos. Si sos visitante, no sabemos quién sos: solo guardamos la huella cifrada de tu IP para el límite diario.',
        'Si le pedís a Homy tus pendientes, usa tus datos de la plataforma solo para responderte a vos.',
      ],
    },
    {
      id: 'pagos',
      titulo: '7. Pagos y Mercado Pago',
      bloques: [
        'Los pagos los procesa Mercado Pago con sus propias condiciones y su política de privacidad. HomIA no ve ni guarda números de tarjeta: solo el número de operación, el monto y el estado.',
        'Si conectás tu cuenta de Mercado Pago para cobrar, Mercado Pago nos entrega credenciales para crear cobros a tu nombre. Las guardamos en nuestra base con acceso restringido, nunca se muestran en el navegador y podés desconectarlas cuando quieras desde Cobros.',
      ],
    },
    {
      id: 'terceros',
      titulo: '8. Con quién compartimos datos',
      bloques: [
        'Solo con las empresas que necesitamos para que HomIA funcione, y solo lo necesario para cada tarea:',
        {
          tabla: {
            columnas: ['Empresa', 'Para qué', 'Dónde procesa'],
            filas: [
              ['Supabase', 'Base de datos y almacenamiento de archivos', 'San Pablo, Brasil'],
              ['Vercel', 'Servidores donde corre la plataforma', 'San Pablo, Brasil, con red de distribución global'],
              ['Mercado Pago', 'Pagos, reembolsos y suscripciones', 'Argentina'],
              ['OpenAI', 'Asistente Homy, análisis de las fotos del DNI y descripción de materiales del catálogo', 'Estados Unidos'],
              ['Resend', 'Envío de emails de avisos y de recuperación de contraseña', 'Estados Unidos'],
            ],
          },
        },
        'Algunas de estas empresas procesan datos fuera de la Argentina. Las elegimos porque aplican medidas de seguridad reconocidas internacionalmente.',
        'También compartimos datos con autoridades cuando una ley o una orden judicial lo exige. No vendemos ni alquilamos tus datos.',
      ],
    },
    {
      id: 'cookies',
      titulo: '9. Cookies y datos en tu navegador',
      bloques: [
        'Usamos solo lo indispensable para que la plataforma funcione. No hay cookies de publicidad ni de analítica de terceros.',
        {
          tabla: {
            columnas: ['Nombre', 'Tipo', 'Para qué', 'Duración'],
            filas: [
              ['homy_session', 'Cookie segura, no accesible desde el código de la página', 'Mantener tu sesión iniciada', '30 días o hasta que cierres sesión'],
              ['homia_cart_v1', 'Almacenamiento local', 'Guardar el carrito de visitante hasta que ingreses', 'Hasta que lo vacíes o ingreses'],
              ['homy_geo_denied', 'Almacenamiento local', 'Recordar que no quisiste compartir tu ubicación', 'Hasta que borres los datos del navegador'],
              ['homy_dock_hint', 'Almacenamiento local', 'No volver a mostrarte la ayuda del botón de Homy', 'Hasta que borres los datos del navegador'],
              ['homia_anon_id', 'Almacenamiento local y cookie propia (no es de publicidad)', 'Un número al azar que identifica a este navegador para medir el uso de HomIA; al ingresar se vincula a tu cuenta', '1 año, o hasta que cierres sesión (se cambia por uno nuevo)'],
              ['homia_ses_v1', 'Almacenamiento local', 'Saber si seguís en la misma visita (se corta tras 30 minutos sin actividad)', 'Hasta que borres los datos del navegador'],
            ],
          },
        },
      ],
    },
    {
      id: 'emails',
      titulo: '10. Emails',
      bloques: [
        'Te escribimos por email para avisarte de tu actividad y por seguridad. No mandamos publicidad sin tu consentimiento. Los avisos se apagan desde tu perfil. Los emails de seguridad, como el de recuperar la contraseña, llegan siempre.',
      ],
    },
    {
      id: 'plazos',
      titulo: '11. Cuánto tiempo guardamos tus datos',
      bloques: [
        {
          tabla: {
            columnas: ['Dato', 'Cuánto tiempo'],
            filas: [
              ['Cuenta, perfil, mensajes y conversaciones con Homy', 'Mientras tengas la cuenta activa'],
              ['Fotos del DNI', 'Mientras tengas la cuenta. Se borran al eliminarla'],
              ['Facturas, pagos y pedidos', 'El tiempo que exigen las leyes fiscales y comerciales, aunque elimines la cuenta, sin tu nombre visible'],
              ['Reseñas que escribiste', 'Se conservan para no romper la reputación de otros, firmadas como "Usuario eliminado"'],
              ['Huella cifrada de IP para el límite de Homy', 'Se usa solo para el conteo del día'],
              ['Registro de uso de la plataforma (pantallas, botones, tiempo de uso)', 'El detalle, 13 meses; el resumen de cada visita (duración y cantidad de pantallas), mientras tengas la cuenta. Todo se borra al eliminar la cuenta'],
            ],
          },
        },
      ],
    },
    {
      id: 'eliminar',
      titulo: '12. Eliminar tu cuenta',
      bloques: [
        'Desde "Eliminar mi cuenta", al final de tu perfil, confirmás con tu contraseña. Si tenés operaciones en curso, te mostramos cuáles cerrar primero. Al eliminarla:',
        {
          lista: [
            'Se borran tu nombre, email, teléfono, dirección, fecha de nacimiento, foto y ubicación. En su lugar queda "Usuario eliminado".',
            'Se borran las fotos y los datos de tu DNI, tu carrito, tus favoritos, tus conversaciones con Homy, tus notificaciones y tu registro de uso de la plataforma.',
            'Tu perfil de profesional o de proveedor y tu stock dejan de verse.',
            'Se conservan, sin tu nombre, las facturas, pagos, pedidos cerrados y reseñas, por obligaciones legales y para no afectar el historial de las otras personas.',
            'Se cierra tu sesión y ya no se puede ingresar con esa cuenta.',
          ],
        },
      ],
    },
    {
      id: 'derechos',
      titulo: '13. Tus derechos',
      bloques: [
        {
          lista: [
            'Acceso: saber qué datos tuyos tenemos.',
            'Rectificación: corregirlos desde tu perfil o pidiéndonoslo.',
            'Supresión: eliminarlos con la baja de tu cuenta.',
            'Revocar tu consentimiento para los usos que no son necesarios para el servicio, como los emails de avisos.',
          ],
        },
        'Para ejercerlos escribinos al email de contacto de esta página. Te respondemos dentro de los plazos de la ley: 10 días corridos para el acceso y 5 días hábiles para la rectificación o la supresión.',
        { nota: 'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.' },
      ],
    },
    {
      id: 'seguridad',
      titulo: '14. Cómo protegemos tus datos',
      bloques: [
        {
          lista: [
            'Todas las conexiones van cifradas (HTTPS).',
            'Las contraseñas se guardan cifradas con un algoritmo que no permite recuperarlas.',
            'La sesión usa una cookie segura que el código de las páginas no puede leer.',
            'Cada pedido al servidor verifica que el dato sea tuyo o de una operación en la que participás.',
            'Hay límites contra intentos repetidos de ingreso, de registro y de subida de archivos.',
          ],
        },
        'Ningún sistema es infalible. Si detectamos un problema de seguridad que afecte tus datos, te avisamos y te decimos qué hacer.',
      ],
    },
    {
      id: 'menores',
      titulo: '15. Menores de edad',
      bloques: ['HomIA es para mayores de 18 años. Si sabemos que una cuenta es de un menor, la damos de baja.'],
    },
    {
      id: 'cambios',
      titulo: '16. Cambios en esta política',
      bloques: [
        'Si cambiamos esta política de forma importante, te avisamos dentro de la plataforma antes de que empiece a regir. La fecha de vigencia siempre está arriba de esta página.',
      ],
    },
  ],
}
