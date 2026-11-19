import { RenderMode, ServerRoute } from '@angular/ssr';
import { appRoutes } from './app.routes';

export const serverRoutes: ServerRoute[] = [
  ...appRoutes.flatMap<ServerRoute>(({ path }) =>
    path !== undefined && path !== '**'
      ? [{ path, renderMode: RenderMode.Prerender }]
      : [],
  ),
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
