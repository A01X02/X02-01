import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// 语音合成（TTS）
export async function POST(request: NextRequest) {
  try {
    const { text, voice_id, action } = await request.json()

    if (action === 'tts') {
      // 文本转语音
      // TODO: 对接TTS服务（腾讯云/阿里云/百度）
      // 目前返回模拟响应
      return NextResponse.json({
        success: true,
        audio_url: null,
        message: 'TTS服务待对接，请配置语音服务API'
      })
    }

    if (action === 'clone') {
      // 语音克隆
      const { audio_url, voice_name, user_id } = await request.json()

      // TODO: 对接语音克隆服务
      // 1. 上传录音到语音克隆服务
      // 2. 获取克隆后的voice_id
      // 3. 保存到数据库

      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .insert({
          user_id,
          name: voice_name,
          is_cloned: true,
          clone_audio_url: audio_url,
          is_public: false
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
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 获取语音列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    let query = supabaseAdmin
      .from('voice_profiles')
      .select('*')
      .or('is_public.eq.true')

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
