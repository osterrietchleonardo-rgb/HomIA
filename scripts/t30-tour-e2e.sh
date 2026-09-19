#!/bin/bash
# E2E visual Task 30 — Tutorial guiado por rol (tour + dock de ayuda)
# Corre sobre el build de PRODUCCIÓN standalone (:3100). Verifica:
# auto-arranque del tour por rol en 1er ingreso, spotlight sobre secciones reales,
# navegación SPA entre pasos, teclado, salto a sección puntual desde el dock,
# pestañas ¿Cómo hago?/Me trabé, ocultamiento del dock durante el tour, móvil 390.
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/t30-tour
mkdir -p $SHOT
PASS=0; FAIL=0
CB="$RANDOM$RANDOM"  # cache-buster: el profile del browser cachea HTML de builds anteriores
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }
waitfor() {
  local t=0
  while [ $t -lt 15 ]; do
    if $AB snapshot 2>/dev/null | tr -d '\\' | grep -q "$1"; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (no apareció '$1')"; return 1
}
waitfor_el() {
  local t=0
  while [ $t -lt 15 ]; do
    if $AB eval "document.querySelector('$1') ? 'yes' : 'no'" 2>/dev/null | tr -d '\\"' | grep -q yes; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (selector $1 no apareció)"; return 1
}
waitfor_eval() { # waitfor_eval <expr-js> <patrón> <desc> — espera a que el eval devuelva el patrón
  local t=0
  while [ $t -lt 15 ]; do
    if $AB eval "$1" 2>/dev/null | tr -d '\\"' | grep -q "$2"; then ck 0 "$3"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$3 (eval no dio '$2')"; return 1
}
# click en el primer botón cuyo texto matchee
click_btn() { # click_btn <regex> <desc>
  $AB eval "
(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => $1.test((x.textContent||'').trim()));
  if (b) { b.click(); return 'clicked' }
  return 'no-btn'
})()" > /tmp/ab-t30.txt 2>&1
  grep -q "clicked" /tmp/ab-t30.txt; ck $? "$2"
}

# ── servidor de producción vivo ──
# Lección T30: el proceso se renombra a "next-server (v1)" y pkill -f NO lo matchea;
# un server viejo sigue sirviendo HTML con chunks inexistentes (500). Matar por PUERTO.
SPID=$(ss -tlnp 2>/dev/null | grep ':3100' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$SPID" ]; then echo "matando server viejo (pid $SPID)…"; kill -9 $SPID 2>/dev/null; sleep 1; fi
echo "levantando server fresco…"
(setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server.log 2>&1 &)
for i in $(seq 1 20); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
# sanity: el HTML debe referenciar chunks que existen en disco (si no, server stale)
HTML_CHUNK=$(curl -s $BASE/ingresar | grep -oE "page-[a-f0-9]+\.js" | head -1)
ls .next/standalone/.next/static/chunks/app/\[\[...slug\]\]/ | grep -q "$HTML_CHUNK" \
  && echo "server fresco OK (chunk $HTML_CHUNK coincide)" \
  || echo "⚠️ server stale: HTML referencia $HTML_CHUNK que no está en disco"

$AB close 2>/dev/null; sleep 1

echo "── F0: login cliente (storage limpio para que el tour arranque solo) ──"
$AB open "$BASE/?cb=$CB" > /dev/null 2>&1; $AB set viewport 1280 800 > /dev/null 2>&1; sleep 2
$AB eval "(() => { localStorage.clear(); return 'cleared' })()" > /tmp/ab-t30.txt 2>&1
grep -q cleared /tmp/ab-t30.txt; ck $? "localStorage limpio (primer ingreso simulado)"
$AB navigate "$BASE/ingresar?cb=$CB" > /dev/null 2>&1
waitfor_el "input[type=email]" "pantalla de login"
$AB eval "
(() => {
  const email = document.querySelector('input[type=email]');
  const pass = document.querySelector('input[type=password]');
  if (!email || !pass) return 'no-form';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(email, 'cliente@homia.test');
  email.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(pass, 'Homy2026!');
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = Array.from(document.querySelectorAll('button')).find(b => /ingresar|entrar/i.test(b.textContent||''));
  if (btn) btn.click();
  return 'ok'
})()" > /tmp/ab-t30.txt 2>&1
grep -q '"ok"\|ok' /tmp/ab-t30.txt; ck $? "login cliente enviado"
sleep 3
# asegurar raíz del panel y bandera de tour limpia
$AB navigate "$BASE/panel/cliente?cb=$CB" > /dev/null 2>&1; sleep 2
$AB eval "(() => { localStorage.removeItem('homy_tour_done_cliente'); location.reload(); return 'r' })()" > /tmp/ab-t30.txt 2>&1
sleep 4

echo "── F1: tour auto-arranque (cliente) ──"
waitfor "Bienvenido a HomIA" "tour arranca SOLO en el primer ingreso al panel"
$AB screenshot $SHOT/01-tour-bienvenida.png > /dev/null 2>&1

echo "── F2: paso 2 con spotlight sobre el nav real ──"
click_btn "/Siguiente/" "click Siguiente (bienvenida → Inicio)"
waitfor "Tu Inicio" "paso 2: Tu Inicio (título del paso)"
waitfor_eval "(() => { const sp = Array.from(document.querySelectorAll('div')).find(d => d.getAttribute('aria-hidden')==='true' && (d.style.boxShadow||'').includes('9999px')); return sp ? 'spotlight' : 'none' })()" "spotlight" "spotlight pintado sobre la sección"
$AB screenshot $SHOT/02-tour-spotlight-inicio.png > /dev/null 2>&1

echo "── F3: el tour navega por la SPA entre secciones ──"
click_btn "/Siguiente/" "click Siguiente (Inicio → Publicar)"
waitfor "Publicar un trabajo (gratis)" "paso 3: Publicar un trabajo"
$AB eval "(() => (location.hash.includes('publicar') ? 'hash-ok' : 'hash:' + location.hash))()" > /tmp/ab-t30.txt 2>&1
grep -q "hash-ok" /tmp/ab-t30.txt; ck $? "navegación real a /panel/cliente/publicar"
$AB screenshot $SHOT/03-tour-publicar.png > /dev/null 2>&1

echo "── F4: teclado (← →) ──"
$AB eval "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); return 'k' })()" > /dev/null 2>&1
sleep 1
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Mis trabajos: comparar y elegir"; ck $? "flecha → avanza al paso 4 (Mis trabajos)"
$AB eval "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); return 'k' })()" > /dev/null 2>&1
sleep 1
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "Publicar un trabajo (gratis)"; ck $? "flecha ← vuelve al paso 3"

echo "── F5: dock oculto durante el tour + salir con la X ──"
$AB eval "(() => (document.querySelector('[aria-label^=\"Ayuda:\"]') ? 'visible' : 'hidden'))()" > /tmp/ab-t30.txt 2>&1
grep -q hidden /tmp/ab-t30.txt; ck $? "botón de ayuda oculto mientras el tour corre"
$AB eval "(() => { const b = document.querySelector('[aria-label=\"Salir del tour\"]'); if (b) { b.click(); return 'ok' } return 'no-btn' })()" > /tmp/ab-t30.txt 2>&1
grep -q ok /tmp/ab-t30.txt; ck $? "salir del tour con la X (desde paso intermedio)"
waitfor_el '[aria-label^="Ayuda:"]' "botón de ayuda flotante vuelve al terminar"
$AB eval "(() => (localStorage.getItem('homy_tour_done_cliente') === '1' ? 'flag' : 'noflag'))()" > /tmp/ab-t30.txt 2>&1
grep -q flag /tmp/ab-t30.txt; ck $? "tour marcado como visto (no molesta de nuevo)"

echo "── F6: checklist con botón Tour ──"
$AB navigate "$BASE/panel/cliente?cb=$CB" > /dev/null 2>&1; sleep 3
$AB eval "
(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('title')||'').includes('Recorrido guiado'));
  return b ? 'tour-btn' : 'none'
})()" > /tmp/ab-t30.txt 2>&1
grep -q tour-btn /tmp/ab-t30.txt; ck $? "checklist de primeros pasos con botón Tour"

echo "── F7: dock — pestaña ¿Cómo hago? ──"
$AB eval "(() => { const b = document.querySelector('[aria-label^=\"Ayuda:\"]'); if (b) b.click(); return 'ok' })()" > /dev/null 2>&1
waitfor "Empezar recorrido completo" "dock abierto con pestaña Tour"
click_btn "/¿Cómo hago/" "cambiar a pestaña ¿Cómo hago?"
click_btn "/Publicar un trabajo para recibir/" "abrir guía 'Publicar un trabajo'"
waitfor "Entrá a Panel → Publicar trabajo" "guía con pasos numerados"
$AB screenshot $SHOT/04-dock-como-hago.png > /dev/null 2>&1
click_btn "/Ir a publicar/" "CTA 'Ir a publicar' de la guía"
waitfor "Publicar trabajo" "el CTA de la guía navega de verdad"

echo "── F8: dock — pestaña Me trabé ──"
$AB eval "(() => { const b = document.querySelector('[aria-label^=\"Ayuda:\"]'); if (b) b.click(); return 'ok' })()" > /dev/null 2>&1
sleep 1
click_btn "/Me trabé/" "cambiar a pestaña Me trabé"
click_btn "/No me llegan presupuestos/" "abrir atasco 'No me llegan presupuestos'"
waitfor "Qué hacer" "atasco con porqué + solución"
$AB screenshot $SHOT/05-dock-me-trabe.png > /dev/null 2>&1
click_btn "/Editar mi publicación/" "CTA del atasco navega"

echo "── F9: dock — saltar a una sección puntual del tour ──"
$AB eval "(() => { const b = document.querySelector('[aria-label^=\"Ayuda:\"]'); if (b) b.click(); return 'ok' })()" > /dev/null 2>&1
sleep 1
click_btn "/^Tour$/" "volver a la pestaña Tour del dock"
click_btn "/Facturas: pagá como prefieras/" "pedir ver solo la sección Facturas"
waitfor "Facturas: pagá como prefieras" "tour arranca directo en la sección Facturas"
$AB screenshot $SHOT/06-tour-seccion-facturas.png > /dev/null 2>&1
$AB eval "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'k' })()" > /dev/null 2>&1
sleep 1
$AB eval "(() => (document.querySelector('[role=dialog]') ? 'open' : 'closed'))()" > /tmp/ab-t30.txt 2>&1
grep -q closed /tmp/ab-t30.txt; ck $? "Esc cierra el tour"

echo "── F10: centro de ayuda con hero de recorrido ──"
$AB navigate "$BASE/ayuda?cb=$CB" > /dev/null 2>&1; sleep 3
waitfor "Recorrido guiado por rol" "hero del recorrido en el centro de ayuda"
$AB eval "
(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => /Tour Cliente/.test((x.textContent||'').trim()) && !x.disabled);
  return b ? 'btn-ok' : 'none'
})()" > /tmp/ab-t30.txt 2>&1
grep -q btn-ok /tmp/ab-t30.txt; ck $? "botón Tour Cliente habilitado (rol activo)"
$AB screenshot $SHOT/07-ayuda-hero.png > /dev/null 2>&1

echo "── F11: tour por rol correcto (profesional) ──"
$AB eval "(() => { const b = document.querySelector('[aria-label=\"Cerrar sesión\"]'); if (b) b.click(); return 'ok' })()" > /dev/null 2>&1
sleep 2
$AB navigate "$BASE/ingresar?cb=$CB" > /dev/null 2>&1
waitfor_el "input[type=email]" "pantalla de login (profesional)"
$AB eval "
(() => {
  const email = document.querySelector('input[type=email]');
  const pass = document.querySelector('input[type=password]');
  if (!email || !pass) return 'no-form';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(email, 'profesional@homia.test');
  email.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(pass, 'Homy2026!');
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = Array.from(document.querySelectorAll('button')).find(b => /ingresar|entrar/i.test(b.textContent||''));
  if (btn) btn.click();
  return 'ok'
})()" > /tmp/ab-t30.txt 2>&1
grep -q ok /tmp/ab-t30.txt; ck $? "login profesional enviado"
sleep 3
$AB navigate "$BASE/panel/profesional?cb=$CB" > /dev/null 2>&1; sleep 2
$AB eval "(() => { localStorage.removeItem('homy_tour_done_profesional'); location.reload(); return 'r' })()" > /dev/null 2>&1
sleep 4
waitfor "Bienvenido, profesional" "tour del ROL PROFESIONAL con su contenido propio"
$AB screenshot $SHOT/08-tour-profesional.png > /dev/null 2>&1

echo "── F12: móvil 390 — tour como hoja inferior + spotlight en bottom nav ──"
click_btn "/Saltar/" "saltar tour profesional"
$AB set viewport 390 844 > /dev/null 2>&1
$AB eval "(() => { localStorage.removeItem('homy_tour_done_profesional'); location.reload(); return 'r' })()" > /dev/null 2>&1
sleep 4
waitfor "Bienvenido, profesional" "tour en móvil"
click_btn "/Siguiente/" "Siguiente en móvil (→ Inicio)"
waitfor "Resumen de tu actividad" "paso 2 con bottom-nav"
waitfor_eval "(() => { const sp = Array.from(document.querySelectorAll('div')).find(d => d.getAttribute('aria-hidden')==='true' && (d.style.boxShadow||'').includes('9999px')); const anchor = document.querySelector('[data-tour-m=\"nav-inicio\"]'); return (sp && anchor) ? 'mobile-spot' : 'none' })()" "mobile-spot" "spotlight sobre el bottom-nav (ancla móvil)"
$AB screenshot $SHOT/09-tour-movil.png > /dev/null 2>&1
$AB eval "(() => (document.documentElement.scrollWidth <= 392 ? 'no-overflow' : 'overflow:' + document.documentElement.scrollWidth))()" > /tmp/ab-t30.txt 2>&1
grep -q no-overflow /tmp/ab-t30.txt; ck $? "móvil 390 sin overflow horizontal"

echo ""
echo "════════ T30 tour guiado: $PASS pass / $FAIL fail ════════"
$AB close > /dev/null 2>&1
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
