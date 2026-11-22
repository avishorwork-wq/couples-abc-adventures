const CACHE='alphabet-us-v1';
const ASSETS=['./','./index.html','./manifest.json','./prism.js','./styled.js','./icon-recolor.js',
  './fonts/inter-var.woff2','./fonts/fraunces-var.woff2','./fonts/fraunces-it-var.woff2',
  './icons/master-1024.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin||u.pathname.includes('/media'))return; // API + media: network only
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      if(r.ok&&e.request.method==='GET'){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
      return r;
    }))
  );
});
