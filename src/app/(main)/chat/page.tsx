'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Message } from '@/types'
import ChatBubble from '@/components/chat/ChatBubble'
import ChatInput from '@/components/chat/ChatInput'
import ConversationList from '@/components/chat/ConversationList'
import { toast } from 'react-hot-toast'
import { onChatToggle } from '@/lib/events'

/** 生成客户端临时 ID（无需服务端） */
const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** 从 localStorage 读取用户昵称 / AI 显示名，随聊天请求传给模型 */
function getChatIdentity() {
  if (typeof window === 'undefined') return {}
  return {
    user_name: localStorage.getItem('user_display_name') || undefined,
    ai_name: localStorage.getItem('ai_display_name') || undefined
  }
}

/** 每条 AI 消息最大重新生成次数 */
const MAX_REGENERATE_COUNT = 10

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  // 优先使用服务端会话 ID；若认证失败则用客户端临时 ID（保证聊天不阻塞）
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('temp_conv_id') || tempId()
    }
    return null
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [showConvList, setShowConvList] = useState(false)
  const [memoriesUsed, setMemoriesUsed] = useState(0)
  const [authReady, setAuthReady] = useState(false)

  // 头部显示模式：'full' = 完整头部(汉堡+AI信息) | 'minimal' = 仅输入框
  const [headerMode, setHeaderMode] = useState<'full' | 'minimal'>('full')

  // 记录每条消息的重新生成次数
  const [regenerateCounts, setRegenerateCounts] = useState<Record<string, number>>({})

  // 当前正在朗读的消息 ID
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 监听底部导航栏「聊天」按钮：点击时始终展开功能区（避免卡在收起状态看不到功能区）
  useEffect(() => {
    return onChatToggle(() => {
      setHeaderMode('full')
      scrollToBottom()
    })
  }, [scrollToBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // 初始化：尝试认证，但不阻塞聊天
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          const { data: authData, error: anonError } = await supabase.auth.signInAnonymously()
          if (!cancelled && authData?.user && !anonError) {
            user = authData.user
            setUserId(user.id)
            console.log('[Chat] 匿名登录成功:', user.id.slice(0, 8))
          } else {
            console.warn('[Chat] 匿名登录跳过(降级模式):', anonError?.message || '未知原因')
          }
        } else {
          setUserId(user.id)
          console.log('[Chat] 已有用户:', user.id.slice(0, 8))
        }

        if (user && !cancelled) {
          const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (!convError && conversations && conversations.length > 0) {
            setConversationId(conversations[0].id)
            localStorage.removeItem('temp_conv_id')
            loadMessages(conversations[0].id)
          } else if (!convError) {
            const { data: newConv, error: insertError } = await supabase
              .from('conversations')
              .insert({ user_id: user.id, title: '新对话' })
              .select()
              .single()

            if (!insertError && newConv) {
              setConversationId(newConv.id)
              localStorage.removeItem('temp_conv_id')
            }
          }
        }
      } catch (err) {
        console.error('[Chat] 初始化异常（非致命）:', err)
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const loadMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      console.warn('[Chat] 加载消息失败（非致命）:', err)
    }
  }

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId)
    loadMessages(convId)
  }

  /** ===== 重新生成 AI 回复 ===== */
  const handleRegenerate = async (messageId: string) => {
    const currentCount = regenerateCounts[messageId] || 0
    if (currentCount >= MAX_REGENERATE_COUNT) {
      toast.error(`该消息已达到最大重试次数(${MAX_REGENERATE_COUNT}次)`)
      return
    }

    // 找到该消息前一条用户消息作为上下文
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return

    // 找最近的一条用户消息
    let lastUserMessage = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i].content
        break
      }
    }

    // 先把当前这条替换为加载动画
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: '...', message_type: 'text' as const } : m
    ))
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastUserMessage || '(请根据上下文重新回复)',
          conversation_id: conversationId || undefined,
          user_id: userId || undefined,
          ...getChatIdentity(),
        })
      })

      const data = await response.json()

      // 替换为新的回复内容
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, content: data.reply || data.error || '抱歉，暂时无法回复。', created_at: new Date().toISOString() }
          : m
      ))

      // 增加重试计数
      setRegenerateCounts(prev => ({ ...prev, [messageId]: currentCount + 1 }))

      if (data.error) toast.error(data.error)
    } catch (err) {
      toast.error('重新生成失败，请重试')
      // 恢复原始内容
      setMessages(prev => prev.map(m =>
        m.id === messageId ? m : m
      ))
    } finally {
      setLoading(false)
    }
  }

  /** ===== 反馈（喜欢/不喜欢） ===== */
  const handleFeedback = async (messageId: string, type: 'like' | 'dislike') => {
    // 将反馈写入偏好记忆（如果有 userId）
    if (!userId) {
      toast.error('登录后反馈才会被记住')
      return
    }

    const msg = messages.find(m => m.id === messageId)
    if (!msg) return

    try {
      // 调用 memory API 写入一条偏好记忆
      const feedbackText = type === 'like'
        ? `用户喜欢以下类型的回复风格："${msg.content.slice(0, 50)}..."`
        : `用户不喜欢以下类型的回复："${msg.content.slice(0, 50)}..."`

      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          content: feedbackText,
          memory_type: 'preference',
          importance: type === 'like' ? 7 : 6,
          tags: [type === 'like' ? '正向反馈' : '负向反馈']
        })
      })

      toast.success(type === 'like' ? '已记录你的偏好 ✨' : '已记录，会改进 🙏')

      // 在消息上标记反馈状态
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, metadata: { ...m.metadata, feedback: type } }
          : m
      ))
    } catch {
      toast.error('反馈保存失败')
    }
  }

  /** ===== 语音朗读（火山「声音复刻」TTS） ===== */
  const speak = useCallback(async (messageId: string, text: string) => {
    if (!text || !text.trim()) return

    // 若正在播放，先停止（点击同一条=停止）
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (speakingId === messageId) {
      setSpeakingId(null)
      return
    }

    setSpeakingId(messageId)
    try {
      const resp = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', text })
      })
      const data = await resp.json()

      if (!data.audio_url) {
        setSpeakingId(null)
        // 仅在用户主动点击朗读时提示；自动播放时静默
        if (data.message && !data.message.includes('未配置')) {
          toast.error(data.message)
        }
        return
      }

      const audio = new Audio(data.audio_url)
      audioRef.current = audio
      audio.onended = () => { setSpeakingId(null); audioRef.current = null }
      audio.onerror = () => { setSpeakingId(null); audioRef.current = null }
      await audio.play().catch(() => {
        // 浏览器可能拦截自动播放；此时保留按钮态，用户可手动点朗读
        setSpeakingId(null)
        audioRef.current = null
      })
    } catch {
      setSpeakingId(null)
    }
  }, [speakingId])

  /** 是否开启「AI 回复后自动朗读」 */
  const isAutoPlayOn = () =>
    typeof window !== 'undefined' && localStorage.getItem('voice_auto_play') === '1'

  /** 核心发送逻辑 */
  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    const sendTime = new Date().toISOString()

    // ===== ① 立即显示用户消息 =====
    const userMessage: Message = {
      id: tempId(),
      conversation_id: conversationId || tempId(),
      role: 'user',
      content,
      message_type: 'text',
      created_at: sendTime
    }
    setMessages(prev => [...prev, userMessage])

    // ===== ② 调用 AI API =====
    setLoading(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversation_id: conversationId || undefined,
          user_id: userId || undefined,
          ...getChatIdentity(),
        })
      })

      if (!response.ok) throw new Error(`API ${response.status}`)

      const data = await response.json()

      // ===== ③ 显示 AI 回复 =====
      const aiMessage: Message = {
        id: tempId(),
        conversation_id: conversationId || tempId(),
        role: 'assistant',
        content: data.reply || data.error || '抱歉，暂时无法回复。',
        message_type: 'text',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, aiMessage])
      setMemoriesUsed(data.meta?.memories_used || 0)

      if (data.error) toast.error(data.error)

      // ===== 自动朗读（若开关已开且有真实回复） =====
      if (isAutoPlayOn() && data.reply) {
        speak(aiMessage.id, aiMessage.content)
      }

      // ===== ④ 异步持久化到 DB =====
      if (userId && conversationId) {
        try {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'user',
            content,
            message_type: 'text',
            created_at: sendTime
          })
        } catch { /* 静默 */ }

        try {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: aiMessage.content,
            message_type: 'text'
          })

          await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId)
        } catch { /* 静默 */ }
      }
    } catch (err) {
      console.error('[Chat] 发送失败:', err)
      const fallbackMsg: Message = {
        id: tempId(),
        conversation_id: conversationId || tempId(),
        role: 'assistant',
        content: '网络连接不稳定，请稍后重试~',
        message_type: 'text',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, fallbackMsg])
      toast.error('发送失败，请检查网络')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen tech-bg tech-grid relative">
      {/* 顶部导航 —— 根据 headerMode 显示或隐藏 */}
      {headerMode === 'full' && (
        <div className="glass safe-top border-b border-light-gray px-4 py-3 flex items-center justify-between relative z-10 fade-in">
          <button
            onClick={() => setShowConvList(true)}
            className="text-dark-gray"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-primary-orange flex items-center justify-center shadow-gold-glow glow-pulse">
              <span className="text-white text-sm font-semibold">AI</span>
            </div>
            <div>
              <h1 className="font-semibold text-dark-gray text-sm tracking-breath">智能助手</h1>
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.85)]"></div>
                <p className="text-xs text-medium-gray">
                  {authReady ? '在线' : '连接中...'}
                </p>
                {memoriesUsed > 0 && (
                  <span className="text-xs text-deep-orange ml-1">· 记忆 {memoriesUsed}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setHeaderMode('minimal')}
            className="text-medium-gray hover:text-dark-gray"
            title="收起"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* minimal 模式下只显示一个展开按钮 */}
      {headerMode === 'minimal' && (
        <div className="safe-top pt-2 px-4 flex justify-center">
          <button
            onClick={() => setHeaderMode('full')}
            className="glass-subtle rounded-full px-4 py-1.5 text-xs text-medium-gray fade-in"
          >
            ▼ 展开功能区
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-5 relative">
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto bg-light-orange rounded-full flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-deep-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-medium-gray text-sm">开始和AI聊天吧</p>
            <p className="text-medium-gray text-xs mt-1">AI会自动记住你的偏好和重要信息</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const grouped = prev && prev.role === msg.role
          return (
            <ChatBubble
              key={msg.id}
              message={msg}
              grouped={grouped}
              onRegenerate={msg.role === 'assistant' ? () => handleRegenerate(msg.id) : undefined}
              regenerateCount={regenerateCounts[msg.id] || 0}
              maxRegenerateCount={MAX_REGENERATE_COUNT}
              onFeedback={msg.role === 'assistant' ? (type) => handleFeedback(msg.id, type) : undefined}
              currentFeedback={(msg.metadata?.feedback as string) || null}
              onSpeak={msg.role === 'assistant' ? () => speak(msg.id, msg.content) : undefined}
              speaking={speakingId === msg.id}
            />
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="glass-subtle rounded-2xl px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-medium-gray rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-medium-gray rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-medium-gray rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <ChatInput onSend={sendMessage} disabled={loading} />

      {/* 对话列表 */}
      {showConvList && (
        <ConversationList
          currentConversationId={conversationId}
          onSelect={handleSelectConversation}
          onClose={() => setShowConvList(false)}
        />
      )}
    </div>
  )
}
