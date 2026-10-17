const CACHE='tanaka-chikusan-v3-home-summary-cleanup-20261018';
const ASSETS=['./','./index.html','./app.css','./app.css?v=home-summary-cleanup-20261018','./model.js','./model.js?v=inventory-20261015','./finishing-model.js?v=yard-quick-month-20261016','./finishing-ui.js','./finishing-ui.js?v=sow-number-select-20261016','./birth-validation.js','./inventory-model.js?v=inventory-plan-repair-20261016','./inventory-ui.js?v=inventory-plan-no10-20261016','./inventory-print.js?v=inventory-plan-no10-20261016','./app.js','./app.js?v=home-summary-cleanup-20261018','./cloud-config.js','./cloud-store.js','./cloud-ui.js','./vendor/supabase-2.49.8.js','./vendor/591.supabase.js','./sow-parity.js?v=parity-cards-20261017','./sow-parity-ui.js?v=parity-cards-20261017','./schedules.js?v=recurring-complete-20261017','./recurring-reminders.js?v=recurring-complete-20261017','./recurring-reminders-ui.js?v=recurring-complete-20261017','./manifest.webmanifest','./logo.png','./icon-192.png','./icon-512.png','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tanaka-chikusan-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
    return response;
  }).catch(async()=>{
    const cached=await caches.match(e.request);if(cached)return cached;
    if(e.request.mode==='navigate')return caches.match('./index.html');
    return new Response('Offline',{status:503});
  }));
});



