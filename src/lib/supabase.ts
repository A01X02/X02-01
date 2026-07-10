import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { domesticClient as cbClient, domesticAdminClient as cbAdminClient } from './cloudbase-client'

// ─── 部署环境检测 ───
// 'domestic' → 使用 CloudBase PG（国内免翻墙）
// 其他（含 undefined）→ 使用 Supabase（海外版）
const IS_DOMESTIC = process.env.NEXT_PUBLIC_DEPLOY_ENV === 'domestic'

// ════════════════════════════════════════
// 海外模式：URL 预处理（去除多余路径后缀）
// ════════════════════════════════════════
function normalizeSupabaseUrl(raw: string): string {
  try {
    const url = new URL(raw)
    return url.origin
  } catch {
    return raw
  }
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// ════════════════════════════════════════
// 统一顶层导出（根据环境切换实现）
// ════════════════════════════════════════
export const supabase: any = IS_DOMESTIC
  ? cbClient
  : createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin: any = IS_DOMESTIC
  ? cbAdminClient
  : (process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
      })
      : null)
