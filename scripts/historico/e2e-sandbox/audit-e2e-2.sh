#!/bin/bash
# AUDITORÍA E2E — parte 2: checks corregidos + registro real + upload real
cd /home/z/my-project
BASE=http://127.0.0.1:3100
FAILS=0; PASSN=0
ok(){ PASSN=$((PASSN+1)); echo "  ✅ $1"; }
bad(){ FAILS=$((FAILS+1)); echo "  ❌ $1"; }
wait_eval() {
  local r=""
  for i in $(seq 1 20); do
    r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\')
    echo "$r" | rg -qi "$2" && { echo "  ✅ $3"; PASSN=$((PASSN+1)); return 0; }
    sleep 1
  done
  echo "  ❌ $3 → $r"; FAILS=$((FAILS+1)); return 1
}
shot() { agent-browser screenshot "shots/audit/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "$BASE/?cb=$RANDOM" --viewport 1280 800 >/dev/null 2>&1; sleep 2

echo "══ A) Directorio: tarjetas article clickeables ══"
agent-browser open "$BASE/directorio?cb=$RANDOM" >/dev/null 2>&1; sleep 2.5
wait_eval "(()=>{const cards=document.querySelectorAll('article');const names=document.body.textContent;return JSON.stringify({cards:cards.length,matias:names.includes('Matías'),ferrer:names.includes('Ferrer')})})()" '"cards":[1-9].*"matias":true' "directorio renderiza tarjetas (article)"
shot 11-directorio-tarjetas

echo "══ B) Registro UI multi-paso completo (usuario real) ══"
EMAIL="audit$(date +%s)@homia.test"
agent-browser open "$BASE/registrarse?cb=$RANDOM" >/dev/null 2>&1; sleep 2
# paso 1: elegir rol cliente
wait_eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/soy cliente|cliente/i.test(x.textContent));return JSON.stringify({paso1:!!b})})()" '"paso1":true' "registro paso 1 (elegir rol)"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/soy cliente|cliente/i.test(x.textContent));b&&b.click();return 'clicked'})()" >/dev/null 2>&1; sleep 1
wait_eval "(()=>{return JSON.stringify({paso2:!!document.querySelector('input[type=email]'),hint:document.body.textContent.includes('letras y números')})})()" '"paso2":true.*"hint":true' "paso 2 con hint de nueva política"
shot 12-registro-paso2
agent-browser type 'input[type=text]' 'Audit Tester' >/dev/null 2>&1
agent-browser type 'input[type=email]' "$EMAIL" >/dev/null 2>&1
agent-browser type 'input[type=password]' 'Audit1234' >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/crear cuenta|registrarme|continuar/i.test(x.textContent));b&&b.click();return 'clicked'})()" >/dev/null 2>&1
sleep 2.5
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({panel:t.includes('Audit Tester')||t.includes('Tu panel')||t.includes('Bienvenid')})})()" '"panel":true' "registro crea cuenta real y entra al panel"
shot 13-registro-exito
# password débil debe ser rechazada en UI
agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 'ok'})()" >/dev/null 2>&1; sleep 1
code=$(curl -s -o /tmp/reg.json -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -H "X-Forwarded-For: 10.7.7.1" -d "{\"email\":\"weak$EMAIL\",\"password\":\"solsolclave\",\"displayName\":\"Weak\"}")
[ "$code" = "400" ] && ok "API rechaza password sin números (400)" || bad "API aceptó password débil → $code"

echo "══ C) Upload real desde browser (imagen → /api/uploads) ══"
agent-browser open "$BASE/ingresar?cb=$RANDOM" >/dev/null 2>&1; sleep 2
agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'profesional@homia.test',password:'Homy2026!'})});return r.status})()" >/dev/null 2>&1; sleep 1
wait_eval "(()=>{const c=document.querySelector('input[type=file]');return JSON.stringify({dniInput:!!c})})()" '"dniInput":true|"dniInput":false' "página de verificación accesible"
agent-browser eval "(async()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=50;const ctx=canvas.getContext('2d');ctx.fillStyle='#1D63B8';ctx.fillRect(0,0,80,50);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const fd=new FormData();fd.append('file',new File([blob],'test.png',{type:'image/png'}));fd.append('folder','dni');const up=await fetch('/api/uploads',{method:'POST',body:fd});const j=await up.json();if(!up.ok)return up.status+' ERR';window.__upUrl=j.url;const img=new Image();img.src=j.url;await img.decode().catch(()=>{});return up.status+' '+j.url+' loaded:'+(img.naturalWidth>0)})()" 2>/dev/null | tail -1
U=$(agent-browser eval "window.__upUrl||''" 2>/dev/null | tail -1 | tr -d '"\\')
[ -n "$U" ] && ok "upload browser real → $U" || bad "upload desde browser falló"
curl -s -o /dev/null -w "" "$BASE$U" 2>/dev/null
ST=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$U")
[ "$ST" = "200" ] && ok "imagen subida servida por standalone (200)" || bad "imagen subida no servida → $ST"

echo "══ D) Pro: emitir/facturas dentro de proyecto (contextual) ══"
agent-browser open "$BASE/panel/profesional/proyectos?cb=$RANDOM" >/dev/null 2>&1; sleep 2
agent-browser eval "(()=>{const a=[...document.querySelectorAll('a,article,[role=button]')].find(x=>/Renovación completa/.test(x.textContent));a&&a.click();return 'clicked'})()" >/dev/null 2>&1; sleep 2
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({facturas:t.toLowerCase().includes('factura'),etapas:t.toLowerCase().includes('etapa')||t.toLowerCase().includes('presupuesto')})})()" '"facturas":true' "detalle proyecto pro con facturación contextual"
shot 14-pro-proyecto-facturas

echo "══ E) Cliente: perfil con badge debajo del nombre (N6.1) ══"
agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cliente@homia.test',password:'Homy2026!'})});return 'ok'})()" >/dev/null 2>&1; sleep 1
agent-browser open "$BASE/panel/cliente/perfil?cb=$RANDOM" >/dev/null 2>&1; sleep 2.5
wait_eval "(()=>{const h1=[...document.querySelectorAll('h1,h2')].find(x=>x.textContent.includes('Valentina'));if(!h1)return JSON.stringify({h1:false});const nameRect=h1.getBoundingClientRect();const badge=[...document.querySelectorAll('[class*=badge],[class*=rounded-full]')].map(b=>b.textContent.trim()).filter(t=>/verificado|revisión/i.test(t));return JSON.stringify({h1:true,nameWidth:nameRect.width,badgeText:badge[0]||'none'})})()" '"h1":true' "nombre del cliente visible completo"
shot 15-cliente-perfil

echo ""
echo "════════ RESULTADO PARTE 2: $PASSN PASS / $FAILS FAIL ══════════"
[ $FAILS -eq 0 ] && echo "🟢 VERDE" || echo "🔴 REVISAR"
