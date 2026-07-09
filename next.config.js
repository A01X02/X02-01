/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['your-supabase-project.supabase.co'],
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
