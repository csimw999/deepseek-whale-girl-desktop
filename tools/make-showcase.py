import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = r"C:\Users\Lenovo\Desktop\deepseek_harness_workplace\pet-desktop"
SHOTS = os.path.join(ROOT, "docs", "shots")

def font(size, bold=False):
    for name in (["msyhbd.ttc", "msyh.ttc"] if bold else ["msyh.ttc", "msyhbd.ttc"]):
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def cutout(path, tol=42):
    """从四边泛洪，把接近纯白的背景变透明"""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if r > 255 - tol and g > 255 - tol and b > 255 - tol:
            px[x, y] = (r, g, b, 0)
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    bb = im.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    keep_w = int((x1 - x0) * 0.76)
    return im.crop((x0, y0, x0 + keep_w, y1))

def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out

def shadow(size, radius, blur, alpha):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=(0, 0, 0, alpha))
    return layer.filter(ImageFilter.GaussianBlur(blur))

W, H = 1600, 1000
canvas = Image.new("RGB", (W, H), (11, 18, 32))
draw = ImageDraw.Draw(canvas)

# 背景渐变
for y in range(H):
    t = y / (H - 1)
    r = int(12 + (26 - 12) * t)
    g = int(20 + (42 - 20) * t)
    b = int(38 + (86 - 38) * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# 左上角光晕
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([-260, -360, 900, 460], fill=(76, 139, 245, 46))
gd.ellipse([900, 500, 1900, 1300], fill=(120, 180, 255, 26))
glow = glow.filter(ImageFilter.GaussianBlur(120))
canvas = Image.alpha_composite(canvas.convert("RGBA"), glow)

# ---- 右侧：聊天窗卡片 ----
chat = Image.open(os.path.join(SHOTS, "chat.png")).convert("RGB")
chat_w = 780
chat_h = int(chat.height * chat_w / chat.width)
chat = chat.resize((chat_w, chat_h), Image.LANCZOS)
chat_card = rounded(chat, 22)
chat_x, chat_y = W - chat_w - 90, 190
canvas.alpha_composite(shadow((chat_w, chat_h), 22, 26, 150), (chat_x + 10, chat_y + 18))
canvas.alpha_composite(chat_card, (chat_x, chat_y))

# ---- 中间：她本人 ----
pet = cutout(os.path.join(SHOTS, "pet.png"))
pet_h = 540
pet = pet.resize((int(pet.width * pet_h / pet.height), pet_h), Image.LANCZOS)
pet_shadow = Image.new("RGBA", pet.size, (0, 0, 0, 0))
pet_shadow.putalpha(pet.getchannel("A").point(lambda v: int(v * 0.55)))
pet_shadow = pet_shadow.filter(ImageFilter.GaussianBlur(18))
pet_x, pet_y = 96, H - pet_h - 30
canvas.alpha_composite(pet_shadow, (pet_x + 14, pet_y + 22))
canvas.alpha_composite(pet, (pet_x, pet_y))

# ---- 标题 ----
draw = ImageDraw.Draw(canvas)
draw.text((76, 92), "鲸鱼娘桌面版", font=font(64, True), fill=(240, 246, 255))
draw.text((78, 176), "Live2D 桌宠  ·  DSH 联动  ·  本地语音  ·  角色扮演聊天", font=font(26), fill=(150, 178, 226))

# 特性小标签
tags = ["透明置顶", "逐像素穿透", "双形态", "SenseVoice", "edge-tts", "不花 token"]
tx, ty = 78, 232
for tag in tags:
    f = font(20)
    tw = draw.textlength(tag, font=f)
    draw.rounded_rectangle([tx, ty, tx + tw + 26, ty + 38], radius=19, fill=(38, 58, 108), outline=(72, 108, 190), width=1)
    draw.text((tx + 13, ty + 8), tag, font=f, fill=(176, 202, 255))
    tx += tw + 38
    if tx > 520:
        tx = 78
        ty += 52

# 底部仓库地址
draw.text((78, H - 62), "github.com/csimw999/deepseek-whale-girl-desktop", font=font(22), fill=(110, 138, 190))
draw.text((W - 470, H - 62), "代码 MIT  ·  美术 CC BY-NC-SA 4.0", font=font(22), fill=(110, 138, 190))

out = os.path.join(ROOT, "docs", "showcase.png")
canvas.convert("RGB").save(out, quality=95)
print("saved", out, canvas.size, os.path.getsize(out) // 1024, "KB")
