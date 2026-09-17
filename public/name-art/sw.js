// Never cache guest posters, private URLs, device credentials or API responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Name Art — Offline</title><body style="background:#f3eadb;color:#153e2e;font-family:Arial;text-align:center;padding:20vh 24px"><h1>We’ll be right back.</h1><p>Reconnect this screen to the internet, then reload.</p><button onclick="location.reload()" style="padding:15px 30px">Reconnect</button>',{headers:{'Content-Type':'text/html'}})));
});
