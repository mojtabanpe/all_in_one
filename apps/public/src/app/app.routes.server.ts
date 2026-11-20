import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { appRoutes } from './app.routes';

export const serverRoutes: ServerRoute[] = [
  ...appRoutes.flatMap<ServerRoute>(({ path }) =>
    path !== undefined && path !== '**' && !path.includes(':')
      ? [{ path, renderMode: RenderMode.Prerender }]
      : [],
  ),
  {
    // One page per catalog exercise; any other slug is not a page.
    path: 'exercises/:slug',
    renderMode: RenderMode.Prerender,
    fallback: PrerenderFallback.None,
    getPrerenderParams: async () =>
      (await import('./pages/exercise-data')).EXERCISE_PAGES.map(
        (exercise) => ({ slug: exercise.slug }),
      ),
  },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
