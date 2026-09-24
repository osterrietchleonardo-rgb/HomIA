// Centroides aproximados de barrios de CABA y localidades del AMBA, para que
// "busco plomero en Palermo" ordene por cercanía aunque el usuario no haya
// compartido su ubicación. Es una referencia (±1-2 km), no una dirección.
const Z: [string, number, number][] = [
  // CABA
  ['palermo', -34.5885, -58.4306], ['belgrano', -34.5627, -58.4563], ['recoleta', -34.5875, -58.3974],
  ['caballito', -34.6186, -58.4406], ['almagro', -34.6090, -58.4204], ['villa crespo', -34.5993, -58.4381],
  ['colegiales', -34.5741, -58.4509], ['nunez', -34.5446, -58.4632], ['saavedra', -34.5541, -58.4860],
  ['villa urquiza', -34.5731, -58.4872], ['villa devoto', -34.6007, -58.5130], ['villa del parque', -34.6049, -58.4903],
  ['flores', -34.6286, -58.4637], ['floresta', -34.6283, -58.4838], ['mataderos', -34.6581, -58.5023],
  ['liniers', -34.6424, -58.5226], ['villa lugano', -34.6765, -58.4716], ['parque patricios', -34.6364, -58.4027],
  ['barracas', -34.6448, -58.3830], ['la boca', -34.6345, -58.3631], ['san telmo', -34.6218, -58.3714],
  ['monserrat', -34.6131, -58.3810], ['san nicolas', -34.6037, -58.3816], ['microcentro', -34.6037, -58.3775],
  ['puerto madero', -34.6118, -58.3634], ['retiro', -34.5916, -58.3749], ['balvanera', -34.6096, -58.4031],
  ['once', -34.6090, -58.4063], ['boedo', -34.6300, -58.4180], ['chacarita', -34.5868, -58.4543],
  ['villa ortuzar', -34.5801, -58.4680], ['agronomia', -34.5936, -58.4924], ['paternal', -34.5972, -58.4674],
  ['villa pueyrredon', -34.5822, -58.5030], ['coghlan', -34.5601, -58.4741], ['parque chacabuco', -34.6363, -58.4394],
  ['nueva pompeya', -34.6508, -58.4180], ['villa soldati', -34.6629, -58.4431], ['parque avellaneda', -34.6448, -58.4801],
  ['versalles', -34.6320, -58.5207], ['monte castro', -34.6190, -58.5050], ['velez sarsfield', -34.6340, -58.4960],
  ['villa real', -34.6180, -58.5260], ['villa santa rita', -34.6140, -58.4810], ['villa general mitre', -34.6100, -58.4670],
  ['constitucion', -34.6270, -58.3820], ['san cristobal', -34.6240, -58.4020], ['caba', -34.6037, -58.3816],
  ['capital federal', -34.6037, -58.3816], ['buenos aires', -34.6037, -58.3816],
  // AMBA
  ['vicente lopez', -34.5266, -58.4722], ['olivos', -34.5082, -58.4885], ['martinez', -34.4925, -58.5040],
  ['san isidro', -34.4708, -58.5286], ['tigre', -34.4260, -58.5796], ['san fernando', -34.4418, -58.5597],
  ['san martin', -34.5742, -58.5376], ['tres de febrero', -34.6030, -58.5620], ['caseros', -34.6048, -58.5635],
  ['moron', -34.6534, -58.6198], ['haedo', -34.6440, -58.5930], ['ramos mejia', -34.6412, -58.5648],
  ['la matanza', -34.7700, -58.6250], ['san justo', -34.6828, -58.5620], ['avellaneda', -34.6624, -58.3651],
  ['lanus', -34.7010, -58.3920], ['lomas de zamora', -34.7610, -58.4063], ['banfield', -34.7440, -58.3970],
  ['quilmes', -34.7206, -58.2546], ['berazategui', -34.7630, -58.2112], ['florencio varela', -34.8050, -58.2750],
  ['almirante brown', -34.8000, -58.3900], ['adrogue', -34.8008, -58.3890], ['ezeiza', -34.8540, -58.5230],
  ['hurlingham', -34.5880, -58.6390], ['ituzaingo', -34.6580, -58.6670], ['merlo', -34.6653, -58.7278],
  ['moreno', -34.6500, -58.7890], ['pilar', -34.4587, -58.9142], ['escobar', -34.3480, -58.7950],
  ['jose c paz', -34.5150, -58.7680], ['malvinas argentinas', -34.4930, -58.7000], ['san miguel', -34.5424, -58.7120],
  ['la plata', -34.9214, -57.9545], ['campana', -34.1633, -58.9592], ['zarate', -34.0981, -59.0286],
  // interior (capitales)
  ['cordoba', -31.4201, -64.1888], ['rosario', -32.9442, -60.6505], ['mendoza', -32.8895, -68.8458],
  ['mar del plata', -38.0055, -57.5426], ['tucuman', -26.8083, -65.2176], ['salta', -24.7821, -65.4232],
  ['santa fe', -31.6333, -60.7000], ['neuquen', -38.9516, -68.0591], ['bahia blanca', -38.7196, -62.2724],
]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Busca la zona mencionada; devuelve el nombre normalizado y su centroide. */
export function ubicarZona(texto: string | null | undefined): { zona: string; lat: number; lng: number } | null {
  const t = ` ${norm(texto || '')} `
  if (!t.trim()) return null
  // el nombre más largo primero ("villa urquiza" antes que "villa")
  const orden = [...Z].sort((a, b) => b[0].length - a[0].length)
  for (const [zona, lat, lng] of orden) {
    if (t.includes(` ${zona} `)) return { zona, lat, lng }
  }
  return null
}
