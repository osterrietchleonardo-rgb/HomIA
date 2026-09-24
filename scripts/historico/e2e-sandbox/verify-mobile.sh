#!/bin/bash
# Verificación mobile + tablet HomIA
set -u
SHOTS=/home/z/my-project/shots/verify
BASE=http://localhost:3000

sweep() {
  local label="$1"; shift
  local routes=("$@")
  for r in "${routes[@]}"; do
    local name=$(echo "$r" | sed 's|/|-|g; s|^-||; s|^$|home|')
    [ -z "$name" ] && name="home"
    agent-browser open "$BASE/$r" > /dev/null 2>&1
    agent-browser wait --load networkidle > /dev/null 2>&1
    sleep 0.5
    agent-browser screenshot "$SHOTS/${label}-${name}.png" > /dev/null 2>&1
    # overflow check: scrollWidth vs clientWidth
    local of=$(agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tail -1)
    echo "[$label] $r -> OK overflow:+${of}px"
  done
}

# ── MOBILE 390×844 ──
agent-browser set viewport 390 844 > /dev/null 2>&1

# volver a cliente
agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cliente.ui@homia.com',password:'test123456'})}).then(r=>r.status)" > /dev/null 2>&1
sleep 1
CLIENTE=( "" "buscar" "notificaciones" "ingresar" "registrarse" "panel/cliente" "panel/cliente/publicar" "panel/cliente/trabajos" "panel/cliente/proyectos" "panel/cliente/facturas" "panel/cliente/perfil" )
sweep "m" "${CLIENTE[@]}"

agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'pro.diag@homia.com',password:'test123456'})}).then(r=>r.status)" > /dev/null 2>&1
sleep 1
PRO=( "panel/profesional" "panel/profesional/bolsa" "panel/profesional/presupuestos" "panel/profesional/proyectos" "panel/profesional/crm" "panel/profesional/obras" "panel/profesional/vinculaciones" "panel/profesional/perfil" "panel/profesional/materiales" )
sweep "m" "${PRO[@]}"

agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'prov.diag@homia.com',password:'test123456'})}).then(r=>r.status)" > /dev/null 2>&1
sleep 1
PROV=( "panel/proveedor" "panel/proveedor/stock" "panel/proveedor/crm" "panel/proveedor/vinculaciones" "panel/proveedor/perfil" )
sweep "m" "${PROV[@]}"

echo "MOBILE DONE"

# ── TABLET 680×420 ──
agent-browser set viewport 680 420 > /dev/null 2>&1
TAB=( "" "buscar" "ingresar" "panel/cliente" "panel/profesional" "panel/proveedor" )
sweep "t" "${TAB[@]}"
echo "TABLET DONE"
