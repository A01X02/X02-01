'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Message } from '@/types'
import ChatBubble from '@/components/chat/ChatBubble'
import ChatInput from '@/components/chat/ChatInput'
import ConversationList from '@/components/chat/ConversationList'
import { toast } from 'react-hot-toast'

/** 生成客户端临时 ID（无需服务端） */
const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // 初始化：尝试认证，但不阻塞聊天
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Step 1: 检查已有用户
        let { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          // Step 2: 尝试匿名登录
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

        // Step 3: 如果有有效用户，同步/创建服务端会话
        if (user && !cancelled) {
          const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (!convError && conversations && conversations.length > 0) {
            // 有历史会话 → 使用服务端 ID（消息可持久化）
            setConversationId(conversations[0].id)
            localStorage.removeItem('temp_conv_id') // 清掉临时 ID
            loadMessages(conversations[0].id)
          } else if (!convError) {
            // 无历史会话 → 创建新的
            const { data: newConv, error: insertError } = await supabase
              .from('conversations')
              .insert({ user_id: user.id, title: '新对话' })
              .select()
              .single()

            if (!insertError && newConv) {
              setConversationId(newConv.id)
              localStorage.removeItem('temp_conv_id')
            }
            // 创建失败也不阻塞，继续用临时 ID
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
      // 不弹 toast 避免打扰，降级为空消息列表
    }
  }

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId)
    loadMessages(convId)
  }

  /** 核心发送逻辑：无论认证状态如何，保证"显示 + 调 AI"两条都走通 */
  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    const sendTime = new Date().toISOString()
    // ===== ① 立即显示用户消息（乐观更新，100% 可靠）=====
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
          user_id: userId || undefined
        })
      })

      if (!response.ok) {
        throw new Error(`API ${response.status}`)
      }

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

      if (data.error) {
        toast.error(data.error)
      }

      // ===== ④ 异步持久化到 DB（仅在有完整认证时，静默失败不提示）=====
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
      const errMsg = err instanceof Error ? err.message : String(err)

      // 网络/API 完全不可用时也给一个反馈
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
      {/* 顶部导航 */}
      <div className="glass safe-top border-b border-light-gray px-4 py-3 flex items-center justify-between relative z-10">
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
                <span className="text-xs text-deep-orange ml-1">
                  · 记忆 {memoriesUsed}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="w-6" />
      </div>

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
          return <ChatBubble key={msg.id} message={msg} grouped={grouped} />
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
