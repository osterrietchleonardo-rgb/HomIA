#!/bin/bash
# E2E API Task 29: reseñas con regla real (participantes de obra finalizada),
# pago de facturas en efectivo (acordar/confirmar/cancelar), modo de materiales
# (pro adelanta vs cliente paga al proveedor) y cobros de proveedor a cliente.
BASE=http://127.0.0.1:3100
PASS=0; FAIL=0
ck() { if [ "$1" = "$2" ]; then PASS=$((PASS+1)); echo "  ✓ $3 [$1]"; else FAIL=$((FAIL+1)); echo "  ✗ $3 [esperado $2, recibido $1]"; fi }
contains() { if echo "$1" | grep -q "$2"; then PASS=$((PASS+1)); echo "  ✓ $3"; else FAIL=$((FAIL+1)); echo "  ✗ $3 (sin '$2')"; fi }
NOFIELD() { if echo "$1" | grep -q "$2"; then FAIL=$((FAIL+1)); echo "  ✗ $3 (contiene '$2')"; else PASS=$((PASS+1)); echo "  ✓ $3"; fi }

# ── servidor de producción vivo ──
if ! curl -s -o /dev/null --max-time 3 $BASE/; then
  echo "server caído, re-levantando…"
  (setsid env NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/prod-server.log 2>&1 &)
  for i in $(seq 1 20); do curl -s -o /dev/null --max-time 2 $BASE/ && break; sleep 1; done
fi

CJ=/tmp/t29-client.txt; PJ=/tmp/t29-pro.txt; VJ=/tmp/t29-prov.txt; rm -f $CJ $PJ $VJ
echo "── login de los 3 roles demo ──"
curl -s -c $CJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"Homy2026!"}' > /tmp/t29-c.json
curl -s -c $PJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"profesional@homia.test","password":"Homy2026!"}' > /tmp/t29-p.json
curl -s -c $VJ -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"proveedor@homia.test","password":"Homy2026!"}' > /tmp/t29-v.json
contains "$(cat /tmp/t29-c.json)" 'Valentina' "login cliente"
contains "$(cat /tmp/t29-p.json)" 'Matías' "login profesional"
contains "$(cat /tmp/t29-v.json)" 'Ferrer' "login proveedor"
CLIENT_ID=$(grep -o '"id":"[^"]*"' /tmp/t29-c.json | head -1 | sed 's/.*id":"//;s/"//')
PRO_USER_ID=$(grep -o '"id":"[^"]*"' /tmp/t29-p.json | head -1 | sed 's/.*id":"//;s/"//')
PROV_USER_ID=$(grep -o '"id":"[^"]*"' /tmp/t29-v.json | head -1 | sed 's/.*id":"//;s/"//')
# ids de perfil: vienen del directorio público (el /me no los expone)
DIR=$(curl -s $BASE/api/directory)
PRO_PROFILE_ID=$(echo "$DIR" | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['id'] for e in d['directory'] if e['kind']=='profesional' and 'Ferrer' in (e.get('displayName','')+e.get('name',''))][0])")
PROV_PROFILE_ID=$(echo "$DIR" | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['id'] for e in d['directory'] if e['kind']=='proveedor'][0])")
echo "    client=$CLIENT_ID pro=$PRO_USER_ID (perfil $PRO_PROFILE_ID) prov=$PROV_USER_ID (perfil $PROV_PROFILE_ID)"

echo "── A: reseñas — reglas de confianza ──"
# A1: sin projectId → 403
A1=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRO_USER_ID\",\"rating\":5,\"comment\":\"trivia\"}")
ck "$A1" "403" "reseña sin proyecto real → 403"
# A2: proyecto NUEVO activo (no finalizado) entre cliente y profesional demo
PROJ=$(curl -s -b $CJ -X POST $BASE/api/projects -H 'Content-Type: application/json' -d "{\"professionalProfileId\":\"$PRO_PROFILE_ID\",\"title\":\"T29 E2E — Instalación de aire\",\"description\":\"proyecto de prueba automatizada\",\"laborCost\":150000}")
PROJECT_ID=$(echo "$PROJ" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*id":"//;s/"//')
echo "    proyecto de prueba: $PROJECT_ID"
A2=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRO_USER_ID\",\"rating\":5,\"comment\":\"antes de tiempo\",\"projectId\":\"$PROJECT_ID\"}")
ck "$A2" "403" "reseña con obra NO finalizada → 403"
# A3: tercero (proveedor) reseña al profesional de una obra ajena → 403
A3=$(curl -s -o /dev/null -w '%{http_code}' -b $VJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRO_USER_ID\",\"rating\":5,\"comment\":\"no participé\",\"projectId\":\"$PROJECT_ID\"}")
ck "$A3" "403" "no-participante → 403"

echo "── B: modo de materiales + cobro del proveedor ──"
# B1: el pro cambia el modo a cliente_paga_proveedor
B1=$(curl -s -o /dev/null -w '%{http_code}' -b $PJ -X PATCH $BASE/api/projects/$PROJECT_ID -H 'Content-Type: application/json' -d '{"materialsPaymentMode":"cliente_paga_proveedor"}')
ck "$B1" "200" "pro define modo cliente_paga_proveedor"
MODE=$(curl -s -b $CJ $BASE/api/projects/$PROJECT_ID | grep -o '"materialsPaymentMode":"[^"]*"')
contains "$MODE" 'cliente_paga_proveedor' "el cliente ve el modo en su detalle"
# B2: pro propone un material del catálogo con el proveedor demo (cantidad/precio fijos)
CAT=$(curl -s -b $PJ $BASE/api/catalog)
ELEMENT_ID=$(echo "$CAT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['categories'][0]['elements'][0]['id'])")
ELEMENT_NAME=$(echo "$CAT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['categories'][0]['elements'][0]['name'])")
echo "    elemento catálogo: $ELEMENT_ID ($ELEMENT_NAME)"
PRICE=25000
MAT=$(curl -s -b $PJ -X POST $BASE/api/projects/$PROJECT_ID/materials -H 'Content-Type: application/json' -d "{\"elementId\":\"$ELEMENT_ID\",\"providerId\":\"$PROV_PROFILE_ID\",\"quantity\":2,\"unitPrice\":$PRICE,\"note\":\"material del e2e T29\"}")
MATERIAL_ID=$(echo "$MAT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('material',{}).get('id',''))")
echo "    material propuesto: $MATERIAL_ID"
# B3: cliente aprueba el material
B3=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X PATCH $BASE/api/projects/$PROJECT_ID/materials -H 'Content-Type: application/json' -d "{\"materialId\":\"$MATERIAL_ID\",\"action\":\"aprobar\"}")
ck "$B3" "200" "cliente aprueba material"
# B4: proveedor ve el material pendiente de cobro en su pantalla de cobros
PEND=$(curl -s -b $VJ $BASE/api/provider/charges)
contains "$PEND" "$PROJECT_ID" "proveedor ve materiales por cobrar del proyecto"
# B5: proveedor emite el cobro
CHG=$(curl -s -b $VJ -X POST $BASE/api/provider/charges -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT_ID\"}")
CHARGE_ID=$(echo "$CHG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('charge',{}).get('id',''))")
CHARGE_NUM=$(echo "$CHG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('charge',{}).get('number',''))")
CHARGE_AMT=$(echo "$CHG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('charge',{}).get('amount',0))")
echo "    cobro emitido: $CHARGE_ID ($CHARGE_NUM) por $CHARGE_AMT"
ck "$(echo "$CHARGE_NUM" | grep -c 'PRV-')" "1" "número de cobro PRV-…"
# B6: doble cobro bloqueado
B6=$(curl -s -o /dev/null -w '%{http_code}' -b $VJ -X POST $BASE/api/provider/charges -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT_ID\"}")
ck "$B6" "400" "segundo cobro abierto del mismo proyecto → 400"
# B7: el cobro solo lo puede emitir el proveedor
B7=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/provider/charges -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT_ID\"}")
ck "$B7" "403" "cliente no puede emitir cobros de proveedor → 403"
# B8: cliente paga el cobro en EFECTIVO (acuerdo) y el proveedor confirma
B8=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/charges/$CHARGE_ID -H 'Content-Type: application/json' -d '{"method":"efectivo"}')
ck "$B8" "200" "cliente acuerda efectivo con proveedor"
B9=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X PATCH $BASE/api/charges/$CHARGE_ID)
ck "$B9" "403" "cliente NO confirma el cobro del proveedor → 403"
B10=$(curl -s -o /dev/null -w '%{http_code}' -b $VJ -X PATCH $BASE/api/charges/$CHARGE_ID)
ck "$B10" "200" "proveedor confirma cobro en efectivo → pagada"
STATUS_CH=$(curl -s -b $CJ $BASE/api/charges/$CHARGE_ID | grep -o '"status":"[^"]*"' | head -1)
contains "$STATUS_CH" 'pagada' "el cobro quedó pagado para ambos"
# B11: método MP del cobro sin configuración → 503 (needsConfig) — probamos con otro material
MAT2=$(curl -s -b $PJ -X POST $BASE/api/projects/$PROJECT_ID/materials -H 'Content-Type: application/json' -d "{\"name\":\"Clavos T29\",\"providerId\":\"$PROV_PROFILE_ID\",\"quantity\":1,\"unitPrice\":5000}")
MAT2_ID=$(echo "$MAT2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('material',{}).get('id',''))")
curl -s -o /dev/null -b $CJ -X PATCH $BASE/api/projects/$PROJECT_ID/materials -H 'Content-Type: application/json' -d "{\"materialId\":\"$MAT2_ID\",\"action\":\"aprobar\"}"
CHG2=$(curl -s -b $VJ -X POST $BASE/api/provider/charges -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT_ID\"}")
CHARGE2_ID=$(echo "$CHG2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('charge',{}).get('id',''))")
B11=$(curl -s -b $CJ -X POST $BASE/api/charges/$CHARGE2_ID -H 'Content-Type: application/json' -d '{"method":"mercadopago"}')
contains "$B11" 'needsConfig\|503' "cobro con Mercado Pago sin MP configurado → aviso claro"

echo "── C: factura del profesional en modo cliente_paga_proveedor ──"
INV=$(curl -s -b $PJ -X POST $BASE/api/projects/$PROJECT_ID/invoice)
INV_ID=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('invoice',{}).get('id',''))")
INV_TOTAL=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('invoice',{}).get('total',0))")
echo "    factura: $INV_ID total $INV_TOTAL (labor 150000)"
if [ "$INV_TOTAL" = "150000" ]; then PASS=$((PASS+1)); echo "  ✓ factura SOLO mano de obra (materiales afuera)"; else FAIL=$((FAIL+1)); echo "  ✗ factura debería ser 150000"; fi
contains "$INV" 'Mano de obra' "item de mano de obra presente"
NOFIELD "$INV" 'Clavos T29' "los materiales NO van en la factura del pro"
# C2: PDF de la factura (con nota de modo B) — descargado y renderizado
curl -s -b $CJ "$BASE/api/invoices/$INV_ID/pdf" -o /tmp/t29-invoice.pdf
ck "$(head -c 4 /tmp/t29-invoice.pdf)" "%PDF" "PDF de factura modo B ($(stat -c%s /tmp/t29-invoice.pdf) bytes)"
contains "$(pdftotext /tmp/t29-invoice.pdf - 2>/dev/null)" "MATERIALES POR FUERA" "PDF explica que los materiales van aparte"

echo "── D: pago de factura en EFECTIVO (acordar → confirmar) ──"
D0=$(curl -s -o /dev/null -w '%{http_code}' -b $PJ -X POST $BASE/api/invoices/$INV_ID/cash -H 'Content-Type: application/json' -d '{"action":"acordar"}')
ck "$D0" "403" "el profesional NO acuerda el pago (solo cliente) → 403"
D1=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/invoices/$INV_ID/cash -H 'Content-Type: application/json' -d '{"action":"acordar"}')
ck "$D1" "200" "cliente acuerda pagar en efectivo"
PM=$(curl -s -b $CJ $BASE/api/projects/$PROJECT_ID | grep -o '"paymentMethod":"[^"]*"' | head -1)
contains "$PM" 'efectivo' "factura con método efectivo visible para el cliente"
D2=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/invoices/$INV_ID/cash -H 'Content-Type: application/json' -d '{"action":"confirmar"}')
ck "$D2" "403" "cliente NO confirma su propio cobro → 403"
D3=$(curl -s -o /dev/null -w '%{http_code}' -b $PJ -X POST $BASE/api/invoices/$INV_ID/cash -H 'Content-Type: application/json' -d '{"action":"confirmar"}')
ck "$D3" "200" "profesional confirma cobro en efectivo"
INV_STATUS=$(curl -s -b $CJ $BASE/api/projects/$PROJECT_ID | python3 -c "import json,sys; d=json.load(sys.stdin); print([i['status'] for i in d['invoices'] if i['id']=='$INV_ID'][0])")
ck "$INV_STATUS" "pagada" "factura quedó pagada"
D4=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/invoices/$INV_ID)
ck "$D4" "400" "pagar factura ya pagada → 400"
D5=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/invoices/$INV_ID/cash -H 'Content-Type: application/json' -d '{"action":"cancelar"}')
ck "$D5" "400" "cancelar acuerdo ya confirmado → 400"

echo "── E: efectivo + cancelación en factura nueva ──"
# segunda factura no existe (solo labor ya facturada); probamos cancelar en la segunda cobrada
# en su lugar: flujo MP sin config con factura nueva no aplica (no hay más labor). OK.

echo "── F: reseñas felices al finalizar ──"
F0=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X PATCH $BASE/api/projects/$PROJECT_ID -H 'Content-Type: application/json' -d '{"stage":"finalizado"}')
ck "$F0" "200" "cliente finaliza la obra"
F1=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRO_USER_ID\",\"rating\":5,\"comment\":\"Excelente trabajo, instaló el aire perfecto\",\"projectId\":\"$PROJECT_ID\"}")
ck "$F1" "201" "cliente reseña al profesional al finalizar → 201"
F2=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PROV_USER_ID\",\"rating\":4,\"comment\":\"Buenos materiales y entrega rápida\",\"projectId\":\"$PROJECT_ID\"}")
ck "$F2" "201" "cliente reseña al proveedor de materiales → 201"
F3=$(curl -s -o /dev/null -w '%{http_code}' -b $PJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$CLIENT_ID\",\"rating\":5,\"comment\":\"Cliente impecable, pagó en tiempo y forma\",\"projectId\":\"$PROJECT_ID\"}")
ck "$F3" "201" "profesional reseña al cliente → 201"
F4=$(curl -s -o /dev/null -w '%{http_code}' -b $CJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRO_USER_ID\",\"rating\":5,\"comment\":\"duplicada\",\"projectId\":\"$PROJECT_ID\"}")
ck "$F4" "409" "reseña duplicada al mismo target → 409"
F5=$(curl -s -o /dev/null -w '%{http_code}' -b $VJ -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$CLIENT_ID\",\"rating\":5,\"comment\":\"yo también quiero\",\"projectId\":\"$PROJECT_ID\"}")
ck "$F5" "403" "proveedor NO puede reseñar al cliente (fuera de la regla 360) → 403"

echo "── G: limpieza total de los artefactos T29 ──"
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const pid = '$PROJECT_ID';
  await db.review.deleteMany({ where: { projectId: pid } });
  await db.notification.deleteMany({ where: { OR: [{ link: { contains: pid } }, { body: { contains: 'T29' } }] } });
  // reponer stock reservado por los materiales del e2e (movimientos con la nota del proyecto)
  const movements = await db.stockMovement.findMany({ where: { note: { contains: 'T29 E2E' }, type: 'reserva' } });
  for (const mv of movements) {
    await db.providerStock.update({ where: { id: mv.stockId }, data: { quantity: { increment: -mv.quantity } } });
    const s = await db.providerStock.findUnique({ where: { id: mv.stockId } });
    if (s) {
      const st = s.quantity <= 0 ? 'agotado' : s.quantity <= s.minStock ? 'por_agotar' : 'disponible';
      await db.providerStock.update({ where: { id: s.id }, data: { status: st } });
    }
    await db.stockMovement.delete({ where: { id: mv.id } });
  }
  const proj = await db.project.findUnique({ where: { id: pid } });
  if (proj) {
    await db.providerCharge.deleteMany({ where: { projectId: pid } });
    await db.invoice.deleteMany({ where: { projectId: pid } });
    await db.projectMaterial.deleteMany({ where: { projectId: pid } });
    await db.project.delete({ where: { id: pid } });
  }
  await db.\$disconnect();
  console.log('  ✓ artefactos T29 eliminados (proyecto, factura, cobros, reseñas, stock repuesto)');
})().catch(e => { console.error('cleanup error:', e.message); process.exit(1); });
"

echo ""
echo "════════════════════════════════════"
echo "RESULTADO T29: $PASS pass · $FAIL fail"
