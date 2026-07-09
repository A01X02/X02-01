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
    try {
      // 先加载动态（不关联 profiles，因为 moments.user_id → auth.users 非 profiles）
      const { data: rawData, error: momError } = await supabase
        .from('moments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (momError) throw momError

      // 如果没有数据，直接设空（不再报错）
      if (!rawData || rawData.length === 0) {
        setMoments([])
        setLoading(false)
        return
      }

      // 收集所有非空的 user_id，批量查 profiles
      const userIds = [...new Set(rawData.map(m => m.user_id).filter(Boolean))] as string[]

      let profileMap: Record<string, Profile> = {}
      if (userIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('user_id', userIds)

          if (profiles) {
            profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]))
          }
        } catch {
          // profiles 查询失败不影响主流程
          console.warn('[Moments] 批量查询 profiles 失败，动态将显示默认名称')
        }
      }

      // 组装完整数据
      const assembled: Moment[] = rawData.map(m => ({
        ...m,
        user: m.user_id ? profileMap[m.user_id] || undefined : undefined,
      }))

      // 检查当前用户是否点赞（仅当用户已登录时）
      let finalMoments = assembled
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && assembled.length > 0) {
          const momentIds = assembled.map(m => m.id)
          const { data: likesData } = await supabase
            .from('likes')
            .select('moment_id')
            .eq('user_id', user.id)
            .in('moment_id', momentIds)

          const likedIds = new Set((likesData || []).map(l => l.moment_id))
          finalMoments = assembled.map(m => ({ ...m, is_liked: likedIds.has(m.id) }))
        }
      } catch {
        // 点赞状态查不到不影响显示
      }

      setMoments(finalMoments)
    } catch (err) {
      console.error('[Moments] 加载失败:', err)
      toast.error('加载朋友圈失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMomentCreated = () => {
    loadMoments()
  }

  return (
    <div className="h-screen overflow-y-auto bg-bg-gray">
      {/* 顶部 */}
      <div className="glass safe-top border-b border-light-gray px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-dark-gray tracking-breath">朋友圈</h1>
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
