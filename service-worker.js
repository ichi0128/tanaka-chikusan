const CACHE='tanaka-chikusan-v3-inventory-visible-totals-20261016';
const ASSETS=['./','./index.html','./app.css','./app.css?v=inventory-visible-totals-20261016','./model.js','./model.js?v=inventory-20261015','./finishing-model.js?v=yard-quick-month-20261016','./finishing-ui.js','./finishing-ui.js?v=yard-quick-month-20261016','./birth-validation.js','./inventory-model.js?v=yard-quick-month-20261016','./inventory-ui.js?v=inventory-visible-totals-20261016','./app.js','./app.js?v=inventory-20261015','./cloud-config.js','./cloud-store.js','./cloud-ui.js','./vendor/supabase-2.49.8.js','./vendor/591.supabase.js','./schedules.js','./manifest.webmanifest','./logo.png','./icon-192.png','./icon-512.png','./icon.svg'];
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



