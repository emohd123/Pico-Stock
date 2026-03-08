from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upscale and lightly sharpen imported catalog images.")
    parser.add_argument("--root", required=True, help="Root folder that contains imported catalog images.")
    parser.add_argument("--min-width", type=int, default=900, help="Target minimum width for images.")
    return parser.parse_args()


def enhance_image(path: Path, min_width: int) -> bool:
    try:
        with Image.open(path) as image:
            image = image.convert("RGB")
            width, height = image.size
            if width < min_width:
                ratio = min_width / width
                new_size = (int(width * ratio), int(height * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            image = ImageEnhance.Sharpness(image).enhance(1.2)
            image = ImageEnhance.Contrast(image).enhance(1.04)
            image = image.filter(ImageFilter.UnsharpMask(radius=1.4, percent=125, threshold=3))
            image.save(path, quality=95, optimize=True)
        return True
    except Exception:
        return False


def main() -> None:
    args = parse_args()
    root = Path(args.root)
    processed = 0
    for path in root.rglob("*"):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        if enhance_image(path, args.min_width):
            processed += 1

    print(f"Enhanced {processed} images.")


if __name__ == "__main__":
    main()
