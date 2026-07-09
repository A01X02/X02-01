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
  const [isAiMoment, setIsAiMoment] = useState(false)
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

    const { error } = await supabase.from('moments').insert({
      user_id: user.id,
      content,
      image_urls: imageUrls,
      is_ai_generated: isAiMoment
    })

    if (error) {
      toast.error('发布失败')
      setLoading(false)
      return
    }

    toast.success('发布成功！')
    setContent('')
    setImageUrl('')
    setIsAiMoment(false)
    setIsOpen(false)
    setLoading(false)
    onSuccess()
  }

  return (
    <>
      {/* 发布按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 w-14 h-14 bg-primary-orange rounded-full flex items-center justify-center shadow-gold-glow hover:bg-deep-orange hover:shadow-gold-glow glow-pulse transition-all z-20"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* 发布弹窗 */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center" onClick={() => setIsOpen(false)}>
          <div
            className="glass-strong safe-bottom w-full max-w-md rounded-t-2xl p-6 fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark-gray tracking-breath">发布动态</h2>
              <button onClick={() => setIsOpen(false)} className="text-medium-gray">
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

              {/* AI标记 */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAiMoment}
                  onChange={(e) => setIsAiMoment(e.target.checked)}
                  className="w-4 h-4 rounded text-primary-orange"
                />
                <span className="text-sm text-dark-gray">标记为AI动态</span>
              </label>

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
