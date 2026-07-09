'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { UserSettings } from '@/types'
import { toast } from 'react-hot-toast'
import VoiceRecorder from '@/components/settings/VoiceRecorder'

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setSettings(data)
    }
    setLoading(false)
  }

  const handleUpdate = async (updates: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser()
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

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-medium-gray">加载中...</div>
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="glass safe-top border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray tracking-breath">设置</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 语音自动播放 */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-dark-gray">语音自动播放</p>
              <p className="text-xs text-medium-gray mt-1">收到语音消息时自动播放</p>
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

        {/* 字体大小 */}
        <div className="glass rounded-2xl p-5">
          <p className="font-medium text-dark-gray mb-3">字体大小</p>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-medium-gray">小</span>
            <input
              type="range"
              min="12"
              max="20"
              value={settings?.message_font_size || 16}
              onChange={(e) => handleUpdate({ message_font_size: parseInt(e.target.value) })}
              className="flex-1 accent-primary-orange"
            />
            <span className="text-lg text-medium-gray">大</span>
          </div>
        </div>

        {/* 语音克隆 */}
        <div className="glass rounded-2xl p-5">
          <p className="font-medium text-dark-gray mb-1">语音克隆</p>
          <p className="text-xs text-medium-gray mb-4">录制你的声音，AI将用你的声音回复</p>
          <VoiceRecorder />
        </div>

        {/* 主题 */}
        <div className="glass rounded-2xl p-5">
          <p className="font-medium text-dark-gray mb-3">界面主题</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
              { value: 'auto', label: '跟随系统' }
            ].map((theme) => (
              <button
                key={theme.value}
                onClick={() => handleUpdate({ theme: theme.value as 'light' | 'dark' | 'auto' })}
                className={`py-3 rounded-xl text-sm font-medium transition-all ${
                  settings?.theme === theme.value
                    ? 'bg-primary-orange text-white shadow-gold-glow'
                    : 'glass-subtle text-dark-gray'
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        {/* 退出登录 */}
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/'
          }}
          className="w-full glass rounded-2xl p-5 text-center text-deep-orange font-medium"
        >
          退出登录
        </button>
      </div>
    </div>
  )
}
