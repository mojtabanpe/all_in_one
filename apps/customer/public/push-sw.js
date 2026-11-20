/* Poshtetgarm service worker: Angular's ngsw plus a reliable notification tap.
 *
 * ngsw tells the open app about a tap only after `client.focus()` succeeds. In an iPhone PWA
 * that call can fail, or the suspended page misses the message, so the app stayed where it was
 * and the reminder sheet never opened. Here the tap is also remembered in a cache entry and
 * posted to every window; the app reads (and removes) the entry when it starts, comes back to
 * the front or gets the message. If the entry is still there a few seconds later, the open
 * window never got the tap, so it is loaded at the notification's url instead.
 * This listener is registered before ngsw's, which still focuses or opens the window.
 */
const PUSH_CLICK_CACHE = 'aio-push-click';
/** How long the open app has to take the tap before its window is loaded at the url. */
const PUSH_CLICK_ACK_MS = 3000;
const PUSH_CLICK_POLL_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pendingAt(cache) {
  const response = await cache.match('pending');
  if (!response) return null;
  try {
    return (await response.json()).at;
  } catch {
    return null;
  }
}

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
      const at = Date.now();
      const cache = await caches.open(PUSH_CLICK_CACHE);
      await cache.put('pending', new Response(JSON.stringify({ url, at })));
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows)
        client.postMessage({ type: 'AIO_PUSH_CLICK' });

      for (let waited = 0; waited < PUSH_CLICK_ACK_MS;) {
        await sleep(PUSH_CLICK_POLL_MS);
        waited += PUSH_CLICK_POLL_MS;
        if ((await pendingAt(cache)) !== at) return; // the app took it (or a newer tap replaced it)
      }
      // No window took the tap. One is starting (ngsw opened it) when none is listed: it reads the entry
      // itself. Otherwise load the open window at the url; it opens the sheet as it starts.
      const open = await self.clients.matchAll({ type: 'window' });
      const target = new URL(url, self.location.origin).href;
      const client = open[0];
      if (!client || client.url === target || !('navigate' in client)) return;
      await cache.delete('pending');
      try {
        await client.navigate(target);
      } catch {
        /* Not controlled by this worker: nothing more can be done from here. */
      }
    })(),
  );
});

importScripts('./ngsw-worker.js');
