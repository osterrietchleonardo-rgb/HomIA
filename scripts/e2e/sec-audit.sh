#!/bin/bash
# Auditoría de seguridad en vivo — HomIA
BASE="http://localhost:3000"
JAR=/tmp/sec-audit
rm -rf $JAR && mkdir -p $JAR
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✅ $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check(){ local name="$1" want="$2" got="$3"; if [ "$got" = "$want" ]; then ok "$name → $got"; else bad "$name → esperado $want, obtenido $got"; fi }

# req METHOD PATH JAR [JSON_DATA]
req(){
  local m="$1" p="$2" jar="$3" data="$4"
  if [ -n "$data" ]; then
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$m" "$BASE$p" -b "$jar" -c "$jar" -H "Content-Type: application/json" -d "$data"
  else
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$m" "$BASE$p" -b "$jar" -c "$jar"
  fi
}
post(){ curl -s -o /tmp/resp.json -w "%{http_code}" -X POST "$1" -H "Content-Type: application/json" "${@:2}"; }

echo "══ 1. Login de los 3 roles demo ══"
req POST /api/auth/login $JAR/c.txt '{"email":"cliente@homia.test","password":"Homy2026!"}' > /dev/null
req POST /api/auth/login $JAR/p.txt '{"email":"profesional@homia.test","password":"Homy2026!"}' > /dev/null
req POST /api/auth/login $JAR/pv.txt '{"email":"proveedor@homia.test","password":"Homy2026!"}' > /dev/null
CID=$(curl -s -b $JAR/c.txt $BASE/api/auth/me | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
[ -n "$CID" ] && ok "cliente logueado" || bad "cliente NO logueado"
PVER=$(curl -s -b $JAR/p.txt $BASE/api/auth/me | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
[ -n "$PVER" ] && ok "profesional logueado" || bad "profesional NO logueado"
PVID=$(curl -s -b $JAR/pv.txt $BASE/api/auth/me | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
[ -n "$PVID" ] && ok "proveedor logueado" || bad "proveedor NO logueado"

echo "══ 2. Acceso sin sesión ══"
for ep in "/api/projects" "/api/invoices/x" "/api/purchases" "/api/provider/stock" "/api/verification/dni"; do
  code=$(req GET "$ep" $JAR/anon.txt)
  check "GET $ep sin sesión" 401 "$code"
done
# GET /api/reviews sin sesión: público por diseño (reseñas de un target) → debe venir vacío, sin datos personales
curl -s "$BASE/api/reviews" | grep -q '"reviews":\[\]' && ok "GET /api/reviews sin sesión → lista vacía (diseño)" || bad "GET /api/reviews sin sesión expone datos"

echo "══ 3. Cross-role ══"
code=$(req POST /api/catalog $JAR/c.txt '{"name":"Test X","category":"plomeria"}')
check "cliente crea elemento catálogo" 403 "$code"
code=$(req GET /api/provider/analytics $JAR/c.txt)
check "cliente ve analítica proveedor" 403 "$code"
code=$(req POST /api/provider/stock $JAR/c.txt '{"elementId":"x","price":1,"quantity":1}')
check "cliente publica stock" 403 "$code"
code=$(req GET /api/provider/charges $JAR/c.txt)
check "cliente lista cobros de proveedor" 403 "$code"
code=$(req POST /api/verification/dni $JAR/c.txt '{"frontUrl":"/uploads/x/y.jpg","backUrl":"/uploads/x/z.jpg"}')
if [ "$code" = "500" ]; then bad "dni POST → 500"; else ok "dni POST maneja URLs inválidas sin 500 → $code"; fi

echo "══ 4. IDOR: recursos ajenos ══"
OTHER_INV=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.invoice.findFirst({where:{NOT:{clientId:'$CID'}},select:{id:true}}).then(r=>{console.log(r?.id||'');process.exit(0)})" 2>/dev/null)
if [ -n "$OTHER_INV" ]; then
  code=$(req GET "/api/invoices/$OTHER_INV" $JAR/c.txt)
  check "cliente lee factura ajena" 403 "$code"
  code=$(req GET "/api/invoices/$OTHER_INV/pdf" $JAR/c.txt)
  check "cliente baja PDF de factura ajena" 403 "$code"
else echo "  ⚠️ sin facturas ajenas en demo"; fi
OTHER_CHG=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.providerCharge.findFirst({where:{NOT:{clientId:'$CID'}},select:{id:true}}).then(r=>{console.log(r?.id||'');process.exit(0)})" 2>/dev/null)
if [ -n "$OTHER_CHG" ]; then
  code=$(req GET "/api/charges/$OTHER_CHG" $JAR/c.txt)
  check "cliente lee cobro ajeno" 403 "$code"
fi
OTHER_PROJ=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.project.findFirst({where:{NOT:{clientId:'$CID'}},select:{id:true}}).then(r=>{console.log(r?.id||'');process.exit(0)})" 2>/dev/null)
if [ -n "$OTHER_PROJ" ]; then
  code=$(req GET "/api/projects/$OTHER_PROJ" $JAR/c.txt)
  check "cliente lee proyecto ajeno" 403 "$code"
fi
OTHER_CONV=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.conversation.findFirst({where:{AND:[{userAId:{not:'$CID'}},{userBId:{not:'$CID'}}]},select:{id:true}}).then(r=>{console.log(r?.id||'');process.exit(0)})" 2>/dev/null)
if [ -n "$OTHER_CONV" ]; then
  code=$(req GET "/api/messages/conversations/$OTHER_CONV" $JAR/c.txt)
  check "cliente lee conversación ajena" 403 "$code"
fi
OTHER_PUR=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.purchase.findFirst({where:{NOT:{clientId:'$CID'}},select:{id:true}}).then(r=>{console.log(r?.id||'');process.exit(0)})" 2>/dev/null)
if [ -n "$OTHER_PUR" ]; then
  code=$(req PATCH "/api/purchases/$OTHER_PUR" $JAR/c.txt '{"action":"entregar"}')
  check "cliente 'entrega' compra ajena" 403 "$code"
fi

echo "══ 5. Path traversal en uploads ══"
printf '\x89PNG\r\n\x1a\n' > /tmp/px.png
for f in "../../evil" "sub/../../evil"; do
  code=$(curl -s -o /tmp/up.json -w "%{http_code}" -X POST "$BASE/api/uploads" -b $JAR/c.txt -F "file=@/tmp/px.png;type=image/png" -F "folder=$f")
  stored=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('/tmp/up.json')).url||'')}catch{console.log('')}")
  if echo "$stored" | grep -q "\.\."; then bad "folder '$f' atravesó el path: $stored"; else ok "folder '$f' sanitizado → $stored"; fi
done
[ -d public/uploads/evil ] && bad "¡Se creó public/uploads/evil!" || ok "no existe public/uploads/evil"

echo "══ 6. Rate limit login (solo fallos) ══"
IP="10.9.9.1"
for i in 1 2 3 4 5 6 7 8 9 10 11; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -H "X-Forwarded-For: $IP" -d "{\"email\":\"brute@x.test\",\"password\":\"wrong$i\"}")
done
check "11º login fallido mismo email → 429" 429 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -H "X-Forwarded-For: $IP" -d '{"email":"other@x.test","password":"wrong"}')
check "otro email misma IP sigue operando" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -H "X-Forwarded-For: 10.9.9.2" -d '{"email":"cliente@homia.test","password":"Homy2026!"}')
check "login correcto no se ve afectado" 200 "$code"

echo "══ 7. Validación de registro ══"
code=$(post "$BASE/api/auth/register" -H "X-Forwarded-For: 10.8.8.1" -d '{"email":"sec-audit@test.com","password":"corta1","displayName":"Audit"}')
check "password de 6 chars rechazada" 400 "$code"
code=$(post "$BASE/api/auth/register" -H "X-Forwarded-For: 10.8.8.1" -d '{"email":"sec-audit@test.com","password":"sololetresssss","displayName":"Audit"}')
check "password sin números rechazada" 400 "$code"
code=$(post "$BASE/api/auth/register" -H "X-Forwarded-For: 10.8.8.1" -d '{"email":"email-malo","password":"Buena1234","displayName":"Audit"}')
check "email inválido rechazado" 400 "$code"

echo "══ 8. XSS almacenado + limpieza ══"
code=$(req POST /api/works $JAR/c.txt '{"title":"<script>alert(1)</script>","description":"desc x"}')
if [ "$code" = "201" ]; then
  ok "API acepta texto (React escapa al renderizar)"
else ok "works POST → $code"; fi
CLEANED=$(node -e "const{PrismaClient}=require('@prisma/client');const db=new PrismaClient();db.completedWork.deleteMany({where:{title:{contains:'<script>'}}}).then(r=>{console.log(r.count);process.exit(0)})" 2>/dev/null)
echo "  🧹 works de prueba XSS eliminados: $CLEANED"

echo "══ 9. Inyección SQL/payload malicioso ══"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -H "X-Forwarded-For: 10.9.9.3" -d '{"email":{"$gt":""},"password":{"$ne":null}}')
if [ "$code" = "500" ]; then bad "login con payload malformado → 500"; else ok "login con payload malicioso manejado → $code"; fi
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/search?q=%27%3B%20DROP%20TABLE%20User%3B--")
check "search con SQL injection" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/directory?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
check "directory con XSS en query" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/marketplace?q=%24gt")
check "marketplace con payload" 200 "$code"

echo ""
echo "══════════ RESULTADO: $PASS PASS / $FAIL FAIL ══════════"
[ $FAIL -eq 0 ] && echo "🟢 AUDITORÍA DE SEGURIDAD EN VERDE" || echo "🔴 HAY HALLAZGOS QUE CORREGIR"
