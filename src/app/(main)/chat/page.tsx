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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 未登录：直接显示空聊天界面，不阻塞页面
        return
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
    if (!conversationId || !content.trim() || !userId) return

    setLoading(true)
    setMemoriesUsed(0)

    const userMessage: Message = {
      id: Date.now().toString(),
      conversation_id: conversationId,
      role: 'user',
      content,
      message_type: 'text',
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content,
      message_type: 'text'
    })

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
    <div className="flex flex-col h-screen bg-bg-gray">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-light-gray px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setShowConvList(true)}
          className="text-dark-gray"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-primary-orange flex items-center justify-center">
            <span className="text-white text-sm font-semibold">AI</span>
          </div>
          <div>
            <h1 className="font-semibold text-dark-gray text-sm">智能助手</h1>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-light-gray rounded-2xl px-4 py-3">
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
