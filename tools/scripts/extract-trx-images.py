#!/usr/bin/env python3
"""Extract complete exercise illustrations without English text from TRX PDFs.

Requires PyMuPDF and Pillow. Run from any directory.
"""
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/references/trx'
OUTPUT = ROOT / 'apps/customer/public/assets/trx'


def extract():
    manifest = json.loads((SOURCE / 'images.json').read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, slugs in manifest.items():
        with pymupdf.open(SOURCE / filename) as document:
            for page_number, slug in enumerate(slugs, start=4):
                page = document[page_number - 1]
                photos = [image for image in page.get_image_info()
                          if min(image['width'], image['height']) >= 200]
                if not photos:
                    raise ValueError(f'No exercise photos: {filename}, page {page_number}')
                bounds = pymupdf.Rect(photos[0]['bbox'])
                for photo in photos[1:]:
                    bounds |= pymupdf.Rect(photo['bbox'])
                bounds = (bounds + (-6, -6, 6, 6)) & page.rect
                # Remove text and decorative vectors, preserving photos. Rendering the
                # original page honors its image decoding, clipping and mirrored placement.
                page.add_redact_annot(page.rect, fill=False)
                page.apply_redactions(images=0, graphics=2)
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=bounds, alpha=False)
                photo = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
                fitted = ImageOps.contain(photo, (1400, 700))
                canvas = Image.new('RGB', (1400, 700), 'white')
                canvas.paste(fitted, ((1400 - fitted.width) // 2, (700 - fitted.height) // 2))
                canvas.save(OUTPUT / f'{slug}.webp', 'WEBP', quality=85, method=6)
                print(f'{slug}: {len(photos)} photos')


if __name__ == '__main__':
    extract()
