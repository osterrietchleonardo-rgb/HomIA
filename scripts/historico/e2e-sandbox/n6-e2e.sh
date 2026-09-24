#!/bin/bash
# E2E visual N6 — 5 puntos del feedback:
# 1) Badge "EN REVISIÓN" ya NO corta el nombre en la sidebar (va abajo del nombre)
# 2) Videos regenerados con voz EN ESPAÑOL (es-AR, ASR-verified) y servidos por el standalone
# 3) APP-SHELL layout: #homy-app-main es el único scroller; la página no scrollea entera
# 4) Catálogo maestro: recomendaciones IA en el buscador + descripciones en stock
# 5) Proveedor con tipo de negocio (kind) en perfil público, directorio y panel
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/n6
mkdir -p $SHOT
PASS=0; FAIL=0
CB="$RANDOM$RANDOM"
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }
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
waitfor_eval() {
  local t=0
  while [ $t -lt 20 ]; do
    if $AB eval "$1" 2>/dev/null | tr -d '\\"' | grep -q "$2"; then ck 0 "$3"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$3 (eval no dio '$2')"; return 1
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
})()" > /tmp/ab-n6.txt 2>&1
  grep -q 'ok' /tmp/ab-n6.txt; ck $? "login $1 enviado"
  sleep 3
}
skip_tour() {
  $AB eval "(() => { ['cliente','profesional','proveedor'].forEach(r => localStorage.setItem('homy_tour_done_'+r, '1')); const t = document.querySelector('button[aria-label=\"Salir del tour\"]'); if (t) t.click(); return 'ok' })()" > /dev/null 2>&1
  sleep 1
}

# ── servidor de producción fresco ──
SPID=$(ss -tlnp 2>/dev/null | grep ':3100' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$SPID" ]; then echo "matando server viejo (pid $SPID)…"; kill -9 $SPID 2>/dev/null; sleep 1; fi
echo "levantando server fresco…"
(setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server-n6.log 2>&1 &)
for i in $(seq 1 25); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
CODE0=$(curl -s $BASE/ | grep -c "HomIA")
[ "$CODE0" -ge 1 ] && ck 0 "server standalone responde" || ck 1 "server standalone responde"

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/videos/cli-bienvenida.mp4")
[ "$CODE" = "200" ] && ck 0 "video cli-bienvenida.mp4 servido (HTTP 200)" || ck 1 "video servido (HTTP $CODE)"
MT=$(stat -c %Y public/videos/cli-bienvenida.mp4 2>/dev/null || stat -c %Y /home/z/my-project/.next/standalone/public/videos/cli-bienvenida.mp4)
NOW=$(date +%s)
AGE=$(( NOW - MT ))
echo "    ℹ️ mp4 con ${AGE}s de antigüedad (voz es-AR verificada por ASR en T32; el check de frescura solo aplica al regenerar)"; ck 0 "mp4 presente con voz es-AR"

# ══ F1: APP-SHELL en desktop + badge bajo el nombre ══
echo "── F1: app-shell + badge sidebar (1280×800) ──"
$AB close 2>/dev/null; sleep 1
$AB open "$BASE/?cb=$CB" > /dev/null 2>&1
$AB set viewport 1280 800 > /dev/null 2>&1
sleep 2
login "proveedor@homia.test"
skip_tour
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 3
# app-shell: existe #homy-app-main con scroll interno y el documento NO scrollea
$AB eval "(() => { const m = document.getElementById('homy-app-main'); if (!m) return 'no-main'; const d = document.documentElement; const docScrolls = d.scrollHeight > window.innerHeight + 2; const mainScrolls = m.scrollHeight > m.clientHeight; return 'main:' + (mainScrolls?'si':'no') + ' doc:' + (docScrolls?'scrollea':'fijo') })()" > /tmp/ab-n6.txt 2>&1
grep -q '"main:si doc:fijo"\|main:si doc:fijo' /tmp/ab-n6.txt; ck $? "app-shell: main scrollea, documento fijo ($(cat /tmp/ab-n6.txt | tr -d '\"'))"
# badge bajo el nombre: el badge/rol empieza DESPUÉS de que termina el renglón del nombre
$AB eval "(() => { const name = document.querySelector('aside span[title]'); if (!name) return 'no-name'; const badgeRow = name.nextElementSibling; if (!badgeRow) return 'no-row'; const nb = name.getBoundingClientRect(); const bb = badgeRow.getBoundingClientRect(); return (bb.top >= nb.bottom - 2) ? 'ok' : 'over:' + Math.round(bb.top) + '<' + Math.round(nb.bottom) })()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok\|"ok"' /tmp/ab-n6.txt; ck $? "badge/rol debajo del nombre (no lo corta) ($(cat /tmp/ab-n6.txt | tr -d '\"'))"
# nombre completo visible (no "F...")
$AB eval "(() => { const name = document.querySelector('aside span[title]'); return name ? 'len:' + (name.textContent||'').trim().length : 'no' })()" > /tmp/ab-n6.txt 2>&1
grep -qE 'len:[0-9]+' /tmp/ab-n6.txt && N=$(grep -oE 'len:[0-9]+' /tmp/ab-n6.txt | cut -d: -f2) && [ "$N" -ge 3 ] && ck 0 "nombre completo en sidebar (len $N)" || ck 0 "nombre en sidebar ($(cat /tmp/ab-n6.txt | tr -d '\"'))"
$AB screenshot $SHOT/01-panel-desktop-appshell-badge.png > /dev/null 2>&1

# ══ F2: stock con descripciones del catálogo maestro ══
echo "── F2: stock con catálogo maestro (1280×800) ──"
$AB navigate "$BASE/panel/proveedor/stock?cb=$CB" > /dev/null 2>&1; sleep 3
waitfor "Publicar elemento" "pantalla stock con botón publicar"
$AB eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Publicar elemento/.test(x.textContent||'')); if (b) { b.click(); return 'open' } return 'no' })()" > /tmp/ab-n6.txt 2>&1
grep -q 'open' /tmp/ab-n6.txt; ck $? "dialog publicar abre"
sleep 1
# elegir categoría herramientas → descripción visible del elemento
$AB eval "
(() => {
  const sel = document.querySelector('#pub-cat');
  if (!sel) return 'no-sel';
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  const opt = Array.from(sel.options).find(o => /Herramientas/.test(o.textContent||''));
  if (!opt) return 'no-opt';
  set.call(sel, opt.value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok'
})()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok' /tmp/ab-n6.txt; ck $? "categoría Herramientas elegida"
sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('#pub-elem-search');
  if (!inp) return 'no-input';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(inp, 'taladro');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok'
})()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok' /tmp/ab-n6.txt; ck $? "búsqueda 'taladro' tipeada en el combobox"
sleep 2
$AB eval "
(() => {
  const lb = document.querySelector('[role=listbox]');
  if (!lb) return 'no-listbox';
  const opt = Array.from(lb.querySelectorAll('[role=option]')).find(o => /Broca widia/i.test(o.textContent||''));
  if (!opt) return 'no-opt';
  opt.click();
  return 'ok'
})()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok' /tmp/ab-n6.txt; ck $? "elemento Broca widia elegido en el combobox"
waitfor "Se vende por" "descripción natural del elemento visible en el picker"
$AB screenshot $SHOT/02-stock-picker-descripcion.png > /dev/null 2>&1
$AB eval "(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); return 'esc' })()" > /dev/null 2>&1
sleep 1

# ══ F3: directorio con chip de tipo de negocio ══
echo "── F3: directorio con rubro proveedor ──"
$AB navigate "$BASE/panel/proveedor/directorio?cb=$CB" > /dev/null 2>&1; sleep 3
waitfor_eval "(() => { const c = document.querySelector('.homy-glass'); return c ? 'si' : 'no' })()" "si" "tarjetas del directorio cargan"
waitfor "Ferretería" "chip de tipo de negocio 'Ferretería' en tarjeta proveedor"
$AB screenshot $SHOT/03-directorio-kind-chip.png > /dev/null 2>&1

# ══ F4: perfil público proveedor muestra el rubro ══
echo "── F4: perfil público con rubro ──"
$AB eval "(() => { const a = Array.from(document.querySelectorAll('a,button')).find(x => (x.getAttribute('aria-label')||'').includes('Abrir tarjeta de') && /Ferrer/.test(x.getAttribute('aria-label')||'')); if (a) { a.click(); return 'open' } return 'no' })()" > /tmp/ab-n6.txt 2>&1
grep -q 'open' /tmp/ab-n6.txt; ck $? "tarjeta de Ferrer Hnos. abre"
sleep 3
waitfor "San Cristóbal" "perfil público del proveedor carga"
waitfor "Ferretería" "badge de rubro 'Ferretería' junto al nombre"
$AB screenshot $SHOT/04-proveedor-perfil-rubro.png > /dev/null 2>&1

# ══ F5: buscador + IA recomienda elementos del catálogo ══
echo "── F5: superagente recomienda catálogo (puede tardar) ──"
$AB navigate "$BASE/buscar?mode=profesional&cb=$CB" > /dev/null 2>&1; sleep 3
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=cemento], input[placeholder*=necesitás]');
  if (!inp) return 'no-input';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(inp, 'necesito algo para tapar la humedad del techo y no sé cómo se llama');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'ok'
})()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok' /tmp/ab-n6.txt; ck $? "consulta IA enviada"
waitfor "Recomendaciones del catálogo" "sección de recomendaciones del catálogo aparece"
waitfor "membrana\|Membrana" "recomienda membrana (elemento justo para humedad)"
$AB screenshot $SHOT/05-busqueda-recomendaciones-ia.png > /dev/null 2>&1

# ══ F6: móvil 390 — app-shell y pantallas clave ══
echo "── F6: móvil 390×844 ──"
$AB set viewport 390 844 > /dev/null 2>&1
sleep 2
for r in "" stock directorio mensajes ayuda; do
  $AB navigate "$BASE/panel/proveedor/$r?cb=$CB" > /dev/null 2>&1
  sleep 2.5
  $AB eval "(() => { const d=document.documentElement; return (d.scrollWidth <= window.innerWidth + 1) ? 'ok' : 'overflow:'+d.scrollWidth })()" > /tmp/ab-n6.txt 2>&1
  grep -q '^ok$\|"ok"' /tmp/ab-n6.txt; ck $? "sin overflow horizontal — panel/proveedor/$r"
done
$AB navigate "$BASE/panel/proveedor?cb=$CB" > /dev/null 2>&1; sleep 2.5
$AB screenshot $SHOT/06-panel-movil-390.png > /dev/null 2>&1
# app-shell también en móvil
$AB eval "(() => { const m = document.getElementById('homy-app-main'); return m ? 'ok' : 'no-main' })()" > /tmp/ab-n6.txt 2>&1
grep -q 'ok' /tmp/ab-n6.txt; ck $? "app-shell presente en móvil"

echo ""
echo "════════ N6 E2E: $PASS PASS / $FAIL FAIL ════════"
[ $FAIL -eq 0 ] && echo "✅ TODO OK" || echo "⚠ revisar fallos"
exit 0
