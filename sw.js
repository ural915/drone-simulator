// Uygulama kabuğunu (HTML/CSS/JS/ikonlar) önbelleğe alır ki APK/PWA olarak paketlendiğinde
// internetsiz açılışta da beyaz ekran yerine arayüz görünsün. Cesium/harita gibi dış
// kaynaklara (farklı origin) dokunmuyoruz — onlar zaten internet gerektiriyor.
//
// ÖNEMLİ: "network-first" — önce ağdan taze sürümü çekmeyi dener, önbelleği o taze
// içerikle günceller; sadece ağ başarısız olursa (internetsiz) önbelleğe düşer. Eski
// "cache-first" strateji, internet varken bile eski dosyaları göstermeye devam
// ediyordu (her deploy'dan sonra kullanıcılar güncellemeyi hiç görmüyordu).
const CACHE_NAME = "drone-sim-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/joystick.js",
  "./js/input.js",
  "./js/drone.js",
  "./js/main.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // CDN / harita karoları — dokunma
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
