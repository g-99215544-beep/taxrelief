const CACHE_NAME = 'receipt-tracker-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/upload.html',
    '/insights.html',
    '/app.js',
    '/auth.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-receipts') {
        event.waitUntil(syncReceipts());
    }
});

async function syncReceipts() {
    const db = await openDB();
    const tx = db.transaction('pending-receipts', 'readonly');
    const store = tx.objectStore('pending-receipts');
    const receipts = await store.getAll();
    
    for (const receipt of receipts) {
        try {
            await uploadReceipt(receipt);
            await deleteFromPendingStore(receipt.id);
        } catch (error) {
            console.error('Failed to sync receipt:', error);
        }
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ReceiptTrackerDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending-receipts')) {
                db.createObjectStore('pending-receipts', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function uploadReceipt(receipt) {
    console.log('Uploading receipt:', receipt);
}

async function deleteFromPendingStore(id) {
    const db = await openDB();
    const tx = db.transaction('pending-receipts', 'readwrite');
    const store = tx.objectStore('pending-receipts');
    await store.delete(id);
}

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    
    const title = data.title || 'Receipt Tax Tracker';
    const options = {
        body: data.body || 'New notification',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: data.url || '/'
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});
