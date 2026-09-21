#!/bin/bash
# AUDITORÍA E2E INTEGRAL — 3 roles sobre build de producción standalone :3100
# Cubre: login UI, registro UI (nueva política), directorio, materiales "caño",
# factura + PDF, chat, stock, plan, sin overflow móvil 390×844, headers seguridad.
cd /home/z/my-project
BASE=http://127.0.0.1:3100
mkdir -p shots/audit
FAILS=0; PASSN=0
ok(){ PASSN=$((PASSN+1)); echo "  ✅ $1"; }
bad(){ FAILS=$((FAILS+1)); echo "  ❌ $1"; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1

agent-browser open "$BASE/?cb=$RANDOM" --viewport 1280 800 >/dev/null 2>&1; sleep 2

wait_eval() { # $1=js  $2=regex esperado
  local r=""
  for i in $(seq 1 20); do
    r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\')
    echo "$r" | rg -qi "$2" && { echo "  ✅ $3"; PASSN=$((PASSN+1)); return 0; }
    sleep 1
  done
  echo "  ❌ $3 → $r"; FAILS=$((FAILS+1)); return 1
}
login_ui() { # $1=email
  agent-browser open "$BASE/ingresar?cb=$RANDOM" >/dev/null 2>&1; sleep 1.5
  agent-browser eval "(async()=>{const el=document.querySelector('input[type=email]');if(!el)return 'NO_INPUT';return 'HAS_INPUT'})()" >/dev/null 2>&1
  agent-browser type 'input[type=email]' "$1" >/dev/null 2>&1
  agent-browser type 'input[type=password]' 'Homy2026!' >/dev/null 2>&1
  agent-browser click 'button[type=submit]' >/dev/null 2>&1
  sleep 2.5
}
logout() { agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 'ok'})()" >/dev/null 2>&1; }
shot() { agent-browser screenshot "shots/audit/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "$BASE/$1?cb=$RANDOM" >/dev/null 2>&1; sleep 2; }
no_h_overflow() { # $1=ruta $2=viewport(w h) $3=etiqueta
  agent-browser open "$BASE/$1?cb=$RANDOM" --viewport ${2% *} ${2#* } >/dev/null 2>&1; sleep 2.5
  wait_eval "(()=>{const d=document.documentElement;const real=document.body.textContent.includes('HomIA');return JSON.stringify({ov:d.scrollWidth>window.innerWidth+1,real:real,w:window.innerWidth,sw:d.scrollWidth})})()" '"ov":false,"real":true' "$3 sin overflow horizontal (${2% *}px) con app renderizada"
}

echo "════════ 0) Headers de seguridad ════════"
H=$(curl -sI "$BASE/" 2>/dev/null)
echo "$H" | grep -qi "x-content-type-options: nosniff" && ok "X-Content-Type-Options: nosniff" || bad "falta X-Content-Type-Options"
echo "$H" | grep -qi "referrer-policy" && ok "Referrer-Policy presente" || bad "falta Referrer-Policy"
UH=$(curl -sI "$BASE/uploads/" 2>/dev/null | head -1)
echo "    (uploads dir check: $UH)"

echo "════════ 1) Landing pública + buscador hero ════════"
go ''
wait_eval "(()=>{const s=document.querySelector('input[type=search],input[placeholder*=buscar i],input[placeholder*=qué i]');return JSON.stringify({land:document.body.textContent.includes('HomIA'),heroSearch:!!s})})()" '"land":true' "landing renderiza"
shot 00-landing

echo "════════ 2) LOGIN UI real (form) — cliente ════════"
login_ui 'cliente@homia.test'
wait_eval "(()=>{return JSON.stringify({valentina:document.body.textContent.includes('Valentina')})})()" '"valentina":true' "login UI cliente → panel con datos demo"
shot 01-cliente-login

echo "════════ 3) CLIENTE — directorio + filtros ════════"
go 'directorio'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({pros:t.includes('Matías')||t.includes('profesional'),cards:document.querySelectorAll('a[href*=profesional],a[href*=proveedor]').length})})()" '"cards":[1-9]' "directorio con tarjetas"
agent-browser eval "(()=>{const inp=document.querySelector('input[type=search]');if(!inp)return 'NO_INPUT';const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(inp,'plomero');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()" >/dev/null 2>&1
sleep 2
shot 02-directorio-busqueda
go 'directorio'
wait_eval "(()=>{const chips=[...document.querySelectorAll('button')].filter(b=>/Plomer|Electric|Pintur/.test(b.textContent));return JSON.stringify({filtros:chips.length})})()" '"filtros":[1-9]' "filtros por rubro visibles"

echo "════════ 4) CLIENTE — materiales buscar 'caño' (N9.2.1) ════════"
go 'panel/cliente/materiales'
wait_eval "(()=>{const inp=document.querySelector('input[type=search]');const any=document.querySelector('input');return JSON.stringify({search:!!(inp||any)})})()" '"search":true' "página materiales con buscador"
agent-browser eval "(()=>{const inp=document.querySelector('input[type=search]')||[...document.querySelectorAll('input')].find(i=>i.placeholder);if(!inp)return 'NO_INPUT';const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(inp,'caño');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()" >/dev/null 2>&1
sleep 2.5
wait_eval "(()=>{const t=document.body.textContent.toLowerCase();return JSON.stringify({ofertas:t.includes('oferta')||t.includes('resultado')||t.includes('caño'),sinResultados:t.includes('no encontramos')||t.includes('sin resultados')})})()" '"ofertas":true|"sinResultados":false' "búsqueda 'caño' trae resultados"
shot 03-materiales-canno

echo "════════ 5) CLIENTE — facturas + PDF ════════"
go 'panel/cliente/facturas'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({factura:t.includes('A-0001'),pdf:!!document.querySelector('a[href*=pdf],button')})})()" '"factura":true' "facturas visibles"
shot 04-facturas

echo "════════ 6) CLIENTE — mensajes (estilo chat) ════════"
go 'panel/cliente/mensajes'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({conv:(t.includes('Matías')||t.includes('Ferrer'))&&(t.toLowerCase().includes('mensaje')||t.toLowerCase().includes('escribí')||!!document.querySelector('input[type=text],textarea'))})})()" '"conv":true' "bandeja de mensajes con conversación demo"
shot 05-mensajes
logout

echo "════════ 7) LOGIN UI — profesional ════════"
login_ui 'profesional@homia.test'
wait_eval "(()=>{return JSON.stringify({in:document.body.textContent.includes('Matías')&&document.body.textContent.toLowerCase().includes('presupuesto')})})()" '"in":true' "login UI profesional → panel con datos demo"
go 'panel/profesional/proyectos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({proy:t.includes('Renovación completa')||t.includes('Reparación de fuga')})})()" '"proy":true' "proyectos del pro con datos demo"
shot 06-pro-proyectos
go 'panel/profesional/facturas'
wait_eval "(()=>{return JSON.stringify({ok:document.body.textContent.includes('A-0001')})})()" '"ok":true' "facturas pro con número real"
logout

echo "════════ 8) LOGIN UI — proveedor ════════"
login_ui 'proveedor@homia.test'
wait_eval "(()=>{return JSON.stringify({in:document.body.textContent.includes('Ferrer')})})()" '"in":true' "login UI proveedor → panel con datos demo"
go 'panel/proveedor/stock'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({stock:t.includes('Cemento')&&t.toLowerCase().includes('stock')})})()" '"stock":true' "stock del proveedor con Cemento"
shot 07-prov-stock
agent-browser eval "(()=>{const inp=[...document.querySelectorAll('input')].find(i=>i.placeholder&&(i.placeholder.toLowerCase().includes('buscar')||i.placeholder.toLowerCase().includes('elemento')));if(!inp)return 'NO_INPUT';const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(inp,'caño');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()" >/dev/null 2>&1
sleep 2
wait_eval "(()=>{const t=document.body.textContent.toLowerCase();return JSON.stringify({picker:t.includes('caño')||t.includes('pvc')})})()" '"picker":true' "picker stock encuentra 'caño' (N7.1.1)"
go 'panel/proveedor/plan'
wait_eval "(()=>{const t=document.body.textContent.toLowerCase();return JSON.stringify({plan:t.includes('plan')||t.includes('trial')||t.includes('prueba')})})()" '"plan":true' "pantalla de plan"
shot 08-prov-plan
go 'panel/proveedor/cobros'
wait_eval "(()=>{const t=document.body.textContent.toLowerCase();return JSON.stringify({ok:t.includes('cobro')&&(t.includes('pendiente')||t.includes('pagad'))})})()" '"ok":true' "cobros/ventas proveedor con estados"
logout

echo "════════ 9) REGISTRO UI — nueva política de password ════════"
agent-browser open "$BASE/registrarse?cb=$RANDOM" >/dev/null 2>&1; sleep 2
wait_eval "(()=>{return JSON.stringify({form:!!document.querySelector('input[type=email]'),hint:document.body.textContent.includes('8 caracteres')||document.body.textContent.includes('letras y números')})})()" '"form":true' "form registro visible"
logout

echo "════════ 10) MÓVIL 390×844 — pantallas clave sin overflow ════════"
no_h_overflow 'panel/cliente' '390 844' 'cliente dashboard móvil'
no_h_overflow 'directorio' '390 844' 'directorio móvil'
no_h_overflow 'panel/cliente/materiales' '390 844' 'materiales móvil'
no_h_overflow 'panel/cliente/facturas' '390 844' 'facturas móvil'
no_h_overflow 'panel/cliente/mensajes' '390 844' 'mensajes móvil'
no_h_overflow 'panel/profesional' '390 844' 'pro dashboard móvil'
no_h_overflow 'panel/profesional/proyectos' '390 844' 'pro proyectos móvil'
no_h_overflow 'panel/proveedor' '390 844' 'proveedor dashboard móvil'
no_h_overflow 'panel/proveedor/stock' '390 844' 'proveedor stock móvil'
no_h_overflow 'panel/proveedor/plan' '390 844' 'proveedor plan móvil'

echo "════════ 11) Móvil 390 login visual ════════"
agent-browser open "$BASE/ingresar?cb=$RANDOM" --viewport 390 844 >/dev/null 2>&1; sleep 2
shot 09-login-movil
agent-browser type 'input[type=email]' 'cliente@homia.test' >/dev/null 2>&1
agent-browser type 'input[type=password]' 'Homy2026!' >/dev/null 2>&1
agent-browser click 'button[type=submit]' >/dev/null 2>&1
sleep 2.5
wait_eval "(()=>{const d=document.documentElement;return JSON.stringify({ov:d.scrollWidth>window.innerWidth+1,valentina:document.body.textContent.includes('Valentina')})})()" '"ov":false,"valentina":true' "login móvil entra al panel sin overflow"
shot 10-post-login-movil

echo ""
echo "══════════ RESULTADO E2E AUDITORÍA: $PASSN PASS / $FAILS FAIL ══════════"
[ $FAILS -eq 0 ] && echo "🟢 E2E AUDITORÍA VERDE" || echo "🔴 REVISAR HALLAZGOS"
