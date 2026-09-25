// Finanzas del profesional y del proveedor (D24, 25/09/2026): ÚNICA fuente de los
// tipos de movimiento, las categorías y el glosario. La usan el formulario de carga,
// los "¿Qué es esto?", la pestaña Aprendé, la Ayuda y Homy (conocimiento.ts).
// Regla: explicar en criollo, con un ejemplo de un plomero y de una ferretería. Los
// montos de los ejemplos son ilustrativos (dicho así en pantalla), nunca datos de nadie.
// No es asesoramiento impositivo: los impuestos se explican en general y se
// recomienda consultar a un contador; no se dan cifras de impuestos.

export type RolFinanzas = 'profesional' | 'proveedor'

export type TipoMovimiento =
  | 'costo_directo'
  | 'gasto'
  | 'inversion'
  | 'compra_mercaderia'
  | 'retiro'
  | 'aporte'
  | 'prestamo'
  | 'pago_prestamo'
  | 'otro_ingreso'

export const TIPOS_MOVIMIENTO: TipoMovimiento[] = [
  'otro_ingreso', 'costo_directo', 'compra_mercaderia', 'gasto', 'inversion', 'retiro', 'aporte', 'prestamo', 'pago_prestamo',
]

export const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]
export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mercadopago: 'Mercado Pago', otro: 'Otro',
}

export type InfoTipo = {
  id: TipoMovimiento
  nombre: string
  /** para qué sirve, en una línea */
  corto: string
  explicacion: string
  ejemploPlomero: string
  ejemploFerreteria: string
  /** qué le pasa a cada informe cuando cargás uno */
  enResultados: string
  enCaja: string
  enBalance: string
  roles: RolFinanzas[]
  /** true: la plata entra; false: la plata sale */
  entra: boolean
}

export const TIPOS: Record<TipoMovimiento, InfoTipo> = {
  otro_ingreso: {
    id: 'otro_ingreso',
    nombre: 'Ingreso por fuera de HomIA',
    corto: 'Trabajos o ventas que cobraste por fuera de la app.',
    explicacion:
      'Lo que HomIA registra solo (facturas y ventas de la app) es una parte de tu negocio. Si también trabajás o vendés por fuera, cargalo acá: sin eso, tus números muestran menos ventas de las que tenés y las decisiones salen torcidas.',
    ejemploPlomero: 'Un cliente de toda la vida te pagó $ 120.000 en efectivo por destapar una cloaca, sin pasar por HomIA.',
    ejemploFerreteria: 'Las ventas de mostrador del día que no pasaron por la app.',
    enResultados: 'Suma a tus ventas (renglón "Ventas por fuera de HomIA").',
    enCaja: 'Entra a la caja el día que lo cobrás. Si todavía te lo deben, marcalo "Me lo deben" y queda como cuenta por cobrar.',
    enBalance: 'Si te lo deben, es un activo (cuentas por cobrar).',
    roles: ['profesional', 'proveedor'],
    entra: true,
  },
  costo_directo: {
    id: 'costo_directo',
    nombre: 'Costo directo',
    corto: 'Lo que gastás PARA hacer cada trabajo o venta.',
    explicacion:
      'Es la plata que se va porque hiciste un trabajo o una venta en particular: si no hubiera trabajo, no lo gastarías. Sube y baja con las ventas. Restado de las ventas te da el margen bruto, que es lo que te queda para pagar los gastos fijos y ganar.',
    ejemploPlomero: 'Los caños y el pegamento que compraste para la obra de la calle Rivadavia, o el ayudante que te acompañó dos días.',
    ejemploFerreteria: 'El flete que pagaste para llevarle un pedido a un cliente.',
    enResultados: 'Resta de las ventas y forma el margen bruto.',
    enCaja: 'Sale de la caja el día que lo pagás (si lo dejás "A pagar", todavía no sale).',
    enBalance: 'Si todavía no lo pagaste, es una deuda (cuentas a pagar).',
    roles: ['profesional', 'proveedor'],
    entra: false,
  },
  compra_mercaderia: {
    id: 'compra_mercaderia',
    nombre: 'Compra de mercadería',
    corto: 'Lo que le comprás a tus distribuidores para vender.',
    explicacion:
      'La mercadería que comprás no es un gasto el día que la comprás: va a tu stock y se vuelve costo recién cuando la vendés (el "costo de lo vendido", que HomIA calcula con el costo que cargás en cada producto). Por eso esta compra baja tu caja pero no tu ganancia del mes.',
    ejemploPlomero: 'No aplica: los materiales para una obra son costo directo.',
    ejemploFerreteria: 'Le compraste al distribuidor 50 bolsas de cemento a $ 9.000 cada una: salen $ 450.000 de la caja, pero en el resultado cuentan recién a medida que vendés cada bolsa.',
    enResultados: 'No resta de golpe: resta el costo de cada producto cuando lo vendés.',
    enCaja: 'Sale de la caja el día que la pagás.',
    enBalance: 'Queda como inventario (el valor de tu stock al costo).',
    roles: ['proveedor'],
    entra: false,
  },
  gasto: {
    id: 'gasto',
    nombre: 'Gasto fijo u operativo',
    corto: 'Lo que pagás aunque no vendas nada.',
    explicacion:
      'Son los gastos de tener el negocio abierto: alquiler, luz, celular, sueldos, el contador, el monotributo. No dependen de cuánto vendas. Cuanto más bajos, antes cubrís el mes y empezás a ganar (eso es el punto de equilibrio).',
    ejemploPlomero: 'El abono del celular, la nafta de la camioneta, el monotributo del mes.',
    ejemploFerreteria: 'El alquiler del local, la luz, el sueldo del empleado de mostrador.',
    enResultados: 'Resta del margen bruto y forma el resultado operativo.',
    enCaja: 'Sale de la caja el día que lo pagás. Si es todos los meses, marcalo "Se repite todos los meses" y lo cargás una sola vez.',
    enBalance: 'Si todavía no lo pagaste, es una deuda (cuentas a pagar).',
    roles: ['profesional', 'proveedor'],
    entra: false,
  },
  inversion: {
    id: 'inversion',
    nombre: 'Inversión (bien que dura años)',
    corto: 'Herramientas, máquinas, vehículo: cosas que te sirven por años.',
    explicacion:
      'Una amoladora o una camioneta no se "gastan" en un mes: te sirven por años. Por eso en el resultado no restan todo de golpe: se reparten en cuotas mensuales durante su vida útil (eso se llama amortización). En la caja, en cambio, salen enteras el mes que las pagás. Así tu ganancia del mes no se hunde por una compra grande y tampoco te olvidás de que las herramientas se gastan.',
    ejemploPlomero: 'Compraste una termofusora de $ 360.000 que te va a durar 3 años (36 meses): cada mes tu resultado se lleva $ 10.000 de amortización.',
    ejemploFerreteria: 'Estanterías nuevas para el local por $ 1.200.000, con 10 años de vida útil: $ 10.000 por mes.',
    enResultados: 'Resta de a poco, como amortización mensual (monto ÷ meses de vida útil).',
    enCaja: 'Sale entera el mes que la pagás.',
    enBalance: 'Es un activo (bienes de uso) que vale lo que pagaste menos lo ya amortizado.',
    roles: ['profesional', 'proveedor'],
    entra: false,
  },
  retiro: {
    id: 'retiro',
    nombre: 'Retiro del dueño',
    corto: 'La plata que te llevás para vos.',
    explicacion:
      'Lo que sacás del negocio para tus gastos personales (tu "sueldo" de dueño, si no te lo pagás como sueldo). No es un gasto del negocio: por eso no baja la ganancia, pero sí baja la caja y lo que el negocio tiene. Separarlo te deja ver si el negocio gana de verdad o si te estás llevando más de lo que gana.',
    ejemploPlomero: 'Todos los viernes sacás $ 150.000 para la casa.',
    ejemploFerreteria: 'El dueño retira $ 800.000 a fin de mes.',
    enResultados: 'No aparece: no es un gasto del negocio.',
    enCaja: 'Sale de la caja.',
    enBalance: 'Baja el patrimonio (lo que el negocio es tuyo).',
    roles: ['profesional', 'proveedor'],
    entra: false,
  },
  aporte: {
    id: 'aporte',
    nombre: 'Aporte del dueño',
    corto: 'Plata tuya que ponés en el negocio.',
    explicacion:
      'Cuando ponés plata de tu bolsillo en el negocio (para comprar una herramienta o cubrir un mes flojo). No es una venta ni una ganancia: el negocio tiene más plata porque vos la pusiste.',
    ejemploPlomero: 'Pusiste $ 300.000 de tus ahorros para arrancar.',
    ejemploFerreteria: 'El dueño pone $ 2.000.000 para ampliar el stock.',
    enResultados: 'No aparece: no es una venta.',
    enCaja: 'Entra a la caja.',
    enBalance: 'Sube el patrimonio.',
    roles: ['profesional', 'proveedor'],
    entra: true,
  },
  prestamo: {
    id: 'prestamo',
    nombre: 'Préstamo recibido',
    corto: 'Plata que te prestaron (banco, familiar, financiera).',
    explicacion:
      'Entra plata a la caja, pero no es ganancia: la tenés que devolver. Por eso queda como deuda en el balance hasta que la pagues.',
    ejemploPlomero: 'El banco te prestó $ 1.000.000 para la camioneta.',
    ejemploFerreteria: 'Un crédito de $ 5.000.000 para comprar mercadería de temporada.',
    enResultados: 'No aparece: no es una venta.',
    enCaja: 'Entra a la caja.',
    enBalance: 'Es una deuda (préstamos pendientes).',
    roles: ['profesional', 'proveedor'],
    entra: true,
  },
  pago_prestamo: {
    id: 'pago_prestamo',
    nombre: 'Pago de préstamo (cuota)',
    corto: 'La cuota que pagás de un préstamo.',
    explicacion:
      'Cada cuota tiene dos partes: el capital (lo que devolvés de lo que te prestaron, que baja la deuda) y los intereses (lo que te cobran por prestarte, que sí es un gasto: el gasto financiero). Cargá el total de la cuota y cuánto de eso es interés; si no lo sabés, fijate en el resumen del banco.',
    ejemploPlomero: 'Pagaste una cuota de $ 110.000: $ 80.000 de capital y $ 30.000 de intereses.',
    ejemploFerreteria: 'Cuota del crédito: $ 600.000, de los cuales $ 150.000 son intereses.',
    enResultados: 'Solo los intereses restan (renglón "Intereses").',
    enCaja: 'Sale la cuota entera.',
    enBalance: 'El capital baja la deuda del préstamo.',
    roles: ['profesional', 'proveedor'],
    entra: false,
  },
}

export type Categoria = {
  id: string
  tipo: TipoMovimiento
  nombre: string
  explicacion: string
  ejemplos: string
  roles: RolFinanzas[]
  /** vida útil sugerida en meses (solo inversiones; orientativa y editable) */
  vidaUtilMeses?: number
  /** se suele repetir todos los meses */
  recurrente?: boolean
}

const AMBOS: RolFinanzas[] = ['profesional', 'proveedor']

export const CATEGORIAS: Categoria[] = [
  // ── ingresos por fuera de HomIA ──
  { id: 'trabajos_fuera', tipo: 'otro_ingreso', nombre: 'Trabajos por fuera de HomIA', roles: ['profesional'],
    explicacion: 'Trabajos que hiciste y cobraste sin pasar por la app.', ejemplos: 'Un arreglo para un vecino, un cliente viejo que te llamó directo.' },
  { id: 'ventas_fuera', tipo: 'otro_ingreso', nombre: 'Ventas por fuera de HomIA', roles: ['proveedor'],
    explicacion: 'Ventas de mostrador, por teléfono o por otras apps.', ejemplos: 'La caja del mostrador del día, un pedido por WhatsApp.' },
  { id: 'otros_ingresos', tipo: 'otro_ingreso', nombre: 'Otros ingresos del negocio', roles: AMBOS,
    explicacion: 'Plata que entra al negocio y no es un trabajo ni una venta de mercadería.', ejemplos: 'La venta de una herramienta vieja, un reintegro.' },

  // ── costos directos ──
  { id: 'materiales_obra', tipo: 'costo_directo', nombre: 'Materiales para obras', roles: ['profesional'],
    explicacion: 'Los materiales que compraste para un trabajo en particular (fuera de HomIA: lo que compraste en la app ya aparece solo).', ejemplos: 'Caños, cables, pintura, pegamento para una obra.' },
  { id: 'ayudantes', tipo: 'costo_directo', nombre: 'Ayudantes por trabajo', roles: AMBOS,
    explicacion: 'Lo que le pagás a alguien por ayudarte en un trabajo o una entrega puntual (no un sueldo fijo).', ejemplos: 'Un ayudante por dos días de obra, un changarín para descargar un camión.' },
  { id: 'subcontratos', tipo: 'costo_directo', nombre: 'Subcontratos', roles: ['profesional'],
    explicacion: 'Otro profesional que contrataste para una parte del trabajo (si lo contrataste por HomIA desde tu proyecto, ya aparece solo).', ejemplos: 'Un gasista matriculado para la conexión final.' },
  { id: 'fletes', tipo: 'costo_directo', nombre: 'Fletes y envíos', roles: AMBOS,
    explicacion: 'Lo que pagás para llevar materiales o mercadería a un trabajo o a un cliente.', ejemplos: 'Un flete para llevar los materiales a la obra, el envío de un pedido.' },
  { id: 'alquiler_maquinas', tipo: 'costo_directo', nombre: 'Alquiler de máquinas para un trabajo', roles: AMBOS,
    explicacion: 'Máquinas o equipos que alquilás solo para un trabajo.', ejemplos: 'Un andamio, una hidrolavadora o un martillo demoledor por unos días.' },
  { id: 'embalajes', tipo: 'costo_directo', nombre: 'Embalajes y bolsas', roles: ['proveedor'],
    explicacion: 'Lo que usás para entregar cada venta.', ejemplos: 'Bolsas, film, cajas, cinta.' },
  { id: 'otros_costos', tipo: 'costo_directo', nombre: 'Otros costos directos', roles: AMBOS,
    explicacion: 'Cualquier otro gasto que hiciste por un trabajo o una venta en particular.', ejemplos: 'Un permiso para una obra puntual.' },

  // ── compra de mercadería (proveedor) ──
  { id: 'mercaderia', tipo: 'compra_mercaderia', nombre: 'Mercadería para vender', roles: ['proveedor'],
    explicacion: 'Lo que le comprás a tus distribuidores para reponer stock. Va a tu stock y se vuelve costo cuando lo vendés.', ejemplos: 'Bolsas de cemento, caños, pintura para reponer.' },

  // ── gastos fijos / operativos ──
  { id: 'alquiler', tipo: 'gasto', nombre: 'Alquiler de local, taller o depósito', roles: AMBOS, recurrente: true,
    explicacion: 'Lo que pagás por el lugar donde trabajás o guardás cosas.', ejemplos: 'El alquiler del local, de una baulera o de un taller.' },
  { id: 'servicios', tipo: 'gasto', nombre: 'Luz, gas y agua', roles: AMBOS, recurrente: true,
    explicacion: 'Los servicios del lugar de trabajo.', ejemplos: 'Las boletas de luz, gas y agua del local.' },
  { id: 'internet_celular', tipo: 'gasto', nombre: 'Internet y celular', roles: AMBOS, recurrente: true,
    explicacion: 'El abono del celular y la conexión que usás para trabajar.', ejemplos: 'El plan del celular, el wifi del local.' },
  { id: 'sueldos', tipo: 'gasto', nombre: 'Sueldos y cargas sociales', roles: AMBOS, recurrente: true,
    explicacion: 'Lo que les pagás todos los meses a tus empleados, con sus aportes y contribuciones.', ejemplos: 'El sueldo del empleado de mostrador, un ayudante fijo.' },
  { id: 'combustible', tipo: 'gasto', nombre: 'Combustible y movilidad', roles: AMBOS, recurrente: true,
    explicacion: 'Nafta, gasoil, peajes, estacionamiento, colectivos para ir a los trabajos.', ejemplos: 'La carga de nafta de la semana, los peajes.' },
  { id: 'herramientas_menores', tipo: 'gasto', nombre: 'Herramientas menores y consumibles', roles: AMBOS,
    explicacion: 'Cosas chicas que se gastan rápido (menos de un año).', ejemplos: 'Mechas, discos de corte, guantes, cinta de teflón, lijas.' },
  { id: 'publicidad', tipo: 'gasto', nombre: 'Publicidad', roles: AMBOS,
    explicacion: 'Lo que pagás para que te conozcan.', ejemplos: 'Anuncios en redes, tarjetas, un cartel, volantes.' },
  { id: 'contador', tipo: 'gasto', nombre: 'Contador y honorarios', roles: AMBOS, recurrente: true,
    explicacion: 'Profesionales que te asesoran: contador, abogado, gestor.', ejemplos: 'El abono mensual del contador.' },
  { id: 'seguros', tipo: 'gasto', nombre: 'Seguros', roles: AMBOS, recurrente: true,
    explicacion: 'Seguros del negocio, del vehículo de trabajo, de accidentes personales o de responsabilidad civil.', ejemplos: 'La cuota del seguro de la camioneta, el seguro del local.' },
  { id: 'comisiones', tipo: 'gasto', nombre: 'Comisiones bancarias y de Mercado Pago', roles: AMBOS,
    explicacion: 'Lo que te descuentan el banco o Mercado Pago por cobrar o mantener la cuenta. HomIA no recibe ese dato de Mercado Pago, así que no lo calcula solo: copialo de tu resumen o de la actividad de tu cuenta de Mercado Pago.', ejemplos: 'La comisión que Mercado Pago descontó de tus cobros del mes, el mantenimiento de la cuenta bancaria.' },
  { id: 'suscripcion_homia', tipo: 'gasto', nombre: 'Suscripción de HomIA', roles: ['proveedor'], recurrente: true,
    explicacion: 'Tu plan Básico o PRO de HomIA, que pagás todos los meses por Mercado Pago.', ejemplos: 'El plan Básico o PRO del mes.' },
  { id: 'impuestos', tipo: 'gasto', nombre: 'Impuestos del negocio (monotributo, IIBB)', roles: AMBOS, recurrente: true,
    explicacion: 'Los impuestos que paga tu actividad, como la cuota del monotributo o Ingresos Brutos. Cuánto te toca depende de tu categoría, tu provincia y tu actividad: consultalo con un contador.', ejemplos: 'La cuota del monotributo del mes, el anticipo de Ingresos Brutos.' },
  { id: 'mantenimiento_vehiculo', tipo: 'gasto', nombre: 'Mantenimiento del vehículo', roles: AMBOS,
    explicacion: 'Service, cubiertas, arreglos y patente del vehículo con el que trabajás.', ejemplos: 'El service de la camioneta, dos cubiertas nuevas, la patente.' },
  { id: 'capacitacion', tipo: 'gasto', nombre: 'Capacitaciones y matrícula', roles: AMBOS,
    explicacion: 'Cursos, matrículas y habilitaciones para tu oficio o tu comercio.', ejemplos: 'La matrícula de gasista, un curso de termofusión.' },
  { id: 'otros_gastos', tipo: 'gasto', nombre: 'Otros gastos', roles: AMBOS,
    explicacion: 'Cualquier gasto del negocio que no entra en las otras categorías.', ejemplos: 'Artículos de limpieza del local, papelería.' },

  // ── inversiones (vida útil orientativa: usos habituales, editable) ──
  { id: 'herramientas_electricas', tipo: 'inversion', nombre: 'Herramientas eléctricas', roles: AMBOS, vidaUtilMeses: 36,
    explicacion: 'Herramientas que te duran varios años.', ejemplos: 'Taladro percutor, amoladora, termofusora, sonda destapadora.' },
  { id: 'maquinaria', tipo: 'inversion', nombre: 'Maquinaria y equipos', roles: AMBOS, vidaUtilMeses: 60,
    explicacion: 'Máquinas grandes o equipos de trabajo.', ejemplos: 'Hormigonera, compresor, generador, cortadora de caños.' },
  { id: 'vehiculo', tipo: 'inversion', nombre: 'Vehículo de trabajo', roles: AMBOS, vidaUtilMeses: 60,
    explicacion: 'El auto, la camioneta, la moto o el utilitario con el que trabajás.', ejemplos: 'Una camioneta, un utilitario para repartir.' },
  { id: 'computacion', tipo: 'inversion', nombre: 'Computadora y celular', roles: AMBOS, vidaUtilMeses: 36,
    explicacion: 'Equipos para gestionar el negocio.', ejemplos: 'Una notebook, el celular de trabajo, una impresora.' },
  { id: 'mobiliario', tipo: 'inversion', nombre: 'Estanterías y mobiliario', roles: AMBOS, vidaUtilMeses: 120,
    explicacion: 'Muebles del local o del taller.', ejemplos: 'Estanterías, mostrador, bancos de trabajo.' },
  { id: 'mejoras_local', tipo: 'inversion', nombre: 'Mejoras del local', roles: AMBOS, vidaUtilMeses: 60,
    explicacion: 'Obras para mejorar el lugar donde trabajás.', ejemplos: 'Un cartel luminoso, pintar y reformar el local, una persiana nueva.' },
  { id: 'otras_inversiones', tipo: 'inversion', nombre: 'Otras inversiones', roles: AMBOS, vidaUtilMeses: 36,
    explicacion: 'Cualquier otra cosa que te sirva más de un año.', ejemplos: 'Un software que pagás de una vez, una balanza.' },

  // ── dueño y préstamos ──
  { id: 'retiro_dueno', tipo: 'retiro', nombre: 'Retiro del dueño', roles: AMBOS,
    explicacion: 'Plata que sacás del negocio para vos.', ejemplos: 'Lo que llevás a tu casa cada semana.' },
  { id: 'aporte_dueno', tipo: 'aporte', nombre: 'Aporte del dueño', roles: AMBOS,
    explicacion: 'Plata tuya que ponés en el negocio.', ejemplos: 'Tus ahorros para comprar una herramienta.' },
  { id: 'prestamo_banco', tipo: 'prestamo', nombre: 'Préstamo de banco o financiera', roles: AMBOS,
    explicacion: 'Un crédito de un banco, una financiera o Mercado Pago.', ejemplos: 'Un préstamo personal para la camioneta.' },
  { id: 'prestamo_familiar', tipo: 'prestamo', nombre: 'Préstamo de un familiar o conocido', roles: AMBOS,
    explicacion: 'Plata que te prestó alguien y le tenés que devolver.', ejemplos: 'Tu hermano te prestó para arrancar.' },
  { id: 'cuota_prestamo', tipo: 'pago_prestamo', nombre: 'Cuota de un préstamo', roles: AMBOS,
    explicacion: 'Lo que pagás cada mes de un préstamo. Separá cuánto es interés.', ejemplos: 'La cuota del crédito del banco.' },
]

export function categoriasDe(rol: RolFinanzas, tipo?: TipoMovimiento): Categoria[] {
  return CATEGORIAS.filter((c) => c.roles.includes(rol) && (!tipo || c.tipo === tipo))
}
export function tiposDe(rol: RolFinanzas): TipoMovimiento[] {
  return TIPOS_MOVIMIENTO.filter((t) => TIPOS[t].roles.includes(rol))
}
export function categoria(id: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.id === id)
}
export function nombreCategoria(id: string): string {
  return categoria(id)?.nombre || AUTO_CATEGORIAS[id] || id
}

/** Categorías de lo que viene solo de HomIA (no se cargan a mano). */
export const AUTO_CATEGORIAS: Record<string, string> = {
  factura: 'Factura de HomIA',
  cobro: 'Venta de HomIA',
  devolucion_venta: 'Devolución de sobrantes',
  compra_homia: 'Materiales comprados en HomIA',
  subcontrato_homia: 'Subcontrato por HomIA',
  reintegro: 'Reintegro de sobrantes',
  amortizacion: 'Amortización',
}

/** Gastos fijos que el primer uso guiado sugiere revisar, por rol (sin montos: los pone el usuario). */
export const GASTOS_SUGERIDOS: Record<RolFinanzas, string[]> = {
  profesional: ['internet_celular', 'combustible', 'impuestos', 'seguros', 'herramientas_menores', 'publicidad', 'contador'],
  proveedor: ['alquiler', 'servicios', 'sueldos', 'internet_celular', 'impuestos', 'contador', 'seguros'],
}

// ─────────────────────────── Glosario (Aprendé, "¿Qué es esto?", Homy) ───────────────────────────

export type Concepto = {
  id: string
  nombre: string
  queEs: string
  comoSeCalcula?: string
  ejemploPlomero?: string
  ejemploFerreteria?: string
  /** cómo leerlo y qué hacer si está mal (sin inventar valores de referencia) */
  queHacer?: string
}

export const GLOSARIO: Concepto[] = [
  {
    id: 'facturado_cobrado', nombre: 'Facturado y cobrado',
    queEs: 'Facturado es lo que ya vendiste (emitiste la factura o el cliente confirmó la compra), aunque todavía no te lo hayan pagado. Cobrado es la plata que ya entró. El estado de resultados usa lo facturado (lo que ganaste por el trabajo hecho); la caja usa lo cobrado (la plata que tenés).',
    ejemploPlomero: 'Terminaste una obra el 28 y emitiste la factura por $ 500.000: ese mes facturaste $ 500.000. Si el cliente te paga el 3 del mes siguiente, lo cobraste ese otro mes.',
    ejemploFerreteria: 'Un cliente confirmó una compra de $ 80.000 y paga al retirar: la venta ya está facturada; entra a la caja cuando paga.',
  },
  {
    id: 'ventas_brutas', nombre: 'Ventas brutas',
    queEs: 'Todo lo que facturaste en el período: lo de HomIA (automático) más lo que cargaste por fuera.',
    comoSeCalcula: 'Facturas o ventas de HomIA emitidas en el período + ingresos por fuera de HomIA.',
  },
  {
    id: 'devoluciones', nombre: 'Devoluciones',
    queEs: 'Lo que devolviste a clientes por sobrantes de materiales. Se resta automáticamente el mes en que hiciste el reembolso.',
    comoSeCalcula: 'Suma de los reembolsos de sobrantes que hiciste en el período.',
  },
  {
    id: 'ventas_netas', nombre: 'Ventas netas',
    queEs: 'Lo que vendiste de verdad: las ventas menos las devoluciones.',
    comoSeCalcula: 'Ventas brutas − devoluciones.',
  },
  {
    id: 'costo_directo', nombre: 'Costo directo',
    queEs: 'Lo que gastaste para hacer esos trabajos o esas ventas: materiales de obra, ayudantes, fletes, y en un comercio el costo de la mercadería que vendiste.',
    comoSeCalcula: 'Costos directos cargados + materiales comprados en HomIA + subcontratos de HomIA − reintegros de sobrantes (+ costo de la mercadería vendida, en el proveedor).',
    ejemploPlomero: 'En una obra de $ 500.000 usaste $ 180.000 de materiales y $ 60.000 de ayudante: costo directo $ 240.000.',
    ejemploFerreteria: 'Vendiste 10 bolsas de cemento que te costaron $ 9.000 cada una: costo de lo vendido $ 90.000.',
  },
  {
    id: 'margen_bruto', nombre: 'Margen bruto',
    queEs: 'Lo que te queda de las ventas después de pagar lo que cuesta hacerlas. Con esto pagás los gastos fijos y lo que sobra es ganancia.',
    comoSeCalcula: 'Ventas netas − costo directo. El % es margen bruto ÷ ventas netas.',
    ejemploPlomero: '$ 500.000 − $ 240.000 = $ 260.000 (52%).',
    ejemploFerreteria: '$ 130.000 de ventas − $ 90.000 de costo = $ 40.000 (31%).',
    queHacer: 'Si es bajo o baja mes a mes: revisá tus precios (¿los actualizaste con la inflación?), cuánto pagás los materiales o la mercadería y si estás regalando horas de trabajo. Comparalo con tus propios meses anteriores.',
  },
  {
    id: 'gastos_fijos', nombre: 'Gastos fijos u operativos',
    queEs: 'Lo que pagás aunque no vendas: alquiler, servicios, celular, sueldos, contador, impuestos.',
    comoSeCalcula: 'Suma de los gastos cargados en el período (los que se repiten todos los meses se cuentan solos cada mes).',
    queHacer: 'Revisalos cada tanto: un abono que no usás o un servicio caro se come tu ganancia todos los meses.',
  },
  {
    id: 'resultado_operativo', nombre: 'Resultado operativo',
    queEs: 'Lo que gana (o pierde) el negocio con su actividad del día a día, antes de amortizaciones e intereses. Es una versión simplificada de lo que los contadores llaman EBITDA.',
    comoSeCalcula: 'Margen bruto − gastos fijos.',
  },
  {
    id: 'amortizacion', nombre: 'Amortización',
    queEs: 'La parte de tus inversiones (herramientas, máquinas, vehículo) que "se gasta" cada mes. Así la compra grande se reparte en los meses que la usás.',
    comoSeCalcula: 'Monto de la inversión ÷ meses de vida útil, cada mes desde que la compraste hasta que termina su vida útil.',
    ejemploPlomero: 'Termofusora de $ 360.000 con 36 meses de vida útil: $ 10.000 por mes.',
    ejemploFerreteria: 'Estanterías de $ 1.200.000 con 120 meses: $ 10.000 por mes.',
    queHacer: 'La vida útil que sugerimos es orientativa: si sabés que algo te dura más o menos, cambiala al cargarla.',
  },
  {
    id: 'intereses', nombre: 'Intereses',
    queEs: 'Lo que pagás por usar plata prestada. Es un gasto (el gasto financiero). El capital que devolvés no es gasto: baja tu deuda.',
    comoSeCalcula: 'Suma de la parte de interés de las cuotas pagadas en el período.',
  },
  {
    id: 'resultado_neto', nombre: 'Resultado neto (ganancia o pérdida)',
    queEs: 'Lo que realmente ganó el negocio en el período, después de todo. Si es negativo, perdió plata.',
    comoSeCalcula: 'Resultado operativo − amortizaciones − intereses. El margen neto % es resultado neto ÷ ventas netas.',
    queHacer: 'Si es negativo varios meses seguidos: subí precios, bajá gastos fijos o vendé más (mirá el punto de equilibrio). Si es positivo pero tu caja no crece, mirá tus retiros y tus facturas sin cobrar.',
  },
  {
    id: 'retiros', nombre: 'Retiros del dueño',
    queEs: 'La plata que te llevás para vos. No es un gasto del negocio (no baja la ganancia) pero sí baja la caja y el patrimonio.',
    queHacer: 'Si retirás más de lo que gana el negocio, lo estás achicando: la diferencia sale de la caja o de deuda.',
  },
  {
    id: 'caja', nombre: 'Caja (flujo de fondos)',
    queEs: 'La plata que tenés disponible para el negocio: efectivo, banco y Mercado Pago. No es lo mismo que la ganancia: podés ganar y no tener plata (porque te deben facturas o compraste mercadería) o tener plata y estar perdiendo (porque te prestaron).',
    comoSeCalcula: 'Saldo inicial + lo cobrado + aportes + préstamos − gastos pagados − inversiones − retiros − cuotas de préstamos.',
  },
  {
    id: 'saldo_inicial', nombre: 'Saldo inicial de caja',
    queEs: 'La plata que tenía el negocio el día que empezaste a usar Finanzas (sumá efectivo, banco y Mercado Pago de trabajo). Se carga una sola vez y desde ahí HomIA estima la caja con tus movimientos.',
  },
  {
    id: 'cuentas_cobrar', nombre: 'Cuentas por cobrar',
    queEs: 'Lo que te deben: facturas y ventas emitidas que todavía no te pagaron, más los ingresos por fuera que marcaste "Me lo deben".',
    queHacer: 'Cuanto más tiempo pasa, más difícil es cobrar y más pierde valor la plata. Mandá recordatorios a los que llevan más de 15 días.',
  },
  {
    id: 'cuentas_pagar', nombre: 'Cuentas a pagar',
    queEs: 'Lo que debés a proveedores y servicios: los gastos que cargaste como "A pagar".',
  },
  {
    id: 'inventario', nombre: 'Inventario (stock al costo)',
    queEs: 'Lo que vale tu mercadería, calculado con lo que te costó (no con el precio de venta).',
    comoSeCalcula: 'Cantidad en stock × costo de cada producto. Si no cargaste el costo, se usa tu margen estimado (y se marca como estimación) o queda sin dato.',
  },
  {
    id: 'bienes_uso', nombre: 'Bienes de uso',
    queEs: 'Tus herramientas, máquinas, vehículo y muebles, valuados por lo que pagaste menos lo que ya se amortizó.',
  },
  {
    id: 'pasivo', nombre: 'Pasivo (lo que debés)',
    queEs: 'Todas tus deudas: préstamos pendientes y cuentas a pagar.',
  },
  {
    id: 'patrimonio', nombre: 'Patrimonio neto',
    queEs: 'Lo que el negocio es realmente tuyo: lo que tenés menos lo que debés.',
    comoSeCalcula: 'Activos (caja + cuentas por cobrar + inventario + bienes de uso) − pasivos (préstamos + cuentas a pagar).',
    queHacer: 'Si crece mes a mes, el negocio se está haciendo más grande. Si baja, estás retirando más de lo que gana o estás perdiendo.',
  },
  {
    id: 'punto_equilibrio', nombre: 'Punto de equilibrio',
    queEs: 'Cuánto tenés que vender por mes para no perder: con eso cubrís los costos fijos y el resultado da cero. Lo que vendas arriba de eso es ganancia.',
    comoSeCalcula: 'Costos fijos del mes (gastos fijos + amortizaciones + intereses) ÷ margen bruto %. Usa el margen del período que estás mirando.',
    ejemploPlomero: 'Gastos fijos de $ 400.000 por mes y un margen bruto del 50%: necesitás vender $ 800.000 por mes.',
    ejemploFerreteria: 'Gastos fijos de $ 3.000.000 y margen del 30%: necesitás vender $ 10.000.000 por mes.',
    queHacer: 'Si vendés menos que el punto de equilibrio: subí el margen (precios, costos) o bajá gastos fijos; vender más también ayuda.',
  },
  {
    id: 'ticket_promedio', nombre: 'Ticket promedio',
    queEs: 'Cuánto te deja, en promedio, cada trabajo o cada venta.',
    comoSeCalcula: 'Ventas brutas ÷ cantidad de facturas o ventas.',
    queHacer: 'Subirlo (ofrecer un servicio extra, vender el combo completo) suele costar menos que conseguir clientes nuevos.',
  },
  {
    id: 'dias_cobro', nombre: 'Días promedio de cobro',
    queEs: 'Cuántos días pasan, en promedio, entre que facturás y que te pagan.',
    comoSeCalcula: 'Promedio de días entre la emisión y el cobro de lo que cobraste en el período.',
    queHacer: 'Cuanto más bajo, mejor para tu caja. Si sube, ofrecé Mercado Pago (le llega al cliente al instante) y reclamá antes.',
  },
  {
    id: 'meses_supervivencia', nombre: 'Meses de supervivencia',
    queEs: 'Cuántos meses podría pagar el negocio sus gastos fijos con la caja que tiene, si no entrara ni un peso.',
    comoSeCalcula: 'Caja estimada de hoy ÷ promedio mensual de gastos fijos e intereses de los últimos 3 meses.',
    queHacer: 'Es tu colchón. Muchos asesores recomiendan un colchón de entre 3 y 6 meses de gastos (es una referencia orientativa, no una regla): si tenés menos, cuidá la caja antes de invertir.',
  },
  {
    id: 'crecimiento', nombre: 'Crecimiento mes a mes',
    queEs: 'Cuánto crecieron (o bajaron) tus ventas netas este mes contra el mes anterior.',
    comoSeCalcula: '(Ventas netas de este mes − las del mes anterior) ÷ las del mes anterior.',
    queHacer: 'Mirá la tendencia de varios meses, no un mes suelto: hay meses flojos por temporada. Con inflación, crecer en pesos no siempre es crecer de verdad.',
  },
  {
    id: 'rentabilidad_obra', nombre: 'Rentabilidad por obra',
    queEs: 'Cuánto te dejó cada obra: lo que facturaste menos los costos que le asignaste (materiales comprados en HomIA asignados a esa obra, subcontratos y lo que cargaste a mano eligiendo la obra).',
    comoSeCalcula: 'Facturado de la obra − devoluciones − costos asignados. El % es la ganancia ÷ lo facturado.',
    queHacer: 'Si un tipo de trabajo siempre deja poco, revisá cómo lo presupuestás o dejá de tomarlo.',
  },
  {
    id: 'tasa_aceptacion', nombre: 'Tasa de aceptación de presupuestos',
    queEs: 'De cada 10 presupuestos que mandás en la bolsa de trabajos, cuántos te aceptan.',
    comoSeCalcula: 'Ofertas aceptadas ÷ ofertas enviadas en el período (sin contar las que retiraste).',
    queHacer: 'Si es baja, revisá precio, plazo y cómo explicás tu oferta; si es muy alta, quizás estás cobrando poco.',
  },
  {
    id: 'rotacion_stock', nombre: 'Días de stock (rotación)',
    queEs: 'Para cuántos días de ventas te alcanza la mercadería que tenés. Mucho stock quieto es plata parada.',
    comoSeCalcula: 'Inventario al costo ÷ costo de lo vendido por día en el período.',
    queHacer: 'Si un producto tiene muchos días de stock, comprá menos de eso y usá la plata en lo que rota más.',
  },
  {
    id: 'top_productos', nombre: 'Productos que más ganancia dejan',
    queEs: 'Los productos que más ganancia te dejaron en el período (lo vendido menos lo que te costó).',
    queHacer: 'Cuidá que nunca te falte stock de esos y no los regales con descuentos.',
  },
  {
    id: 'clientes_recurrentes', nombre: 'Clientes recurrentes',
    queEs: 'De los clientes que te compraron o contrataron en el período, qué parte lo hizo dos veces o más en HomIA (contando también las veces anteriores).',
    queHacer: 'Un cliente que vuelve cuesta mucho menos que uno nuevo: pedí reseñas y mantené el contacto.',
  },
  {
    id: 'cargo_servicio', nombre: 'Cargo de servicio HomIA (1%)',
    queEs: 'Cuando un cliente te paga por Mercado Pago, paga aparte un cargo de servicio del 1% para HomIA. A vos te pagan el 100% de tu precio (Mercado Pago te descuenta su comisión aparte, en tu cuenta de Mercado Pago). Por eso el 1% no es ni un ingreso ni un gasto tuyo, y no aparece en tus finanzas.',
  },
  {
    id: 'comisiones_mp', nombre: 'Comisiones de Mercado Pago',
    queEs: 'Mercado Pago le cobra al vendedor una comisión por cada cobro, según tu cuenta y el plazo en que liberás la plata. HomIA no recibe ese dato (solo sabe cuánto pagó el cliente), así que no lo inventa: copiá lo que te descontaron desde la actividad de tu cuenta de Mercado Pago y cargalo como gasto en "Comisiones bancarias y de Mercado Pago".',
  },
  {
    id: 'impuestos', nombre: 'Impuestos: monotributo, Ingresos Brutos e IVA',
    queEs: 'Monotributo: un régimen simplificado nacional con una cuota mensual fija según tu categoría (junta impuesto, jubilación y obra social). Ingresos Brutos: un impuesto de cada provincia sobre lo que facturás; en muchas provincias los monotributistas pagan un monto fijo simplificado. IVA: si sos Responsable Inscripto, una parte de lo que te pagan es IVA que después le pagás al fisco (descontando el IVA de tus compras): esa parte no es ganancia tuya.',
    queHacer: 'HomIA no calcula impuestos ni sabe tu situación fiscal: cargá lo que pagás como gasto "Impuestos del negocio" y consultá a un contador para saber qué te corresponde. Esto no es asesoramiento impositivo.',
  },
]

export function concepto(id: string): Concepto | undefined {
  return GLOSARIO.find((c) => c.id === id)
}

/** Las 4 preguntas que ordena la pestaña Aprendé. */
export const GUIA: { titulo: string; texto: string }[] = [
  {
    titulo: '¿Estoy ganando plata? → Resultados',
    texto: 'El estado de resultados cuenta lo que vendiste y todo lo que te costó venderlo en el período. Leelo de arriba abajo: ventas, menos devoluciones, menos lo que cuesta cada trabajo (margen bruto), menos lo que pagás todos los meses (resultado operativo), menos lo que se gastan tus herramientas y los intereses: abajo de todo, tu ganancia o pérdida real.',
  },
  {
    titulo: '¿Tengo plata? → Caja',
    texto: 'La caja muestra la plata que entra y sale de verdad, el día que entra y sale. Ganar no es lo mismo que tener plata: si te deben facturas, ganaste pero no cobraste; si compraste una herramienta, tu caja bajó aunque tu ganancia casi no se movió.',
  },
  {
    titulo: '¿Cuánto vale mi negocio? → Balance',
    texto: 'El balance es una foto a una fecha: lo que tenés (caja, lo que te deben, tu stock, tus herramientas) menos lo que debés (préstamos y cuentas a pagar). Lo que queda es tu patrimonio: la parte del negocio que es tuya.',
  },
  {
    titulo: '¿Qué hago con esto? → Resumen',
    texto: 'Las métricas del Resumen te dicen dónde mirar (margen, punto de equilibrio, días de cobro, colchón de caja) y las recomendaciones te marcan qué hacer, siempre con el dato que las dispara. Todo sale de tus números reales: lo de HomIA se carga solo y el resto lo cargás vos en Movimientos.',
  },
]

/** Entradas para el conocimiento de Homy: cómo usar Finanzas y los conceptos (sin datos del usuario). */
export function entradasHomyFinanzas(): { id: string; titulo: string; roles: ('profesional' | 'proveedor')[]; texto: string; ruta?: string; claves?: string }[] {
  const texto = (rol: RolFinanzas) =>
    `En Panel → Finanzas (en el celular, dentro de "Más") ${rol === 'profesional' ? 'el profesional' : 'el proveedor'} ve su estado de resultados, su caja, su balance y las métricas clave del negocio, gratis${rol === 'proveedor' ? ' en todos los planes' : ''}. Lo que pasa por HomIA se carga solo y se marca "Automático · viene de HomIA" (no se edita): ${rol === 'profesional' ? 'sus facturas (facturado y cobrado por separado, mano de obra y materiales), las devoluciones de sobrantes, los materiales que compró en la app (los puede asignar a una obra o marcar "no es del negocio") y los subcontratos por HomIA' : 'sus ventas y cobros (facturado y cobrado por separado) y las devoluciones de sobrantes; carga el costo de compra de cada producto (o un margen estimado declarado) para ver la ganancia real y el valor del stock'}. El resto se carga en Movimientos: ingresos por fuera de HomIA, costos directos, gastos fijos (los mensuales se cargan una vez y se repiten solos), inversiones (se amortizan por su vida útil), ${rol === 'proveedor' ? 'compras de mercadería (van al stock), ' : ''}retiros y aportes del dueño, préstamos y cuotas (separando capital e intereses). Cada categoría explica qué es con ejemplos. La pestaña Aprendé tiene la guía y el glosario, y la primera vez un asistente de 3 pasos pide el saldo inicial de caja, los gastos fijos y las inversiones que ya tiene. Se exporta a Excel (CSV). No es asesoramiento impositivo: para impuestos, consultar a un contador. Homy no ve los números del usuario.`
  const claves = 'finanzas ganancia perdida resultado balance caja gastos costos inversion amortizacion estado de resultados cuanto gano rentabilidad margen punto de equilibrio contabilidad negocio numeros excel exportar'
  const base = (['profesional', 'proveedor'] as RolFinanzas[]).map((rol) => ({
    id: `finanzas-uso-${rol}`,
    titulo: 'Finanzas del negocio',
    roles: [rol] as ('profesional' | 'proveedor')[],
    texto: texto(rol),
    ruta: `/panel/${rol}/finanzas`,
    claves,
  }))
  const conceptos = GLOSARIO.map((c) => ({
    id: `finanzas-${c.id}`,
    titulo: `Finanzas: ${c.nombre}`,
    roles: ['profesional', 'proveedor'] as ('profesional' | 'proveedor')[],
    texto: [c.queEs, c.comoSeCalcula ? `Cómo se calcula: ${c.comoSeCalcula}` : '', c.queHacer ? `Qué hacer: ${c.queHacer}` : ''].filter(Boolean).join(' '),
    claves: `finanzas ${c.nombre.toLowerCase()}`,
  }))
  const tipos = TIPOS_MOVIMIENTO.map((t) => ({
    id: `finanzas-tipo-${t}`,
    titulo: `Finanzas: qué es "${TIPOS[t].nombre}"`,
    roles: TIPOS[t].roles,
    texto: `${TIPOS[t].explicacion} En resultados: ${TIPOS[t].enResultados} En caja: ${TIPOS[t].enCaja} En el balance: ${TIPOS[t].enBalance}`,
    claves: `finanzas cargar ${TIPOS[t].nombre.toLowerCase()} ${categoriasDe('profesional', t).concat(categoriasDe('proveedor', t)).map((c) => c.nombre.toLowerCase()).join(' ')}`,
  }))
  return [...base, ...conceptos, ...tipos]
}
