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

/** 生成默认对话标题：新对话 M/D HH:mm */
const defaultConvTitle = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `新对话 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 生成一个临时会话 ID（无登录时的本地会话） */
const genTempId = () => `temp-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function ConversationList({ currentConversationId, onSelect, onClose }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [hasAuth, setHasAuth] = useState(false)

  // 新建对话：标题输入
  const [showNewInput, setShowNewInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  // 重命名：正在编辑的会话 ID 与临时标题
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

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

  /** 新建对话：可输入标题（留空则自动命名），点确定后创建并切换过去 */
  const handleCreate = async () => {
    if (creating) return
    setCreating(true)

    const title = newTitle.trim() || defaultConvTitle()

    try {
      // 无认证时：生成临时会话 ID 并通知父组件（纯本地模式）
      if (!hasAuth) {
        const tempId = genTempId()
        const tempConv: Conversation = {
          id: tempId,
          user_id: '',
          title,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setConversations([tempConv, ...conversations])
        onSelect(tempId)
        onClose()
        toast.success('已开启新对话（本地）')
        return
      }

      // 有认证：尝试写入 Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 会话异常（极端情况下 getUser 失败），降级为本地会话，避免"点了没反应"
        const tempId = genTempId()
        const tempConv: Conversation = {
          id: tempId,
          user_id: '',
          title,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setConversations([tempConv, ...conversations])
        onSelect(tempId)
        onClose()
        toast.success('已开启新对话（本地）')
        return
      }

      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title })
        .select()
        .single()

      if (error) throw error

      setConversations([data!, ...conversations])
      onSelect(data!.id)
      onClose()
      toast.success('已开启新对话')
    } catch (err) {
      console.error('[ConvList] 创建失败:', err)
      toast.error('创建失败，请重试')
    } finally {
      setCreating(false)
      setNewTitle('')
      setShowNewInput(false)
    }
  }

  /** 重命名：写入标题（本地会话直接改状态，登录会话写 Supabase） */
  const handleRename = async (conv: Conversation) => {
    const title = editTitle.trim()
    // 留空则不修改，直接退出编辑
    if (!title) {
      setEditingId(null)
      setEditTitle('')
      return
    }

    const patch = (c: Conversation) => ({ ...c, title, updated_at: new Date().toISOString() })

    // 临时会话：只改本地状态
    if (conv.id.startsWith('temp-')) {
      setConversations(conversations.map(c => c.id === conv.id ? patch(c) : c))
      setEditingId(null)
      setEditTitle('')
      return
    }

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conv.id)

      if (error) throw error

      setConversations(conversations.map(c => c.id === conv.id ? patch(c) : c))
      toast.success('已重命名')
    } catch (err) {
      console.error('[ConvList] 重命名失败:', err)
      toast.error('重命名失败')
    } finally {
      setEditingId(null)
      setEditTitle('')
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

        {/* 新建对话：先输标题（可留空自动命名），点确定创建 */}
        <div className="px-4 py-3 border-b border-light-gray">
          {showNewInput ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setShowNewInput(false); setNewTitle('') }
                }}
                placeholder="对话标题（可留空）"
                autoFocus
                className="flex-1 glass-subtle rounded-xl px-3 py-2 text-sm outline-none text-dark-gray placeholder-medium-gray"
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                className="text-primary-orange text-sm font-medium disabled:opacity-50"
              >
                {creating ? '创建中' : '确定'}
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
                onClick={editingId === conv.id ? undefined : () => { onSelect(conv.id); onClose() }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                  conv.id === currentConversationId
                    ? 'bg-primary-orange/10'
                    : 'hover:bg-white/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(conv)
                        if (e.key === 'Escape') { setEditingId(null); setEditTitle('') }
                      }}
                      onBlur={() => handleRename(conv)}
                      className="w-full text-sm bg-white/70 rounded px-1 py-0.5 outline-none border border-primary-orange/50 text-dark-gray"
                    />
                  ) : (
                    <p className={`text-sm truncate ${conv.id === currentConversationId ? 'text-deep-orange font-medium' : 'text-dark-gray'}`}>
                      {conv.title || '未命名对话'}
                    </p>
                  )}
                  <p className="text-xs text-medium-gray mt-0.5">
                    {new Date(conv.updated_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="flex items-center ml-2 flex-shrink-0">
                  {editingId !== conv.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(conv.id)
                        setEditTitle(conv.title || '')
                      }}
                      className="text-medium-gray hover:text-primary-orange mr-1"
                      title="重命名"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="text-medium-gray hover:text-red-500"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
