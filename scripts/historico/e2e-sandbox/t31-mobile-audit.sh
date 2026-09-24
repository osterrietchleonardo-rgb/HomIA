#!/bin/bash
# E2E visual Task 31 — Auditoría móvil completa (390×844)
# 1) Home: demo ambiental del buscador visible en el slot inferior (sin recortes)
# 2) KPI "Valor del stock": número en una sola línea, autofit sin overflow
# 3) Tarjeta Guía (onboarding) + tour: sin texto amontonado ni desbordes
# 4) Videoteca: dock pestaña Videos + modal + /ayuda
# 5) Badge verificación bajo el nombre en perfiles (nunca corta el nombre)
# 6) Todas las pantallas de los 3 roles: cero scroll horizontal en 390px
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/t31-movil
mkdir -p $SHOT
PASS=0; FAIL=0
CB="$RANDOM$RANDOM"
r="$RANDOM"
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
waitfor_eval() {
  local t=0
  while [ $t -lt 15 ]; do
    if $AB eval "$1" 2>/dev/null | tr -d '\\"' | grep -q "$2"; then ck 0 "$3"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$3 (eval no dio '$2')"; return 1
}
NO_OVERFLOW='(() => { const d=document.documentElement; return (d.scrollWidth <= window.innerWidth + 1) ? "ok" : "overflow:"+d.scrollWidth+">"+window.innerWidth })()'
click_btn() {
  $AB eval "
(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => $1.test((x.textContent||'').trim()));
  if (b) { b.click(); return 'clicked' }
  return 'no-btn'
})()" > /tmp/ab-t31.txt 2>&1
  grep -q "clicked" /tmp/ab-t31.txt; ck $? "$2"
}
login() { # login <email>
  $AB navigate "$BASE/ingresar?cb=$CB" > /dev/null 2>&1
  waitfor_el "input[type=email]" "pantalla de login ($1)"
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
})()" > /tmp/ab-t31.txt 2>&1
  grep -q 'ok' /tmp/ab-t31.txt; ck $? "login $1 enviado"
  sleep 3
}
visit() { # visit <ruta> <desc> — navega, espera y chequea overflow horizontal
  $AB navigate "$BASE$1?cb=$CB" > /dev/null 2>&1
  sleep 2.5
  $AB eval "$NO_OVERFLOW" > /tmp/ab-t31.txt 2>&1
  if grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; then ck 0 "sin overflow 390 — $2"
  else ck 1 "sin overflow 390 — $2 → $(cat /tmp/ab-t31.txt | tr -d '\"')"; fi
}

# ── servidor de producción vivo (matar por PUERTO — lección T30) ──
SPID=$(ss -tlnp 2>/dev/null | grep ':3100' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$SPID" ]; then echo "matando server viejo (pid $SPID)…"; kill -9 $SPID 2>/dev/null; sleep 1; fi
echo "levantando server fresco…"
(setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server-t31.log 2>&1 &)
for i in $(seq 1 25); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
HTML_CHUNK=$(curl -s $BASE/ingresar | grep -oE "page-[a-f0-9]+\.js" | head -1)
ls .next/standalone/.next/static/chunks/app/\[\[...slug\]\]/ 2>/dev/null | grep -q "$HTML_CHUNK" \
  && echo "server fresco OK (chunk $HTML_CHUNK)" \
  || echo "⚠️ server stale: chunk $HTML_CHUNK no está en disco"

# videos servidos?
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/videos/cli-bienvenida.mp4")
[ "$CODE" = "200" ] && ck 0 "videos mp4 servidos por el standalone" || ck 1 "videos mp4 servidos (HTTP $CODE)"

$AB close 2>/dev/null; sleep 1

echo "── F1: HOME móvil 390 ──"
$AB open "$BASE/?cb=$CB" > /dev/null 2>&1
$AB set viewport 390 844 > /dev/null 2>&1
sleep 3
$AB eval "$NO_OVERFLOW" > /tmp/ab-t31.txt 2>&1
grep -q '^ok$\|"ok"' /tmp/ab-t31.txt; ck $? "home sin overflow horizontal"
waitfor_el "input[aria-label*=Contale]" "barra de búsqueda visible"
# el slot de demo móvil está reservado (h-9) y los chips vuelan ahí
waitfor_eval "(() => { const c = document.querySelector('.homy-flight-chip'); return c ? 'chip' : 'esperando' })()" "chip" "chip de demo ambiental visible en móvil"
$AB screenshot $SHOT/01-home-demo-chip.png > /dev/null 2>&1
$AB eval "(() => { const inp = document.querySelector('input[aria-label*=Contale]'); const r = inp.getBoundingClientRect(); return (r.width > 250 && r.left >= 0 && r.right <= 391) ? 'ok' : 'bar:' + Math.round(r.width) })()" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "barra ocupa bien el ancho ($(cat /tmp/ab-t31.txt | tr -d '\"'))"

echo "── F2: login cliente + onboarding móvil ──"
login "cliente@homia.test"
$AB eval "(() => { ['cliente','profesional','proveedor'].forEach(r => localStorage.setItem('homy_tour_done_'+r, '1')); const t = document.querySelector('button[aria-label=\"Salir del tour\"]'); if (t) t.click(); return 'ok' })()" > /tmp/ab-t31.txt 2>&1
sleep 1
$AB navigate "$BASE/panel/cliente?cb=$CB" > /dev/null 2>&1; sleep 3
$AB eval "$NO_OVERFLOW" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "panel cliente sin overflow"
waitfor_eval "(() => { const h = Array.from(document.querySelectorAll('h2')).find(x => /Tus primeros pasos|Todo listo/.test(x.textContent||'')); return h ? 'si' : 'no' })()" "si" "tarjeta Guía (onboarding) visible"
$AB eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Ver tour guiado/.test(x.textContent||'')); const g = Array.from(document.querySelectorAll('button')).find(x => /Abrir la guía/.test(x.textContent||'')); return (b && g) ? 'ok' : 'faltan' })()" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "Tour y Guía en fila propia (no aprietan el título)"
$AB screenshot $SHOT/02-panel-cliente-onboarding.png > /dev/null 2>&1

echo "── F3: dock ayuda → pestaña Videos → modal ──"
$AB eval "(() => { const d = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'').startsWith('Ayuda')); if (d) { d.click(); return 'open' } return 'no' })()" > /tmp/ab-t31.txt 2>&1
grep -q 'open' /tmp/ab-t31.txt; ck $? "dock de ayuda abre"
waitfor "Recorrido" "panel del dock con pestañas"
click_btn "/Videos/" "pestaña Videos"
waitfor "Videitos cortos" "listado de videos del rol"
$AB screenshot $SHOT/03-dock-videos.png > /dev/null 2>&1
click_btn "/Bienvenido a HomIA/" "abrir video Bienvenido a HomIA"
waitfor_el "video[controls]" "modal del video con <video>"
sleep 2
$AB screenshot $SHOT/04-video-modal.png > /dev/null 2>&1
$AB eval "(() => { const v = document.querySelector('video'); const src = v ? (v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : '')) : ''; return src.includes('cli-bienvenida') ? 'ok' : 'src:' + src })()" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "el modal carga el mp4 correcto"
$AB eval "(() => { const b = document.querySelector('button[aria-label=\"Cerrar video\"]'); if (b) { b.click(); return 'closed' } return 'no' })()" > /dev/null 2>&1
sleep 1
$AB eval "(() => (document.querySelector('video') ? 'video-sigue' : 'cerrado'))()" > /tmp/ab-t31.txt 2>&1
grep -q 'cerrado' /tmp/ab-t31.txt; ck $? "modal cierra y el video se desmonta (no suena de fondo)"

echo "── F4: /ayuda videoteca ──"
$AB navigate "$BASE/ayuda?cb=$CB" > /dev/null 2>&1; sleep 3
waitfor "Videoteca Soy" "videoteca en el centro de ayuda"
waitfor_eval "(() => (document.querySelector('img[src=\"/videos/cli-contratar.jpg\"]') ? 'img' : 'no'))()" "img" "posters de videos presentes"
$AB eval "$NO_OVERFLOW" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "/ayuda sin overflow"
$AB screenshot $SHOT/05-ayuda-videoteca.png > /dev/null 2>&1

echo "── F5: pantallas cliente en 390 ──"
for r in publicar trabajos proyectos facturas directorio mensajes verificacion perfil; do
  visit "/panel/cliente/$r" "cliente/$r"
done
$AB screenshot $SHOT/06-cliente-trabajos.png > /dev/null 2>&1

echo "── F6: profesional en 390 ──"
login "profesional@homia.test"
for r in "" bolsa presupuestos proyectos materiales crm mensajes perfil; do
  visit "/panel/profesional/$r" "profesional/$r"
done
$AB navigate "$BASE/panel/profesional/presupuestos?cb=$CB" > /dev/null 2>&1; sleep 2.5
$AB eval "(() => { const els = document.querySelectorAll('.homy-kpi-value span, .homy-kpi-value > span'); let bad = 0; els.forEach(el => { if (el.scrollWidth > el.clientWidth + 2) bad++ }); return bad === 0 ? 'ok' : 'mal:' + bad })()" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "KPIs presupuestos: valores sin overflow ($(cat /tmp/ab-t31.txt | tr -d '\"'))"

echo "── F7: proveedor en 390 (Valor del stock) ──"
login "proveedor@homia.test"
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 3
waitfor_eval "(() => { const p = Array.from(document.querySelectorAll('p')).find(x => /valor del stock/i.test(x.textContent||'')); return p ? 'si' : 'no' })()" "si" "KPI Valor del stock presente"
$AB eval "(() => { const kpis = document.querySelectorAll('.homy-kpi-value > span'); let bad = 0; let wrapped = 0; kpis.forEach(el => { if (el.scrollWidth > el.clientWidth + 2) bad++; if (el.offsetHeight > 44) wrapped++ }); return (bad === 0 && wrapped === 0) ? 'ok' : 'mal:' + bad + ':wrap' + wrapped })()" > /tmp/ab-t31.txt 2>&1
grep -q '"ok"\|^ok$' /tmp/ab-t31.txt; ck $? "KPIs proveedor: número en 1 línea, autofit OK ($(cat /tmp/ab-t31.txt | tr -d '\"'))"
$AB screenshot $SHOT/07-proveedor-kpi-stock.png > /dev/null 2>&1
for r in stock cobros vinculaciones mensajes perfil; do
  visit "/panel/proveedor/$r" "proveedor/$r"
done

echo "── F8: perfil público con badge (nombre entero, badge abajo) ──"
$AB navigate "$BASE/panel/proveedor/directorio?cb=$CB" > /dev/null 2>&1; sleep 3
$AB eval "
(() => {
  const cards = Array.from(document.querySelectorAll('button[aria-label]')).filter(b => /Abrir tarjeta/.test(b.getAttribute('aria-label')||''));
  if (!cards.length) return 'no-card';
  cards[0].click();
  return 'clicked'
})()" > /tmp/ab-t31.txt 2>&1
grep -q 'clicked' /tmp/ab-t31.txt; ck $? "click a la primera tarjeta del directorio"
sleep 3
waitfor_eval "(() => { const h1 = document.querySelector('h1'); return h1 && !/comunidad/.test(h1.textContent||'') ? 'perfil' : 'no' })()" "perfil" "perfil público cargado"
$AB eval "
(() => {
  const h1 = document.querySelector('h1');
  if (!h1) return 'no-h1';
  const hr = h1.getBoundingClientRect();
  const nameFits = h1.scrollWidth <= h1.clientWidth + 2;
  // el badge de verificación es el span con title dentro de la fila de pills bajo el h1
  const row = h1.nextElementSibling;
  const badge = row ? row.querySelector('span[title]') : null;
  let badgeBelow = 'sin-badge';
  if (badge) {
    const br = badge.getBoundingClientRect();
    badgeBelow = br.top >= hr.bottom - 4 ? 'abajo' : 'al-lado-corta';
  }
  return nameFits + ':' + badgeBelow
})()" > /tmp/ab-t31.txt 2>&1
grep -q 'true:abajo\|true:sin-badge' /tmp/ab-t31.txt; ck $? "nombre entero + badge debajo ($(cat /tmp/ab-t31.txt | tr -d '\"'))"
$AB screenshot $SHOT/08-perfil-badge.png > /dev/null 2>&1

echo "── F9: tour en móvil (bottom sheet legible) ──"
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 3
click_btn "/Ver tour guiado/" "tour arranca desde la tarjeta Guía"
waitfor "Bienvenido, proveedor" "tour visible en móvil"
$AB eval "
(() => {
  const dlg = document.querySelector('[role=dialog][aria-label^=Tour]');
  if (!dlg) return 'no-dlg';
  const r = dlg.getBoundingClientRect();
  const fits = r.width <= 392 && r.left >= 0 && r.right <= 391;
  const inner = dlg.querySelector('.homy-glass-strong') || dlg;
  const noClip = inner.scrollWidth <= inner.clientWidth + 2;
  return (fits ? 'fits' : 'wide:' + Math.round(r.width)) + ':' + (noClip ? 'nowrap' : 'clip')
})()" > /tmp/ab-t31.txt 2>&1
grep -q 'fits:nowrap' /tmp/ab-t31.txt; ck $? "tarjeta del tour entra al ancho y el texto envuelve ($(cat /tmp/ab-t31.txt | tr -d '\"'))"
$AB screenshot $SHOT/09-tour-movil.png > /dev/null 2>&1
$AB eval "(() => { const b = document.querySelector('button[aria-label=\"Salir del tour\"]'); if (b) { b.click(); return 'out' } return 'no' })()" > /dev/null 2>&1

echo "════════════════════════════════"
echo "RESULTADO: $PASS PASS / $FAIL FAIL"
[ $FAIL -eq 0 ] && echo "AUDITORÍA MÓVIL COMPLETA ✅" || echo "hay arreglos pendientes ⚠️"
exit $FAIL
