#!/bin/bash
# E2E N8 — verificación integral:
#   F1 N8.4  marketplace con ofertas + planPro
#   F2 N8.4  compra directa cliente→proveedor (solicitado)
#   F3 N8.4  proveedor acepta + entrega (emite cobro PRV)
#   F4 N3/N8 pago del cobro: efectivo acordar + confirmar
#   F5 N8.2  reseña del cliente al proveedor por compra (context=compra) + dup 409
#   F6 N8.1  resumen del perfil del cliente visible para pro y proveedor
#   F7 N8.3  plan trial/basic/pro + analítica PRO + sponsors
set -uo pipefail
BASE="http://127.0.0.1:3000"
JC="/tmp/n8-cliente.txt"; JP="/tmp/n8-pro.txt"; JV="/tmp/n8-prov.txt"; JP2="/tmp/n8-pro2.txt"
rm -f $JC $JP $JV $JP2
PASS=0; FAIL=0
chk() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }

login() { curl -s -c "$2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"Homy2026!\"}"; }

echo "== logins =="
[ "$(login cliente@homia.test $JC)" = "200" ]; chk $? "cliente"
[ "$(login profesional@homia.test $JP)" = "200" ]; chk $? "profesional"
[ "$(login proveedor@homia.test $JV)" = "200" ]; chk $? "proveedor (Ferrer, PRO)"

echo "== F1 N8.4 marketplace =="
MKT=$(curl -s -b $JC "$BASE/api/marketplace?q=tornillo")
echo "$MKT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
results=d.get('results',[])
assert results, 'sin resultados'
with_offers=[r for r in results if r['offers']]
assert with_offers, 'ningun elemento con ofertas'
r=with_offers[0]
o=r['offers'][0]
assert 'planPro' in o and 'price' in o and 'quantity' in o, o
assert 'providerRating' in o and 'providerReviews' in o, o
print('elemento:', r['name'], '| ofertas:', r['offersCount'], '| proveedor:', o['businessName'], '| planPro:', o['planPro'])"
chk $? "marketplace: resultados difusos + ofertas con precio, stock, reseñas y planPro"

STOCK_ID=$(echo "$MKT" | python3 -c "import json,sys; d=json.load(sys.stdin); print([o for r in d['results'] for o in r['offers'] if o['quantity']>0][0]['stockId'])")
PROV_ID=$(echo "$MKT" | python3 -c "import json,sys; d=json.load(sys.stdin); print([o for r in d['results'] for o in r['offers'] if o['quantity']>0][0]['providerId'])")

echo "== F2 N8.4 cliente pide el producto =="
PUR=$(curl -s -b $JC -X POST "$BASE/api/purchases" -H 'Content-Type: application/json' \
  -d "{\"stockId\":\"$STOCK_ID\",\"quantity\":2,\"note\":\"E2E N8: la necesito esta semana\"}")
echo "$PUR" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['purchase']['status']=='solicitado', d" 2>/dev/null
chk $? "compra creada en estado solicitado"
PUR_ID=$(echo "$PUR" | python3 -c "import json,sys; print(json.load(sys.stdin)['purchase']['id'])" 2>/dev/null)
PROV_USER=$(curl -s -b $JC "$BASE/api/purchases" | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=[x for x in d['purchases'] if x['id']=='$PUR_ID']
print(p[0]['provider']['userId'] if p else '')" 2>/dev/null)
[ -n "$PROV_USER" ]; chk $? "userId del proveedor obtenido ($PROV_USER)"

echo "== F3 N8.4 proveedor acepta + entrega =="
R=$(curl -s -b $JV -X PATCH "$BASE/api/purchases/$PUR_ID" -H 'Content-Type: application/json' -d '{"action":"aceptar"}')
echo "$R" | python3 -c "import json,sys; assert json.load(sys.stdin)['status']=='aceptado'" 2>/dev/null
chk $? "aceptar → aceptado"
R=$(curl -s -b $JV -X PATCH "$BASE/api/purchases/$PUR_ID" -H 'Content-Type: application/json' -d '{"action":"entregar"}')
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='entregado' and d.get('charge',{}).get('number','').startswith('PRV-'), d" 2>/dev/null
chk $? "entregar → entregado + cobro PRV emitido"
CHARGE_ID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['charge']['id'])" 2>/dev/null)

echo "== F4 pago del cobro (efectivo) =="
R=$(curl -s -b $JC -X POST "$BASE/api/charges/$CHARGE_ID" -H 'Content-Type: application/json' -d '{"method":"efectivo"}')
echo "$R" | python3 -c "import json,sys; assert json.load(sys.stdin)['status']=='acordada_efectivo'" 2>/dev/null
chk $? "cliente acuerda efectivo"
R=$(curl -s -b $JV -X PATCH "$BASE/api/charges/$CHARGE_ID" -H 'Content-Type: application/json' -d '{}')
echo "$R" | python3 -c "import json,sys; assert json.load(sys.stdin).get('status')=='pagada', json.load(sys.stdin)" 2>/dev/null
chk $? "proveedor confirma cobro → pagada"

echo "== F5 N8.2 reseña por compra =="
R=$(curl -s -b $JC -X POST "$BASE/api/reviews" -H 'Content-Type: application/json' \
  -d "{\"context\":\"compra\",\"purchaseId\":\"$PUR_ID\",\"targetUserId\":\"$PROV_USER\",\"rating\":5,\"comment\":\"E2E: entrega impecable, vino todo en tiempo y forma.\",\"photos\":[]}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['review']['context']=='compra'" 2>/dev/null
chk $? "reseña de compra publicada"
CODE=$(curl -s -b $JC -o /dev/null -w "%{http_code}" -X POST "$BASE/api/reviews" -H 'Content-Type: application/json' \
  -d "{\"context\":\"compra\",\"purchaseId\":\"$PUR_ID\",\"targetUserId\":\"$PROV_USER\",\"rating\":4,\"comment\":\"dup\",\"photos\":[]}")
[ "$CODE" = "409" ]; chk $? "duplicada → 409 (got $CODE)"
CODE=$(curl -s -b $JC -o /dev/null -w "%{http_code}" -X POST "$BASE/api/reviews" -H 'Content-Type: application/json' \
  -d "{\"context\":\"compra\",\"purchaseId\":\"$PUR_ID\",\"targetUserId\":\"$PROV_USER\",\"rating\":4,\"comment\":\"x\",\"photos\":[]}")
true

echo "== F6 N8.1 resumen del cliente (pro y proveedor lo ven) =="
CLIENT_ID=$(curl -s -b $JC "$BASE/api/auth/me" | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)
[ -n "$CLIENT_ID" ]; chk $? "id del cliente obtenido ($CLIENT_ID)"
for J in "$JP" "$JV"; do
  R=$(curl -s -b $J "$BASE/api/users/$CLIENT_ID/client-summary")
  echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['client']['id']=='$CLIENT_ID'
assert isinstance(d['stats']['comprasRealizadas'], int)
assert isinstance(d['reviews'], list)
" 2>/dev/null
  chk $? "$( [ "$J" = "$JP" ] && echo 'profesional' || echo 'proveedor' ) ve resumen con stats + reseñas"
done

echo "== F7 N8.3 planes y analítica =="
R=$(curl -s -b $JV "$BASE/api/provider/analytics?days=30")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('plan',{}).get('plan')=='pro' or d.get('plan')=='pro', d" 2>/dev/null
chk $? "proveedor PRO accede a analítica (plan activo)"
R=$(curl -s "$BASE/api/sponsors")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert len(d['sponsors'])>=1; print('sponsors:', [s['businessName'] for s in d['sponsors']])" 2>/dev/null
chk $? "home expone sponsors PRO con marca"
DIR=$(curl -s "$BASE/api/directory?kind=proveedor")
echo "$DIR" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('directory',[])
assert items, 'sin items'
pros=[i for i in items if i.get('isPro')]
first=items[0]
assert (first.get('isPro')==True) or not pros, 'un PRO no va primero habiendo PROs'
" 2>/dev/null
chk $? "directorio: PROs primero (tarjeta Recomendado)"

echo "== limpieza de datos E2E =="
PUR_ID="$PUR_ID" node scripts/n8-purga.mjs && chk $? "purga completa (reseña, cobro, compra, stock)"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
