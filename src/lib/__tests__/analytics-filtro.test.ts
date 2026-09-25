import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registroHabilitado, esNavegadorAutomatizado } from '../analytics/filtro'

test('solo registra en producción o con la marca de pruebas', () => {
  assert.equal(registroHabilitado({ VERCEL_ENV: 'production' }), true)
  assert.equal(registroHabilitado({ VERCEL_ENV: 'preview' }), false)
  assert.equal(registroHabilitado({}), false) // server local contra la base única
  assert.equal(registroHabilitado({ ANALYTICS_EN_DESARROLLO: '1' }), true) // suite E2E de métricas
})

test('descarta navegadores automatizados y robots, no a las personas', () => {
  assert.equal(esNavegadorAutomatizado('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36'), true)
  assert.equal(esNavegadorAutomatizado('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true)
  assert.equal(esNavegadorAutomatizado('curl/8.4.0'), true)
  assert.equal(esNavegadorAutomatizado(''), true)
  assert.equal(esNavegadorAutomatizado('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false)
  assert.equal(esNavegadorAutomatizado('Mozilla/5.0 (Linux; Android 14; Cubot KingKong) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'), false)
  assert.equal(esNavegadorAutomatizado('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'), false)
})

test('la cuenta del dueño (ADMIN_EMAIL) no cuenta', async () => {
  const { esEmailDelDueno } = await import('../analytics/filtro')
  assert.equal(esEmailDelDueno(' Dueno@Vakdor.com ', { ADMIN_EMAIL: 'dueno@vakdor.com' }), true)
  assert.equal(esEmailDelDueno('cliente@gmail.com', { ADMIN_EMAIL: 'dueno@vakdor.com' }), false)
  assert.equal(esEmailDelDueno('dueno@vakdor.com', {}), false)
})
