import { NextRequest, NextResponse } from 'next/server'
import { DOUBAO_API_KEY, DOUBAO_API_ENDPOINT } from '@/lib/config'
import { supabaseAdmin } from '@/lib/supabase'
import { defaultPersona, buildPostPrompt } from '@/lib/persona'

const MODEL_ID = 'ep-20260709001000-997r8'

// ============================================================
// 无版权免费实拍图源（按优先级）
// ============================================================

interface PhotoResult {
  url: string          // 图片展示URL
  downloadUrl: string   // 下载/存储用URL
  photographer?: string // 摄影师（用于署名）
  source: string        // 来源：unsplash / pexels / picsum
}

/**
 * 方案A：Unsplash API（需 UNSPLASH_ACCESS_KEY）
 * 免费50次/小时，所有图片可商用、无需署名（但建议）
 * 申请地址：https://unsplash.com/developers
 */
async function fetchFromUnsplash(keyword: string): Promise<PhotoResult | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return null

  try {
    // 随机选一个搜索词
    const keywords = keyword ? [keyword] : ['nature', 'city', 'coffee', 'sky', 'food', 'sunset', 'plant', 'music', 'book', 'travel']
    const query = keywords[Math.floor(Math.random() * keywords.length)]

    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
      {
        headers: { 'Authorization': `Client-ID ${key}` },
        signal: AbortSignal.timeout(10000)
      }
    )
    if (!res.ok) return null

    const data = await res.json()
    return {
      url: data.urls.regular,
      downloadUrl: data.urls.full,
      photographer: data.user.name,
      source: 'unsplash'
    }
  } catch {
    return null
  }
}

/**
 * 方案B：Picsum Photos（完全免费，无需API Key）
 * 所有照片来自 unsplash.com 用户上传的公开照片库（Lorem Picsum）
 * 许可：CC0 / 公共领域，可自由商用
 * 网址：https://picsum.photos
 */
function fetchFromPicsum(): PhotoResult {
  const seed = Date.now().toString(36) + Math.random().toString(36).slice(2)
  const id = Math.floor(Math.random() * 1000)
  return {
    url: `https://picsum.photos/id/${id}/600/800`,
    downloadUrl: `https://picsum.photos/id/${id}/1200/1600`,
    source: 'picsum'
  }
}

/**
 * 获取一张无版权实拍图（自动降级）
 */
async function getRandomPhoto(contextHint?: string): Promise<PhotoResult> {
  // 优先尝试 Unsplash
  const unsplash = await fetchFromUnsplash(contextHint)
  if (unsplash) return unsplash

  // 降级到 Picsum（永远可用）
  return fetchFromPicsum()
}

// ============================================================
// 主逻辑：生成内容 + 配图 + 入库
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // ---- 参数解析 ----
    const body = await request.json().catch(() => ({}))
    const slot: 'morning' | 'evening' = ['morning', 'evening'].includes(body.slot)
      ? body.slot
      : (new Date().getHours() < 12 ? 'morning' : 'evening')

    const force = body.force === true  // 强制发布（跳过去重）

    // ---- 0. 环境检查 ----
    if (!DOUBAO_API_KEY) {
      return NextResponse.json(
        { error: '豆包 API 未配置（DOUBAO_API_KEY）' },
        { status: 503 }
      )
    }

    // ---- 1. 去重检查（同一天同一 slot 不重复发）----
    if (!force) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: existing } = await supabaseAdmin
        .from('moments')
        .select('id')
        .eq('is_ai_generated', true)
        .eq('ai_post_slot', slot)
        .gte('created_at', todayStart.toISOString())
        .limit(1)

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: false,
          skipped: true,
          reason: `今日 ${slot === 'morning' ? '上午' : '晚间'}已发过一条，跳过重复发布`
        })
      }
    }

    // ---- 2. 获取最近聊天话题作为上下文（可选）----
    let recentTopics: string[] = []
    try {
      const { data: recentMsgs } = await supabaseAdmin
        .from('messages')
        .select('content')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentMsgs) {
        recentTopics = recentMsgs.map(m => m.content).filter(Boolean)
      }
    } catch {
      // 获取失败不影响发圈
    }

    // ---- 3. 调用豆包生成文案 ----
    const postPrompt = buildPostPrompt(defaultPersona, slot, recentTopics)

    const llmRes = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'user', content: postPrompt }],
        temperature: 0.85,
        max_tokens: 300,
        presence_penalty: 0.3,   // 增加多样性
        frequency_penalty: 0.5   // 减少重复
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!llmRes.ok) {
      throw new Error(`豆包API错误 ${llmRes.status}`)
    }

    const llmData = await llmRes.json()
    let content = llmData.choices?.[0]?.message?.content || ''
    content = content.trim().replace(/^["'「【]|["'」】]$/g, '') // 清理可能的引号包裹

    if (!content || content.length < 5) {
      throw new Error('生成的内容太短或为空')
    }

    // ---- 4. 根据内容关键词匹配配图 ----
    // 从生成内容中提取关键词用于图片搜索
    const imageKeywords = extractImageKeywords(content, slot)
    const photo = await getRandomPhoto(imageKeywords)

    // ---- 5. 写入 moments 表 ----
    const momentRecord = {
      user_id: null,  // AI 系统发圈，无真实 user
      ai_display_name: defaultPersona.displayName,
      content,
      image_urls: [photo.url],
      is_ai_generated: true,
      ai_post_slot: slot,
      likes_count: 0,
      comments_count: 0
    }

    const { data: newMoment, error: insertError } = await supabaseAdmin
      .from('moments')
      .insert(momentRecord)
      .select('id, created_at')
      .single()

    if (insertError) {
      console.error('朋友圈入库失败:', insertError)
      // 即使入库失败也返回生成的结果（方便调试）
      return NextResponse.json({
        success: true,
        warning: '生成成功但数据库写入失败',
        content,
        image: photo,
        slot
      })
    }

    // ---- 6. 返回结果 ----
    return NextResponse.json({
      success: true,
      moment_id: newMoment.id,
      content,
      image: photo,
      slot,
      created_at: newMoment.created_at
    })

  } catch (error) {
    console.error('Auto-post 错误:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

// GET 方法：查看最近 AI 发过的动态（调试用）
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('moments')
      .select('id, content, ai_post_slot, image_urls, created_at')
      .eq('is_ai_generated', true)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error

    return NextResponse.json({ success: true, moments: data })
  } catch (error) {
    return NextResponse.json(
      { error: '查询失败', detail: String(error) },
      { status: 500 }
    )
  }
}

// ============================================================
// 辅助：从文案中提取图片关键词
// ============================================================
function extractImageKeywords(content: string, slot: 'morning' | 'evening'): string {
  // 关键词映射表
  const keywordMap: Record<string, string[]> = {
    morning: ['sunrise', 'morning', 'coffee', 'breakfast', 'sky', 'light', 'plant', 'city', 'window'],
    evening: ['sunset', 'night', 'dinner', 'city', 'lights', 'moon', 'relax', 'music', 'book'],
    food: ['food', 'coffee', 'dinner', 'cooking', 'dessert', 'fruit'],
    nature: ['sky', 'cloud', 'flower', 'tree', 'sea', 'mountain', 'rain', 'snow', 'wind'],
    mood: ['warm', 'cozy', 'peaceful', 'quiet', 'happy'],
    urban: ['city', 'street', 'building', 'cafe', 'subway', 'night view']
  }

  // 合并时间段默认关键词 + 全局关键词
  const pool = [...(keywordMap[slot] || []), ...keywordMap.nature]

  // 简单中文关键词检测
  const cnMap: [RegExp, string][] = [
    [/早|晨|醒|阳/, 'sunrise'],
    [/晚|夜|暮|灯/, 'night'],
    [/咖啡|拿铁|美式|茶/, 'coffee'],
    [/吃|餐|饭|食|美食/, 'food'],
    [/天|云|风|雨|雪/, 'nature'],
    [/花|植物|树|草|叶/, 'plant'],
    [/城市|街|路|楼/, 'city'],
    [/书|读|音乐|歌/, 'music'],
    [/旅行|飞机|火车|海/, 'travel']
  ]

  for (const [regex, enWord] of cnMap) {
    if (regex.test(content)) {
      return enWord
    }
  }

  // 默认随机取一个
  return pool[Math.floor(Math.random() * pool.length)]
}
