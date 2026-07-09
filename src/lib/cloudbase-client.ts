/**
 * CloudBase PG 适配层 —— 对外暴露与 @supabase/supabase-js 兼容的接口
 *
 * 使用方式：在 supabase.ts 中通过 NEXT_PUBLIC_DEPLOY_ENV=domestic 切换到本模块。
 * 业务代码无需任何改动，import 路径不变（仍从 @/lib/supabase 导入）。
 *
 * 兼容性对照（基于 CloudBase 官方迁移文档 2026-06-25）：
 *   ✅ .from().select()/.insert()/.update()/.delete()  零改动
 *   ✅ .rpc()                                        零改动
 *   ✅ auth.signOut / getSession / onAuthStateChange / getUser / signInAnonymously  兼容
 *   ⚠️ auth.signUp / signInWithPassword               参数格式需适配
 *   ❌ storage / realtime                             不支持（本项目未使用 storage）
 */

// ─── 类型兼容：让 TypeScript 把 CloudBase 的 db 当 SupabaseClient 用 ───
// CloudBase JS SDK 的 rdb() 返回的查询构建器与 supabase-js 链式 API 高度对齐，
// 但类型定义不同。这里用鸭子类型 + 断言桥接，避免业务侧逐文件改类型。

declare module '@cloudbase/js-sdk' {
  interface CloudbaseRdbQuery {
    select(columns?: string): CloudbaseRdbQuery & { single(): Promise<{ data: any; error: any }> }
    insert(record: any): Promise<{ data: any; error: any }>
    update(record: any): CloudbaseRdbQuery
    delete(): CloudbaseRdbQuery
    eq(column: string, value: any): CloudbaseRdbQuery
    neq(column: string, value: any): CloudbaseRdbQuery
    gt(column: string, value: any): CloudbaseRdbQuery
    gte(column: string, value: any): CloudbaseRdbQuery
    lt(column: string, value: any): CloudbaseRdbQuery
    lte(column: string, value: any): CloudbaseRdbQuery
    like(column: string, value: any): CloudbaseRdbQuery
    ilike(column: string, value: any): CloudbaseRdbQuery
    in(column: string, values: any[]): CloudbaseRdbQuery
    contains(column: string, value: any): CloudbaseRdbQuery
    containedBy(column: string, value: any): CloudbaseRdbQuery
    is(column: string, value: any): CloudbaseRdbQuery
    or(filter: string): CloudbaseRdbQuery
    not(column: string, op: string, value: any): CloudbaseRdbQuery
    order(column: string, options?: { ascending?: boolean }): CloudbaseRdbQuery
    range(from: number, to: number): CloudbaseRdbQuery
    limit(count: number): CloudbaseRdbQuery
    single(): Promise<{ data: any; error: any }>
    maybeSingle(): Promise<{ data: any; error: any }>
    upsert(record: any, options?: { onConflict?: string }): Promise<{ data: any; error: any }>
    then<T>(onfulfilled?: (value: any) => T, onrejected?: (reason: any) => T): Promise<T>
  }

  interface CloudbaseAuth {
    signUp(params: { email?: string; password?: string; phone?: string; username?: string }): Promise<any>
    signInWithPassword(params: { email?: string; password?: string; username?: string }): Promise<any>
    signInAnonymously(): Promise<any>
    signOut(): Promise<any>
    getSession(): Promise<any>
    getUser(): Promise<any>
    onAuthStateChange(callback: (event: string, session: any) => void): { data: { subscription: { unsubscribe: () => void } } }
  }

  interface CloudbaseApp {
    rdb(): { from(table: string): CloudbaseRdbQuery; rpc(fn: string, params?: object): CloudbaseRdbQuery }
    auth: CloudbaseAuth
  }

  function init(options: { env: string; accessKey?: string; secretKey?: string }): CloudbaseApp
}

let _app: ReturnType<typeof import('@cloudbase/js-sdk').init> | null = null

/** 获取 CloudBase 应用实例（单例懒初始化） */
function getApp(useAdminKey = false): ReturnType<typeof import('@cloudbase/js-sdk').init> {
  if (!_app) {
    const cloudbase = require('@cloudbase/js-sdk')

    const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID!
    const accessKey = process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY!

    // 管理端使用 secretKey（等价于 Supabase 的 service_role key）
    if (useAdminKey && process.env.CLOUDBASE_SERVICE_ROLE_KEY) {
      _app = cloudbase.init({
        env: envId,
        secretKey: process.env.CLOUDBASE_SERVICE_ROLE_KEY,
      })
    } else {
      _app = cloudbase.init({ env: envId, accessKey })
    }
  }
  return _app
}

// ─── 浏览器端客户端（等价于 export const supabase） ───

export const domesticClient: any = {
  /**
   * 数据库操作 —— .from() 直接透传给 CloudBase rdb()
   * CloudBase 文档确认：链式 API 与 Supabase 完全一致
   */
  from: (table: string) => getApp().rdb().from(table),

  /**
   * RPC 调用 —— 透传给 CloudBase rdb().rpc()
   * 文档确认：参数格式完全一致
   */
  rpc: (fn: string, params?: object) => getApp().rdb().rpc(fn, params),

  /**
   * 认证模块 —— 大部分方法名一致，少数参数格式需适配
   */
  auth: {
    /** 获取当前用户（CloudBase 原生支持） */
    async getUser() {
      return getApp().auth.getUser()
    },

    /** 匿名登录（CloudBase 原生支持，方法签名一致） */
    async signInAnonymously() {
      return getApp().auth.signInAnonymously()
    },

    /**
     * 密码登录 —— 适配参数格式差异：
     * Supabase: { email, password }
     * CloudBase: { username, password } （也接受 email 作为 username）
     */
    async signInWithPassword(params: { email?: string; password?: string }) {
      return getApp().auth.signInWithPassword({
        username: params.email || params.username || '',
        password: params.password,
      })
    },

    /**
     * 注册 —— 适配参数格式差异：
     * Supabase: { email, password } 一步完成
     * CloudBase: 也支持 email+password 注册（内部走账号密码流程）
     */
    async signUp(params: { email?: string; password?: string }) {
      return getApp().auth.signUp({
        email: params.email || params.username || '',
        password: params.password,
      })
    },

    /** 登出（方法签名一致） */
    async signOut() {
      return getApp().auth.signOut()
    },

    /** 获取会话（方法签名一致） */
    async getSession() {
      return getApp().auth.getSession()
    },

    /** 监听认证状态变化（方法签名一致） */
    onAuthStateChange(callback: (event: string, session: any) => void) {
      return getApp().auth.onAuthStateChange(callback)
    },
  },
}

// ─── 服务端管理客户端（等价于 export const supabaseAdmin） ───
// 使用 service_role key，具备 BYPASSRLS 权限

export const domesticAdminClient: any = {
  from: (table: string) => getApp(true).rdb().from(table),
  rpc: (fn: string, params?: object) => getApp(true).rdb().rpc(fn, params),
  auth: domesticClient.auth,
}
