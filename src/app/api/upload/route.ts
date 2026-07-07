import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES } from '@/lib/config'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'images'
    const userId = formData.get('user_id') as string

    if (!file) {
      return NextResponse.json({ error: '未找到文件' }, { status: 400 })
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小超过10MB限制' }, { status: 400 })
    }

    // 检查文件类型
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type)

    if (!isImage && !isAudio) {
      return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 })
    }

    const bucket = isImage ? 'images' : 'voices'
    const fileExt = file.name.split('.').pop()
    const fileName = `${folder}/${userId || 'anonymous'}/${Date.now()}.${fileExt}`

    // 上传到Supabase Storage
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 获取公开URL
    const { data: { publicUrl } } = supabaseAdmin
      .storage
      .from(bucket)
      .getPublicUrl(fileName)

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: data?.path
    })
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
