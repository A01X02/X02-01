import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// 获取朋友圈列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    const { data, error, count } = await supabaseAdmin
      .from('moments')
      .select(`
        *,
        user:profiles(id, username, display_name, avatar_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      total: count,
      page,
      hasMore: offset + limit < (count || 0)
    })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 创建朋友圈动态
export async function POST(request: NextRequest) {
  try {
    const { content, image_urls, is_ai_generated, user_id } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('moments')
      .insert({
        user_id,
        content,
        image_urls: image_urls || [],
        is_ai_generated: is_ai_generated || false
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 点赞/取消点赞
export async function PATCH(request: NextRequest) {
  try {
    const { moment_id, user_id, action } = await request.json()

    if (action === 'like') {
      await supabaseAdmin.from('likes').insert({ moment_id, user_id })
      await supabaseAdmin.rpc('increment_likes', { moment_id })
    } else if (action === 'unlike') {
      await supabaseAdmin.from('likes').delete().eq('moment_id', moment_id).eq('user_id', user_id)
      await supabaseAdmin.rpc('decrement_likes', { moment_id })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
