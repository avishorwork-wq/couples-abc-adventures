const CACHE='alphabet-us-v3-20261122-3';
const ASSETS=['./','./index.html','./manifest.json','./prism.js','./scanfx.js','./styled.js','./icon-recolor.js',
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
  // static assets: stale-while-revalidate so new deploys land on next load
  e.respondWith(
    caches.match(e.request).then(hit=>{
      const net=fetch(e.request).then(r=>{
        if(r.ok&&e.request.method==='GET'){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
        return r;
      }).catch(()=>hit);
      return hit||net;
    })
  );
});

/* ---------- web push ---------- */
self.addEventListener('push', e => {
  let d = { title: 'Alphabet Us', body: 'Something new' };
  try { Object.assign(d, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(String(d.title || 'Alphabet Us'), {
    body: String(d.body || ''),
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'alphabet-us'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
      return clients.openWindow('./');
    })
  );
});
