#!/bin/bash
# F6 aislado: mobile 390 — wizard y facturas PDF
cd /home/z/my-project
FAILS=0
pkill -9 -f "next dev" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1
setsid bash -c 'bun run dev > /tmp/dev-t26f6.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && break; done
echo "SERVER UP ($code)"

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" >/dev/null 2>&1; sleep 3
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
login 'cliente@homia.test'
agent-browser open "http://127.0.0.1:3000/panel/cliente/directorio" >/dev/null 2>&1; sleep 3.5

wait_eval() { for i in $(seq 1 30); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
clickbtn() { agent-browser eval "(function(){const b=[...document.querySelectorAll('button, [role=button], a')].find(x=>x.textContent.replace(/\\s+/g,' ').trim().includes('$1'));if(!b)return 'no-btn:$1';b.click();return 'clicked'})()" >/dev/null 2>&1; }

wait_eval "(()=>{const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')];return JSON.stringify({btns:b.length,vp:window.innerWidth})})()" '"vp":390'
agent-browser eval "(function(){const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')][0];b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const d=document.querySelector('[role=dialog]');if(!d)return JSON.stringify({wizard:false});const r=d.getBoundingClientRect();return JSON.stringify({wizard:true,anchoOk:r.width<=392,sinScrollX:document.documentElement.scrollWidth<=392})})()" '"anchoOk":true'
agent-browser screenshot "shots/hire-pdf/13-mobile-wizard.png" >/dev/null 2>&1 && echo "  📸 13-mobile-wizard"
clickbtn "Cerrar contratación"; sleep 0.8
agent-browser open "http://127.0.0.1:3000/panel/cliente/facturas" >/dev/null 2>&1; sleep 3.5
wait_eval "(()=>{const btns=[...document.querySelectorAll('button[aria-label^=\"Ver factura\"]')];const bad=btns.filter(b=>b.scrollWidth>b.clientWidth+1);return JSON.stringify({pdfs:btns.length,desbordados:bad.length})})()" '"desbordados":0'
agent-browser screenshot "shots/hire-pdf/14-mobile-facturas-pdf.png" >/dev/null 2>&1 && echo "  📸 14-mobile-facturas-pdf"
echo "RESULTADO F6: FAILS=$FAILS"
