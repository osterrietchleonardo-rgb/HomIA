#!/bin/bash
# Re-shot final del dropdown abierto (usuario efímero otra vez)
cd /home/z/my-project
mkdir -p shots/role-switcher
setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && break; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -c /tmp/homy-rs2.txt \
  -d '{"email":"role.switch@homia.test","password":"RoleSwitch2026!","displayName":"Role Switch","roles":["cliente","profesional","proveedor"],"businessName":"Ferretería Glass"}' >/dev/null

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/panel/cliente" --viewport 1280 800 >/dev/null 2>&1; sleep 2
agent-browser eval "(async()=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'role.switch@homia.test',password:'RoleSwitch2026!'})});return 'ok'})()" >/dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/panel/cliente" >/dev/null 2>&1; sleep 2
agent-browser click 'button[aria-haspopup="menu"]' >/dev/null 2>&1; sleep 0.5
agent-browser eval "(()=>{const descs=[...document.querySelectorAll('[role=menu] .text-\\[11px\\]')];return JSON.stringify({truncados:descs.filter(d=>d.scrollWidth>d.clientWidth+1).map(d=>d.textContent)})})()" 2>&1 | tail -1
agent-browser screenshot shots/role-switcher/05-final-desktop.png >/dev/null 2>&1 && echo "shot final OK"
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
agent-browser screenshot shots/role-switcher/06-final-mobile.png >/dev/null 2>&1 && echo "shot mobile OK"

cat > scripts/limpieza/cleanup-role-switch-user.js << 'EOF'
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
bun scripts/limpieza/cleanup-role-switch-user.js
echo "=== RESHOT COMPLETA ==="
