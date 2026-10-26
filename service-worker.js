const CACHE='tanaka-chikusan-v1.5.0';
const ASSETS=["./sow-work.js?v=1.5.0","./sow-work-ui.js?v=1.5.0","./app.js?v=1.5.0","./finishing-ui.js?v=1.5.0","./simulation-model.js?v=1.5.0","./simulation-ui.js?v=1.5.0","./farrowing-forecast-ui.js?v=1.2.1","./app.css?v=1.5.0","./cloud-store.js?v=simulation-20261020","./cloud-ui.js?v=simulation-20261020","./inventory-ui.js?v=1.3.0","./maternal-lineage-ui.js?v=simulation-20261020","./recurring-reminders-ui.js?v=simulation-20261020","./sow-history-import-ui.js?v=simulation-20261020","./sow-history-import.js?v=notebook-import-20261020","./sow-history-import-ui.js?v=notebook-import-20261020","./launch-icon-192.png","./launch-icon-512.png","./manifest.webmanifest?v=launch-logo-20261018","./farrowing-actions.js?v=1.2.1","./weaning-record.js?v=target-correction-20261018","./farrowing-forecast.js?v=1.2.1","./gilt-model.js?v=1.5.0","./gilt-ui.js?v=1.5.0","./maternal-lineage.js?v=unnumbered-gilts-20261018","./maternal-lineage-ui.js?v=unnumbered-gilts-20261018","./maternal-lineage-seed.json","./","./index.html","./app.css","./model.js","./model.js?v=1.5.0","./finishing-model.js?v=1.5.0","./finishing-ui.js","./birth-validation.js","./inventory-model.js?v=1.5.0","./inventory-print.js?v=1.3.1","./app.js","./cloud-config.js","./cloud-store.js","./cloud-ui.js","./vendor/supabase-2.49.8.js","./vendor/591.supabase.js","./sow-parity.js?v=1.5.0","./sow-parity-ui.js?v=1.3.3","./schedules.js?v=1.5.0","./recurring-reminders.js?v=recurring-complete-20261017","./recurring-reminders-ui.js?v=recurring-complete-20261017","./manifest.webmanifest","./logo.png","./icon-192.png","./icon-512.png","./icon.svg"];
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



