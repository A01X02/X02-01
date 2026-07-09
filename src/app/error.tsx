'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('全局错误:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'sans-serif', padding: '24px', background: '#F5F5F5' }}>
        <div style={{ maxWidth: 480, margin: '40px auto', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>出错了</h2>
          <pre style={{ fontSize: 12, background: '#ECF0F1', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {error.message}
            {error.digest ? `\ndigest: ${error.digest}` : ''}
          </pre>
          <button onClick={reset} style={{ marginTop: 16, width: '100%', background: '#E8A87C', color: '#fff', padding: 10, borderRadius: 8, border: 'none' }}>
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
