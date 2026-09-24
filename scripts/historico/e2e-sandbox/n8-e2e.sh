#!/bin/bash
# E2E API N8 — reputación del cliente, compras directas con reseña, planes de proveedor,
# marketplace de materiales, analítica PRO y destacado Recomendado.
set -u
BASE="http://127.0.0.1:3100"
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2 — $3"; fi }
jqget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const v=($1)??'';console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('')}})" 2>/dev/null; }

login() { curl -s -c "$2" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"Homy2026!\"}" > /dev/null; }

echo "— Sesiones"
login cliente@homia.test /tmp/n8-cli.txt
login proveedor@homia.test /tmp/n8-prv.txt
login profesional@homia.test /tmp/n8-pro.txt
CLI_ID=$(curl -s -b /tmp/n8-cli.txt $BASE/api/auth/me | jqget "j.user.id")
PRV_USER_ID=$(curl -s -b /tmp/n8-prv.txt $BASE/api/auth/me | jqget "j.user.id")
[ -n "$CLI_ID" ] && ck 0 "login cliente+proveedor+profesional" || ck 1 "login" "no IDs"

echo "— Marketplace de materiales"
MKT=$(curl -s -b /tmp/n8-cli.txt "$BASE/api/marketplace?q=cemento")
echo "$MKT" | jqget "j.results.length" > /tmp/n8-mkt.txt
N=$(cat /tmp/n8-mkt.txt)
[ "${N:-0}" -ge 1 ] && ck 0 "marketplace devuelve elementos para 'cemento' ($N)" || ck 1 "marketplace cemento" "$MKT"
MKT_ELEMENT=$(echo "$MKT" | jqget "j.results[0].elementId")
MKT_OFFERS=$(echo "$MKT" | jqget "j.results[0].offers.length")
[ "${MKT_OFFERS:-0}" -ge 1 ] && ck 0 "ofertas por proveedor visibles ($MKT_OFFERS)" || ck 1 "ofertas" "$MKT"
STOCK_ID=$(echo "$MKT" | jqget "j.results[0].offers[0].stockId")
PRICE=$(echo "$MKT" | jqget "j.results[0].offers[0].price")
PROVIDER_ID=$(echo "$MKT" | jqget "j.results[0].offers[0].providerId")
[ -n "$STOCK_ID" ] && [ "$PRICE" != "null" ] && ck 0 "oferta con stockId+precio" || ck 1 "stockId/precio" "$STOCK_ID/$PRICE"
# búsqueda difusa sin acentos/mayúsculas
MKT2=$(curl -s -b /tmp/n8-cli.txt "$BASE/api/marketplace?q=CEMENTO%20PORTLAND")
echo "$MKT2" | grep -q "Portland" && ck 0 "búsqueda difusa insensible a mayúsculas" || ck 1 "difusa mayúsculas" "$MKT2" | head -c 120

echo "— Compra directa end-to-end"
PUR=$(curl -s -b /tmp/n8-cli.txt -X POST $BASE/api/purchases -H 'Content-Type: application/json' -d "{\"stockId\":\"$STOCK_ID\",\"quantity\":2,\"note\":\"test N8\"}")
PUR_ID=$(echo "$PUR" | jqget "j.purchase.id")
[ -n "$PUR_ID" ] && ck 0 "cliente crea pedido (compra directa)" || ck 1 "POST purchases" "$PUR"
ST=$(echo "$PUR" | jqget "j.purchase.status")
[ "$ST" = "solicitado" ] && ck 0 "estado inicial solicitado" || ck 1 "estado inicial" "$ST"
# proveedor ve la venta
SALES=$(curl -s -b /tmp/n8-prv.txt "$BASE/api/purchases?as=proveedor")
echo "$SALES" | grep -q "$PUR_ID" && ck 0 "proveedor ve el pedido en ventas" || ck 1 "ventas proveedor" "$SALES" | head -c 150
# proveedor acepta y entrega (emite cobro directo)
A=$(curl -s -b /tmp/n8-prv.txt -X PATCH $BASE/api/purchases/$PUR_ID -H 'Content-Type: application/json' -d '{"action":"aceptar"}')
echo "$A" | grep -q "aceptado" && ck 0 "proveedor acepta" || ck 1 "aceptar" "$A"
E=$(curl -s -b /tmp/n8-prv.txt -X PATCH $BASE/api/purchases/$PUR_ID -H 'Content-Type: application/json' -d '{"action":"entregar"}')
CHARGE_ID=$(echo "$E" | jqget "j.charge.id")
CHARGE_NUM=$(echo "$E" | jqget "j.charge.number")
[ -n "$CHARGE_ID" ] && ck 0 "entregar emite cobro $CHARGE_NUM" || ck 1 "entregar/cobro" "$E"
CH_PROJECT=$(echo "$E" | jqget "j.charge.projectId")
{ [ -z "$CH_PROJECT" ] || [ "$CH_PROJECT" = "null" ]; } && ck 0 "cobro de venta directa sin proyecto" || ck 1 "projectId null" "$CH_PROJECT"
# cliente paga en efectivo → proveedor confirma → compra pagada
EF=$(curl -s -b /tmp/n8-cli.txt -X POST $BASE/api/charges/$CHARGE_ID -H 'Content-Type: application/json' -d '{"method":"efectivo"}')
echo "$EF" | grep -q "acordada_efectivo" && ck 0 "cliente elige efectivo" || ck 1 "efectivo" "$EF"
CF=$(curl -s -b /tmp/n8-prv.txt -X PATCH $BASE/api/charges/$CHARGE_ID)
echo "$CF" | grep -q "pagada" && ck 0 "proveedor confirma efectivo" || ck 1 "confirmar" "$CF"
P2=$(curl -s -b /tmp/n8-cli.txt "$BASE/api/purchases")
P2_STATUS=$(echo "$P2" | jqget "j.purchases.find(p=>p.id==='$PUR_ID').status")
[ "$P2_STATUS" = "pagado" ] && ck 0 "compra quedó pagada → reseña habilitada" || ck 1 "status pagado" "$P2_STATUS"

echo "— Reseña por compra"
# sin compra no hay reseña (regla de proyecto)
NR=$(curl -s -b /tmp/n8-cli.txt -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRV_USER_ID\",\"rating\":5,\"comment\":\"sin contexto no hay reseña\"}")
echo "$NR" | grep -q "403\|error" && ck 0 "sin proyecto ni compra → reseña bloqueada" || ck 1 "reseña sin contexto" "$NR"
# reseña de compra OK
R=$(curl -s -b /tmp/n8-cli.txt -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRV_USER_ID\",\"rating\":5,\"comment\":\"Excelente atención y el cemento llegó en tiempo. Muy recomendable.\",\"context\":\"compra\",\"purchaseId\":\"$PUR_ID\"}")
echo "$R" | jqget "j.review.id" | grep -q . && ck 0 "reseña por compra directa creada" || ck 1 "reseña compra" "$R"
# duplicada → 409
RD=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-cli.txt -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRV_USER_ID\",\"rating\":4,\"comment\":\"segunda reseña no debe pasar\",\"context\":\"compra\",\"purchaseId\":\"$PUR_ID\"}")
[ "$RD" = "409" ] && ck 0 "reseña duplicada por compra → 409" || ck 1 "duplicada" "$RD"
# reseña de compra no entregada → 403 (la del rodillo está solicitada)
P3=$(curl -s -b /tmp/n8-cli.txt "$BASE/api/purchases" | jqget "j.purchases.find(p=>p.status==='solicitado').id")
if [ -n "$P3" ] && [ "$P3" != "null" ]; then
  RC=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-cli.txt -X POST $BASE/api/reviews -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$PRV_USER_ID\",\"rating\":3,\"comment\":\"no entregado aun\",\"context\":\"compra\",\"purchaseId\":\"$P3\"}")
  [ "$RC" = "403" ] && ck 0 "reseña de compra no entregada → 403" || ck 1 "reseña no entregada" "$RC"
fi

echo "— Reputación del cliente"
CS=$(curl -s -b /tmp/n8-prv.txt "$BASE/api/users/$CLI_ID/client-summary")
echo "$CS" | grep -q "proyectosFinalizados" && ck 0 "resumen del cliente accesible para proveedor" || ck 1 "client-summary" "$CS"
CS_REV=$(echo "$CS" | jqget "j.reviews.length")
[ "${CS_REV:-0}" -ge 1 ] && ck 0 "resumen incluye reseñas recibidas ($CS_REV)" || ck 1 "reseñas en resumen" "$CS"
CS401=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/users/$CLI_ID/client-summary")
[ "$CS401" = "401" ] && ck 0 "resumen requiere sesión (401 anónimo)" || ck 1 "401" "$CS401"

echo "— Planes de proveedor"
PL=$(curl -s -b /tmp/n8-prv.txt "$BASE/api/provider/plan")
echo "$PL" | grep -q '"pro"' && ck 0 "plan actual visible (pro demo)" || ck 1 "plan" "$PL" | head -c 150
echo "$PL" | grep -q '"basic":50' && echo "$PL" | grep -q '"pro":100' && ck 0 "precios US\$50 / US\$100 correctos" || ck 1 "precios" "$(echo "$PL" | head -c 200)"
AN=$(curl -s -b /tmp/n8-prv.txt "$BASE/api/provider/analytics?days=30")
TOP=$(echo "$AN" | jqget "j.topElementos.length")
[ "${TOP:-0}" -ge 1 ] && ck 0 "analítica PRO con elementos más pedidos ($TOP)" || ck 1 "analítica" "$(echo "$AN" | head -c 150)"
CQ=$(echo "$AN" | jqget "j.consultasRubro.total")
[ "${CQ:-0}" -ge 1 ] && ck 0 "consultas del rubro contadas ($CQ)" || ck 1 "consultas rubro" "$CQ"
TE=$(echo "$AN" | jqget "j.teEncontraron.total")
[ "${TE:-0}" -ge 1 ] && ck 0 "búsquedas que te encontraron ($TE)" || ck 1 "te encontraron" "$TE"
AN403=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-cli.txt "$BASE/api/provider/analytics")
[ "$AN403" = "403" ] && ck 0 "analítica bloqueada para no-proveedores (403)" || ck 1 "403 no-proveedor" "$AN403"

echo "— Gate de trial vencido"
node -e "
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{
  await db.providerProfile.update({where:{userId:'$PRV_USER_ID'},data:{subscription:'trial',trialEndsAt:new Date(Date.now()-86400000)}});
  await db.\$disconnect();
})()" && ck 0 "proveedor puesto en trial vencido (para test)" || ck 1 "set trial" ""
GATE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-prv.txt -X POST $BASE/api/provider/stock -H 'Content-Type: application/json' -d '{"elementId":"x","price":1,"quantity":1}')
[ "$GATE" = "403" ] && ck 0 "stock bloqueado con trial vencido (403)" || ck 1 "gate stock" "$GATE"
GATE2=$(curl -s -b /tmp/n8-prv.txt -X POST $BASE/api/provider/stock -H 'Content-Type: application/json' -d '{"elementId":"x","price":1,"quantity":1}')
echo "$GATE2" | grep -q "needsPlan" && ck 0 "gate responde needsPlan para la UI" || ck 1 "needsPlan" "$GATE2" | head -c 120
GATE3=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-prv.txt "$BASE/api/provider/analytics")
[ "$GATE3" = "403" ] && ck 0 "analítica bloqueada con trial vencido (403)" || ck 1 "gate analítica" "$GATE3"
GATE4=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/n8-prv.txt "$BASE/api/provider/stock")
[ "$GATE4" = "200" ] && ck 0 "lectura de stock sigue permitida en trial vencido" || ck 1 "lectura stock" "$GATE4"
node -e "
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{
  await db.providerProfile.update({where:{userId:'$PRV_USER_ID'},data:{subscription:'pro'}});
  await db.\$disconnect();
})()" && ck 0 "plan pro restaurado" || ck 1 "restore" ""

echo "— Destacado Recomendado + sponsors"
SP=$(curl -s "$BASE/api/sponsors")
echo "$SP" | grep -q "Ferrer" && ck 0 "sponsors de la home incluyen al proveedor PRO" || ck 1 "sponsors" "$(echo "$SP" | head -c 120)"
DIR=$(curl -s "$BASE/api/directory?kind=proveedor")
FIRST=$(echo "$DIR" | jqget "j.directory[0].isPro")
[ "$FIRST" = "true" ] && ck 0 "directorio: proveedor PRO encabeza la lista" || ck 1 "pro primero" "$FIRST"
SM=$(curl -s -b /tmp/n8-cli.txt "$BASE/api/search?mode=profesional&q=cemento")
echo "$SM" | jqget "j.materials[0].providerId" > /dev/null
echo "$SM" | grep -q "Ferrer Hnos." && ck 0 "búsqueda de materiales muestra al proveedor" || ck 1 "search materiales" "$(echo "$SM" | head -c 100)"

echo "— Timeout 20s del buscador home (código)"
grep -q "20000" src/components/home/hero-search.tsx && ck 0 "auto-envío del buscador en 20 segundos" || ck 1 "timeout 20s" ""

echo
echo "════════════════════════════"
echo "N8 API: $PASS PASS · $FAIL FAIL"
[ $FAIL -eq 0 ]
