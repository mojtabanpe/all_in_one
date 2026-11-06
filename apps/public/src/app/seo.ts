import { DOCUMENT, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn } from '@angular/router';

/** Runs during prerendering and client navigation; canonical URLs omit tracking queries. */
export function pageSeo(
  path: string,
  title: string,
  description: string,
): ResolveFn<boolean> {
  return () => {
    const document = inject(DOCUMENT);
    const meta = inject(Meta);
    const url = `https://poshtetgarm.ir${path}`;
    meta.updateTag({ name: 'description', content: description });
    meta.updateTag({ property: 'og:title', content: title });
    meta.updateTag({ property: 'og:description', content: description });
    meta.updateTag({ property: 'og:url', content: url });
    meta.updateTag({ name: 'twitter:title', content: title });
    meta.updateTag({ name: 'twitter:description', content: description });
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    return true;
  };
}
