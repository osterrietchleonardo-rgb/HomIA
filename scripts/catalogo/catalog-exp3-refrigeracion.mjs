// Expansión 3 del catálogo HomIA — refrigeración y aire acondicionado
// (técnico en refrigeración / instalador de split): gases, cobre, repuestos
// eléctricos, herramientas de vacío y carga, limpieza de equipos.
// Formato: [nombre, [aliases], unidad, descripción natural]
export const CATALOG_EXP3_REFRIGERACION = {
  climatizacion: [
    // Gases refrigerantes
    ['Gas refrigerante R410A (garrafa 11,3 kg)', ['gas r410a', 'r410', 'gas split inverter'], 'unidad', 'Gas de los splits modernos. Lo carga el técnico con manómetros después de hacer vacío y verificar que no haya pérdidas.'],
    ['Gas refrigerante R22 (garrafa 13,6 kg)', ['gas r22', 'r22', 'gas aire viejo'], 'unidad', 'Gas de los aires acondicionados más viejos. Se usa solo para mantener equipos existentes que trabajan con R22.'],
    ['Gas refrigerante R32 (garrafa)', ['gas r32', 'r32', 'gas split r32'], 'unidad', 'Gas de muchos splits inverter nuevos. Se carga siguiendo lo que indica la etiqueta del equipo.'],
    ['Gas refrigerante R134a (garrafa 13,6 kg)', ['gas r134a', 'r134', 'gas heladera'], 'unidad', 'Gas de muchas heladeras familiares, freezers y exhibidoras. Se carga en la cantidad que indica la placa del equipo.'],
    ['Gas refrigerante R600a (lata 420 g)', ['gas r600a', 'isobutano', 'gas heladera nueva'], 'unidad', 'Gas de las heladeras modernas de bajo consumo. Es inflamable: lo manipula solo un técnico con las precauciones del caso.'],
    ['Gas refrigerante R404A (garrafa 10,9 kg)', ['gas r404a', 'r404', 'gas camara frigorifica'], 'unidad', 'Gas para freezers comerciales, cámaras y equipos de baja temperatura.'],
    // Cobre y aislación
    ['Caño de cobre 1/4" (rollo 15 m)', ['caño cobre 1/4', 'cobre 1/4', 'caño de cobre flexible'], 'rollo', 'Caño de cobre recocido para la línea de líquido de los splits y para reparaciones de refrigeración. Se abocarda o se suelda.'],
    ['Caño de cobre 3/8" (rollo 15 m)', ['caño cobre 3/8', 'cobre 3/8'], 'rollo', 'Caño de cobre para la línea de gas de splits chicos y medianos. Se aísla con coquilla en toda su longitud.'],
    ['Caño de cobre 1/2" (rollo 15 m)', ['caño cobre 1/2', 'cobre 1/2'], 'rollo', 'Caño de cobre para la línea de gas de splits de más frigorías, según lo que pida el fabricante del equipo.'],
    ['Caño de cobre 5/8" (rollo 15 m)', ['caño cobre 5/8', 'cobre 5/8'], 'rollo', 'Caño de cobre de diámetro grande para la línea de gas de equipos de muchas frigorías.'],
    ['Coquilla aislante para caño de cobre 3/8" x 2 m', ['coquilla', 'aislante caño cobre', 'coquilla split'], 'unidad', 'Tubo de espuma que envuelve el caño de cobre para que no condense agua ni pierda frío en el recorrido.'],
    ['Cinta de terminación para split (rollo)', ['cinta de split', 'cinta vinilica split', 'cinta envolver cañeria'], 'rollo', 'Cinta plástica que envuelve juntos caños, cable y drenaje del split para dejar la instalación prolija y protegida del sol.'],
    ['Tuerca abocardada 3/8" (flare)', ['tuerca flare', 'tuerca abocardada', 'tuerca de split'], 'unidad', 'Tuerca de bronce que ajusta el caño abocardado a la válvula del split. Se cambia cuando la original está marcada o pierde.'],
    ['Varilla de soldadura de plata 5% x 10', ['soldadura plata', 'varilla plata', 'soldadura refrigeracion'], 'paquete', 'Varillas para soldar caños de cobre en refrigeración con soplete. La aleación con plata da uniones firmes y estancas.'],
    ['Fundente para soldadura de cobre', ['fundente', 'pasta para soldar cobre', 'flux'], 'unidad', 'Pasta que se pone en la unión antes de soldar para que la varilla corra y pegue parejo.'],
    // Repuestos eléctricos y de circuito
    ['Capacitor de marcha 35 µF', ['capacitor aire', 'capacitor compresor', 'capacitor 35'], 'unidad', 'Capacitor que ayuda al compresor del aire a arrancar y trabajar. Si el equipo zumba y no enfría, es una falla muy común.'],
    ['Capacitor dual 35+5 µF', ['capacitor dual', 'capacitor doble', 'capacitor condensadora'], 'unidad', 'Capacitor doble que atiende al compresor y al ventilador de la unidad exterior en un solo cuerpo.'],
    ['Capacitor de arranque para compresor', ['capacitor de arranque', 'capacitor electrolitico', 'arranque compresor'], 'unidad', 'Capacitor que da el empujón inicial a compresores que arrancan con dificultad. Se elige según el motor.'],
    ['Relé de arranque PTC para heladera', ['rele heladera', 'rele ptc', 'automatico compresor heladera'], 'unidad', 'Relé que va pegado al compresor de la heladera y lo ayuda a arrancar. Cuando la heladera hace clic y no arranca, suele ser el relé.'],
    ['Protector térmico para compresor', ['protector termico', 'protector compresor', 'termico de compresor'], 'unidad', 'Pieza que corta el compresor si se recalienta o consume de más. Se cambia junto con el relé cuando falla.'],
    ['Presostato de alta y baja para refrigeración', ['presostato refrigeracion', 'presostato de alta', 'presostato dual'], 'unidad', 'Control que corta el equipo si la presión del gas sube o baja fuera de rango. Protege el compresor en cámaras y equipos comerciales.'],
    ['Termostato para heladera', ['termostato heladera', 'control de frio', 'perilla frio heladera'], 'unidad', 'Termostato con bulbo que enciende y apaga el compresor según el frío. Si la heladera no corta o no enfría, se revisa primero.'],
    ['Filtro deshidratador para heladera', ['filtro deshidratador', 'filtro secador', 'filtro refrigeracion'], 'unidad', 'Filtro que retiene humedad y suciedad del circuito de gas. Se cambia cada vez que se abre el circuito para reparar.'],
    ['Tubo capilar (rollo 3 m)', ['capilar', 'tubo capilar', 'capilar heladera'], 'rollo', 'Caño finito que regula el paso de gas en heladeras y equipos chicos. El técnico lo corta a la medida que pide el equipo.'],
    ['Válvula de servicio para carga (pinche)', ['valvula pinche', 'valvula de carga', 'pinchadora'], 'unidad', 'Válvula que se abraza al caño para poder cargar gas o medir presión en equipos que no traen toma de servicio.'],
    ['Compresor para heladera 1/5 HP', ['compresor heladera', 'motor heladera', 'compresor 1/5'], 'unidad', 'Compresor de repuesto para heladeras familiares. Se elige según el gas y la potencia del equipo original.'],
    ['Motor ventilador para condensadora', ['motor ventilador split', 'motor forzador', 'ventilador unidad exterior'], 'unidad', 'Motor del ventilador de la unidad exterior del split. Cuando no gira, el equipo se recalienta y corta.'],
    ['Placa universal para split', ['placa universal split', 'plaqueta aire', 'placa control aire'], 'unidad', 'Placa electrónica genérica que reemplaza a la original cuando se quemó y no se consigue. Trae su propio control remoto.'],
    // Herramientas del técnico
    ['Manifold de manómetros para refrigeración', ['manifold', 'juego de manometros', 'manometros refrigeracion'], 'juego', 'Juego de manómetros con mangueras para medir presiones, hacer vacío y cargar gas en splits y heladeras.'],
    ['Bomba de vacío 1/4 HP', ['bomba de vacio', 'vacuometro', 'bomba vacio split'], 'unidad', 'Bomba que saca el aire y la humedad de la cañería antes de cargar el gas. Es un paso que no se puede saltear en una instalación bien hecha.'],
    ['Abocardador con cortacaño para cobre', ['abocardador', 'flare', 'kit abocardador'], 'juego', 'Herramienta que forma la boca cónica en la punta del caño de cobre para ajustarlo con tuerca. Viene con cortacaño.'],
    ['Dobladora de caño de cobre', ['dobladora de caño', 'curvadora cobre', 'dobla caños'], 'unidad', 'Herramienta para curvar el caño de cobre sin aplastarlo ni quebrarlo.'],
    ['Detector electrónico de fugas de refrigerante', ['detector de fugas', 'buscafugas', 'detector de gas refrigerante'], 'unidad', 'Aparato que pita al acercarse a una pérdida de gas refrigerante en uniones y serpentinas.'],
    ['Soplete para soldar con garrafa MAPP', ['soplete mapp', 'soplete refrigeracion', 'soplete soldadura cobre'], 'unidad', 'Soplete de llama más caliente que el de gas común, para soldar caños de cobre con varilla de plata.'],
    // Limpieza y mantenimiento de equipos
    ['Limpiador de serpentinas en espuma 400 ml', ['limpiador de serpentina', 'limpiador evaporadora', 'espuma limpia split'], 'unidad', 'Espuma que se aplica sobre la serpentina del split, afloja la mugre y sale con el agua de condensado. Mejora el rendimiento y el olor.'],
    ['Limpiador de condensadoras 5 L', ['limpiador condensadora', 'desincrustante serpentina', 'limpiador aletas'], 'bidón', 'Limpiador concentrado para la serpentina de la unidad exterior. Se diluye, se aplica y se enjuaga con agua a baja presión.'],
    ['Bolsa de lavado para split', ['bolsa lavado split', 'funda de lavado', 'kit lavado aire'], 'unidad', 'Funda impermeable que se cuelga debajo de la unidad interior para lavar la serpentina sin mojar la pared ni el piso.'],
    ['Peine para aletas de serpentina', ['peine aletas', 'peinador de serpentina', 'enderezador de aletas'], 'unidad', 'Peine de plástico que endereza las aletas dobladas de las serpentinas para que vuelva a pasar bien el aire.'],
  ],
}
