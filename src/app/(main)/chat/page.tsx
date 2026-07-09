'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Message } from '@/types'
import ChatBubble from '@/components/chat/ChatBubble'
import ChatInput from '@/components/chat/ChatInput'
import ConversationList from '@/components/chat/ConversationList'
import { toast } from 'react-hot-toast'

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showConvList, setShowConvList] = useState(false)
  const [memoriesUsed, setMemoriesUsed] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    loadUserAndConversation()
  }, [])

  const loadUserAndConversation = async () => {
    try {
      let { data: { user } } = await supabase.auth.getUser()

      // 未登录 → 自动匿名登录，确保聊天功能可用
      if (!user) {
        const { data: authData, error: anonError } = await supabase.auth.signInAnonymously()
        if (anonError || !authData?.user) {
          console.error('匿名登录失败:', anonError?.message)
          // 匿名登录也失败时仍允许使用（降级模式）
          return
        }
        user = authData.user
      }

      setUserId(user.id)

      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (convError) {
        console.error('加载会话失败:', convError.message)
        return
      }

      if (conversations && conversations.length > 0) {
        setConversationId(conversations[0].id)
        loadMessages(conversations[0].id)
      } else {
        const { data: newConv, error: insertError } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, title: '新对话' })
          .select()
          .single()

        if (insertError) {
          console.error('创建会话失败:', insertError.message)
          return
        }

        if (newConv) {
          setConversationId(newConv.id)
        }
      }
    } catch (err) {
      console.error('初始化聊天失败:', err)
    }
  }

  const loadMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('加载消息失败')
      return
    }
    setMessages(data || [])
  }

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId)
    loadMessages(convId)
  }

  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    // 优化体验：即使没有完整会话状态，也先让用户看到自己的消息
    const userMessage: Message = {
      id: Date.now().toString(),
      conversation_id: conversationId || 'pending',
      role: 'user',
      content,
      message_type: 'text',
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    // 如果没有会话或用户ID，仍尝试调用AI（降级模式）
    if (!conversationId || !userId) {
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

        const data = await response.json()

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          conversation_id: conversationId || 'pending',
          role: 'assistant',
          content: data.reply || data.error || '抱歉，暂时无法回复。',
          message_type: 'text',
          created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, aiMessage])
        if (data.error) {
          toast.error(data.error)
        }
      } catch (error) {
        toast.error('网络连接失败，请检查网络')
        console.error('发送失败:', error)
      } finally {
        setLoading(false)
      }
      return
    }

    // 正常模式（有完整的会话和用户状态）
    setLoading(true)
    setMemoriesUsed(0)

    // 写入用户消息到DB（非致命，失败不阻塞聊天）
    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content,
        message_type: 'text'
      })
    } catch (dbErr: unknown) {
      console.warn('写入用户消息到DB失败(非致命):', dbErr instanceof Error ? dbErr.message : String(dbErr))
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversation_id: conversationId,
          user_id: userId
        })
      })

      const data = await response.json()

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        conversation_id: conversationId,
        role: 'assistant',
        content: data.reply || '抱歉，我暂时无法回复。',
        message_type: 'text',
        created_at: new Date().toISOString()
      }

      setMessages(prev => [...prev, aiMessage])
      setMemoriesUsed(data.meta?.memories_used || 0)

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: aiMessage.content,
        message_type: 'text'
      })

      // 更新对话的updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)

    } catch (error) {
      toast.error('发送消息失败')
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
              <p className="text-xs text-medium-gray">在线</p>
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
