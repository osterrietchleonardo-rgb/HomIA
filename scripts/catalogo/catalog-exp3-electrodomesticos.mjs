// Expansión 3 del catálogo HomIA — repuestos de electrodomésticos
// (técnico en lavarropas, microondas, hornos eléctricos, pequeños electro).
// Formato: [nombre, [aliases], unidad, descripción natural]
//
// CATEGORÍA PROPUESTA: 'electrodomesticos' (todavía no existe en la base).
// Sin el flag --categorias-nuevas el seeder carga estos elementos en la
// categoría `fallback` (existente), así no hace falta tocar la UI. Con el
// flag crea la categoría nueva y, si ya estaban en la de respaldo, los MUEVE
// (update de categoryId: el stock de los proveedores sigue apuntando al mismo
// elemento). Ver scripts/catalogo/fuentes.mjs.
export const CATALOG_EXP3_ELECTRODOMESTICOS = {
  slug: 'electrodomesticos',
  name: 'Electrodomésticos · Repuestos',
  icon: 'washing-machine',
  fallback: 'electricistas',
  items: [
    // Lavarropas y secarropas
    ['Bomba de desagote para lavarropas', ['bomba lavarropas', 'bomba desagote', 'bomba de agua lavarropas'], 'unidad', 'Bomba que saca el agua del lavarropas al terminar cada ciclo. Si el lavarropas queda con agua o hace ruido al desagotar, suele ser ella o un objeto trabado.'],
    ['Electroválvula doble para lavarropas', ['electrovalvula lavarropas', 'valvula de entrada lavarropas', 'solenoide lavarropas'], 'unidad', 'Válvula que deja entrar el agua al lavarropas cuando el programa lo pide. Si no carga agua o carga sin parar, se revisa primero.'],
    ['Resistencia para lavarropas 1800 W', ['resistencia lavarropas', 'calentador lavarropas', 'resistencia lavado'], 'unidad', 'Resistencia que calienta el agua en lavarropas automáticos con lavado en caliente. Se elige según la marca y el modelo.'],
    ['Presostato para lavarropas', ['presostato lavarropas', 'control de nivel lavarropas', 'nivel de agua lavarropas'], 'unidad', 'Sensor que mide cuánta agua cargó el lavarropas para cortar la entrada. Cuando rebalsa o no arranca el lavado, puede estar fallando.'],
    ['Traba de puerta para lavarropas', ['traba puerta lavarropas', 'bloqueo puerta', 'cierre electrico lavarropas'], 'unidad', 'Cierre eléctrico que bloquea la puerta del lavarropas de carga frontal mientras lava. Si no traba, el lavarropas no arranca.'],
    ['Correa para lavarropas', ['correa lavarropas', 'correa secarropas', 'correa poly v'], 'unidad', 'Correa que transmite el giro del motor al tambor. Se pide por el código grabado en la correa vieja.'],
    ['Carbones para motor de lavarropas x2', ['carbones lavarropas', 'escobillas motor', 'carbones motor'], 'par', 'Par de carbones que alimentan el motor universal de muchos lavarropas y electro. Cuando se gastan, el motor pierde fuerza o chispea.'],
    ['Amortiguador para lavarropas', ['amortiguador lavarropas', 'suspension lavarropas', 'amortiguador tambor'], 'unidad', 'Amortiguador que frena el golpeteo del tambor al centrifugar. Si el lavarropas camina o golpea mucho, conviene revisarlos.'],
    ['Juego de rulemanes y retén para lavarropas', ['rulemanes lavarropas', 'rodamientos lavarropas', 'reten lavarropas'], 'juego', 'Rodamientos y retén del eje del tambor. Cuando el lavarropas hace ruido de avión al centrifugar, suelen estar gastados.'],
    ['Burlete de puerta para lavarropas frontal', ['burlete lavarropas', 'fuelle lavarropas', 'goma puerta lavarropas'], 'unidad', 'Goma que sella la puerta del lavarropas de carga frontal. Se cambia cuando está rota o pierde agua por abajo de la puerta.'],
    ['Manguera de desagote para lavarropas', ['manguera desagote lavarropas', 'manguera de salida lavarropas', 'desagote lavarropas'], 'unidad', 'Manguera corrugada por donde el lavarropas larga el agua a la pileta o al desagüe. Se cambia cuando se raja o queda corta.'],
    ['Freno para secarropas centrífugo', ['freno secarropas', 'zapata secarropas', 'freno centrifugo'], 'unidad', 'Pieza que frena el tambor del secarropas al abrir la tapa. Si el tambor sigue girando al abrir, hay que cambiarla.'],
    ['Filtro de bomba para lavarropas', ['filtro lavarropas', 'trampa de pelusa', 'filtro desagote'], 'unidad', 'Filtro que retiene monedas, botones y pelusa antes de la bomba. Se limpia seguido y se cambia si se rompe.'],
    // Heladeras
    ['Burlete para heladera a medida', ['burlete heladera', 'goma heladera', 'burlete magnetico'], 'unidad', 'Burlete con imán que sella la puerta de la heladera o el freezer. Se pide con las medidas de la puerta; un burlete gastado hace trabajar de más al motor.'],
    ['Timer de descongelamiento para heladera no frost', ['timer heladera', 'timer no frost', 'reloj descongelamiento'], 'unidad', 'Reloj que alterna frío y descongelamiento en heladeras no frost. Si se forma hielo en el fondo del freezer, puede estar fallando.'],
    ['Resistencia de descongelamiento para heladera no frost', ['resistencia no frost', 'resistencia de deshielo', 'resistencia freezer'], 'unidad', 'Resistencia que derrite la escarcha de la serpentina en heladeras no frost durante el ciclo de descongelamiento.'],
    ['Bimetálico para heladera no frost', ['bimetalico', 'termofusible no frost', 'sensor deshielo'], 'unidad', 'Sensor que corta la resistencia de descongelamiento cuando termina el deshielo. Falla junto con la resistencia y el timer.'],
    ['Motor ventilador para heladera no frost', ['ventilador no frost', 'forzador heladera', 'motor ventilador freezer'], 'unidad', 'Ventilador chico que reparte el frío del freezer a la heladera. Si el freezer enfría y la heladera no, puede ser este motor.'],
    ['Lámpara para heladera E14 15 W', ['lampara heladera', 'foquito heladera', 'luz heladera'], 'unidad', 'Lamparita chica de rosca fina que ilumina adentro de la heladera y aguanta el frío.'],
    ['Estante de vidrio para heladera a medida', ['estante heladera', 'vidrio heladera', 'bandeja heladera'], 'unidad', 'Estante de vidrio templado para reemplazar el que se rompió. Se pide con las medidas exactas del original.'],
    // Cocina: microondas, hornos, anafes
    ['Fusible para microondas', ['fusible microondas', 'fusible ceramico', 'fusible alta tension'], 'unidad', 'Fusible que se quema para proteger el microondas. Si el equipo no enciende nada, es lo primero que revisa el técnico.'],
    ['Plato giratorio para microondas', ['plato microondas', 'plato de vidrio microondas', 'bandeja microondas'], 'unidad', 'Plato de vidrio que gira dentro del microondas. Se elige por el diámetro y el tipo de encastre.'],
    ['Motor de plato para microondas', ['motor plato microondas', 'motorcito microondas', 'motor giro microondas'], 'unidad', 'Motorcito que hace girar el plato del microondas. Si el plato no gira, casi siempre es este motor.'],
    ['Mica para microondas', ['mica microondas', 'placa mica', 'guia de ondas'], 'unidad', 'Placa de mica que tapa la salida de ondas dentro del microondas. Si está quemada o engrasada hace chispas; se corta a medida.'],
    ['Resistencia para horno eléctrico', ['resistencia horno', 'resistencia horno electrico', 'resistencia grill'], 'unidad', 'Resistencia que calienta el horno eléctrico o el grill. Se elige por forma, largo y potencia de la original.'],
    ['Termostato para horno eléctrico', ['termostato horno', 'control temperatura horno', 'perilla horno electrico'], 'unidad', 'Termostato que mantiene la temperatura elegida en el horno eléctrico. Si quema todo o no llega a temperatura, se revisa.'],
    ['Burlete para puerta de horno', ['burlete horno', 'junta horno', 'cordon horno'], 'unidad', 'Junta resistente al calor que sella la puerta del horno. Un burlete gastado deja escapar el calor y cocina desparejo.'],
    ['Vidrio interior para puerta de horno', ['vidrio horno', 'vidrio puerta horno', 'vidrio templado horno'], 'unidad', 'Vidrio templado de repuesto para la puerta del horno. Se pide con las medidas y la forma del original.'],
    ['Válvula de seguridad para cocina', ['valvula seguridad cocina', 'valvula horno', 'valvula de gas cocina'], 'unidad', 'Válvula que corta el gas del horno si se apaga la llama. Trabaja junto con la termocupla.'],
    // Pequeños electrodomésticos y ventilación
    ['Capacitor para ventilador de techo', ['capacitor ventilador', 'capacitor ventilador techo', 'condensador ventilador'], 'unidad', 'Capacitor que da las velocidades al ventilador de techo. Si gira lento o no arranca, es la falla más común.'],
    ['Llave de velocidades para ventilador de techo', ['llave ventilador', 'control ventilador techo', 'selector velocidades'], 'unidad', 'Llave de pared que elige las velocidades del ventilador de techo y prende la luz aparte.'],
    ['Resistencia para caloventor', ['resistencia caloventor', 'resistencia estufa electrica', 'resistencia termoventilador'], 'unidad', 'Resistencia de repuesto para caloventores y estufas eléctricas. Se elige según el modelo y la potencia.'],
    ['Cable de alimentación con ficha para electrodomésticos', ['cable con ficha', 'cordon de alimentacion', 'cable electro'], 'unidad', 'Cable con enchufe para reemplazar el cordón cortado o recalentado de planchas, estufas y otros electro.'],
    ['Termostato para plancha', ['termostato plancha', 'control plancha', 'perilla plancha'], 'unidad', 'Termostato que regula el calor de la plancha. Si no calienta o se pasa, es el repuesto más común.'],
    ['Bolsa para aspiradora x5', ['bolsa aspiradora', 'bolsas de aspiradora', 'filtro aspiradora'], 'paquete', 'Bolsas descartables para aspiradoras de bolsa. Se eligen por el modelo del equipo.'],
    ['Filtro HEPA para aspiradora', ['filtro hepa', 'filtro aspiradora sin bolsa', 'filtro de salida aspiradora'], 'unidad', 'Filtro que retiene el polvo fino en aspiradoras sin bolsa. Se limpia o se cambia cuando la aspiradora pierde succión.'],
    ['Filtro de carbón para campana de cocina', ['filtro campana', 'filtro carbon campana', 'filtro purificador cocina'], 'unidad', 'Filtro que retiene olores en campanas que recirculan el aire. Se cambia cada algunos meses según el uso.'],
    ['Filtro metálico para campana de cocina', ['filtro metalico campana', 'filtro de grasa', 'rejilla campana'], 'unidad', 'Filtro de aluminio que junta la grasa de la cocina. Se lava con desengrasante y se cambia cuando se deforma.'],
    ['Filtro de agua para heladera con dispenser', ['filtro heladera', 'filtro dispenser', 'cartucho heladera'], 'unidad', 'Cartucho que filtra el agua del dispenser y la máquina de hielo de la heladera. Se elige por el modelo del equipo.'],
  ],
}
