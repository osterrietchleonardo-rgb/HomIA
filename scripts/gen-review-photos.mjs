// Genera fotos de reseñas demo (trabajos terminados) con el SDK de imágenes.
// Cacheadas en scripts/assets/reviews/ — el seed solo las copia.
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import path from 'path'

const OUT = path.resolve('scripts/assets/reviews')
fs.mkdirSync(OUT, { recursive: true })

const IMAGES = {
  'bano-renovado.jpg': 'photo of a freshly renovated small bathroom in an argentine apartment, new white ceramic toilet and bidet, chrome single-handle faucet, clean tiled walls, natural light, realistic interior photograph',
  'griferia-cocina.jpg': 'close-up photo of a new chrome single-handle kitchen faucet installed on a clean stainless steel sink, modern renovated kitchen counter, realistic photograph',
  'materiales-entrega.jpg': 'photo of plumbing supply delivery at a building entrance door: bundles of white ppr pipes, a bag of cement and a small toolbox on the floor, urban hallway, realistic photograph',
}

const zai = await ZAI.create()
for (const [name, prompt] of Object.entries(IMAGES)) {
  const out = path.join(OUT, name)
  if (fs.existsSync(out)) { console.log(`${name}: ya existe`); continue }
  const t0 = Date.now()
  const res = await zai.images.generations.create({ prompt, size: '1024x1024' })
  fs.writeFileSync(out, Buffer.from(res.data[0].base64, 'base64'))
  console.log(`${name}: OK (${Math.round((Date.now() - t0) / 100) / 10}s)`)
}
