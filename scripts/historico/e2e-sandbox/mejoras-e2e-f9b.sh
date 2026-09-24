#!/bin/bash
# E2E F9b: verificación DNI en vivo (Carolina) — enfocado
cd /home/z/my-project
FAILS=0
# server ya corriendo (reusar); si no, levantar
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

echo "════ F9b: Carolina sube su DNI y la IA analiza las dos fotos ════"
login 'carolina@homia.test'
go 'panel/profesional/verificacion'
wait_eval "(()=>{return JSON.stringify({form:document.body.textContent.includes('Subí tu DNI')})})()" '"form":true'
agent-browser eval "(()=>{const [f,b]=document.querySelectorAll('input[type=file]');f.dataset.slot='front';b.dataset.slot='back';return 'inputs marcados'})()" 2>/dev/null | tail -1
echo "  → subiendo frente…"
agent-browser upload 'input[data-slot="front"]' scripts/demo/assets/dni/dni-carolina-frente.jpg 2>&1 | tail -1
wait_eval "(()=>{return JSON.stringify({frontPreview:!!document.querySelector('img[alt=\"Foto del Frente del DNI\"]')})})()" '"frontpreview":true'
echo "  → subiendo dorso…"
agent-browser upload 'input[data-slot="back"]' scripts/demo/assets/dni/dni-carolina-dorso.jpg 2>&1 | tail -1
wait_eval "(()=>{return JSON.stringify({backPreview:!!document.querySelector('img[alt=\"Foto del Dorso del DNI\"]')})})()" '"backpreview":true'
shot 08-dni-cargado-carolina
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Enviar a verificación con IA'));if(!b)return 'sin boton';if(b.disabled)return 'disabled';b.click();return 'clicked'})()" 2>/dev/null | tail -1
wait_eval "(()=>{const t=document.body.textContent;const listo=t.includes('quedó verificada')||t.includes('en revisión')||t.includes('rechazado')||t.includes('Dictamen del modelo');const analizando=t.includes('La IA está analizando');return JSON.stringify({analizando,listo})})()" '"listo":true'
shot 09-resultado-ia-carolina
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1
go 'panel/profesional/mensajes'
wait_eval "(()=>{const items=[...document.querySelectorAll('aside button')];items[0]&&items[0].click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
wait_eval "(()=>{const hdr=[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Ver perfil'));return JSON.stringify({verPerfilMobile:!!hdr})})()" '"verperfilmobile":true'
agent-browser eval "(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.includes('Ver perfil'));b.click();return 'ok'})()" >/dev/null 2>&1; sleep 2
wait_eval "(()=>{return JSON.stringify({perfilAbierto:document.body.textContent.includes('Contactar')||document.body.textContent.includes('clients')||document.body.textContent.includes('Elementos publicados')||document.body.textContent.includes('Catálogo')})})()" '"perfilabierto":true'
shot 10-mobile-chat-ver-perfil
go 'panel/profesional/directorio'
wait_eval "(()=>{const nums=[...document.querySelectorAll('.homy-num-adapt')];const bad=nums.filter(el=>el.scrollWidth>el.clientWidth+1);return JSON.stringify({cifrasMobile:nums.length,desbordadasMobile:bad.length})})()" '"desbordadasmobile":0'
shot 11-mobile-directorio-numeros
agent-browser set viewport 1280 800 >/dev/null 2>&1
echo ""
echo "══════ F9b RESULTADO: $FAILS fallos ══════"
node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const c=await db.user.findUnique({where:{email:'carolina@homia.test'},select:{verificationStatus:true}});const d=await db.identityDocument.findFirst({where:{user:{email:'carolina@homia.test'}},orderBy:{createdAt:'desc'}});console.log('Carolina:',c.verificationStatus,'| doc:',d?d.status+' ('+Math.round((d.aiScore||0)*100)+'%)':'ninguno');await db.\$disconnect()})"
