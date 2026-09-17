-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0011 Seed: catálogo estándar de materiales
-- Categorías + baseline de elementos canónicos (nombre único + aliases
-- para el matching de Homy). Es catálogo de PRODUCTO (no data de prueba):
-- los proveedores cuelgan su precio/stock sobre estos elementos y Homy
-- propone altas nuevas para elementos faltantes.
-- ═══════════════════════════════════════════════════════════════════

insert into public.material_categories (slug, name, position) values
  ('plomeria',          'Plomería',              1),
  ('electricidad',      'Electricidad',          2),
  ('albanileria',       'Albañilería',           3),
  ('pintura',           'Pintura',               4),
  ('gas',               'Gas',                   5),
  ('carpinteria',       'Carpintería',           6),
  ('impermeabilizacion','Impermeabilización',    7),
  ('climatizacion',     'Climatización',         8),
  ('herrajes',          'Herrajes y fijaciones', 9),
  ('iluminacion',       'Iluminación',          10),
  ('jardin',            'Jardín y exterior',    11),
  ('limpieza',          'Limpieza y terminación', 12)
on conflict (slug) do nothing;

with c as (select id, slug from public.material_categories)
insert into public.standard_elements (category_id, canonical_name, aliases, unit) values
-- ── Plomería ──
((select id from c where slug='plomeria'), 'Caño PVC 110 x 4 m', '{caño pvc,tubo pvc 110,desagüe 110}', 'unidad'),
((select id from c where slug='plomeria'), 'Codo PVC 110 90°', '{codo pvc,curva 110}', 'unidad'),
((select id from c where slug='plomeria'), 'Té PVC 110', '{te pvc,three-way 110}', 'unidad'),
((select id from c where slug='plomeria'), 'Caño Termofusión 25 mm', '{termofusion 25,caño agua 25,ppr 25}', 'm'),
((select id from c where slug='plomeria'), 'Cinta Teflón 19 mm', '{teflon,cinta selladora}', 'unidad'),
((select id from c where slug='plomeria'), 'Flexible Agua Caliente 40 cm', '{flexible,flexible instalacion,flexibles de agua}', 'par'),
((select id from c where slug='plomeria'), 'Grifería Monocomando Cocina', '{mono comando cocina,griferia cocina}', 'unidad'),
((select id from c where slug='plomeria'), 'Grifería Monocomando Lavatorio', '{mono comando lavatorio,griferia bano}', 'unidad'),
((select id from c where slug='plomeria'), 'Inodoro Completo', '{inodoro,bano completo,taza}', 'unidad'),
((select id from c where slug='plomeria'), 'Depósito de Inodoro', '{deposito,tanque inodoro,mochila}', 'unidad'),
((select id from c where slug='plomeria'), 'Válvula de Retención 1"', '{valvula antirretorno,retencion 1 pulgada}', 'unidad'),
((select id from c where slug='plomeria'), 'Llave de Paso Esférica 1/2"', '{llave paso,esferica 1/2}', 'unidad'),
((select id from c where slug='plomeria'), 'Bomba de Agua 1/2 HP', '{bomba agua,electrobomba}', 'unidad'),
((select id from c where slug='plomeria'), 'Sifón Lavatorio PVC', '{sifon,sifon bano}', 'unidad'),
((select id from c where slug='plomeria'), 'Cenefa PVC 110', '{cenefa,union 110}', 'unidad'),
-- ── Electricidad ──
((select id from c where slug='electricidad'), 'Cable Trenzado 1.5 mm²', '{cable 1.5,cable unipolar 1.5,trenzado 1.5 mm2}', 'm'),
((select id from c where slug='electricidad'), 'Cable Trenzado 2.5 mm²', '{cable 2.5,cable unipolar 2.5,trenzado 2.5 mm2}', 'm'),
((select id from c where slug='electricidad'), 'Cable Trenzado 4 mm²', '{cable 4,cable unipolar 4}', 'm'),
((select id from c where slug='electricidad'), 'Llave Simple', '{llave de luz,llave electrica simple}', 'unidad'),
((select id from c where slug='electricidad'), 'Tomacorriente 16 A', '{toma 16 amperes,enchufe doble}', 'unidad'),
((select id from c where slug='electricidad'), 'Térmica Bipolar 25 A', '{termica 25,llave termica 25a}', 'unidad'),
((select id from c where slug='electricidad'), 'Disyuntor 30 mA Bipolar', '{disyuntor,diferencial 30ma}', 'unidad'),
((select id from c where slug='electricidad'), 'Caja de Luz 12 Módulos', '{caja luminarias,tablero 12 modulos}', 'unidad'),
((select id from c where slug='electricidad'), 'Módulo Pasacable', '{pasacable,modulo embellecedor}', 'unidad'),
((select id from c where slug='electricidad'), 'Cinta Aisladora 19 mm', '{cinta aislante,cinta negra}', 'unidad'),
((select id from c where slug='electricidad'), 'Caño Corrugado 20 mm', '{corrugado,manguito electrico}', 'm'),
((select id from c where slug='electricidad'), 'Caja Octogonal 3/4"', '{caja octogonal,caja embutir}', 'unidad'),
-- ── Albañilería ──
((select id from c where slug='albanileria'), 'Cemento Portland 50 kg', '{cemento,cemento portland,loma negra}', 'bolsa'),
((select id from c where slug='albanileria'), 'Cal en Polvo 25 kg', '{cal,cal aerea}', 'bolsa'),
((select id from c where slug='albanileria'), 'Yeso 20 kg', '{yeso,yeso para endurecer}', 'bolsa'),
((select id from c where slug='albanileria'), 'Ladrillo Común 8 agujeros', '{ladrillos,ladri comunes}', 'unidad'),
((select id from c where slug='albanileria'), 'Ladrillo Hueco 12 cm', '{ladrillo hueco,ladrillon}', 'unidad'),
((select id from c where slug='albanileria'), 'Arena Fina', '{arena para endurecer,arena fina bolsa}', 'm3'),
((select id from c where slug='albanileria'), 'Arena Gruesa', '{arena gruesa,piedra arena}', 'm3'),
((select id from c where slug='albanileria'), 'Piedra Bola 20-40 mm', '{piedra,baliza}', 'm3'),
((select id from c where slug='albanileria'), 'Placa de Yeso 9.5 mm', '{durlock,placa yeso,drywall}', 'unidad'),
((select id from c where slug='albanileria'), 'Perfilería de Hierro 35x35', '{perfil durlock,bulon de hierro}', 'm'),
((select id from c where slug='albanileria'), 'Plástico de Estante', '{plastico de estante,nylon de estante}', 'm2'),
-- ── Pintura ──
((select id from c where slug='pintura'), 'Látex Interior 20 L', '{latex interior,pintura interior 20 litros}', 'unidad'),
((select id from c where slug='pintura'), 'Látex Exterior 20 L', '{latex exterior,pintura exterior}', 'unidad'),
((select id from c where slug='pintura'), 'Esmalte Sintético 4 L', '{esmalte,pintura sintetica}', 'unidad'),
((select id from c where slug='pintura'), 'Enduido 20 kg', '{enduido,masilla para alisar}', 'bolsa'),
((select id from c where slug='pintura'), 'Sellador Acuoso 4 L', '{sellador,fijador}', 'unidad'),
((select id from c where slug='pintura'), 'Rodillo 22 cm', '{rodillo pintura,rodillo lana}', 'unidad'),
((select id from c where slug='pintura'), 'Pincel 2"', '{pincel 2 pulgadas,brocha}', 'unidad'),
((select id from c where slug='pintura'), 'Cinta de Papel 24 mm', '{cinta papel,cinta de pintor}', 'unidad'),
((select id from c where slug='pintura'), 'Batea de Pintor', '{batea,balde pintura}', 'unidad'),
-- ── Gas ──
((select id from c where slug='gas'), 'Caño Gas 3/8"', '{cano gas,tubo gas 3/8}', 'm'),
((select id from c where slug='gas'), 'Teflón para Gas', '{cinta teflon gas,teflon especial}', 'unidad'),
((select id from c where slug='gas'), 'Llave de Gas 1/2"', '{llave gas,paso gas}', 'unidad'),
((select id from c where slug='gas'), 'FLEXIBLE Gas 1 m', '{flexible gas,flexible estufa}', 'unidad'),
((select id from c where slug='gas'), 'Regulador de Gas 10 kg', '{regulador,regulador garrafa}', 'unidad'),
-- ── Carpintería ──
((select id from c where slug='carpinteria'), 'MDF 18 mm 1.83×2.44', '{mdf 18,madera mdf}', 'unidad'),
((select id from c where slug='carpinteria'), 'Tablero Fenólico 18 mm', '{fenolico,tablero fenolico,fenolico 18}', 'unidad'),
((select id from c where slug='carpinteria'), 'Madera Pino Listado 25 mm', '{pino listado,taco pino}', 'm2'),
((select id from c where slug='carpinteria'), 'Bisagra de Mueble', '{bisagra de mueble,bisagras para mueble}', 'par'),
((select id from c where slug='carpinteria'), 'Tornillo Autoperforante 3×16', '{autoperforante,tornillos 3x16}', 'caja'),
((select id from c where slug='carpinteria'), 'Cola de Vinilo 1 L', '{cola vinilica,adhesivo madera}', 'unidad'),
-- ── Impermeabilización ──
((select id from c where slug='impermeabilizacion'), 'Membrana Rígida 20 kg', '{membrana rigida,membrana cementicia}', 'bolsa'),
((select id from c where slug='impermeabilizacion'), 'Membrana Líquida 4 L', '{membrana liquida,membrana acrilica}', 'unidad'),
((select id from c where slug='impermeabilizacion'), 'Rollo de Membrana 35 kg', '{membrana rollo,membrana asfaltica}', 'rollo'),
((select id from c where slug='impermeabilizacion'), 'Primer Asfáltico 4 L', '{primer,imprimante asfaltico}', 'unidad'),
((select id from c where slug='impermeabilizacion'), 'Sellador para Techos 1 L', '{sellador techos,masilla techo}', 'unidad'),
-- ── Climatización ──
((select id from c where slug='climatizacion'), 'Split 3000 Frío/Calor', '{aire 3000,split frio calor}', 'unidad'),
((select id from c where slug='climatizacion'), 'Tubería de Cobre 1/4"', '{tuberia split,cobre 1/4}', 'm'),
((select id from c where slug='climatizacion'), 'Soporte para Split', '{soporte aire,soportes split}', 'par'),
((select id from c where slug='climatizacion'), 'Estufa a Gas 5000 kcal', '{estufa,estufa gas natural}', 'unidad'),
-- ── Herrajes ──
((select id from c where slug='herrajes'), 'Tarugo 8 mm', '{tarugos,fischer 8}', 'caja'),
((select id from c where slug='herrajes'), 'Tornillo 1" 8 mm', '{tornillos 1 pulgada,tornillo fischer}', 'caja'),
((select id from c where slug='herrajes'), 'Clavos 2"', '{clavos,clavos carpintero}', 'kg'),
((select id from c where slug='herrajes'), 'Alambre de Amarre 16', '{alambre,alambre dulce}', 'kg'),
((select id from c where slug='herrajes'), 'Bisagra Puerta 3.5"', '{bisagra puerta,bisagras de bronce}', 'par'),
((select id from c where slug='herrajes'), 'Cerradura de Embutir', '{cerradura,chapa embutir}', 'unidad'),
-- ── Iluminación ──
((select id from c where slug='iluminacion'), 'Lámpara LED 9 W E27', '{lampara led 9w,bombillo led}', 'unidad'),
((select id from c where slug='iluminacion'), 'Panel LED 24 W', '{panel led,plafon led}', 'unidad'),
((select id from c where slug='iluminacion'), 'Spot LED Empotrable', '{spot,empotrable led,dicroica led}', 'unidad'),
((select id from c where slug='iluminacion'), 'Reflector LED Exterior', '{reflector,proyector led}', 'unidad'),
-- ── Jardín ──
((select id from c where slug='jardin'), 'Manguera 15 m', '{manguera riego,manguera jardin}', 'unidad'),
((select id from c where slug='jardin'), 'Césped en Panes', '{cesped,panes de cesped}', 'm2'),
((select id from c where slug='jardin'), 'Tierra Vegetal', '{tierra negra,turba}', 'm3'),
((select id from c where slug='jardin'), 'Riego por Goteo Kit', '{kit goteo,riego}', 'juego'),
-- ── Limpieza y terminación ──
((select id from c where slug='limpieza'), 'Ácido Muriático 5 L', '{muriatico,acido para pisos}', 'unidad'),
((select id from c where slug='limpieza'), 'Papel Glass 220', '{papel glass,lija 220}', 'pliego'),
((select id from c where slug='limpieza'), 'Trapo de Algodón', '{trapo,trapos de piso}', 'unidad')
on conflict do nothing;

-- Nota: los proveedores cargan precios y stock sobre estos elementos vía
-- provider_stock. Si un elemento falta, Homy lo propone con su categoría
-- y aliases; la curaduría final queda para el equipo (service role).
