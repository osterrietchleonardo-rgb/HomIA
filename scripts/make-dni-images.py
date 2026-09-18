#!/usr/bin/env python3
"""Ensambla tarjetas DNI sintéticas para el seed demo de HomIA.
Uso: python3 make-dni-images.py <out_dir> [portraits_dir]
Los retratos (si existen en portraits_dir/{slug}.jpg) se pegan en el recuadro foto;
si no, se dibuja una silueta. Incluye fondo guilloché, firma, holograma y DNIs
no secuenciales para que el análisis de IA de visión tenga elementos reales que evaluar.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, sys, math, random

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dni-test"
PORTRAITS = sys.argv[2] if len(sys.argv) > 2 else "/tmp/dni-portraits"
os.makedirs(OUT, exist_ok=True)

W, H = 860, 540
FONT_B = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
FONT_M = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
FONT_S = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 19)
FONT_XS = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
FONT_SIG = ImageFont.truetype("/usr/share/fonts/truetype/lxgw-wenkai/LXGWWenKai-Regular.ttf", 34) if os.path.exists("/usr/share/fonts/truetype/lxgw-wenkai/LXGWWenKai-Regular.ttf") else FONT_M

NAVY = (12, 45, 84)
BLUE = (29, 99, 184)
GREY = (95, 105, 118)
LIGHT = (240, 244, 250)
WHITE = (255, 255, 255)

def guilloche(d, seed):
    """Patrón ondulado de fondo estilo documento."""
    rnd = random.Random(seed)
    for i in range(26):
        y0 = 108 + i * 17
        amp = rnd.randint(3, 7)
        phase = rnd.random() * math.pi * 2
        pts = []
        for x in range(0, W + 8, 8):
            y = y0 + amp * math.sin(0.02 * x + phase)
            pts.append((x, y))
        d.line(pts, fill=(216, 226, 238), width=1)

def hologram(img, x, y, r):
    """Disco con gradiente irisado semi-transparente (estilo holograma)."""
    hol = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hol)
    for i in range(r, 0, -1):
        t = i / r
        hue = int(190 + 60 * math.sin(i * 0.22))
        color = (int(90 + 120 * t), hue, 240, 52)
        hd.ellipse([r - i, r - i, r + i, r + i], fill=color)
    hd.ellipse([r - 8, r - 8, r + 8, r + 8], fill=(255, 255, 255, 120))
    hd.arc([r - int(r * 0.6), r - int(r * 0.6), r + int(r * 0.6), r + int(r * 0.6)], 20, 250, fill=(255, 255, 255, 150), width=3)
    img.paste(hol, (x - r, y - r), hol)

def microtext(d, x, y, width, text="REPUBLICA ARGENTINA DNI "):
    """Línea de microimpresión: texto diminuto repetido."""
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 5)
    except Exception:
        f = FONT_XS
    line = text * 40
    d.text((x, y), line[:int(width / 2.9)], font=f, fill=(140, 155, 175))

def base_card(seed):
    img = Image.new("RGB", (W, H), LIGHT)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 92], fill=NAVY)
    d.rectangle([0, 92, W, 100], fill=(255, 199, 0))
    guilloche(d, seed)
    return img, d

def photo_box(img, d, x, y, w, h, portrait=None):
    if portrait and os.path.exists(portrait):
        p = Image.open(portrait).convert("RGB")
        pw, ph = p.size
        scale = max(w / pw, h / ph)
        p = p.resize((int(pw * scale) + 1, int(ph * scale) + 1))
        left = (p.width - w) // 2; top = (p.height - h) // 2
        p = p.crop((left, top, left + w, top + h))
        img.paste(p, (x, y))
        d.rectangle([x, y, x + w, y + h], outline=GREY, width=2)
    else:
        d.rectangle([x, y, x + w, y + h], fill=(205, 214, 224), outline=GREY, width=2)
        d.ellipse([x + w * 0.28, y + h * 0.12, x + w * 0.72, y + h * 0.58], fill=(226, 190, 160))
        d.pieslice([x + w * 0.14, y + h * 0.62, x + w * 0.86, y + h * 1.25], 180, 360, fill=(226, 190, 160))

def signature(d, x, y, name):
    # rúbrica ondulada + nombre
    d.line([(x, y + 26), (x + 22, y + 10), (x + 44, y + 30), (x + 70, y + 6), (x + 96, y + 26), (x + 130, y + 12)],
           fill=(25, 35, 60), width=2, joint="curve")
    d.text((x + 8, y + 30), name.split()[0], font=FONT_SIG, fill=(25, 35, 60))

def front(path, slug, nombre, dni_num, cuil, nac, birthplace, portrait=None):
    img, d = base_card(int(dni_num.replace('.', '')) if dni_num[:2].isdigit() else 7)
    d.text((36, 22), "REPÚBLICA ARGENTINA — MINISTERIO DEL INTERIOR", font=FONT_XS, fill=(160, 190, 220))
    d.text((36, 46), "DOCUMENTO NACIONAL DE IDENTIDAD", font=FONT_B, fill=WHITE)
    microtext(d, 36, 104, W - 72)
    photo_box(img, d, 40, 130, 200, 250, portrait)
    d.text((40, 395), "ID ARG", font=FONT_XS, fill=BLUE)
    labels = [("APELLIDO", nombre.split()[0]), ("NOMBRE", " ".join(nombre.split()[1:])), ("DNI", dni_num)]
    y = 148
    for lab, val in labels:
        d.text((290, y), lab, font=FONT_XS, fill=GREY)
        d.text((290, y + 24), val, font=FONT_B, fill=(20, 30, 45))
        y += 76
    d.text((290, y), "FECHA DE NACIMIENTO", font=FONT_XS, fill=GREY)
    d.text((290, y + 24), nac, font=FONT_M, fill=(20, 30, 45))
    d.text((620, 130), "CUIL", font=FONT_XS, fill=GREY)
    d.text((620, 154), cuil, font=FONT_M, fill=(20, 30, 45))
    d.text((620, 220), "LUGAR DE NACIMIENTO", font=FONT_XS, fill=GREY)
    d.text((620, 244), birthplace, font=FONT_S, fill=(20, 30, 45))
    signature(d, 600, 320, nombre)
    hologram(img, 700, 420, 62)
    microtext(d, 290, 452, 400)
    d.rectangle([0, 500, W, H], fill=(180, 205, 235))
    d.text((36, 508), f"ID-ARG {dni_num}", font=FONT_XS, fill=(60, 80, 110))
    img.save(path, "JPEG", quality=92)

def back(path, slug, dni_num, cuil, domicilio, birthplace, portrait=None):
    img, d = base_card(int(dni_num.replace('.', '')) + 3 if dni_num[:2].isdigit() else 9)
    d.text((36, 22), "DORSO — DOCUMENTO NACIONAL DE IDENTIDAD", font=FONT_B, fill=WHITE)
    microtext(d, 36, 104, W - 72)
    rnd = random.Random(int(dni_num.replace('.', '')) if dni_num[:2].isdigit() else 7)
    x = 36
    d.text((36, 130), "CÓDIGO DE BARRAS", font=FONT_XS, fill=GREY)
    while x < W - 60:
        w = rnd.choice([2, 3, 5, 7])
        d.rectangle([x, 155, x + w, 235], fill=(20, 30, 45))
        x += w + rnd.choice([2, 3, 4])
    d.text((36, 265), "NÚMERO", font=FONT_XS, fill=GREY)
    d.text((36, 289), dni_num, font=FONT_B, fill=(20, 30, 45))
    d.text((300, 265), "CUIL", font=FONT_XS, fill=GREY)
    d.text((300, 289), cuil, font=FONT_M, fill=(20, 30, 45))
    d.text((560, 265), "TRÁMITE", font=FONT_XS, fill=GREY)
    d.text((560, 289), f"20{rnd.randint(18, 24)}", font=FONT_M, fill=(20, 30, 45))
    d.text((36, 345), "DOMICILIO", font=FONT_XS, fill=GREY)
    d.text((36, 369), domicilio, font=FONT_M, fill=(20, 30, 45))
    d.text((36, 425), "UNIDAD DE NUMERACIÓN", font=FONT_XS, fill=GREY)
    d.text((36, 449), dni_num, font=FONT_M, fill=(20, 30, 45))
    hologram(img, 760, 160, 56)
    d.rectangle([0, 500, W, H], fill=(180, 205, 235))
    d.text((36, 508), f"ID-ARG {dni_num}", font=FONT_XS, fill=(60, 80, 110))
    img.save(path, "JPEG", quality=92)

PEOPLE = [
    # slug, nombre, dni (no secuencial), cuil, nacimiento, domicilio
    ("valentina", "Valentina Ríos Mendez", "41.723.896", "27-41723896-8", "12/03/1996", "Av. Corrientes 2456, CABA", "CABA"),
    ("matias", "Matías Ferrer", "32.804.517", "20-32804517-4", "08/07/1989", "San Juan 3521, Mar del Plata", "Mar del Plata, Buenos Aires"),
    ("ferrer", "Roberto Ferrer", "24.519.083", "20-24519083-9", "22/11/1981", "Av. San Juan 1890, CABA", "CABA"),
    ("carolina", "Carolina Páez", "38.764.129", "27-38764129-1", "03/05/1992", "Belgrano 784, Córdoba", "Córdoba Capital"),
    ("julian", "Julián Sosa", "40.986.752", "20-40986752-7", "19/09/1997", "Rivadavia 5123, CABA", "CABA"),
]

if __name__ == "__main__":
    for slug, nombre, dni, cuil, nac, dom, birth in PEOPLE:
        portrait = os.path.join(PORTRAITS, f"{slug}.jpg")
        front(os.path.join(OUT, f"dni-{slug}-frente.jpg"), slug, nombre, dni, cuil, nac, birth, portrait)
        back(os.path.join(OUT, f"dni-{slug}-dorso.jpg"), slug, dni, cuil, dom, birth, portrait)
        print(f"OK {slug}: frente+dorso → {OUT}")
