import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 确保 URL 不带 /rest/v1 等路径后缀
// Supabase JS 客户端内部会自行拼接 /auth/v1/*、/rest/v1/* 等路径
// 如果用户在 Vercel 变量里填了 https://xxx.supabase.co/rest/v1 会导致
// Auth 请求变成 .../rest/v1/auth/v1/signup → "Invalid path specified" 错误
function normalizeSupabaseUrl(raw: string): string {
  try {
    const url = new URL(raw)
    // 只保留 origin (protocol + hostname + port)，丢弃所有路径
    return url.origin
  } catch {
    return raw
  }
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 浏览器端客户端（仅依赖 NEXT_PUBLIC_ 变量，客户端可用）
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

// 服务端专用客户端：service_role key 非 NEXT_PUBLIC 前缀，在浏览器端为 undefined。
// 必须做条件判断，避免把 createClient(undefined) 打进客户端 bundle 导致
// "supabaseKey is required" 崩溃（模块求值阶段错误，error boundary 兜不住 → 白屏）。
export const supabaseAdmin: SupabaseClient = (process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null) as SupabaseClient
