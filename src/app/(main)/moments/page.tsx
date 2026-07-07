'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Moment, Profile } from '@/types'
import MomentCard from '@/components/moments/MomentCard'
import CreateMomentButton from '@/components/moments/CreateMomentButton'
import { toast } from 'react-hot-toast'

export default function MomentsPage() {
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMoments()
  }, [])

  const loadMoments = async () => {
    const { data, error } = await supabase
      .from('moments')
      .select(`
        *,
        user:profiles(id, username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      toast.error('加载朋友圈失败')
      setLoading(false)
      return
    }

    // 检查当前用户是否点赞
    const { data: { user } } = await supabase.auth.getUser()
    if (user && data) {
      const momentsWithLikeStatus = await Promise.all(
        data.map(async (moment) => {
          const { data: likeData } = await supabase
            .from('likes')
            .select('id')
            .eq('moment_id', moment.id)
            .eq('user_id', user.id)
            .single()

          return {
            ...moment,
            is_liked: !!likeData
          }
        })
      )
      setMoments(momentsWithLikeStatus)
    } else {
      setMoments(data || [])
    }

    setLoading(false)
  }

  const handleMomentCreated = () => {
    loadMoments()
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="bg-white border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray">朋友圈</h1>
      </div>

      {/* 发布按钮 */}
      <CreateMomentButton onSuccess={handleMomentCreated} />

      {/* 动态列表 */}
      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-medium-gray">加载中...</div>
        ) : moments.length === 0 ? (
          <div className="text-center py-8 text-medium-gray">还没有动态，快来发布第一条吧！</div>
        ) : (
          moments.map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              onUpdate={loadMoments}
            />
          ))
        )}
      </div>
    </div>
  )
}
