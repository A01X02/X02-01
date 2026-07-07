'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, ChatTheme, VoiceProfile } from '@/types'
import { toast } from 'react-hot-toast'
import Link from 'next/link'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [themes, setThemes] = useState<ChatTheme[]>([])
  const [voices, setVoices] = useState<VoiceProfile[]>([])
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
    loadThemes()
    loadVoices()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (data) {
      setProfile(data)
      setSelectedTheme(data.chat_theme_id || null)
      setSelectedVoice(data.voice_profile_id || null)
    }
    setLoading(false)
  }

  const loadThemes = async () => {
    const { data } = await supabase
      .from('chat_themes')
      .select('*')
      .or('is_public.eq.true')
    setThemes(data || [])
  }

  const loadVoices = async () => {
    const { data } = await supabase
      .from('voice_profiles')
      .select('*')
      .or('is_public.eq.true')
    setVoices(data || [])
  }

  const handleUpdateProfile = async (updates: Partial<Profile>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      toast.error('更新失败')
    } else {
      toast.success('更新成功')
      loadProfile()
    }
  }

  const handleSelectTheme = async (themeId: string) => {
    setSelectedTheme(themeId)
    await handleUpdateProfile({ chat_theme_id: themeId })
  }

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoice(voiceId)
    await handleUpdateProfile({ voice_profile_id: voiceId })
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-medium-gray">加载中...</div>
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 头部 */}
      <div className="bg-white px-4 py-6 border-b border-light-gray">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-primary-orange flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-semibold">
                {(profile?.display_name || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-dark-gray">
              {profile?.display_name || '未设置昵称'}
            </h2>
            <p className="text-sm text-medium-gray">{profile?.bio || '这个人很懒，什么都没写'}</p>
          </div>
        </div>
      </div>

      {/* 聊天主题选择 */}
      <div className="mt-4 bg-white px-4 py-4">
        <h3 className="font-semibold text-dark-gray mb-3">聊天主题</h3>
        <div className="grid grid-cols-3 gap-3">
          {themes.length === 0 ? (
            <p className="col-span-3 text-sm text-medium-gray text-center py-4">暂无主题</p>
          ) : (
            themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                  selectedTheme === theme.id ? 'border-primary-orange' : 'border-transparent'
                }`}
              >
                <div className="aspect-square bg-light-gray flex items-center justify-center">
                  {theme.character_gif_url ? (
                    <img src={theme.character_gif_url} alt={theme.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-medium-gray text-xs">{theme.name}</span>
                  )}
                </div>
                <p className="text-xs text-dark-gray text-center py-1 truncate">{theme.name}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 语音配置 */}
      <div className="mt-4 bg-white px-4 py-4">
        <h3 className="font-semibold text-dark-gray mb-3">语音配置</h3>
        <div className="space-y-2">
          {voices.length === 0 ? (
            <p className="text-sm text-medium-gray text-center py-4">暂无语音配置</p>
          ) : (
            voices.map((voice) => (
              <button
                key={voice.id}
                onClick={() => handleSelectVoice(voice.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                  selectedVoice === voice.id
                    ? 'bg-light-orange border border-primary-orange'
                    : 'bg-bg-gray'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-primary-orange/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-deep-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-dark-gray">{voice.name}</p>
                    <p className="text-xs text-medium-gray">
                      {voice.is_cloned ? '克隆声音' : '预设声音'}
                    </p>
                  </div>
                </div>
                {selectedVoice === voice.id && (
                  <svg className="w-5 h-5 text-primary-orange" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 设置入口 */}
      <div className="mt-4 bg-white">
        <Link href="/settings" className="flex items-center justify-between px-4 py-4 border-b border-light-gray">
          <span className="text-dark-gray">设置</span>
          <svg className="w-5 h-5 text-medium-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
