#!/bin/bash
# E2E RoleSwitcher glass — server + flujo en una sola tool call
cd /home/z/my-project
mkdir -p shots/role-switcher

setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

# usuario efímero con 3 roles
curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -c /tmp/homy-rs.txt \
  -d '{"email":"role.switch@homia.test","password":"RoleSwitch2026!","displayName":"Role Switch","roles":["cliente","profesional","proveedor"],"businessName":"Ferretería Glass"}' | head -c 120; echo

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/panel/cliente" --viewport 1280 800 >/dev/null 2>&1; sleep 2
agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'role.switch@homia.test',password:'RoleSwitch2026!'})});return 'login '+r.status})()" 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/panel/cliente" >/dev/null 2>&1; sleep 2

# 1. estado cerrado
agent-browser screenshot shots/role-switcher/01-cerrado.png >/dev/null 2>&1 && echo "shot cerrado OK"

# 2. abrir dropdown
agent-browser click 'button[aria-haspopup="menu"]' >/dev/null 2>&1; sleep 0.5
agent-browser eval "(()=>{const menu=document.querySelector('[role=menu]');if(!menu)return 'MENU NO ABIERTO';const items=menu.querySelectorAll('[role=menuitemradio]');const checked=menu.querySelector('[aria-checked=true] span:last-child span');return JSON.stringify({abierto:true,opciones:items.length,activo:menu.querySelector('[aria-checked=true]')?.textContent?.slice(0,40),w:Math.round(menu.getBoundingClientRect().width)})})()" 2>&1 | tail -1
agent-browser screenshot shots/role-switcher/02-abierto.png >/dev/null 2>&1 && echo "shot abierto OK"

# 3. click fuera cierra
agent-browser eval "document.querySelector('main').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))" >/dev/null 2>&1; sleep 0.4
agent-browser eval "(()=>{return JSON.stringify({cerradoPorClickFuera:!document.querySelector('[role=menu]')})})()" 2>&1 | tail -1

# 4. reabrir + Escape cierra
agent-browser click 'button[aria-haspopup="menu"]' >/dev/null 2>&1; sleep 0.4
agent-browser eval "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))" >/dev/null 2>&1; sleep 0.4
agent-browser eval "(()=>{return JSON.stringify({cerradoPorEscape:!document.querySelector('[role=menu]')})})()" 2>&1 | tail -1

# 5. cambiar a Profesional
agent-browser click 'button[aria-haspopup="menu"]' >/dev/null 2>&1; sleep 0.4
agent-browser click '[role="menu"] .homy-stagger > button:nth-child(2)' >/dev/null 2>&1; sleep 1.2
agent-browser eval "(()=>{const t=document.querySelector('.homy-page-title');return JSON.stringify({url:location.pathname,titulo:t?t.textContent.trim():null})})()" 2>&1 | tail -1
agent-browser screenshot shots/role-switcher/03-profesional.png >/dev/null 2>&1 && echo "shot profesional OK"

# 6. mobile 390: abrir dropdown sin overflow
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
agent-browser click 'button[aria-haspopup="menu"]' >/dev/null 2>&1; sleep 0.5
agent-browser eval "(()=>{const menu=document.querySelector('[role=menu]');if(!menu)return 'MENU NO ABIERTO';const r=menu.getBoundingClientRect();const d=document.documentElement;return JSON.stringify({vw:innerWidth,menuL:Math.round(r.left),menuR:Math.round(r.right),overflow:d.scrollWidth>innerWidth})})()" 2>&1 | tail -1
agent-browser screenshot shots/role-switcher/04-mobile-abierto.png >/dev/null 2>&1 && echo "shot mobile OK"

# 7. errores JS
agent-browser errors 2>&1 | tail -2

# 8. rollback usuario
bun scripts/limpieza/cleanup-role-switch-user.js 2>/dev/null || { cat > scripts/limpieza/cleanup-role-switch-user.js << 'EOF'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const email = 'role.switch@homia.test'
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
bun scripts/limpieza/cleanup-role-switch-user.js; }
echo "=== E2E COMPLETA ==="
