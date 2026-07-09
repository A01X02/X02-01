import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ============================================================
// 语音接口
//   action = 'tts'   文本转语音（火山引擎「声音复刻」）
//   action = 'clone' 记录克隆音色到数据库
// ============================================================

// —— 火山引擎语音合成配置（从环境变量读取，未配置则优雅降级）——
const VOLC_TTS_APPID = process.env.VOLC_TTS_APPID
// API Key（从 火山引擎控制台 → 豆包语音 → API Key管理 获取）
const VOLC_TTS_API_KEY = process.env.VOLC_TTS_ACCESS_TOKEN
// 声音复刻 2.0 用 volcano_icl；1.0 用 volcano_mega
const VOLC_TTS_CLUSTER = process.env.VOLC_TTS_CLUSTER || 'volcano_icl'
// 你复刻出来的音色 ID（形如 S_xxxxxxx），作为 bot 默认嗓音
const VOLC_TTS_VOICE_ID = process.env.VOLC_TTS_VOICE_ID
const VOLC_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts'

/** 调用火山引擎 TTS，返回可直接播放的 data URL；失败返回 null + 原因 */
async function synthesizeWithVolc(
  text: string,
  speakerId: string
): Promise<{ audioUrl: string | null; message: string }> {
  const reqid =
    globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  // 请求体格式严格参照火山官方「声音复刻2.0」示例
  // 鉴权通过 X-Api-Key 请求头传递，不在 body 中重复放 token
  const body = {
    app: {
      ...(VOLC_TTS_APPID ? { appid: VOLC_TTS_APPID } : {}),
      cluster: VOLC_TTS_CLUSTER,
    },
    user: { uid: 'ai-companion' },
    audio: {
      voice_type: speakerId,
      encoding: 'mp3',
      speed_ratio: 1.0,
    },
    request: {
      reqid,
      // 朗读文本限长，避免超长费时；过长仅读前 300 字
      text: text.slice(0, 300),
      operation: 'query',
    },
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // 火山声音复刻 2.0 标准鉴权：X-Api-Key 头（非 Authorization Bearer）
    'X-Api-Key': VOLC_TTS_API_KEY!,
  }

  const resp = await fetch(VOLC_TTS_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const result = await resp.json().catch(() => null)

  // code === 3000 表示成功，data 为 base64 音频
  if (result && result.code === 3000 && result.data) {
    return { audioUrl: `data:audio/mp3;base64,${result.data}`, message: 'ok' }
  }

  return {
    audioUrl: null,
    message: `火山TTS失败：${result?.message || '无响应'}（code=${result?.code || '?'}）`,
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const { action } = payload

    // ============ 文本转语音 ============
    if (action === 'tts') {
      const { text, voice_id } = payload
      const speaker = voice_id || VOLC_TTS_VOICE_ID

      // 未配置密钥 / 音色 → 优雅降级，前端据此静默跳过朗读
      if (!VOLC_TTS_API_KEY || !speaker) {
        return NextResponse.json({
          success: false,
          audio_url: null,
          message:
            '语音未配置：请在环境变量填入 VOLC_TTS_ACCESS_TOKEN（API Key） / VOLC_TTS_VOICE_ID（复刻音色ID）',
        })
      }

      if (!text || !String(text).trim()) {
        return NextResponse.json({ success: false, audio_url: null, message: '文本为空' })
      }

      const { audioUrl, message } = await synthesizeWithVolc(String(text), speaker)
      return NextResponse.json({
        success: !!audioUrl,
        audio_url: audioUrl,
        message,
      })
    }

    // ============ 记录克隆音色 ============
    if (action === 'clone') {
      const { audio_url, voice_name, user_id, voice_id } = payload

      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .insert({
          user_id,
          name: voice_name,
          is_cloned: true,
          clone_audio_url: audio_url,
          voice_id: voice_id || null,
          is_public: false,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, success: true })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    console.error('[voice] 处理异常:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 获取语音列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    let query = supabaseAdmin.from('voice_profiles').select('*').or('is_public.eq.true')

    if (userId) {
      query = query.or(`user_id.eq.${userId}`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
