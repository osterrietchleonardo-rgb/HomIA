// Genera los retratos faltantes con el SDK de imágenes
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const PORTRAITS = '/tmp/dni-portraits'
fs.mkdirSync(PORTRAITS, { recursive: true })

const PROMPTS = {
  valentina: 'carnet de identidad passport photo of a young latina woman around 30 years old, neutral expression, front-facing headshot, plain light grey background, even studio lighting, realistic photograph, shoulders visible',
  matias: 'carnet de identidad passport photo of a latino man around 35 years old with short dark hair and light beard, neutral expression, front-facing headshot, plain light grey background, even studio lighting, realistic photograph, shoulders visible',
  ferrer: 'carnet de identidad passport photo of a latino man around 43 years old, short greying hair, neutral expression, front-facing headshot, plain light grey background, even studio lighting, realistic photograph, shoulders visible',
  carolina: 'carnet de identidad passport photo of a latina woman around 33 years old with brown ponytail, neutral expression, front-facing headshot, plain light grey background, even studio lighting, realistic photograph, shoulders visible',
  julian: 'carnet de identidad passport photo of a young latino man around 28 years old, dark curly hair, neutral expression, front-facing headshot, plain light grey background, even studio lighting, realistic photograph, shoulders visible',
}

const zai = await ZAI.create()
for (const [slug, prompt] of Object.entries(PROMPTS)) {
  const out = `${PORTRAITS}/${slug}.jpg`
  if (fs.existsSync(out)) { console.log(`retrato ${slug}: ya existe`); continue }
  const t0 = Date.now()
  const res = await zai.images.generations.create({ prompt, size: '768x768' })
  fs.writeFileSync(out, Buffer.from(res.data[0].base64, 'base64'))
  console.log(`retrato ${slug}: OK (${Math.round((Date.now() - t0) / 100) / 10}s)`)
}
