#!/bin/bash
# E2E seed demo: login de los 3 usuarios y verificación de datos en cada panel
cd /home/z/my-project
mkdir -p shots/demo-users
FAILS=0

setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 25); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 2

wait_eval() { # $1=js  $2=regex esperado
  for i in $(seq 1 20); do
    r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\')
    echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }
    sleep 1
  done
  echo "  TIMEOUT/FALLA → $r"; FAILS=$((FAILS+1)); return 1
}
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});const j=await r.json().catch(()=>({}));return r.status+' '+(j.user?.displayName||'')})()" 2>/dev/null | tail -1 | tr -d '\\'; }
logout() { agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 'ok'})()" >/dev/null 2>&1; }
shot() { agent-browser screenshot "shots/demo-users/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
api() { agent-browser eval "(async()=>{const r=await fetch('$1');const j=await r.json().catch(()=>null);return r.status+' '+JSON.stringify($2)})()" 2>/dev/null | tail -1 | tr -d '\\'; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 1.5; }

echo "════════ 1) CLIENTE — Valentina Ríos ════════"
login 'cliente@homia.test'
go 'panel/cliente'
wait_eval "(()=>{const t=document.querySelector('.homy-page-title');const name=document.body.textContent.includes('Valentina');return JSON.stringify({titulo:t?t.textContent.trim():null,nombreTopbar:name})})()" '"titulo":"Tu panel".*"nombreTopbar":true'
shot 01-cliente-dashboard
api '/api/projects' '({n:j.asClient.length,profs:j.asClient.map(p=>p.proName||p.pro?.user?.displayName||null)})' | head -c 200; echo
go 'panel/cliente/trabajos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({fuga:t.includes('Fuga de agua en cocina'),destape:t.includes('Destape de cañería'),enProceso:t.includes('Renovación de baño')||t.includes('grifería'),cancelado:t.includes('Pintura')})})()" '"fuga":true.*"destape":true'
shot 02-cliente-trabajos
go 'panel/cliente/proyectos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({banio:t.includes('Renovación completa de baño'),cocina:t.includes('grifería')||t.includes('fuga')})})()" '"banio":true'
go 'panel/cliente/facturas'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({factura187:t.includes('A-0001-000187'),factura163:t.includes('A-0001-000163'),pendiente:t.toLowerCase().includes('pendiente'),pagada:t.toLowerCase().includes('pagada')})})()" '"factura187":true.*"pendiente":true'
shot 03-cliente-facturas
logout

echo "════════ 2) PROFESIONAL — Matías Ferrer ════════"
login 'profesional@homia.test'
go 'panel/profesional'
wait_eval "(()=>{const t=document.querySelector('.homy-page-title');const name=document.body.textContent.includes('Matías');return JSON.stringify({titulo:t?t.textContent.trim():null,nombre:name})})()" '"nombre":true'
shot 04-pro-dashboard
go 'panel/profesional/bolsa'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({fuga:t.includes('Fuga de agua en cocina'),destape:t.includes('Destape de cañería en baño')})})()" '"fuga":true.*"destape":true'
go 'panel/profesional/presupuestos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({pendientes:t.toLowerCase().includes('pendiente'),aceptados:t.toLowerCase().includes('aceptado')})})()" '"pendientes":true.*"aceptados":true'
shot 05-pro-presupuestos
go 'panel/profesional/proyectos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({cocina:t.includes('Reparación de fuga'),banio:t.includes('Renovación completa de baño'),escrow:t.toLowerCase().includes('escrow')||t.includes('garantía')})})()" '"banio":true.*"cocina":true'
shot 06-pro-proyectos
go 'panel/profesional/crm'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({obra:t.includes('En obra'),cerrado:t.includes('Cerrado / Facturado'),dealBanio:t.includes('Renovación completa de baño'),valentina:t.includes('Valentina')})})()" '"dealBanio":true'
shot 07-pro-crm
go 'panel/profesional/vinculaciones'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({ferrer:t.includes('Ferrer'),cuentaPrincipal:t.includes('Cuenta principal')})})()" '"cuentaPrincipal":true'
go 'panel/profesional/obras'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({banio:t.includes('Renovación integral de baño'),calefaccion:t.includes('radiadores')})})()" '"banio":true.*"calefaccion":true'
shot 08-pro-obras
logout

echo "════════ 3) PROVEEDOR — Ferrer Hnos. ════════"
login 'proveedor@homia.test'
go 'panel/proveedor'
wait_eval "(()=>{const t=document.body.textContent.includes('Ferrer');const neg=t.includes('Ferretería');return JSON.stringify({nombre:t,negocio:neg})})()" '"nombre":true'
shot 09-prov-dashboard
api '/api/provider/stock' '({n:j.stock.length,porAgotar:j.stock.filter(s=>s.status==="por_agotar").length,agotado:j.stock.filter(s=>s.status==="agotado").length})' | head -c 220; echo
go 'panel/proveedor/stock'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({termo:t.includes('Caño termofusión'),agotado:t.toLowerCase().includes('agotado'),porAgotar:t.toLowerCase().includes('por agotar')||t.toLowerCase().includes('por_agotar')||t.includes('Por agotar'),marcas:t.includes('Ferrum')})})()" '"termo":true.*"agotado":true'
shot 10-prov-stock
go 'panel/proveedor/crm'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({recurrente:t.includes('Cliente recurrente'),pedidoMensual:t.includes('Pedido mensual'),matias:t.includes('Matías Ferrer')})})()" '"pedidoMensual":true.*"matias":true'
shot 11-prov-crm
go 'panel/proveedor/vinculaciones'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({matias:t.includes('Matías Ferrer'),cuenta:t.includes('Cuenta principal'),notas:t.includes('cuenta corriente')||t.includes('Cuenta corriente')||t.includes('30 días')})})()" '"cuenta":true'
shot 12-prov-vinculaciones
logout

echo "════════ API gates finales (con cookie de cliente) ════════"
login 'cliente@homia.test' >/dev/null
api '/api/jobs?mine=1' '({n:j.jobs.length})'
api '/api/notifications' '({n:(j.notifications||j).length||j.notifications?.length||0})' | head -c 120; echo
api '/api/auth/me' '({roles:j.user.roles,Nombre:j.user.displayName})' | head -c 140; echo

echo ""
[ "$FAILS" = "0" ] && echo "✅ E2E COMPLETO: todas las verificaciones pasaron" || echo "⚠️ E2E con $FAILS verificaciones fallidas (revisar arriba)"
