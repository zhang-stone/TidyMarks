#!/usr/bin/env python3
"""生成扩展图标 (public/icon/{16,32,48,96,128}.png)。

无第三方依赖：在高分辨率主图上按硬边填充，再用区域平均降采样得到抗锯齿结果，
最后用 zlib 手写 PNG 编码。图标主题为紫靛渐变背景 + 白色书签丝带 + AI 星芒。
"""
import struct
import zlib
import os

MASTER = 1024  # 主图分辨率

# 主题色（与仪表盘一致）：indigo #6366f1 -> violet #8b5cf6
C1 = (99, 102, 241)
C2 = (139, 92, 246)
WHITE = (255, 255, 255)


def rounded_rect_inside(px, py, x0, y0, x1, y1, r):
    """px,py 归一化坐标；判断是否在圆角矩形内。"""
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    # 四角圆角
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    dx = px - cx
    dy = py - cy
    return dx * dx + dy * dy <= r * r


def bookmark_inside(px, py):
    """白色书签丝带：顶部矩形，底部中间向上的缺口。"""
    xl, xr = 0.375, 0.625
    top = 0.255
    if px < xl or px > xr:
        return False
    if py < top:
        return False
    cx = 0.5
    half = (xr - xl) / 2.0
    outer_bottom = 0.755
    notch_apex = 0.625
    boundary = notch_apex + (outer_bottom - notch_apex) * (abs(px - cx) / half)
    return py <= boundary


def sparkle_inside(px, py, cx, cy, s):
    """四角星芒（菱形拉伸）。"""
    dx = abs(px - cx) / s
    dy = abs(py - cy) / s
    # 凹边四角星：|x|^0.6 + |y|^0.6 <= 1 近似
    return (dx ** 0.55 + dy ** 0.55) <= 1.0


def render_master():
    n = MASTER
    buf = bytearray(n * n * 4)
    x0, y0, x1, y1, r = 0.055, 0.055, 0.945, 0.945, 0.2
    for j in range(n):
        py = (j + 0.5) / n
        for i in range(n):
            px = (i + 0.5) / n
            idx = (j * n + i) * 4
            if not rounded_rect_inside(px, py, x0, y0, x1, y1, r):
                # 背景透明
                buf[idx + 3] = 0
                continue
            # 对角渐变
            t = (px + py) / 2.0
            rr = int(C1[0] + (C2[0] - C1[0]) * t)
            gg = int(C1[1] + (C2[1] - C1[1]) * t)
            bb = int(C1[2] + (C2[2] - C1[2]) * t)
            col = (rr, gg, bb)
            a = 255
            if bookmark_inside(px, py):
                col = WHITE
            elif sparkle_inside(px, py, 0.70, 0.33, 0.085):
                col = WHITE
            buf[idx] = col[0]
            buf[idx + 1] = col[1]
            buf[idx + 2] = col[2]
            buf[idx + 3] = a
    return buf


def downsample(master, size):
    n = MASTER
    factor = n // size
    out = bytearray(size * size * 4)
    for oy in range(size):
        for ox in range(size):
            r = g = b = a = 0
            for dy in range(factor):
                sy = oy * factor + dy
                base = (sy * n + ox * factor) * 4
                for dx in range(factor):
                    p = base + dx * 4
                    al = master[p + 3]
                    # 预乘 alpha 做平均，避免透明边缘发黑
                    r += master[p] * al
                    g += master[p + 1] * al
                    b += master[p + 2] * al
                    a += al
            count = factor * factor
            avg_a = a / count
            idx = (oy * size + ox) * 4
            if a == 0:
                out[idx + 3] = 0
            else:
                out[idx] = int(r / a)
                out[idx + 1] = int(g / a)
                out[idx + 2] = int(b / a)
                out[idx + 3] = int(round(avg_a))
    return out


def write_png(path, size, rgba):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        return c

    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter type 0
        raw.extend(rgba[y * stride:(y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icon")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    print("rendering master…")
    master = render_master()
    for size in (128, 96, 48, 32, 16):
        img = downsample(master, size)
        path = os.path.join(out_dir, f"{size}.png")
        write_png(path, size, img)
        print("wrote", path)


if __name__ == "__main__":
    main()
