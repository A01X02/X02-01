'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Conversation } from '@/types'
import { toast } from 'react-hot-toast'

interface ConversationListProps {
  currentConversationId: string | null
  onSelect: (conversationId: string) => void
  onClose: () => void
}

export default function ConversationList({ currentConversationId, onSelect, onClose }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewInput, setShowNewInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [hasAuth, setHasAuth] = useState(false)

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setHasAuth(!!user)

      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })

      if (error) throw error

      setConversations(data || [])
    } catch (err) {
      console.error('[ConvList] 加载失败:', err)
      // 不弹 toast，避免每次打开侧栏都报错
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return

    // 无认证时：生成临时会话 ID 并通知父组件（纯本地模式）
    if (!hasAuth) {
      const tempId = `temp-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const tempConv: Conversation = {
        id: tempId,
        user_id: '',
        title: newTitle.trim() || '新对话',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setConversations([tempConv, ...conversations])
      setNewTitle('')
      setShowNewInput(false)
      onSelect(tempConv.id)
      onClose()
      toast.success('已创建本地对话（登录后可同步到云端）')
      return
    }

    // 有认证：写入 Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title: newTitle.trim() })
        .select()
        .single()

      if (error) throw error

      setConversations([data!, ...conversations])
      setNewTitle('')
      setShowNewInput(false)
      onSelect(data!.id)
      onClose()
    } catch (err) {
      console.error('[ConvList] 创建失败:', err)
      toast.error('创建失败')
    }
  }

  const handleDelete = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // 临时会话直接从本地状态移除
    if (convId.startsWith('temp-')) {
      setConversations(conversations.filter(c => c.id !== convId))
      toast.success('已删除')
      if (convId === currentConversationId) onClose()
      return
    }

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ is_archived: true })
        .eq('id', convId)

      if (error) throw error

      setConversations(conversations.filter(c => c.id !== convId))
      toast.success('已删除')

      if (convId === currentConversationId) {
        onClose()
      }
    } catch (err) {
      console.error('[ConvList] 删除失败:', err)
      toast.error('删除失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* 侧边栏 */}
      <div className="relative w-72 glass-strong h-full shadow-2xl flex flex-col fade-in safe-top">
        {/* 头部 */}
        <div className="px-4 py-4 border-b border-light-gray flex items-center justify-between">
          <h2 className="font-semibold text-dark-gray">对话列表</h2>
          <button onClick={onClose} className="text-medium-gray">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 新建对话 */}
        <div className="px-4 py-3 border-b border-light-gray">
          {showNewInput ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="对话标题..."
                autoFocus
                className="flex-1 glass-subtle rounded-xl px-3 py-2 text-sm outline-none text-dark-gray placeholder-medium-gray"
              />
              <button
                onClick={handleCreate}
                className="text-primary-orange text-sm font-medium"
              >
                确定
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="w-full flex items-center justify-center space-x-2 py-2 glass-subtle rounded-xl text-dark-gray text-sm hover:border-primary-orange/40 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>新建对话{!hasAuth ? '（本地）' : ''}</span>
            </button>
          )}
        </div>

        {/* 对话列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-medium-gray text-sm">加载中...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-medium-gray text-sm">
              {hasAuth ? '暂无对话，点击上方新建' : '未登录，新建的对话将保存在本地'}
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => { onSelect(conv.id); onClose() }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                  conv.id === currentConversationId
                    ? 'bg-primary-orange/10'
                    : 'hover:bg-white/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${conv.id === currentConversationId ? 'text-deep-orange font-medium' : 'text-dark-gray'}`}>
                    {conv.title || '未命名对话'}
                  </p>
                  <p className="text-xs text-medium-gray mt-0.5">
                    {new Date(conv.updated_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="ml-2 text-medium-gray hover:text-red-500 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
