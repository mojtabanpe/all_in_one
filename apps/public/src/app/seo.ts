import { DOCUMENT, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn } from '@angular/router';

const STRUCTURED_DATA_ID = 'aio-structured-data';
const ORIGIN = 'https://poshtetgarm.ir';

/** The site and its publisher, for the home page. */
export const SITE_STRUCTURED_DATA = {
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Poshtetgarm',
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/brand-logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: 'Poshtetgarm',
      url: `${ORIGIN}/`,
      inLanguage: 'fa',
      publisher: { '@id': `${ORIGIN}/#organization` },
    },
  ],
};

/** The questions a guide already shows on the page. */
export function faqStructuredData(
  questions: readonly { title: string; body: string }[],
): object {
  return {
    '@type': 'FAQPage',
    inLanguage: 'fa',
    mainEntity: questions.map((question) => ({
      '@type': 'Question',
      name: question.title,
      acceptedAnswer: { '@type': 'Answer', text: question.body },
    })),
  };
}

/** Runs during prerendering and client navigation; canonical URLs omit tracking queries. */
export function pageSeo(
  path: string,
  title: string,
  description: string,
  structuredData?: object,
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
    // One JSON-LD block per page, replaced on navigation and removed where the page has none.
    document.getElementById(STRUCTURED_DATA_ID)?.remove();
    if (structuredData) {
      const script = document.createElement('script');
      script.id = STRUCTURED_DATA_ID;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        ...structuredData,
      }).replace(/</g, '\\u003c');
      document.head.appendChild(script);
    }
    return true;
  };
}
