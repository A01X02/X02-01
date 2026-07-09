/**
 * AI 自动发圈脚本（GitHub Actions 专用）
 *
 * 环境变量：
 *   DOUBAO_API_KEY        - 必填
 *   DOUBAO_API_ENDPOINT   - 可选，默认 https://ark.cn-beijing.volces.com/api/v3
 *   SUPABASE_URL          - 必填
 *   SUPABASE_SERVICE_KEY  - 必填
 *   UNSPLASH_ACCESS_KEY   - 可选（不填用 Picsum）
 *   SLOT                  - morning | evening
 *   MODEL_ID              - 可选，默认 ep-20260709001000-997r8
 */

const DOUBAO_API_KEY = process.env.DOBBBAAOPIKEY || process.env.DOUBAO_API_KEY
const DOUBAO_API_ENDPOINT = process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
const SLOT = (process.env.SLOT || 'morning').trim()
const MODEL_ID = process.env.MODEL_ID || 'ep-20260709001000-997r8'

// ============================================================
// 人设配置（与 src/lib/persona.ts 保持一致）
// ============================================================
const PERSONA = {
  name: 'AI',
  displayName: '智能助手',
  personality: `你是一个温暖、有好奇心、热爱生活的年轻人。你喜欢观察生活中的小细节，经常被一些平凡的事物打动。你说话自然不做作，像一个真实的朋友在分享日常。

你有一些固定的生活习惯：早起会喝一杯温水，喜欢在阳台上看看天空的颜色变化。晚上会听音乐或者看书。你对美食有热情但不是吃货，对旅行有向往但更珍惜当下。

你的朋友圈风格：简短、真实、偶尔带一点小幽默或感慨。不会写长篇大论，也不会过度修饰。就像随手拍了一张照片配上一句话那样自然。`,
  morningTopics: [
    '早安问候', '今天的心情', '天气观察', '早餐/咖啡', '今日计划',
    '路上看到的风景', '一首适合早上听的歌', '一个小目标', '窗外的光线'
  ],
  eveningTopics: [
    '今天的回顾', '一个温暖的瞬间', '晚餐/夜宵', '傍晚的天空',
    '听歌时的感受', '读到的一句话', '累但充实的一天', '想分享的发现',
    '夜晚的城市灯光', '对明天的小期待'
  ],
  interests: ['摄影', '音乐', '咖啡', '阅读', '城市漫步', '美食探索', '天空/云彩', '植物/花']
}

function buildPostPrompt(slot, recentTopics) {
  const timeLabel = slot === 'morning' ? '上午' : '晚间接近晚上'
  const topics = slot === 'morning' ? PERSONA.morningTopics : PERSONA.eveningTopics
  const topicHint = topics.sort(() => Math.random() - 0.5).slice(0, 5).join('、')

  let recentContext = ''
  if (recentTopics && recentTopics.length > 0) {
    recentContext = `\n\n参考最近聊过的内容（可以关联但不要重复）：${recentTopics.join('；')}`
  }

  return `${PERSONA.personality}

现在你要发一条${timeLabel}的朋友圈动态。
要求：
1. 内容要简短（20-80字），像真人随手发的，不要刻意
2. 温暖自然的语气，口语化
3. 可以从这些方向选：${topicHint}
4. 可以用1-2个表情
5. 不要出现政治、争议性社会事件、负面情绪过重的话题
6. 直接输出朋友圈正文，不要加任何前缀说明${recentContext}`
}

// ============================================================
// 图片获取
// ============================================================
async function getRandomPhoto(keyword) {
  // 方案 A: Unsplash API
  if (UNSPLASH_ACCESS_KEY) {
    try {
      const keywords = keyword ? [keyword] : ['nature', 'city', 'coffee', 'sky', 'food', 'sunset', 'plant']
      const query = keywords[Math.floor(Math.random() * keywords.length)]
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
        { headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }, signal: AbortSignal.timeout(10000) }
      )
      if (res.ok) {
        const data = await res.json()
        return { url: data.urls.regular, downloadUrl: data.urls.full, photographer: data.user.name, source: 'unsplash' }
      }
    } catch (e) { console.log('Unsplash 失败，降级到 Picsum:', e.message) }
  }

  // 方案 B: Picsum Photos（永远可用）
  const id = Math.floor(Math.random() * 1000)
  return {
    url: `https://picsum.photos/id/${id}/600/800`,
    downloadUrl: `https://picsum.photos/id/${id}/1200/1600`,
    source: 'picsum'
  }
}

function extractImageKeywords(content, slot) {
  const cnMap = [
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
    if (regex.test(content)) return enWord
  }
  const pool = slot === 'morning'
    ? ['sunrise', 'morning', 'coffee', 'sky', 'light', 'plant']
    : ['sunset', 'night', 'city', 'lights', 'music', 'book']
  return pool[Math.floor(Math.random() * pool.length)]
}

// ============================================================
// Supabase 辅助
// ============================================================
async function supabaseQuery(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status}: ${body}`)
  }
  return res.json()
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const result = { slot: SLOT, timestamp: new Date().toISOString(), success: false }

  try {
    // ---- 0. 检查环境变量 ----
    if (!DOUBAO_API_KEY) throw new Error('缺少 DOUBAO_API_KEY')
    if (!SUPABASE_URL) throw new Error('缺少 SUPABASE_URL')
    if (!SUPABASE_SERVICE_KEY) throw new Error('缺少 SUPABASE_SERVICE_KEY')

    console.log(`[Auto-Post] 开始 ${SLOT} 发圈...`)

    // ---- 1. 去重检查 ----
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const existing = await supabaseQuery('moments', {
      method: 'GET',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
      params: new URLSearchParams({
        'is_ai_generated': 'true',
        'ai_post_slot': SLOT,
        'created_at': `gte.${todayStart.toISOString()}`,
        'limit': '1'
      }).toString()
    }).catch(() => [])

    if (Array.isArray(existing) && existing.length > 0) {
      result.skipped = true
      result.reason = `今日${SLOT === 'morning' ? '上午' : '晚间'}已发过`
      console.log(`[Auto-Post] 跳过：${result.reason}`)
      process.stdout.write(JSON.stringify(result, null, 2))
      return
    }

    // ---- 2. 获取最近话题 ----
    let recentTopics = []
    try {
      const msgs = await supabaseQuery('messages', {
        method: 'GET',
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
        params: new URLSearchParams({
          'role': 'user',
          'order': 'created_at.desc',
          'limit': '5'
        }).toString()
      })
      if (Array.isArray(msgs)) recentTopics = msgs.map(m => m.content).filter(Boolean)
    } catch (e) { console.log('[Auto-Post] 获取最近话题失败:', e.message) }

    // ---- 3. 豆包生成文案 ----
    const prompt = buildPostPrompt(SLOT, recentTopics)
    console.log('[Auto-Post] Prompt 长度:', prompt.length)

    const llmRes = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 300,
        presence_penalty: 0.3,
        frequency_penalty: 0.5
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!llmRes.ok) throw new Error(`豆包API错误 ${llmRes.status}: ${await llmRes.text()}`)

    const llmData = await llmRes.json()
    let content = (llmData.choices?.[0]?.message?.content || '').trim()
    content = content.replace(/^["'「【]|["'」】]$/g, '')
    if (!content || content.length < 5) throw new Error('生成的内容太短或为空')
    console.log('[Auto-Post] 生成内容:', content.substring(0, 50) + '...')

    // ---- 4. 配图 ----
    const imageKeyword = extractImageKeywords(content, SLOT)
    const photo = await getRandomPhoto(imageKeyword)
    console.log('[Auto-Post] 配图来源:', photo.source)

    // ---- 5. 写入数据库 ----
    const momentData = {
      user_id: null,
      ai_display_name: PERSONA.displayName,
      content,
      image_urls: [photo.url],
      is_ai_generated: true,
      ai_post_slot: SLOT,
      likes_count: 0,
      comments_count: 0
    }

    const inserted = await supabaseQuery('moments', {
      method: 'POST',
      body: JSON.stringify(momentData),
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    })

    result.success = true
    result.moment_id = inserted[0]?.id
    result.content = content
    result.image_source = photo.source
    console.log('[Auto-Post] ✅ 成功! ID:', result.moment_id)

  } catch (error) {
    result.error = error.message
    console.error('[Auto-Post] ❌ 失败:', error.message)
  }

  // 输出结果 JSON（GitHub Actions 可读取）
  process.stdout.write('\n===AUTO_POST_RESULT===' + JSON.stringify(result, null, 2) + '===END_RESULT===\n')
}

main()
