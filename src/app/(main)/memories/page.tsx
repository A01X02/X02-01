'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [newMemory, setNewMemory] = useState({ content: '', memory_type: 'fact', importance: 5, tags: '' })
  const [uploadText, setUploadText] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    try {
      // 尝试用已登录用户
      let userId = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) userId = user.id
      } catch {}

      // 无登录用户也允许浏览（用临时 ID 或显示空列表）
      if (!userId) {
        setLoading(false)
        return
      }

      const response = await fetch(`/api/memory?user_id=${userId}${filter !== 'all' ? `&type=${filter}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      const result = await response.json()

      if (result.data) {
        setMemories(result.data)
        setStats(result.stats)
      }
    } catch (err) {
      console.warn('[Memories] 加载失败:', err)
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
    let userId = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) userId = user.id
    } catch {}
    if (!userId) {
      toast.error('请先登录后再添加记忆')
      return
    }

    const tags = newMemory.tags.split(',').map(t => t.trim()).filter(Boolean)

    const response = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
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

  /** 编辑记忆内容 */
  const handleEditSave = async () => {
    if (!editingMemory?.content.trim()) return

    const response = await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memory_id: editingMemory.id,
        action: 'update',
        content: editingMemory.content,
        importance: editingMemory.importance,
        tags: editingMemory.tags || []
      })
    })

    if (response.ok) {
      toast.success('记忆已更新')
      setEditingMemory(null)
      loadMemories()
    }
  }

  /** 上传聊天记录/记忆文本 */
  const handleUpload = async () => {
    if (!uploadText.trim()) {
      toast.error('请输入要上传的内容')
      return
    }

    let userId = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) userId = user.id
    } catch {}
    if (!userId) {
      toast.error('请先登录')
      return
    }

    setUploadLoading(true)
    try {
      // 按行分割，每条非空行作为一个记忆条目
      const lines = uploadText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2)

      if (lines.length === 0) {
        toast.error('没有识别到有效内容（每行至少3个字符）')
        return
      }

      // 批量上传（逐条调用 API）
      // 支持行首可选的【类型】标签（来自角色知识种子文件），映射到 DB 类型
      const TYPE_MAP: Record<string, 'fact' | 'event' | 'preference' | 'summary'> = {
        '基础设定': 'fact', '语言风格': 'fact', '人物关系': 'fact', '关键物品': 'fact',
        '情感锚点': 'fact', '世界观': 'fact', '表达层级': 'fact',
        '核心剧情': 'event', '隐藏剧情': 'event'
      }
      let successCount = 0
      for (const rawLine of lines.slice(0, 50)) { // 最多50条
        try {
          let memory_type: 'fact' | 'event' | 'preference' | 'summary' = 'summary'
          let content = rawLine
          const tagMatch = rawLine.match(/^【(.+?)】/)
          if (tagMatch) {
            const mapped = TYPE_MAP[tagMatch[1]]
            if (mapped) {
              memory_type = mapped
              content = rawLine.slice(tagMatch[0].length).trim()
            }
          }
          const res = await fetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              content,
              memory_type,
              importance: 7,
              tags: ['角色知识', '手动导入']
            })
          })
          if (res.ok) successCount++
        } catch {}
      }

      toast.success(`成功导入 ${successCount}/${lines.length} 条记忆`)
      setUploadText('')
      setShowUploadModal(false)
      loadMemories()
    } catch (err) {
      toast.error('上传失败，请重试')
    } finally {
      setUploadLoading(false)
    }
  }

  /** 从文件读取 */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string || ''
      setUploadText(text)
      setShowUploadModal(true)
    }
    reader.readAsText(file)
    // 重置以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="glass safe-top border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray tracking-breath">AI 记忆</h1>
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
            <div key={stat.key} className="glass rounded-2xl p-3 text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-medium-gray">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮区 */}
      <div className="px-4 pb-2 flex gap-2">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-1 py-2.5 rounded-xl bg-primary-orange text-white text-sm font-medium shadow-gold-glow hover:bg-deep-orange transition-all"
        >
          + 添加记忆
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2.5 rounded-xl glass-subtle text-dark-gray text-sm font-medium hover:bg-bg-gray transition-all"
        >
          📄 导入记录
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.json,.md,.csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* 搜索和筛选 */}
      <div className="px-4 pb-2 space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && loadMemories()}
          placeholder="搜索记忆..."
          className="w-full glass-subtle rounded-2xl px-4 py-2.5 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
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
                  ? 'bg-primary-orange text-white shadow-gold-glow'
                  : 'glass-subtle text-medium-gray'
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
          <div className="text-center py-8 space-y-2">
            <p className="text-medium-gray">还没有记忆</p>
            <p className="text-xs text-medium-gray/70">AI会在对话中自动提取记忆，也可以手动添加或导入</p>
          </div>
        ) : (
          memories.map((mem) => {
            const typeInfo = MEMORY_TYPE_LABELS[mem.memory_type] || { label: '其他', color: 'bg-gray-100 text-gray-600' }

            // 编辑模式
            if (editingMemory && editingMemory.id === mem.id) {
              return (
                <div key={mem.id} className="glass-strong rounded-2xl p-5 fade-in border-2 border-primary-orange/30">
                  <textarea
                    value={editingMemory.content}
                    onChange={e => setEditingMemory({ ...editingMemory, content: e.target.value })}
                    rows={3}
                    className="w-full glass-subtle rounded-xl p-3 text-sm outline-none resize-none text-dark-gray mb-3"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-medium-gray">重要度:</span>
                      <input
                        type="range" min="1" max="10"
                        value={editingMemory.importance}
                        onChange={e => setEditingMemory({ ...editingMemory, importance: Number(e.target.value) })}
                        className="w-20 accent-primary-orange"
                      />
                      <span className="text-xs text-dark-gray">{editingMemory.importance}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingMemory(null)} className="text-xs text-medium-gray px-3 py-1.5 glass-subtle rounded-lg">取消</button>
                      <button onClick={handleEditSave} className="text-xs text-white px-3 py-1.5 bg-primary-orange rounded-lg">保存</button>
                    </div>
                  </div>
                </div>
              )
            }

            // 正常展示模式
            return (
              <div key={mem.id} className="glass rounded-2xl p-5 fade-in">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className="text-xs text-medium-gray">
                      重要度: {'★'.repeat(Math.ceil(mem.importance / 2))}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 编辑按钮 */}
                    <button
                      onClick={() => setEditingMemory({ ...mem })}
                      className="p-1 text-medium-gray hover:text-accent-blue"
                      title="编辑"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="p-1 text-medium-gray hover:text-red-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </svg>
                    </button>
                  </div>
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

      {/* ========== 添加记忆弹窗 ========== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setShowAddModal(false)}>
          <div className="glass-strong safe-bottom w-full max-w-md rounded-t-2xl p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark-gray tracking-breath">添加记忆</h2>
              <button onClick={() => setShowAddModal(false)} className="text-medium-gray">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <textarea
                value={newMemory.content}
                onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                placeholder="输入记忆内容..."
                rows={3}
                className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none resize-none text-dark-gray placeholder-medium-gray tracking-breath"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newMemory.memory_type}
                  onChange={(e) => setNewMemory({ ...newMemory, memory_type: e.target.value })}
                  className="glass-subtle rounded-2xl p-3 text-sm outline-none text-dark-gray tracking-breath"
                >
                  <option value="preference">偏好</option>
                  <option value="fact">事实</option>
                  <option value="event">事件</option>
                  <option value="summary">摘要</option>
                </select>
                <div className="flex items-center glass-subtle rounded-2xl px-3">
                  <span className="text-sm text-medium-gray">重要度</span>
                  <input
                    type="range" min="1" max="10"
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
                className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
              />
              <button
                type="submit"
                disabled={!newMemory.content.trim()}
                className="w-full bg-primary-orange text-white py-3 rounded-2xl font-medium hover:bg-deep-orange hover:shadow-gold-glow transition-all disabled:opacity-50"
              >
                保存记忆
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========== 上传/导入弹窗 ========== */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setShowUploadModal(false)}>
          <div className="glass-strong safe-bottom w-full max-w-md rounded-t-2xl p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark-gray tracking-breath">导入聊天记录 / 记忆</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-medium-gray">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-medium-gray">
                粘贴或输入聊天记录、日记等内容，每行会自动成为一条记忆。
                支持 .txt/.md/.csv 文件导入。最多处理 50 条。
              </p>
              <textarea
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
                placeholder="在此粘贴文本，或使用文件导入...&#10;&#10;例如：&#10;- 用户喜欢喝冰美式&#10;- 每天早上跑步30分钟&#10;- 养了一只叫橘子的猫"
                rows={8}
                className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none resize-none text-dark-gray placeholder-medium-gray tracking-breath"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2.5 px-4 rounded-xl glass-subtle text-sm text-dark-gray flex-1"
                >
                  📎 选择文件
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploadLoading || !uploadText.trim()}
                  className="py-2.5 px-4 rounded-xl bg-primary-orange text-white text-sm font-medium flex-[2] disabled:opacity-50"
                >
                  {uploadLoading ? '导入中...' : `开始导入 (${uploadText.split('\n').filter(l => l.trim().length > 2).length} 条)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
