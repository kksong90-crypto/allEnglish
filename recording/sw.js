const CACHE='allbarun-recording-v8214-mobile-queue-recovery';
const ASSETS=['./','index.html','styles.css','app.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('allbarun-recording-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
 const navigation=request.mode==='navigate';
 const asset=new URL(request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
 if(!navigation&&!ASSETS.includes(asset))return;
 event.respondWith(loadAsset(request,navigation));
});

async function loadAsset(request,navigation){
 const cache=await caches.open(CACHE).catch(()=>null);
 try{
  const response=await fetch(request,{cache:'no-store'});
  if(response.ok){
   if(cache)await cache.put(request,response.clone()).catch(()=>{});
   return response;
  }
  const fallback=await cachedAsset(cache,request,navigation);
  return fallback||response;
 }catch(_){
  return await cachedAsset(cache,request,navigation)||Response.error();
 }
}

async function cachedAsset(cache,request,navigation){
 if(!cache)return null;
 return await cache.match(request).catch(()=>null)||(navigation?await cache.match('index.html').catch(()=>null):null);
}
