'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { UserSettings } from '@/types'
import { toast } from 'react-hot-toast'

type ThemeMode = 'light' | 'dark' | 'auto'
type AuthView = 'none' | 'login' | 'register'

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  // 登录相关
  const [authView, setAuthView] = useState<AuthView>('none')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 改名相关
  const [displayName, setDisplayName] = useState('')
  const [aiName, setAiName] = useState('')
  const [editingName, setEditingName] = useState<'user' | 'ai' | null>(null)

  // 当前主题
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    loadSettings()
    // 从 localStorage 恢复主题
    const saved = localStorage.getItem('theme') as ThemeMode | null
    if (saved) {
      setCurrentTheme(saved)
      applyTheme(saved)
    }
    // 监听系统主题变化
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => {
      if (currentTheme === 'auto') applyTheme('auto')
    })
  }, [])

  const loadSettings = async () => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)
      if (!u) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', u.id)
        .single()

      if (data) {
        setSettings(data)
        if (data.theme) {
          setCurrentTheme(data.theme)
          applyTheme(data.theme)
        }
      }

      // 加载当前用户名和 AI 名称
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', u.id)
        .single()

      if (profile?.display_name) setDisplayName(profile.display_name)

      // AI 名字从 persona 或设置中读取
      const savedAiName = localStorage.getItem('ai_display_name')
      if (savedAiName) setAiName(savedAiName)
    } catch (err) {
      console.warn('[Settings] 加载失败:', err)
    }
    setLoading(false)
  }

  /** 应用主题到 DOM */
  const applyTheme = (theme: ThemeMode) => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // auto
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    }
    localStorage.setItem('theme', theme)
  }

  const handleUpdate = async (updates: Partial<UserSettings>) => {
    if (!user) return

    const { error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)

    if (error) {
      toast.error('更新失败')
    } else {
      toast.success('已保存')
      loadSettings()
    }
  }

  /** 切换主题 */
  const handleThemeChange = (theme: ThemeMode) => {
    setCurrentTheme(theme)
    applyTheme(theme)
    // 持久化：有账号存 DB，无账号存 localStorage
    if (user) {
      handleUpdate({ theme })
    }
    toast.success(`已切换为${theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}模式`)
  }

  /** ===== 登录/注册 ===== */
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
      loadSettings()
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setAuthLoading(false)
    }
  }

  /** ===== 退出登录 ===== */
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSettings(null)
    toast.success('已退出登录')
    loadSettings()
  }

  /** ===== 改名 ===== */
  const handleSaveName = async () => {
    if (!user) {
      toast.error('请先登录')
      return
    }
    try {
      if (editingName === 'user' && displayName.trim()) {
        const { error } = await supabase
          .from('profiles')
          .upsert({ id: user.id, display_name: displayName.trim() }, { onConflict: 'id' })
        if (error) throw error
        // 同步到 localStorage，供聊天页把用户名传给模型
        localStorage.setItem('user_display_name', displayName.trim())
        toast.success('昵称已更新')
      } else if (editingName === 'ai' && aiName.trim()) {
        localStorage.setItem('ai_display_name', aiName.trim())
        toast.success('AI 名称已更新')
      }
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    }
    setEditingName(null)
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-medium-gray">加载中...</div>
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="glass safe-top border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray tracking-breath">设置</h1>
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        {/* ========== 登录 / 用户信息 ========== */}
        {!user ? (
          <div className="glass rounded-2xl p-5 space-y-3">
            <p className="font-medium text-dark-gray text-sm">登录以同步记忆和偏好</p>

            {authView === 'none' ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setAuthView('login')}
                  className="flex-1 py-2.5 rounded-xl bg-primary-orange text-white text-sm font-medium hover:bg-deep-orange transition-all"
                >
                  登录
                </button>
                <button
                  onClick={() => setAuthView('register')}
                  className="flex-1 py-2.5 rounded-xl glass-subtle text-dark-gray text-sm font-medium hover:bg-bg-gray transition-all"
                >
                  注册
                </button>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="邮箱地址"
                  className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                />
                <div className="flex gap-3">
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
              </>
            )}
          </div>
        ) : (
          /* 已登录状态 */
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-medium-gray">已登录</p>
                <p className="text-sm font-medium text-dark-gray">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-deep-orange px-3 py-1.5 rounded-lg glass-subtle hover:bg-red-50 transition-all"
              >
                退出登录
              </button>
            </div>
          </div>
        )}

        {/* ========== 改名 ========== */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <p className="font-medium text-dark-gray text-sm">名称设置</p>

          {/* 用户昵称 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-gray">你的昵称</p>
              <p className="text-xs text-medium-gray">{displayName || '未设置'}</p>
            </div>
            {editingName === 'user' ? (
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  className="w-28 glass-subtle rounded-lg px-2 py-1 text-sm outline-none text-dark-gray"
                  placeholder="输入昵称"
                />
                <button onClick={() => setEditingName(null)} className="text-medium-gray text-sm px-2">
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingName('user') }}
                className="text-xs text-accent-blue px-3 py-1.5 rounded-lg glass-subtle"
              >
                修改
              </button>
            )}
          </div>

          {/* AI 显示名 */}
          <div className="flex items-center justify-between border-t border-light-gray pt-3">
            <div>
              <p className="text-sm text-dark-gray">AI 名称</p>
              <p className="text-xs text-medium-gray">{aiName || '智能助手'}</p>
            </div>
            {editingName === 'ai' ? (
              <div className="flex gap-2">
                <input
                  value={aiName}
                  onChange={e => setAiName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  className="w-28 glass-subtle rounded-lg px-2 py-1 text-sm outline-none text-dark-gray"
                  placeholder="AI 名字"
                />
                <button onClick={() => setEditingName(null)} className="text-medium-gray text-sm px-2">
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingName('ai') }}
                className="text-xs text-accent-blue px-3 py-1.5 rounded-lg glass-subtle"
              >
                修改
              </button>
            )}
          </div>
        </div>

        {/* ========== 语音自动播放 ========== */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-dark-gray text-sm">语音自动播放</p>
              <p className="text-xs text-medium-gray mt-0.5">收到语音消息时自动播放</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings?.voice_auto_play || false}
                onChange={(e) => handleUpdate({ voice_auto_play: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-light-gray peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-orange"></div>
            </label>
          </div>
        </div>

        {/* ========== 字体大小 ========== */}
        <div className="glass rounded-2xl p-5">
          <p className="font-medium text-dark-gray text-sm mb-3">字体大小</p>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-medium-gray">小</span>
            <input
              type="range"
              min="12"
              max="20"
              value={settings?.message_font_size || 16}
              onChange={(e) => {
                const size = parseInt(e.target.value)
                handleUpdate({ message_font_size: size })
                // 立即应用到页面
                document.documentElement.style.setProperty('--chat-font-size', `${size}px`)
              }}
              className="flex-1 accent-primary-orange"
            />
            <span className="text-lg text-medium-gray">大</span>
          </div>
        </div>

        {/* ========== 语音克隆（已隐藏，保留后端） ========== */}
        {/* VoiceRecorder 组件已移除，后端 API (/api/voice) 仍可用 */}

        {/* ========== 主题切换（修复：点击立即生效） ========== */}
        <div className="glass rounded-2xl p-5">
          <p className="font-medium text-dark-gray text-sm mb-3">界面主题</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'light' as ThemeMode, label: '浅色', icon: '☀️' },
              { value: 'dark' as ThemeMode, label: '深色', icon: '🌙' },
              { value: 'auto' as ThemeMode, label: '跟随系统', icon: '💻' },
            ]).map((theme) => (
              <button
                key={theme.value}
                onClick={() => handleThemeChange(theme.value)}
                className={`py-3 rounded-xl text-sm font-medium transition-all ${
                  currentTheme === theme.value
                    ? 'bg-primary-orange text-white shadow-gold-glow'
                    : 'glass-subtle text-dark-gray hover:bg-bg-gray'
                }`}
              >
                <span className="mr-1">{theme.icon}</span>{theme.label}
              </button>
            ))}
          </div>
        </div>

        {/* ========== 版本信息 ========== */}
        <div className="text-center text-xs text-medium-gray/50 pt-2">
          AI Companion v1.0 · Powered by 豆包
        </div>
      </div>
    </div>
  )
}
