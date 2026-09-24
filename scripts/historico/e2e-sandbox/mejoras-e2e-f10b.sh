#!/bin/bash
# F10b: mobile "Ver perfil" con contraparte proveedor (sí tiene perfil público)
cd /home/z/my-project
FAILS=0
wait_eval() { for i in $(seq 1 40); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
shot() { agent-browser screenshot "shots/mejoras/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 2; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 390 844 >/dev/null 2>&1; sleep 3
login 'profesional@homia.test'
go 'panel/profesional/mensajes'
wait_eval "(()=>{const convs=[...document.querySelectorAll('aside button')].filter(b=>b.textContent.includes('Ferrer'));if(convs[0])convs[0].click();return JSON.stringify({encontroFerrer:!!convs[0]})})()" '"encontroferrer":true'
wait_eval "(()=>{const hdr=[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Ver perfil'));const badge=[...document.querySelectorAll('header [aria-label*=\"Identidad verificada\"],header [title*=\"no verific\"],header [title*=\"en curso o en revisión\"]')].length;return JSON.stringify({verPerfilMobile:!!hdr,badgeChat:badge>0})})()" '"verperfilmobile":true.*"badgechat":true'
shot 10-mobile-chat-ver-perfil
agent-browser eval "(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.includes('Ver perfil'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 2.5
wait_eval "(()=>{return JSON.stringify({perfilProveedor:document.body.textContent.includes('Catálogo con stock')&&document.body.textContent.includes('Reseñas')})})()" '"perfilproveedor":true'
shot 11-mobile-perfil-desde-chat
echo "══════ F10b: $FAILS fallos ══════"
