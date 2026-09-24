#!/bin/bash
# Smoke test E2E contra el SERVIDOR DE PRODUCCIÓN standalone (puerto 3100)
# Cobertura: login real de los 3 roles, sesión, PDF de factura, mensajería
# (regla cliente-inicia), gates de permisos y directorio público.
BASE=http://127.0.0.1:3100
PASS=0; FAIL=0
ck() { if [ "$1" = "$2" ]; then PASS=$((PASS+1)); echo "  ✓ $3 [$1]"; else FAIL=$((FAIL+1)); echo "  ✗ $3 [esperado $2, recibido $1]"; fi }
contains() { if echo "$1" | grep -q "$2"; then PASS=$((PASS+1)); echo "  ✓ $3"; else FAIL=$((FAIL+1)); echo "  ✗ $3 (sin '$2')"; fi }

echo "── F0: superficies públicas (producción standalone) ──"
ck "$(curl -s -o /dev/null -w '%{http_code}' $BASE/)" "200" "landing 200"
ck "$(curl -s -o /dev/null -w '%{http_code}' $BASE/directorio)" "200" "SPA catch-all 200"
DIR=$(curl -s "$BASE/api/directory")
contains "$DIR" '"directory"' "directorio público devuelve datos"
PRO_ID=$(echo "$DIR" | grep -o '"kind":"profesional","id":"[^"]*"' | head -1 | sed 's/.*id":"//;s/"//')
echo "    profesional demo: $PRO_ID"

echo "── F1: login real (bcrypt + JWT httpOnly) ──"
CJ=/tmp/smoke-client.txt; PJ=/tmp/smoke-pro.txt; VJ=/tmp/smoke-prov.txt; rm -f $CJ $PJ $VJ
R1=$(curl -s -c $CJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"Homy2026!"}')
contains "$R1" '"ok":true\|Valentina' "login cliente"
R2=$(curl -s -c $PJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"profesional@homia.test","password":"Homy2026!"}')
contains "$R2" '"ok":true\|Mat' "login profesional"
R3=$(curl -s -c $VJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"proveedor@homia.test","password":"Homy2026!"}')
contains "$R3" '"ok":true\|Ferrer' "login proveedor"
ck "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"malapass"}')" "401" "password incorrecta → 401"
ME=$(curl -s -b $CJ $BASE/api/auth/me)
contains "$ME" 'cliente@homia.test' "sesión /me con cookie"

echo "── F2: PDF de factura (pdf-lib, el bug original) ──"
INV_ID=$(curl -s -b $CJ "$BASE/api/projects" | grep -o '"invoices":\[{"id":"[^"]*"' | head -1 | sed 's/.*id":"//;s/"//')
echo "    factura demo: $INV_ID"
ck "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/invoices/$INV_ID/pdf)" "401" "PDF sin sesión → 401"
curl -s -b $CJ "$BASE/api/invoices/$INV_ID/pdf" -o /tmp/smoke-invoice.pdf
MAGIC=$(head -c 4 /tmp/smoke-invoice.pdf)
ck "$MAGIC" "%PDF" "PDF con sesión empieza con %PDF ($(stat -c%s /tmp/smoke-invoice.pdf) bytes)"
ck "$(curl -s -o /dev/null -w '%{http_code}' -b $VJ $BASE/api/invoices/$INV_ID/pdf)" "403" "PDF a tercero (proveedor) → 403"

echo "── F3: mensajería (regla: cliente inicia) ──"
CONVS=$(curl -s -b $CJ "$BASE/api/messages/conversations")
contains "$CONVS" '"conversations"' "bandeja del cliente"
UNREAD=$(curl -s -b $CJ "$BASE/api/messages/unread")
contains "$UNREAD" '"total"' "badge unread"
# profesional → cliente NUEVO sin hilo → 403 (el cliente escribe primero)
REG_EMAIL="smoke.$(date +%s)@x.test"
REG=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$REG_EMAIL\",\"password\":\"Test1234!\",\"displayName\":\"Smoke Tester\",\"roles\":[\"profesional\"]}")
contains "$REG" '"ok":true\|id' "registro usuario profesional de prueba"
CJP=/tmp/smoke-pro2.txt; rm -f $CJP
curl -s -c $CJP -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$REG_EMAIL\",\"password\":\"Test1234!\"}" > /dev/null
CLIENT_ID=$(echo "$ME" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*id":"//;s/"//')
BLOCK=$(curl -s -b $CJP -X POST $BASE/api/messages/conversations -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$CLIENT_ID\",\"body\":\"hola\"}")
contains "$BLOCK" 'clientesFirst\|403' "pro NO puede iniciar chat con cliente (403 clientesFirst)"
# cliente inicia con profesional → 201
OKC=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/messages/conversations -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$(echo "$R2" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*id":"//;s/"//')\",\"body\":\"Smoke: hola Matías\"}")
if [ "$OKC" = "201" ] || [ "$OKC" = "200" ]; then PASS=$((PASS+1)); echo "  ✓ cliente SÍ inicia chat con profesional [$OKC]"; else FAIL=$((FAIL+1)); echo "  ✗ cliente inicia chat [$OKC]"; fi

echo "── F4: gates de perfiles (detalle solo logueado) ──"
ck "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/profiles/professional/$PRO_ID)" "401" "perfil pro sin sesión → 401"
ck "$(curl -s -o /dev/null -w '%{http_code}' -b $CJ $BASE/api/profiles/professional/$PRO_ID)" "200" "perfil pro con sesión → 200"

echo "── F5: limpieza del usuario de prueba ──"
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const u = await db.user.findUnique({ where: { email: '$REG_EMAIL' } });
  if (u) {
    await db.message.deleteMany({ where: { OR: [{ conversation: { userAId: u.id } }, { conversation: { userBId: u.id } }] } });
    await db.conversation.deleteMany({ where: { OR: [{ userAId: u.id }, { userBId: u.id }] } });
    await db.notification.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    console.log('  ✓ usuario smoke eliminado');
  } else console.log('  (nada que limpiar)');
  await db.\$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
"

echo ""
echo "════════════════════════════════════"
echo "RESULTADO: $PASS pass · $FAIL fail"
[ $FAIL -eq 0 ] && echo "🔥 SMOKE TEST DE PRODUCCIÓN: TODO VERDE" || echo "⚠ HAY FALLOS"
exit $FAIL
