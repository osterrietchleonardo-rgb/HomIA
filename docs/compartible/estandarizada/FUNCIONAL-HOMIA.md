# HomIA — Guía de uso por rol

> **Para qué sirve:** explica en lenguaje llano qué ve y qué puede hacer cada persona en HomIA
> (visitante, cliente, profesional y proveedor), paso a paso, qué pasa después de cada acción y qué
> hacer si algo sale mal. Sirve para el dueño y como base de guías de uso.
>
> Describe lo que la app **hace hoy** (versión del 24/09/2026, con carrito y pedidos, cargo de
> servicio del 1% con Mercado Pago, cobro directo a la cuenta de quien vende y el nuevo Homy). Al pie
> de cada parte hay una línea "Fuente" con la pantalla de donde sale, para quien necesite
> verificarlo.
>
> Las reglas de negocio completas están en `docs/interno/LOGICA-HOMIA.md`.

---

## Lo básico para todos

- **Cómo se entra:** la portada es `www.somoshomia.com`. Arriba están **Ingresar**, **Crear cuenta**
  y el **carrito**. En pantallas de 1280 px o más, arriba se ven solo Directorio, Materiales, Cómo
  funciona y Ayuda (el resto de las secciones de la portada está en el pie de página); en pantallas
  más chicas (celular, tablet, notebook chica) todo el menú está en el botón de tres rayitas.
- **Tu panel:** al entrar, cada rol tiene su panel con un menú.
  - En la computadora, el menú está a la izquierda.
  - En el celular, hay una barra abajo con 4 accesos fijos y un botón **Más** que abre el resto de
    las secciones, además de "Ir a la home" y "Cerrar sesión".
- **Campana (arriba):** tus avisos. Tocar un aviso te lleva a lo que pasó. Se actualiza sola cada
  15 segundos.
- **Avisos por mail** *(D18, 24/09/2026)*: además de la campana, HomIA te manda un mail con lo más
  importante, con un botón que te lleva directo a esa pantalla. Todos los mails tienen el diseño de
  la marca: logo de HomIA con la mascota sobre azul marino, la franja naranja, dorada y celeste, el
  botón naranja y al pie los links a Ayuda, Términos y Privacidad y quién está detrás de HomIA. Todo
  en español y se leen bien en el celu:
  - **Proveedor:** te compraron o te reservaron; te pagaron por Mercado Pago (una venta o un cobro);
    un profesional te pide devolver materiales.
  - **Profesional:** te contrataron o te aceptaron un presupuesto; te pagaron una factura por
    Mercado Pago; un cliente te pide devolver sobrantes.
  - **Cliente:** llegó una oferta nueva a tu trabajo; te emitieron una factura; tu reserva fue
    aprobada o ya está para retirar.
  - Los **mensajes del chat no llegan por mail** (serían demasiados).
  - **Cómo apagarlos:** en **Mi perfil**, tarjeta **Avisos por mail** → interruptor **"Recibir
    avisos por mail"**. Los avisos de la campana siguen igual. El mail para crear una nueva
    contraseña llega siempre.
  - Hoy los mails salen solo cuando está configurado el servicio de envío (Resend, ver
    `decisiones.md` D18).
- **Mensajes:** chat uno a uno, estilo WhatsApp. La bandeja se actualiza sola.
- **Si tu cuenta tiene más de un perfil** (por ejemplo, profesional y también cliente), arriba
  aparece **"Perfil: …"** para cambiar de panel.
- **Homy y ayuda (botón flotante abajo a la derecha, dentro del panel):** es un solo botón con dos
  pestañas: **Homy** (el asistente con inteligencia artificial: 60 consultas por día con cuenta) y
  **Guías y tour** (recorrido guiado, "¿Cómo hago?" paso a paso, "Me trabé" y videos). En el
  celular, el final de cada pantalla deja espacio para que el botón no tape el último contenido.
  También está la página **Ayuda**.
- **Carrito:** clientes y profesionales tienen el ícono del carrito arriba en su panel.
- **Etiqueta de identidad:** junto a cada nombre se ve siempre si la persona está **verificada**
  (validó su DNI), **en revisión** o **no verificada**.
- **Si no hay conexión:** la app avisa "No pudimos conectar. Reintentá en unos segundos". Nunca
  muestra datos inventados.
- **Si algo se rompe** (un error inesperado de la pantalla), en vez de la pantalla técnica de
  Next.js aparece **"Algo salió mal"** con dos botones: **Reintentar** (vuelve a cargar esa parte) e
  **Ir al inicio**. No se muestran detalles técnicos. *(24/09/2026.)*
- **Compartir el link de HomIA** por WhatsApp o redes muestra una imagen de vista previa: fondo azul
  oscuro, "HomIA", "Tu hogar en buenas manos" y "Profesionales verificados, materiales y pagos en un
  solo lugar". *(24/09/2026.)*
- **Eliminar mi cuenta** (los tres roles, al final de **Mi perfil**) *(D19, 24/09/2026)*:
  1. Tocás **Eliminar mi cuenta**. Se abre una ventana que explica **qué se borra** (nombre, email,
     teléfono, dirección, foto, ubicación, cumpleaños, fotos del DNI, carrito, favoritos,
     conversaciones con Homy, notificaciones; tu perfil deja de aparecer en directorio, búsquedas y
     marketplace y, si sos proveedor, se quita tu stock publicado) y **qué se conserva sin tu
     nombre** (facturas, pagos y pedidos cerrados, por obligación legal; reseñas y mensajes que
     intercambiaste, que pasan a figurar como "Usuario eliminado").
  2. Escribís **ELIMINAR** y tu **contraseña**, y tocás **Eliminar definitivamente**.
  3. Si tenés algo abierto (proyectos activos, facturas o cobros sin pagar, pedidos sin cerrar,
     devoluciones en curso o, si sos proveedor, la suscripción de Mercado Pago activa), **no se
     elimina**: la ventana te lista qué tenés que cerrar, con un **"Ir a verlo"** en cada cosa.
  4. Si no, la cuenta se elimina al instante, se cierra la sesión y te lleva al inicio. **No se
     puede deshacer** y con ese email y contraseña ya no se puede entrar.
- **Qué se ve en lo público:** en el directorio, el buscador, el mapa, los materiales, la cinta de
  sponsors, los perfiles, la bolsa de trabajos y las respuestas de Homy **nunca aparecen cuentas
  eliminadas**. Además, desde el lanzamiento se van a ocultar las **cuentas de demostración** (las de
  prueba que hoy llenan la app), para que el primer cliente real no vea profesionales, proveedores,
  trabajos ni reseñas de mentira. Las cuentas demo siguen pudiendo entrar a su panel para probar.
  *(D20, 24/09/2026.)*

*Fuente: `src/components/screens/panel/panel-layout.tsx`, `src/components/help/help-dock.tsx`, `src/components/app/delete-account-card.tsx`, `src/app/error.tsx`, `src/app/opengraph-image.tsx`.*

---

- **Botón de Homy y ventanas:** cuando se abre una ventana encima (contratar, un diálogo, un panel
  lateral), el botón flotante de Homy se oculta para no tapar los botones de esa ventana, y vuelve al
  cerrarla.

- **Categorías nuevas (25/09/2026):** "Electrodomésticos · Repuestos" y "Control de plagas", con su
  pestaña en Materiales y en el buscador, y como oficios para profesionales (técnico en
  electrodomésticos, fumigador).
- **Fotos (en toda la app):** podés subir fotos de cualquier tamaño y peso, también las de la
  cámara del celu: HomIA las achica solas antes de subirlas, sin que se note. Si algo falla, te dice
  exactamente qué pasó (sin conexión, sesión vencida, formato que tu navegador no puede abrir —como
  HEIC del iPhone en una computadora— o imagen dañada) y qué hacer.

## 1. Visitante (sin cuenta)

### 1.1 Portada (home)

**Qué muestra, de arriba hacia abajo:**

1. **Buscador principal:** escribís qué necesitás (por ejemplo "Necesito un plomero urgente") y
   tocás Enter o el botón.
2. **Cómo funciona:** tres pasos.
3. **Motor IA** y **Beneficios.**
4. **Comunidad:** una tarjeta por rol.
   - Cliente: "Buscar un servicio".
   - Profesional: "Quiero recibir licitaciones".
   - Proveedor: "Quiero vender en HomIA".
5. **Cinta de sponsors:** una banda azul oscuro de punta a punta con el logo y el nombre de cada
   proveedor con plan PRO, en tono suave. Pasa sola, **cada proveedor aparece una sola vez por
   vuelta** (nunca se ve el mismo dos veces a la vez) y se frena si le pasás el mouse por encima.
   Si todavía no hay ningún proveedor PRO, esta cinta no aparece.
6. **Cierre:** "Crear cuenta gratis" y "Hablar con Homy".

**El buscador y Homy, sin cuenta:**

- El buscador de la portada y la burbuja de Homy (abajo a la derecha) **responden con inteligencia
  artificial también sin cuenta**, con un límite de **8 consultas por día** (compartidas entre los
  dos). Cuando te quedan 3 o menos, aparece "Te quedan N consultas hoy".
- Homy te muestra cómo va buscando ("pasos"), escribe la respuesta y agrega **tarjetas** con datos
  reales: profesionales, proveedores con precio y stock, materiales y trabajos. En las tarjetas de
  materiales hay **Agregar al carrito**.
- Si llegás al límite: "Llegaste al límite de consultas de hoy sin cuenta: creá tu cuenta gratis y
  seguimos." Con cuenta el límite es de 60 por día.
- Si la inteligencia artificial no responde, Homy igual te muestra resultados reales de una
  búsqueda directa y lo dice. Nunca inventa precios, nombres ni datos.

*Fuente: `src/components/home/hero-search.tsx`, `src/components/home/homy-widget.tsx`,
`src/app/api/homy/agent/route.ts`.*

### 1.2 Buscador con mapa ("Buscar")

**Qué hace:**

- Al entrar, te pide permiso para usar tu ubicación, una sola vez.
- Tiene dos modos:
  - **"Busco un pro":** muestra profesionales, materiales y trabajos.
  - **"Trabajo y materiales":** muestra materiales en proveedores y trabajos publicados.
- Podés filtrar por rubro (Plomería, Gas, Electricidad, etc.).
- Con la barra **Radio** elegís la distancia, de 1 a 100 km. Solo filtra si compartiste tu
  ubicación.

**El mapa:**

- Muestra puntos de colores: azul para profesionales, naranja para trabajos, celeste para
  materiales (con precio) y tu posición.
- Se puede ocultar con **"Ocultar mapa"**.

**Materiales en la lista (desde el 24/09/2026):**

- Cada tarjeta de material tiene sus botones: **Agregar al carrito** (si el proveedor tiene stock:
  es una compra directa) y **Reservar** (con o sin stock). Si no hay stock, dice "Sin stock: podés
  reservarlo y el proveedor te avisa" y solo aparece **Reservar**.
- Al tocar un botón aparece el aviso "Agregado al carrito · Ver carrito" y **seguís en la
  búsqueda**: ya no te lleva al perfil del proveedor. El nombre del proveedor sigue siendo un link a
  su perfil.
- Sin cuenta también se puede agregar (el carrito queda en tu celular o computadora). Una cuenta
  que es solo de proveedor no ve estos botones (el proveedor vende, no compra).

**Sin cuenta:**

- Ves las tarjetas, pero para abrir un profesional, un trabajo o el perfil de un proveedor aparece
  "Registrate para ver esta tarjeta".
- **"Preguntale a Homy"** responde con inteligencia artificial, con el mismo límite de consultas
  que en la portada (ver 1.1).

*Fuente: `src/components/screens/search-screen.tsx`.*

### 1.3 Directorio

**Qué muestra:** todos los profesionales y los proveedores activos.

**Pestañas:** Todos, Profesionales o Proveedores.

**Filtros:**

- **Rubro.**
- **Ordenar:**
  - "Más reseñas positivas" (es el orden de entrada).
  - "Mejor puntuación".
  - "Más experiencia".
  - "Más recientes".
- **Puntaje mínimo:** 3, 4 o 4,5 estrellas. Ojo: al elegirlo, se ocultan quienes todavía no tienen
  reseñas.
- **Precio promedio:** solo aparece en las pestañas Profesionales o Proveedores.

**Proveedores Recomendados:** los que tienen plan PRO aparecen **siempre primero**, con la etiqueta
dorada **"★ Recomendado"**.

**Qué muestra cada tarjeta:**

- Nombre, etiqueta de verificación, ciudad, estrellas y cantidad de reseñas.
- Si es un profesional: sus oficios, cuántas obras publicó, sus años de experiencia y el promedio
  de sus presupuestos.
- Si es un proveedor: cuántos materiales tiene publicados y su precio promedio.

**Sin cuenta:**

- Ves la lista completa.
- Al tocar una tarjeta aparece el aviso "Ingresá para ver este profesional" (o "este proveedor").
- **Contratar** y el corazón de favoritos te piden registrarte.

*Fuente: `src/components/screens/directory-screen.tsx`.*

### 1.4 Materiales

**Qué muestra:** catálogo de materiales con el precio y el stock de cada proveedor.

**Filtros:** búsqueda por nombre, marca o proveedor, rubro del negocio, categoría y distancia (esta
última solo si compartiste tu ubicación).

**Cada material:**

- Muestra "N proveedores con stock", el precio "desde $X" y la etiqueta **"★ Recomendado"** si lo
  vende un proveedor PRO.
- Se ven 3 ofertas y un botón **"Ver N ofertas más"**.
- También aparecen los proveedores que publican el material **sin stock** (al final): dicen
  "Sin stock: podés reservarlo y el proveedor te avisa" y solo tienen el botón **Reservar**.
- Con stock hay dos botones: **Agregar al carrito** (compra directa, sin aprobación) y **Reservar**
  (le pedís al proveedor que te lo guarde; lo tiene que aprobar).

**Sin cuenta:** podés armar el carrito (ver abajo); para confirmar el pedido hay que crear la
cuenta.

**El carrito, también sin cuenta:**

- En cada oferta hay un botón **Agregar al carrito** (y **Reservar**). Arriba, en el menú, está el
  ícono del **carrito** con la cantidad de productos.
- Podés sumar productos de **varios proveedores**. Sin cuenta, el carrito se guarda en tu
  celular o computadora.
- Al tocar **Confirmar pedido** te pide crear tu cuenta o ingresar ("**Tu carrito se guarda** y lo
  encontrás al entrar"). Después de crear la cuenta o ingresar, volvés al carrito con todo lo que
  habías cargado.

*Fuente: `src/components/screens/marketplace-screen.tsx`, `src/components/cart/*`, `src/lib/cart.ts`.*
*Fuente: `src/components/screens/marketplace-screen.tsx`.*

### 1.5 Perfiles de profesionales y proveedores

En el perfil de un proveedor, los productos **sin stock** muestran el botón **Reservar** y la leyenda
"Sin stock: podés reservarlo y el proveedor te avisa"; los que tienen stock, **Al carrito**.

- **Sin cuenta:** no se ven. Aparece "Ingresá para ver este profesional", con los botones
  "Crear cuenta gratis" y "Ya tengo cuenta".
- **Con cuenta:** ver los puntos 3.15 (profesional) y 4.12 (proveedor).
- **Atajo a las reseñas (los dos perfiles):** debajo del nombre hay un botón **"★ 4,5 · 12 reseñas"**.
  Al tocarlo, la página baja suave hasta la sección **Reseñas** (y el foco queda ahí, para quien usa
  teclado o lector de pantalla). Si todavía no tiene reseñas dice **"Sin reseñas todavía"** y no es
  un botón. *(Agregado el 24/09/2026.)*

*Fuente: `src/components/app/profile-gate.tsx`, `src/components/app/reviews-shortcut.tsx`.*

### 1.6 Detalle de un trabajo publicado

- Cualquiera lo puede ver: título, rubro, urgencia, presupuesto orientativo, descripción y fotos.
- Sin cuenta **no** se ve la dirección exacta, y la ubicación es aproximada.
- Para dejar un presupuesto hay que registrarse como profesional.

*Fuente: `src/components/screens/job-detail.tsx`.*

### 1.7 Crear cuenta e ingresar

**Crear cuenta, en 4 pasos** *(D26, 25/09/2026: datos obligatorios, estandarizados y email confirmado con un código)*:

1. **Cómo vas a usar HomIA:** "Soy cliente", "Soy profesional" o "Soy proveedor".
2. **Tus datos** (todos obligatorios, iguales para los tres roles):
   - **Nombre** y **Apellido** (por separado). Al salir del campo se acomodan las mayúsculas:
     "juan PÉREZ" queda "Juan Pérez"; "de la" queda en minúscula.
   - **Email.** Se guarda en minúsculas y sin espacios. Si el dominio parece mal escrito
     ("gmial.com", "hotmial.com", "gmail.con", "gmail.com.ar") aparece **"¿Quisiste decir
     juan@gmail.com?"** con el botón **Sí, usar ese**; no se corrige solo (un dominio raro puede ser
     el de tu empresa).
   - **Celular**, como lo escribas: "011 15 2345-6789", "11 2345 6789", "+54 9 11…", con o sin 0 y
     15. Debajo muestra **cómo quedó**: "Se va a guardar como +54 9 11 2345-6789". Si no es un
     celular argentino válido lo dice claro (por ejemplo "Al celular le faltan números: poné el
     código de área…").
   - **Repetí el celular:** se escribe otra vez (no se puede pegar) y avisa "Coinciden" o "Todavía
     no coinciden". Así se evita un número mal tipeado que nadie puede usar después.
   - **Contraseña** (mínimo 8 caracteres, con letras y números; el ojito la muestra u oculta).
   - **Ciudad o localidad** (ej.: "Palermo, CABA").
   - Opcionales: "¿Cómo nos encontraste?" y compartir ubicación.
   - Cada error aparece **debajo de su campo** en rojo, y el cursor va al primero que falta.
   - El botón dice **Continuar y confirmar mi email**.
3. **Confirmar email:** llega un mail de HomIA con asunto "123456 es tu código de HomIA" y el
   código grande. Se escriben los 6 números (en el celu, el teclado numérico y el autocompletado
   del código funcionan) y se confirma solo al completar el sexto.
   - El código **vence en 10 minutos**, sirve **una vez** y tiene **5 intentos**. Si fallás, dice
     "El código no es correcto… (te quedan 4 intentos)". Si venció o se agotaron los intentos, lo
     dice y ofrece pedir uno nuevo.
   - **"¿No te llegó? Podés pedir otro en 0:59"**: cuenta regresiva de 60 segundos y después el botón
     **Mandarme un código nuevo** (hasta 5 códigos por hora para el mismo email).
   - "Cambiar email" vuelve al paso 2 sin perder nada.
   - **Celular:** hoy HomIA **no manda códigos por SMS ni WhatsApp** (no hay proveedor contratado).
     Por eso el celular no pide código: queda **"sin verificar"**, confirmado solo por haberlo
     escrito dos veces. Cuando se active un proveedor, este paso pedirá también el código del
     celular.
4. **Tu cuenta** (lo del rol):
   - Arriba recuerda "Email confirmado: …" y "Celular +54 9 …: queda sin verificar por ahora".
   - **Profesional:** **rubros en los que trabajás** (al menos uno) y **zona de trabajo** ("Trabajás
     en Palermo, CABA y hasta 15 km a la redonda", con la barra de 1 a 100 km). Lo demás es opcional
     y está plegado en "Más datos de tu trabajo": persona o empresa, DNI o CUIL (se revisa el dígito
     verificador del CUIL), razón social y CUIT de la empresa, web, empleados, habilidades,
     experiencia y "Sobre vos".
   - **Proveedor:** **nombre del comercio**, **tipo de comercio** (corralón, ferretería,
     pinturería… 18 tipos) y **dirección del local** (calle y número: es donde retiran lo que
     compran). El aviso "14 días gratis para probar. Después: Básico $50.000/mes o PRO $100.000/mes".
     Opcional y plegado: **CUIT** (con dígito verificador; queda "30-12345678-9") y "Sobre el
     comercio".
   - **Cliente:** nada más que lo de todos.
   - **Todos:** "Verificá tu identidad con tu DNI" (opcional, plegado): frente y dorso; si una foto
     no se puede subir, el aviso dice exactamente por qué (pesada, HEIC, sin conexión…) y se puede
     hacer después desde el perfil.
   - **Al final, la casilla obligatoria** "Acepto los Términos y Condiciones y la Política de
     Privacidad de HomIA". Los dos nombres son links que abren las páginas en **otra pestaña**, así
     no se pierde lo que cargaste. Sin tildarla, el botón **Crear mi cuenta** queda apagado. HomIA
     guarda cuándo aceptaste y qué versión de los textos. *(D19, 24/09/2026.)*
   - Si pasan más de 30 minutos entre el código y **Crear mi cuenta**, la confirmación vence: la
     pantalla vuelve a "Tus datos" y pide un código nuevo.

**Cosas a saber:**

- La cuenta se crea **recién al final**, con el email ya confirmado: nunca queda una cuenta a medias
  ni una cuenta con un email mal escrito.
- **Si el email ya tiene cuenta**, la pantalla se comporta igual (dice que mandó el código), pero a
  ese email le llega "Ya tenés una cuenta en HomIA" con el botón **Ingresar** y cómo recuperar la
  contraseña. Así nadie puede averiguar qué emails están registrados.
- Toda cuenta queda también como **cliente**: un profesional o un proveedor puede contratar y
  comprar con la misma cuenta.
- No se puede ser profesional y proveedor con la misma cuenta.
- Hoy **no hay forma de sumar un perfil después**.
- Al terminar te lleva a tu panel, o de vuelta a donde estabas (por ejemplo, al carrito que armaste
  sin cuenta).
- **Cuentas creadas antes del 25/09/2026:** siguen funcionando igual; en **Mi perfil → Email y
  celular** ven su email "Sin verificar" y lo pueden verificar con un código cuando quieran (ver
  2.12).

**Ingresar:** email y contraseña.

- Después de 10 intentos fallidos seguidos hay que esperar unos minutos.

**¿Olvidaste tu contraseña?** *(D18, 24/09/2026)* — sirve igual para los tres roles:

1. En **Ingresar**, debajo de la contraseña, tocás **"¿Olvidaste tu contraseña?"**. Si ya habías
   escrito tu email, pasa solo a la pantalla siguiente.
2. En **Recuperar contraseña** escribís el email de tu cuenta y tocás **Mandarme el link**. La
   pantalla siempre dice lo mismo: "Si ese email tiene una cuenta, te mandamos un link para crear
   una nueva contraseña" (así nadie puede averiguar qué emails están registrados). Te recuerda
   mirar spam o promociones. **Mientras HomIA no tenga el servicio de mails activado**, en vez de
   eso dice "Todavía no podemos mandar mails para recuperar la contraseña. Probá de nuevo más
   tarde." (igual para cualquier email): no promete un mail que no va a llegar.
3. Te llega un mail de HomIA con el botón **Crear nueva contraseña**. El link **vence en 1 hora** y
   **sirve una sola vez**. Se pueden pedir hasta 3 links por hora.
4. El link abre **Nueva contraseña**: la escribís dos veces (mínimo 8 caracteres, con letras y
   números; el ojito la muestra u oculta) y tocás **Guardar la nueva contraseña**.
5. Listo: "Tu contraseña se cambió". **No entra solo**: tocás **Ir a ingresar** y entrás con la
   nueva. La vieja deja de funcionar. Tus datos, proyectos y pedidos quedan como estaban.

Si el link venció o ya se usó, la pantalla lo dice claro ("El link venció: pedí uno nuevo" / "Este
link ya se usó…") con el botón **Pedir un link nuevo**. Si pediste varios links, al usar uno los
demás dejan de servir.

> **Importante (hoy):** el mail sale solo cuando está configurado el servicio de envío (Resend,
> ver `decisiones.md` D18). Sin eso, la pantalla responde igual pero **no llega ningún mail**.

*Fuente: `src/components/screens/auth-register.tsx`, `auth-login.tsx`, `auth-recuperar.tsx`,
`auth-restablecer.tsx`, `src/components/app/verificacion-contacto-card.tsx` (D26).*

### 1.8 Ayuda

- **Página Ayuda:**
  - Guías por rol.
  - Tabla "qué hago / dónde".
  - 11 preguntas frecuentes.
  - Videos. El visitante también los puede ver.
- **Recorrido guiado:** requiere cuenta y no arranca solo. Se inicia desde el botón **?**, la
  página de Ayuda o la tarjeta "Tus primeros pasos".

- **Temas directos desde el pie de página:** "Pagos con Mercado Pago o efectivo", "Verificación de
  identidad por IA" y "Reseñas con fotos" abren la Ayuda con esa pregunta ya desplegada y a la vista
  (no el principio de la página).

*Fuente: `src/components/screens/help-screen.tsx`, `src/components/help/*`.*

### 1.9 Términos y Condiciones y Política de Privacidad

Desde el pie de página de cualquier pantalla pública (y desde la casilla de aceptación del registro).
Pensadas para leerse en el celu:

- Arriba, un cambio rápido entre **Términos** y **Privacidad**, la fecha de vigencia y
  "Imprimir o guardar en PDF".
- **"En pocas palabras":** lo más importante en 6-7 puntos, con la aclaración de que vale el texto
  completo.
- **Índice:** desplegable en el celu, fijo al costado en la computadora; tocar un título lleva a esa
  sección.
- **Tablas claras** (plazos de compras y reservas, quién paga qué, planes, qué datos guardamos, quién
  ve cada dato, con qué empresas se comparten y dónde, cookies, cuánto tiempo se guarda cada cosa). En
  el celu cada fila se ve como tarjeta.
- Todo lo que dicen (1% solo con Mercado Pago, 24 h / 7 días / 48 h, 30 días de sobrantes, planes
  $50.000 y $100.000, 14 días de prueba, 3 intentos de DNI por día, 8 y 60 consultas de Homy) es lo
  mismo que aplica el sistema.
- **Contacto:** "HomIA es un servicio de Leonardo Osterrietch, CUIT 20-39833562-8" y el email
  business@vakdor.com para consultas, reclamos y derechos sobre los datos. Sin domicilio.
- Es la versión vigente. No la revisa un abogado: lo decidió Leonardo el 25/09/2026 (D22).

*Fuente: `src/lib/legal-content.ts`, `src/components/screens/legal-screen.tsx`.*

---

## 2. Cliente

### Menú del cliente

| Sección | En el celular | Para qué |
|---|---|---|
| **Inicio** | Barra de abajo | Resumen y primeros pasos |
| **Mis trabajos** ("Trabajos") | Barra de abajo | Tus publicaciones y los presupuestos que te mandaron |
| **Proyectos** | Barra de abajo | Obras en curso con un profesional |
| **Mensajes** | Barra de abajo | Chats |
| **Publicar trabajo** | Más | Pedir presupuestos |
| **Materiales** | Más | Buscar materiales y agregarlos al carrito |
| **Mis pedidos** | Más | Seguir y pagar los pedidos de materiales |
| **Facturas** | Más | Lo que tenés que pagar y lo pagado |
| **Directorio** | Más | Buscar profesionales y proveedores |
| **Verificación** | Más | Validar tu DNI |
| **Mi perfil** | Más | Tus datos y ubicación |
| **Sugerencias** | Más | Mandar ideas, quejas, mejoras o problemas con fotos, y ver la respuesta (ver "Sugerencias" abajo) |
| **Ayuda** | Más | Guías |

*Fuente: `src/components/screens/panel/panel-layout.tsx:43-55`.*

### 2.1 Inicio

**Qué muestra:**

- **"Tus primeros pasos en HomIA"**, cuatro tareas que se tildan solas:
  1. Verificá tu identidad.
  2. Publicá tu primer trabajo.
  3. Escribí por chat a un profesional.
  4. Dejá tu reseña de la obra.
- **Cuatro cifras:** trabajos abiertos, presupuestos a revisar, proyectos activos y proyectos
  finalizados.
- **Tus publicaciones** y **tus proyectos:** los últimos 5 de cada uno.

*Fuente: `src/components/screens/panel/cliente/dashboard.tsx`.*

### 2.2 Publicar un trabajo

1. Tocá **Publicar trabajo**.
2. Completá **título**, **descripción** y **rubro** (los tres son obligatorios).
3. Elegí la **urgencia**: Tranquilo, Normal, Urgente o Muy urgente.
4. Si querés, poné un **presupuesto orientativo** mínimo y máximo.
5. Poné **dónde** (dirección y ciudad) y hasta **4 fotos** del problema.
6. Tocá **Publicar trabajo**.

**Qué pasa después:**

- Ves "¡Trabajo publicado!".
- A los profesionales de ese rubro les llega el aviso "Nuevo trabajo en tu rubro".
- Los presupuestos te llegan por la campana y los ves en **Mis trabajos**.

*Fuente: `cliente/publicar.tsx`.*

### 2.3 Mis trabajos: ver presupuestos y elegir uno

- Cada publicación muestra su estado: **abierto**, **en proyecto**, **cerrado** o **cancelado**.
  También muestra la cantidad de presupuestos que recibió.
- **Cada presupuesto** trae:
  - El profesional, con su verificación, estrellas y obras.
  - Su mensaje, el monto y el plazo en días.
- **Aceptar:**
  - Se crea el proyecto con ese profesional y te lleva directo al proyecto.
  - Los demás presupuestos quedan rechazados y a cada profesional le avisamos.
- **Rechazar:** le avisamos al profesional.
- **Cerrar** una publicación abierta: deja de recibir presupuestos. La podés **reabrir** solo si
  nunca aceptaste un presupuesto.

Para chatear con quien te ofertó, tocá su nombre, entrá a su perfil y usá **Contactar**. En la
tarjeta del presupuesto no hay botón de chat.

*Fuente: `cliente/trabajos.tsx`; reglas en `LOGICA-HOMIA.md` §2.*

### 2.4 Contratar directo con el asistente paso a paso

Desde el **Directorio** o el perfil de un profesional, tocá **Contratar**.

0. **¿Es para algo que ya publicaste?** (arriba del primer paso; aparece solo si tenés trabajos
   publicados abiertos). Por defecto dice **"No, lo escribo ahora"** y el asistente queda igual que
   siempre. Si elegís uno de tus trabajos (se ve título, rubro, fecha y cuántas ofertas tiene):
   - Se cargan sus datos: título, detalles, rubro, fotos (hasta 4), urgencia, dirección, localidad
     y presupuesto. **Todo se puede cambiar.**
   - Aparece el chip **"Basado en: <título>"**; con la **X** lo quitás y el formulario vuelve a
     quedar vacío.
   - Te avisamos qué va a pasar al confirmar (ver abajo).
1. **Qué necesitás:** título, detalles, rubro y hasta 4 fotos del lugar.
2. **Cuándo y dónde:**
   - Urgencia: "Lo antes posible", "Próximas semanas" o "Fecha flexible".
   - Fecha deseada, localidad y dirección.
3. **Presupuesto:** un rango estimado, opcional. Es solo una referencia. Podés dejarle un
   **mensaje al profesional**; si lo escribís, se abre el chat con ese mensaje.
4. **Confirmar:** revisás el resumen y tocás **Confirmar contratación**.

**Qué pasa después:**

- El profesional recibe "Te contrataron: cotizá la mano de obra para arrancar".
- El proyecto aparece en **Proyectos**, en la etapa **Presupuesto**, esperando que el profesional
  ponga el precio de su trabajo.
- Si no dejaste mensaje, conviene abrir el chat: **el profesional no puede escribirte primero**.

**Si elegiste un trabajo publicado:**

- Tu trabajo pasa a **En proceso** y deja de recibir presupuestos (sale de la bolsa).
- Si ese profesional ya te había mandado un presupuesto por ese trabajo, **se acepta su oferta**:
  el proyecto arranca con ese precio de mano de obra y a él le llega "¡Te contrataron por tu
  oferta!". Si no había ofertado, cotiza la mano de obra como siempre.
- Los demás presupuestos pendientes quedan **rechazados** y a cada profesional le avisamos: "El
  cliente contrató a otro profesional para este trabajo".
- Si mientras tanto el trabajo dejó de estar abierto (por ejemplo, lo cerraste o aceptaste otra
  oferta), la app te lo dice y no crea nada.

*Fuente: `src/components/app/hire-wizard.tsx`; reglas en `LOGICA-HOMIA.md` §2 y §3.1 (D16).*

### 2.5 Seguir un proyecto

**Etapas:** Presupuesto → Materiales → Ejecución → Revisión → Finalizado. Siempre avanzan, nunca
vuelven atrás.

**Qué ves en el proyecto:**

- Qué pediste.
- Cuándo y dónde.
- Las etapas, con cuatro cifras: tu presupuesto estimado, la mano de obra cotizada, los materiales
  aprobados y el total.
- **¿Quién paga los materiales?** Lo elige el profesional y vos lo ves acá:
  - **Modo A — "los adelanta tu profesional":** él compra los materiales y te los cobra en su
    factura, junto con la mano de obra.
  - **Modo B — "los pagás directamente al proveedor":** cada proveedor te manda un cobro aparte y
    la factura del profesional es solo por la mano de obra.
- Contacto: **Abrir chat**, llamar o mandar un email.
- **Fechas del trabajo** *(24/09/2026; con horario desde el 25/09/2026)*: cuándo arranca, cuándo
  termina (estimado) y en qué horario. Ver abajo.

**Fechas del trabajo (inicio, fin estimado y horario):**

- Aparecen cuando el presupuesto quedó aprobado (aceptaste su oferta en la bolsa, o el proyecto ya
  pasó a Materiales). Antes, la tarjeta te explica por qué todavía no.
- **Las propone primero el profesional.** Te llega un aviso (en la app y por mail) y un mensaje en el
  chat. En la tarjeta **"Fechas del trabajo"** tenés tres botones:
  - **Aceptar fechas** → quedan **acordadas**.
  - **Proponer otras** → elegís inicio, fin estimado y el **horario de trabajo**: **Todo el día** o
    **Elegir horario** (desde / hasta, de a 15 minutos; te sugiere la jornada habitual del
    profesional), y una nota si querés. Ahora el profesional decide: las acepta, las rechaza o te
    propone otras.
  - **Rechazar** → podés contar el motivo; el proyecto queda sin fechas y el profesional propone otras.
- La tarjeta muestra el horario: **"De 07:00 a 12:00 cada día"** (si son varios días), **"De 14:00 a
  19:00"** (un día) o **"Todo el día"**. Los proyectos que ya tenían fechas antes del 25/09/2026
  quedan como "Todo el día".
- Nadie acepta su propia propuesta: siempre decide el otro.
- **Reprogramar:** con fechas acordadas, tocá **Pedir reprogramar**. Mientras el profesional decide,
  **siguen valiendo las fechas y el horario acordados** (la tarjeta muestra las dos). Si las rechaza,
  siguen las de antes (con su horario); si las acepta, pasan a ser las nuevas. El profesional también
  puede pedirte reprogramar.
- **El profesional no puede estar en dos lugares a la vez:** si el día y el horario que proponés (o
  que querés aceptar) chocan con otro trabajo que el profesional **ya tiene acordado**, HomIA no lo
  deja y te lo dice ahí mismo: *"El profesional ya tiene ese horario ocupado (el 28/09, de 07:00 a
  12:00). Elegí otro día u horario."* Nunca te dice de qué trabajo se trata. Si solo choca con otra
  propuesta que todavía no se confirmó, se puede igual (te avisamos): la que se acepte primero se
  queda con el horario.

**Materiales por aprobar:**

- El profesional te propone cada material con su cantidad, precio y proveedor.
- **Aprobar:** si el material es de un proveedor, ese stock queda reservado para tu obra.
- **Rechazar:** podés poner el motivo. El profesional puede proponerte una alternativa.
- Un material ya aprobado lo podés rechazar más tarde, siempre que todavía no esté facturado.

**Modo B — pagos a proveedores:**

- Cuando el proveedor te emite el cobro, lo ves en **"Pagos a proveedores (materiales)"**.
- Lo pagás con **Mercado Pago** o acordás **efectivo**. En el caso del efectivo, el proveedor
  confirma cuando lo recibe.

**Cancelar el proyecto:** solo en las etapas Presupuesto o Materiales, y contando el motivo.

- Le llega al profesional por aviso y, si ya hay chat, también por chat.
- Los materiales reservados vuelven al proveedor.

**Finalizar la obra:** en Ejecución o Revisión, tocá **Finalizar obra**. **Solo vos podés hacerlo.**

- Si todavía no hay factura, te avisa: "¿finalizás igual?".
- Al finalizar se habilitan las reseñas y ya no se puede deshacer.

*Fuente: `cliente/proyecto-detalle.tsx`, `src/components/app/schedule-card.tsx`; reglas en `LOGICA-HOMIA.md` §3 y §3.6.*

### 2.6 Facturas: pagar

La sección **Facturas** junta las facturas de todos tus proyectos.

**Qué muestra:**

- Arriba, el **total por pagar**.
- Por cada factura: número, proyecto, fecha, el detalle de mano de obra y materiales, el total y un
  botón **PDF** para descargarla.

**Cómo pagar:**

- **Pagar con Mercado Pago:** te lleva a Mercado Pago. Cuando volvés, la app dice "Estamos
  confirmando tu pago". La factura pasa sola a **pagada** cuando Mercado Pago avisa.
- **Efectivo:** acordás pagar en efectivo y queda "Efectivo acordado — esperando confirmación del
  profesional". Cuando el profesional confirma que cobró, la factura queda pagada. Mientras tanto
  podés **Cancelar acuerdo** y elegir Mercado Pago.

**Si algo sale mal:**

- Si el pago online no está disponible, la app muestra "El pago online no está disponible por
  ahora: podés acordar efectivo".
- Si el pago no se completó, dice "El pago no se completó. Podés intentar de nuevo…".

**El cargo de servicio (solo con Mercado Pago):**

- Al lado de cada factura por pagar ves el desglose: **Subtotal**, **Cargo de servicio HomIA (1%)**
  y **Total con Mercado Pago**, con la aclaración "En efectivo pagás $X, sin cargo". El botón dice
  **Pagar $Y con Mercado Pago**.
- La plata va directo a la cuenta de Mercado Pago **del profesional**. Si el profesional no conectó
  su Mercado Pago, ves "‹Profesional› todavía no conectó Mercado Pago: podés pagar en efectivo".
- En las facturas ya pagadas por Mercado Pago aparece "+ Cargo de servicio HomIA (1%): $X · pagaste
  $Y con Mercado Pago". El PDF también lo muestra.
- Lo mismo vale para los **cobros de materiales del proveedor** (modo B) dentro del proyecto.
*Fuente: `cliente/facturas.tsx`.*

### 2.7 Materiales: carrito y pedidos

**Pestañas de Materiales:** **Buscar materiales** y **Mis pedidos** (los profesionales tienen además
**Comparables**). "Mis pedidos" también está en el menú.

**Armar el carrito:**

1. Buscá el producto; por ejemplo, "caño". Vas a ver las ofertas de todos los proveedores (primero
   las que tienen stock; al final las que no, para reservar).
2. En la oferta que te convenga, tocá **Agregar al carrito** (para comprar) o **Reservar**. Lo que
   no tiene stock solo se puede reservar. Podés sumar productos de **varios proveedores** (hasta 60
   productos). También podés hacerlo desde la lista de materiales de **Buscar** (el mapa).
3. Abrí el **carrito** (ícono de arriba). Ahí ves todo **agrupado por proveedor**, con:
   - la cantidad de cada producto (de a 1, o de a medio en metros, kilos, litros, etc.) y el botón
     para sacarlo;
   - **Total**, **"Cargo de servicio HomIA (1%) — solo si pagás con Mercado Pago"** y **Total con
     Mercado Pago**. En efectivo pagás el total, sin cargo.
   - Si un producto no tiene stock (o pediste más de lo que hay) aparece en azul "Sin stock: podés
     reservarlo y el proveedor te avisa" o "Hay N para comprar ya: para más, reservalo". **No
     bloquea**: esa línea va como reserva.
   - Si el proveedor dejó de operar o la oferta ya no existe, aparece en rojo: sacalo para poder
     confirmar.
   - **Vaciar carrito** pide confirmación.
4. Tocá **Confirmar pedido**. Para **cada producto** elegí **Comprar** o **Reservar** (lo que no
   tiene stock ya viene como reserva, sin opción). Debajo de cada proveedor ves qué parte es:
   - **Compra directa · Pagás ahora:** no necesita aprobación del proveedor. Al confirmar, el stock
     queda reservado para vos y tenés **24 horas** para pagar con Mercado Pago o elegir efectivo al
     retirar (con efectivo, **7 días desde la compra** para retirar y pagar).
   - **Reserva · El proveedor tiene que aprobarla:** si tiene stock te lo guarda **48 horas**; si
     no tiene, te dice una fecha aproximada y te avisa cuando lo tiene.

   Si de un mismo proveedor comprás unas cosas y reservás otras, se arman **dos partes** (una compra
   y una reserva). Podés dejar una aclaración para los proveedores (cuándo pasás, marca
   preferida…).
5. Tocá **Confirmar compra**, **Enviar reserva** o **Confirmar N compras y M reservas**.
   - Si justo mientras confirmabas otro se llevó el stock de algo que compraste, te avisa cuál
     ("solo quedan N…") y **no se crea nada**: bajá la cantidad o reservalo.

**Qué pasa después:**

- Se crea tu **pedido** (número PED-2026-…). Cada proveedor recibe **su parte** por aviso y por
  chat (el chat lo iniciás vos).
- **Tus compras** quedan **Por pagar** al instante: el proveedor no tiene que aprobar nada, solo
  prepararlas.
- **Tus reservas** esperan la aprobación: con stock, el proveedor te reserva **todos** los
  productos juntos; sin stock, la aprueba con **"Disponible aproximadamente el …"** y, cuando le
  llega, la marca disponible (te llega el aviso "Tu reserva ya está para retirar" y ahí arrancan
  las 48 horas). También puede rechazarla con un motivo.

**Mis pedidos (seguimiento):**

- Cada pedido muestra algo como **"1 de 2 proveedores pagados · Falta pagar $Z"** y una barra de
  avance. Le pagás a **cada proveedor por separado**, en el orden que quieras.
- Cada parte de proveedor dice si es **Compra directa** o **Reserva** y muestra su estado:
  - **Por pagar** (compra) — con el recuadro **"Pagás ahora · compra con stock reservado"** y el
    plazo exacto: "Pagá antes del jue 25 sep, 16:05 (o elegí efectivo al retirar). Si no, la
    compra se cancela sola y el stock se libera". Con efectivo elegido: **Efectivo al retirar** y
    "Retiralo y pagalo en efectivo antes del …".
  - **Esperando aprobación** (reserva).
  - **Aprobada: esperando stock** (reserva sin stock) — "lo tendría disponible aproximadamente el
    …".
  - **Reservado: falta el pago** (reserva aprobada o disponible) — "Te lo guardan hasta el …".
  - **Pagado: falta retirar** / **Pagado.**
  - **Entregado: falta el pago** (si retiraste sin pagar).
  - **Rechazado** (con el motivo) o **Cancelado.**
- **Cómo pagar cada parte:**
  - **Pagar $X con Mercado Pago:** muestra el desglose (subtotal, cargo de servicio 1% y total).
    Solo aparece si ese proveedor conectó su Mercado Pago; si no, ves "‹Proveedor› todavía no
    conectó Mercado Pago: podés pagar en efectivo".
  - **Efectivo al retirar:** sin cargo. El proveedor confirma cuando recibe la plata.
  - Al volver de Mercado Pago, la app dice "Mercado Pago está confirmando tu pago…" y la parte pasa
    sola a **Pagado**.
- **Cancelar esta parte:** mientras no esté pagada (también una reserva que espera stock). Si el
  stock ya estaba reservado, vuelve al proveedor.
- Si el **proveedor** cancela (siempre con un motivo, por ejemplo porque no puede cumplir), te llega
  el aviso con el motivo. Si ya habías pagado por Mercado Pago, se te devuelve el pago completo;
  si pagaste en efectivo, el aviso te dice que te lo devuelve en mano.
- Si un pago de Mercado Pago llega cuando la compra ya se había cancelado (por ejemplo, pasaron
  las 24 horas), se devuelve solo y te avisamos.
- **Calificar** al proveedor cuando la parte está entregada o pagada, **Chatear** con él y, si está
  pagada, **Devolver sobrantes**.
- **Línea de tiempo:** abajo queda registrado todo lo que pasó (quién hizo qué y cuándo).
- **Si no pagás a tiempo**, esa parte se cancela sola, el stock vuelve al proveedor y te avisamos:
  compra sin pagar ni elegir efectivo → a las 24 horas; compra en efectivo sin retirar → a los 7
  días de la compra; reserva disponible sin pagar → a las 48 horas.

*Fuente: `src/components/cart/cart-contents.tsx`, `src/components/screens/panel/pedidos.tsx`,
`src/components/screens/panel/pedido-detalle.tsx`.*

### 2.8 Devolver sobrantes

Si te sobró material **pagado**, podés devolvérselo **a quien te lo cobró** dentro de los
**30 días** desde el pago (regla del 24/09/2026: "devuelve la plata quien la cobró"):

- **Compra de materiales** o proyecto donde **le pagaste los materiales al proveedor** (cobro del
  proveedor): la devolución es con **el proveedor**.
- Proyecto donde **tu profesional adelantó los materiales y te los cobró en su factura**: la
  devolución es con **tu profesional**. En la sección Sobrantes del proyecto lo ves escrito: "Los
  materiales te los vendió <profesional> en su factura: la devolución es con él".

Se hace desde el proyecto (sección **Sobrantes**) o desde la compra, con el botón **Devolver
sobrantes**.

1. Por cada material indicá:
   - la cantidad,
   - el estado ("Sin abrir" o "Abierto, sin usar"),
   - una **foto (obligatoria)**,
   - una nota, si querés.
2. Mirá el **reembolso estimado**. El monto final lo confirma el proveedor.
3. Tocá **Enviar pedido de devolución**.

**Qué pasa después:**

1. Quien te vendió (el proveedor o tu profesional) acepta todo, acepta una parte (y puede ajustar
   el monto) o rechaza, explicando el motivo. Te llega el aviso.
2. Si acepta, le entregás los sobrantes: al local del proveedor, o a tu profesional.
3. Cuando marca que los recibió, te devuelve la plata:
   - **Si pagaste con Mercado Pago:** el reembolso vuelve solo a tu medio de pago, en 1 a 15 días
     (sale de la cuenta de quien te cobró). Se devuelve el precio de lo que devolvés; **el cargo de
     servicio del 1% no se devuelve**.
   - **Si pagaste en efectivo:** te lo devuelve en efectivo. Después tocá **Recibí el reembolso**
     para confirmarlo; si no lo confirmás, se confirma solo a las 72 horas.

**Reglas a tener en cuenta:**

- Cada pedido de devolución va a **un solo vendedor** (un proveedor, o tu profesional por los
  materiales de su factura) y a un solo pago.
- Mientras no te respondan, podés **cancelar** el pedido.
- Si tu profesional después le devuelve esos materiales a su proveedor, eso es entre ellos: vos no
  lo ves ni tenés que hacer nada.

*Fuente: `src/components/screens/panel/sobrantes-section.tsx`.*

### 2.9 Reseñas

**Cuándo se habilitan:**

- **Obras:** al finalizar el proyecto. Calificás a tu profesional y a cada proveedor que te vendió
  materiales. Una reseña por persona.
- **Compras:** cuando el pedido está entregado o pagado.

**Cómo se hace:**

- Elegís de 1 a 5 estrellas, escribís un comentario (obligatorio) y podés subir hasta 4 fotos.
- **No se pueden editar** después de publicarlas.
- El profesional también te califica a vos.

*Fuente: `src/components/screens/panel/review-form.tsx`.*

### 2.10 Mensajes

- **Los chats nuevos se abren hacia quien ofrece algo:** podés escribirle a cualquier profesional
  o proveedor. A alguien que **solo es cliente** nadie le puede escribir primero: si lo intentan,
  ven "En HomIA los clientes escriben primero…". Cuando el chat ya existe, cualquiera responde.
- Se abre un chat desde:
  - **Contactar** en un perfil.
  - **Abrir chat** en un proyecto.
  - **Preguntarle** o **Chatear** en Materiales.
  - El mensaje inicial del asistente de contratación.
- Se ve el doble tilde de leído (celeste cuando el otro ya lo leyó).
- **Rápida en cada movimiento (24/09/2026):**
  - Abrir un chat, volver a la bandeja y entrar de nuevo a Mensajes muestra al instante lo último
    que viste; lo nuevo llega solo en segundo plano (el chat abierto se actualiza cada 3 segundos
    y la bandeja cada 10, solo mientras se ve).
  - Si abrís un chat por primera vez, el encabezado (nombre, foto, "Ver perfil") aparece enseguida
    y abajo dice "Cargando mensajes…".
  - **Al enviar**, tu mensaje aparece al instante con un relojito; cuando el servidor lo confirma
    pasa al tilde. Si no se pudo enviar, desaparece, el texto vuelve al campo y avisa "No se pudo
    enviar el mensaje…".
  - Abrir y cerrar un chat ya no te saca de tu panel (la dirección queda en
    `/panel/<tu rol>/mensajes?c=…`).
- **Reputación del cliente** (lo ven profesionales y proveedores en el chat con un cliente): ver 3.13.

*Fuente: `src/components/screens/messages-screen.tsx`.*

### 2.11 Verificar tu identidad (DNI)

1. Andá a **Verificación**. Subí el **frente** y el **dorso** del DNI, con buena luz y sin brillos.
2. Tocá **Enviar a verificación con IA**.

**Resultados posibles:**

- **"¡Tu identidad quedó verificada!":** se muestra el tilde verde junto a tu nombre.
- **"El documento fue rechazado":** con el motivo.
- **"El documento quedó en revisión":** por ejemplo, si la foto no se lee bien.

**Datos a tener en cuenta:**

- Hay **3 intentos por día**.
- Las fotos quedan privadas: solo las ves vos.

*Fuente: `src/components/screens/panel/verificacion.tsx`.*

### 2.12 Mi perfil

- **Email y celular** *(D26)*: tarjeta con el email y el celular y su estado, **Verificado** (verde)
  o **Sin verificar** (amarillo), como la insignia del DNI. Si el email está sin verificar (cuentas
  anteriores al 25/09/2026), **Verificar** manda un código de 6 números a tu email y lo escribís
  ahí mismo (misma regla: 10 minutos, 5 intentos, otro código a los 60 segundos). El celular hoy
  queda "Sin verificar" con la nota "Todavía no podemos mandar códigos por SMS ni WhatsApp".
- Podés cambiar tu foto, nombre, celular, dirección, ciudad y cumpleaños. El celular se guarda
  estandarizado (+54 9 …); si no es un celular válido, no se guarda y te dice por qué; si lo
  cambiás, vuelve a quedar "sin verificar". No se puede dejar vacío si ya tenías uno.
- Podés compartir tu ubicación y elegir el **radio de búsqueda** (1 a 100 km).
- El email no se puede cambiar.
- **Avisos por mail:** interruptor "Recibir avisos por mail" (prendido de fábrica). Dice a qué email
  llegan y qué avisa (oferta nueva, factura, reserva aprobada o lista). Ver "Lo básico para todos".
- Al final: **Eliminar mi cuenta** (ver "Lo básico para todos").

*Fuente: `cliente/perfil.tsx`, `panel/avisos-mail-card.tsx`.*

---

## 3. Profesional

**Usar HomIA es gratis para el profesional.** No hay plan de pago.

### Menú del profesional

| Sección | En el celular | Para qué |
|---|---|---|
| **Inicio** | Barra de abajo | Tu centro de mando |
| **Bolsa de trabajos** ("Bolsa") | Barra de abajo | Trabajos publicados para ofertar |
| **Proyectos** | Barra de abajo | Obras en curso |
| **Mensajes** | Barra de abajo | Chats |
| **Cobros** | Más | Conectar Mercado Pago, lo cobrado y lo pendiente, todas tus facturas (3.8) |
| **Finanzas** | Más | Ganancia, caja, balance, métricas y gastos; tus facturas se cargan solas (ver "Finanzas") |
| **Calendario** | Más | Tus trabajos por fecha y horario: acordados, por confirmar, días completos / con lugar / libres, agenda del día, tu jornada y proyectos sin fecha (3.16) |
| **Materiales** | Más | Buscar materiales, carrito y comparar precios |
| **Mis pedidos** | Más | Seguir y pagar los pedidos de materiales |
| **Mis ofertas** | Más | Presupuestos que mandaste |
| **Devoluciones** | Más | Sobrantes que te devuelven tus clientes y los que vos le devolvés a tus proveedores |
| **CRM clientes** | Más | Tu tablero de oportunidades |
| **Mis obras** | Más | Tu portafolio con fotos |
| **Cuentas de retiro** | Más | Vínculos con proveedores |
| **Directorio / Verificación / Mi perfil / Sugerencias / Ayuda** | Más | — |

*Fuente: `panel-layout.tsx:57-72`.*

### 3.1 Inicio

**Qué muestra:**

- **Primeros pasos:**
  1. Verificá tu identidad.
  2. Completá tu perfil.
  3. Mostrá tus obras.
  4. Enviá tu primer presupuesto.
- **Cuatro cifras:** presupuestos enviados, proyectos activos, trabajos en tu rubro y tu puntaje.
- **Próximas acciones:** proyectos que esperan algo de vos.
- **Oportunidades para vos:** trabajos abiertos de tu rubro.

*Fuente: `profesional/dashboard.tsx`.*

### 3.2 Bolsa de trabajos y ofertar

1. En **Bolsa de trabajos**, filtrá por oficio, urgencia y distancia (de 1 a 100 km).
2. En el trabajo que te interese, tocá **Ofertar**. Vas a ver el detalle: presupuesto del cliente,
   descripción y fotos.
3. En **Dejar presupuesto**, poné:
   - **Monto** (obligatorio).
   - **Plazo en días** (7 por defecto).
   - **Mensaje** contando cómo lo vas a hacer.
4. Tocá **Enviar presupuesto**.

**Qué pasa después:**

- Al cliente le llega "Nuevo presupuesto en tu trabajo".
- Mientras esté pendiente, podés **actualizarlo** o **retirarlo**.
- **Si te eligen:** te llega "¡Aceptaron tu presupuesto!" y se crea el proyecto con tu monto como
  mano de obra.
- **Si eligen a otro:** te llega "El cliente eligió otra oferta".

**Cosas a saber:**

- Si una oferta tuya fue **rechazada** o la **retiraste**, podés volver a ofertar desde el mismo
  trabajo mientras siga abierto.

*Fuente: `src/components/screens/job-detail.tsx`, `profesional/presupuestos.tsx`.*

### 3.3 Mis ofertas

- Arriba hay cuatro cifras: pendientes, valor cotizado, aceptadas y mano de obra ganada.
- Podés filtrar por Todas, Pendientes, Aceptadas, Rechazadas o Retiradas.
- Desde cada oferta podés **Ver trabajo**, **Retirar** (si está pendiente) o **Ver proyecto** (si
  fue aceptada).

*Fuente: `profesional/presupuestos.tsx`.*

### 3.4 Cuando un cliente te contrata directo: cotizar

1. Te llega el aviso "Te contrataron: cotizá la mano de obra para arrancar".
2. En el proyecto ves **qué pidió el cliente**, **cuándo y dónde**, y su presupuesto de referencia.
3. En **Cotizá la mano de obra**, poné el precio cerrado de tu trabajo, sin materiales, y tocá
   **Enviar cotización**.
   - Al cliente le llega "Te cotizaron la mano de obra".
   - Podés cambiar el precio mientras el proyecto siga en la etapa Presupuesto.
4. Si no podés tomar el trabajo, tocá **No puedo tomar este trabajo** y contá el motivo. El
   proyecto se cancela y le avisamos al cliente.

*Fuente: `profesional/proyecto-detalle.tsx`.*

**Subcontratar a otro profesional para uno de tus proyectos (D16):**

1. Entrá al perfil del otro profesional (Directorio) y tocá **Contratar**.
2. Arriba del primer paso, en **"¿Es para algo que ya publicaste?"**, elegí uno de **tus proyectos
   activos** (se ve título, cliente y etapa; los finalizados o cancelados no aparecen). Se cargan
   sus datos y los podés cambiar. Si no elegís nada, es una contratación suelta como siempre.
3. Confirmá. Para ese proyecto nuevo vos sos el cliente: lo seguís en **Proyectos** de tu panel de
   cliente, con el aviso **"Parte del proyecto <título>"** que te lleva al proyecto original.
4. En tu proyecto original aparece la sección **Subcontrataciones** con cada una (profesional,
   etapa y monto) y el link para abrirla.
5. **Tu cliente no ve las subcontrataciones ni sus montos**, y el profesional subcontratado no ve
   tu proyecto original. Al subcontratado le llega "… te subcontrató: <título> (parte de su
   proyecto …)".

Si también publicaste trabajos como cliente, el selector muestra los dos grupos por separado.

### 3.5 Llevar el proyecto por etapas

- **Avanzar etapa:** con el botón **"Avanzar a …"**.
  - Para salir de Presupuesto, primero tenés que cotizar.
  - En cada avance le avisamos al cliente.
- **Finalizar:** no podés finalizar la obra vos. Cuando termines, pasala a **Revisión**; el cliente
  revisa y la da por finalizada.
- **Cancelar:** se puede solo en Presupuesto o Materiales.
- **Fechas del trabajo:** con el presupuesto aprobado, proponé inicio, fin estimado y horario (o todo
  el día) desde la tarjeta "Fechas del trabajo" del proyecto (ver 3.16).
- **Contacto con el cliente:**
  - **Abrir chat:** si el cliente todavía no te escribió, ves "El cliente todavía no abrió el chat".
  - **Ver reputación:** te muestra con quién vas a trabajar (sus reseñas de otros profesionales,
    sus obras terminadas y sus compras).

*Fuente: `profesional/proyecto-detalle.tsx`, `src/components/app/client-summary.tsx`.*

### 3.6 ¿Quién paga los materiales? (modos A y B)

En el proyecto, elegí una de estas opciones:

- **"Los adelanto yo y los cobro en la factura" (modo A):** comprás vos los materiales y los cobrás
  junto con tu mano de obra.
- **"El cliente paga los materiales al proveedor" (modo B):** el proveedor le cobra los materiales
  al cliente directamente y tu factura es solo por la mano de obra.

El cliente ve el modo que elijas. Una vez que emitís una factura, el modo **queda fijo**.

*Fuente: `profesional/proyecto-detalle.tsx:532-568`.*

### 3.7 Proponer materiales

1. En **Proponer material al cliente**, buscá el material en el catálogo (por ejemplo "caño",
   "cable" o "cemento").
2. Si un proveedor **vinculado a vos** lo tiene en stock, la app completa el mejor precio. Si no,
   elegí "Sin proveedor (compro por mi cuenta)".
3. Poné la cantidad, el precio unitario y una nota para el cliente, si querés.
4. Tocá **Proponer al cliente**. Al cliente le llega "Nuevos materiales por aprobar".

**Qué pasa después:**

- **Si el cliente aprueba:** el stock del proveedor queda reservado.
- **Si rechaza:** podés **Sugerir alternativa**.
- **Mientras no decida:** podés **Eliminar** tu propuesta.

**Si algo sale mal:**

- "Necesitás una cuenta de retiro activa con …": primero vinculate con ese proveedor (punto 3.11).
- "… no alcanza": el proveedor no tiene stock suficiente.

*Fuente: `profesional/proyecto-detalle.tsx:571-818`.*

### 3.8 Facturar y cobrar

**Emitir la factura:**

1. En el proyecto, tocá **Emitir factura**. No hay que completar nada: la app arma la factura sola.
   - **Modo A:** incluye los materiales aprobados que todavía no facturaste, más la mano de obra.
   - **Modo B:** incluye solo la mano de obra.
   - La mano de obra se factura **una sola vez**.
2. Te llega "Factura HOM-2026-… emitida" y al cliente, "Nueva factura". Cada factura se puede bajar
   en **PDF**.
3. Solo puede haber **una factura pendiente a la vez**: para emitir la siguiente, esperá a que el
   cliente pague la anterior.

**La pantalla Cobros (menú Cobros; en el celular, dentro de "Más") — desde el 24/09/2026:**

Es el único lugar para todo lo de cobrar. De arriba hacia abajo:

1. **Cobrá con tu Mercado Pago:** tocá **Conectar Mercado Pago** y autorizá en Mercado Pago. Volvés
   solo a **Cobros** con "Mercado Pago conectado — Tus clientes ya pueden pagarte las facturas por
   Mercado Pago: la plata entra en tu cuenta." Si cancelás: "No conectaste Mercado Pago — Podés
   hacerlo cuando quieras desde Cobros." Estados: conectado (con fecha), "Vencido: volvé a conectar"
   o "No conectado". Podés **desconectar** cuando quieras.
2. **Resumen:** **Cobrado este mes** (facturas cobradas desde el día 1 del mes, hora argentina),
   **Pendiente de cobro** (suma de las facturas sin cobrar) y **Facturas pendientes** (cantidad; si
   hay efectivo para confirmar, lo dice abajo).
3. **Tus facturas:** las de **todos** tus proyectos, con filtros **Pendientes** (arranca acá),
   **Cobradas** y **Todas**. Cada una muestra número, proyecto (tocándolo vas al proyecto), cliente,
   fecha de emisión (y de cobro), total y cómo está:
   - **Cobrada por Mercado Pago** — "Cobraste el 100%: el cargo de servicio HomIA (1%, $…) lo pagó el
     cliente aparte."
   - **Cobrada en efectivo** — "Confirmaste que recibiste el dinero."
   - **Efectivo acordado** — el cliente eligió efectivo: aparece **Confirmar cobro en efectivo**.
     Pide confirmación ("¿Ya recibiste el efectivo?… no se puede deshacer") y al aceptar la factura
     queda cobrada y el cliente recibe el aviso.
   - **Pago por Mercado Pago en curso** — el cliente inició el pago; se marca cobrada sola.
   - **Esperando el pago** — el cliente todavía no eligió cómo pagar.
   - Botón **PDF** en todas.
   - Sin facturas: "Todavía no emitiste facturas" con el botón **Ver mis proyectos**.
4. **Comprar materiales** (buscás entre todos los proveedores y armás el carrito) y **Mis pedidos**
   (seguís lo que les compraste: pago, preparación y entrega).

En **Mi perfil** ya no está la tarjeta de Mercado Pago: hay un acceso **"Cobros y Mercado Pago"** que
lleva a esta pantalla.

**Cómo cobrás (el cliente elige cómo pagar):**

- **Mercado Pago:** solo si conectaste tu Mercado Pago. La plata entra a **tu** cuenta y cobrás el
  **100%** de la factura; el cliente paga aparte el cargo de servicio HomIA del 1%. Cuando se
  acredita, la factura pasa sola a pagada.
- **Efectivo:** sin cargo. Te llega "Pago en efectivo acordado". Cuando recibís la plata, tocá
  **Confirmar cobro en efectivo** en el proyecto o en **Cobros**.
- **Si no conectaste Mercado Pago,** el cliente solo puede pagarte en efectivo.

**Si algo sale mal:**

- "Todavía no cotizaste la mano de obra…": cotizá primero.
- "Ya hay una factura pendiente de pago": esperá el pago de la anterior.

**Devoluciones de materiales que facturaste (modo A):** si le cobraste los materiales al cliente
en tu factura, sus devoluciones de sobrantes son **con vos** (ver 3.14).

*Fuente: `profesional/proyecto-detalle.tsx`, `profesional/cobros.tsx`, `profesional/perfil.tsx`, `src/components/app/mp-connect-card.tsx`.*

### 3.9 Materiales para vos

- Es la misma pantalla que la del cliente (punto 2.7): **carrito** y **Mis pedidos** (también en el
  menú). Tiene una pestaña extra, **Comparables**, con el mejor precio de cada material.
- **Mis pedidos** y **Devolver sobrantes** de tus compras funcionan igual que para el cliente.
- Igual que el cliente: lo que **comprás con stock** no necesita aprobación del proveedor (queda
  reservado al confirmar y tenés 24 horas para pagar o elegir efectivo; con efectivo, 7 días para
  retirar); lo que **reservás** (con o sin stock) lo aprueba el proveedor. Lo sin stock solo se
  reserva.
- En proyectos donde **el cliente le paga los materiales al proveedor** (modo B), también podés
  pedirle al proveedor devolver sobrantes como comprador, igual que el cliente.
- En proyectos donde **vos adelantaste los materiales** (modo A), mirá 3.14.

*Fuente: `cliente/materiales.tsx` (con perfil profesional), `src/components/screens/panel/pedidos.tsx`.*

### 3.14 Devoluciones de sobrantes (menú Devoluciones)

Regla del 24/09/2026: **devuelve la plata quien la cobró, y los materiales vuelven a quien se los
vendió al cliente.** Si adelantaste los materiales y se los cobraste al cliente en tu factura, vos
sos quien le vendió: sus devoluciones te llegan a vos.

La pantalla **Devoluciones** tiene dos pestañas:

**De mis clientes** (te llega el aviso "Te pidieron devolver sobrantes"):

| Estado | Qué podés hacer |
|---|---|
| **Nueva: respondé** | **Aceptar todo**, **Aceptar algunos** (cantidad y monto por ítem) o **Rechazar** con motivo |
| **Aceptada: esperando los sobrantes** | Cuando te los entrega, **Marcar recibido** con cuánto recibiste |
| **Recibida: reembolsá** | Si te pagó la factura en efectivo: le devolvés la plata en mano y tocás **Ya lo reembolsé en efectivo** |
| **Reembolsada** | Si te pagó por Mercado Pago, el reembolso salió solo **de tu cuenta** al marcar recibido. En efectivo, esperás que el cliente confirme (o se confirma solo a las 72 h) |
| **Falló el reembolso** | Revisá tu Mercado Pago en Mi perfil y tocá **Reintentar reembolso** |

- Lo que te devuelve el cliente **no vuelve al stock de ningún proveedor**: queda con vos.
- El cargo de servicio del 1% no se reembolsa.
- Si no respondés en 72 horas, te llega **un** recordatorio.
- Con los sobrantes en mano aparece **Devolvérselos a mi proveedor**, que te lleva al proyecto.

**A mis proveedores** (opcional): lo que vos les pediste devolver.

1. En el proyecto, sección **Sobrantes**, tocá **Pedir devolución a <proveedor>** (hay un botón por
   cada proveedor con materiales en el proyecto).
2. Si tu cliente ya te devolvió sobrantes, tocá **Precargar con lo que me devolvió el cliente**:
   se completan cantidades, estado y fotos (podés cambiarlas).
3. Por cada material: cantidad, estado, **foto obligatoria** y nota. No podés pedir más de lo que
   ese proveedor te vendió para el proyecto (menos lo que ya le pediste).
4. Tocá **Enviar pedido de devolución**. El proveedor acepta todo, una parte o rechaza.
5. Le llevás los materiales; el proveedor marca recibido (vuelven a su stock).
6. **Como a ese proveedor le pagaste por fuera de HomIA, la plata también vuelve por fuera:** el
   proveedor marca cómo te la devolvió (efectivo, transferencia o saldo a favor en el local, con
   una nota) y te llega el aviso. Tocá **Recibí el reembolso** (si no, se confirma solo a las 72 h).
   Nunca se hace por Mercado Pago.

*Fuente: `profesional/devoluciones.tsx`, `profesional/sobrantes-pro.tsx`, `proveedor/devoluciones-tab.tsx`.*

### 3.10 Mis obras (portafolio)

1. Tocá **Publicar obra**.
2. Poné título, descripción, categoría y hasta 4 fotos.
3. Tocá **Publicar obra**: aparece en tu perfil público.

**Cosas a saber:**

- Si alguna foto no sube, la obra **no se publica**, para que no quede incompleta.
- Cuando borrás una obra, deja de verse, pero las reseñas no se tocan.

*Fuente: `profesional/obras.tsx`.*

### 3.11 Cuentas de retiro (vincularte con proveedores)

Una cuenta de retiro te habilita a retirar materiales en el local de un proveedor a cuenta de tus
proyectos. **No es una cuenta bancaria ni guarda plata.**

1. Tocá **Vincularme**.
2. Poné el email del proveedor, un nombre para la cuenta y notas, si querés.
3. Tocá **Enviar solicitud**. La cuenta queda **pendiente** hasta que el proveedor la active.

**Qué pasa después:**

- Cuando el proveedor la activa, te llega "Cuenta de retiro activa".
- Vos solo podés **pausarla**. Para reactivarla, se lo tenés que pedir al proveedor.
- El proveedor también puede vincularte directamente. En ese caso la cuenta nace activa.

*Fuente: `profesional/vinculaciones.tsx`.*

### 3.12 CRM clientes

- Es un tablero con las columnas Consultas, Presupuesto enviado, En negociación, En obra y
  Cerrado / Facturado.
- Con **+ Nuevo trato** cargás un título y un valor estimado.
- Movés cada trato con las flechas ◀ ▶ y lo borrás con el tacho.
- **Los tratos se cargan a mano**: el tablero no se llena solo.
- Borrar un trato no pide confirmación.

*Fuente: `profesional/crm.tsx`.*

### 3.13 Reseñas, verificación y perfil

- **Reseñar al cliente:** se hace al finalizar el proyecto. El formulario es igual que el del
  cliente.
- **Tus reseñas:** se ven en tu perfil público. Hoy no hay forma de responderlas.
- **Verificación:** igual que la del cliente (punto 2.11). Si en tu perfil cargaste un DNI/CUIL
  distinto al de la foto, la verificación se rechaza.
- **Mi perfil:**
  - Datos de contacto, persona o empresa, oficios (al menos uno), habilidades, experiencia y bio.
  - **Radio de servicio:** a qué distancia aceptás trabajar.
  - **Email y celular** *(D26)*: la misma tarjeta que el cliente (2.12): verificado o sin
    verificar, y **Verificar** el email con un código.
  - Acceso **"Cobros y Mercado Pago"** (lleva a Cobros, ver 3.8).
  - Un aviso: usar HomIA es gratis; cuando alguien paga por Mercado Pago se suma un cargo de
    servicio del 1% que paga quien compra (vos cobrás el 100% de tu factura).
  - **Avisos por mail:** interruptor "Recibir avisos por mail" (te contrataron, te aceptaron un
    presupuesto, te pagaron una factura por MP, te piden devolver sobrantes). Ver "Lo básico para
    todos".
  - Al final: **Eliminar mi cuenta** (ver "Lo básico para todos"): antes tenés que terminar tus
    proyectos activos y cobrar tus facturas pendientes.
- **Reputación del cliente** (botón **Reputación** en el chat con un cliente, **Ver reputación** en
  el proyecto, y en los pedidos del proveedor): muestra nombre, verificación, ciudad, antigüedad, un
  atajo **"★ 5 · 1 reseña"** que baja hasta la lista **"Lo que dicen los profesionales que
  trabajaron con él/ella"** (estrellas, comentario, si fue obra o compra y, desde el 24/09/2026, las
  fotos de la reseña), y las cifras: obras finalizadas, compras a proveedores y proyectos activos.
  Sin reseñas: "Sin reseñas todavía" (sin link). El cliente no tiene perfil público: esto es lo que
  ven de él.

*Fuente: `profesional/perfil.tsx`, `src/components/app/client-summary.tsx`.*

### 3.14.1 Profesionales que contrataste

En **Mis proyectos**, abajo de tus proyectos, aparece **"Profesionales que contrataste"** cuando le
encargaste un trabajo a otro profesional (con o sin elegir uno de tus proyectos). Tocás uno y lo seguís
como cliente: su cotización, el avance, el pago y la reseña.

### 3.15 Tu perfil público (lo que ven los demás)

- Nombre (o empresa), verificación, oficios, ciudad, radio y antigüedad.
- **Atajo a tus reseñas** "★ 4,5 · 12 reseñas" que baja hasta la sección Reseñas (ver 1.5).
- Cifras (obras, años de experiencia, reseñas), bio y habilidades, **Disponibilidad**,
  **Trabajos realizados** y **Reseñas** con fotos.
- **Disponibilidad** *(24/09/2026; con horarios desde el 25/09/2026)*: un calendario de los
  próximos 3 meses (se pasa de mes con las flechas) donde cada día es **Completo** (azul oscuro: no te
  quedan horas libres en tu jornada), **Con lugar** (celeste con una rayita: tenés trabajos pero te
  quedan horas), **Por confirmar** (punteado: solo hay trabajos propuestos) o **Libre** (verde claro).
  **Tocando un día** se ven los horarios **ocupados** (ej. "07:00–12:00", "14:00–19:00", o "Todo el
  día"; los propuestos dicen "por confirmar") y los **libres en tu jornada** (ej. "12:00–14:00").
  Arriba, un resumen: **"Con lugar esta semana"** o **"Próximo día con lugar: 14/10"**. Nunca se ve
  de qué trabajo se trata, para quién ni dónde (ni cuántos trabajos son: los horarios se muestran
  unidos).
  Como el perfil pide cuenta (ver 1.5), la ven clientes, proveedores y otros profesionales con
  sesión; un visitante sin cuenta ve "Ingresá para ver este profesional".
- Botones **Contactar**, **Contratar**, favorito y compartir.

*Fuente: `src/components/screens/pro-profile.tsx`, `src/components/app/availability-section.tsx`.*

### 3.16 Calendario y fechas del trabajo *(24/09/2026)*

**Acordar las fechas de un proyecto** (tarjeta **"Fechas del trabajo"** en el detalle del proyecto):

1. Cuando el presupuesto queda aprobado (el cliente aceptó tu oferta en la bolsa, o el proyecto ya
   pasó a Materiales), tocá **Proponer fechas**: inicio, fin estimado, **horario de trabajo** y una
   nota opcional. El inicio no puede ser anterior a hoy y el fin no puede ser antes del inicio.
   - **Horario de trabajo:** **Todo el día** (lo que viene marcado) o **Elegir horario**: desde y
     hasta, de a 15 minutos, cualquier hora del día (el fin tiene que ser después del inicio, el
     mismo día). Vale para **cada día** del rango. Debajo dice "Tu jornada: 06:00 a 18:00" y el
     botón **Usar ese horario** la carga de un toque.
   - Así podés tener **varios trabajos el mismo día**: por ejemplo de 07:00 a 12:00 en un baño y de
     14:00 a 19:00 en una cocina. Si se tocan justo (uno termina 12:00 y el otro empieza 12:00) no
     chocan.
2. **No se pisan:** si el día y el horario chocan con otro trabajo tuyo **ya acordado**, el cuadro te
   lo dice en rojo en el momento, con cuál ("Ese horario choca con «Baño de Juan» (el 28/09, de 07:00
   a 12:00). Elegí otro día u horario.") y **no te deja enviar**. Si choca solo con otra
   **propuesta** tuya que el cliente todavía no aceptó, te avisa en amarillo pero te deja: la que se
   acepte primero se queda con el horario (la otra ya no se va a poder aceptar).
3. Al cliente le llega un aviso (app y mail) y un mensaje en el chat. Mientras decide, la tarjeta
   dice **"Esperando respuesta"**; podés **Cambiar mi propuesta**.
4. El cliente las **acepta** (quedan **acordadas**), las **rechaza** (con motivo: proponé otras) o
   **te propone otras**: ahí la tarjeta dice **"Te toca responder"** y vos aceptás, rechazás o
   contraproponés. Nadie acepta su propia propuesta.
5. **Reprogramar:** con fechas acordadas, cualquiera de los dos toca **Pedir reprogramar**. Hasta que
   el otro responda siguen valiendo las acordadas (con su horario); si rechaza, quedan las de antes.
6. Si al **aceptar** el horario ya quedó ocupado por otro trabajo que se acordó mientras tanto, no se
   puede aceptar: la tarjeta lo muestra en rojo y hay que proponer otro día u horario.

**Pantalla Calendario** (menú → Calendario):

- **Mi jornada** *(25/09/2026)*: arriba dice **"Mi jornada: 06:00 a 18:00"** (la de referencia) con
  el botón **Cambiar**: elegís desde y hasta (de a 15 minutos) y **Guardar**; **Volver a
  06:00–18:00** la restablece. Sirve para decidir qué días están **completos** o **con lugar**, en tu
  calendario, en tu perfil y en lo que responde Homy. Tus trabajos pueden estar en cualquier horario,
  aunque sea fuera de tu jornada.
- **Resumen del mes:** días **completos** (sin horas libres en tu jornada), **con lugar** (tenés
  trabajos pero te quedan horas) y **libres**.
- **El mes** (flechas para ir al anterior o al siguiente; hoy en naranja): en la compu, cada día
  dice si está **Completo** o **Con lugar** y muestra barritas con la **hora de inicio** y el nombre
  del trabajo ("07:00 Baño de Juan"; sin hora si es todo el día; azul = acordado, punteado = por
  confirmar, gris = finalizado); en el celu, un recuadrito con **cuántos trabajos** tiene ese día
  (azul oscuro con un punto = completo, celeste = con lugar, punteado = solo propuestos).
- **Tocando un día** ves abajo sus trabajos **ordenados por hora** ("07:00–12:00 · Baño de Juan",
  "Todo el día · …") y la **Agenda del día**: una línea de tiempo por hora (tu jornada, estirada si
  algún trabajo cae afuera) con cada trabajo como un bloque en su horario (acordado sólido, propuesto
  punteado; si dos se cruzan van uno al lado del otro) y los **huecos libres** en verde ("Libre ·
  12:00–14:00"). Tocando un trabajo (o un bloque) vas al proyecto.
- **Próximos trabajos:** los de los próximos 6 meses con su estado ("Arranca en 3 días", "En curso",
  "Esperando al cliente", "Te toca responder").
- **Sin fecha todavía:** proyectos con presupuesto aprobado que no tienen fechas, con el botón
  **Proponer fechas** (y el motivo, si el cliente rechazó las anteriores).
- Si un cliente te propuso fechas, arriba aparece el aviso "N clientes te propusieron fechas".
- Lo acordado y lo propuesto se ve en tu perfil público como **Disponibilidad** (3.15): cada día
  libre, con lugar o completo y sus horarios ocupados y libres, sin datos de cada trabajo.

*Fuente: `src/components/screens/panel/profesional/calendario.tsx`, `src/components/app/schedule-card.tsx`;
reglas en `LOGICA-HOMIA.md` §3.6.*

---

## 4. Proveedor

El proveedor es **el único rol que paga**. Tiene 14 días gratis desde el alta y después elige un
plan: **Básico, $50.000 por mes**, o **PRO, $100.000 por mes**.

### Menú del proveedor

| Sección | En el celular | Para qué |
|---|---|---|
| **Inicio** | Barra de abajo | Resumen, alertas de stock, analítica PRO |
| **Stock** | Barra de abajo | Tus materiales, precios y cantidades |
| **Cobros** | Barra de abajo | Tres pestañas: Cobros de proyectos, **Ventas (pedidos)** y **Devoluciones**; y el recuadro para conectar tu Mercado Pago |
| **Mensajes** | Barra de abajo | Chats |
| **Finanzas** | Más | Ganancia, caja, balance, costo del stock y métricas; tus ventas se cargan solas (ver "Finanzas") |
| **Mi plan** | Más | Prueba, Básico o PRO |
| **CRM** | Más | Tablero de tratos |
| **Vinculaciones** | Más | Cuentas de retiro de profesionales |
| **Directorio / Verificación / Mi perfil / Sugerencias / Ayuda** | Más | — |

Arriba de todo se ve el estado del plan:

- **"Prueba: quedan N días"** mientras dura la prueba.
- **"Plan vencido → Elegí tu plan"** cuando terminó la prueba sin plan.

*Fuente: `panel-layout.tsx:70-82`, `:188-205`.*

### 4.1 Inicio

**Qué muestra:**

- **Aviso del plan** mientras dura la prueba o cuando está vencida.
- **Primeros pasos:**
  1. Verificá tu identidad.
  2. Completá tu perfil de negocio.
  3. **Conectá Mercado Pago.**
  4. Publicá tu catálogo de stock.
  5. Vinculate con profesionales.
- **Cuatro cifras:** elementos publicados, valor del stock, por agotar y agotados.
- **Alertas de stock:** "Crítico" o "Reponer pronto", con el botón **Reponer**.
- **Analítica del negocio:** solo con PRO (ver 4.9).
- **Vinculaciones activas** y **accesos rápidos.**

*Fuente: `proveedor/dashboard.tsx`.*

### 4.2 Stock: publicar un material

1. En **Stock**, tocá **Publicar elemento**.
2. Buscá el material en el catálogo. Con 2 letras ya aparecen resultados, y encuentra aunque lo
   escribas sin acento o con otro nombre.
3. **Si no está en el catálogo:** tocá **"Agregar «X» al catálogo con IA"**.
   1. Poné el nombre técnico, la categoría y la unidad de venta.
   2. La IA escribe la explicación y los otros nombres con que lo busca la gente.
   3. Si ya existía algo parecido, lo selecciona y no lo duplica.
4. Poné el **precio**, la **cantidad**, el **stock mínimo** (5 si no ponés nada) y la **marca**, si
   querés.
5. Tocá **Publicar elemento**.

**Editar después:** desde la tarjeta del material podés cambiar la foto, la marca, el precio, la
cantidad (con los botones − y +) y el stock mínimo. También podés **Eliminar** el material.

**Estado del material (se calcula solo):**

- **Por agotar:** cuando la cantidad llega al mínimo.
- **Agotado:** cuando la cantidad llega a 0.

**Si algo sale mal:**

- "Ya tenés ese elemento": editá la entrada que ya existe.
- "Tu prueba gratis terminó…": elegí un plan para volver a gestionar el stock.

*Fuente: `proveedor/stock.tsx`.*

### 4.3 Ventas (pestaña "Ventas (pedidos)" dentro de Cobros)

Acá llega **tu parte** de cada pedido: uno o más productos tuyos que un cliente o profesional sumó a
su carrito. Te llega por chat y con un aviso. Solo ves tu parte: no ves lo que ese cliente le pidió
a otros proveedores. Desde el 24/09/2026 (decisión D15) hay dos tipos:

- **Compra directa** (aviso **"Nueva compra: stock reservado"**): el cliente compró algo que tenés
  en stock. **No tenés que aprobar nada**: tu stock ya quedó reservado para él y el cobro ya está
  emitido. El cliente tiene 24 horas para pagar por Mercado Pago o elegir efectivo (con efectivo, 7
  días desde la compra para retirar y pagar). Vos lo preparás y lo entregás.
- **Reserva** (aviso **"Nueva reserva de un cliente"**): el cliente te pide que se lo guardes o que
  se lo consigas. **La aprobás o la rechazás.** Puede incluir productos que publicás con cantidad 0.

| Estado | Qué ves | Qué podés hacer |
|---|---|---|
| **Reserva para aprobar** | Número de pedido, productos y cantidades, cliente, nota, **Reputación del cliente** | **Aprobar reserva** o **Rechazar** (con motivo) |
| **Aprobada: esperando tu stock** | "Le dijiste al cliente que lo tenés aproximadamente el …" | **Ya lo tengo: disponible** o **Cancelar** (con motivo) |
| **Por pagar** (compra) / **Reservada: por pagar** (reserva) | "Compra directa: tu stock ya está reservado para este cliente. No hace falta aprobarla", cómo va a pagar y "Si no se paga, se cancela sola el …" | **Entregado**, **Cancelar** (con motivo), **Confirmar cobro en efectivo** (si acordó efectivo) |
| **Efectivo al retirar** | El cliente acordó efectivo | **Confirmar cobro en efectivo**, **Entregado**, **Cancelar** (con motivo) |
| **Pagada: falta entregar** / **Pagado** sin entregar | El cliente ya pagó | **Entregado** o **Cancelar y devolver** (con motivo) |
| **Entregado: falta el pago** | — | **Confirmar cobro en efectivo** si acordó efectivo |
| **Pagado** | "Venta cobrada — el cliente puede calificarte" | — |
| **Rechazado / Cancelado** | Motivo | — |

**Cómo aprobar una reserva:**

1. Tocá **Aprobar reserva**. Vas a ver cada producto con el stock que tenés.
2. **Si tenés stock de todo:** tocá **Aprobar y reservar todo**. Se reservan **todos los productos
   juntos**, se emite el cobro y el cliente tiene **48 horas** para pagar y retirar.
3. **Si te falta algo:** aparece el campo **"Disponible aproximadamente el…"**. Elegí la fecha y
   tocá **Aprobar sin stock** (si era "a coordinar", también fijás el precio). No se descuenta nada:
   el cliente ve la fecha. Cuando te llegue, cargalo en **Stock** y tocá **Ya lo tengo:
   disponible**: ahí se reserva, se emite el cobro, al cliente le llega "Tu reserva ya está para
   retirar" y arrancan sus 48 horas. Si todavía no te alcanza, te dice cuál falta.

**Cancelar una venta (compra o reserva ya aprobada):** siempre con un **motivo** (le llega al
cliente). El stock reservado vuelve a tu inventario. Si el cliente **ya pagó por Mercado Pago** y
no se lo entregaste, se le devuelve el pago completo **desde tu cuenta de Mercado Pago** (si tu
Mercado Pago no está conectado, primero reconectalo; si Mercado Pago no responde, no se cancela
nada). Si ya te pagó **en efectivo**, el aviso le dice que se lo devolvés en mano. Lo que ya
entregaste no se cancela: eso va por devoluciones de sobrantes.

**Qué pasa después:**

- En cada venta dice: "Cobrás $X (el 100% de tu precio). El cliente paga aparte el cargo de
  servicio HomIA (1%)".
- **Si el cliente paga con Mercado Pago:** la plata entra a **tu** cuenta de Mercado Pago y te llega
  "Cobro acreditado por Mercado Pago". El 1% lo paga el cliente, no vos.
- **Si acordó efectivo:** tocá **Confirmar cobro en efectivo** cuando recibas la plata.
- **Si no tenés Mercado Pago conectado:** el cliente solo puede pagarte en efectivo.
- **Si no paga a tiempo** se cancela sola y el stock vuelve a tu inventario: compra sin pagar ni
  elegir efectivo → 24 horas; compra con efectivo acordado → 7 días desde la compra; reserva
  aprobada o disponible → 48 horas. Una reserva que espera tu stock no vence sola.
- Cada acción queda en la **línea de tiempo** de la venta.

*Fuente: `src/components/screens/panel/proveedor/cobros.tsx`.*

### 4.4 Cobros de proyectos (pestaña dentro de Cobros)

Aparecen cuando un profesional usa tus materiales en un proyecto con el modo **"el cliente paga al
proveedor"** y el cliente los aprueba.

1. En **Materiales por cobrar** ves los materiales de cada proyecto y el total.
2. Tocá **Emitir cobro al cliente**. Se crea un cobro con número PRV-2026-… y al cliente le llega el
   aviso.
3. El cliente paga con **Mercado Pago**, o acuerda **efectivo** y vos tocás **Confirmar cobro en
   efectivo** cuando lo recibís.

**Cosas a saber:**

- Solo puede haber **un cobro abierto por proyecto** a la vez.
- No existe un cobro "libre" ni un link de pago para compartir.
- Si el cliente paga con **Mercado Pago**, la plata entra a **tu** cuenta (cobrás el 100%; el
  cliente paga aparte el cargo de servicio del 1%). Si no conectaste tu Mercado Pago, solo puede
  pagarte en efectivo.

*Fuente: `proveedor/cobros.tsx`, `src/app/api/charges/[id]/route.ts`.*

### 4.5 Devoluciones de sobrantes (pestaña dentro de Cobros)

Cuando alguien te quiere devolver material que le sobró, te llega el aviso **"Te pidieron devolver
sobrantes"** (un cliente que te compró, o un profesional que te pagó un cobro) o **"Un profesional
te pide devolver materiales"** (un profesional que te compró materiales para una obra y te los pagó
por fuera de HomIA). El pedido trae fotos, cantidades y el estado de cada ítem; los de un
profesional dicen "Profesional · proyecto <título>".

Las devoluciones de materiales que un profesional le cobró al cliente en su factura **no te
llegan**: son entre el cliente y el profesional.

| Estado | Qué podés hacer |
|---|---|
| **Nueva: respondé** | **Aceptar todo**, **Aceptar algunos** (podés ajustar la cantidad y el monto de cada ítem, por ejemplo con un descuento por manipulación, y el cliente lo ve) o **Rechazar** (el motivo es obligatorio) |
| **Aceptada: esperando que la acerquen** | Cuando te traen los sobrantes, **Marcar recibido** y confirmás cuánto recibiste |
| **Recibida: reembolsá** | Devolvés la plata en el mostrador y tocás **Ya lo reembolsé en efectivo**. Si te lo pidió un profesional: **Marcá cómo le devolviste la plata** (efectivo, transferencia o saldo a favor en el local, con nota opcional) |
| **Reembolsada** (efectivo o por fuera) | Esperás que el cliente (o el profesional) confirme que la recibió; se confirma solo a las 72 h |
| **Falló el reembolso** | **Reintentar reembolso** |
| **Rechazada / Cancelada** | — |

**Qué pasa cuando marcás "recibido":**

- Lo que recibiste **vuelve solo a tu stock** (también lo que te devuelve un profesional).
- Si te lo pidió un **profesional**, nunca hay reembolso por Mercado Pago: se lo devolvés por
  fuera y lo marcás.
- Si el cliente pagó con **Mercado Pago**, el reembolso sale **automáticamente** de la cuenta que
  cobró la venta (la tuya, si el pago se hizo con tu Mercado Pago). Se reembolsa el precio de lo
  devuelto; el cargo de servicio del 1% no se devuelve.
- **Si falla el reembolso:** revisá que tu Mercado Pago siga conectado y reintentá.

**Si no respondés una devolución en 72 horas,** te llega **un** recordatorio: "Tenés una devolución
sin responder".

*Fuente: `proveedor/devoluciones-tab.tsx`, `src/lib/leftovers-cron.ts`.*

### 4.6 Conectar Mercado Pago

En **Cobros**, en el recuadro **"Cobrá con tu Mercado Pago"**, tocá **Conectar Mercado Pago**.

1. Te lleva a Mercado Pago para autorizar.
2. Al volver, la app dice "Mercado Pago conectado".

**Estados posibles del recuadro:**

- **Conectado hasta [fecha].**
- **Vencido: volvé a conectar.**
- **No conectado.**

**Qué pasa según el estado:**

- **Sin conexión:** tus clientes solo pueden pagarte **en efectivo** (ventas y cobros de
  proyectos).
- **Conectado:** "La plata de tus ventas y cobros entra en tu cuenta: cobrás el 100% de tu precio (el
  cliente paga aparte el cargo de servicio HomIA del 1%)."
- **Desconectar:** los pagos que ya estaban iniciados no se ven afectados.

**Si algo sale mal:** si aparece "No pudimos conectar tu Mercado Pago", probá de nuevo en un rato.
Mientras tanto, tus clientes te pagan en efectivo.

*Fuente: `proveedor/cobros.tsx`, `src/components/app/mp-connect-card.tsx`.*

### 4.7 Vinculaciones (cuentas de retiro)

Sirven para habilitar a un profesional a retirar materiales en tu local a cuenta de sus proyectos.
No mueven plata.

**Hay dos formas de crear una vinculación:**

- **Vos lo vinculás:**
  1. Andá a **Vincular un profesional** y poné su email (tiene que estar registrado como
     profesional), un nombre para la cuenta y notas.
  2. La vinculación **nace activa** y al profesional le llega el aviso.
- **Te lo pide el profesional:**
  1. Te llega "Un profesional pide cuenta de retiro".
  2. La activás con el interruptor.

**Pausar y reactivar:** podés pausar la cuenta y reactivarla cuando quieras.

**Por qué importa:** sin una cuenta activa con vos, el profesional **no puede proponer tus
materiales** en sus proyectos.

*Fuente: `proveedor/vinculaciones.tsx`.*

### 4.8 CRM

Es un tablero de tratos que se cargan a mano, con las columnas Nuevos contactos, Cotizando, Compra
en curso y Cliente recurrente.

- **Nuevo trato:** cargás título, etapa, valor y contraparte (la contraparte es un texto libre).
- **Mover o eliminar:** podés mover el trato entre columnas o eliminarlo, con confirmación.

*Fuente: `proveedor/crm.tsx`.*

### 4.9 Mi plan: Básico o PRO

**Qué incluye cada plan:**

| | Prueba (14 días) | Básico — $50.000/mes | PRO — $100.000/mes |
|---|---|---|---|
| Stock, ventas, cobros, CRM, vinculaciones | Sí | Sí | Sí |
| Aparecer en materiales, directorio y búsquedas | Sí | Sí | Sí, **primero y como "★ Recomendado"** |
| Tu logo y tu marca en la **cinta de sponsors** de la portada | No | No | **Sí** |
| **Analítica del negocio** | No | No | **Sí** |

**Suscribirte:**

1. Tocá **Elegir Básico** o **Pasarme a PRO**.
2. Te lleva a Mercado Pago para autorizar el cobro mensual en pesos.
3. Al volver, la app dice "Estamos confirmando tu pago con Mercado Pago…". Esto puede tardar hasta
   un minuto; si no llega la confirmación, tocá **Volver a verificar**.

**Qué pasa después:**

- Al subir a PRO te llega "¡Subiste al plan PRO!".
- Al bajar a Básico, dejás de ser Recomendado y salís de la cinta de sponsors.

**Cambiar de plan:** tocá el botón del otro plan. La suscripción anterior se cancela sola recién
cuando se confirma la nueva; si abandonás el pago, seguís con el plan que tenías.

**Cancelar:** **no hay botón en la app.** Se cancela desde tu cuenta de Mercado Pago.

**Qué pasa si vence la prueba, cancelás o dejás de pagar:**

- **Si no pagás:** si pasan 35 días sin cobro, el plan se cancela.
- **Desaparecés** de materiales, directorio, búsquedas, mapa y de las respuestas de Homy.
- **No podés** tocar el stock, gestionar pedidos, emitir cobros ni ver la analítica.
- **Sí podés** entrar a tu panel y mirar.
- **Tus datos, reseñas y vinculaciones se conservan.**
- Te llega el aviso "Tu plan se canceló…". Para volver, elegí un plan.

**Tu marca en la portada (solo PRO):**

1. En **Mi perfil**, en la sección **Tu marca en la home**, subí tu logo (PNG, WEBP o JPG) y, si
   querés, una frase de hasta 60 caracteres y un color.
2. Tocá **Guardar mi marca**. Si no subís logo, se usa tu foto de perfil.

En la cinta de sponsors aparecen primero los proveedores que cargaron logo propio.

**Analítica del negocio (PRO, se ve en Inicio):** resume los últimos 30 días.

- Ventas cobradas y pedidos.
- Los 8 **elementos más pedidos**.
- **Consultas de tu rubro:** las búsquedas relacionadas con lo que vendés.
- **Te encontraron en:** las búsquedas donde apareció tu negocio.

*Fuente: `proveedor/plan.tsx`, `proveedor/perfil.tsx`, `src/lib/plans.ts`.*

### 4.10 Mi perfil

- **Datos del negocio:** nombre (obligatorio), tipo de negocio (18 rubros), CUIT, descripción,
  dirección y ciudad.
- **Foto, plan y verificación:** foto del negocio, el estado de tu plan y el acceso a la
  verificación.
- **Marca en la portada:** solo PRO (ver 4.9).
- **Email y celular** *(D26)*: la misma tarjeta que el cliente (2.12): verificado o sin verificar, y
  **Verificar** el email con un código.
- **Avisos por mail:** interruptor "Recibir avisos por mail" (te compraron o reservaron, te pagaron
  por MP, te piden devolver materiales). Ver "Lo básico para todos".
- Al final: **Eliminar mi cuenta** (ver "Lo básico para todos"). Si tenés un plan pago activo,
  primero cancelá la suscripción desde tu cuenta de Mercado Pago. Al eliminarla se quita todo tu
  stock publicado.

*Fuente: `proveedor/perfil.tsx`.*

### 4.11 Reseñas

- **Quién te califica:** los clientes, cuando **les entregaste o cobraste una compra**, o al
  **finalizar una obra** en la que se usaron tus materiales.
- **Vos no reseñás a nadie.**
- **Dónde se ven:** en tu perfil público.

### 4.12 Tu perfil público (lo que ven los demás)

- **Datos:** nombre del negocio, verificación, rubro y **"★ Recomendado"** si tenés PRO.
- **Ubicación y reputación:** ciudad, atajo **"★ 4,5 · 12 reseñas"** que baja hasta tus reseñas
  (ver 1.5) y cantidad de elementos publicados.
- **Catálogo con stock:** el buscador y los rubros quedan arriba; los materiales van en una **caja
  con scroll propio** (alto máximo ≈ 60 % de la pantalla en el celular, 520 px en la compu), así la
  página no se hace eterna con catálogos grandes. Cada material tiene su botón **Al carrito** (o
  "Sin stock"). *(24/09/2026.)*
- **Reseñas:** con fotos.
- **Contactar:** los clientes te escriben con el botón **Contactar**.

*Fuente: `src/components/screens/provider-profile.tsx`.*

---

## Finanzas (profesional y proveedor) *(D24, 25/09/2026)*

Pedido de Leonardo: "una sección de finanzas donde pueden ver su estado de resultado, su balance,
con todas las métricas […] donde la facturación se carga automáticamente, pero que se pueda cargar
los gastos, costos, inversiones […] explicando cada concepto". Está en **Panel → Finanzas** del
profesional (`/panel/profesional/finanzas`) y del proveedor (`/panel/proveedor/finanzas`); en el
celular, dentro de **Más**. Es **gratis en todos los planes** (Básico y PRO del proveedor; el
profesional no paga). Si tenés los dos roles, cada uno tiene sus finanzas separadas.

**Qué se carga solo** (dice **"Automático · viene de HomIA"**, no se edita y se abre el origen con
"Ver origen"):

| Profesional | Proveedor |
|---|---|
| Tus facturas: lo **facturado** (cuando la emitís) y lo **cobrado** (cuando te pagan por Mercado Pago o confirmás el efectivo), con mano de obra y materiales por separado | Tus ventas y cobros: lo **facturado** (el cobro emitido al confirmar la compra o aprobar la reserva) y lo **cobrado** |
| Las devoluciones de sobrantes que le reembolsaste a un cliente (restan ventas) | Las devoluciones de sobrantes que reembolsaste (restan ventas; lo que volvió al stock deja de ser costo) |
| Los materiales que compraste en HomIA (costo directo; los asignás a una obra o marcás "No es del negocio") y lo que te reembolsaron por sobrantes | — |
| Los subcontratos que hiciste por HomIA desde tu proyecto | — |

**Lo que NO se carga solo, y por qué:** el cargo de servicio del 1% lo paga el cliente (no es tuyo
ni es gasto tuyo); las **comisiones de Mercado Pago** no llegan a HomIA (se cargan a mano en
"Comisiones bancarias y de Mercado Pago"); la **suscripción del proveedor** tampoco (HomIA no
guarda los cobros del plan): la pantalla ofrece "¿Sumamos tu plan como gasto mensual?" y la carga
solo si tocás **"Sí, cargarlo"**.

**Pestañas** (en el celular se desplazan de costado):

1. **Resumen** — Ventas netas (con la variación contra el período anterior), ganancia o pérdida,
   caja estimada y margen bruto. **"Qué mirar ahora"**: recomendaciones con el dato que las dispara
   (ej. "Tenés $ X sin cobrar hace más de 15 días", "Todavía no cargaste gastos en este período",
   "Con tu margen, necesitás vender $ X por mes para no perder"). **Métricas clave**, cada una con
   un **?** que explica qué es, cómo se calcula y qué hacer: margen bruto y neto, gastos fijos por
   mes, punto de equilibrio, ticket promedio, cantidad, días promedio de cobro, sin cobrar hace más
   de 15 días, meses de supervivencia, crecimiento mes a mes, clientes recurrentes; el profesional
   suma presupuestos aceptados y **rentabilidad por obra** (ranking); el proveedor, días de stock y
   **productos que más ganancia dejan**. Lo que no se puede calcular dice "Sin dato" y por qué.
2. **Resultados** — El estado de resultados renglón por renglón (ventas de HomIA, por fuera,
   devoluciones, ventas netas, costo directo, margen bruto, gastos fijos por categoría, resultado
   operativo, amortizaciones, intereses, resultado neto), cada uno con **"¿Qué es esto?"** y la
   cuenta hecha con tus números. Aparte, tus retiros (no son gasto). Proveedor: **Costo de tu
   mercadería** → "Cargar costos": el costo de compra de cada producto y, opcional, un margen
   estimado ("compro al X% del precio de venta") para los que no tengan costo, siempre marcado como
   estimación.
3. **Caja** — Tu **saldo inicial** (la plata del negocio al cierre de un día, se carga una vez y se
   puede corregir), caja al empezar + entró − salió = caja al terminar, "¿Por qué mi ganancia no es
   igual a mi plata?" y el gráfico de entradas y salidas por mes (con vista de tabla).
4. **Balance** — Foto a la fecha: caja, cuentas por cobrar, mercadería al costo (proveedor) y
   herramientas/vehículos menos lo amortizado; menos préstamos y cuentas a pagar = **patrimonio
   neto** ("lo que tenés − lo que debés").
5. **Movimientos** — Todo lo del período (automático y cargado por vos), con filtros; editar,
   terminar un gasto mensual ("Terminar hoy"), borrar, ver el comprobante.
6. **Aprendé** — Guía de los tres informes, qué se carga y dónde va (con ejemplo de un plomero o de
   una ferretería), glosario completo y el aviso de que no es asesoramiento impositivo.

**Cargar un movimiento** (botón **"Cargar movimiento"**): elegís qué es (ingreso por fuera de
HomIA, costo directo, compra de mercadería —proveedor—, gasto fijo, inversión, retiro, aporte,
préstamo o cuota de préstamo) y ves qué le hace a cada informe; elegís la categoría y ves qué es y
ejemplos; completás descripción, monto (se puede escribir "25.000"), fecha (no futura), si ya lo
pagaste/cobraste o lo debés, si **se repite todos los meses** (se carga una vez), medio de pago,
la obra (profesional) y la foto del comprobante (queda con un link: no aparece en ningún listado,
pero quien tenga el link la ve). Inversión: meses de vida útil (sugeridos por categoría, editables)
y cuánto se amortiza por mes. Cuota: cuánto es interés.

**Primer uso guiado** (tarjeta "Arrancá en 3 pasos" o desde Aprendé): 1) cuánta plata tiene hoy el
negocio; 2) gastos fijos del mes sugeridos por rubro (solo los que completás; los mensuales se
repiten solos); 3) herramientas o bienes que ya tenés (se amortizan y no bajan la caja porque se
pagaron antes). "Ahora no" oculta la tarjeta.

**Período:** este mes (por defecto), mes anterior, últimos 3/6/12 meses, este año o fechas a
elección; siempre se compara con el período anterior de igual largo. **"Exportar a Excel"** baja un
CSV (separador ";", montos "1.234,56") con el estado de resultados y todos los movimientos.

*Fuente: `src/components/screens/panel/finanzas/*`, `src/lib/finanzas/*`; reglas en
`LOGICA-HOMIA.md` §16.*

---

## Sugerencias (los tres roles) y bandeja del administrador *(D25, 25/09/2026)*

### Mandar una sugerencia (cliente, profesional y proveedor)

- **Dónde:** en el menú de tu panel, **Sugerencias** (cerca de Ayuda; en el celular, en **Más**).
  Es la misma pantalla en los tres roles; lo que mandás queda asociado al panel desde el que
  escribiste.
- **Arriba:** la tarjeta **Nueva sugerencia**. Al tocarla se abre el formulario:
  1. **¿Qué nos querés contar?** Elegís una de seis tarjetas, cada una con su ícono y una
     explicación corta: **Sugerencia** (una idea), **Queja** (algo que te molestó), **Mejora** (algo
     que ya existe y podría ser más fácil), **Oportunidad** (algo nuevo que HomIA podría ofrecer),
     **Problema técnico** (algo no funciona) u **Otro**.
  2. **¿Sobre qué parte de HomIA?** Una lista con las secciones de tu rol (por ejemplo Búsqueda y
     mapa, Directorio, Contratar, Proyectos, Materiales y carrito, Pedidos, Pagos y Mercado Pago,
     Facturas y cobros, Mensajes, Reseñas, Sobrantes, Calendario, Finanzas, Stock, Mi plan, Homy,
     Mi perfil, Otra). Stock y Mi plan solo aparecen para el proveedor; Contratar y Publicar
     trabajo, para el cliente; Bolsa de trabajos, para el profesional.
  3. **Título** (obligatorio, de 4 a 120 letras, con contador).
  4. **Descripción** (obligatoria, al menos 10 letras) con la ayuda "Contanos qué pasó, qué
     esperabas y qué te gustaría".
  5. **Fotos de evidencia** (opcional, hasta 4): en el celular hay dos botones, **Sacar foto**
     (abre la cámara) y **Galería**; en la computadora, **Agregar fotos**. Cada foto se ve en
     miniatura mientras sube y tiene una cruz para quitarla. Si una foto pesa mucho, la app la
     achica sola; si no se puede subir, abajo dice exactamente por qué.
  6. Si elegiste **Problema técnico**, aparece el recuadro **Se adjunta automáticamente** con lo
     que se manda para encontrar el error: la pantalla desde la que venías, tu navegador y sistema,
     el tipo de dispositivo con el tamaño de pantalla, y la fecha.
  7. **Pueden contactarme por este tema** (tildado de entrada). Si lo destildás, el equipo igual te
     responde en la app, pero no ve tu email.
  8. **Enviar.** Si falta algo, cada campo dice qué corregir y la pantalla te lleva al primero.
     Al mandar: "¡Gracias! Recibimos tu envío".
- **Tope:** hasta **10 envíos por día**. Al llegar, la tarjeta lo avisa y no deja abrir otro
  formulario hasta mañana.
- **Abajo, "Mis envíos":** cada envío con su tipo y sección, el título, la fecha, el **estado**
  (Recibida, En revisión, Planificada, Resuelta o Descartada, cada uno con su color), la
  descripción (con "Ver todo" si es larga), las fotos (se abren al tocarlas) y, cuando el equipo
  responde, el recuadro **Respuesta de HomIA** con la fecha.
- **Cuando el equipo responde o cambia el estado** te llega un aviso a la campana y un mail
  ("Te respondimos tu sugerencia" o "Tu sugerencia está: …") con un botón que te lleva directo a
  ese envío, resaltado.
- **Privacidad:** las fotos se guardan en un almacenamiento privado: solo las ven quien las mandó
  y el equipo de HomIA, con links que vencen a los 10 minutos. Al eliminar tu cuenta se borran tus
  envíos y sus fotos.

### Bandeja del administrador

- **Quién la ve:** solo el equipo de HomIA, desde el **área de administración** (`/admin/sugerencias`,
  ver "Área de administración" más abajo, D29). Ya no está dentro del panel de ningún rol; la
  dirección vieja `/panel/admin/sugerencias` lleva sola a la nueva.
- **Qué tiene:**
  - Arriba, botones por estado con la cantidad (Todas, Recibida, En revisión, Planificada,
    Resuelta, Descartada): tocar uno filtra.
  - Un buscador por palabras (título y descripción, tolera acentos y plurales) y tres filtros:
    tipo, rol y sección. **Limpiar filtros** vuelve todo atrás.
  - La lista: tipo, rol, sección, título, autor, fecha, cantidad de fotos y estado.
  - Al tocar uno, el **detalle** (en la computadora a la derecha; en el celular reemplaza la lista,
    con "Volver a la bandeja"): autor y su rol, su email como link para escribirle **solo si
    aceptó que lo contacten**, la descripción completa, las fotos, el contexto técnico si es un
    problema, y abajo el **Estado** y la **Respuesta al usuario** con el botón **Guardar y
    avisar**. Si no cambiaste nada, no se avisa de nuevo.
- **Mail al equipo:** por cada envío nuevo llega un mail a `business@vakdor.com` con el tipo, la
  sección, el rol, el título, la descripción y un botón a la bandeja. Las fotos no se adjuntan (se
  ven en la bandeja).

*Fuente: `src/components/screens/panel/sugerencias.tsx`, `admin-sugerencias.tsx`,
`src/lib/feedback.ts`.*

---

## Métricas: qué se registra y el panel del administrador *(D27, 25/09/2026)*

### Qué registra HomIA de cada visita (todos los usuarios y los visitantes)

Desde el 25/09/2026 HomIA lleva **su propio registro de uso** (sin Google Analytics ni ninguna
herramienta de afuera). No cambia nada de lo que la persona ve ni hace: no hay carteles ni demoras.

- **Qué se anota:** cada pantalla que se abre (sin el número del proyecto o pedido: "Proyecto de
  cliente"), cada botón o link que se toca (con su nombre: "Publicar trabajo", "Pagar con Mercado
  Pago"), cada envío al servidor (qué acción y si salió bien o dio error, nunca lo que se mandó),
  las ventanas que se abren, las búsquedas (qué se buscó, con qué filtros y cuántos resultados
  hubo), los errores de la app y **el tiempo de uso real** (solo cuenta mientras la pestaña está a
  la vista y la persona la está usando; a los 5 minutos sin tocar nada deja de contar). También
  el tipo de dispositivo (celu o compu, navegador, sistema), el tamaño de la pantalla y de dónde
  llegó (por ejemplo "google.com" o una campaña con `utm_source`).
- **Qué NUNCA se anota:** lo que se escribe en los formularios (nombres, direcciones, montos,
  contraseñas), el texto de los mensajes, ni datos de pago. Si un botón muestra un nombre o un
  título largo (por ejemplo la tarjeta de un profesional), se guarda solo "abrió un perfil de
  profesional" y cuál, no el texto.
- **Del servidor:** cada ingreso (y los intentos fallidos: solo si la cuenta existía, nunca el
  email tipeado ni la contraseña), cada cierre de sesión, cada registro completo, cada pedido y
  cambio de plan del proveedor y cada descarga de una factura en PDF.
- **Visitante → cuenta:** el navegador recibe un número al azar (`homia_anon_id`). Si esa persona
  después se registra o ingresa, lo que hizo como visitante queda unido a su cuenta: así se ve el
  camino "entró por Google → miró el directorio → se registró → contrató". Al cerrar sesión el
  número se cambia por uno nuevo.
- **Lo demás no se duplica:** proyectos, facturas, pagos, pedidos, reseñas, mensajes y ofertas ya
  quedan guardados con su usuario y su fecha; las métricas de negocio se calculan desde ahí.
- **Privacidad:** está explicado en la Política de Privacidad (versión del 25/09/2026). Al eliminar
  la cuenta se borra su registro de uso.

### Área de administración `/admin` *(D29, 25/09/2026)*

- **Cómo se entra:** escribiendo `www.somoshomia.com/admin`. Aparece la pantalla **Administración
  HomIA** con email y contraseña: son los del equipo (`ADMIN_EMAIL` y `ADMIN_PASSWORD`, cargados en
  el servidor), **no** una cuenta de cliente, profesional ni proveedor. No hay botón en los paneles
  de los usuarios.
- **Si falla:** "Email o contraseña incorrectos" (nunca dice cuál de los dos). Después de 5 intentos
  fallidos desde la misma conexión: "Demasiados intentos. Esperá 15 minutos". Si las variables no
  están cargadas: "El acceso de administración no está configurado".
- **Adentro:** arriba "HomIA · Administración", el menú **Métricas** y **Sugerencias**, y el botón
  **Salir**. `/admin` abre Métricas. La sesión de administración dura 12 horas y es aparte de la de
  usuario: se puede estar como usuario y como administración a la vez sin que se mezclen.
- **Direcciones viejas:** `/panel/admin/metricas` y `/panel/admin/sugerencias` llevan solas a las
  nuevas (sirve para los mails viejos al equipo).
- **Respuestas a sugerencias:** le llegan al usuario firmadas como "Equipo HomIA".

### Panel de métricas del administrador (`/admin/metricas`)

- **Quién lo ve:** solo quien entró al área de administración (arriba). Sin esa sesión, las APIs
  responden "no existe".
- **Arriba:** pestañas **Usuarios · Uso · Embudos · Retención · Negocio · Fichas**; el período
  (**Hoy, 7 días, 30 días, 90 días o Rango** con fecha desde/hasta) y la casilla **Excluir cuentas
  demo y de prueba** (prendida: saca las cuentas `@homia.test` y los navegadores de las pruebas).
  Si todavía no hay uso registrado lo dice: "se registra desde el 25/09/2026".
- **Usuarios:** cuentas por rol, nuevas por día, bajas, activos del último día / 7 días / 30 días,
  cuántos iniciaron sesión (y los ingresos fallidos), verificados (DNI, email, celular),
  proveedores por plan (Prueba, Básico, PRO, Vencido) y cuántos pagan, y "cómo nos conocieron".
- **Uso:** sesiones, visitantes únicos, duración promedio y mediana (tiempo activo real), horas
  totales, pantallas por sesión, pantallas más usadas, botones más tocados, acciones (con cuántas
  salieron bien y cuántas con error), ventanas abiertas, dispositivos, orígenes y campañas, horario
  de uso por hora, búsquedas más frecuentes y **búsquedas sin resultado** (qué pide la gente que
  todavía no hay: oportunidades de catálogo), errores de la app y uso de Homy (consultas, costo,
  demora, por puerta y resultado).
- **Embudos:** visita → registro → primer proyecto o compra; cliente: registro → publicó un
  trabajo → contrató → pagó; profesional: registro → primera oferta → primer proyecto → primera
  factura cobrada; proveedor: registro → cargó stock → primera venta cobrada → plan pago. Cada paso
  con el porcentaje respecto del anterior y del inicio.
- **Retención:** por semana de registro (las últimas 8), qué porcentaje volvió a usar HomIA en
  cada una de las 8 semanas siguientes. Casillero más oscuro = más gente volvió.
- **Negocio:** proyectos creados (por estado), trabajos publicados, ofertas y aceptadas, facturas
  emitidas y facturado, cobrado en facturas, volumen de materiales cobrado, ventas y ticket
  promedio, cobrado por Mercado Pago, **cargo de servicio del 1% recaudado**, pedidos y sub-pedidos
  por estado, reseñas y promedio de estrellas, mensajes y conversaciones, devoluciones y
  reembolsado, sugerencias y la actividad por día.
- **Fichas:** buscar a un usuario por email o nombre y ver su ficha: datos de la cuenta, sesiones
  con su duración, tiempo total de uso, **línea de tiempo** que mezcla el uso (gris) con los hechos
  de negocio (azul: proyectos, ofertas, pedidos, ventas, facturas, cobros, reseñas, mensajes
  enviados —sin su texto—, devoluciones, stock, sugerencias) y la lista de **activos vinculados**.
  Tocar un activo (proyecto, pedido, factura, trabajo, conversación…) abre su ficha: **quién hizo
  qué y cuándo**.
- **Exportar:** cada tabla tiene su botón **CSV** (se abre en Excel; separador punto y coma).
- **Salud del registro:** al pie, el último evento de cada tipo, para ver que el registro sigue
  andando.

*Fuente: `src/components/screens/panel/admin-metricas.tsx`, `src/lib/analytics/*`,
`src/app/api/analytics/collect`, `src/app/api/admin/metricas/*`.*

### Ingresos de HomIA (`/admin/ingresos`) *(D30, 25/09/2026)*

- **A qué cuenta llega la plata:** las **suscripciones de los proveedores** (Básico $50.000 y PRO
  $100.000 por mes) y el **cargo de servicio del 1%** de los pagos por Mercado Pago entran a la
  **cuenta de Mercado Pago de HomIA** (la misma cuenta dueña de las dos apps, Checkout Pro y
  Suscripciones). No hay que "conectar" nada en `/admin`: la pantalla solo lee lo que ya cobró esa
  cuenta. El resto de cada venta va directo a la cuenta del proveedor o del profesional.
- **Dónde está:** en el área de administración, menú **Ingresos** (al lado de Métricas y
  Sugerencias).
- **Arriba:** una línea que aclara "Estos son los cobros registrados en HomIA; el saldo real de tu
  cuenta de Mercado Pago puede diferir por comisiones, impuestos y retenciones de Mercado Pago" (y,
  si Mercado Pago informó su comisión, cuánto fue). Pestañas **Resumen · Proveedores · Cobros de
  suscripción · Cargo 1%**; el período (**Hoy, 7 días, 30 días, 90 días, 12 meses o Rango**),
  **Día / Semana / Mes** para agrupar, y la casilla **Excluir cuentas demo y cobros de prueba**.
- **Resumen:** ingresos del período (total, suscripciones y cargo 1%, cada uno con la variación
  contra el período anterior del mismo largo), **MRR** (cuánto entra por mes con las suscripciones
  vigentes: Básicos × $50.000 + PRO × $100.000), proveedores pagando por plan, en prueba (y cuál
  vence primero), con cobro rechazado o en deuda, bajas y altas del período; el gráfico **Ingresos
  por fecha** (tocá una barra para ver el detalle); pruebas que vencen pronto; **próximos cobros
  esperados** (fecha y monto que informa Mercado Pago); ranking de **proveedores por lo que
  pagaron** y de **vendedores por cargo de servicio generado**; **churn y conversión por mes**.
- **Proveedores:** el **estado de cuenta** de cada proveedor, con filtros por estado, plan y
  búsqueda por nombre del comercio:
  - **Al día:** tiene plan pago y su último cobro aprobado fue hace 35 días o menos.
  - **En deuda:** su último intento de cobro fue rechazado, o pasaron más de 35 días sin un cobro
    aprobado. Muestra desde cuándo, cuánto debe (meses × precio del plan) y cada intento rechazado
    con fecha y motivo.
  - **Plan pago sin cobro registrado:** alta manual o demo, o el primer cobro todavía no llegó.
  - **En prueba:** con los días que le quedan y la fecha en que vence ("vence hoy" = 0 días).
  - **Prueba vencida sin plan:** terminó la prueba y nunca pagó.
  - **Dado de baja:** tuvo plan pago y hoy no (canceló o pausó la suscripción en Mercado Pago, o se
    dio de baja por falta de pago), con fecha y motivo; si se fue con un mes ya pagado, lo avisa.
  Tocando un proveedor se abre su **ficha de cuenta**: datos, plan, total pagado, último cobro,
  hasta cuándo tiene pago, la suscripción en Mercado Pago (activa, pausada, cancelada, próximo
  cobro) y el **historial completo** (alta, fin de la prueba, cada cobro aprobado o rechazado,
  cambios de plan, bajas y reactivaciones, con fecha y monto), más el botón **Ver su uso en
  Métricas**. Debajo: gráfico de **altas, primeras suscripciones y bajas**, la tabla **Movimiento
  por fecha** (altas, primeras suscripciones pagas, reactivaciones, bajas, cambios de plan, neto e
  ingresos) y **churn y conversión por mes**.
- **Cobros de suscripción:** cada cobro con fecha, proveedor, plan, monto, estado (aprobado,
  rechazado, pendiente, reembolsado…), motivo del rechazo, comisión y neto de Mercado Pago (si los
  informó), el **id del pago de Mercado Pago** (se copia con un toque) y si fue de producción o de
  prueba. Filtros por estado, plan y proveedor.
- **Cargo 1%:** cada factura, cobro de materiales o compra pagada por Mercado Pago con vendedor,
  comprador, subtotal, el cargo según HomIA y el que informó Mercado Pago (desde el 25/09/2026).
- **Exportar:** cada tabla tiene su **CSV** para el contador (separador punto y coma, fechas y
  decimales argentinos; respeta los filtros).
- **Desde cuándo hay datos:** los cobros se traen de Mercado Pago (también los anteriores); los
  movimientos del plan (altas pagas, cambios, bajas) se registran en vivo desde el 25/09/2026 y lo
  anterior se reconstruyó con las fechas de Mercado Pago. La pantalla lo dice al pie.

*Fuente: `src/components/screens/admin/admin-ingresos.tsx`, `src/lib/ingresos-admin.ts`,
`src/lib/suscripciones-core.ts`, `src/app/api/admin/ingresos/*`.*

---

## 5. Cosas que hoy la app promete distinto de lo que hace

Estas diferencias salen de comparar los textos de la app con lo que realmente hace. No se
corrigieron; quedan anotadas para decidir.

| Qué dice la app | Qué hace | Dónde |
|---|---|---|
| El CRM del proveedor es un "historial" de compras de profesionales (tour) | Es un tablero manual de tratos | `tour-content.ts:280` |
| "Después podés sumar otros perfiles" (registro) | No hay forma de sumar un perfil después | `auth-register.tsx:258` |
| El recorrido guiado "se arranca solo en tu primer ingreso" | No arranca solo | `help-screen.tsx:203`; `tour-overlay.tsx:4-6` |
| Botón "Conectá Mercado Pago" (ayuda y tour del proveedor) | El botón dice "Conectar Mercado Pago" | `help-screen.tsx:87`; `tour-content.ts:264` |
| Al volver de pagar un cobro de materiales del proyecto con Mercado Pago | No aparece aviso de "confirmando pago" (sí en Facturas y en Mis pedidos) | `cliente/proyecto-detalle.tsx` |

Corregido el 24/09 (commit `2eed864`): el pago de facturas ahora sí va a la cuenta del profesional;
la regla de chat ya se decide por el destinatario; el perfil del cliente muestra "Tu DNI está en
revisión"; "Volver a ofertar" muestra el formulario; Mis pedidos avisa al volver de Mercado Pago.
