'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Memory } from '@/lib/memory'
import { toast } from 'react-hot-toast'

const MEMORY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  preference: { label: '偏好', color: 'bg-blue-100 text-blue-600' },
  fact: { label: '事实', color: 'bg-teal-100 text-teal-600' },
  event: { label: '事件', color: 'bg-amber-100 text-amber-600' },
  summary: { label: '摘要', color: 'bg-coral-100 text-coral-600' },
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [stats, setStats] = useState({ total: 0, preference: 0, fact: 0, event: 0, summary: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMemory, setNewMemory] = useState({ content: '', memory_type: 'fact', importance: 5, tags: '' })

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const response = await fetch(`/api/memory?user_id=${user.id}${filter !== 'all' ? `&type=${filter}` : ''}${search ? `&search=${search}` : ''}`)
    const result = await response.json()

    if (result.data) {
      setMemories(result.data)
      setStats(result.stats)
    }
    setLoading(false)
  }

  const handleDelete = async (memoryId: string) => {
    const response = await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_id: memoryId, action: 'delete' })
    })

    if (response.ok) {
      toast.success('已删除')
      loadMemories()
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const tags = newMemory.tags.split(',').map(t => t.trim()).filter(Boolean)

    const response = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        content: newMemory.content,
        memory_type: newMemory.memory_type,
        importance: Number(newMemory.importance),
        tags
      })
    })

    if (response.ok) {
      toast.success('记忆已添加')
      setNewMemory({ content: '', memory_type: 'fact', importance: 5, tags: '' })
      setShowAddModal(false)
      loadMemories()
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="bg-white border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray">AI记忆</h1>
      </div>

      {/* 统计卡片 */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'total', label: '总计', count: stats.total, color: 'text-dark-gray' },
            { key: 'preference', label: '偏好', count: stats.preference, color: 'text-blue-500' },
            { key: 'fact', label: '事实', count: stats.fact, color: 'text-teal-500' },
            { key: 'event', label: '事件', count: stats.event, color: 'text-amber-500' },
          ].map((stat) => (
            <div key={stat.key} className="bg-white rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-medium-gray">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="px-4 pb-2 space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && loadMemories()}
          placeholder="搜索记忆..."
          className="w-full bg-white rounded-xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray"
        />
        <div className="flex space-x-2 overflow-x-auto">
          {[
            { key: 'all', label: '全部' },
            { key: 'preference', label: '偏好' },
            { key: 'fact', label: '事实' },
            { key: 'event', label: '事件' },
            { key: 'summary', label: '摘要' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setTimeout(loadMemories, 0) }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? 'bg-primary-orange text-white'
                  : 'bg-white text-medium-gray'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 记忆列表 */}
      <div className="px-4 py-2 space-y-3 pb-24">
        {loading ? (
          <div className="text-center py-8 text-medium-gray">加载中...</div>
        ) : memories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-medium-gray mb-2">还没有记忆</p>
            <p className="text-xs text-medium-gray">AI会在对话中自动提取记忆，也可以手动添加</p>
          </div>
        ) : (
          memories.map((mem) => {
            const typeInfo = MEMORY_TYPE_LABELS[mem.memory_type] || { label: '其他', color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={mem.id} className="bg-white rounded-xl p-4 fade-in">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className="text-xs text-medium-gray">
                      重要度: {'★'.repeat(Math.ceil(mem.importance / 2))}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(mem.id)}
                    className="text-medium-gray hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-dark-gray mb-2">{mem.content}</p>
                {mem.tags && mem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {mem.tags.map((tag, i) => (
                      <span key={i} className="text-xs bg-bg-gray text-medium-gray px-2 py-0.5 rounded">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-medium-gray">
                    {new Date(mem.created_at).toLocaleDateString('zh-CN')}
                  </p>
                  {mem.access_count > 0 && (
                    <p className="text-xs text-medium-gray">被检索 {mem.access_count} 次</p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 添加记忆按钮 */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-primary-orange rounded-full flex items-center justify-center shadow-lg hover:bg-deep-orange transition-colors z-20"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* 添加记忆弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setShowAddModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark-gray">添加记忆</h2>
              <button onClick={() => setShowAddModal(false)} className="text-medium-gray">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <textarea
                value={newMemory.content}
                onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                placeholder="记忆内容..."
                rows={3}
                className="w-full bg-bg-gray rounded-xl p-3 text-sm outline-none resize-none text-dark-gray placeholder-medium-gray"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newMemory.memory_type}
                  onChange={(e) => setNewMemory({ ...newMemory, memory_type: e.target.value })}
                  className="bg-bg-gray rounded-xl p-3 text-sm outline-none text-dark-gray"
                >
                  <option value="preference">偏好</option>
                  <option value="fact">事实</option>
                  <option value="event">事件</option>
                  <option value="summary">摘要</option>
                </select>
                <div className="flex items-center bg-bg-gray rounded-xl px-3">
                  <span className="text-sm text-medium-gray">重要度</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newMemory.importance}
                    onChange={(e) => setNewMemory({ ...newMemory, importance: Number(e.target.value) })}
                    className="flex-1 accent-primary-orange ml-2"
                  />
                  <span className="text-sm text-dark-gray ml-1 w-6">{newMemory.importance}</span>
                </div>
              </div>
              <input
                type="text"
                value={newMemory.tags}
                onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                placeholder="标签（逗号分隔）"
                className="w-full bg-bg-gray rounded-xl p-3 text-sm outline-none text-dark-gray placeholder-medium-gray"
              />
              <button
                type="submit"
                disabled={!newMemory.content.trim()}
                className="w-full bg-primary-orange text-white py-3 rounded-xl font-medium hover:bg-deep-orange transition-colors disabled:opacity-50"
              >
                保存记忆
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
