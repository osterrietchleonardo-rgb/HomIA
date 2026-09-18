#!/bin/bash
# Recaptura F2 con presupuesto seteado (05/06/07)
cd /home/z/my-project
pkill -9 -f "next dev" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1
setsid bash -c 'bun run dev > /tmp/dev-t26d.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && break; done
echo "SERVER UP ($code)"
pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3
agent-browser set viewport 1280 800 >/dev/null 2>&1
setval() { agent-browser eval "(function(){const el=document.querySelector(\"$1\");if(!el)return 'no-el';const set=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set;set.call(el,$2);el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" 2>/dev/null | tail -1; }
clickbtn() { agent-browser eval "(function(){const b=[...document.querySelectorAll('button, [role=button], a')].find(x=>x.textContent.replace(/\\s+/g,' ').trim().includes('$1'));if(!b)return 'no-btn:$1';b.click();return 'clicked'})()" >/dev/null 2>&1; }
w() { for i in $(seq 1 30); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; return 1; }

agent-browser eval "(async()=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cliente@homia.test',password:'Homy2026!'})});return 'in'})()" >/dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/panel/cliente/directorio" >/dev/null 2>&1; sleep 4
agent-browser eval "(function(){const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')].find(x=>x.getAttribute('aria-label').includes('Matías'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
setval "input[placeholder^='Ej:']" "'Cambio de llave térmica — E2E'"
setval "textarea[placeholder^='Contale']" "'La llave térmica salta cada vez que prendo el aire E2E. Necesito revisión y cambio.'"
clickbtn "Continuar"; sleep 1
clickbtn "Lo antes posible"
setval "input[type=date]" "'2026-10-02'"
setval "input[placeholder^='Calle']" "'Belgrano 1234, 3ºB'"
clickbtn "Continuar"; sleep 1
setval "[role=dialog] input[type=number]" "'80000'"
setval "[role=dialog] input[placeholder='0']" "'80000'"
agent-browser eval "(function(){const els=[...document.querySelectorAll('[role=dialog] input[type=number]')];if(els.length<2)return 'n:'+els.length;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(els[0],'80000');els[0].dispatchEvent(new Event('input',{bubbles:true}));s.call(els[1],'120000');els[1].dispatchEvent(new Event('input',{bubbles:true}));return 'ok2'})()" 2>/dev/null | tail -1
setval "textarea[placeholder^='Hola']" "'Hola, te contrato E2E por la llave térmica. ¿Podés pasar el viernes?'"
clickbtn "Continuar"; sleep 1
w "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({resumen:!!d&&d.textContent.includes('Confirmar contratación'),monto:d?d.textContent.includes('80.000'):false})})()" '"monto":true'
agent-browser screenshot "shots/hire-pdf/05-wizard-resumen.png" >/dev/null 2>&1 && echo "📸 05 recaptura"
clickbtn "Confirmar contratación"
w "(()=>{const d=document.querySelector('[role=dialog]');return JSON.stringify({exito:!!d&&d.textContent.includes('Contratación enviada')})})()" '"exito":true'
agent-browser screenshot "shots/hire-pdf/06-wizard-exito.png" >/dev/null 2>&1 && echo "📸 06 recaptura"
clickbtn "Ver el proyecto"; sleep 2
w "(()=>{const t=document.body.textContent;return JSON.stringify({brief:t.includes('Brief de la contratación'),dir:t.includes('Belgrano 1234')})})()" '"brief":true'
agent-browser screenshot "shots/hire-pdf/07-proyecto-con-brief.png" >/dev/null 2>&1 && echo "📸 07 recaptura"
P=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const p=await db.project.deleteMany({where:{title:{contains:'E2E'}}});const n=await db.notification.deleteMany({where:{body:{contains:'E2E'}}});const m=await db.message.deleteMany({where:{body:{contains:'E2E'}}});console.log('purga p'+p.count+' n'+n.count+' m'+m.count);await db.\$disconnect()})")
echo "  $P"
echo "LISTO"
