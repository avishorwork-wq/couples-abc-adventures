const CACHE='alphabet-us-v2';
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
  if(e.request.mode==='navigate'||u.pathname.endsWith('.html')||u.pathname.endsWith('/')){
    // HTML: network first so updates land immediately; cache as offline fallback
    e.respondWith(
      fetch(e.request).then(r=>{
        if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
        return r;
      }).catch(()=>caches.match(e.request).then(h=>h||caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      if(r.ok&&e.request.method==='GET'){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
      return r;
    }))
  );
});
