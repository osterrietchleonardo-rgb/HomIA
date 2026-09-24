#!/bin/bash
# E2E Task 24: Directorio + perfiles gated + mensajería estilo chat
cd /home/z/my-project
mkdir -p shots/directorio-msg
FAILS=0

setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 25); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; tail -20 /tmp/dev-direct.log; exit 1; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3

wait_eval() { for i in $(seq 1 35); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
logout() { agent-browser eval "(async()=>{await fetch('/api/auth/logout',{method:'POST'});return 1})()" >/dev/null 2>&1; }
shot() { agent-browser screenshot "shots/directorio-msg/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 1.8; }
typejs() { agent-browser eval "(()=>{const el=document.querySelector('input[aria-label=\"Escribir mensaje\"]');if(!el)return 'sin input';const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(el,'$1');el.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()" 2>/dev/null | tail -1 | tr -d '\\'; }

echo "════ F0: API gate sin sesión (perfil debe ser 401) ════"
GATE=$(curl -s http://localhost:3000/api/profiles/professional/x -o /dev/null -w "%{http_code}")
[ "$GATE" = "401" ] && echo "  OK → perfil sin sesión = 401" || { echo "  FALLA → $GATE"; FAILS=$((FAILS+1)); }

echo "════ F1: home → link Directorio en header ════"
wait_eval "(()=>{const a=[...document.querySelectorAll('a')].find(x=>x.getAttribute('href')==='#/directorio');return JSON.stringify({linkDirectorio:!!a})})()" '"linkdirectorio":true'
agent-browser eval "(()=>{const a=[...document.querySelectorAll('a')].find(x=>x.getAttribute('href')==='#/directorio');a.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({enDirectorio:t.includes('Toda la comunidad'),matias:t.includes('Matías Ferrer'),ferrer:t.includes('Ferrer Hnos.')})})()" '"matias":true.*"ferrer":true'
shot 01-directorio-publico

echo "════ F2: primera tarjeta = más reseñas positivas; gate sin login ════"
wait_eval "(()=>{const cards=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')];return JSON.stringify({n:cards.length,primera:cards[0]?cards[0].getAttribute('aria-label'):null})})()" '"primera":"Abrir tarjeta de Matías Ferrer"'
agent-browser eval "(()=>{document.querySelector('button[aria-label^=\"Abrir tarjeta\"]').click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({gate:t.includes('Acceso requerido'),verEste:t.includes('Ingresá para ver'),btnCrear:t.includes('Crear cuenta gratis'),irDirect:t.includes('directorio completo')})})()" '"gate":true.*"vereste":true'
shot 02-gate-perfil-sin-login

echo "════ F3: login Valentina → directorio embebido en panel ════"
login 'cliente@homia.test'
go 'panel/cliente'
wait_eval "(()=>{const nav=[...document.querySelectorAll('aside a')].map(a=>a.textContent);return JSON.stringify({directorio:nav.some(n=>n.includes('Directorio')),mensajes:nav.some(n=>n.includes('Mensajes'))})})()" '"directorio":true.*"mensajes":true'
go 'panel/cliente/directorio'
wait_eval "(()=>{const aside=!!document.querySelector('aside');const t=document.body.textContent;return JSON.stringify({embebido:aside,tarjetas:t.includes('Matías Ferrer')&&t.includes('Ferrer Hnos.')})})()" '"embebido":true.*"tarjetas":true'
shot 03-directorio-en-panel

echo "════ F4: filtros — tipo proveedores, rubro, orden, rating ════"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Proveedores');b.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({soloProv:t.includes('Ferrer Hnos.'),sinMatias:!t.includes('Matías Ferrer'),stock:t.includes('materiales')})})()" '"soloprov":true.*"sinmatias":true'
shot 04-filtro-proveedores
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Todos');b.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{return JSON.stringify({matiasDeVuelta:document.body.textContent.includes('Matías Ferrer')})})()" '"matiasdevuelta":true'
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Plomería');b.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({plomeria_matias:t.includes('Matías Ferrer'),plomeria_ferrer:t.includes('Ferrer Hnos.'),nota:t.includes('resultados')})})()" '"plomeria_matias":true.*"plomeria_ferrer":true'
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Todos los rubros');b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1

echo "════ F5: abrir tarjeta Matías (logueado) → perfil + Contactar ════"
agent-browser eval "(()=>{const c=[...document.querySelectorAll('button[aria-label^=\"Abrir tarjeta\"]')].find(x=>x.getAttribute('aria-label').includes('Matías'));c.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({perfil:t.includes('Plomero y gasista matriculado'),obras:t.includes('Trabajos realizados'),contactar:t.includes('Contactar'),contratar:t.includes('Contratar'),aside:!!document.querySelector('aside')})})()" '"contactar":true.*"contratar":true'
shot 05-perfil-matias

echo "════ F6: Contactar → chat con hilo existente ════"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Contactar');b.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({chat:t.includes('Bandeja de entrada')||t.includes('Escribí un mensaje'),header:t.includes('Matías Ferrer'),hilo:t.includes('reservados los caños')||t.includes('diagnóstico')})})()" '"hilo":true'
shot 06-chat-con-matias

echo "════ F7: enviar mensaje → burbuja propia aparece ════"
typejs 'Hola Matías! Confirmado para mañana temprano, gracias!'
agent-browser eval "(()=>{document.querySelector('button[aria-label=\"Enviar mensaje\"]').click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({enviado:t.includes('Confirmado para mañana temprano')})})()" '"enviado":true'
shot 07-mensaje-enviado

echo "════ F8: bandeja de Valentina (2 conversaciones, no leídos) ════"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Volver a la bandeja');if(b){b.click();return 'back'}return 'ya'})()" >/dev/null 2>&1; sleep 1.2
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({matias:t.includes('Matías Ferrer'),ferrer:t.includes('Ferrer Hnos.'),vos:t.includes('Vos:')})})()" '"matias":true.*"ferrer":true'
shot 08-bandeja-valentina
logout

echo "════ F9: receptor recibe — login Matías → badge + hilo con CheckCheck ════"
login 'profesional@homia.test'
go 'panel/profesional'
wait_eval "(()=>{const nav=[...document.querySelectorAll('aside a')].map(a=>a.textContent);const badge=[...document.querySelectorAll('aside a')].some(a=>a.textContent.includes('Mensajes')&&/\\d/.test(a.textContent));return JSON.stringify({nav:nav.some(n=>n.includes('Mensajes')),badge})})()" '"badge":true'
go 'panel/profesional/mensajes'
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({lista:t.includes('Valentina Ríos')&&t.includes('Ferrer Hnos.'),sinLeer:t.includes('Confirmado para mañana')})})()" '"lista":true'
agent-browser eval "(()=>{const c=[...document.querySelectorAll('aside button')].find(x=>x.textContent.includes('Valentina'));c.click();return 'ok'})()" >/dev/null 2>&1
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({chat:t.includes('Confirmado para mañana temprano')})})()" '"chat":true'
shot 09-mensajes-matias
logout

echo "════ F10: mobile 390 — lista→chat, sin overflow ════"
login 'cliente@homia.test' >/dev/null
agent-browser eval "(()=>{const r=await fetch('/api/messages/conversations');return 1})()" >/dev/null 2>&1
go 'mensajes'
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const d=document.documentElement;return JSON.stringify({overflow:d.scrollWidth>innerWidth,lista:t=!!document.body.textContent.includes('Conversaciones')})})()" '"overflow":false'
agent-browser eval "(()=>{const c=[...document.querySelectorAll('aside button')].find(x=>x.textContent.includes('Matías')||x.textContent.includes('Ferrer'));if(c){c.click();return 'ok'}return 'noconv'})()" >/dev/null 2>&1
wait_eval "(()=>{const d=document.documentElement;const back=!!document.querySelector('button[aria-label=\"Volver a la bandeja\"]');return JSON.stringify({overflow:d.scrollWidth>innerWidth,back})})()" '"overflow":false.*"back":true'
shot 10-mobile-chat
agent-browser set viewport 1280 800 >/dev/null 2>&1

echo ""
[ "$FAILS" = "0" ] && echo "✅ E2E DIRECTORIO+MENSAJES: todo pasó" || echo "⚠️ E2E con $FAILS fallas (revisar)"
