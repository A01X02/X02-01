import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import PWARegister from '@/components/PWARegister'

const inter = Inter({ subsets: ['latin'] })

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
      <body className={inter.className}>
        {children}
        <Toaster position="top-center" />
        <PWARegister />
      </body>
    </html>
  )
}
