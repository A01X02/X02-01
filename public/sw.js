/* 轻量 Service Worker：让 PWA 可"添加到主屏幕"并支持离线访问缓存的静态资源。
   策略：
   - 安装时预缓存图标/manifest（均为 public 下的静态文件，必定可访问）
   - 导航请求：网络优先，失败回退缓存首页
   - 静态资源：缓存优先，回退网络并写入缓存
   - API 与 Supabase 请求：不做缓存，直接走网络
*/
const CACHE = 'ai-chatbot-v1'
const PRECACHE = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 不拦截 API 与 Supabase 请求，保证数据实时性
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/index.html')))
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
          .catch(() => cached)
    )
  )
})
