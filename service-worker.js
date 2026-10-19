const CACHE='tanaka-chikusan-v3-yard-swipe-20261019';
const ASSETS=['./launch-icon-192.png','./launch-icon-512.png','./manifest.webmanifest?v=launch-logo-20261018','./farrowing-actions.js?v=capacity-common-20261019','./weaning-record.js?v=target-correction-20261018','./farrowing-forecast.js?v=capacity-common-20261019','./farrowing-forecast-ui.js?v=piglet-wording-20261019','./gilt-model.js?v=gilt-stages-20261018','./gilt-ui.js?v=gilt-stages-20261018','./maternal-lineage.js?v=unnumbered-gilts-20261018','./maternal-lineage-ui.js?v=unnumbered-gilts-20261018','./maternal-lineage-seed.json','./','./index.html','./app.css','./app.css?v=yard-swipe-20261019','./model.js','./model.js?v=unnumbered-gilts-20261018','./finishing-model.js?v=candidate-meat-20261019','./finishing-ui.js','./finishing-ui.js?v=candidate-meat-20261019','./birth-validation.js','./inventory-model.js?v=candidate-meat-20261019','./inventory-ui.js?v=candidate-meat-20261019','./inventory-print.js?v=candidate-meat-20261019','./app.js','./app.js?v=yard-swipe-20261019','./cloud-config.js','./cloud-store.js','./cloud-ui.js','./vendor/supabase-2.49.8.js','./vendor/591.supabase.js','./sow-parity.js?v=parity-cards-20261017','./sow-parity-ui.js?v=unnumbered-gilts-20261018','./schedules.js?v=unnumbered-gilts-20261018','./recurring-reminders.js?v=recurring-complete-20261017','./recurring-reminders-ui.js?v=recurring-complete-20261017','./manifest.webmanifest','./logo.png','./icon-192.png','./icon-512.png','./icon.svg'];
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



