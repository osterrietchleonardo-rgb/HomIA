#!/bin/bash
# E2E "el header del panel prevalece" v2 — esperas determinísticas por polling
cd /home/z/my-project
mkdir -p shots/notif-panel

setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -c /tmp/homy-np.txt \
  -d '{"email":"panel.ctx@homia.test","password":"PanelCtx2026!","displayName":"Panel Ctx","roles":["cliente","profesional"],"businessName":""}' >/dev/null

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/panel/cliente" --viewport 1280 800 >/dev/null 2>&1; sleep 2
agent-browser eval "(async()=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'panel.ctx@homia.test',password:'PanelCtx2026!'})});return 'ok'})()" >/dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/panel/cliente" >/dev/null 2>&1

# helper: poll hasta que el eval devuelve algo que contiene $2 (hasta 20s)
wait_eval() { # $1=js  $2=substring esperado (se limpian las \\\ del output del CLI)
  for i in $(seq 1 20); do
    r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\')
    echo "$r" | rg -q "$2" && { echo "$r"; return 0; }
    sleep 1
  done
  echo "TIMEOUT: $r"
}

# FLOW 1: campanita → notificaciones DENTRO del panel
# (esperar dashboard renderizado antes de tocar la campanita)
wait_eval "(()=>{const t=document.querySelector('.homy-page-title');return JSON.stringify({t:t?t.textContent.trim():null})})()" '"titulo":"Tu panel"' >/dev/null
agent-browser click 'button[aria-label^="Notificaciones"]' >/dev/null 2>&1
wait_eval "(()=>{const aside=!!document.querySelector('aside');const back=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Volver al panel'));const title=document.querySelector('.homy-page-title')?.textContent;return JSON.stringify({enPanel:aside,titulo:title,volverAlPanel:!!back})})()" '"titulo":"Notificaciones"'
agent-browser screenshot shots/notif-panel/01-notificaciones-en-panel.png >/dev/null 2>&1 && echo "shot notif OK"
agent-browser eval "(()=>{const back=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Volver al panel'));back.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.querySelector('.homy-page-title');return JSON.stringify({deVuelta:t?t.textContent.trim():null,aside:!!document.querySelector('aside')})})()" '"titulo":"Tu panel"'

# FLOW 2: /buscar logueado → panel + search header apilado (top 64px)
agent-browser open "http://127.0.0.1:3000/buscar" >/dev/null 2>&1
wait_eval "(()=>{const sh=document.querySelector('header.sticky.top-16');const aside=!!document.querySelector('aside');return JSON.stringify({enPanel:aside,searchHeadTop16:!!sh})})()" 'enPanel":true.*searchHeadTop16":true'
agent-browser eval "(()=>{const sh=document.querySelector('header.sticky.top-16');return JSON.stringify({topComputado:sh?getComputedStyle(sh).top:null})})()" 2>&1 | tail -1
agent-browser screenshot shots/notif-panel/02-buscar-en-panel.png >/dev/null 2>&1 && echo "shot buscar OK"

# FLOW 3: /trabajo/:id inexistente logueado → embebido + botón volver al panel
agent-browser open "http://127.0.0.1:3000/trabajo/no-existe-xyz" >/dev/null 2>&1
wait_eval "(()=>{const aside=!!document.querySelector('aside');const back=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Volver al panel'));return JSON.stringify({enPanel:aside,btnVolverPanel:!!back})})()" '"btnVolverPanel":true'
agent-browser screenshot shots/notif-panel/03-trabajo-en-panel.png >/dev/null 2>&1 && echo "shot trabajo OK"

# FLOW 4: logout → /notificaciones pelada con CTA ingresar
agent-browser open "http://127.0.0.1:3000/panel/cliente" >/dev/null 2>&1; sleep 1.5
agent-browser eval "(()=>{document.querySelector('[aria-label=\"Cerrar sesión\"]').click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
agent-browser open "http://127.0.0.1:3000/notificaciones" >/dev/null 2>&1; sleep 2
agent-browser eval "(()=>{const aside=!!document.querySelector('aside');const cta=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Ingresar');return JSON.stringify({logueadoFuera:true,sinPanel:!aside,ctaIngresar:!!cta})})()" 2>&1 | tail -1

# FLOW 5: volver a loguear y verificar que notificaciones conserva el panel + mobile 390 sin overflow
agent-browser eval "(async()=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'panel.ctx@homia.test',password:'PanelCtx2026!'})});return 'ok'})()" >/dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/notificaciones" >/dev/null 2>&1; sleep 2
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1.5
agent-browser eval "(()=>{const d=document.documentElement;return JSON.stringify({vw:innerWidth,aside:!!document.querySelector('aside'),scrollW:d.scrollWidth,overflow:d.scrollWidth>innerWidth})})()" 2>&1 | tail -1
agent-browser screenshot shots/notif-panel/04-mobile-notif-panel.png >/dev/null 2>&1 && echo "shot mobile OK"

agent-browser errors 2>&1 | tail -2

cat > scripts/cleanup-panel-ctx-user.js << 'EOF'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const email = 'panel.ctx@homia.test'
const u = await db.user.findUnique({ where: { email } })
if (u) {
  await db.notification.deleteMany({ where: { userId: u.id } })
  await db.professionalProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.providerProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.user.delete({ where: { id: u.id } })
  console.log('eliminado', email)
} else console.log('no existe')
await db.$disconnect()
EOF
bun scripts/cleanup-panel-ctx-user.js
echo "=== E2E V2 COMPLETA ==="
