#!/usr/bin/env python3
"""Post-proceso 'fotografiado' de tarjetas DNI: perspectiva sutil, sombra,
gradiente de luz cálida, ruido de sensor y leve desenfoque → foto plausible de plástico físico.
Uso: python3 photo-ify.py <dir>   (procesa dni-*-frente.jpg y dni-*-dorso.jpg in-place)"""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import os, sys, math, random

DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dni-test"

def photographify(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    rnd = random.Random(hash(path) & 0xffff)

    # fondo tipo mesa de madera clara
    bg = Image.new("RGB", (int(w * 1.45), int(h * 1.5)), (168, 142, 108))
    bd = ImageDraw.Draw(bg)
    for i in range(0, bg.width, 42):
        bd.line([(i, 0), (i + rnd.randint(-14, 14), bg.height)], fill=(150, 124, 92), width=rnd.randint(3, 7))
    for i in range(0, bg.height, 26):
        bd.line([(0, i), (bg.width, i + rnd.randint(-6, 6))], fill=(158, 132, 100), width=1)
    bg = bg.filter(ImageFilter.GaussianBlur(3))

    # perspectiva sutil (esquinas desplazadas)
    dx = rnd.randint(6, 12)
    coeffs = [
        dx, rnd.randint(4, 10),
        w - dx, rnd.randint(-8, -4) if False else rnd.randint(2, 8),
        w + 2, h - rnd.randint(4, 10),
        -2, h - rnd.randint(2, 8),
    ]
    warped = img.transform(img.size, Image.QUAD, (coeffs[0], coeffs[1], w - coeffs[2] + w, coeffs[3], w, h, 0, h), Image.BICUBIC)
    # quad transform necesita coords fuente: usamos transform con COEFFS manual
    # más simple: rotación leve + escala
    warped = img.rotate(rnd.uniform(-1.6, 1.6), expand=True, resample=Image.BICUBIC, fillcolor=(190, 170, 145))
    warped = warped.resize((w, h), Image.LANCZOS)

    # sombra proyectada
    shadow = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([16, 22, w - 10, h - 8], 24, fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    bg_small = bg.resize((w, int(h * 1.12)))
    card_layer = Image.new("RGBA", (w, h))
    card_layer.paste(warped, (0, 0))
    out = bg_small.crop((0, 0, w, h)).copy()
    out.paste(Image.new("RGB", (w, h), (40, 30, 18)), (0, 0), shadow)
    out.paste(warped, (0, 0))

    # gradiente de luz cálida (ventana a la izquierda)
    grad = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(grad)
    for x in range(w):
        gd.line([(x, 0), (x, h)], fill=int(38 * (1 - x / w)))
    warm = Image.new("RGB", (w, h), (255, 224, 178))
    out = Image.composite(Image.blend(out, warm, 0.18), out, grad)

    # ruido de sensor
    noise = Image.effect_noise((w, h), 14).convert("L")
    out = Image.composite(ImageEnhance.Brightness(out).enhance(1.06), ImageEnhance.Brightness(out).enhance(0.94), noise)

    out = out.filter(ImageFilter.GaussianBlur(0.5))
    out = ImageEnhance.Contrast(out).enhance(1.05)
    out.save(path, "JPEG", quality=86)
    print(f"fotografiada: {os.path.basename(path)}")

if __name__ == "__main__":
    for f in sorted(os.listdir(DIR)):
        if f.endswith(("-frente.jpg", "-dorso.jpg")):
            photographify(os.path.join(DIR, f))
