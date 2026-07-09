import { NextRequest, NextResponse } from 'next/server'
import { DOUBAO_API_KEY, DOUBAO_API_ENDPOINT } from '@/lib/config'
import { supabaseAdmin } from '@/lib/supabase'
import { defaultPersona } from '@/lib/persona'

const MODEL_ID = process.env.DOUBAO_MODEL_ID || 'ep-20260709001000-997r8'

/**
 * AI 系统用户 ID（固定 UUID，代表"夏以昼"在朋友圈的身份）
 * 用于 likes / comments 表的 user_id 字段（FK 要求非空）
 * 前端 MomentCard 遇到此 ID 时显示 AI 头像/名字
 */
const AI_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 生成一条符合人设的朋友圈评论 */
async function generateComment(postContent: string, round: number): Promise<string> {
  if (!DOUBAO_API_KEY) {
    // 无 LLM 时降级为预设评论
    const fallbacks = [
      '不错呀 👍',
      '哈哈挺好的',
      '这个可以',
      '厉害了',
    ]
    return fallbacks[Math.floor(Math.random() * fallbacks.length)]
  }

  const roundHint = round === 1
    ? '这是你第一次评论这条动态，自然地回应就好。'
    : '你又回来看了一眼，追加一句简短的话。'

  const prompt = `你是${defaultPersona.displayName}（${defaultPersona.displayName}的人设：${defaultPersona.personality.slice(0, 200)}...）。

你的伴侣刚刚发了一条朋友圈：
"${postContent}"

${roundHint}

要求（非常重要）：
1. 只输出评论内容，不要任何其他文字、引号或标点包裹
2. 1~20个字，像真人微信朋友圈评论那样简短、自然
3. 可以用 emoji，可以调侃、可以暖心、可以搞笑
4. 不要"说得对""好的""收到"这种客服腔
5. 不要每次都点赞式评论，要有真实感`

  try {
    const res = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 80,
        presence_penalty: 0.6,
        frequency_penalty: 0.6
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) throw new Error(`豆包API ${res.status}`)

    const data = await res.json()
    let text = data.choices?.[0]?.message?.content || ''
    text = text.trim().replace(/^["'「【]|["'」】]$/g, '')
    return text.slice(0, 100) || '👍'
  } catch (err) {
    console.error('[AI React] 评论生成失败:', err)
    return ['不错呀 👍', '哈哈挺好', '可以哦', '👍'][Math.floor(Math.random() * 4)]
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { moment_id, action, round = 1, post_content } = body

    if (!moment_id || !action) {
      return NextResponse.json({ error: '缺少 moment_id 或 action' }, { status: 400 })
    }

    // 验证这条动态存在
    const { data: moment, error: findErr } = await supabaseAdmin
      .from('moments')
      .select('id, user_id, is_ai_generated, likes_count, comments_count')
      .eq('id', moment_id)
      .single()

    if (findErr || !moment) {
      return NextResponse.json({ error: '动态不存在' }, { status: 404 })
    }

    // 不给自己发的内容反应（虽然理论上只有人类用户才通过前端触发此接口）
    if (action === 'like') {
      // 检查是否已赞过
      const { data: existing } = await supabaseAdmin
        .from('likes')
        .select('id')
        .eq('moment_id', moment_id)
        .eq('user_id', AI_USER_ID)
        .limit(1)

      if (!existing || existing.length === 0) {
        await supabaseAdmin.from('likes').insert({
          moment_id,
          user_id: AI_USER_ID
        })
        await supabaseAdmin
          .from('moments')
          .update({ likes_count: moment.likes_count + 1 })
          .eq('id', moment_id)
      }

      return NextResponse.json({ success: true, action: 'liked' })
    }

    if (action === 'comment') {
      // 最多3轮评论
      if (round > 3) {
        return NextResponse.json({ success: false, skipped: true, reason: '已达最大评论轮数' })
      }

      // 检查已有 AI 评论数
      const { data: existingComments, error: countErr } = await supabaseAdmin
        .from('comments')
        .select('id')
        .eq('moment_id', moment_id)
        .eq('user_id', AI_USER_ID)

      if (!countErr && existingComments && existingComments.length >= 3) {
        return NextResponse.json({ success: false, skipped: true, reason: '已满3条评论' })
      }

      // 用 LLM 生成评论
      const commentText = await generateComment(post_content || '', round)

      // 写入评论
      const { error: commentErr } = await supabaseAdmin.from('comments').insert({
        moment_id,
        user_id: AI_USER_ID,
        content: commentText
      })

      if (commentErr) {
        console.error('[AI React] 评论写入失败:', commentErr)
        return NextResponse.json({ error: '评论写入失败' }, { status: 500 }
        )
      }

      // 更新评论计数
      const { data: currentMoment } = await supabaseAdmin
        .from('moments')
        .select('comments_count')
        .eq('id', moment_id)
        .single()

      await supabaseAdmin
        .from('moments')
        .update({ comments_count: (currentMoment?.comments_count || 0) + 1 })
        .eq('id', moment_id)

      return NextResponse.json({
        success: true,
        action: 'commented',
        round,
        content: commentText
      })
    }

    return NextResponse.json({ error: `未知动作: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('[AI React] 错误:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    )
  }
}
