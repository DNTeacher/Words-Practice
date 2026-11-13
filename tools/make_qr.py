"""링크 → 카카오톡/교실 게시용 QR 이미지.

사용법: python3 make_qr.py <링크> "<제목>" <저장할 png>
"""
import os, sys
sys.path.insert(0, os.path.expanduser("~/tts/python-qrcode"))
import qrcode  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

url, title, out = sys.argv[1], sys.argv[2], sys.argv[3]

INK = (21, 33, 59)
SOFT = (86, 99, 127)
PAPER = (255, 255, 255)
MARKER = (255, 225, 77)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=20, border=2)
qr.add_data(url)
qr.make(fit=True)
code = qr.make_image(fill_color=INK, back_color=PAPER).convert("RGB")

def font(weight, size):
    base = "/usr/share/fonts/opentype/noto/"
    for name in (f"NotoSansCJK-{weight}.ttc", "NotoSansCJK-Bold.ttc", "NotoSansCJK-Regular.ttc"):
        p = os.path.join(base, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size, index=1)  # index 1 = KR
    return ImageFont.load_default()

W = 1080
qs = 760
code = code.resize((qs, qs), Image.NEAREST)
img = Image.new("RGB", (W, 1200), PAPER)
d = ImageDraw.Draw(img)

f_title = font("Bold", 64)
f_sub = font("Regular", 38)

# 제목 (형광펜 밑줄)
tw = d.textlength(title, font=f_title)
tx, ty = (W - tw) / 2, 70
d.rectangle([tx - 8, ty + 50, tx + tw + 8, ty + 86], fill=MARKER)
d.text((tx, ty), title, font=f_title, fill=INK)

img.paste(code, ((W - qs) // 2, 200))

sub = "휴대폰 카메라로 찍으면 단어장이 열려요"
sw = d.textlength(sub, font=f_sub)
d.text(((W - sw) / 2, 200 + qs + 50), sub, font=f_sub, fill=SOFT)

img = img.crop((0, 0, W, 200 + qs + 140))
img.save(out)
print(out, img.size)
