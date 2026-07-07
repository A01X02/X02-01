import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// 获取记忆列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const memoryType = searchParams.get('type')
    const search = searchParams.get('search')

    if (!userId) {
      return NextResponse.json({ error: '缺少user_id参数' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (memoryType) {
      query = query.eq('memory_type', memoryType)
    }

    if (search) {
      query = query.or(`content.ilike.%${search}%,tags.cs.{${search}}`)
    }

    query = query.order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 按类型分组统计
    const stats = {
      total: data?.length || 0,
      preference: data?.filter(m => m.memory_type === 'preference').length || 0,
      fact: data?.filter(m => m.memory_type === 'fact').length || 0,
      event: data?.filter(m => m.memory_type === 'event').length || 0,
      summary: data?.filter(m => m.memory_type === 'summary').length || 0,
    }

    return NextResponse.json({ data, stats })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// 手动添加记忆
export async function POST(request: NextRequest) {
  try {
    const { user_id, conversation_id, content, memory_type, importance, tags } = await request.json()

    if (!user_id || !content || !memory_type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('memories')
      .insert({
        user_id,
        conversation_id,
        content,
        memory_type,
        importance: importance || 5,
        tags: tags || []
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

// 更新或删除记忆
export async function PATCH(request: NextRequest) {
  try {
    const { memory_id, action, content, importance, tags } = await request.json()

    if (action === 'delete') {
      const { error } = await supabaseAdmin
        .from('memories')
        .update({ is_active: false })
        .eq('id', memory_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'update') {
      const updates: any = {}
      if (content !== undefined) updates.content = content
      if (importance !== undefined) updates.importance = importance
      if (tags !== undefined) updates.tags = tags

      const { error } = await supabaseAdmin
        .from('memories')
        .update(updates)
        .eq('id', memory_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
