"""Development helper: split a tall screenshot into readable slices.

    python dev/crop.py <image.png> [slice_height]
Writes <image>-part1.png, <image>-part2.png, ... next to the input.
"""

import sys
from pathlib import Path

from PIL import Image

source = Path(sys.argv[1])
height = int(sys.argv[2]) if len(sys.argv) > 2 else 1400
image = Image.open(source)
for index, top in enumerate(range(0, image.height, height), start=1):
    part = image.crop((0, top, image.width, min(top + height, image.height)))
    out = source.with_name(f"{source.stem}-part{index}.png")
    part.save(out)
    print(out.name)
