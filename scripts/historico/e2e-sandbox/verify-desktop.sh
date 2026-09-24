#!/bin/bash
# Verificación visual multi-viewport HomIA — todas las páginas x 3 viewports
set -u
SHOTS=/home/z/my-project/shots/verify
mkdir -p "$SHOTS"
BASE=http://localhost:3000

sweep() {
  local label="$1"; shift
  local routes=("$@")
  for r in "${routes[@]}"; do
    local name=$(echo "$r" | sed 's|/|-|g; s|^-||; s|^$|home|')
    [ -z "$name" ] && name="home"
    agent-browser open "$BASE/$r" > /dev/null 2>&1
    agent-browser wait --load networkidle > /dev/null 2>&1
    sleep 0.6
    agent-browser screenshot "$SHOTS/${label}-${name}.png" > /dev/null 2>&1
    local errs=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
    echo "[$label] $r -> shot OK, js-errors:$errs"
  done
}

# ── Viewport desktop ──
agent-browser set viewport 1280 800 > /dev/null 2>&1

# Sesión actual (cliente.ui@homia.com) — sweep cliente
CLIENTE=( "" "buscar" "notificaciones" "ingresar" "registrarse" "panel/cliente" "panel/cliente/publicar" "panel/cliente/trabajos" "panel/cliente/proyectos" "panel/cliente/facturas" "panel/cliente/perfil" )
sweep "d" "${CLIENTE[@]}"

# Login profesional vía API (cookie en el browser)
agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'pro.diag@homia.com',password:'test123456'})}).then(r=>r.status)" > /dev/null 2>&1
sleep 1
PRO=( "panel/profesional" "panel/profesional/bolsa" "panel/profesional/materiales" "panel/profesional/presupuestos" "panel/profesional/proyectos" "panel/profesional/crm" "panel/profesional/obras" "panel/profesional/vinculaciones" "panel/profesional/perfil" )
sweep "d" "${PRO[@]}"

# Login proveedor vía API
agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'prov.diag@homia.com',password:'test123456'})}).then(r=>r.status)" > /dev/null 2>&1
sleep 1
PROV=( "panel/proveedor" "panel/proveedor/stock" "panel/proveedor/crm" "panel/proveedor/vinculaciones" "panel/proveedor/perfil" )
sweep "d" "${PROV[@]}"

echo "DESKTOP SWEEP DONE"
