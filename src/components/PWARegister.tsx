'use client'

import { useEffect } from 'react'

/** 在客户端注册 Service Worker，使 PWA 可安装/离线可用 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] SW 注册失败:', err)
      })
    }
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
