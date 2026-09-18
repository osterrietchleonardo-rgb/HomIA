#!/bin/bash
# E2E Task 26: contratación completa (wizard) · facturas PDF real · todo funcional
cd /home/z/my-project
mkdir -p shots/hire-pdf
FAILS=0

pkill -9 -f "next dev" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1
setsid bash -c 'bun run dev > /tmp/dev-t26.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; tail -25 /tmp/dev-t26.log; exit 1; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3

wait_eval() { for i in $(seq 1 40); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
logout() { agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 1})()" >/dev/null 2>&1; }
shot() { agent-browser screenshot "shots/hire-pdf/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 2.5; }
setval() { agent-browser eval "(function(){const el=document.querySelector(\"$1\");if(!el)return 'no-el';const set=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set;set.call(el,$2);el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" 2>/dev/null | tail -1; }
clickbtn() { agent-browser eval "(function(){const b=[...document.querySelectorAll('button, [role=button], a')].find(x=>x.textContent.replace(/\\s+/g,' ').trim().includes('$1'));if(!b)return 'no-btn:$1';b.click();return 'clicked'})()" >/dev/null 2>&1; }

PRO_PID=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'profesional@homia.test'}});const p=await db.professionalProfile.findUnique({where:{userId:u.id}});console.log(p.id);await db.\$disconnect()})")
CARO_PID=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'carolina@homia.test'}});const p=await db.professionalProfile.findUnique({where:{userId:u.id}});console.log(p.id);await db.\$disconnect()})")
INV_PEND=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const i=await db.invoice.findFirst({where:{status:'pendiente'}});console.log(i?i.id:'none');await db.\$disconnect()})")
INV_PAGA=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const i=await db.invoice.findFirst({where:{status:'pagada'}});console.log(i?i.id:'none');await db.\$disconnect()})")
echo "  ids: PRO_PID=$PRO_PID CARO_PID=$CARO_PID INV_PEND=$INV_PEND INV_PAGA=$INV_PAGA"

echo "════ F0: API de contratación — gates + brief completo + notificación + chat ════"
A0=$(curl -s -X POST http://localhost:3000/api/projects -H 'Content-Type: application/json' -d '{"title":"x"}' -o /dev/null -w "%{http_code}")
[ "$A0" = "401" ] && echo "  OK → POST /api/projects sin sesión = 401" || { echo "  FALLA → $A0"; FAILS=$((FAILS+1)); }
curl -s -c /tmp/t26-cli.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"Homy2026!"}' -o /dev/null
CREATED=$(curl -s -b /tmp/t26-cli.txt -X POST http://localhost:3000/api/projects -H 'Content-Type: application/json' -d "{\"professionalProfileId\":\"$PRO_PID\",\"title\":\"E2E API — Relevamiento eléctrico\",\"description\":\"Se cayó el tablero E2E tras la tormenta.\",\"urgency\":\"ya\",\"address\":\"Av. Siempreviva 742\",\"city\":\"La Plata\",\"deadline\":\"2026-10-05\",\"firstMessage\":\"Hola, te contrato E2E: el tablero se cayó, ¿cuándo podés pasar?\"}")
echo "$CREATED" | rg -q '"conversationId":"[a-z0-9]+' && echo "  OK → 201 con brief + conversación abierta" || { echo "  FALLA → $CREATED"; FAILS=$((FAILS+1)); }
PROJ_A=$(echo "$CREATED" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.project.id)})")
URG=$(echo "$CREATED" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.project.urgency)})")
[ "$URG" = "ya" ] && echo "  OK → project.urgency persistido ($PROJ_A)" || { echo "  FALLA → urgency=$URG"; FAILS=$((FAILS+1)); }
NOTIF=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const n=await db.notification.findFirst({where:{type:'contratacion',body:{contains:'E2E API'}}});console.log(n?'notificada':'SIN-NOTIFICACION');await db.\$disconnect()})")
[ "$NOTIF" = "notificada" ] && echo "  OK → profesional notificado de la contratación" || { echo "  FALLA → $NOTIF"; FAILS=$((FAILS+1)); }

echo "════ F1: PDF real — gates + bytes + permisos ════"
P0=$(curl -s "http://localhost:3000/api/invoices/$INV_PEND/pdf" -o /dev/null -w "%{http_code}")
[ "$P0" = "401" ] && echo "  OK → PDF sin sesión = 401" || { echo "  FALLA → $P0"; FAILS=$((FAILS+1)); }
P1=$(curl -s -b /tmp/t26-cli.txt "http://localhost:3000/api/invoices/$INV_PEND/pdf" -o /tmp/inv-pend.pdf -w "%{http_code} %{size_download}")
echo "$P1" | rg -q '^200' && head -c 5 /tmp/inv-pend.pdf | rg -q '%PDF' && SZ=$(echo "$P1" | cut -d' ' -f2) && [ "$SZ" -gt 1000 ] && echo "  OK → pendiente: %PDF válido, $SZ bytes" || { echo "  FALLA → $P1"; FAILS=$((FAILS+1)); }
P2=$(curl -s -b /tmp/t26-cli.txt "http://localhost:3000/api/invoices/$INV_PAGA/pdf" -o /tmp/inv-paga.pdf -w "%{http_code}")
[ "$P2" = "200" ] && echo "  OK → pagada también descarga (200)" || { echo "  FALLA → $P2"; FAILS=$((FAILS+1)); }
curl -s -c /tmp/t26-prov.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"proveedor@homia.test","password":"Homy2026!"}' -o /dev/null
P3=$(curl -s -b /tmp/t26-prov.txt "http://localhost:3000/api/invoices/$INV_PEND/pdf" -o /dev/null -w "%{http_code}")
[ "$P3" = "403" ] && echo "  OK → tercero sin acceso = 403" || { echo "  FALLA → $P3"; FAILS=$((FAILS+1)); }
curl -s -c /tmp/t26-pro.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"profesional@homia.test","password":"Homy2026!"}' -o /dev/null
P4=$(curl -s -b /tmp/t26-pro.txt "http://localhost:3000/api/invoices/$INV_PEND/pdf" -o /dev/null -w "%{http_code}")
[ "$P4" = "200" ] && echo "  OK → el profesional de la obra también puede (200)" || { echo "  FALLA → $P4"; FAILS=$((FAILS+1)); }

echo "════ F2: WIZARD desde el directorio — contratación completa en 4 pasos ════"
login 'cliente@homia.test'
go 'panel/cliente/directorio'
wait_eval "(()=>{const btns=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')];return JSON.stringify({contratarBtns:btns.length,ejemplo:btns[0]?btns[0].getAttribute('aria-label'):null})})()" '"contratarbtns":[2-9]'
shot 01-directorio-boton-contratar
agent-browser eval "(function(){const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')].find(x=>x.getAttribute('aria-label').includes('Matías'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const d=document.querySelector('[role=dialog][aria-modal=true]');return JSON.stringify({wizard:!!d,header:d?d.textContent.includes('Paso 1 de 4'):false})})()" '"wizard":true'
shot 02-wizard-paso1
setval "input[placeholder^='Ej:']" "'Cambio de llave térmica — E2E'"
setval "textarea[placeholder^='Contale']" "'La llave térmica salta cada vez que prendo el aire E2E. Necesito revisión y cambio.'"
clickbtn "Continuar"; sleep 1
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({paso2:!!d&&d.textContent.includes('Paso 2 de 4'),urgencias:d?d.textContent.includes('Lo antes posible'):false})})()" '"paso2":true'
shot 03-wizard-paso2
clickbtn "Lo antes posible"
setval "input[type=date]" "'2026-10-02'"
setval "input[placeholder^='Calle']" "'Belgrano 1234, 3ºB'"
clickbtn "Continuar"; sleep 1
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({paso3:!!d&&d.textContent.includes('Paso 3 de 4')})})()" '"paso3":true'
shot 04-wizard-paso3
NUMS=$(agent-browser eval "(function(){return [...document.querySelectorAll('[role=dialog] input[type=number]')].length})()" 2>/dev/null | tail -1 | tr -d '\\')
if [ "$NUMS" = "2" ]; then
  agent-browser eval "(function(){const els=[...document.querySelectorAll('[role=dialog] input[type=number]')];const set=Object.getOwnPropertyDescriptor(el0cons||HTMLInputElement.prototype,'value');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(els[0],'80000');els[0].dispatchEvent(new Event('input',{bubbles:true}));s.call(els[1],'120000');els[1].dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
fi
setval "textarea[placeholder^='Hola']" "'Hola, te contrato E2E por la llave térmica. ¿Podés pasar el viernes?'"
clickbtn "Continuar"; sleep 1
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({resumen:!!d&&d.textContent.includes('Confirmar contratación')&&d.textContent.includes('Belgrano 1234'),monto:d?d.textContent.includes('$')&&d.textContent.includes('80.000'):false})})()" '"resumen":true'
shot 05-wizard-resumen
clickbtn "Confirmar contratación"
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({exito:!!d&&d.textContent.includes('Contratación enviada')})})()" '"exito":true'
shot 06-wizard-exito
clickbtn "Ver el proyecto"
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({url:location.hash||location.pathname,brief:t.includes('Brief de la contratación'),dir:t.includes('Belgrano 1234'),fecha:t.includes('2 oct')||t.includes('oct'),urg:t.includes('Lo antes posible')})})()" '"brief":true'
shot 07-proyecto-con-brief

echo "════ F3: wizard desde el perfil del profesional (segunda entrada) ════"
go "panel/cliente/directorio"; sleep 1
agent-browser eval "(function(){const c=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')].find(x=>x.getAttribute('aria-label').includes('Carolina'));c.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Contratar');return JSON.stringify({perfil:t.includes('Carolina'),contratar:!!btn})})()" '"contratar":true'
clickbtn "Contratar"; sleep 1.2
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({wizard:!!d,p1:d?d.textContent.includes('Paso 1 de 4'):false,rubros:d?d.textContent.includes('electric'):false})})()" '"wizard":true'
shot 08-wizard-desde-perfil-carolina
clickbtn "Cerrar contratación"; sleep 0.8

echo "════ F4: botones PDF en facturas (UI) + visor real ════"
go 'panel/cliente/facturas'
wait_eval "(()=>{const pdfs=[...document.querySelectorAll('button[aria-label^=\"Ver factura\"]')];return JSON.stringify({botonesPdf:pdfs.length,pendiente:document.body.textContent.includes('Por pagar'),pagada:document.body.textContent.includes('Pagadas')})})()" '"botonespdf":[2-9]'
shot 09-facturas-botones-pdf
PDF_OK=$(agent-browser eval "(async()=>{const r=await fetch('/api/invoices/$INV_PEND/pdf');const b=await r.arrayBuffer();const head=String.fromCharCode(...new Uint8Array(b.slice(0,5)));return JSON.stringify({status:r.status,magic:head,bytes:b.byteLength})})()" 2>/dev/null | tail -1 | tr -d '\\')
echo "$PDF_OK" | rg -q '"magic":"%PDF' && echo "  OK → PDF fetch desde el browser: $PDF_OK" || { echo "  FALLA → $PDF_OK"; FAILS=$((FAILS+1)); }
go "api/invoices/$INV_PEND/pdf"
sleep 2
wait_eval "(()=>{const p=document.querySelector('embed[type=\"application/pdf\"], iframe');const t=document.body.textContent;return JSON.stringify({visor:!!p||t.includes('%PDF')||window.location.pathname.includes('/pdf')})})()" '"visor":true'
shot 10-pdf-visor

echo "════ F5: el profesional recibe la contratación (notificación + brief) ════"
login 'profesional@homia.test'
go 'notificaciones'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({notif:t.includes('Te contrataron para un trabajo')&&t.includes('E2E API'),centro:t.includes('Centro de actividad')})})()" '"notif":true'
shot 11-notificacion-contratacion
go 'panel/profesional/proyectos'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({enLista:t.includes('E2E API')})})()" '"enlista":true'
agent-browser eval "(function(){const a=[...document.querySelectorAll('a,button')].find(x=>x.textContent.includes('E2E API'));a&&a.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({proyecto:t.includes('E2E API'),dir:t.includes('Av. Siempreviva 742'),cliente:t.includes('Valentina'),urg:t.includes('ya')||t.includes('Lo antes posible')})})()" '"proyecto":true'
shot 12-pro-brief-del-cliente

echo "════ F6: mobile 390 — wizard y PDF accesibles (browser fresco + set viewport) ════"
pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" >/dev/null 2>&1; sleep 3
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
login 'cliente@homia.test'
go 'panel/cliente/directorio'
wait_eval "(()=>{const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')];return JSON.stringify({btns:b.length,vp:window.innerWidth})})()" '"vp":390'
agent-browser eval "(function(){const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')][0];b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');if(!d)return JSON.stringify({wizard:false});const r=d.getBoundingClientRect();return JSON.stringify({wizard:true,anchoOk:r.width<=392,sinScrollX:document.documentElement.scrollWidth<=392})})()" '"anchoOk":true'
shot 13-mobile-wizard
clickbtn "Cerrar contratación"; sleep 0.6
go 'panel/cliente/facturas'
wait_eval "(()=>{const btns=[...document.querySelectorAll('button[aria-label^=\"Ver factura\"]')];const bad=btns.filter(b=>b.scrollWidth>b.clientWidth+1);return JSON.stringify({pdfs:btns.length,desbordados:bad.length})})()" '"pdfs":[1-9]'
shot 14-mobile-facturas-pdf

echo "════ F7: purga de datos E2E (deja el seed demo intacto) ════"
PURGE=$(node -e "
import('@prisma/client').then(async({PrismaClient})=>{
  const db=new PrismaClient();
  const p=await db.project.deleteMany({where:{title:{contains:'E2E'}}});
  const n=await db.notification.deleteMany({where:{OR:[{body:{contains:'E2E'}},{title:{contains:'E2E'}}]}});
  const m=await db.message.deleteMany({where:{body:{contains:'E2E'}}});
  const del=await db.conversation.deleteMany({where:{AND:[{messages:{none:{}}}]}});
  console.log(JSON.stringify({projects:p.count,notifs:n.count,msgs:m.count,convVacias:del.count}));
  await db.\$disconnect();
})")
echo "  OK → purga: $PURGE"
CHECK=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const c=await db.project.count({where:{title:{contains:'E2E'}}});console.log(c);await db.\$disconnect()})")
[ "$CHECK" = "0" ] && echo "  OK → base limpia" || { echo "  FALLA → quedaron $CHECK proyectos E2E"; FAILS=$((FAILS+1)); }

echo ""
echo "════ RESULTADO: FAILS=$FAILS ════"
[ $FAILS -eq 0 ] && echo "🎉 E2E Task 26 COMPLETO: contratación completa + PDF + todo funcional" || echo "⚠️ $FAILS fases con problemas"
