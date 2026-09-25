"""A synthetic sweep: a made-up vial label wrapped round a cylinder, turned in front of a camera.

For driving the sweep's development replay (modules/label-sweep/README.md)
where there is no real bottle to film. Writes frames every 0.3 s of the turn,
as the replay samples a video, into OUT/images, and the whole turn as
OUT/turning.mp4.

    pip install pillow numpy imageio imageio-ffmpeg
    python scripts/synthetic-sweep.py OUT [--stagger]

`--stagger` indents the second and third direction lines, so that no frame
sees both direction lines whole until the middle of the turn. The label is
made up; nothing here is anyone's prescription.

The model is crude on purpose: text on a cylinder, squashed towards the
edges, shaded, and out of sight past them. It is what makes a recogniser
misread the ends of lines ("mouth ee" for "mouth every"), which is what the
merge must survive. It is not a substitute for filming a real bottle.
"""
import argparse
import os

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('out')
parser.add_argument('--stagger', action='store_true')
parser.add_argument('--font', default='C:/Windows/Fonts/arialbd.ttf')
args = parser.parse_args()

indent = 300 if args.stagger else 40
PRINTED = [
    ('JANE DOE', 40),
    ('12 OAK ST, SPRINGFIELD, MA 01101', 40),
    ('VITAMIN D2', 40),
    ('1.25MG(50,', 40),
    ('000 UNIT)', 40),
    ('Generic for: Calciferol, Drisdol', 40),
    ('Take 1 capsule (50,000', 40),
    ('units) by mouth every 7', indent),
    ('days', indent),
]

font = ImageFont.truetype(args.font, 64)
LINE = 92
label_w = 1500
label_h = 60 + LINE * len(PRINTED)
label = Image.new('L', (label_w, label_h), 250)
draw = ImageDraw.Draw(label)
for index, (text, x) in enumerate(PRINTED):
    draw.text((x, 30 + index * LINE), text, font=font, fill=15)
label_px = np.asarray(label, dtype=np.float32)

# A portrait phone frame, the bottle upright in the middle of it.
FW, FH = 1080, 1920
R = 430  # the bottle's radius in the frame, px
CX = FW // 2
TOP = (FH - label_h) // 2


def frame(center_col):
    """The view with label column `center_col` facing the camera."""
    out = np.full((FH, FW), 70, dtype=np.float32)
    xs = np.arange(CX - R, CX + R)
    theta = np.arcsin(np.clip((xs - CX) / R, -0.999, 0.999))
    cols = np.round(center_col + theta * R).astype(int)
    shade = np.cos(theta) ** 0.35
    bottle = np.full((label_h, len(xs)), 200, dtype=np.float32)  # plastic beyond the label
    inside = (cols >= 0) & (cols < label_w)
    bottle[:, inside] = label_px[:, cols[inside]]
    bottle *= shade[None, :]
    out[TOP:TOP + label_h, CX - R:CX + R] = bottle
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert('RGB')


os.makedirs(os.path.join(args.out, 'images'), exist_ok=True)
# Six seconds of turning at 10 frames a second, from facing the start of the
# lines to facing their ends.
steps = 60
writer = imageio.get_writer(os.path.join(args.out, 'turning.mp4'), fps=10, codec='libx264', quality=8,
                            pixelformat='yuv420p', macro_block_size=8)
for i in range(steps):
    image = frame(260 + (820 - 260) * i / (steps - 1))
    writer.append_data(np.asarray(image))
    if i % 3 == 0:
        image.save(os.path.join(args.out, 'images', f'frame-{i:03d}.png'))
writer.close()
print('wrote', args.out)
