/**
 * CloudBase PG 适配层 —— 对外暴露与 @supabase/supabase-js 兼容的接口
 *
 * 使用方式：在 supabase.ts 中通过 NEXT_PUBLIC_DEPLOY_ENV=domestic 切换到本模块。
 * 业务代码无需任何改动，import 路径不变（仍从 @/lib/supabase 导入）。
 *
 * 依据腾讯云官方文档（2026-07 版）确认：
 *   - 客户端 SDK：@cloudbase/js-sdk v3（@cloudbase/node-sdk 已停维护，v3 内置 Node 适配）
 *   - PG 模式数据库入口：app.rdb()  —— 注意「传统模式」用 app.database().collection()，
 *     「PG 模式」才用 rdb().from()，两者入口不同。本项目是 PG 模式。
 *   - rdb().from() / .insert() / .update() / .delete() / .upsert() / .rpc()
 *     链式 API 与 Supabase 完全一致（官方迁移文档确认零改动）。
 *   - 浏览器端鉴权：init({ env, accessKey })  → accessKey = Publishable Key（等价 anon）
 *   - 服务端鉴权：init({ env }) 自动读取 CLOUDBASE_APIKEY 环境变量
 *     （控制台生成的「服务端 API Key」，等价于 service_role，BYPASS RLS）
 */

import cloudbase from '@cloudbase/js-sdk'

// 环境地域：上海（x02-01 所在地域，必须与实际一致，否则请求失败）
const REGION = process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai'
const ENV_ID = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID!

// ─── 浏览器端 app（Publishable Key，匿名角色，受 RLS 约束）───
let _app: any = null
function getApp(): any {
  if (!_app) {
    _app = cloudbase.init({
      env: ENV_ID,
      region: REGION,
      accessKey: process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY!,
    })
  }
  return _app
}

// ─── 服务端管理 app（CLOUDBASE_APIKEY，管理员权限，BYPASS RLS）───
// 对应 Supabase 的 service_role key。
// 文档约定：自建服务器把「服务端 API Key」配到 CLOUDBASE_APIKEY 环境变量，
// SDK 自动读取，无需在 init 里显式传参。
let _adminApp: any = null
function getAdminApp(): any {
  if (!_adminApp) {
    const params: any = { env: ENV_ID, region: REGION }
    // 若同时提供了腾讯云 CAM 密钥（secretId+secretKey），则优先用它们（同样是管理员）
    if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
      params.secretId = process.env.TENCENTCLOUD_SECRETID
      params.secretKey = process.env.TENCENTCLOUD_SECRETKEY
    }
    _adminApp = cloudbase.init(params)
  }
  return _adminApp
}

// ─── 浏览器端客户端（等价于 export const supabase）───

export const domesticClient: any = {
  /** 数据库操作 —— PG 模式入口是 rdb()，内部 .from() 与 Supabase 完全一致 */
  from: (table: string) => getApp().rdb().from(table),
  /** RPC 调用 —— 与 Supabase .rpc() 完全兼容 */
  rpc: (fn: string, params?: object) => getApp().rdb().rpc(fn, params),
  auth: {
    async getUser() {
      return getApp().auth.getUser()
    },
    async signInAnonymously() {
      return getApp().auth.signInAnonymously()
    },
    /**
     * 密码登录：CloudBase 参数为 { username, password }（也接受 email 作为 username）
     * Supabase 为 { email, password } —— 这里做桥接
     */
    async signInWithPassword(params: { email?: string; password?: string }) {
      return getApp().auth.signInWithPassword({
        username: params.email || params.username || '',
        password: params.password,
      })
    },
    /**
     * 注册：CloudBase PG 的 signUp 为账号密码流程，参数同 Supabase 的 email+password
     */
    async signUp(params: { email?: string; password?: string }) {
      return getApp().auth.signUp({
        email: params.email || params.username || '',
        password: params.password,
      })
    },
    async signOut() {
      return getApp().auth.signOut()
    },
    async getSession() {
      return getApp().auth.getSession()
    },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      return getApp().auth.onAuthStateChange(callback)
    },
  },
}

// ─── 服务端管理客户端（等价于 export const supabaseAdmin）───
// 使用 CLOUDBASE_APIKEY（服务端 API Key），具备 BYPASS RLS 权限

export const domesticAdminClient: any = {
  from: (table: string) => getAdminApp().rdb().from(table),
  rpc: (fn: string, params?: object) => getAdminApp().rdb().rpc(fn, params),
  auth: domesticClient.auth,
}
