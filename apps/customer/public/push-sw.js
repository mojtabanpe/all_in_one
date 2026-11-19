/* Poshtetgarm service worker: Angular's ngsw plus a reliable notification tap.
 *
 * ngsw tells the open app about a tap only after `client.focus()` succeeds. In an iPhone PWA
 * that call can fail, or the suspended page misses the message, so the app stayed where it was
 * and the reminder sheet never opened. Here the tap is also remembered in a cache entry and
 * posted to every window; the app reads the entry when it starts or comes back to the front.
 * This listener is registered before ngsw's, which still focuses or opens the window.
 */
self.addEventListener('notificationclick', (event) => {
  const url =
    event.notification &&
    event.notification.data &&
    event.notification.data.url;
  if (
    typeof url !== 'string' ||
    !url.startsWith('/app/') ||
    url.startsWith('//')
  )
    return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open('aio-push-click');
      await cache.put(
        'pending',
        new Response(JSON.stringify({ url, at: Date.now() })),
      );
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows)
        client.postMessage({ type: 'AIO_PUSH_CLICK' });
    })(),
  );
});

importScripts('./ngsw-worker.js');
