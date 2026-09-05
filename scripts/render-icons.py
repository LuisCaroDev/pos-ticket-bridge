from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "native"


def draw_mark(size: int, color: bool) -> Image.Image:
    scale = size / 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def xy(values):
        return tuple(round(value * scale) for value in values)

    def cubic(p0, p1, p2, p3, steps=12):
        points = []
        for index in range(1, steps + 1):
            t = index / steps
            u = 1 - t
            points.append((
                u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
            ))
        return points

    if color:
        draw.rounded_rectangle(xy((0, 0, 64, 64)), radius=round(14 * scale), fill="#071b49")
        wing = "#1683ff"
        ticket = "#ffffff"
    else:
        wing = ticket = "#000000"

    left_wing = [(18, 15)]
    left_wing += cubic((18, 15), (15, 12), (12, 13), (9, 16))
    left_wing += [(4, 22)]
    left_wing += cubic((4, 22), (1, 25), (1, 29), (4, 32))
    left_wing += [(9, 40)]
    left_wing += cubic((9, 40), (12, 44), (15, 47), (18, 44))
    left_wing += [(18, 36)]
    left_wing += cubic((18, 36), (15, 34), (14, 32), (14, 29))
    left_wing += cubic((14, 29), (14, 26), (15, 24), (18, 22))
    right_wing = [(64 - x, y) for x, y in left_wing]
    draw.polygon([xy(point) for point in left_wing], fill=wing)
    draw.polygon([xy(point) for point in right_wing], fill=wing)

    draw.rounded_rectangle(xy((20, 5, 44, 54)), radius=round(4 * scale), fill=ticket)
    cut = "#071b49" if color else (0, 0, 0, 0)
    for center in (27, 32, 37):
        draw.polygon([xy((center - 2, 54)), xy((center, 50)), xy((center + 2, 54))], fill=cut)

    detail = "#071b49" if color else (0, 0, 0, 0)
    for left, right, top in ((25, 39, 20), (25, 39, 27), (25, 35, 34)):
        draw.rounded_rectangle(xy((left, top, right, top + 2.5)), radius=round(1.25 * scale), fill=detail)
    return image


draw_mark(1024, True).save(NATIVE / "pos-ticket-bridge-icon.png")
draw_mark(16, False).save(NATIVE / "pos-ticket-bridge-trayTemplate.png")
draw_mark(32, False).save(NATIVE / "pos-ticket-bridge-trayTemplate@2x.png")
