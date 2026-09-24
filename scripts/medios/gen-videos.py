#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de videitos explicativos HomIA (T31)
- Slides de marca renderizados con PIL (1280x720, glass navy + acentos)
- Locución en ESPAÑOL RIPLATENSE con edge-tts (voces Microsoft es-AR/Elena y
  es-AR/Tomás — el z-ai TTS interno lee el español con acento inglés: descartado)
- Ensamblado con ffmpeg: segmentos con fade + concat + faststart
Salida: public/videos/<id>.mp4 + <id>.jpg (poster)
Reanudable: si el png/mp3/segmento ya existe, se reutiliza.
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path('/home/z/my-project')
WORK = ROOT / 'scripts' / 'videos-work'
OUT = ROOT / 'public' / 'videos'
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

NAVY = (10, 37, 64)
NAVY2 = (13, 48, 80)
NAVY3 = (20, 64, 107)
CYAN = (0, 196, 255)
ORANGE = (255, 90, 31)
GOLD = (255, 199, 0)
WHITE = (255, 255, 255)
SOFT = (214, 231, 246)

ROLE_ACCENT = {'cliente': CYAN, 'profesional': ORANGE, 'proveedor': GOLD}
ROLE_LABEL = {'cliente': 'CLIENTE', 'profesional': 'PROFESIONAL', 'proveedor': 'PROVEEDOR'}

# Voces nativas es-AR (rioplatense) — Elena para cliente, Tomás para pro/prov
VOICE_FOR_ROLE = {
    'cliente': 'es-AR-ElenaNeural',
    'profesional': 'es-AR-TomasNeural',
    'proveedor': 'es-AR-TomasNeural',
}
TTS_RATE = '-4%'  # levemente más pausado para tutorial

# ---------------------------------------------------------------- VIDEOS ----
V = []

V.append({'id': 'cli-bienvenida', 'role': 'cliente', 'title': 'Bienvenido a HomIA',
 'desc': 'Qué es HomIA, los tres roles y tu ruta recomendada para arrancar.',
 'slides': [
  {'kicker': 'TU HOGAR, EN ORDEN', 'title': 'Bienvenido a HomIA',
   'bullets': ['Publicás lo que tu hogar necesita', 'Profesionales y proveedores verificados responden', 'El pago queda protegido hasta que aprobás'],
   'narr': 'Bienvenido a HomIA, la plataforma donde tu hogar se arregla de punta a punta. Publicás lo que necesitás, los profesionales y proveedores verificados te responden, y el pago queda protegido hasta que vos aprobás el trabajo.'},
  {'kicker': 'TRES ROLES, UN EQUIPO', 'title': 'Cómo te acompaña cada rol',
   'bullets': ['El profesional hace el trabajo', 'El proveedor vende los materiales', 'Vos decidís, aprobás y pagás con tranquilidad'],
   'narr': 'En HomIA trabajan tres roles. El profesional hace el trabajo. El proveedor vende los materiales. Y vos, como cliente, decidís, aprobás y pagás con tranquilidad, porque el dinero queda reservado hasta que aprobás el resultado.'},
  {'kicker': 'PARA NO TRABARTE', 'title': 'Tu ruta recomendada',
   'bullets': ['Completá tu perfil y verificá tu DNI', 'Publicá tu necesidad o usá el buscador', 'Compará, contratá y calificá'],
   'narr': 'Tu ruta recomendada: primero completá tu perfil y verificá tu identidad con tu DNI. Después publicá tu necesidad o buscá directo en el directorio. Compará las respuestas, contratá y al final dejá tu reseña. Y si te trabás en algo, el botón de ayuda de abajo a la derecha siempre está a tu alcance.'},
 ]})

V.append({'id': 'cli-contratar', 'role': 'cliente', 'title': 'Publicar y contratar',
 'desc': 'De contarle a Homy qué necesitás hasta contratar con pago protegido.',
 'slides': [
  {'kicker': 'PASO 1', 'title': 'Contale a Homy qué necesitás',
   'bullets': ['Escribí con tus palabras en la barra', 'El agente IA entiende tu pedido y te guía', 'También podés publicar un trabajo formal'],
   'narr': 'Todo arranca contándole a Homy qué necesita tu hogar, con tus palabras. El agente de inteligencia artificial entiende tu pedido y te guía. Si preferís, publicás un trabajo formal desde tu panel.'},
  {'kicker': 'PASO 2', 'title': 'Compará con datos reales',
   'bullets': ['Reseñas de trabajos verdaderos', 'Precio promedio de los presupuestos', 'Identidad verificada con DNI'],
   'narr': 'Cuando llegan las respuestas, comparás con datos reales: reseñas de trabajos verdaderos, el precio promedio de los presupuestos y el sello de identidad verificado con DNI. Así elegís con confianza.'},
  {'kicker': 'PASO 3', 'title': 'Contratá en dos minutos',
   'bullets': ['Tocá Contratar en su perfil', 'Definí acuerdo, precio y forma de pago', 'El dinero queda protegido hasta tu aprobación'],
   'narr': 'Contratar toma dos minutos: tocás Contratar en el perfil, definís el acuerdo con el precio y la forma de pago, y el dinero queda protegido. El profesional cobra cuando vos aprobés el trabajo.'},
  {'kicker': 'PASO 4', 'title': 'Pagá como quieras',
   'bullets': ['Mercado Pago, protegido de punta a punta', 'O efectivo, con acuerdo visible para los dos', 'La factura se descarga en PDF'],
   'narr': 'Podés pagar con Mercado Pago, protegido de punta a punta, o en efectivo si lo acordás: queda registrado para los dos. Y al terminar, la factura se descarga en PDF desde tu panel.'},
 ]})

V.append({'id': 'cli-materiales', 'role': 'cliente', 'title': 'Materiales: los dos modos',
 'desc': 'Modo A: el profesional adelanta. Modo B: vos pagás los materiales al proveedor.',
 'slides': [
  {'kicker': 'ANTES DE LA OBRA', 'title': '¿Quién compra los materiales?',
   'bullets': ['Modo A: el profesional adelanta todo', 'Modo B: vos pagás los materiales al proveedor', 'Se define antes de arrancar y queda claro'],
   'narr': 'Antes de la obra se define quién compra los materiales, y HomIA lo deja claro para todos. En el modo A, el profesional adelanta los materiales y después te cobra todo junto. En el modo B, vos le pagás el trabajo al profesional y los materiales directamente al proveedor.'},
  {'kicker': 'MODO A', 'title': 'El profesional adelanta',
   'bullets': ['Él compra y paga los materiales', 'Te cobra materiales y mano de obra juntos', 'Todo detallado en una sola factura'],
   'narr': 'En el modo A, el profesional compra y paga los materiales, y al final te cobra materiales y mano de obra en un solo cobro, detallado en la factura.'},
  {'kicker': 'MODO B', 'title': 'Vos pagás al proveedor',
   'bullets': ['Le pagás el trabajo al profesional', 'Los materiales, directo al proveedor', 'El proveedor emite tu cobro desde su panel'],
   'narr': 'En el modo B, le pagás el trabajo al profesional, y los materiales los pagás directamente al proveedor, que te emite el cobro desde su panel. Dos pagos separados, claros y con comprobante.'},
 ]})

V.append({'id': 'cli-resenas', 'role': 'cliente', 'title': 'Reseñas y mensajes',
 'desc': 'Cuándo y dónde se deja la reseña, y por qué el chat arranca por vos.',
 'slides': [
  {'kicker': 'AL FINALIZAR', 'title': 'Tu reseña vale oro',
   'bullets': ['Solo quien tuvo un trabajo terminado reseña', 'Estrellas, comentario y fotos', 'Ayudás a decidir a toda la comunidad'],
   'narr': 'Cuando el trabajo termina, te invitamos a dejar tu reseña: estrellas, comentario y fotos si querés. Solo puede reseñar quien realmente tuvo un trabajo terminado, por eso las reseñas son de confianza.'},
  {'kicker': 'DÓNDE', 'title': 'Se deja desde tu panel',
   'bullets': ['Trabajos, trabajo finalizado, Dejar reseña', 'Una para el profesional y otra para el proveedor', 'El promedio de los perfiles sale de ahí'],
   'narr': 'La dejás desde tu panel, en la sección Trabajos, cuando el trabajo figura finalizado. Podés reseñar al profesional y también al proveedor de materiales. El promedio que ves en los perfiles sale de ahí.'},
  {'kicker': 'MENSAJES', 'title': 'El chat arranca por vos',
   'bullets': ['Vos sos quien escribe primero', 'Nadie te molesta sin permiso', 'Bandeja de entrada estilo chat'],
   'narr': 'En los mensajes, el cliente siempre escribe primero. Los profesionales y proveedores no pueden iniciarte una conversación de la nada: responden cuando vos les escribís. Tu bandeja funciona como un chat, simple y directo.'},
 ]})

V.append({'id': 'pro-bienvenida', 'role': 'profesional', 'title': 'Tu cuenta profesional',
 'desc': 'Tu vidriera, la verificación con DNI y el plan PRO.',
 'slides': [
  {'kicker': 'TU VIDRIERA', 'title': 'Un perfil que vende solo',
   'bullets': ['Foto, oficios y zonas de trabajo', 'Trabajos realizados con fotos', 'Reseñas reales de tus clientes'],
   'narr': 'Tu perfil es tu vidriera: foto, oficios, zonas de trabajo, tus trabajos realizados con fotos y las reseñas reales de tus clientes. Cuanto más completo, más te contratan.'},
  {'kicker': 'CONFIANZA', 'title': 'Verificá tu identidad',
   'bullets': ['Subí tu DNI: frente y dorso', 'La IA lo analiza y te da el check', 'Los verificados son los más elegidos'],
   'narr': 'Subí tu DNI, frente y dorso, y la inteligencia artificial lo analiza para darte el check de verificado. Los perfiles verificados son los que más eligen los clientes.'},
  {'kicker': 'PLAN PRO', 'title': 'Más visibilidad, más trabajo',
   'bullets': ['Prioridad en el directorio', 'Sello PRO en tu tarjeta', 'Estadísticas de tu actividad'],
   'narr': 'Y si querés escalar, el plan PRO te da prioridad en el directorio, sello distintivo y estadísticas de tu actividad.'},
 ]})

V.append({'id': 'pro-presupuestos', 'role': 'profesional', 'title': 'Presupuestos y trabajos',
 'desc': 'De la oportunidad al trabajo aprobado y cobrado.',
 'slides': [
  {'kicker': 'LA BANDEJA', 'title': 'Oportunidades en tiempo real',
   'bullets': ['Publicaciones de clientes cerca tuyo', 'Filtrá por oficio y zona', 'Ofrecé con tu precio y plazo'],
   'narr': 'En la bandeja de oportunidades ves las publicaciones de clientes cerca tuyo. Filtrás por oficio y zona, y ofrecés con tu precio y plazo. La propuesta llega directo al cliente.'},
  {'kicker': 'EL TRATO', 'title': 'Acuerdo claro, pago protegido',
   'bullets': ['El cliente acepta tu presupuesto', 'El dinero entra en escrow, reservado', 'Arrancás el trabajo tranquilo'],
   'narr': 'Cuando el cliente acepta tu presupuesto, el dinero entra en escrow: queda reservado para vos. Arrancás el trabajo tranquilo, sabiendo que está pagado.'},
  {'kicker': 'EN OBRA', 'title': 'Materiales sin vueltas',
   'bullets': ['Pedí materiales al proveedor desde la app', 'El cliente aprueba las compras', 'Modo A o modo B, siempre claro'],
   'narr': 'Durante la obra podés pedir materiales al proveedor desde la app, y el cliente los aprueba. Según el acuerdo, adelantás vos los materiales o los paga directo el proveedor. Siempre queda claro quién paga qué.'},
  {'kicker': 'AL TERMINAR', 'title': 'Entregá y cobrá',
   'bullets': ['Marcá el trabajo como finalizado', 'El cliente aprueba el resultado', 'Liberamos tu dinero'],
   'narr': 'Al terminar, marcás el trabajo como finalizado, el cliente aprueba el resultado y liberamos tu dinero. Después, la factura queda lista para descargar en PDF.'},
 ]})

V.append({'id': 'pro-cobros', 'role': 'profesional', 'title': 'Cobrar con protección',
 'desc': 'Escrow, efectivo registrado y el modo A con todo junto.',
 'slides': [
  {'kicker': 'ESCROW', 'title': 'Tu plata, reservada',
   'bullets': ['El cliente paga antes de que empieces', 'HomIA retiene y protege el dinero', 'Se libera al aprobar tu entrega'],
   'narr': 'Con el escrow, el cliente paga antes de que empieces, HomIA retiene ese dinero protegido, y se libera para vos cuando entregás el trabajo aprobado.'},
  {'kicker': 'EFECTIVO', 'title': 'También se puede en efectivo',
   'bullets': ['Lo acordás con el cliente', 'Queda registrado para los dos', 'Confirmás cuando lo recibís'],
   'narr': 'Si el cliente prefiere efectivo, se acuerda, queda registrado para los dos, y vos confirmás cuando lo recibís. Sin papeles sueltos ni malentendidos.'},
  {'kicker': 'MODO A', 'title': 'Cobra todo junto',
   'bullets': ['Adelantaste los materiales', 'Facturás mano de obra más materiales', 'Una sola factura en PDF'],
   'narr': 'Y si el acuerdo fue modo A, donde vos adelantaste los materiales, facturás mano de obra más materiales en un solo cobro, con la factura en PDF.'},
 ]})

V.append({'id': 'pro-materiales', 'role': 'profesional', 'title': 'Materiales con proveedores',
 'desc': 'Comparador de precios y vinculaciones con tus casas de materiales.',
 'slides': [
  {'kicker': 'COMPARADOR', 'title': 'Precios de todos los proveedores',
   'bullets': ['Buscá el elemento del catálogo', 'Compará precio y disponibilidad', 'Pedilo donde convenga más'],
   'narr': 'El comparador de materiales te muestra los precios de todos los proveedores para el elemento que buscás. Comparás precio y disponibilidad, y pedís al que mejor convenga.'},
  {'kicker': 'VINCULACIONES', 'title': 'Tus proveedores de confianza',
   'bullets': ['Vinculate con tu casa de materiales', 'Historial de pedidos ordenado', 'Cuentas de retiro conectadas'],
   'narr': 'Podés vincularte con tus casas de materiales de confianza, llevar el historial de pedidos ordenado y conectar cuentas de retiro. Todo el circuito de materiales, en un solo lugar.'},
 ]})

V.append({'id': 'prv-bienvenida', 'role': 'proveedor', 'title': 'Tu negocio en HomIA',
 'desc': 'Tu stock como vidriera, verificación y vinculaciones.',
 'slides': [
  {'kicker': 'TU VIDRIERA', 'title': 'Tu stock, a la vista',
   'bullets': ['Los profesionales te encuentran solos', 'Precio y stock siempre al día', 'Ventas directas, sin intermediarios'],
   'narr': 'Tu negocio en HomIA es simple: publicás tu stock con precios, y los profesionales te encuentran cuando buscan materiales. Ventas directas, sin intermediarios.'},
  {'kicker': 'CONFIANZA', 'title': 'Verificá tu identidad',
   'bullets': ['DNI frente y dorso', 'Análisis con inteligencia artificial', 'Check verde junto a tu nombre'],
   'narr': 'Subí tu DNI y la inteligencia artificial lo verifica para darte el check verde junto a tu nombre. La confianza abre ventas.'},
  {'kicker': 'CONEXIONES', 'title': 'Vinculate con profesionales',
   'bullets': ['Cuentas de retiro conectadas', 'Historial de pedidos', 'Clientes que vuelven'],
   'narr': 'Vinculate con los profesionales que compran seguido, conectá cuentas de retiro y llevá el historial de pedidos. Tus clientes van a volver, porque comprar acá es fácil.'},
 ]})

V.append({'id': 'prv-stock', 'role': 'proveedor', 'title': 'Publicar y cuidar tu stock',
 'desc': 'Publicar elementos, estados automáticos y edición sin fricción.',
 'slides': [
  {'kicker': 'PUBLICAR', 'title': 'Tu catálogo en minutos',
   'bullets': ['Elegí el elemento del catálogo estándar', 'Precio, cantidad y stock mínimo', 'Marca opcional para diferenciarte'],
   'narr': 'Publicar un elemento toma un minuto: elegís el elemento del catálogo estándar, ponés precio, cantidad y stock mínimo, y si querés la marca. Ya estás vendiendo.'},
  {'kicker': 'AUTOMÁTICO', 'title': 'El estado se calcula solo',
   'bullets': ['Disponible, por agotar o agotado', 'Avisos cuando baja del mínimo', 'Repone en dos toques'],
   'narr': 'El estado de cada elemento se calcula solo: disponible, por agotar o agotado. Te avisamos cuando algo baja del mínimo, y repone en dos toques.'},
  {'kicker': 'ORDEN', 'title': 'Editá sin fricción',
   'bullets': ['Cambios de precio al instante', 'Sumá o restá cantidad con un toque', 'Eliminá lo que ya no vendés'],
   'narr': 'Cambiar precios es al instante, sumar o restar cantidad es un toque, y lo que ya no vendés lo eliminás. Tu vidriera siempre prolija.'},
 ]})

V.append({'id': 'prv-ventas', 'role': 'proveedor', 'title': 'Ventas y cobros',
 'desc': 'Pedidos desde la obra, cobro directo al cliente y facturas en PDF.',
 'slides': [
  {'kicker': 'PEDIDOS', 'title': 'El profesional te compra',
   'bullets': ['Pedido directo desde la obra', 'El cliente aprueba los materiales', 'Vos despachás y cobrás'],
   'narr': 'Cuando un profesional necesita materiales para su obra, te hace el pedido directo. El cliente lo aprueba, vos despachás y cobrás. Simple.'},
  {'kicker': 'MODO B', 'title': 'Cobrá directo al cliente',
   'bullets': ['Emití el cobro desde tu panel', 'El cliente paga con Mercado Pago o efectivo', 'Todo con comprobante'],
   'narr': 'En el modo B, los materiales los paga el cliente directamente a vos: emitís el cobro desde tu panel, el cliente paga con Mercado Pago o efectivo, y todo queda con comprobante.'},
  {'kicker': 'FACTURAS', 'title': 'Todo en PDF',
   'bullets': ['Facturas descargables', 'Historial completo de ventas', 'Cero planillas sueltas'],
   'narr': 'Las facturas se descargan en PDF, el historial de ventas queda completo, y las planillas sueltas se terminaron.'},
 ]})

# ---------------------------------------------------------------- helpers ---
def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def base_canvas():
    # gradiente diagonal navy
    img = Image.new('RGB', (W, H), NAVY)
    dr = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(NAVY[0] + (NAVY3[0] - NAVY[0]) * t * 0.9)
        g = int(NAVY[1] + (NAVY3[1] - NAVY[1]) * t * 0.9)
        b = int(NAVY[2] + (NAVY3[2] - NAVY[2]) * t * 0.9)
        dr.line([(0, y), (W, y)], fill=(r, g, b))
    # glows suaves
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 420, -260, W + 260, 260], fill=(0, 88, 112))
    gd.ellipse([-320, H - 320, 300, H + 280], fill=(96, 26, 0))
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    img = Image.blend(img, Image.composite(glow, img, Image.new('L', (W, H), 110)), 0.55)
    # grilla sutil
    dr = ImageDraw.Draw(img, 'RGBA')
    for x in range(0, W, 64):
        dr.line([(x, 0), (x, H)], fill=(255, 255, 255, 7))
    for y in range(0, H, 64):
        dr.line([(0, y), (W, y)], fill=(255, 255, 255, 7))
    return img


def draw_pill(dr, xy, text, font, accent, pad_x=22, pad_y=12):
    tw = dr.textlength(text, font=font)
    th = font.size
    x, y = xy
    dr.rounded_rectangle([x, y, x + tw + pad_x * 2, y + th + pad_y * 2],
                         radius=(th + pad_y * 2) // 2, fill=accent + (34,), outline=accent + (160,), width=2)
    dr.text((x + pad_x, y + pad_y), text, font=font, fill=accent)


def render_slide(video, si, slide, total_slides):
    accent = ROLE_ACCENT[video['role']]
    img = base_canvas()
    dr = ImageDraw.Draw(img, 'RGBA')

    f_logo = ImageFont.truetype(FONT_BOLD, 34)
    f_kick = ImageFont.truetype(FONT_BOLD, 24)
    f_title = ImageFont.truetype(FONT_BOLD, 56)
    f_bull = ImageFont.truetype(FONT_REG, 31)
    f_small = ImageFont.truetype(FONT_BOLD, 20)
    f_chip = ImageFont.truetype(FONT_BOLD, 22)

    # wordmark HomIA + punto degradado
    dr.text((64, 52), 'Hom', font=f_logo, fill=WHITE + (255,))
    w_hom = dr.textlength('Hom', font=f_logo)
    dr.text((64 + w_hom, 52), 'IA', font=f_logo, fill=WHITE + (255,))
    w_full = dr.textlength('HomIA', font=f_logo)
    dr.ellipse([64 + w_full + 10, 52 + 22, 64 + w_full + 30, 52 + 42], fill=accent)

    # chip de rol a la derecha
    rl = ROLE_LABEL[video['role']]
    tw = dr.textlength(rl, font=f_chip)
    dr.rounded_rectangle([W - 64 - tw - 44, 56, W - 64, 56 + 22 + 24 + 20],
                         radius=34, fill=accent + (30,), outline=accent + (150,), width=2)
    dr.text((W - 64 - tw - 22, 68), rl, font=f_chip, fill=accent)

    # kicker
    y = 170
    dr.text((64, y), slide['kicker'], font=f_kick, fill=accent)
    y += 40

    # título (hasta 2 líneas)
    for line in wrap(dr, slide['title'], f_title, W - 128)[:2]:
        dr.text((64, y), line, font=f_title, fill=WHITE)
        y += 68
    # barra de acento
    dr.rounded_rectangle([64, y + 10, 64 + 120, y + 18], radius=4, fill=accent)
    y += 52

    # bullets
    max_w = W - 128 - 40
    for b in slide['bullets']:
        dy = 0
        dr.ellipse([68, y + 12, 86, y + 30], fill=accent)
        for j, line in enumerate(wrap(dr, b, f_bull, max_w)):
            dr.text((104, y + dy + j * 40), line, font=f_bull, fill=SOFT)
            dy += 40
        y += dy + 26

    # pie: progreso + contador
    dr.text((64, H - 56), 'HomIA · tutorial guiado', font=f_small, fill=(255, 255, 255, 130))
    cnt = f'{si + 1} / {total_slides}'
    cw = dr.textlength(cnt, font=f_small)
    dr.text((W - 64 - cw, H - 56), cnt, font=f_small, fill=(255, 255, 255, 130))
    # barra de progreso del video
    frac = (si + 1) / total_slides
    dr.line([(64, H - 20), (W - 64, H - 20)], fill=(255, 255, 255, 36), width=4)
    dr.line([(64, H - 20), (64 + int((W - 128) * frac), H - 20)], fill=accent, width=4)

    png = WORK / f"{video['id']}_s{si:02d}.png"
    img.save(png)
    return png


def tts(text, mp3: Path, voice: str):
    """Locución en español rioplatense con edge-tts (Microsoft neural es-AR)."""
    if mp3.exists() and mp3.stat().st_size > 4000:
        return True
    for attempt in range(3):
        try:
            r = subprocess.run(
                ['python3', '-m', 'edge_tts', '--voice', voice, f'--rate={TTS_RATE}',
                 '--text', text, '--write-media', str(mp3)],
                capture_output=True, text=True, timeout=180)
            if r.returncode == 0 and mp3.exists() and mp3.stat().st_size > 4000:
                return True
            print(f'  tts intento {attempt + 1} falló: {r.stderr[-160:]}')
        except Exception as e:
            print(f'  tts excepción: {e}')
    # fallback: silencio 5s (el video sigue siendo útil)
    subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                    '-t', '5', str(mp3)], capture_output=True)
    return False


def probe_dur(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('FFMPEG ERR:', ' '.join(map(str, cmd))[:200], '\n', r.stderr[-600:])
    return r.returncode == 0


def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    summary = []
    for v in V:
        if only and v['id'] not in only:
            continue
        print(f"▶ {v['id']} ({v['role']}) — {v['title']}")
        segs = []
        voice = VOICE_FOR_ROLE[v['role']]
        for si, s in enumerate(v['slides']):
            base = WORK / f"{v['id']}_s{si:02d}"
            png = render_slide(v, si, s, len(v['slides']))
            aud = base.with_suffix('.mp3')
            ok = tts(s['narr'], aud, voice)
            if not ok:
                print(f'  ⚠ audio de reserva (silencio) en slide {si + 1}')
            adur = probe_dur(aud)
            D = round(0.25 + adur + 0.55, 2)
            seg = base.with_suffix('.mp4')
            if not seg.exists():
                vf = (f"scale=1280:720,format=yuv420p,"
                      f"fade=t=in:st=0:d=0.35,fade=t=out:st={max(0.1, D - 0.45)}:d=0.4")
                af = "adelay=250:all=1,apad=pad_dur=0.5,aresample=24000"
                if not run(['ffmpeg', '-y', '-loop', '1', '-framerate', '24', '-i', str(png),
                            '-i', str(aud), '-filter_complex',
                            f'[0:v]{vf}[v];[1:a]{af}[a]',
                            '-map', '[v]', '-map', '[a]', '-t', str(D),
                            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
                            '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '96k',
                            '-ar', '24000', '-ac', '1', str(seg)]):
                    raise SystemExit(f'fallo segmento {seg}')
            segs.append(seg)
            print(f'   slide {si + 1}/{len(v["slides"])} — {adur:.1f}s de voz', flush=True)
        # concat
        lst = WORK / f"{v['id']}_list.txt"
        lst.write_text('\n'.join(f"file '{p}'" for p in segs) + '\n')
        raw = WORK / f"{v['id']}_raw.mp4"
        run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(raw)])
        final = OUT / f"{v['id']}.mp4"
        run(['ffmpeg', '-y', '-i', str(raw), '-c', 'copy', '-movflags', '+faststart', str(final)])
        # poster
        poster_src = Image.open(WORK / f"{v['id']}_s00.png")
        poster = poster_src.resize((640, 360), Image.LANCZOS).convert('RGB')
        poster.save(OUT / f"{v['id']}.jpg", quality=74)
        dur = probe_dur(final)
        size = final.stat().st_size / 1024 / 1024
        summary.append({'id': v['id'], 'role': v['role'], 'title': v['title'],
                        'duration': round(dur, 1), 'mb': round(size, 2)})
        print(f'   ✔ {final.name}: {dur:.1f}s, {size:.2f} MB')
    (WORK / 'summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print('\nRESUMEN:')
    for s in summary:
        print(f"  {s['id']:16} {s['duration']:6.1f}s {s['mb']:5.2f}MB  {s['title']}")


if __name__ == '__main__':
    main()
