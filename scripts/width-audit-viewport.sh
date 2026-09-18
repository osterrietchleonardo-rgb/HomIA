#!/bin/bash
# Checks de viewport real: 1920 simetría + 390 overflow
cd /home/z/my-project
setsid bash -c 'bun run dev > /tmp/dev-direct.log 2>&1' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 20); do sleep 3; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$code" = "200" ] && { echo "SERVER UP"; break; }; done
[ "$code" != "200" ] && { echo "SERVER NO LEVANTÓ"; exit 1; }

agent-browser open "http://127.0.0.1:3000/panel/profesional/presupuestos" --viewport 1920 1080 >/dev/null 2>&1; sleep 2
agent-browser eval "(async()=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'width.audit@homia.test',password:'WidthAudit2026!'})});return 'ok'})()" >/dev/null 2>&1

# --- 1920 real ---
agent-browser set viewport 1920 1080 >/dev/null 2>&1; sleep 1
agent-browser eval "(()=>{const m=document.querySelector('main');const page=m.querySelector('.homy-page');const pr=page.getBoundingClientRect();const grid=document.querySelector('.homy-stagger');const gr=grid?grid.getBoundingClientRect():pr;return JSON.stringify({vw:innerWidth,pageL:Math.round(pr.left),pageR:Math.round(pr.right),gridR:Math.round(gr.right),gapIzq:Math.round(pr.left-(m.getBoundingClientRect().left+32)),gapDer:Math.round((m.getBoundingClientRect().right-32)-gr.right)})})()" 2>&1 | tail -1
agent-browser screenshot shots/width-audit/04-presupuestos-1920-real.png >/dev/null 2>&1 && echo "shot 1920 OK"

# --- 390 real (mobile) ---
agent-browser set viewport 390 844 >/dev/null 2>&1; sleep 1.5
agent-browser eval "(()=>{const d=document.documentElement;const m=document.querySelector('main');const page=m.querySelector('.homy-page');const pr=page.getBoundingClientRect();return JSON.stringify({vw:innerWidth,scrollW:d.scrollWidth,overflow:d.scrollWidth>innerWidth,pageL:Math.round(pr.left),pageR:Math.round(pr.right)})})()" 2>&1 | tail -1
agent-browser screenshot shots/width-audit/05-presupuestos-390.png >/dev/null 2>&1 && echo "shot 390 OK"

# --- dashboard y bolsa en 1920 (control, ya llenaban antes) ---
agent-browser set viewport 1920 1080 >/dev/null 2>&1; sleep 1
agent-browser open "http://127.0.0.1:3000/panel/profesional" >/dev/null 2>&1; sleep 2
agent-browser eval "(()=>{const page=document.querySelector('.homy-page');const pr=page.getBoundingClientRect();const last=page.lastElementChild.getBoundingClientRect();return JSON.stringify({p:'dashboard',pageL:Math.round(pr.left),pageR:Math.round(pr.right),contentR:Math.round(last.right)})})()" 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/panel/profesional/bolsa" >/dev/null 2>&1; sleep 2
agent-browser eval "(()=>{const page=document.querySelector('.homy-page');const pr=page.getBoundingClientRect();const rows=page.querySelectorAll('.homy-row,section,form');let maxR=0;rows.forEach(el=>maxR=Math.max(maxR,el.getBoundingClientRect().right));return JSON.stringify({p:'bolsa',pageL:Math.round(pr.left),pageR:Math.round(pr.right),contentR:Math.round(maxR)})})()" 2>&1 | tail -1
echo "=== VIEWPORT CHECKS OK ==="
