// Sugerencias iniciales de Homy según el rol y la pantalla actual del panel.
type Rol = 'visitante' | 'cliente' | 'profesional' | 'proveedor'

const POR_PANTALLA: Record<Exclude<Rol, 'visitante'>, Record<string, string[]>> = {
  cliente: {
    '': ['¿Qué tengo pendiente?', '¿Cómo publico un trabajo?', 'Se me gotea la canilla, ¿qué necesito?'],
    publicar: ['¿Qué pongo para recibir más presupuestos?', '¿Publicar cuesta algo?', 'Busco un plomero en mi zona'],
    trabajos: ['¿Cómo comparo presupuestos?', 'No me llegan presupuestos, ¿qué hago?', '¿Cómo contrato a uno?'],
    materiales: ['¿Cómo funciona el carrito?', '¿Por qué no puedo pagar con Mercado Pago a un proveedor?', 'Precio del cemento'],
    proyectos: ['¿Quién paga los materiales?', '¿Qué hago con lo que me sobró?', '¿Cómo dejo una reseña?'],
    facturas: ['¿Cómo pago una factura?', '¿Hay algún cargo si pago con Mercado Pago?', 'Pagué y no se acredita'],
    directorio: ['Busco un electricista verificado', '¿Cómo contrato desde el directorio?', '¿Qué significa No verificado?'],
    mensajes: ['El profesional no me responde', '¿Quién puede iniciar un chat?'],
    verificacion: ['¿Cómo verifico mi DNI?', '¿Para qué sirve verificarme?'],
    perfil: ['¿Cómo verifico mi identidad?', '¿Puedo ser profesional también?'],
  },
  profesional: {
    '': ['¿Qué tengo pendiente?', '¿Hay trabajos de mi rubro cerca?', '¿Cómo cotizo un proyecto?'],
    bolsa: ['¿Hay trabajos de mi rubro cerca?', '¿Cómo mando un presupuesto?', '¿Cómo consigo más clientes?'],
    presupuestos: ['¿Por qué me rechazan presupuestos?', '¿Qué pasa cuando me aceptan uno?'],
    proyectos: ['¿Cómo emito la factura y cobro?', '¿Quién paga los materiales?', '¿Cómo confirmo un cobro en efectivo?'],
    materiales: ['Precio del cable 2.5 mm', '¿Dónde consigo teflón?', '¿Cómo compro para una obra?'],
    obras: ['¿Cómo cargo mis obras?', '¿Para qué sirven las obras?'],
    crm: ['¿Para qué sirve el CRM?', 'El cliente no me responde'],
    vinculaciones: ['¿Qué es una cuenta de retiro?', '¿Cómo me vinculo con un proveedor?'],
    directorio: ['¿Cómo aparezco más arriba?', '¿Qué significa No verificado?'],
    mensajes: ['¿Puedo escribirle primero a un cliente?', 'El cliente no me responde'],
    verificacion: ['¿Cómo verifico mi DNI?', '¿Para qué sirve verificarme?'],
    perfil: ['¿Qué completo para que me contraten?', '¿Cómo verifico mi identidad?'],
  },
  proveedor: {
    '': ['¿Qué tengo pendiente?', '¿Cómo conecto Mercado Pago?', '¿Qué incluye el plan PRO?'],
    stock: ['¿Cómo cargo un producto?', '¿Por qué no aparezco en las búsquedas?', 'Se me agotó un producto'],
    cobros: ['¿Cómo conecto Mercado Pago?', '¿Cómo confirmo un cobro en efectivo?', '¿Cómo gestiono una devolución de sobrantes?'],
    plan: ['¿Qué diferencia hay entre Básico y PRO?', '¿Qué pasa cuando termina la prueba?', '¿Cuánto cuesta el PRO?'],
    crm: ['¿Para qué sirve el CRM?'],
    vinculaciones: ['¿Qué es una vinculación?', '¿Cómo vinculo a un profesional?'],
    directorio: ['¿Cómo aparezco primero?', '¿Cómo consigo reseñas?'],
    mensajes: ['¿Puedo escribirle primero a un cliente?'],
    verificacion: ['¿Cómo verifico mi DNI?', '¿Para qué sirve verificarme?'],
    perfil: ['¿Cómo pongo mi logo en la home?', '¿Qué completo en mi perfil?'],
  },
}

const VISITANTE = [
  'Se me gotea la canilla, ¿qué necesito?',
  'Busco un plomero en Palermo',
  '¿Cómo funciona HomIA?',
  '¿Cuánto cuesta ser proveedor?',
]

export function sugerenciasPara(rol: Rol, pantalla: string): string[] {
  if (rol === 'visitante') return VISITANTE
  const m = POR_PANTALLA[rol]
  return m[pantalla] || m['']
}
