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

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    const { data: { user } } = await supabase.auth.getUser()
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

    if (error) {
      toast.error('加载对话列表失败')
      setLoading(false)
      return
    }

    setConversations(data || [])
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: newTitle })
      .select()
      .single()

    if (error) {
      toast.error('创建失败')
      return
    }

    setConversations([data, ...conversations])
    setNewTitle('')
    setShowNewInput(false)
    onSelect(data.id)
    onClose()
  }

  const handleDelete = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const { error } = await supabase
      .from('conversations')
      .update({ is_archived: true })
      .eq('id', convId)

    if (error) {
      toast.error('删除失败')
      return
    }

    setConversations(conversations.filter(c => c.id !== convId))
    toast.success('已删除')

    if (convId === currentConversationId) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* 侧边栏 */}
      <div className="relative w-72 bg-white h-full shadow-xl flex flex-col fade-in">
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
                className="flex-1 bg-bg-gray rounded-lg px-3 py-2 text-sm outline-none text-dark-gray placeholder-medium-gray"
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
              className="w-full flex items-center justify-center space-x-2 py-2 bg-bg-gray rounded-lg text-dark-gray text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>新建对话</span>
            </button>
          )}
        </div>

        {/* 对话列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-medium-gray text-sm">加载中...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-medium-gray text-sm">暂无对话</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => { onSelect(conv.id); onClose() }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                  conv.id === currentConversationId
                    ? 'bg-light-orange'
                    : 'hover:bg-bg-gray'
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
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
