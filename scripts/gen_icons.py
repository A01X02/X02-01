"""生成 PWA 图标：金色径向渐变背景 + 白色心形。
纯标准库实现，不依赖 Pillow。输出到 public/。
"""
import zlib
import struct
import math
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")


def png_encode(width, height, raw):
    def chunk(typ, data):
        body = typ + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def gen_icon(size):
    cx = size / 2.0
    cy = size / 2.0
    scale = size / 3.0  # 心形在归一化坐标约占 3 个单位
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (None)
        for x in range(size):
            # 金色径向渐变：中心亮 #E8B923 -> 边缘暗 #C0881A
            gx = (x / size - 0.5)
            gy = (y / size - 0.5)
            dist = math.sqrt(gx * gx + gy * gy)
            t = min(1.0, dist * 1.5)
            r = int(round(232 - t * (232 - 192)))
            g = int(round(185 - t * (185 - 136)))
            b = int(round(35 - t * (35 - 26)))

            # 心形判定：标准公式 (x^2+y^2-1)^3 - x^2*y^3 <= 0
            hx = (x - cx) / scale
            hy = -(y - cy) / scale  # 翻转 y 轴
            v = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3
            if v <= 0:
                rr, gg, bb = 255, 255, 255
            else:
                rr, gg, bb = r, g, b
            raw += bytes((rr, gg, bb, 255))
    return png_encode(size, size, raw)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sizes = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}
    for name, size in sizes.items():
        data = gen_icon(size)
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({size}x{size}, {len(data)} bytes)")


if __name__ == "__main__":
    main()
