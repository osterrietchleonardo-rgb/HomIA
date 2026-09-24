#!/bin/bash
# E2E N7.1.2 — Alta de elemento faltante con IA + anti-duplicado difuso
set -uo pipefail
BASE="http://127.0.0.1:3000"
JAR="/tmp/homy-e2e-n712.txt"
rm -f "$JAR"
PASS=0; FAIL=0
chk() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $2"; else FAIL=$((FAIL+1)); echo "  ✗ $2"; fi }

echo "== F0 login proveedor =="
CODE=$(curl -s -c "$JAR" -o /tmp/login.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"proveedor@homia.test","password":"Homy2026!"}')
[ "$CODE" = "200" ]; chk $? "login 200 (got $CODE)"

CAT_ID=$(curl -s -b "$JAR" "$BASE/api/catalog" | python3 -c "import json,sys; d=json.load(sys.stdin); print([c['id'] for c in d['categories'] if c['slug']=='herreria'][0])")
[ -n "$CAT_ID" ]; chk $? "categoryId herreria=$CAT_ID"

echo "== F1 alta elemento nuevo con IA =="
RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Trincheta profesional 18mm\",\"categoryId\":\"$CAT_ID\",\"unit\":\"unidad\"}")
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('existing')==False and len(d['element']['description'])>=20, d" 2>/dev/null
chk $? "crea elemento + descripción IA ($RESP" | head -c 240
NEW_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['element']['id'])" 2>/dev/null)
echo "$RESP" | head -c 300; echo ""

echo "== F2 anti-duplicado exacto =="
RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Trincheta profesional 18mm\",\"categoryId\":\"$CAT_ID\"}")
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('existing')==True and d['element']['id']=='$NEW_ID'" 2>/dev/null
chk $? "mismo nombre → existing=true"

echo "== F3 anti-duplicado difuso (mayúsculas/acentos/alias) =="
RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' \
  -d "{\"name\":\"TRINCHETA PROFESIONAL 18MM\",\"categoryId\":\"$CAT_ID\"}")
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('existing')==True" 2>/dev/null
chk $? "mayúsculas → existing=true"

RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' \
  -d "{\"name\":\"cutter profesional 18mm\",\"categoryId\":\"$CAT_ID\"}")
EX=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('existing'))" 2>/dev/null)
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); ex=d.get('existing'); assert ex in (True,False)" 2>/dev/null
chk $? "variante cutter → respuesta válida (existing=$EX)"

echo "== F4 gates de seguridad =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' -d "{\"name\":\"X y z abc\",\"categoryId\":\"$CAT_ID\"}")
[ "$CODE" = "401" ]; chk $? "sin sesión → 401 (got $CODE)"
JAR2="/tmp/homy-e2e-n712-cliente.txt"; rm -f "$JAR2"
curl -s -c "$JAR2" -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"cliente@homia.test","password":"Homy2026!"}'
CODE=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/catalog" -H 'Content-Type: application/json' -d "{\"name\":\"Trincheta cliente test\",\"categoryId\":\"$CAT_ID\"}")
[ "$CODE" = "403" ]; chk $? "cliente → 403 (got $CODE)"

echo "== F5 elemento visible en GET /api/catalog =="
curl -s "$BASE/api/catalog" | python3 -c "
import json,sys
d=json.load(sys.stdin)
found=[e for c in d['categories'] for e in c['elements'] if e['id']=='$NEW_ID']
assert found, 'no encontrado'
print('nombre:', found[0]['name']); print('desc:', found[0]['description'][:120])"
chk $? "GET devuelve el elemento con descripción"

echo ""
echo "PASS=$PASS FAIL=$FAIL"

# ── purga de datos de prueba (la demo queda limpia para producción) ──
PURGE_SCRIPT=$(cat << 'EOF'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
for (const name of ['Trincheta profesional 18mm', 'cutter profesional 18mm', 'X y z abc']) {
  const el = await db.catalogElement.findFirst({ where: { name } })
  if (el) { await db.catalogElement.delete({ where: { id: el.id } }); console.log('purgado:', name) }
}
await db.$disconnect()
EOF
)
echo "$PURGE_SCRIPT" > /home/z/my-project/scripts/n712-purga.mjs
node /home/z/my-project/scripts/n712-purga.mjs && rm /home/z/my-project/scripts/n712-purga.mjs
exit $FAIL
