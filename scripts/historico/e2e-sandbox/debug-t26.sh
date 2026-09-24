#!/bin/bash
# Debug F5/F6 de Task 26
cd /home/z/my-project
pkill -9 -f "next dev" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1
setsid bash -c 'bun run dev > /tmp/dev-t26b.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 4); [ "$code" = "200" ] && break; done
echo "SERVER UP ($code)"

echo "── 1) Notificaciones del profesional por API ──"
curl -s -c /tmp/dbg-pro.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"profesional@homia.test","password":"Homy2026!"}' -o /dev/null
curl -s -b /tmp/dbg-pro.txt http://localhost:3000/api/notifications | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('total:',(j.notifications||[]).length);(j.notifications||[]).slice(0,4).forEach(n=>console.log('-',n.type,'|',n.title,'|',(n.body||'').slice(0,60)))})"

echo "── 2) Crear notificación contratación fresca y verla en UI ──"
node -e "import('@prisma/client').then(async({PrismaClient})=>{const db=new PrismaClient();const u=await db.user.findUnique({where:{email:'profesional@homia.test'}});await db.notification.create({data:{userId:u.id,type:'contratacion',title:'Te contrataron para un trabajo',body:'Valentina Gómez te contrató: DEBUG Cambio de llave',link:'/panel/profesional/proyectos'}});console.log('notif creada');await db.\$disconnect()})"

pkill -9 -f agent-browser 2>/dev/null; sleep 1
agent-browser open "http://127.0.0.1:3000/" --viewport 1280 800 >/dev/null 2>&1; sleep 3
agent-browser eval "(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'profesional@homia.test',password:'Homy2026!'})});return r.status})()" 2>/dev/null | tail -1
agent-browser open "http://127.0.0.1:3000/panel/profesional/notificaciones" >/dev/null 2>&1; sleep 4
agent-browser eval "(()=>{const t=document.body.textContent.replace(/\\s+/g,' ');return JSON.stringify({tieneContrataron:t.includes('Te contrataron para un trabajo'),tieneDEBUG:t.includes('DEBUG'),len:t.length,fragmento:t.slice(t.indexOf('Notificaciones'),t.indexOf('Notificaciones')+400)})})()" 2>/dev/null | tail -1

echo "── 3) Mobile: quién desborda en el directorio con wizard ──"
agent-browser open "http://127.0.0.1:3000/panel/cliente/directorio" --viewport 390 844 >/dev/null 2>&1; sleep 3
agent-browser eval "(function(){const b=[...document.querySelectorAll('button[aria-label^=\"Contratar a\"]')][0];b.click();return 'ok'})()" >/dev/null 2>&1; sleep 1.5
agent-browser eval "(()=>{const d=document.querySelector('[role=dialog]');const r=d?d.getBoundingClientRect():null;const doc=document.documentElement;const bad=[...document.querySelectorAll('*')].map(el=>{const w=el.scrollWidth;return w>392&&el!==doc&&el.parentElement!==doc?{tag:el.tagName,cls:(el.className||'').toString().slice(0,60),w}:null}).filter(Boolean).slice(0,6);return JSON.stringify({dialogW:r?r.width:null,docScroll:doc.scrollWidth,candidatos:bad})})()" 2>/dev/null | tail -1
