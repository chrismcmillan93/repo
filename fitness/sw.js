// The Fitness app has been retired into Life. Phones that installed it still have the old
// service worker; this replacement removes itself: it clears the old caches, unregisters,
// and sends any open window on to Life.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('fitness-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach((w) => { try { w.navigate('../life/#/health'); } catch (_) { /* ignore */ } });
  })());
});
// No fetch handler: everything goes straight to the network.
