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
    setLoading(true)
    try {
      // Step 1: 查动态（不关联 profiles，避免 PostgREST FK 解析失败）
      const { data: rawData, error: momError } = await supabase
        .from('moments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      // 即使查询出错也优雅降级，不再弹 toast
      if (momError) {
        console.warn('[Moments] 动态查询返回错误（降级为空列表）:', momError.message)
        setMoments([])
        setLoading(false)
        return
      }

      // 无数据 → 正常空状态
      if (!rawData || rawData.length === 0) {
        setMoments([])
        setLoading(false)
        return
      }

      // Step 2: 批量查 profiles（独立查询，失败不影响主流程）
      const userIds = [...new Set(rawData.map((m: any) => m.user_id).filter(Boolean))] as string[]

      let profileMap: Record<string, Profile> = {}
      if (userIds.length > 0) {
        try {
          const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds)

          // 注意：profiles 的主键是 id（= auth.users.id），不是 user_id
          if (profiles && !profError) {
            profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]))
          }
        } catch (e) {
          console.warn('[Moments] profiles 查询失败，使用默认名称')
        }
      }

      // Step 3: 组装数据
      const assembled: Moment[] = rawData.map((m: any) => {
        // user_id 是 auth.users.id，用它在 profileMap 中查找
        const profile = m.user_id ? profileMap[m.user_id] : undefined
        return {
          ...m,
          user: profile,
        }
      })

      // Step 4: 检查当前用户点赞状态（静默失败）
      let finalMoments = assembled
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && assembled.length > 0) {
          const momentIds = assembled.map(m => m.id)
          const { data: likesData, error: likeErr } = await supabase
            .from('likes')
            .select('moment_id')
            .eq('user_id', user.id)
            .in('moment_id', momentIds)

          if (!likeErr && likesData) {
            const likedIds = new Set(likesData.map((l: any) => l.moment_id))
            finalMoments = assembled.map(m => ({ ...m, is_liked: likedIds.has(m.id) }))
          }
        }
      } catch {
        // 点赞状态查不到完全忽略
      }

      setMoments(finalMoments)
    } catch (err) {
      // 最外层兜底：任何未预期异常都只打日志，不弹 toast
      console.error('[Moments] 加载异常:', err)
      setMoments([]) // 降级为空
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
      <div className="px-4 py-4 space-y-4 pb-24">
        {loading ? (
          <div className="text-center py-8 text-medium-gray">加载中...</div>
        ) : moments.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-16 h-16 mx-auto bg-light-orange/50 rounded-full flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-deep-orange/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <p className="text-medium-gray text-sm">还没有动态</p>
            <p className="text-xs text-medium-gray/70">AI 会自动分享生活碎片，或点击 + 发布一条</p>
          </div>
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
