#!/bin/bash
cd /home/z/my-project
setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && break; done
pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/ingresar" --viewport 1280 800 >/dev/null 2>&1
for i in $(seq 1 15); do r=$(agent-browser eval "document.readyState" 2>/dev/null | tr -d '\\'); [ "$r" = '"complete"' ] && break; sleep 1; done
sleep 1.5
agent-browser eval "(()=>{const outer=[...document.querySelectorAll('span')].find(s=>s.className.includes('font-extrabold')&&s.textContent.trim()==='HomIA'&&s.querySelector('span.relative'));if(!outer)return 'NO WORDMARK';const inner=outer.querySelector('span.relative');const dot=inner.querySelector('span[aria-hidden]');const io=inner.getBoundingClientRect(),doR=dot.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(inner);const g=range.getBoundingClientRect();const cs=getComputedStyle(inner);return JSON.stringify({innerBox:{l:Math.round(io.left*10)/10,r:Math.round(io.right*10)/10,w:Math.round(io.width*100)/100},glyphBox:{l:Math.round(g.left*10)/10,r:Math.round(g.right*10)/10},dot:{l:Math.round(doR.left*10)/10,cx:Math.round((doR.left+doR.right)/2*10)/10},fontSize:cs.fontSize,letterSpacing:cs.letterSpacing})})()" 2>&1 | tail -1
