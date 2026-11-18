// Service worker: cache-first app shell (precached per VERSION), network-first navigation with the
// cached index.html as offline fallback. A new version takes over as soon as it has precached
// (skipWaiting + clients.claim); js/ui/pwa.js then saves and reloads open pages once. After changing
// any file, regenerate VERSION (here and in index.html) and PRECACHE with the command in README →
// "Pasang di HP (PWA)".
const VERSION = "4efbb18775";
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
  "./css/fish.css",
  "./css/juice.css",
  "./css/layout.css",
  "./css/legacy.css",
  "./css/levels.css",
  "./css/logistics.css",
  "./css/mandor.css",
  "./css/missions.css",
  "./css/ops.css",
  "./css/orchard.css",
  "./css/style.css",
  "./css/v16.css",
  "./css/v17.css",
  "./css/v18.css",
  "./css/world.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./js/data.js",
  "./js/engine.js",
  "./js/engine/animals.js",
  "./js/engine/autoFeed.js",
  "./js/engine/breeding.js",
  "./js/engine/calendar.js",
  "./js/engine/chapters.js",
  "./js/engine/contracts.js",
  "./js/engine/defs.js",
  "./js/engine/dispatcher.js",
  "./js/engine/economy.js",
  "./js/engine/encyclopedia.js",
  "./js/engine/events.js",
  "./js/engine/factories.js",
  "./js/engine/factoryManager.js",
  "./js/engine/factoryPlanner.js",
  "./js/engine/factoryView.js",
  "./js/engine/fields.js",
  "./js/engine/fish.js",
  "./js/engine/fishView.js",
  "./js/engine/greenhouse.js",
  "./js/engine/kabar.js",
  "./js/engine/kabarCore.js",
  "./js/engine/kabarDisasters.js",
  "./js/engine/kabarTypes.js",
  "./js/engine/kabarTypes2.js",
  "./js/engine/kabarTypes3.js",
  "./js/engine/league.js",
  "./js/engine/ledger.js",
  "./js/engine/legacy.js",
  "./js/engine/legacyPerks.js",
  "./js/engine/logistics.js",
  "./js/engine/logisticsView.js",
  "./js/engine/mandor.js",
  "./js/engine/market.js",
  "./js/engine/missions.js",
  "./js/engine/offline.js",
  "./js/engine/orchard.js",
  "./js/engine/overflow.js",
  "./js/engine/persist.js",
  "./js/engine/plans.js",
  "./js/engine/projects.js",
  "./js/engine/projectsView.js",
  "./js/engine/purchase.js",
  "./js/engine/quality.js",
  "./js/engine/report.js",
  "./js/engine/research.js",
  "./js/engine/rewards.js",
  "./js/engine/rivals.js",
  "./js/engine/rng.js",
  "./js/engine/saturation.js",
  "./js/engine/seasons.js",
  "./js/engine/soil.js",
  "./js/engine/staff.js",
  "./js/engine/stockKeep.js",
  "./js/engine/storage.js",
  "./js/engine/taskrun.js",
  "./js/engine/tasks.js",
  "./js/engine/tenders.js",
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
  "./js/ui/autoFeedToggle.js",
  "./js/ui/badges.js",
  "./js/ui/batchBar.js",
  "./js/ui/breeding.js",
  "./js/ui/calendar.js",
  "./js/ui/contracts.js",
  "./js/ui/cropPicker.js",
  "./js/ui/dispatcher.js",
  "./js/ui/dom.js",
  "./js/ui/ecoFmt.js",
  "./js/ui/encyclopedia.js",
  "./js/ui/eventsBanner.js",
  "./js/ui/factories.js",
  "./js/ui/factoryBlock.js",
  "./js/ui/factoryManager.js",
  "./js/ui/factoryManagerParts.js",
  "./js/ui/farm.js",
  "./js/ui/feedback.js",
  "./js/ui/fieldModal.js",
  "./js/ui/fieldStatus.js",
  "./js/ui/finance.js",
  "./js/ui/financeChart.js",
  "./js/ui/fish.js",
  "./js/ui/fishArt.js",
  "./js/ui/fishFx.js",
  "./js/ui/fishShop.js",
  "./js/ui/forecast.js",
  "./js/ui/fx.js",
  "./js/ui/garage.js",
  "./js/ui/kabar.js",
  "./js/ui/league.js",
  "./js/ui/legacy.js",
  "./js/ui/levelUp.js",
  "./js/ui/loans.js",
  "./js/ui/machineUpgrade.js",
  "./js/ui/mandor.js",
  "./js/ui/mapFx.js",
  "./js/ui/mapLandmarks.js",
  "./js/ui/market.js",
  "./js/ui/missions.js",
  "./js/ui/modal.js",
  "./js/ui/morningReport.js",
  "./js/ui/netWorthChart.js",
  "./js/ui/notify.js",
  "./js/ui/onboarding.js",
  "./js/ui/overflowCard.js",
  "./js/ui/planEditor.js",
  "./js/ui/plot.js",
  "./js/ui/projects.js",
  "./js/ui/pwa.js",
  "./js/ui/quality.js",
  "./js/ui/research.js",
  "./js/ui/settings.js",
  "./js/ui/sfx.js",
  "./js/ui/shell.js",
  "./js/ui/shippedCard.js",
  "./js/ui/shipping.js",
  "./js/ui/silo.js",
  "./js/ui/stock.js",
  "./js/ui/subtabs.js",
  "./js/ui/taskModal.js",
  "./js/ui/tender.js",
  "./js/ui/theme.js",
  "./js/ui/topbar.js",
  "./js/ui/workers.js",
  "./js/ui/yieldBreakdown.js",
  // PRECACHE:end
];

// cache.addAll is all-or-nothing: one dropped request on mobile data (or one file missing after a bad
// deploy) failed the whole install, and the phone kept the old version. Each file is fetched on its own:
// network errors are retried, and the install only fails (old version kept, retried at the next update
// check) when the network is really gone. A file the server refuses (404…) is logged and skipped; the
// page fetches it on first use.
const NETWORK_TRIES = 3;

async function precacheFile(cache, url) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { cache: 'reload' });
    } catch (e) {
      if (attempt >= NETWORK_TRIES) throw e;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      continue;
    }
    if (!res.ok) return `${url} (HTTP ${res.status})`;
    await cache.put(url, res);
    return null;
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  const skipped = (await Promise.all(PRECACHE.map((url) => precacheFile(cache, url)))).filter(Boolean);
  if (skipped.length) console.warn(`Precache ${VERSION}: ${skipped.length} file dilewati: ${skipped.join(', ')}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE);
    for (const key of old) await caches.delete(key);
    await self.clients.claim();
    if (!old.length) return; // first install: the open page already runs these files
    // Open pages still run the previous files, and pages from before automatic updates never reload
    // themselves: navigate them once (pagehide saves the game). Not awaited — navigation fetches wait
    // for this activation to finish.
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
  })());
});

// Network requests revalidate with the server (no-cache): GitHub Pages sends max-age=600, and a page or
// file the browser fetched minutes before a deploy must not be served (and cached) next to new files.
// Chrome ignores the cache option on a copy of a navigation request, so navigations fetch the URL itself.
async function navigate(request) {
  try {
    return await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request, { cache: 'no-cache' });
  if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? navigate(request) : cacheFirst(request));
});
