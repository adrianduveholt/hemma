"""Ritar PNG-ikonerna (samma motiv som icons/icon.svg) utan externa bibliotek."""
import struct, zlib, pathlib

GREEN = (0x2f, 0x6b, 0x4f)
CREAM = (0xf6, 0xf4, 0xef)
LINE = tuple(round(c * .65 + g * .35) for c, g in zip(CREAM, GREEN))

def in_rrect(x, y, x0, y0, w, h, r):
    if not (x0 <= x < x0 + w and y0 <= y < y0 + h): return False
    cx = min(max(x, x0 + r), x0 + w - r); cy = min(max(y, y0 + r), y0 + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def pixel(x, y):  # koordinater i 512-rutnätet
    if not in_rrect(x, y, 0, 0, 512, 512, 112): return None
    if in_rrect(x, y, 176, 246, 160, 22, 11) or in_rrect(x, y, 176, 296, 110, 22, 11): return LINE
    if in_rrect(x, y, 156, 120, 200, 44, 14) or in_rrect(x, y, 136, 176, 240, 230, 36): return CREAM
    return GREEN

def png(size, path, full_bleed=False):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in (.25, .75):
                for sx in (.25, .75):
                    x, y = (px + sx) * 512 / size, (py + sy) * 512 / size
                    c = pixel(x, y) if not full_bleed else (pixel(x, y) or GREEN)
                    if full_bleed and c is None: c = GREEN
                    if c: acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2], acc[3] + 255]
            n = 4
            a = acc[3] / n
            row += bytes([round(acc[0] / max(acc[3] / 255, 1e-9)) if a else 0,
                          round(acc[1] / max(acc[3] / 255, 1e-9)) if a else 0,
                          round(acc[2] / max(acc[3] / 255, 1e-9)) if a else 0, round(a)])
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)

out = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'icons'
png(192, out / 'icon-192.png')
png(512, out / 'icon-512.png')
png(180, out / 'icon-180.png', full_bleed=True)  # iOS rundar hörnen själv
print('ok')
