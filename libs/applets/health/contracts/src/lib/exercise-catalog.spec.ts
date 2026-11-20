import { readFileSync } from 'node:fs';
import { EXERCISE_CATALOG } from './exercise-catalog';

describe('exercise catalog', () => {
  it('has unique slugs', () => {
    const slugs = EXERCISE_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The public site prerenders one page per exercise (directive 182); its static sitemap must list them all.
  it('is listed in the public sitemap', () => {
    const sitemap = readFileSync(
      new URL(
        '../../../../../../apps/public/public/sitemap.xml',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sitemap).toContain('<loc>https://poshtetgarm.ir/exercises</loc>');
    for (const { slug } of EXERCISE_CATALOG)
      expect(sitemap).toContain(
        `<loc>https://poshtetgarm.ir/exercises/${slug}</loc>`,
      );
  });
});
