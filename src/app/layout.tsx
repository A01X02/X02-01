import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import PWARegister from '@/components/PWARegister'

// 注意：原先使用 next/font/google 的 Inter 字体，但 build 时需连 Google 拉字体，
// 在国内服务器（如 CloudBase）build 会卡死失败。现改为 globals.css 中已有的
// 系统中文字体栈（PingFang SC / 微软雅黑等），国内外构建都不再依赖 Google，
// 中文显示效果也更好。如需恢复 Inter，可改回 next/font/google。

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#DAA001',
}

export const metadata: Metadata = {
  title: '夏以昼 · AI陪伴',
  description: '基于豆包的智能聊天陪伴，支持语音对话与朋友圈',
  manifest: '/manifest.json',
  applicationName: '夏以昼',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '夏以昼',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster position="top-center" />
        <PWARegister />
      </body>
    </html>
  )
}
