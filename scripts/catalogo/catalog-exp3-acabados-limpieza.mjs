// Expansión 3 del catálogo HomIA — pisos y acabados (plastificado e
// hidrolaqueado de madera, pulido de mármol y granito, cerámicos,
// empapelados), construcción en seco (cielorrasos desmontables) y limpieza
// especializada (post obra, vidrios en altura, alfombras, colchones y sillones).
// Formato: [nombre, [aliases], unidad, descripción natural]
export const CATALOG_EXP3_ACABADOS_LIMPIEZA = {
  pisos: [
    // Pisos de madera: pulido, plastificado e hidrolaqueado
    ['Plastificante para pisos de madera brillante 4 L', ['plastificado', 'plastificante pisos', 'plastificar parquet'], 'lata', 'Barniz de dos componentes que deja el piso de madera con una capa dura y brillante. Se aplica después de pulir, con buena ventilación.'],
    ['Plastificante para pisos de madera satinado 4 L', ['plastificado satinado', 'plastificante mate', 'plastificar piso satinado'], 'lata', 'Plastificado con terminación satinada, que disimula más las marcas del uso diario.'],
    ['Hidrolaca bicomponente para pisos de madera 4 L', ['hidrolaca', 'hidrolaqueado', 'laca al agua pisos'], 'lata', 'Terminación al agua de dos componentes para pisos de madera, con poco olor y secado rápido. Permite usar la casa mientras se trabaja.'],
    ['Sellador para pisos de madera 4 L', ['sellador parquet', 'fondo plastificado', 'sellador pisos madera'], 'lata', 'Primera mano que sella el poro de la madera recién pulida antes del plastificado o la hidrolaca.'],
    ['Masilla para juntas de piso de madera 1 kg', ['masilla parquet', 'masilla pisos madera', 'relleno juntas madera'], 'unidad', 'Masilla que se mezcla con el polvo del pulido para tapar juntas y agujeros del parquet del mismo color.'],
    ['Lija para pulidora de pisos grano 36 (rollo)', ['lija pulidora', 'lija rollo parquet', 'lija 36'], 'rollo', 'Lija gruesa para la primera pasada de la máquina pulidora, que saca el plastificado viejo y empareja el piso.'],
    ['Lija para pulidora de pisos grano 80 (rollo)', ['lija 80 pulidora', 'lija fina parquet'], 'rollo', 'Lija de grano medio para las pasadas finales de pulido antes de sellar.'],
    ['Disco de lija para bordeadora de pisos x10', ['disco bordeadora', 'lija bordeadora', 'disco orilladora'], 'paquete', 'Discos de lija para la bordeadora que pule orillas y esquinas de pisos de madera.'],
    ['Cera para pisos de madera en pasta', ['cera pisos madera', 'cera en pasta pisos', 'encerar parquet'], 'lata', 'Cera que nutre y da brillo a pisos de madera encerados, no plastificados. Se aplica fina y se lustra.'],
    ['Limpiador para pisos plastificados 1 L', ['limpiador plastificado', 'limpiador pisos madera', 'cuidado plastificado'], 'unidad', 'Limpiador suave que no opaca ni daña el plastificado. Se usa diluido con un trapo bien escurrido.'],
    // Mármol, granito y piedras
    ['Pasta pulidora para mármol 1 kg', ['pasta pulir marmol', 'polvo pulidor', 'abrillantador marmol'], 'unidad', 'Pasta o polvo que, con lustradora y agua, devuelve el brillo al mármol opacado por el uso.'],
    ['Impermeabilizante para piedras y porcelanato 1 L', ['sellador piedra', 'impermeabilizante marmol', 'hidrorrepelente pisos'], 'unidad', 'Sellador que penetra en mármol, granito y piedras y evita que absorban manchas de aceite, vino o agua.'],
    ['Limpiador neutro para mármol y granito 1 L', ['limpiador marmol', 'jabon neutro piedras', 'limpiador granito'], 'unidad', 'Limpiador sin ácidos que no ataca el brillo del mármol ni del granito. Para la limpieza de todos los días.'],
    // Cerámicos y porcelanatos
    ['Removedor de pastina y cemento 1 L', ['removedor de pastina', 'limpiador post colocacion', 'quita cemento pisos'], 'unidad', 'Limpiador ácido suave que saca el velo de pastina y cemento después de colocar cerámicos. Se enjuaga bien.'],
    ['Adhesivo cerámico impermeable para piscinas 30 kg', ['adhesivo piscina', 'pegamento venecitas', 'adhesivo sumergible'], 'bolsa', 'Adhesivo para venecitas y cerámicos en piletas, duchas y lugares que quedan bajo agua.'],
    ['Venecita para piscina (placa 30x30)', ['venecitas', 'venecita pileta', 'mosaico veneciano'], 'placa', 'Placa de mosaicos chiquitos de vidrio o cerámica para revestir piletas, duchas y detalles.'],
    // Empapelados
    ['Papel vinílico para pared (rollo 10 m)', ['empapelado', 'papel de pared', 'papel vinilico'], 'rollo', 'Papel lavable para paredes, en rollo de alrededor de medio metro de ancho. Se pega con adhesivo específico sobre pared lisa y seca.'],
    ['Adhesivo para empapelar 200 g', ['cola de empapelar', 'pegamento empapelado', 'adhesivo papel pared'], 'unidad', 'Polvo que se disuelve en agua y forma la cola para pegar papeles vinílicos y empapelados.'],
    ['Removedor de empapelado 1 L', ['removedor de papel', 'quitar empapelado', 'despegador de papel'], 'unidad', 'Líquido que ablanda la cola para sacar el papel viejo de la pared sin romper el revoque.'],
    ['Espátula alisadora para empapelar', ['alisador empapelado', 'espatula empapelar', 'espátula plástica papel'], 'unidad', 'Espátula plástica flexible para alisar el papel y sacar las burbujas mientras se pega.'],
    ['Vinilo autoadhesivo decorativo (rollo 45 cm x 10 m)', ['vinilo autoadhesivo', 'papel autoadhesivo', 'papel para forrar'], 'rollo', 'Lámina autoadhesiva para forrar muebles, puertas y paredes sin pegamento.'],
  ],
  durlock: [
    ['Placa de cielorraso desmontable 60x60', ['placa cielorraso desmontable', 'placa 60x60', 'baldosa cielorraso'], 'placa', 'Placa liviana que se apoya en la estructura de perfiles T, para cielorrasos que se levantan y dan acceso a las instalaciones.'],
    ['Perfil T principal para cielorraso desmontable 3,66 m', ['perfil t principal', 'perfil t', 'larguero cielorraso'], 'unidad', 'Perfil largo en forma de T que se cuelga del techo y arma la grilla del cielorraso desmontable.'],
    ['Perfil T secundario 0,61 m', ['travesaño cielorraso', 'perfil t 61', 'perfil t secundario'], 'unidad', 'Perfil corto que se encastra entre los principales para formar los cuadrados de 60 por 60.'],
    ['Perfil perimetral L para cielorraso 3 m', ['perfil perimetral', 'angulo perimetral', 'perfil l cielorraso'], 'unidad', 'Perfil en L que se atornilla a las paredes y sostiene el borde del cielorraso desmontable.'],
    ['Cantonera metálica para durlock 2,6 m', ['cantonera durlock', 'guardacanto', 'esquinero de chapa'], 'unidad', 'Perfil que protege y marca las esquinas salientes de tabiques de durlock antes de masillar.'],
  ],
  limpieza: [
    // Alfombras, colchones y sillones
    ['Shampoo de baja espuma para máquina de alfombras 5 L', ['shampoo alfombras maquina', 'limpiador inyeccion extraccion', 'shampoo tapizados'], 'bidón', 'Limpiador concentrado de poca espuma para máquinas de inyección y extracción. Se diluye según la etiqueta y se enjuaga con agua limpia.'],
    ['Máquina lavadora de alfombras y tapizados (inyección y extracción)', ['maquina lava alfombras', 'inyectora extractora', 'lava tapizados'], 'unidad', 'Máquina que inyecta agua con limpiador en la tela y la vuelve a aspirar con la mugre. Sirve para alfombras, sillones, colchones y butacas de auto.'],
    ['Boquilla para tapizados de máquina extractora', ['boquilla tapizados', 'accesorio sillones', 'cabezal tapizado'], 'unidad', 'Boquilla chica para lavar sillones, colchones y butacas con la máquina de inyección y extracción.'],
    ['Quitamanchas enzimático para tapizados 1 L', ['quitamanchas enzimatico', 'quitamanchas organicas', 'enzimatico tapizado'], 'unidad', 'Producto que descompone manchas orgánicas como orina, sangre, vómito o comida en alfombras, colchones y sillones.'],
    ['Quitamanchas de grasa y tinta para telas 500 ml', ['quitamanchas grasa', 'quita tinta', 'desmanchador telas'], 'unidad', 'Desmanchador para aplicar puntual antes del lavado en manchas de grasa, maquillaje o birome.'],
    ['Neutralizador de olores de mascotas 1 L', ['neutralizador de olores', 'olor a pis', 'eliminador de olores'], 'unidad', 'Producto que elimina el olor a orina de mascotas en alfombras, sillones y pisos en lugar de solo taparlo.'],
    ['Protector impermeabilizante para telas 500 ml', ['impermeabilizante telas', 'protector tapizados', 'repelente de manchas'], 'unidad', 'Spray que deja la tela repelente a líquidos para que las manchas no penetren. Se aplica sobre tapizados limpios y secos.'],
    ['Cepillo para tapizados y alfombras', ['cepillo tapizados', 'cepillo alfombra', 'cepillo cerdas suaves'], 'unidad', 'Cepillo de cerdas firmes para frotar el limpiador en alfombras y tapizados antes de aspirar o extraer.'],
    // Post obra
    ['Limpiador post obra desincrustante 5 L', ['limpiador post obra', 'desincrustante', 'quita restos de obra'], 'bidón', 'Limpiador ácido controlado que saca restos de cemento, pastina y cal de pisos, sanitarios y aberturas después de la obra. Se prueba antes en un sector chico.'],
    ['Removedor de pintura y silicona fresca 500 ml', ['removedor de silicona', 'quita silicona', 'quita pintura fresca'], 'unidad', 'Producto que ablanda restos de silicona y salpicaduras de pintura en vidrios, sanitarios y aberturas.'],
    ['Rasqueta para vidrios con hojas', ['rasqueta vidrio', 'raspador', 'rasqueta con hoja'], 'unidad', 'Rasqueta con hoja de acero para sacar pintura, cemento y etiquetas de vidrios y cerámicos sin rayarlos.'],
    ['Bolsa para escombros reforzada x10', ['bolsa escombros', 'bolsa arpillera', 'bolsa de obra'], 'paquete', 'Bolsas de rafia resistentes para juntar escombro, restos de revoque y cerámicos rotos.'],
    ['Bolsa de consorcio 80x110 x10', ['bolsa consorcio', 'bolsa grande', 'bolsa negra grande'], 'paquete', 'Bolsas grandes de residuos para limpieza de obra, jardín y mudanzas.'],
    // Vidrios en altura
    ['Limpiavidrios de goma 35 cm (secador de vidrios)', ['limpiavidrios de goma', 'secador de vidrios', 'haragan vidrios'], 'unidad', 'Secador de goma que deja el vidrio sin marcas después de mojarlo. Se monta en pértiga para ventanas altas.'],
    ['Mojador para vidrios 35 cm', ['mojador vidrios', 'lavador de vidrios', 'lana para vidrios'], 'unidad', 'Mopa de tela que se carga con agua y limpiador para lavar el vidrio antes de secarlo con la goma.'],
    ['Balde rectangular para limpieza de vidrios', ['balde vidriero', 'balde rectangular', 'balde limpiavidrios'], 'unidad', 'Balde largo donde entran el mojador y el limpiavidrios de goma a lo ancho.'],
    // Varios de limpieza profesional
    ['Detergente para hidrolavadora 5 L', ['detergente hidrolavadora', 'shampoo hidrolavadora', 'limpiador para lavadora a presion'], 'bidón', 'Detergente para usar con la hidrolavadora en veredas, frentes, vehículos y maquinaria.'],
    ['Desinfectante de amonio cuaternario 5 L', ['amonio cuaternario', 'desinfectante profesional', 'sanitizante'], 'bidón', 'Desinfectante de uso profesional para superficies, pisos y baños. Se diluye según la etiqueta.'],
    ['Removedor de sarro para sanitarios 1 L', ['quita sarro', 'antisarro baño', 'limpiador de sarro'], 'unidad', 'Limpiador que disuelve el sarro de inodoros, mamparas y griferías.'],
  ],
  pintura: [
    ['Pintura látex para cielorrasos antihongos 4 L', ['latex cielorraso', 'pintura para techos interiores', 'antihongos cielorraso'], 'lata', 'Látex mate para cielorrasos de baños y cocinas, con aditivo que frena la aparición de hongos por la condensación.'],
    ['Pintura antihumedad para interiores 4 L', ['pintura antihumedad', 'pintura para humedad', 'impermeabilizante interior'], 'lata', 'Pintura que forma una barrera contra la humedad de la pared. Sirve como solución de superficie; si hay humedad de cimientos, hay que cortarla antes.'],
    ['Enduido para exteriores 4 L', ['enduido exterior', 'masilla exterior', 'enduido frente'], 'lata', 'Enduido apto para frentes y patios que empareja imperfecciones del revoque antes de pintar afuera.'],
    ['Látex para frentes elastomérico 20 L', ['latex elastomerico', 'pintura frentes', 'impermeabilizante frentes'], 'tambor', 'Pintura para frentes que estira y cubre fisuras finas, protegiendo la pared de la lluvia.'],
    ['Tinta para madera al solvente 1 L', ['tinta madera', 'tinte nogal', 'tinta caoba'], 'unidad', 'Tinta que da color a la madera sin tapar la veta. Después se protege con barniz o laca.'],
    ['Rodillo para látex exterior 23 cm', ['rodillo lana larga', 'rodillo frente', 'rodillo exterior'], 'unidad', 'Rodillo de pelo largo que carga mucha pintura y entra en las irregularidades de revoques y frentes.'],
  ],
}
