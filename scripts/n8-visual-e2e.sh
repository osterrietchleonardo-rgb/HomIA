#!/bin/bash
# E2E visual N8 — reputación del cliente, marketplace de materiales para clientes,
# planes de proveedor (Basic US$50 / PRO US$100), analítica PRO, ventas directas,
# Recomendado en directorio y sponsors en home. Desktop 1280×800 + móvil 390×844.
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/n8
mkdir -p $SHOT
PASS=0; FAIL=0
CB="$RANDOM$RANDOM"
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2 — $(cat /tmp/ab-n8.txt 2>/dev/null | tr -d '\"' | head -c 140)"; fi }
waitfor() {
  local t=0
  while [ $t -lt 20 ]; do
    if $AB snapshot 2>/dev/null | tr -d '\\' | grep -q "$1"; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (no apareció '$1')"; return 1
}
waitfor_el() {
  local t=0
  while [ $t -lt 20 ]; do
    if $AB eval "document.querySelector('$1') ? 'yes' : 'no'" 2>/dev/null | tr -d '\\"' | grep -q yes; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (selector $1 no apareció)"; return 1
}
ev() { $AB eval "$1" > /tmp/ab-n8.txt 2>&1; }
wait_text() {
  local t=0
  while [ $t -lt 22 ]; do
    ev "document.body && document.body.innerText.toLowerCase().includes('$1'.toLowerCase()) ? 'yes' : 'no'"
    if grep -q 'yes' /tmp/ab-n8.txt 2>/dev/null; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (no apareció '$1')"; return 1
}
login() {
  $AB navigate "$BASE/ingresar?cb=$CB" > /dev/null 2>&1
  waitfor_el "input[type=email]" "login ($1)"
  $AB eval "
(() => {
  const email = document.querySelector('input[type=email]');
  const pass = document.querySelector('input[type=password]');
  if (!email || !pass) return 'no-form';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(email, '$1');
  email.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(pass, 'Homy2026!');
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = Array.from(document.querySelectorAll('button')).find(b => /ingresar|entrar/i.test(b.textContent||''));
  if (btn) btn.click();
  return 'ok'
})()" > /tmp/ab-n8.txt 2>&1
  grep -q 'ok' /tmp/ab-n8.txt; ck $? "login $1 enviado"
  sleep 3
}
skip_tour() {
  $AB eval "(() => { ['cliente','profesional','proveedor'].forEach(r => localStorage.setItem('homy_tour_done_'+r, '1')); const t = document.querySelector('button[aria-label=\"Salir del tour\"]'); if (t) t.click(); return 'ok' })()" > /dev/null 2>&1
  sleep 1
}
logout() { $AB eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Cerrar sesión/i.test(x.title||x.getAttribute('aria-label')||'')); if (b) { b.click(); return 'ok' } return 'no-btn' })()" > /dev/null 2>&1; sleep 2; }
no_h_overflow() {
  ev "(() => { const d = document.documentElement; return 'h:' + (d.scrollWidth > d.clientWidth + 1 ? 'OVERFLOW' : 'ok') + ' sw:' + d.scrollWidth + ' cw:' + d.clientWidth })()"
  grep -q 'h:ok' /tmp/ab-n8.txt; ck $? "sin scroll horizontal ($(cat /tmp/ab-n8.txt | tr -d '\"' | head -c 60))"
}

# ── servidor de producción ──
SPID=$(ss -tlnp 2>/dev/null | grep ':3100' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$SPID" ]; then kill -9 $SPID 2>/dev/null; sleep 1; fi
(setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server-n8.log 2>&1 &)
for i in $(seq 1 25); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
CODE0=$(curl -s $BASE/ | grep -c "HomIA")
[ "$CODE0" -ge 1 ] && ck 0 "server standalone responde" || ck 1 "server standalone responde"

# ══ CLIENTE: marketplace de materiales ══
echo "── Cliente: Materiales (1280×800) ──"
$AB close 2>/dev/null; sleep 1
$AB open "$BASE/?cb=$CB" > /dev/null 2>&1
$AB set viewport 1280 800 > /dev/null 2>&1
sleep 2
login "cliente@homia.test"
skip_tour
$AB navigate "$BASE/panel/cliente/materiales?cb=$CB" > /dev/null 2>&1; sleep 4
ev "(() => { const i = document.querySelector('input[aria-label=\\'Buscar materiales\\']'); if (!i) return 'no-input'; const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, 'cemento'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()"
grep -q 'typed' /tmp/ab-n8.txt; ck $? "buscador acepta consulta (cemento)"
sleep 3
wait_text "Cemento" "marketplace muestra resultados con ofertas"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Ferrer" && ck 0 "oferta con proveedor visible" || ck 1 "proveedor en oferta"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Pedir este producto" && ck 0 "botón 'Pedir este producto'" || ck 1 "botón pedir"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -qi "VENDE POR" && ck 0 "explicación de unidad de venta" || ck 1 "unidad de venta"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -qi "Recomendado" && ck 0 "etiqueta Recomendado en oferta PRO" || ck 1 "badge recomendado"
$AB screenshot $SHOT/01-cliente-marketplace.png > /dev/null 2>&1

# Mis compras
ev "(() => { const t = Array.from(document.querySelectorAll('[role=tab]')).find(x => /Mis compras/.test(x.textContent||'')); if (t) { t.click(); return 'ok' } return 'no' })()"
grep -q 'ok' /tmp/ab-n8.txt; ck $? "abre tab Mis compras"
sleep 2
waitfor "Pagado" "compra demo pagada visible"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Calificar tu compra\|Ya calificaste" && ck 0 "CTA de reseña por compra visible" || ck 1 "CTA reseña"
$AB screenshot $SHOT/02-cliente-mis-compras.png > /dev/null 2>&1

# 390 móvil
$AB set viewport 390 844 > /dev/null 2>&1; sleep 2
no_h_overflow
$AB screenshot $SHOT/03-cliente-compras-390.png > /dev/null 2>&1
$AB navigate "$BASE/panel/cliente/materiales?cb=$CB" > /dev/null 2>&1; sleep 3
no_h_overflow
$AB screenshot $SHOT/04-cliente-marketplace-390.png > /dev/null 2>&1
logout

# ══ PROVEEDOR: plan + analítica + ventas ══
echo "── Proveedor: Plan + analítica + ventas (1280×800) ──"
$AB set viewport 1280 800 > /dev/null 2>&1
login "proveedor@homia.test"
skip_tour
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 4
waitfor "Analítica del negocio" "dashboard con analítica PRO"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Elementos más pedidos" && ck 0 "sección elementos más pedidos" || ck 1 "elementos pedidos"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Mi plan de suscripción" && ck 0 "acceso rápido a Mi plan" || ck 1 "quick link plan"
$AB screenshot $SHOT/05-proveedor-dashboard-analytics.png > /dev/null 2>&1

$AB navigate "$BASE/panel/proveedor/plan?cb=$CB" > /dev/null 2>&1; sleep 3
wait_text 'US\$50' "plan Básico con precio"
wait_text 'US\$100' "plan PRO con precio"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Sponsor en la home" && ck 0 "beneficio sponsor explicado" || ck 1 "sponsor benefit"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "14 días\|prueba" && ck 0 "referencia a prueba gratis" || ck 1 "trial ref"
$AB screenshot $SHOT/06-proveedor-plan.png > /dev/null 2>&1

$AB navigate "$BASE/panel/proveedor/cobros?tab=ventas&cb=$CB" > /dev/null 2>&1; sleep 3
waitfor "Ventas directas" "tab ventas visible"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Cemento Portland" && ck 0 "ventas demo visibles" || ck 1 "ventas demo"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Reputación del cliente" && ck 0 "reputación del cliente en cada venta" || ck 1 "reputación en venta"
$AB screenshot $SHOT/07-proveedor-ventas.png > /dev/null 2>&1

# chat: reputación del cliente
$AB navigate "$BASE/panel/proveedor/mensajes?cb=$CB" > /dev/null 2>&1; sleep 3
ev "(() => { const cs = Array.from(document.querySelectorAll('aside button')); const c = cs.find(x => /Valentina/.test(x.textContent||'')) || cs[0]; if (c) { c.click(); return 'open:' + cs.length } return 'no' })()"
grep -q 'open\|"open"' /tmp/ab-n8.txt; ck $? "abre conversación con la cliente ($(cat /tmp/ab-n8.txt | tr -d '"' | head -c 20))"
sleep 3
wait_text "Reputación" "botón reputación del cliente en el chat"
ev "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Reputación/.test(x.textContent||'')); if (b) { b.click(); return 'open' } return 'no' })()"
grep -q 'open' /tmp/ab-n8.txt; ck $? "drawer reputación abre"
sleep 3
wait_text "obras finalizadas" "resumen con obras del cliente"
$AB screenshot $SHOT/08-chat-reputacion-cliente.png > /dev/null 2>&1
ev "(() => { const b = document.querySelector('[role=dialog] button[aria-label=Cerrar]'); if (b) { b.click(); return 'ok' } return 'no' })()"
sleep 1
logout

# ══ DIRECTORIO Recomendado + SPONSORS HOME + PERFIL PRO ══
echo "── Directorio + home + perfil (1280×800) ──"
login "cliente@homia.test"
skip_tour
$AB navigate "$BASE/panel/cliente/directorio?cb=$CB" > /dev/null 2>&1; sleep 4
ev "(() => { const first = document.querySelector('article'); if (!first) return 'no'; return first.textContent.includes('Recomendado') ? 'ok' : 'first:' + first.textContent.slice(0, 60) })()"
grep -q 'ok\|"ok"' /tmp/ab-n8.txt; ck $? "directorio: primera tarjeta es el Recomendado ($(cat /tmp/ab-n8.txt | tr -d '\"' | head -c 80))"
$AB screenshot $SHOT/09-directorio-recomendado.png > /dev/null 2>&1
logout

$AB navigate "$BASE/?cb=$CB" > /dev/null 2>&1; sleep 3
wait_text "Sponsors de nuestra confianza" "home con sección sponsors"
wait_text "Ferrer Hnos." "sponsor Ferrer visible en home"
$AB screenshot $SHOT/10-home-sponsors.png > /dev/null 2>&1

echo "── Profesional: perfil sin venta PRO + reputación en proyecto (1280×800) ──"
login "profesional@homia.test"
skip_tour
$AB navigate "$BASE/panel/profesional/perfil?cb=$CB" > /dev/null 2>&1; sleep 3
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Suscribirme al plan PRO" && ck 1 "profesional ya no puede comprar PRO" || ck 0 "profesional ya no puede comprar PRO"
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "gratis para clientes y profesionales" && ck 0 "nota: HomIA es gratis para pros" || ck 1 "nota gratis"
# proyecto → ver reputación
$AB navigate "$BASE/panel/profesional/proyectos?cb=$CB" > /dev/null 2>&1; sleep 3
ev "(() => { const l = Array.from(document.querySelectorAll('a,button')).find(x => /Reforma|baño|cocina/i.test(x.textContent||'')); if (l) { l.click(); return 'open' } return 'empty' })()"
sleep 3
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Ver reputación" && ck 0 "botón Ver reputación en proyecto" || ck 1 "ver reputación en proyecto"
$AB screenshot $SHOT/11-proyecto-reputacion.png > /dev/null 2>&1

# ══ móvil 390 del proveedor ══
echo "── Proveedor móvil 390×844 ──"
$AB set viewport 390 844 > /dev/null 2>&1; sleep 2
logout
login "proveedor@homia.test"
skip_tour
$AB navigate "$BASE/panel/proveedor/plan?cb=$CB" > /dev/null 2>&1; sleep 3
wait_text 'US\$50' "plan screen móvil"
no_h_overflow
$AB screenshot $SHOT/12-plan-390.png > /dev/null 2>&1
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 3
no_h_overflow
$AB screenshot $SHOT/13-dashboard-390.png > /dev/null 2>&1

echo
echo "════════════════════════════"
echo "N8 visual: $PASS PASS · $FAIL FAIL"
[ $FAIL -eq 0 ]
