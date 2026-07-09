'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'

interface CreateMomentButtonProps {
  onSuccess: () => void
}

export default function CreateMomentButton({ onSuccess }: CreateMomentButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('请先登录')
      setLoading(false)
      return
    }

    const imageUrls = imageUrl ? [imageUrl] : []

    const { error, data } = await supabase.from('moments').insert({
      user_id: user.id,
      content,
      image_urls: imageUrls,
      is_ai_generated: false
    }).select('id').single()

    if (error) {
      toast.error('发布失败')
      setLoading(false)
      return
    }

    toast.success('发布成功！')
    setContent('')
    setImageUrl('')
    setIsOpen(false)
    setLoading(false)
    onSuccess()

    // 触发 AI 自动点赞 + 评论（不阻塞用户操作）
    triggerAiReaction(data.id, content)
  }

  /** AI 对用户发布的朋友圈自动点赞+评论（最多3轮，随机延迟） */
  const triggerAiReaction = async (momentId: string, postContent: string) => {
    try {
      // 第1轮：先点赞（延迟 5~15 秒——像真人刷到才看到）
      const likeDelay = 5000 + Math.random() * 10000
      setTimeout(async () => {
        try {
          await fetch('/api/moments/ai-react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              moment_id: momentId,
              action: 'like',
              post_content: postContent
            })
          })
        } catch { /* 静默 */ }
      }, likeDelay)

      // 第2轮：评论（延迟 20~45 秒）
      const commentDelay1 = 20000 + Math.random() * 25000
      setTimeout(async () => {
        try {
          await fetch('/api/moments/ai-react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              moment_id: momentId,
              action: 'comment',
              round: 1,
              post_content: postContent
            })
          })
          // 评论后刷新列表
          onSuccess()
        } catch { /* 静默 */ }
      }, commentDelay1)

      // 第3轮：追加评论（概率30%，延迟 60~120秒——模拟"又回来看了一眼"）
      if (Math.random() < 0.3) {
        const commentDelay2 = 60000 + Math.random() * 60000
        setTimeout(async () => {
          try {
            await fetch('/api/moments/ai-react', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                moment_id: momentId,
                action: 'comment',
                round: 2,
                post_content: postContent
              })
            })
            onSuccess()
          } catch { /* 静默 */ }
        }, commentDelay2)
      }
    } catch {
      // 整个反应链出错静默忽略，不影响用户体验
    }
  }

  return (
    <>
      {/* 发布按钮 —— 固定在右上角，确保可见 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed z-50 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 w-14 h-14 bg-primary-orange rounded-full flex items-center justify-center shadow-lg shadow-primary-orange/30 hover:bg-deep-orange hover:scale-105 active:scale-95 transition-all"
        style={{ zIndex: 9999 }}
      >
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* 发布弹窗 */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-end justify-center" onClick={() => setIsOpen(false)}>
          <div
            className="glass-strong safe-bottom w-full max-w-md rounded-t-2xl p-6 fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark-gray tracking-breath">发朋友圈</h2>
              <button onClick={() => setIsOpen(false)} className="text-medium-gray p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 内容输入 */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="分享点什么..."
                rows={4}
                className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none resize-none text-dark-gray placeholder-medium-gray tracking-breath"
              />

              {/* 图片URL */}
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="图片URL（可选）"
                className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
              />

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={!content.trim() || loading}
                className="w-full bg-primary-orange text-white py-3 rounded-2xl font-medium hover:bg-deep-orange hover:shadow-gold-glow transition-all disabled:opacity-50"
              >
                {loading ? '发布中...' : '发布'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
