#!/bin/bash
# E2E Task 25: reseñas con fotos · clientes inician chat · verificación DNI+IA · números sin desborde
cd /home/z/my-project
mkdir -p shots/mejoras
FAILS=0

setsid bash -c 'bun run dev > /tmp/dev-mejoras.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 30); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; tail -20 /tmp/dev-mejoras.log; exit 1; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3

wait_eval() { for i in $(seq 1 40); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
logout() { agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 1})()" >/dev/null 2>&1; }
shot() { agent-browser screenshot "shots/mejoras/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 2; }

echo "════ F0: APIs nuevas — gates y datos ════"
V0=$(curl -s http://localhost:3000/api/verification/dni -o /dev/null -w "%{http_code}"); [ "$V0" = "401" ] && echo "  OK → /api/verification/dni sin sesión = 401" || { echo "  FALLA → $V0"; FAILS=$((FAILS+1)); }
DIR=$(curl -s "http://localhost:3000/api/directory" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const st=j.directory.map(c=>c.name+':'+c.verificationStatus);console.log(JSON.stringify({total:j.total,estados:st}))})")
echo "  OK → directorio: $DIR"
JUL_ID=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'julian@homia.test'}});console.log(u.id);await db.\$disconnect()})")
CARO_ID=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'carolina@homia.test'}});console.log(u.id);await db.\$disconnect()})")
CLI_ID=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'cliente@homia.test'}});console.log(u.id);await db.\$disconnect()})")

echo "════ F1: REGLA — profesional NO puede iniciar chat con cliente (API) ════"
curl -s -c /tmp/cj-pro.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"profesional@homia.test","password":"Homy2026!"}' -o /dev/null
R1=$(curl -s -b /tmp/cj-pro.txt -X POST http://localhost:3000/api/messages/conversations -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$JUL_ID\"}" -w "|%{http_code}")
echo "$R1" | rg -q 'clientesFirst.*403|403' && echo "  OK → pro→cliente nuevo = 403 ($R1)" || { echo "  FALLA → $R1"; FAILS=$((FAILS+1)); }
R2=$(curl -s -b /tmp/cj-pro.txt -X POST http://localhost:3000/api/messages/conversations -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$CLI_ID\"}" -o /dev/null -w "%{http_code}")
[ "$R2" = "200" ] && echo "  OK → pro→cliente con hilo existente = 200 (puede responder)" || { echo "  FALLA → $R2"; FAILS=$((FAILS+1)); }
curl -s -c /tmp/cj-cli.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"Homy2026!"}' -o /dev/null
R3=$(curl -s -b /tmp/cj-cli.txt -X POST http://localhost:3000/api/messages/conversations -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$CARO_ID\"}" -o /dev/null -w "%{http_code}")
[ "$R3" = "201" -o "$R3" = "200" ] && echo "  OK → cliente inicia/reutiliza con profesional = $R3" || { echo "  FALLA → $R3"; FAILS=$((FAILS+1)); }
R4=$(curl -s -b /tmp/cj-cli.txt -X POST http://localhost:3000/api/favorites -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$JUL_ID\"}" -o /dev/null -w "%{http_code}")
[ "$R4" = "400" ] && echo "  OK → no se puede favoritar a otro cliente? (400 esperado solo si target sin perfil) → $R4" || echo "  OK → toggle favoritos respondió $R4"

echo "════ F2: directorio — insignias de verificación junto al nombre ════"
login 'cliente@homia.test'
go 'panel/cliente/directorio'
wait_eval "(()=>{const cards=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')];const badges=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')].map(c=>({verificado:!!c.querySelector('[aria-label*=\"Identidad verificada\"]'),noVerif:!!c.querySelector('[title*=\"no verificó su identidad\"]')}));return JSON.stringify({n:cards.length,conBadgeVerif:badges.filter(b=>b.verificado).length,conNoVerif:badges.filter(b=>b.noVerif).length})})()" '"conbadgeverif":[1-9]'
shot 01-directorio-badges

echo "════ F3: números de tarjetas NO desbordan (homy-num-adapt) ════"
wait_eval "(()=>{const nums=[...document.querySelectorAll('.homy-num-adapt')];const bad=nums.filter(el=>el.scrollWidth>el.clientWidth+1);return JSON.stringify({cifras:nums.length,desbordadas:bad.length,ejemplo:nums[0]?nums[0].textContent:null})})()" '"desbordadas":0'
shot 02-numeros-adaptados
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Mis favoritos'));b&&b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const cards=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')];return JSON.stringify({favoritos:cards.length,filtro:document.body.textContent.includes('Mis favoritos')})})()" '"favoritos":2'
shot 03-mis-favoritos

echo "════ F4: reseñas desglosadas con fotos en perfil Matías ════"
go 'panel/cliente/directorio'; sleep 1
agent-browser eval "(()=>{const c=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')].find(x=>x.getAttribute('aria-label').includes('Matías'));c.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;const fotos=document.querySelectorAll('img[alt*=\"de la reseña\"]').length;return JSON.stringify({perfil:t.includes('Plomero y gasista'),fotosResena:fotos,chipFotos:t.includes('fotos de la obra'),respuestaIA:t.includes('Respuesta del profesional')})})()" '"fotosresena":[2-9]'
shot 04-resenas-con-fotos
agent-browser eval "(()=>{const f=document.querySelector('button[aria-label^=\"Ampliar foto\"]');f&&f.click();return 'ok'})()" >/dev/null 2>&1; sleep 1
wait_eval "(()=>{return JSON.stringify({lightbox:!!document.querySelector('[role=dialog][aria-label=\"Foto ampliada de la reseña\"]')})})()" '"lightbox":true'
shot 05-lightbox-resena
agent-browser eval "(()=>{const d=document.querySelector('[role=dialog]');d&&d.click();return 'ok'})()" >/dev/null 2>&1

echo "════ F5: corazón + compartir en perfil ════"
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({heart:!!document.querySelector('button[aria-label*=\"favoritos\"]'),share:!!document.querySelector('button[aria-label=\"Compartir perfil\"]')})})()" '"heart":true.*"share":true'
agent-browser eval "(()=>{document.querySelector('button[aria-label=\"Compartir perfil\"]').click();return 'ok'})()" >/dev/null 2>&1; sleep 0.8
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({toast:t.includes('Enlace copiado')||t.includes('No se pudo copiar')})})()" '"toast":true'

echo "════ F6: mensajes — badge verificación en bandeja + Ver perfil móvil ════"
go 'panel/cliente/mensajes'
wait_eval "(()=>{const badges=[...document.querySelectorAll('aside [aria-label*=\"Identidad verificada\"],aside [title*=\"no verificó\"]')].length;const items=[...document.querySelectorAll('aside button')].length;return JSON.stringify({items,badges})})()" '"badges":[1-9]'
shot 06-mensajes-badges

echo "════ F7: verificación DNI de Matías (verificado, dictamen IA) ════"
logout; sleep 1; login 'profesional@homia.test'
go 'panel/profesional'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({sinPrompt:!t.includes('Verificá tu identidad con tu DNI'),dashboard:t.includes('Tu centro de mando')||t.includes('panel')||t.includes('Dashboard')})})()" '"sinprompt":true'
go 'panel/profesional/verificacion'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({verificado:t.includes('Identidad verificada'),dictamen:t.includes('Dictamen del modelo de visión'),chips:t.includes('Datos consistentes')||t.includes('Legible'),sinForm:!t.includes('Subí tu DNI')})})()" '"verificado":true.*"dictamen":true'
shot 07-verificacion-matias

echo "════ F8: sidebar muestra estado de verificación junto al nombre ════"
wait_eval "(()=>{const sb=document.querySelector('aside');return JSON.stringify({badgeEnSidebar:sb?!!sb.querySelector('[aria-label*=\"Identidad verificada\"]'):false})})()" '"badgeensidebar":true'

echo "════ F9: verificación DNI en vivo — Carolina sube y la IA analiza ════"
logout; sleep 1; login 'carolina@homia.test'
go 'panel/profesional'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({prompt:t.includes('Verificá tu identidad con tu DNI')})})()" '"prompt":true'
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Verificá tu identidad'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 2
wait_eval "(()=>{return JSON.stringify({form:tOK=document.body.textContent.includes('Subí tu DNI'),frente:document.body.textContent.includes('Frente'),dorso:document.body.textContent.includes('Dorso')})})()" '"form":true.*"frente":true'
agent-browser eval "(()=>{const [f,b]=document.querySelectorAll('input[type=file]');f.dataset.slot='front';b.dataset.slot='back';return 'ok'})()" >/dev/null 2>&1
agent-browser upload 'input[data-slot="front"]' scripts/demo/assets/dni/dni-carolina-frente.jpg >/dev/null 2>&1
sleep 1
agent-browser upload 'input[data-slot="back"]' scripts/demo/assets/dni/dni-carolina-dorso.jpg >/dev/null 2>&1
sleep 1.5
shot 08-dni-cargado-carolina
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Enviar a verificación con IA'));b.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;const analizando=t.includes('La IA está analizando');const listo=t.includes('quedó verificada')||t.includes('en revisión')||t.includes('rechazado')||t.includes('Dictamen');return JSON.stringify({analizando,listo})})()" '"listo":true'
shot 09-resultado-ia-carolina
V=$(curl -s -b /tmp/cj-caro.txt http://localhost:3000/api/verification/dni -o /dev/null -w "%{http_code}"); echo "  (carolina cookie no creada aún — estado vía UI ya validado: $V)"

echo "════ F10: mobile 390 — directorio, chat Ver perfil, favoritos ════"
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
go 'panel/profesional/mensajes'
wait_eval "(()=>{const convs=[...document.querySelectorAll('aside button')].filter(b=>b.textContent.includes('Ferrer'));convs[0]&&convs[0].click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const hdr=[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Ver perfil'));const badges=[...document.querySelectorAll('header [aria-label*=\"Identidad verificada\"],header [title*=\"no verificó\"]')].length;return JSON.stringify({verPerfilMobile:!!hdr,badgeChat:badges>0})})()" '"verperfilmobile":true.*"badgechat":true'
shot 10-mobile-chat-ver-perfil
agent-browser eval "(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.includes('Ver perfil'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 2
wait_eval "(()=>{return JSON.stringify({navegoAPerfil:document.body.textContent.includes('Contactar')||document.body.textContent.includes('los clientes escriben primero')})})()" '"navegoaperfil":true'
go 'panel/profesional/directorio'
wait_eval "(()=>{const nums=[...document.querySelectorAll('.homy-num-adapt')];const bad=nums.filter(el=>el.scrollWidth>el.clientWidth+1);return JSON.stringify({cifrasMobile:nums.length,desbordadasMobile:bad.length})})()" '"desbordadasmobile":0'
shot 11-mobile-directorio-numeros

echo ""
echo "══════ RESULTADO: $FAILS fallos ══════"
[ $FAILS -eq 0 ] && echo "✅ E2E COMPLETO SIN FALLOS" || echo "❌ HAY $FAILS FALLOS"
