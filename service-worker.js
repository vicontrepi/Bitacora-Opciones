const CACHE_NAME="options-pro-v7-6-4-cache";
const ASSETS=["./","./index.html","./styles.css","./charts.js","./pro_v7_6.js","./manifest.webmanifest","./service-worker.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});