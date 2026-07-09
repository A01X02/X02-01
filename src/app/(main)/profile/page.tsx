'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { toast } from 'react-hot-toast'

type ThemeMode = 'light' | 'dark' | 'auto'
type AuthView = 'none' | 'login' | 'register'

export default function ProfilePage() {
  // ---- 昵称（三级 fallback：DB → localStorage → 默认）----
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('这个人很懒，什么都没写')

  // ---- 登录状态 & 登录表单 ----
  const [user, setUser] = useState<any>(null)
  const [authView, setAuthView] = useState<AuthView>('none')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // ---- 语音自动朗读开关 ----
  const [voiceAutoPlay, setVoiceAutoPlay] = useState(false)

  // ---- 加载态 ----
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      // 1) 先从 localStorage 读昵称（即时显示，不等 DB）
      const localName = localStorage.getItem('user_display_name') || ''
      if (localName) setDisplayName(localName)

      // 2) 恢复语音开关
      setVoiceAutoPlay(localStorage.getItem('voice_auto_play') === '1')

      // 3) 查 Supabase 用户 & profile
      const { data: { user: u } } = await supabase.auth.getUser()
      if (u) {
        setUser(u)

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('display_name, bio')
          .eq('id', u.id)
          .single()

        if (profile && !error) {
          if (profile.display_name) setDisplayName(profile.display_name)
          if (profile.bio) setBio(profile.bio)
        }

        // DB 语音开关覆盖本地
        const { data: settings } = await supabase
          .from('user_settings')
          .select('voice_auto_play')
          .eq('user_id', u.id)
          .single()

        if (settings?.voice_auto_play !== undefined) {
          setVoiceAutoPlay(settings.voice_auto_play)
          localStorage.setItem('voice_auto_play', settings.voice_auto_play ? '1' : '0')
        }
      }
    } catch (err) {
      console.warn('[Profile] 加载失败:', err)
    }
    setLoading(false)
  }

  /** ===== 登录 / 注册 ===== */
  const handleAuth = async () => {
    if (!email || !password) {
      toast.error('请输入邮箱和密码')
      return
    }
    setAuthLoading(true)
    try {
      if (authView === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('注册成功！请查收验证邮件')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('登录成功！')
      }
      setAuthView('none')
      setEmail('')
      setPassword('')
      loadProfile()
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setAuthLoading(false)
    }
  }

  /** ===== 退出 ===== */
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    toast.success('已退出登录')
    loadProfile()
  }

  /** ===== 语音开关 ===== */
  const handleVoiceToggle = (checked: boolean) => {
    setVoiceAutoPlay(checked)
    localStorage.setItem('voice_auto_play', checked ? '1' : '0')

    // 有账号则同步 DB
    if (user) {
      supabase
        .from('user_settings')
        .upsert({ user_id: user.id, voice_auto_play: checked }, { onConflict: 'user_id' })
        .then(() => toast.success(checked ? '已开启语音朗读' : '已关闭语音朗读'))
    } else {
      toast.success(checked ? '已开启语音朗读' : '已关闭语音朗读')
    }
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-medium-gray">加载中...</div>
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* ===== 头部：头像 + 昵称 + 登录/注册 ===== */}
      <div className="glass safe-top px-4 py-6 border-b border-light-gray">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            {/* 头像 */}
            <div className="w-16 h-16 rounded-full bg-primary-orange flex items-center justify-center overflow-hidden shrink-0">
              <span className="text-white text-2xl font-semibold">
                {(displayName || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            {/* 昵称 + 简介 */}
            <div>
              <h2 className="text-lg font-semibold text-dark-gray">
                {displayName || '未设置昵称'}
              </h2>
              <p className="text-sm text-medium-gray mt-0.5">{bio}</p>

              {/* 未登录：显示 登录 / 注册 按钮 */}
              {!user && authView === 'none' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setAuthView('login')}
                    className="px-4 py-1.5 rounded-full bg-primary-orange text-white text-xs font-medium hover:bg-deep-orange transition-all"
                  >
                    登录
                  </button>
                  <button
                    onClick={() => setAuthView('register')}
                    className="px-4 py-1.5 rounded-full glass-subtle text-dark-gray text-xs font-medium hover:bg-bg-gray transition-all"
                  >
                    注册
                  </button>
                </div>
              )}

              {/* 已登录：显示邮箱 + 退出 */}
              {user && (
                <p className="text-xs text-medium-gray mt-2">
                  {user.email}
                  <button
                    onClick={handleLogout}
                    className="ml-3 text-deep-orange underline"
                  >
                    退出
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 登录/注册 表单（展开态） */}
        {!user && authView !== 'none' && (
          <div className="mt-4 space-y-2 fade-in">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱地址"
              className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAuthView('none')}
                className="flex-1 py-2 rounded-xl glass-subtle text-medium-gray text-sm"
              >
                取消
              </button>
              <button
                onClick={handleAuth}
                disabled={authLoading}
                className="flex-1 py-2 rounded-xl bg-primary-orange text-white text-sm font-medium disabled:opacity-50"
              >
                {authLoading ? '...' : authView === 'register' ? '注册' : '登录'}
              </button>
            </div>
            <p className="text-xs text-center text-medium-gray">
              {authView === 'login' ? '还没有账号？' : '已有账号？'}
              <button
                onClick={() => setAuthView(authView === 'login' ? 'register' : 'login')}
                className="text-accent-blue ml-1 underline"
              >
                {authView === 'login' ? '去注册' : '去登录'}
              </button>
            </p>
          </div>
        )}
      </div>

      {/* ===== 语音自动朗读开关 ===== */}
      <div className="mt-4 glass rounded-2xl mx-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-dark-gray text-sm">语音自动朗读</p>
            <p className="text-xs text-medium-gray mt-0.5">AI 回复后自动用复刻音色朗读</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={voiceAutoPlay}
              onChange={(e) => handleVoiceToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-light-gray peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-orange"></div>
          </label>
        </div>
      </div>

      {/* ===== 设置入口 ===== */}
      <div className="mt-4 glass rounded-2xl mx-4 overflow-hidden">
        <Link href="/settings" className="flex items-center justify-between px-5 py-5 border-b border-light-gray">
          <span className="text-dark-gray">设置</span>
          <svg className="w-5 h-5 text-medium-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
