/** @type {import('next').NextConfig} */

// 仅当部署到国内（CloudBase 云托管）时启用 standalone 产物，供容器部署使用。
// 海外 Vercel 部署不受此影响（行为与原先一致）。
const isDomestic = process.env.NEXT_PUBLIC_DEPLOY_ENV === 'domestic'

// 从环境变量读取 Supabase 域名，国内外镜像都能正确加载头像等图片
function supabaseImageHostname() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    return url.hostname
  } catch {
    return 'your-supabase-project.supabase.co'
  }
}

const nextConfig = {
  ...(isDomestic ? { output: 'standalone' } : {}),
  images: {
    // 用 remotePatterns 替代写死的 domains，按当前环境的 Supabase 域名动态加载
    remotePatterns: [
      { protocol: 'https', hostname: supabaseImageHostname() },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // 外接硬盘(H:)上 webpack 文件系统缓存会失败，改用内存缓存避免客户端 bundle 异常
  webpack: (config) => {
    config.cache = {
      type: 'memory',
    }
    return config
  },
}

module.exports = nextConfig
