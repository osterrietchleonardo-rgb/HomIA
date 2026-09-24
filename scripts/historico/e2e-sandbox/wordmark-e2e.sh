#!/bin/bash
# Verificación visual del wordmark HomIA (I mayúscula + punto multicolor)
cd /home/z/my-project
mkdir -p shots/wordmark
setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1
for i in $(seq 1 15); do r=$(agent-browser eval "document.readyState" 2>/dev/null | tr -d '\\'); [ "$r" = '"complete"' ] && break; sleep 1; done
sleep 1.5
agent-browser screenshot shots/wordmark/01-home-header.png >/dev/null 2>&1 && echo "shot home OK"
agent-browser eval "(()=>{const w=document.querySelector('header span');return JSON.stringify({tituloTab:document.title, textoWordmark:(document.querySelector('header [class*=font-extrabold]')||{}).textContent||'no encontrado'})})()" 2>&1 | tail -1
# footer
agent-browser eval "window.scrollTo(0,document.body.scrollHeight)" >/dev/null 2>&1; sleep 1
agent-browser screenshot shots/wordmark/02-footer.png >/dev/null 2>&1 && echo "shot footer OK"
# login (auth-shell)
agent-browser open "http://127.0.0.1:3000/ingresar" >/dev/null 2>&1; sleep 2.5
agent-browser screenshot shots/wordmark/03-login.png >/dev/null 2>&1 && echo "shot login OK"
agent-browser errors 2>&1 | tail -2
echo "=== VERIFICACIÓN WORDMARK COMPLETA ==="
