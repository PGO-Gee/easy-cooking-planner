"""Build compact gallery assets without changing the original recipe photos."""
from pathlib import Path
from PIL import Image, ImageOps

directory = Path(__file__).resolve().parents[1] / 'images' / 'recipes'
source_bytes = output_bytes = count = 0
for source in sorted(directory.glob('*.jpg')):
    if source.stem.endswith('-thumb'):
        continue
    target = source.with_name(source.stem + '-card.webp')
    with Image.open(source) as image:
        image = ImageOps.fit(ImageOps.exif_transpose(image).convert('RGB'), (384, 288), method=Image.Resampling.LANCZOS)
        image.save(target, 'WEBP', quality=78, method=6)
    source_bytes += source.stat().st_size
    output_bytes += target.stat().st_size
    count += 1
print(f'{count} gallery images: {source_bytes:,} original bytes -> {output_bytes:,} card bytes ({100 * (1 - output_bytes / source_bytes):.1f}% smaller)')
