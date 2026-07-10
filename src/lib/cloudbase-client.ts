/**
 * CloudBase PG 适配层 —— 对外暴露与 @supabase/supabase-js 兼容的接口
 *
 * 使用方式：在 supabase.ts 中通过 NEXT_PUBLIC_DEPLOY_ENV=domestic 切换到本模块。
 * 业务代码无需任何改动，import 路径不变（仍从 @/lib/supabase 导入）。
 *
 * ⚠️ 本模块采用「懒初始化」模式：export 的对象在模块加载时不会触发
 *    CloudBase SDK 的 init()，只有实际调用 .from()/.auth.xxx() 时才初始化。
 *    这样海外模式（Vercel）构建时 import 本模块不会崩溃。
 *
 * 依据腾讯云官方文档（2026-07 版）确认：
 *   - 客户端 SDK：@cloudbase/js-sdk v3
 *   - PG 模式数据库入口：app.rdb().from()
 *   - 浏览器端鉴权：init({ env, accessKey })  → accessKey = Publishable Key
 *   - 服务端鉴权：init({ env }) 自动读取 CLOUDBASE_APIKEY 环境变量
 */

// ─── 懒加载 CloudBase SDK（避免海外构建时 crash）───
let _cloudbase: any = null
function getSDK(): any {
  if (!_cloudbase) {
    _cloudbase = require('@cloudbase/js-sdk')
  }
  return _cloudbase
}

const REGION = process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai'
const ENV_ID = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID || ''

// ─── 浏览器端 app（懒初始化）───
let _app: any = null
function getApp(): any {
  if (!_app && ENV_ID) {
    const sdk = getSDK()
    _app = sdk.init({
      env: ENV_ID,
      region: REGION,
      accessKey: process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY || '',
    })
  }
  return _app
}

// ─── 服务端管理 app（懒初始化）───
let _adminApp: any = null
function getAdminApp(): any {
  if (!_adminApp && ENV_ID) {
    const sdk = getSDK()
    const params: any = { env: ENV_ID, region: REGION }
    if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
      params.secretId = process.env.TENCENTCLOUD_SECRETID
      params.secretKey = process.env.TENCENTCLOUD_SECRETKEY
    }
    _adminApp = sdk.init(params)
  }
  return _adminApp
}

// ─── 浏览器端客户端（等价于 supabase）───
export const domesticClient: any = {
  from: (table: string) => getApp()?.rdb()?.from(table),
  rpc: (fn: string, params?: object) => getApp()?.rdb()?.rpc(fn, params),
  auth: {
    async getUser() { return getApp()?.auth?.getUser?.() },
    async signInAnonymously() { return getApp()?.auth?.signInAnonymously?.() },
    async signInWithPassword(params: { email?: string; password?: string }) {
      return getApp()?.auth?.signInWithPassword?.({
        username: params.email || (params as any).username || '',
        password: params.password,
      })
    },
    async signUp(params: { email?: string; password?: string }) {
      return getApp()?.auth?.signUp?.({
        email: params.email || (params as any).username || '',
        password: params.password,
      })
    },
    async signOut() { return getApp()?.auth?.signOut?.() },
    async getSession() { return getApp()?.auth?.getSession?.() },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      return getApp()?.auth?.onAuthStateChange?.(callback)
    },
  },
}

// ─── 服务端管理客户端（等价于 supabaseAdmin）───
export const domesticAdminClient: any = {
  from: (table: string) => getAdminApp()?.rdb()?.from(table),
  rpc: (fn: string, params?: object) => getAdminApp()?.rdb()?.rpc(fn, params),
  auth: domesticClient.auth,
}
