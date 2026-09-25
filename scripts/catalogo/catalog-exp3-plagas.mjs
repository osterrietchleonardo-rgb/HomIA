// Expansión 3 del catálogo HomIA — control de plagas (fumigador /
// desinsectador / desratizador): insecticidas, cebos, raticidas, trampas,
// equipos de aplicación y protección personal.
// Formato: [nombre, [aliases], unidad, descripción natural]
//
// CATEGORÍA PROPUESTA: 'plagas' (todavía no existe en la base).
// Sin el flag --categorias-nuevas el seeder carga estos elementos en la
// categoría `fallback` (existente). Ver catalog-exp3-electrodomesticos.mjs.
// Descripciones: siempre "según la etiqueta"; no se inventan dosis.
export const CATALOG_EXP3_PLAGAS = {
  slug: 'plagas',
  name: 'Control de plagas',
  icon: 'bug',
  fallback: 'limpieza',
  items: [
    // Insecticidas
    ['Insecticida concentrado cipermetrina 1 L', ['cipermetrina', 'insecticida concentrado', 'fumigar casa'], 'unidad', 'Insecticida que se diluye en agua y se pulveriza en zócalos, patios y perímetros contra cucarachas, hormigas, arañas y mosquitos. Se usa según la etiqueta y con protección.'],
    ['Insecticida concentrado deltametrina 1 L', ['deltametrina', 'insecticida piretroide', 'insecticida para fumigar'], 'unidad', 'Insecticida de uso profesional para tratamientos en interiores y exteriores. Tiene efecto residual y se aplica diluido según la etiqueta.'],
    ['Insecticida en polvo para rastreros 250 g', ['insecticida en polvo', 'polvo cucarachas', 'polvo hormigas'], 'unidad', 'Polvo que se espolvorea en grietas, huecos de muebles y detrás de artefactos, donde se esconden cucarachas y hormigas.'],
    ['Cebo en gel para cucarachas (jeringa 30 g)', ['gel cucarachas', 'cebo cucarachas', 'jeringa gel'], 'unidad', 'Gel que se aplica en gotitas en bisagras, zócalos y detrás de la heladera. Las cucarachas lo comen y contagian al resto del nido.'],
    ['Cebo en gel para hormigas (jeringa)', ['gel hormigas', 'cebo hormigas dulce', 'hormiguicida gel'], 'unidad', 'Gel dulce que las hormigas llevan al hormiguero. Sirve adentro de la casa, donde no conviene usar granulado.'],
    ['Cebo granulado para hormiga cortadora 500 g', ['hormiguicida cortadora', 'cebo hormiga negra', 'granulado hormigas jardin'], 'unidad', 'Cebo que se reparte cerca de los caminos de la hormiga cortadora para que lo lleven al nido. No se riega encima.'],
    ['Insecticida para termitas 1 L', ['termiticida', 'insecticida termitas', 'tratamiento termitas'], 'unidad', 'Producto para tratar maderas y suelos atacados por termitas. En infestaciones grandes conviene un fumigador profesional.'],
    ['Insecticida para pulgas y garrapatas en ambientes 1 L', ['insecticida pulgas', 'garrapatas ambiente', 'pulguicida'], 'unidad', 'Insecticida para pisos, cuchas y patios donde hay pulgas o garrapatas. No se aplica sobre los animales.'],
    ['Tierra de diatomeas 1 kg', ['tierra de diatomeas', 'diatomea', 'insecticida natural'], 'unidad', 'Polvo mineral que deshidrata insectos rastreros. Se espolvorea en rincones, huerta y gallineros.'],
    ['Ácido bórico 500 g', ['acido borico', 'borico cucarachas', 'polvo borico'], 'unidad', 'Polvo que se usa para preparar cebos caseros contra cucarachas y hormigas. Se deja fuera del alcance de chicos y mascotas.'],
    ['Cebo para babosas y caracoles 500 g', ['babosas', 'caracoles', 'molusquicida'], 'unidad', 'Cebo en pellets que se reparte en canteros y huerta para controlar babosas y caracoles.'],
    // Mosquitos y moscas
    ['Espirales para mosquitos x12', ['espiral mosquitos', 'espirales', 'espiral repelente'], 'paquete', 'Espirales que se prenden en patios y galerías para alejar mosquitos. Solo en lugares ventilados.'],
    ['Tabletas para aparato eléctrico antimosquitos x24', ['tabletas mosquitos', 'pastillas aparato', 'repuesto enchufable'], 'paquete', 'Tabletas que se ponen en el aparato enchufable para ahuyentar mosquitos toda la noche.'],
    ['Aparato enchufable antimosquitos con líquido', ['aparato mosquitos', 'enchufable liquido', 'repelente electrico'], 'unidad', 'Difusor que se enchufa y libera insecticida de a poco durante varias noches. Trae un frasco de líquido de repuesto.'],
    ['Repelente de mosquitos en aerosol', ['repelente', 'repelente mosquitos', 'repelente piel'], 'unidad', 'Repelente para aplicar sobre la piel y la ropa. Se usa según las indicaciones de la etiqueta, con especial cuidado en chicos.'],
    ['Larvicida para mosquitos 100 ml', ['larvicida', 'larvas de mosquito', 'dengue larvas'], 'unidad', 'Producto que se agrega a depósitos de agua que no se pueden vaciar para cortar el ciclo de las larvas del mosquito.'],
    ['Trampa de luz UV para moscas y mosquitos', ['trampa uv', 'mata moscas electrico', 'lampara atrapa insectos'], 'unidad', 'Lámpara que atrae insectos voladores con luz ultravioleta y los atrapa con una rejilla o una placa adhesiva.'],
    ['Cinta atrapamoscas x4', ['cinta atrapamoscas', 'papel matamoscas', 'tira adhesiva moscas'], 'paquete', 'Tiras adhesivas que se cuelgan en galpones, cocinas de campo y establos para atrapar moscas sin insecticida.'],
    // Roedores
    ['Raticida en bloques parafinados 1 kg', ['raticida bloques', 'veneno ratas', 'cebo rodenticida'], 'unidad', 'Cebos en bloque que resisten la humedad, para usar dentro de cebaderas en patios, galpones y sótanos. Siempre fuera del alcance de chicos y mascotas.'],
    ['Raticida en pellets 500 g', ['raticida pellets', 'raticida granulado', 'veneno ratones'], 'unidad', 'Cebo en pellets para ratas y ratones en lugares secos. Se coloca dentro de cebaderas cerradas.'],
    ['Cebadera portacebo para roedores', ['cebadera', 'portacebo', 'estacion de cebado'], 'unidad', 'Caja con llave donde se pone el raticida para que solo entren los roedores. Evita que chicos y mascotas lleguen al veneno.'],
    ['Trampa adhesiva para ratones x2', ['trampa pegajosa', 'pegamento ratones', 'plancha adhesiva'], 'paquete', 'Placas con pegamento que atrapan ratones sin veneno. Se colocan pegadas a la pared, por donde caminan.'],
    ['Trampa ratonera de madera', ['ratonera', 'trampa raton', 'trampa de resorte'], 'unidad', 'La trampa de resorte de toda la vida. Se ceba y se ubica junto a la pared, lejos del paso de chicos y mascotas.'],
    ['Jaula trampa para roedores', ['jaula trampa', 'trampa jaula', 'trampa captura viva'], 'unidad', 'Jaula que atrapa al animal vivo, para ratas, lauchas o comadrejas, sin veneno.'],
    // Palomas y otros
    ['Púas antipalomas (tira 50 cm)', ['pinches antipalomas', 'antipalomas', 'puas palomas'], 'unidad', 'Tiras de púas plásticas o de acero que se pegan en cornisas, carteles y aires acondicionados para que las palomas no se posen.'],
    ['Gel repelente para palomas', ['gel antipalomas', 'repelente palomas', 'pasta antipalomas'], 'unidad', 'Gel pegajoso que se aplica en cornisas y bordes para que las palomas no se posen, sin lastimarlas.'],
    ['Repelente ultrasónico para roedores e insectos', ['repelente ultrasonico', 'ahuyentador electronico', 'ultrasonido ratones'], 'unidad', 'Aparato enchufable que emite sonidos agudos para ahuyentar plagas. Funciona como complemento, no reemplaza el control con cebos.'],
    // Equipos de aplicación y protección
    ['Pulverizador de mochila 16 L', ['mochila fumigadora', 'pulverizador mochila', 'fumigadora 16 litros'], 'unidad', 'Pulverizador a palanca que se carga en la espalda. Es el equipo de trabajo del fumigador para patios, jardines y perímetros.'],
    ['Pulverizador manual 1,5 L', ['pulverizador chico', 'rociador', 'atomizador a presion'], 'unidad', 'Rociador a presión para aplicar insecticidas en interiores, zócalos y rincones con precisión.'],
    ['Termonebulizador', ['nebulizadora', 'termonebulizadora', 'fumigacion con niebla'], 'unidad', 'Equipo que genera una niebla de insecticida para tratar galpones, depósitos y espacios abiertos contra mosquitos. De uso profesional.'],
    ['Espolvoreador de insecticida en polvo', ['espolvoreador', 'fuelle insecticida', 'aplicador de polvo'], 'unidad', 'Fuelle que sopla el insecticida en polvo dentro de grietas, cajas de luz y huecos de muebles.'],
    ['Mameluco descartable', ['mameluco', 'traje descartable', 'overol descartable'], 'unidad', 'Traje de una sola pieza con capucha que protege la ropa y la piel al fumigar o limpiar lugares contaminados.'],
    ['Filtros para vapores orgánicos para respirador x2', ['filtros respirador', 'cartuchos vapores organicos', 'filtro mascara fumigar'], 'par', 'Par de cartuchos para la máscara de media cara que retienen los vapores de insecticidas y solventes. Se cambian según el uso.'],
  ],
}
