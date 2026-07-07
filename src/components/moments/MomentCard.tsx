'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Moment, Comment } from '@/types'
import { toast } from 'react-hot-toast'

interface MomentCardProps {
  moment: Moment
  onUpdate: () => void
}

export default function MomentCard({ moment, onUpdate }: MomentCardProps) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)

  const handleLike = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('请先登录')
      return
    }

    if (moment.is_liked) {
      // 取消点赞
      await supabase
        .from('likes')
        .delete()
        .eq('moment_id', moment.id)
        .eq('user_id', user.id)

      await supabase
        .from('moments')
        .update({ likes_count: Math.max(0, moment.likes_count - 1) })
        .eq('id', moment.id)
    } else {
      // 点赞
      await supabase
        .from('likes')
        .insert({ moment_id: moment.id, user_id: user.id })

      await supabase
        .from('moments')
        .update({ likes_count: moment.likes_count + 1 })
        .eq('id', moment.id)
    }

    onUpdate()
  }

  const loadComments = async () => {
    setLoadingComments(true)
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        user:profiles(id, username, display_name, avatar_url)
      `)
      .eq('moment_id', moment.id)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setComments(data)
    }
    setLoadingComments(false)
  }

  const toggleComments = () => {
    if (!showComments) {
      loadComments()
    }
    setShowComments(!showComments)
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('请先登录')
      return
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        moment_id: moment.id,
        user_id: user.id,
        content: newComment
      })
      .select(`
        *,
        user:profiles(id, username, display_name, avatar_url)
      `)
      .single()

    if (error) {
      toast.error('评论失败')
      return
    }

    setComments([...comments, data])
    setNewComment('')

    // 更新评论数
    await supabase
      .from('moments')
      .update({ comments_count: moment.comments_count + 1 })
      .eq('id', moment.id)

    onUpdate()
  }

  return (
    <div className="bg-white rounded-xl p-4 fade-in">
      {/* 用户信息 */}
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary-orange flex items-center justify-center overflow-hidden">
          {moment.user?.avatar_url ? (
            <img src={moment.user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-semibold text-sm">
              {(moment.user?.display_name || moment.user?.username || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <p className="font-medium text-dark-gray text-sm">
            {moment.user?.display_name || moment.user?.username || '匿名用户'}
            {moment.is_ai_generated && (
              <span className="ml-2 text-xs bg-light-orange text-deep-orange px-2 py-0.5 rounded-full">AI</span>
            )}
          </p>
          <p className="text-xs text-medium-gray">
            {new Date(moment.created_at).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      </div>

      {/* 内容 */}
      {moment.content && (
        <p className="text-dark-gray text-sm mb-3 whitespace-pre-wrap">{moment.content}</p>
      )}

      {/* 图片 */}
      {moment.image_urls && moment.image_urls.length > 0 && (
        <div className={`grid gap-2 mb-3 ${
          moment.image_urls.length === 1 ? 'grid-cols-1' :
          moment.image_urls.length === 2 ? 'grid-cols-2' :
          'grid-cols-3'
        }`}>
          {moment.image_urls.map((url, index) => (
            <div key={index} className="aspect-square rounded-lg overflow-hidden bg-light-gray">
              <img src={url} alt={`image-${index}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center space-x-6 text-medium-gray text-sm">
        <button
          onClick={handleLike}
          className={`flex items-center space-x-1 transition-colors ${
            moment.is_liked ? 'text-deep-orange' : 'hover:text-dark-gray'
          }`}
        >
          <svg className="w-5 h-5" fill={moment.is_liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{moment.likes_count || ''}</span>
        </button>

        <button
          onClick={toggleComments}
          className="flex items-center space-x-1 hover:text-dark-gray transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{moment.comments_count || ''}</span>
        </button>
      </div>

      {/* 评论区 */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-light-gray space-y-3">
          {loadingComments ? (
            <p className="text-sm text-medium-gray">加载评论...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-medium-gray">暂无评论</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start space-x-2">
                <div className="w-6 h-6 rounded-full bg-light-gray flex items-center justify-center flex-shrink-0">
                  <span className="text-xs text-dark-gray font-medium">
                    {(comment.user?.display_name || 'U').charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-dark-gray">
                    {comment.user?.display_name || comment.user?.username || '匿名'}
                  </span>
                  <span className="text-sm text-dark-gray ml-2">{comment.content}</span>
                  <p className="text-xs text-medium-gray mt-0.5">
                    {new Date(comment.created_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* 评论输入 */}
          <form onSubmit={handleSubmitComment} className="flex items-center space-x-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="写评论..."
              className="flex-1 bg-bg-gray rounded-full px-4 py-2 text-sm outline-none text-dark-gray placeholder-medium-gray"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="text-primary-orange text-sm font-medium disabled:opacity-50"
            >
              发送
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
