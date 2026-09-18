#!/bin/bash
# Auditoría de anchos E2E — server + mediciones en UNA sola tool call
cd /home/z/my-project
mkdir -p shots/width-audit

# 1. Server en background
setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP tras $((i*3))s"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

# 2. Browser limpio
pkill -9 -f agent-browser 2>/dev/null; sleep 1

measure() { # $1=url-path  $2=etiqueta
  agent-browser open "http://127.0.0.1:3000/$1" --viewport 1920 1080 >/dev/null 2>&1
  sleep 2
  agent-browser eval "(()=>{const m=document.querySelector('main');if(!m)return 'NO MAIN';const page=m.querySelector('.homy-page');if(!page)return 'NO HOMY-PAGE';const pr=page.getBoundingClientRect();let maxR=0,maxL=99999;page.querySelectorAll('.homy-page-head,.homy-stagger,section,form,header').forEach(el=>{const r=el.getBoundingClientRect();if(r.width>60){maxR=Math.max(maxR,r.right);maxL=Math.min(maxL,r.left)}});const pc=(pr.left+pr.right)/2, cc=(maxL+maxR)/2;return JSON.stringify({p:'$2',pageL:Math.round(pr.left),pageR:Math.round(pr.right),cL:Math.round(maxL),cR:Math.round(maxR),centrado:Math.abs(pc-cc)<3,llena:maxR>=pr.right-2})})()" 2>&1 | tail -1
}

# 3. Login proveedor + sus páginas
agent-browser open "http://127.0.0.1:3000/" --viewport 1920 1080 >/dev/null 2>&1; sleep 1.5
agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'width.prov@homia.test',password:'WidthProv2026!'})});return 'login '+r.status})()" 2>&1 | tail -1
measure "panel/proveedor/vinculaciones" "prov/vinculaciones"
measure "panel/proveedor/perfil" "prov/perfil"

# 4. Login cliente+profesional + sus páginas
agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'width.audit@homia.test',password:'WidthAudit2026!'})});return 'login '+r.status})()" 2>&1 | tail -1
measure "panel/cliente/facturas" "cli/facturas"
measure "panel/cliente/perfil" "cli/perfil"
measure "panel/cliente/publicar" "cli/publicar"
measure "panel/profesional/proyecto-detalle/no-existe-xyz" "prof/proyecto-detalle(empty)"
measure "panel/profesional/presupuestos" "prof/presupuestos"

# 5. Capturas clave
agent-browser open "http://127.0.0.1:3000/panel/profesional/presupuestos" >/dev/null 2>&1; sleep 2
agent-browser screenshot shots/width-audit/02-presupuestos-full.png >/dev/null 2>&1 && echo "shot presupuestos OK"
agent-browser open "http://127.0.0.1:3000/panel/cliente/publicar" >/dev/null 2>&1; sleep 2
agent-browser screenshot shots/width-audit/03-publicar-centrado.png >/dev/null 2>&1 && echo "shot publicar OK"

# 6. Mobile 390: una página llena + sin overflow horizontal
agent-browser open "http://127.0.0.1:3000/panel/profesional/presupuestos" --viewport 390 844 >/dev/null 2>&1; sleep 2
agent-browser eval "(()=>{const d=document.documentElement;return JSON.stringify({vw:innerWidth,scrollW:d.scrollWidth,overflow:d.scrollWidth>innerWidth})})()" 2>&1 | tail -1

# 7. Errores JS
agent-browser errors 2>&1 | tail -3
echo "=== AUDITORÍA COMPLETA ==="
