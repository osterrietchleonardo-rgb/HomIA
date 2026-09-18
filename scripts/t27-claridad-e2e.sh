#!/bin/bash
# E2E Task 27 — Claridad UX total: onboarding checklists, centro de ayuda /ayuda,
# reseñas 360° (cliente→proveedor, profesional→cliente) y chip "Dejá tu reseña".
cd /home/z/my-project
mkdir -p shots/t27-claridad
FAILS=0

pkill -9 -f agent-browser 2>/dev/null; sleep 1

# ── helpers ──────────────────────────────────────────────────────────────────
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
shot() { agent-browser screenshot "shots/t27-claridad/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
api() { agent-browser eval "(async()=>{const r=await fetch('$1');const j=await r.json().catch(()=>null);return r.status+' '+JSON.stringify($2)})()" 2>/dev/null | tail -1 | tr -d '\\'; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 1.8; }

BATH='cmu6jhr5i0012r979cp7lwwp6' # proyecto finalizado "Renovación completa de baño en Almagro"

# re-ejecutable: purga la reseña cliente→proveedor creada por corridas anteriores
bun scripts/purge-t27-review.mjs >/dev/null 2>&1

agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 2

echo "════════ F0) APIs: reviews mine + providerUserId + canReview ════════"
logout
api '/api/reviews?mine=1' '({n:(j.reviews||[]).length})' | rg -q '"n":0' && echo "  ✓ sin sesión: reviews mine = 0 (sin filtrar datos)" || { echo "  ✗ reviews mine sin sesión"; FAILS=$((FAILS+1)); }
login 'cliente@homia.test' | rg -q "200 Valentina" && echo "  ✓ login Valentina" || { echo "  ✗ login Valentina"; FAILS=$((FAILS+1)); }
api '/api/reviews?mine=1&projectId='$BATH '({n:j.reviews.length,targets:j.reviews.map(r=>r.targetUserId.slice(-6))})' | rg -q '"n":1' && echo "  ✓ reviews mine+projectId → 1 (reseña a Matías)" || { echo "  ✗ reviews mine+projectId"; FAILS=$((FAILS+1)); }
api '/api/projects/'$BATH '({pu:j.materials[0].providerUserId,pn:j.materials[0].providerName})' | rg -q '"pu":"cmu6j' && echo "  ✓ project detail expone providerUserId + providerName" || { echo "  ✗ providerUserId en materials"; FAILS=$((FAILS+1)); }
api '/api/projects?role=cliente' '({cr:j.asClient.map(p=>({t:p.title.slice(0,12),c:p.canReview}))})' | rg -qi "canReview|cr" && api '/api/projects?role=cliente' '({bath:j.asClient.find(p=>p.id==="'$BATH'")?.canReview})' | rg -q '"bath":true' && echo "  ✓ canReview=true en baño finalizado (falta reseña al proveedor)" || { echo "  ✗ canReview baño"; FAILS=$((FAILS+1)); }

echo "════════ F1) /ayuda pública (sin sesión) ════════"
logout
go 'ayuda'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({donde:t.includes('¿Dónde hago cada cosa?'),cliente:t.includes('Soy cliente'),resena:t.includes('Dejar una reseña'),escrow:t.includes('Escrow real'),faq:t.includes('¿Qué es el escrow')})})()" '"donde":true.*"resena":true.*"escrow":true'
wait_eval "(()=>{const tabs=[...document.querySelectorAll('[role=tab]')];tabs.find(x=>x.textContent.includes('Soy profesional'))?.click();return 'clicked'})()" 'clicked'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({bolsa:t.includes('Bolsa de trabajos'),primero:t.includes('Los clientes escriben primero'),obras:t.includes('Mostrá tus obras')})})()" '"bolsa":true.*"primero":true'
wait_eval "(()=>{const tabs=[...document.querySelectorAll('[role=tab]')];tabs.find(x=>x.textContent.includes('Soy proveedor'))?.click();return 'ok2'})()" 'ok2'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({stock:t.includes('Publicar materiales y precios'),vidriera:t.includes('Tu stock es tu vidriera')})})()" '"stock":true.*"vidriera":true'
shot 01-ayuda-publica

echo "════════ F2) Dashboard cliente: checklist onboarding ════════"
login 'cliente@homia.test' >/dev/null
go 'panel/cliente'
wait_eval "(()=>{const t=document.body.textContent;const card=t.includes('Tus primeros pasos en HomIA')||t.includes('¡Todo listo');const tareas=t.includes('Verificá tu identidad')&&t.includes('Escribí por chat');return JSON.stringify({card,tareas,progreso:t.includes('de 4 completados')})})()" '"card":true.*"tareas":true'
shot 02-cliente-onboarding
# dismiss persistente
agent-browser eval "(()=>{const x=[...document.querySelectorAll('button[title=Ocultar]')][0];x?.click();return 'dismissed'})()" >/dev/null 2>&1
sleep 1.5
wait_eval "JSON.stringify({gone:!document.body.textContent.includes('de 4 completados')})" '"gone":true'
go 'panel/cliente'
sleep 2
wait_eval "JSON.stringify({sigueOculto:!document.body.textContent.includes('de 4 completados')})" '"sigueOculto":true'
echo "  ✓ dismiss del checklist persiste tras reload (localStorage)"
# restaurar para las capturas finales
agent-browser eval "localStorage.removeItem('homy_onboarding_done_cliente');'restored'" >/dev/null 2>&1

echo "════════ F3) Lista de proyectos: chip 'Dejá tu reseña' ════════"
go 'panel/cliente/proyectos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({chip:t.includes('Dejá tu reseña'),banio:t.includes('Renovación completa de baño')})})()" '"chip":true.*"banio":true'
shot 03-cliente-proyectos-chip-resena

echo "════════ F4) Detalle de proyecto finalizado: reseña 360° al proveedor ════════"
go "panel/cliente/proyectos/$BATH"
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({hint:t.includes('calificá a cada participante por separado'),proDone:t.includes('Ya calificaste')||!t.includes('¿Cómo trabajar'),provForm:t.includes('Ferretería Ferrer Hnos.')&&t.includes('Publicar reseña')})})()" '"provForm":true'
shot 04-cliente-resena-proveedor
# publicar reseña al proveedor con texto
wait_eval "(()=>{const ta=document.querySelector('textarea');if(!ta)return 'no-ta';const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(ta,'Materiales de primera calidad y entrega en tiempo y forma. Excelente proveedor.');ta.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()" 'typed'
wait_eval "(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>x.textContent.trim()==='Publicar reseña');if(!b)return 'no-btn';b.click();return 'sent'})()" 'sent'
sleep 2
wait_eval "JSON.stringify({gracias:document.body.textContent.includes('Gracias por tus reseñas')})" '"gracias":true'
echo "  ✓ reseña al proveedor publicada → tarjeta 'Gracias por tus reseñas'"
shot 05-cliente-resena-publicada

echo "════════ F5) Profesional: checklist + reseña al cliente ════════"
logout; login 'profesional@homia.test' >/dev/null
go 'panel/profesional'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({card:t.includes('Tus primeros pasos en HomIA')||t.includes('¡Todo listo'),tareas:t.includes('Mostrá tus obras')&&t.includes('Completá tu perfil profesional')})})()" '"card":true.*"tareas":true'
shot 06-pro-onboarding
go "panel/profesional/proyectos/$BATH"
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({yaCalificado:t.includes('Ya calificaste a Valentina')})})()" '"yaCalificado":true'
echo "  ✓ Matías ya reseñó a Valentina en el seed → estado 'Ya calificaste' correcto"
shot 07-pro-resena-estado

echo "════════ F6) Proveedor: checklist ════════"
logout; login 'proveedor@homia.test' >/dev/null
go 'panel/proveedor'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({card:t.includes('Tus primeros pasos en HomIA')||t.includes('¡Todo listo'),tareas:t.includes('Publicá tu catálogo de stock')&&t.includes('Vinculate con profesionales')})})()" '"card":true.*"tareas":true'
shot 08-proveedor-onboarding

echo "════════ F7) Ayuda embebida en panel (3 roles tienen link) ════════"
wait_eval "(()=>{const link=[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='#/ayuda'||a.textContent.trim()==='Ayuda');link?.click();return link?'clicked':'no-link'})()" 'clicked'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({ayuda:t.includes('¿Dónde hago cada cosa?'),embebida:t.includes('Panel proveedor')||!!document.querySelector('nav[aria-label=\"Navegación del panel\"]')})})()" '"ayuda":true'
shot 09-ayuda-embebida-panel

echo "════════ F8) Mobile 390: ayuda + dashboard sin overflow ════════"
# browser fresco (sin sesión) + viewport en tab ya creada
pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/ayuda" >/dev/null 2>&1; sleep 2.5
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const d=document.documentElement;const sx=d.scrollWidth>d.clientWidth+2;return JSON.stringify({sw:d.scrollWidth,cw:d.clientWidth,noSx:!sx,ayuda:document.body.textContent.includes('¿Dónde hago cada cosa?')})})()" '"noSx":true.*"ayuda":true'
shot 10-ayuda-mobile
login 'cliente@homia.test' >/dev/null
go 'panel/cliente'
wait_eval "(()=>{const d=document.documentElement;const sx=d.scrollWidth>d.clientWidth+2;const card=document.body.textContent.includes('Tus primeros pasos')||document.body.textContent.includes('¡Todo listo');return JSON.stringify({noSx:!sx,card})})()" '"noSx":true.*"card":true'
shot 11-cliente-onboarding-mobile

echo "════════ F9) Home: navegación real desde CTAs públicos ════════"
logout >/dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3
wait_eval "(()=>{const a=[...document.querySelectorAll('nav[aria-label=\"Navegación principal\"] a')].find(x=>x.textContent.trim()==='Ayuda');if(!a)return 'no-link';a.click();return 'nav'})()" 'nav'
sleep 2.5
wait_eval "JSON.stringify({path:location.pathname.includes('ayuda'),ayuda:document.body.textContent.includes('¿Dónde hago cada cosa?')})" '"ayuda":true'
echo "  ✓ header público → Ayuda navega al centro de ayuda"
# y desde el footer
agent-browser open "http://127.0.0.1:3000/" >/dev/null 2>&1; sleep 2.5
agent-browser eval "(()=>{const a=[...document.querySelectorAll('footer a')].find(x=>x.textContent.includes('Centro de ayuda'));a?.click();return 'fnav'})()" >/dev/null 2>&1
sleep 2.5
wait_eval "JSON.stringify({footerOk:location.pathname.includes('ayuda')&&document.body.textContent.includes('¿Dónde hago cada cosa?')})" '"footerOk":true'
echo "  ✓ footer → Centro de ayuda navega"

echo ""
echo "════════════════════════════════════"
echo "FAILS TOTALES: $FAILS"
echo "════════════════════════════════════"
pkill -9 -f agent-browser 2>/dev/null
exit $FAILS
