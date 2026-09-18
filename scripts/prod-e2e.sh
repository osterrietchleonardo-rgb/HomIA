#!/bin/bash
# E2E visual sobre el build de PRODUCCIÓN standalone (puerto 3100)
# Verifica: landing renderizada, login por UI, panel, directorio, perfil,
# PDF por click y móvil 390 — con capturas en shots/prod/.
set -u
AB="agent-browser"
BASE="http://127.0.0.1:3100"
SHOT=shots/prod
mkdir -p $SHOT
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }
waitfor() { # waitfor <texto> <desc> — espera hasta 15s a que aparezca el texto
  local t=0
  while [ $t -lt 15 ]; do
    if $AB snapshot 2>/dev/null | tr -d '\\' | grep -q "$1"; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (no apareció '$1')"; return 1
}
waitfor_el() { # waitfor_el <selector> <desc> — espera a que exista el elemento
  local t=0
  while [ $t -lt 15 ]; do
    if $AB eval "document.querySelector('$1') ? 'yes' : 'no'" 2>/dev/null | tr -d '\\"' | grep -q yes; then ck 0 "$2"; return 0; fi
    sleep 1; t=$((t+1))
  done
  ck 1 "$2 (selector $1 no apareció)"; return 1
}

# ── servidor de producción vivo ──
if ! curl -s -o /dev/null --max-time 3 $BASE/; then
  echo "server caído, re-levantando…"
  (setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server.log 2>&1 &)
  sleep 4
fi

$AB close 2>/dev/null; sleep 1  # close mata el browser: el open siguiente es cold-start

echo "── F1: landing (catch-all sin slug) ──"
$AB open "$BASE/" > /dev/null 2>&1; $AB set viewport 1280 800 > /dev/null 2>&1; sleep 2
waitfor "HomIA" "landing renderiza con marca HomIA"
$AB screenshot $SHOT/01-landing.png > /dev/null 2>&1

echo "── F2: login por UI (cliente) ──"
# IMPORTANTE: entrar por PATHNAME (/ingresar → catch-all → AppRoot). Un goto de
# '/' a '/#/ingresar' no recarga (misma URL + hash) y el landing seguiría montado.
$AB navigate "$BASE/ingresar" > /dev/null 2>&1
waitfor_el "input[type=email]" "pantalla de login (input email presente)"
$AB eval "
const email = document.querySelector('input[type=email]');
const pass = document.querySelector('input[type=password]');
if (email && pass) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(email, 'cliente@homia.test');
  email.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(pass, 'Homy2026!');
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  'filled'
} else 'no-form'
" > /tmp/ab-login.txt 2>&1
grep -q "filled" /tmp/ab-login.txt; ck $? "form de login completado"
$AB eval "
const form = email2 = null;
const btn = Array.from(document.querySelectorAll('button[type=submit], button')).find(b => /ingresar|entrar/i.test(b.textContent||''));
if (btn) { btn.click(); 'clicked' } else 'no-btn'
" > /tmp/ab-click.txt 2>&1
grep -q "clicked" /tmp/ab-click.txt; ck $? "click en ingresar"
waitfor "panel\|Tu panel\|dashboard" "login OK → panel del cliente"
$AB screenshot $SHOT/02-panel-cliente.png > /dev/null 2>&1

echo "── F3: directorio + perfil pro ──"
$AB navigate "$BASE/#/directorio" > /dev/null 2>&1; sleep 3
waitfor "Matías Ferrer" "directorio con tarjeta del profesional demo"
$AB screenshot $SHOT/03-directorio.png > /dev/null 2>&1
$AB eval "
const btn = document.querySelector('[aria-label*=\"Abrir tarjeta\"]') || Array.from(document.querySelectorAll('button')).find(b => /Abrir tarjeta/i.test(b.getAttribute('aria-label')||''));
if (btn) { btn.click(); 'clicked' } else 'no-btn'
" > /tmp/ab-card.txt 2>&1
grep -q "clicked" /tmp/ab-card.txt; ck $? "abrir tarjeta de perfil"
sleep 2
waitfor "Contratar\|Contactar" "perfil pro con CTAs"
$AB screenshot $SHOT/04-perfil-pro.png > /dev/null 2>&1

echo "── F4: mensajería ──"
$AB navigate "$BASE/#/mensajes" > /dev/null 2>&1; sleep 3
waitfor "Valentina\|Matías\|Ferrer" "bandeja con conversaciones demo"
$AB screenshot $SHOT/05-mensajes.png > /dev/null 2>&1

echo "── F5: PDF desde facturas del cliente ──"
$AB navigate "$BASE/#/panel/cliente/facturas" > /dev/null 2>&1; sleep 3
$AB snapshot 2>/dev/null | tr -d '\\' | grep -q "PDF"; ck $? "botón PDF visible en facturas"
$AB screenshot $SHOT/06-facturas.png > /dev/null 2>&1
# fetch del PDF dentro del navegador (valida route handler en prod)
$AB eval "(async () => { const pr = await (await fetch('/api/projects')).json(); const list = pr.asClient || pr.projects || []; let inv = null; for (const p of list) { if (p.invoices && p.invoices.length) { inv = p.invoices[0]; break; } } if (!inv) return 'no-invoice'; const r = await fetch('/api/invoices/' + inv.id + '/pdf'); const t = await r.text(); return t.startsWith('%PDF') ? 'pdf-ok' : 'pdf-bad'; })()" > /tmp/ab-pdf.txt 2>&1
sleep 2
grep -q "pdf-ok" /tmp/ab-pdf.txt; ck $? "PDF real servido en producción ($(cat /tmp/ab-pdf.txt | tr -d '\\\\' | head -c 80))"

echo "── F6: consola limpia ──"
$AB console 2>/dev/null | grep -ci "error" > /tmp/ab-console.txt || true
N=$(cat /tmp/ab-console.txt)
if [ "${N:-0}" = "0" ]; then ck 0 "0 errores de consola"; else ck 1 "$N errores de consola"; fi

echo "── F7: móvil 390 sin overflow ──"
$AB close > /dev/null 2>&1; sleep 1
$AB open "$BASE/#/directorio" > /dev/null 2>&1; $AB set viewport 390 844 > /dev/null 2>&1; sleep 3
waitfor "Matías Ferrer" "directorio móvil carga (viewport real 390)"
$AB eval "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 ? 'sin-overflow' : 'overflow ' + document.documentElement.scrollWidth" > /tmp/ab-mobile.txt 2>&1
grep -q "sin-overflow" /tmp/ab-mobile.txt; ck $? "directorio móvil sin scroll horizontal"
$AB screenshot $SHOT/07-directorio-movil.png > /dev/null 2>&1

echo ""
echo "════════════════════════════════════"
echo "E2E VISUAL PRODUCCIÓN: $PASS pass · $FAIL fail"
exit $FAIL
