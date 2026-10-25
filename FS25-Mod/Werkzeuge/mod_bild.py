# Bild der Mod (icon_craftConsole.dds): Tacho wie die Anzeigen in ControlHub, darunter „ControlHub“ ("Hub" in Grün).
# Aufruf: python3 mod_bild.py <ziel.dds> <vorschau.png>
import struct, sys, math
from PIL import Image, ImageDraw, ImageFont
N, S = 256, 4   # Bildgröße, Supersampling
GRUEN, HELL, RAND, GRUND, BOGEN = (108, 191, 77, 255), (232, 235, 238, 255), (74, 156, 47, 255), (23, 27, 33, 255), (51, 58, 69, 255)
img = Image.new('RGBA', (N*S, N*S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([8*S, 8*S, (N-8)*S, (N-8)*S], radius=36*S, fill=GRUND, outline=RAND, width=6*S)
# Tacho-Bogen (240°), Wert ~65 %
cx, cy, r = N/2*S, 128*S, 78*S
box = [cx-r, cy-r, cx+r, cy+r]
d.arc(box, start=150, end=390, fill=BOGEN, width=16*S)
d.arc(box, start=150, end=150+240*0.65, fill=GRUEN, width=16*S)
ang = math.radians(150 + 240*0.65)
d.line([cx, cy, cx + (r-28*S)*math.cos(ang), cy + (r-28*S)*math.sin(ang)], fill=HELL, width=8*S)
d.ellipse([cx-12*S, cy-12*S, cx+12*S, cy+12*S], fill=HELL)
def schrift(px):
    for f in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        try: return ImageFont.truetype(f, px)
        except Exception: pass
    return ImageFont.load_default()
font = schrift(38*S)
teile = [('Control', HELL), ('Hub', GRUEN)]
breite = sum(d.textlength(t, font=font) for t, _ in teile)
x, y = cx - breite/2, 212*S
for t, farbe in teile:
    d.text((x, y), t, fill=farbe, font=font, anchor='lm')
    x += d.textlength(t, font=font)
img = img.resize((N, N), Image.LANCZOS)
img.save(sys.argv[2])
# DDS, unkomprimiert A8R8G8B8 (BGRA im Speicher), ohne Mipmaps
w, h = img.size
px = img.tobytes('raw', 'BGRA')
hdr = struct.pack('<4sIIIIIII44sIIIIIIIIIIIII', b'DDS ', 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x8, h, w, w * 4, 0, 1, b'\0' * 44,
                  32, 0x41, 0, 32, 0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000, 0x1000, 0, 0, 0, 0)
open(sys.argv[1], 'wb').write(hdr + px)
print('ok', len(hdr), len(px), 'Textbreite', round(breite/S))
