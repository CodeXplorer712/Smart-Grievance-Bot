const CACHE_NAME = 'sanitation-v1';
const ASSETS = [
    '/grievance-frontend/sanitation-login.html',
    '/grievance-frontend/sanitation-login.css',
    '/grievance-frontend/sanitation-login.js',
    '/grievance-frontend/sanitation.html',
    '/grievance-frontend/sanitation.css',
    '/grievance-frontend/sanitation.js'
];
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .catch(err => console.log('Cache error:', err))
    );
});
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
            .catch(() => caches.match(
                '/grievance-frontend/sanitation-login.html'))
    );
});
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
});
