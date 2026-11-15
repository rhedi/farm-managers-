// Service worker: cache-first app shell (precached per VERSION), network-first navigation with the
// cached index.html as offline fallback. A new version waits until the page asks it to take over
// (toast "Versi baru tersedia" in js/ui/pwa.js). After changing any file, regenerate VERSION and
// PRECACHE with the command in README → "Pasang di HP (PWA)".
const VERSION = "8363ca9c23";
const PREFIX = 'farm-manager-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  // PRECACHE:start
  "./index.html",
  "./manifest.webmanifest",
  "./css/breeding.css",
  "./css/economy.css",
  "./css/factories.css",
  "./css/fields.css",
  "./css/finance.css",
  "./css/juice.css",
  "./css/layout.css",
  "./css/levels.css",
  "./css/logistics.css",
  "./css/missions.css",
  "./css/ops.css",
  "./css/orchard.css",
  "./css/style.css",
  "./css/world.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./js/data.js",
  "./js/engine.js",
  "./js/engine/animals.js",
  "./js/engine/breeding.js",
  "./js/engine/contracts.js",
  "./js/engine/defs.js",
  "./js/engine/economy.js",
  "./js/engine/events.js",
  "./js/engine/factories.js",
  "./js/engine/factoryView.js",
  "./js/engine/fields.js",
  "./js/engine/greenhouse.js",
  "./js/engine/ledger.js",
  "./js/engine/logistics.js",
  "./js/engine/logisticsView.js",
  "./js/engine/market.js",
  "./js/engine/missions.js",
  "./js/engine/orchard.js",
  "./js/engine/persist.js",
  "./js/engine/plans.js",
  "./js/engine/purchase.js",
  "./js/engine/research.js",
  "./js/engine/rivals.js",
  "./js/engine/rng.js",
  "./js/engine/seasons.js",
  "./js/engine/soil.js",
  "./js/engine/storage.js",
  "./js/engine/taskrun.js",
  "./js/engine/tasks.js",
  "./js/engine/upgrades.js",
  "./js/engine/views.js",
  "./js/engine/wear.js",
  "./js/engine/weather.js",
  "./js/engine/workers.js",
  "./js/main.js",
  "./js/ui/achievements.js",
  "./js/ui/animalEcon.js",
  "./js/ui/animals.js",
  "./js/ui/app.js",
  "./js/ui/badges.js",
  "./js/ui/batchBar.js",
  "./js/ui/breeding.js",
  "./js/ui/contracts.js",
  "./js/ui/cropPicker.js",
  "./js/ui/dom.js",
  "./js/ui/ecoFmt.js",
  "./js/ui/eventsBanner.js",
  "./js/ui/factories.js",
  "./js/ui/farm.js",
  "./js/ui/feedback.js",
  "./js/ui/fieldModal.js",
  "./js/ui/fieldStatus.js",
  "./js/ui/finance.js",
  "./js/ui/financeChart.js",
  "./js/ui/forecast.js",
  "./js/ui/fx.js",
  "./js/ui/garage.js",
  "./js/ui/levelUp.js",
  "./js/ui/loans.js",
  "./js/ui/machineUpgrade.js",
  "./js/ui/mapFx.js",
  "./js/ui/market.js",
  "./js/ui/missions.js",
  "./js/ui/modal.js",
  "./js/ui/netWorthChart.js",
  "./js/ui/notify.js",
  "./js/ui/onboarding.js",
  "./js/ui/planEditor.js",
  "./js/ui/plot.js",
  "./js/ui/pwa.js",
  "./js/ui/research.js",
  "./js/ui/settings.js",
  "./js/ui/sfx.js",
  "./js/ui/shell.js",
  "./js/ui/shipping.js",
  "./js/ui/silo.js",
  "./js/ui/stock.js",
  "./js/ui/subtabs.js",
  "./js/ui/taskModal.js",
  "./js/ui/topbar.js",
  "./js/ui/workers.js",
  "./js/ui/yieldBreakdown.js",
  // PRECACHE:end
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? navigate(request) : cacheFirst(request));
});
