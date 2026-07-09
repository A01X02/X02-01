'use client'

import { useEffect } from 'react'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('页面运行时错误:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-gray p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-dark-gray mb-2">页面出错了</h2>
        <p className="text-sm text-medium-gray mb-4">
          已捕获到一个客户端错误，请把下面的信息发给我：
        </p>
        <pre className="text-xs bg-light-gray rounded-lg p-3 text-dark-gray overflow-auto max-h-48 whitespace-pre-wrap">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <button
          onClick={reset}
          className="mt-4 w-full bg-primary-orange text-white py-2 rounded-lg text-sm font-medium"
        >
          重试
        </button>
      </div>
    </div>
  )
}
