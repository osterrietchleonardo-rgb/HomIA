#!/bin/bash
# E2E visual Task 29: selector de método de pago (MP/efectivo), modo de
# materiales (¿quién paga los materiales?), reseñas bloqueadas/activas y
# pantalla Cobros del proveedor. Capturas en shots/t29-ui/.
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/t29-ui
mkdir -p $SHOT
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }
waitfor() {
  local t=0
  while [ $t -lt 15 ]; do
    if $AB snapshot 2>/dev/null | tr -d '\\' | grep -q "$1"; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (no apareció '$1')"; return 1
}

# ── servidor de producción vivo ──
if ! curl -s -o /dev/null --max-time 3 $BASE/; then
  echo "server caído, re-levantando…"
  (setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server.log 2>&1 &)
  for i in $(seq 1 20); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
fi

$AB close 2>/dev/null; sleep 1

echo "── F1: login cliente por UI ──"
$AB open "$BASE/ingresar" > /dev/null 2>&1; sleep 2
$AB set viewport 1280 800 > /dev/null 2>&1; sleep 1
$AB snapshot 2>/dev/null | grep -i "email" > /dev/null; ck $? "pantalla de login renderiza"
EVAL=$($AB eval "
(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'cliente@homia.test', password: 'Homy2026!' }) });
  return r.ok ? 'login-ok' : 'login-fail';
})()
" 2>/dev/null | tr -d '"')
echo "    (login por fetch: $EVAL)"

echo "── F2: Facturas del cliente con selector de método ──"
$AB open "$BASE/panel/cliente/facturas" > /dev/null 2>&1; sleep 3
waitfor "Por pagar" "lista de facturas pendientes"
waitfor "Mercado Pago" "botón Mercado Pago visible"
$AB snapshot 2>/dev/null | grep -q "Efectivo"; ck $? "botón Efectivo visible (selector de método)"
$AB snapshot 2>/dev/null | grep -q "el profesional confirma en su panel"; ck $? "explicación del método visible"
$AB screenshot "$SHOT/01-facturas-metodos.png" > /dev/null 2>&1

echo "── F3: detalle de proyecto — ¿quién paga los materiales? + reseñas ──"
PROJ_ID=$(curl -s -b /tmp/t29-client.txt "$BASE/api/projects?role=cliente" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['asClient'][0]['id'])")
$AB open "$BASE/panel/cliente/proyectos/$PROJ_ID" > /dev/null 2>&1; sleep 3
waitfor "Quién paga los materiales" "tarjeta de modo de materiales visible"
$AB snapshot 2>/dev/null | grep -q "Reseñas"; ck $? "sección Reseñas visible (bloqueada o activa)"
$AB snapshot 2>/dev/null | grep -qE "Se activan al finalizar|Quién califica"; ck $? "explicación de reseñas (cuándo/quién)"
$AB screenshot "$SHOT/02-proyecto-modo.png" > /dev/null 2>&1

echo "── F4: panel profesional — selector de modo en proyecto ──"
$AB eval "
(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'profesional@homia.test', password: 'Homy2026!' }) });
  return r.ok ? 'ok' : 'fail';
})()
" > /dev/null 2>&1
$AB open "$BASE/panel/profesional/proyectos" > /dev/null 2>&1; sleep 3
PROJ_ID2=$(curl -s -b /tmp/t29-pro.txt "$BASE/api/projects?role=profesional" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['asPro'][0]['id'] if d['asPro'] else '')")
$AB open "$BASE/panel/profesional/proyectos/$PROJ_ID2" > /dev/null 2>&1; sleep 3
waitfor "Quién paga los materiales" "tarjeta de modo en vista profesional"
$AB snapshot 2>/dev/null | grep -q "Los adelanto yo"; ck $? "opción 'adelanto yo' visible"
$AB snapshot 2>/dev/null | grep -q "El cliente paga los materiales al proveedor"; ck $? "opción 'cliente paga al proveedor' visible"
$AB screenshot "$SHOT/03-pro-modo-selector.png" > /dev/null 2>&1

echo "── F5: pantalla Cobros del proveedor ──"
$AB eval "
(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'proveedor@homia.test', password: 'Homy2026!' }) });
  return r.ok ? 'ok' : 'fail';
})()
" > /dev/null 2>&1
$AB open "$BASE/panel/proveedor/cobros" > /dev/null 2>&1; sleep 3
waitfor "Cobros de materiales" "pantalla Cobros renderiza"
$AB snapshot 2>/dev/null | grep -qE "Sin cobros por ahora|Materiales por cobrar"; ck $? "estado vacío o materiales por cobrar"
$AB screenshot "$SHOT/04-proveedor-cobros.png" > /dev/null 2>&1

echo "── F6: ayuda actualizada ──"
$AB open "$BASE/ayuda" > /dev/null 2>&1; sleep 3
waitfor "Dónde hago cada cosa" "ayuda renderiza"
$AB snapshot 2>/dev/null | grep -q "Mercado Pago o efectivo"; ck $? "ayuda menciona métodos de pago"
$AB screenshot "$SHOT/05-ayuda.png" > /dev/null 2>&1

echo "── F7: móvil 390 sin overflow ──"
$AB open "$BASE/panel/cliente/facturas" > /dev/null 2>&1; sleep 2
$AB set viewport 390 844 > /dev/null 2>&1; sleep 2
OVF=$($AB eval "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ? 'overflow' : 'ok'" 2>/dev/null | tr -d '"')
ck "$([ "$OVF" = "ok" ] && echo 0 || echo 1)" "facturas 390px sin overflow horizontal ($OVF)"
$AB screenshot "$SHOT/06-facturas-mobile.png" > /dev/null 2>&1

$AB close > /dev/null 2>&1
echo ""
echo "════════════════════════════════════"
echo "RESULTADO VISUAL T29: $PASS pass · $FAIL fail"
