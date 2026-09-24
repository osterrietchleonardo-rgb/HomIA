#!/bin/bash
# E2E F9c: verificación DNI en vivo vía fetch del navegador (mismos endpoints + UI)
cd /home/z/my-project
FAILS=0
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4)
if [ "$code" != "200" ]; then
  setsid bash -c 'bun run dev > /tmp/dev-mejoras.log 2>&1' < /dev/null > /dev/null 2>&1 &
  for i in $(seq 1 30); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && break; done
fi
echo "SERVER $code"

wait_eval() { for i in $(seq 1 45); do r=$(agent-browser eval "$1" 2>/dev/null | tail -1 | tr -d '\\'); echo "$r" | rg -qi "$2" && { echo "  OK → $r"; return 0; }; sleep 1; done; echo "  FALLA → $r"; FAILS=$((FAILS+1)); return 1; }
login() { agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'$1',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1 | tr -d '\\'; }
shot() { agent-browser screenshot "shots/mejoras/$1.png" >/dev/null 2>&1 && echo "  📸 $1"; }
go() { agent-browser open "http://127.0.0.1:3000/$1" >/dev/null 2>&1; sleep 2; }

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3

echo "════ F9c: Carolina — subida vía /api/uploads + análisis IA + UI ════"
login 'carolina@homia.test'
go 'panel/profesional/verificacion'
wait_eval "(()=>{return JSON.stringify({form:document.body.textContent.includes('Subí tu DNI'),estadoNoVerif:document.body.textContent.includes('Todavía no está verificada')||document.body.textContent.includes('no está verificada')})})()" '"form":true'
shot 08-dni-form-carolina
# sube frente + dorso por el endpoint REAL de uploads y dispara el análisis IA real
wait_eval "(async()=>{try{const up=async(u)=>{const b=await (await fetch(u)).blob();const fd=new FormData();fd.append('file',new File([b],'frente.jpg',{type:'image/jpeg'}));fd.append('folder','dni');const r=await fetch('/api/uploads',{method:'POST',body:fd});return (await r.json()).url};const front=await up('/uploads/demo-assets/caro-frente.jpg');const back=await up('/uploads/demo-assets/caro-dorso.jpg');const res=await fetch('/api/verification/dni',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frontUrl:front,backUrl:back})});const d=await res.json();return JSON.stringify({status:res.status,veredicto:d.status,score:d.aiScore})}catch(e){return JSON.stringify({error:String(e).slice(0,80)})}})()" '"veredicto":"(verificado|en_revision|rechazado)"'
shot 09-resultado-ia-carolina
# la página se refresca y muestra el nuevo estado con dictamen
agent-browser eval "location.reload();'ok'" >/dev/null 2>&1; sleep 3
wait_eval "(()=>{const t=document.body.textContent;return JSON.stringify({dictamen:t.includes('Dictamen del modelo'),legible:t.includes('Legible'),consistente:t.includes('Datos consistentes'),confianza:t.includes('Confianza')})})()" '"dictamen":true.*"confianza":true'
shot 10-dni-dictamen-carolina

echo "════ F10: mobile 390 — chat con Ver perfil + números del directorio ════"
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
go 'panel/profesional/mensajes'
wait_eval "(()=>{const items=[...document.querySelectorAll('aside button')];if(items[0])items[0].click();return JSON.stringify({abreChat:!!items[0]})})()" '"abrechat":true'
wait_eval "(()=>{const hdr=[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Ver perfil'));const badge=[...document.querySelectorAll('header [aria-label*=\"Identidad verificada\"],header [title*=\"no verificó\"],header [title*=\"no verificó su identidad\"]')].length;return JSON.stringify({verPerfilMobile:!!hdr,badgeChat:badge>0})})()" '"verperfilmobile":true'
agent-browser eval "(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.includes('Ver perfil'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 2.5
wait_eval "(()=>{return JSON.stringify({perfilAbierto:document.body.textContent.includes('Elementos publicados')||document.body.textContent.includes('Catálogo')||document.body.textContent.includes('Contactar')})})()" '"perfilabierto":true'
shot 11-mobile-chat-ver-perfil
go 'panel/profesional/directorio'
wait_eval "(()=>{const nums=[...document.querySelectorAll('.homy-num-adapt')];const bad=nums.filter(el=>el.scrollWidth>el.clientWidth+1);return JSON.stringify({cifrasMobile:nums.length,desbordadasMobile:bad.length})})()" '"desbordadasmobile":0'
shot 12-mobile-directorio-numeros
agent-browser set viewport 1280 800 >/dev/null 2>&1
echo ""
echo "══════ F9c RESULTADO: $FAILS fallos ══════"
node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const c=await db.user.findUnique({where:{email:'carolina@homia.test'},select:{verificationStatus:true}});const d=await db.identityDocument.findFirst({where:{user:{email:'carolina@homia.test'}},orderBy:{createdAt:'desc'}});console.log('Carolina:',c.verificationStatus,'| doc:',d?d.status+' ('+Math.round((d.aiScore||0)*100)+'%)':'ninguno');await db.\$disconnect()})"
