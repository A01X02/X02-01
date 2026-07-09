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
  // 从 sessionStorage 恢复上次状态（避免切页后重置为 full 但用户之前收起了）
  const [headerMode, setHeaderMode] = useState<'full' | 'minimal'>(() => {
    if (typeof window === 'undefined') return 'full'
    return (sessionStorage.getItem('chat_header_mode') as 'full' | 'minimal') || 'full'
  })

  // 记录每条消息的重新生成次数
  const [regenerateCounts, setRegenerateCounts] = useState<Record<string, number>>({})

  // 当前正在朗读的消息 ID
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  // 历史消息分页（仿豆包：初始加载最近，下拉加载更早）
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 30

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // 下拉加载历史时跳过一次"自动滚到底部"，避免视图跳动
  const skipAutoScrollRef = useRef(false)
  // 复用同一个 audio 元素（移动端一旦在手势内播放过一次，之后可编程播放）
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUnlockedRef = useRef(false)

  /** 获取（惰性创建）持久化音频元素 */
  const getAudioEl = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (!audioRef.current) {
      const el = new Audio()
      el.onended = () => setSpeakingId(null)
      el.onerror = () => setSpeakingId(null)
      audioRef.current = el
    }
    return audioRef.current
  }, [])

  /** 在用户手势内解锁音频（静音播放一小段静音音频），突破移动端自动播放限制 */
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return
    const el = getAudioEl()
    if (!el) return
    try {
      el.muted = true
      // 44 字节静音 WAV
      el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      const p = el.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          el.pause()
          el.currentTime = 0
          el.muted = false
          audioUnlockedRef.current = true
        }).catch(() => { el.muted = false })
      } else {
        el.muted = false
      }
    } catch {
      el.muted = false
    }
  }, [getAudioEl])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 监听底部导航栏「聊天」按钮：点击时始终展开功能区（避免卡在收起状态看不到功能区）
  useEffect(() => {
    return onChatToggle(() => {
      setHeaderMode('full')
      sessionStorage.setItem('chat_header_mode', 'full')
      scrollToBottom()
    })
  }, [scrollToBottom])

  // headerMode 变化时持久化到 sessionStorage（切页不丢状态）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('chat_header_mode', headerMode)
    }
  }, [headerMode])

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false
      return
    }
    scrollToBottom()
  }, [messages, scrollToBottom])

  // 消息变化时备份到 sessionStorage（切页不丢）
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        sessionStorage.setItem('chat_messages', JSON.stringify(messages))
        if (conversationId) {
          sessionStorage.setItem('chat_conv_id', conversationId)
        }
      } catch { /* 超限则忽略 */ }
    }
  }, [messages, conversationId])

  // 初始化：先从 sessionStorage 快速恢复上次消息（切页不空白）
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const cached = sessionStorage.getItem('chat_messages')
      const cachedConvId = sessionStorage.getItem('chat_conv_id')
      if (cached) {
        const parsed: Message[] = JSON.parse(cached)
        if (parsed.length > 0) {
          setMessages(parsed)
          if (cachedConvId) setConversationId(cachedConvId)
        }
      }
    } catch { /* 解析失败忽略 */ }

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

  /** 初始加载：只取最近 PAGE_SIZE 条（倒序取再反转为正序），并标记是否还有更早历史 */
  const loadMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) throw error
      const recent = (data || []).slice().reverse()
      setMessages(recent)
      setHasMoreHistory((data || []).length >= PAGE_SIZE)
      // 初始加载后滚到底部
      setTimeout(scrollToBottom, 50)
    } catch (err) {
      console.warn('[Chat] 加载消息失败（非致命）:', err)
    }
  }

  /** 下拉加载更早的历史消息（保持当前滚动位置，避免跳动） */
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMoreHistory) return
    const convId = conversationId
    if (!convId || convId.startsWith('temp-')) return
    if (messages.length === 0) return

    setLoadingMore(true)
    const container = scrollContainerRef.current
    const prevHeight = container?.scrollHeight || 0
    try {
      const oldest = messages[0]
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) throw error
      const older = (data || []).slice().reverse()
      if (older.length > 0) {
        skipAutoScrollRef.current = true
        setMessages(prev => [...older, ...prev])
        // 还原滚动位置（新增内容在顶部，补偿高度差）
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevHeight
          }
        })
      }
      setHasMoreHistory((data || []).length >= PAGE_SIZE)
    } catch (err) {
      console.warn('[Chat] 加载历史失败:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMoreHistory, conversationId, messages])

  // 滚动到顶部附近时，自动加载更早的历史消息（仿豆包下拉加载）
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const onScroll = () => {
      if (container.scrollTop <= 40 && hasMoreHistory && !loadingMore) {
        loadOlderMessages()
      }
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [hasMoreHistory, loadingMore, loadOlderMessages])

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

    const el = getAudioEl()
    if (!el) return

    // 若点击的是正在播放的同一条 = 停止
    if (speakingId === messageId) {
      el.pause()
      setSpeakingId(null)
      return
    }

    // 播放新的一条前，先停掉当前
    el.pause()

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
          if (data.message.includes('3001')) {
            toast.error('声音复刻尚未开通：请到火山引擎控制台 → 声音复刻 → 确认已购买/激活该音色', { duration: 5000 })
          } else {
            toast.error(data.message)
          }
        }
        return
      }

      el.muted = false
      el.src = data.audio_url
      el.currentTime = 0
      await el.play().catch(() => {
        // 浏览器仍拦截（极少数情况）；保留手动朗读按钮兜底
        setSpeakingId(null)
      })
    } catch {
      setSpeakingId(null)
    }
  }, [speakingId, getAudioEl])

  /** 是否开启「AI 回复后自动朗读」 */
  const isAutoPlayOn = () =>
    typeof window !== 'undefined' && localStorage.getItem('voice_auto_play') === '1'

  /** 核心发送逻辑 */
  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    // 在用户手势内解锁音频（供随后异步返回的 TTS 自动播放，绕过移动端拦截）
    if (isAutoPlayOn()) unlockAudio()

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
    <div className="flex flex-col h-full tech-bg tech-grid relative">
      {/* 顶部导航 —— 始终渲染，headerMode 只控制内部元素显隐 */}
      <div className="bg-white/80 safe-top border-b border-light-gray/60 px-4 py-3 flex items-center justify-between relative z-10 min-h-[52px] shrink-0 backdrop-blur-xl">
        {/* full 模式：显示汉堡菜单 + AI 信息 */}
        {headerMode === 'full' && (
          <>
            <button
              onClick={() => setShowConvList(true)}
              className="text-dark-gray p-1 -ml-1"
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
              className="text-medium-gray hover:text-dark-gray p-1"
              title="收起"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </>
        )}

        {/* minimal 模式：只显示一个展开按钮（居中） */}
        {headerMode === 'minimal' && (
          <button
            onClick={() => setHeaderMode('full')}
            className="mx-auto flex items-center space-x-1 text-medium-gray text-xs fade-in"
          >
            <span>▼ 展开功能区</span>
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-5 relative">
        {/* 下拉加载更早历史的提示 */}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-medium-gray">加载更早的聊天…</span>
          </div>
        )}
        {!hasMoreHistory && messages.length >= PAGE_SIZE && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-medium-gray/60">没有更早的消息了</span>
          </div>
        )}
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
