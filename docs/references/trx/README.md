# TRX references supplied by the owner

The five original PDFs in this directory were supplied on 2026-10-31 as references for the health applet. They contain 30 exercise entries, including six stretches. Copyright and trademarks remain with the original publisher (Fitness Anywhere / TRX); these files are reference material, not original Poshtetgarm artwork.

The customer app displays **only the exercise photos**, extracted from pages 4–9. It does not display complete English PDF pages. Instructions, common mistakes, alternatives and reference volume are presented in Persian. Reference sets, repetitions, seconds and rests describe the PDF routine; they are not a personalized prescription. Per-side entries are explicitly marked.

- Source-page mapping: `images.json` (array order corresponds to pages 4–9).
- Exercise content and reference volume: `libs/applets/health/api/src/lib/trx-catalog.ts`.
- Generated photos: `apps/customer/public/assets/trx/<exercise-slug>.webp`.
- Regenerate with `python3 tools/scripts/extract-trx-images.py` (requires PyMuPDF and Pillow). The script removes text, renders only the area occupied by exercise photos while preserving their original colors and placement, and outputs 1400×700 WebP images without headings, English instructions, or repetition labels.

The original seven TRX exercises remain compatible with saved routines. Five match source entries; 25 new entries bring the TRX catalog to 32 exercises. In particular, the guide's suspended lunge is separate from the existing assisted lunge, and the source's low row maps to the existing TRX row. The six stretches are excluded from automatic strength-session generation but remain available in the exercise library and manual routine editor.

Catalog seeding strips transient guide metadata before Prisma writes. The API attaches the versioned guide metadata to catalog responses. Existing manually assigned video URLs are retained. The normal startup catalog seeder adds the exercises without a database migration.
