const CACHE='allbarun-recording-v7482';
const ASSETS=['./','index.html','styles.css','app.js','manifest.webmanifest','icon-192.png','icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const isAppShell=event.request.mode==='navigate'||/\/(?:index\.html|app\.js|styles\.css)$/.test(url.pathname);
  if(isAppShell){
    event.respondWith(
      fetch(event.request,{cache:'no-store'}).then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }))
  );
});
